import { readFileSync, writeFileSync } from 'node:fs';

const team = process.env.APPLE_TEAM_ID || '';
const profile = process.env.APPLE_PROFILE_UUID || '';
if (!/^[A-Z0-9]{10}$/.test(team) || !/^[a-fA-F0-9-]{36}$/.test(profile)) {
  throw new Error('Missing or invalid Apple signing identifiers.');
}
const project = new URL('../ios/App/App.xcodeproj/project.pbxproj', import.meta.url);
const source = readFileSync(project, 'utf8');
const releaseTarget = /(504EC3181FED79650016851F \/\* Release \*\/ = \{[\s\S]*?buildSettings = \{)([\s\S]*?)(\n\t\t\t\};)/;
if (!releaseTarget.test(source)) throw new Error('iOS app release configuration not found.');
const signed = source.replace(releaseTarget, (_, start, settings, end) => {
  settings = settings.replace(/CODE_SIGN_STYLE = Automatic;/, 'CODE_SIGN_STYLE = Manual;');
  return `${start}${settings}\n\t\t\t\tDEVELOPMENT_TEAM = ${team};\n\t\t\t\tCODE_SIGN_IDENTITY = "Apple Distribution";\n\t\t\t\tPROVISIONING_PROFILE_SPECIFIER = "${profile}";${end}`;
});
writeFileSync(project, signed);
console.log('Manual signing configured for the app release target only.');
