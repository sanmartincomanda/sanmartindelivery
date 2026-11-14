import { createPrivateKey, sign } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const APP_ID = '6832058425';
const GROUP_NAME = 'San Martin - Revision interna';

export async function enableTestFlightBuild({ buildNumber, request, wait, attempts = 30, log = console.log }) {
  if (!/^[1-9][0-9]{0,8}$/.test(buildNumber)) throw new Error('Invalid build number');
  let build;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const result = await request(`/v1/builds?filter[app]=${APP_ID}&filter[version]=${buildNumber}&include=preReleaseVersion&limit=20`);
    const candidates = result.data.filter(item => result.included?.some(version =>
      version.type === 'preReleaseVersions' && version.id === item.relationships?.preReleaseVersion?.data?.id &&
      version.attributes.version === '1.0.0' && version.attributes.platform === 'IOS'));
    if (candidates.length > 1) throw new Error('Ambiguous build selection');
    build = candidates[0];
    const state = build?.attributes.processingState || 'NOT_LISTED';
    log(`Build 1.0.0 (${buildNumber}): ${state}`);
    if (['FAILED', 'INVALID'].includes(state)) throw new Error('Apple rejected build processing');
    if (state === 'VALID') break;
    build = null;
    if (attempt + 1 < attempts) await wait(30000);
  }
  if (!build) throw new Error('Apple processing is not complete; no group changes made');
  if (build.attributes.expired) throw new Error('Cannot distribute an expired build');
  log(JSON.stringify({ appId: APP_ID, version: '1.0.0', buildNumber, buildId: build.id, processingState: 'VALID' }));

  const groups = await request(`/v1/apps/${APP_ID}/betaGroups?limit=200`);
  const matches = groups.data.filter(group => group.attributes.name === GROUP_NAME);
  if (matches.length !== 1) throw new Error('Expected the existing private internal group');
  const group = matches[0];
  if (!group.attributes.isInternalGroup || group.attributes.publicLinkEnabled) {
    throw new Error('Refusing to change a public or external group');
  }
  const groupPath = `/v1/builds/${build.id}/relationships/betaGroups`;
  const existing = await request(groupPath);
  if (!existing.data.some(item => item.id === group.id)) {
    await request(`/v1/betaGroups/${group.id}/relationships/builds`, {
      method: 'POST', body: { data: [{ type: 'builds', id: build.id }] },
    });
  }
  const verified = await request(groupPath);
  if (!verified.data.some(item => item.id === group.id)) throw new Error('TestFlight group assignment not confirmed');
  const detail = await request(`/v1/builds/${build.id}/buildBetaDetail`);
  const output = { appId: APP_ID, version: '1.0.0', buildNumber, buildId: build.id,
    group: GROUP_NAME, processingState: build.attributes.processingState,
    internalBuildState: detail.data.attributes.internalBuildState };
  log(JSON.stringify(output));
  return output;
}

export function createAppStoreRequest(env = process.env) {
  const keyId = env.APP_STORE_CONNECT_KEY_ID;
  const issuer = env.APP_STORE_CONNECT_ISSUER_ID;
  const encodedKey = env.APP_STORE_CONNECT_PRIVATE_KEY_BASE64;
  if (!keyId || !issuer || !encodedKey) throw new Error('Missing existing App Store Connect credentials');
  const key = createPrivateKey(Buffer.from(encodedKey, 'base64'));
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return async (path, { method = 'GET', body } = {}) => {
    if (!path.startsWith('/v1/') || path.includes('://')) throw new Error('Invalid Apple API path');
    const now = Math.floor(Date.now() / 1000);
    const payload = `${encode({ alg: 'ES256', kid: keyId, typ: 'JWT' })}.${encode({ iss: issuer, iat: now, exp: now + 120, aud: 'appstoreconnect-v1' })}`;
    const signature = sign('sha256', Buffer.from(payload), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
    const response = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
      method, redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { Authorization: `Bearer ${payload}.${signature}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`Apple API ${method} ${path.split('?')[0]}: ${response.status} ${(error.errors || []).map(item => item.code).join(', ')}`);
    }
    return response.status === 204 ? null : response.json();
  };
}

async function main() {
  const request = createAppStoreRequest();
  await enableTestFlightBuild({ buildNumber: process.env.BUILD_NUMBER, request,
    wait: milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)) });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
