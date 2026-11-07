import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { deleteApp } from 'firebase/app';
import { get, ref, update, goOffline } from 'firebase/database';
import { getDownloadURL, getMetadata, ref as storageRef, uploadBytes } from 'firebase/storage';
import { ensureAuthenticatedFirebaseSession, getAuthenticatedFirebaseDatabase, getAuthenticatedFirebaseStorage } from './firebaseScriptAuth.mjs';
import { BOX_IMAGE_MAX_EDGE, BOX_IMAGE_TARGET_BYTES, BOX_IMAGE_QUALITIES } from '../src/services/storeBoxImage.js';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const validCode = code => /^BOX_[a-zA-Z0-9_-]+$/.test(code);
const cacheControl = 'public, max-age=31536000, immutable';
const json = (path, value) => writeFile(path, JSON.stringify(value, null, 2) + '\n');

export function replacementRecord(current, entry, image, imageStoragePath) {
  if (!current?.boxSale || !validCode(entry.code) || current.code !== entry.code ||
      current.image !== entry.originalImage || (current.imageStoragePath || '') !== entry.originalPath) return null;
  return { ...current, image, imageStoragePath };
}

export async function compressBoxPhoto(bytes) {
  const input = sharp(bytes, { limitInputPixels: 32000000 });
  const metadata = await input.metadata();
  if (!['jpeg', 'png', 'webp'].includes(metadata.format) || metadata.pages > 1) throw new Error('Only still JPG/PNG/WebP box photos are supported.');
  let best;
  for (const quality of BOX_IMAGE_QUALITIES) {
    const candidate = await sharp(bytes, { limitInputPixels: 32000000 }).rotate()
      .resize({ width: BOX_IMAGE_MAX_EDGE, height: BOX_IMAGE_MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: Math.round(quality * 100), effort: 6 }).toBuffer();
    if (!best || candidate.length < best.length) best = candidate;
    if (best.length <= BOX_IMAGE_TARGET_BYTES) break;
  }
  return { original: metadata, bytes: best, metadata: await sharp(best).metadata() };
}

async function prepare(database) {
  const directory = resolve('tmp', `box-image-optimization-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  await mkdir(directory, { recursive: true });
  const catalog = (await get(ref(database, 'storeCatalog'))).val() || {};
  const boxes = Object.entries(catalog).filter(([code, p]) => validCode(code) && p.code === code && p.boxSale && p.image);
  await json(join(directory, 'original-records.json'), Object.fromEntries(boxes));
  const manifest = { kind: 'box-image-optimization-v1', preparedAt: new Date().toISOString(), entries: [] };
  for (const [code, product] of boxes) {
    const url = new URL(product.image);
    if (url.protocol !== 'https:' || !['firebasestorage.googleapis.com', 'storage.googleapis.com'].includes(url.hostname)) throw new Error(`Unsupported image host for ${code}; no remote writes made.`);
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Image download HTTP ${response.status} for ${code}`);
    const original = Buffer.from(await response.arrayBuffer());
    const optimized = await compressBoxPhoto(original);
    await writeFile(join(directory, `${code}-original.${optimized.original.format}`), original);
    const output = `${code}.webp`;
    await writeFile(join(directory, output), optimized.bytes);
    const entry = { code, name: product.name, originalImage: product.image, originalPath: product.imageStoragePath || '',
      originalBytes: original.length, originalWidth: optimized.original.width, originalHeight: optimized.original.height,
      output, optimizedBytes: optimized.bytes.length, width: optimized.metadata.width, height: optimized.metadata.height,
      sha256: sha256(optimized.bytes), replace: optimized.bytes.length < original.length };
    manifest.entries.push(entry);
    await json(join(directory, 'manifest.json'), manifest);
    console.log(JSON.stringify({ name: entry.name, beforeKB: Math.round(entry.originalBytes / 1000), afterKB: Math.round(entry.optimizedBytes / 1000), dimensions: `${entry.width}x${entry.height}`, replace: entry.replace }));
  }
  console.log(`Prepared only; no production writes. Review originals/WebP before applying: ${join(directory, 'manifest.json')}`);
}

async function apply(database, storage, user, manifestPath) {
  const directory = dirname(resolve(manifestPath));
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(manifest.kind, 'box-image-optimization-v1');
  const results = [];
  let changed = 0;
  try {
    for (const entry of manifest.entries) {
      assert.ok(validCode(entry.code));
      assert.equal(entry.output, `${entry.code}.webp`);
      if (!entry.replace) continue;
      const bytes = await readFile(join(directory, entry.output));
      assert.equal(sha256(bytes), entry.sha256, 'Prepared file changed after inspection');
      assert.ok(bytes.length < entry.originalBytes);
      const path = `store/catalog/${entry.code}/optimized-${entry.sha256.slice(0, 24)}.webp`;
      const imageRef = storageRef(storage, path);
      // Immutable new URLs: retain original objects and avoid overwriting existing derivatives.
      try { await getMetadata(imageRef); } catch (error) {
        if (error.code !== 'storage/object-not-found') throw error;
        await uploadBytes(imageRef, bytes, { contentType: 'image/webp', cacheControl });
      }
      const image = await getDownloadURL(imageRef);
      const published = await fetch(image, { signal: AbortSignal.timeout(30000) });
      assert.equal(published.status, 200);
      assert.equal(sha256(Buffer.from(await published.arrayBuffer())), entry.sha256);

      const recordUrl = new URL(`${database.app.options.databaseURL.replace(/\/$/, '')}/storeCatalog/${entry.code}.json`);
      recordUrl.searchParams.set('auth', await user.getIdToken());
      const before = await fetch(recordUrl, { headers: { 'X-Firebase-ETag': 'true' }, signal: AbortSignal.timeout(30000) });
      assert.equal(before.status, 200);
      const current = await before.json();
      if (current?.image === image && current?.imageStoragePath === path) { results.push({ code: entry.code, status: 'already-applied' }); continue; }
      const next = replacementRecord(current, entry, image, path);
      if (!next) { results.push({ code: entry.code, status: 'skipped-concurrent-photo-change' }); continue; }
      const etag = before.headers.get('etag');
      assert.ok(etag, 'Conditional write requires ETag');
      await json(join(directory, `${entry.code}-before-apply.json`), current);
      // Compare-and-swap keeps concurrent price, stock, status and photo edits safe.
      const write = await fetch(recordUrl, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': etag }, body: JSON.stringify(next), signal: AbortSignal.timeout(30000) });
      if (write.status === 412) { results.push({ code: entry.code, status: 'skipped-concurrent-catalog-change' }); continue; }
      assert.equal(write.status, 200, `Catalog update failed for ${entry.code}`);
      assert.deepEqual(await write.json(), next);
      changed++;
      results.push({ code: entry.code, name: entry.name, status: 'applied', beforeBytes: entry.originalBytes, afterBytes: bytes.length, image, path });
      await json(join(directory, 'applied.json'), results);
      console.log(JSON.stringify({ name: entry.name, status: 'applied', beforeKB: Math.round(entry.originalBytes / 1000), afterKB: Math.round(bytes.length / 1000) }));
    }
  } finally {
    await json(join(directory, 'applied.json'), results);
    if (changed) await update(ref(database, 'storeCatalogMeta'), { updatedAt: Date.now(), updatedAtIso: new Date().toISOString() });
  }
  console.log(JSON.stringify({ changed, results: results.map(({code, status}) => ({code, status})) }));
}

async function main() {
  const mode = process.argv[2] || 'prepare';
  assert.ok(mode === 'prepare' || (mode === 'apply' && process.argv[3]), 'Use prepare, or apply <reviewed-manifest.json>');
  const user = await ensureAuthenticatedFirebaseSession();
  const database = getAuthenticatedFirebaseDatabase();
  try {
    if (mode === 'prepare') await prepare(database);
    else await apply(database, getAuthenticatedFirebaseStorage(), user, resolve(process.argv[3]));
  } finally { goOffline(database); await deleteApp(database.app); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0), error => { console.error(error.message); process.exit(1); });
}
