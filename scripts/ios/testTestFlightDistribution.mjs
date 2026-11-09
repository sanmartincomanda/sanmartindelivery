import assert from 'node:assert/strict';
import { enableTestFlightBuild } from './enableTestFlightBuild.mjs';

function fixture() {
  const build = { id: 'build-5', type: 'builds', attributes: { processingState: 'VALID', expired: false },
    relationships: { preReleaseVersion: { data: { id: 'version-1' } } } };
  const version = { id: 'version-1', type: 'preReleaseVersions', attributes: { version: '1.0.0', platform: 'IOS' } };
  const group = { id: 'private-group', attributes: { name: 'San Martin - Revision interna', isInternalGroup: true, publicLinkEnabled: false } };
  const calls = [];
  let assigned = false;
  const deps = { buildNumber: '5', attempts: 1, wait: async () => {}, log: () => {}, request: async (path, options) => {
    calls.push({ path, options });
    if (path.startsWith('/v1/builds?')) return { data: [build], included: [version] };
    if (path === '/v1/apps/6832058425/betaGroups?limit=200') return { data: [group] };
    if (path === '/v1/builds/build-5/relationships/betaGroups') return { data: assigned ? [{ id: group.id }] : [] };
    if (path === '/v1/betaGroups/private-group/relationships/builds') { assigned = true; return null; }
    if (path === '/v1/builds/build-5/buildBetaDetail') return { data: { attributes: { internalBuildState: 'IN_BETA_TESTING' } } };
    throw new Error('Unexpected API path');
  } };
  return { deps, build, version, group, calls };
}
{
  const f = fixture();
  const result = await enableTestFlightBuild(f.deps);
  assert.equal(result.internalBuildState, 'IN_BETA_TESTING');
  assert.deepEqual(f.calls.find(call => call.options?.method === 'POST').options.body, { data: [{ type: 'builds', id: 'build-5' }] });
  await enableTestFlightBuild(f.deps);
  assert.equal(f.calls.filter(call => call.options?.method === 'POST').length, 1, 'Assignment is idempotent');
}
for (const modify of [
  f => { f.deps.buildNumber = '../5'; },
  f => { f.build.attributes.processingState = 'FAILED'; },
  f => { f.build.attributes.processingState = 'PROCESSING'; },
  f => { f.build.attributes.expired = true; },
  f => { f.version.attributes.version = '2.0.0'; },
  f => { f.version.attributes.platform = 'MAC_OS'; },
  f => { f.group.attributes.name = 'Different group'; },
  f => { f.group.attributes.isInternalGroup = false; },
  f => { f.group.attributes.publicLinkEnabled = true; },
]) {
  const f = fixture(); modify(f);
  await assert.rejects(enableTestFlightBuild(f.deps));
  assert.equal(f.calls.some(call => call.options?.method === 'POST'), false);
}
console.log('TestFlight: exact version, existing private group, idempotence and unsafe-state rejection passed.');
{
  const f = fixture();
  const request = f.deps.request;
  f.deps.request = (path, options) => {
    if (path.includes('/apps/')) throw new Error('Apple API 403 FORBIDDEN_ERROR');
    return request(path, options);
  };
  await assert.rejects(enableTestFlightBuild(f.deps), /403/);
  assert.equal(f.calls.some(call => call.options?.method === 'POST'), false, 'Do not create alternative groups or widen permissions');
}
