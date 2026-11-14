import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createAppStoreRequest } from './enableTestFlightBuild.mjs';

const APP_ID = '6832058425';

// Read-only checks: do not change review submissions, testers or store metadata.
export async function checkAppStoreBuild({ version, buildNumber, mode, request, wait, attempts = 30, log = console.log }) {
  if (!/^\d+\.\d+\.\d+$/.test(version) || !/^[1-9][0-9]{0,8}$/.test(buildNumber)) throw new Error('Invalid version or build number');
  if (!['available', 'processed'].includes(mode)) throw new Error('Invalid build check mode');
  for (let attempt = 0; attempt < (mode === 'available' ? 1 : attempts); attempt++) {
    const response = await request(`/v1/builds?filter[app]=${APP_ID}&filter[version]=${buildNumber}&include=preReleaseVersion&limit=200`);
    if (response.links?.next) throw new Error('Unexpected paginated build list; check the build manually');
    if (!Array.isArray(response.data)) throw new Error('Missing Apple build list');
    const builds = response.data.filter(build => {
      const release = response.included?.find(item => item.type === 'preReleaseVersions' && item.id === build.relationships?.preReleaseVersion?.data?.id);
      if (!release) throw new Error('Missing Apple release version');
      return release.attributes.version === version && release.attributes.platform === 'IOS';
    });
    if (builds.length > 1) throw new Error('Ambiguous Apple build');
    if (mode === 'available') {
      if (builds.length) throw new Error(`Build ${version} (${buildNumber}) already exists; choose a new number`);
      log(`Available: ${version} (${buildNumber}) is not used in App Store Connect`);
      return { version, buildNumber, state: 'AVAILABLE' };
    }
    const build = builds[0];
    if (build && String(build.attributes.version) !== buildNumber) throw new Error('Apple returned a different build');
    const state = build?.attributes.processingState || 'NOT_LISTED';
    log(`Build ${version} (${buildNumber}): ${state}`);
    if (build?.attributes.expired || ['FAILED', 'INVALID'].includes(state)) throw new Error('Apple build is invalid or expired');
    if (state === 'VALID') {
      const result = { appId: APP_ID, version, buildNumber, buildId: build.id, state };
      log(JSON.stringify(result));
      return result;
    }
    if (attempt + 1 < attempts) await wait(30000);
  }
  throw new Error('Build uploaded but Apple processing is not confirmed; do not upload a duplicate');
}

async function main() {
  const project = readFileSync(new URL('../../ios/App/App.xcodeproj/project.pbxproj', import.meta.url), 'utf8');
  const versions = new Set([...project.matchAll(/MARKETING_VERSION = ([\d.]+);/g)].map(match => match[1]));
  if (versions.size !== 1) throw new Error('Ambiguous iOS marketing version');
  await checkAppStoreBuild({ version: [...versions][0], buildNumber: process.env.BUILD_NUMBER,
    mode: process.argv[2], request: createAppStoreRequest(),
    wait: ms => new Promise(resolve => setTimeout(resolve, ms)) });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
