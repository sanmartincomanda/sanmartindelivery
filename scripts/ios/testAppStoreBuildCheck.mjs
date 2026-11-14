import assert from 'node:assert/strict';
import { checkAppStoreBuild } from './checkAppStoreBuild.mjs';

function fixture() {
  const release = { id: 'release', type: 'preReleaseVersions', attributes: { version: '1.0.2', platform: 'IOS' } };
  const build = { id: 'build-9', attributes: { version: '9', processingState: 'VALID', expired: false }, relationships: { preReleaseVersion: { data: { id: release.id } } } };
  const response = { data: [build], included: [release] };
  const calls = [];
  const deps = { version: '1.0.2', buildNumber: '9', mode: 'processed', attempts: 2,
    wait: async () => {}, log: () => {}, request: async (...args) => {
      calls.push(args);
      assert.equal(args.length, 1, 'Only read-only GET requests');
      assert.equal(args[0], '/v1/builds?filter[app]=6832058425&filter[version]=9&include=preReleaseVersion&limit=200');
      return response;
    } };
  return { release, build, response, calls, deps };
}
{
  const f = fixture();
  assert.equal((await checkAppStoreBuild(f.deps)).buildId, 'build-9');
  f.deps.mode = 'available';
  await assert.rejects(checkAppStoreBuild(f.deps), /already exists/);
  f.response.data = [];
  assert.equal((await checkAppStoreBuild(f.deps)).state, 'AVAILABLE');
}
for (const mutate of [
  f => { f.deps.buildNumber = '../9'; },
  f => { f.deps.version = '../1.0.2'; },
  f => { f.deps.mode = 'submit'; },
  f => { f.build.attributes.processingState = 'INVALID'; },
  f => { f.build.attributes.processingState = 'FAILED'; },
  f => { f.build.attributes.expired = true; },
  f => { f.build.attributes.version = '8'; },
  f => { f.release.attributes.platform = 'MAC_OS'; },
  f => { f.release.attributes.version = '1.0.1'; },
  f => { f.response.data.push(f.build); },
  f => { f.response.included = []; },
  f => { f.response.links = { next: 'another-page' }; },
  f => { f.deps.request = async () => { throw Error('Apple API 403'); }; },
]) {
  const f = fixture(); mutate(f);
  await assert.rejects(checkAppStoreBuild(f.deps));
}
{
  const f = fixture();
  f.build.attributes.processingState = 'PROCESSING';
  f.deps.wait = async () => { f.build.attributes.processingState = 'VALID'; };
  assert.equal((await checkAppStoreBuild(f.deps)).state, 'VALID');
  assert.equal(f.calls.length, 2);
}
{
  const f = fixture(); f.response.data = [];
  await assert.rejects(checkAppStoreBuild(f.deps), /processing is not confirmed/);
  assert.equal(f.calls.length, 2);
}
console.log('App Store build checks: exact app/version/build, unused number, read-only requests, pending/rejected/expired/ambiguous states and API failure passed.');
