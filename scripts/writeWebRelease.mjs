import { readFile, readdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { verifyWebRelease } from './lib/webRelease.mjs';

const root = new URL('../', import.meta.url);
const assets = new URL('dist/assets/', root);
const filenames = (await readdir(assets)).filter(name => name.endsWith('.js'));
const javascript = (await Promise.all(filenames.map(name => readFile(new URL(name, assets), 'utf8')))).join('\n');
const html = await readFile(new URL('dist/index.html', root), 'utf8');
const verified = verifyWebRelease(html, javascript);
const sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const release = { sourceRevision, builtAt: new Date().toISOString(), ...verified };
await writeFile(new URL('dist/release.json', root), `${JSON.stringify(release, null, 2)}\n`);
console.log(`Web release verified: ${sourceRevision.slice(0, 12)}; ${verified.features.join(', ')}`);
