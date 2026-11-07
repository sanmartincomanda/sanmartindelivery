import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// Authentication 8.0.0 omits the Google provider from its SPM target.
// Keep this iOS-only and fail closed if a dependency update changes the manifest.
export function enableIosGoogleProvider(source) {
  if (source.includes('RGCFA_INCLUDE_GOOGLE') && source.includes('GoogleSignIn-iOS')) return source;
  const changes = [
    ['.package(url: "https://github.com/firebase/firebase-ios-sdk.git", .upToNextMajor(from: "12.7.0"))',
      '.package(url: "https://github.com/firebase/firebase-ios-sdk.git", .upToNextMajor(from: "12.7.0")),\n        .package(url: "https://github.com/google/GoogleSignIn-iOS.git", exact: "9.0.0")'],
    ['.product(name: "FirebaseCore", package: "firebase-ios-sdk")',
      '.product(name: "FirebaseCore", package: "firebase-ios-sdk"),\n                .product(name: "GoogleSignIn", package: "GoogleSignIn-iOS")'],
    ['path: "ios/Plugin"),', 'path: "ios/Plugin",\n            swiftSettings: [.define("RGCFA_INCLUDE_GOOGLE")]),'],
  ];
  for (const [before, after] of changes) {
    if (!source.includes(before)) throw new Error('Authentication SPM manifest changed; review iOS Google configuration.');
    source = source.replace(before, after);
  }
  return source;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = new URL('../node_modules/@capacitor-firebase/authentication/Package.swift', import.meta.url);
  const source = readFileSync(manifest, 'utf8');
  const patched = enableIosGoogleProvider(source);
  if (patched !== source) writeFileSync(manifest, patched);
  const appPackage = new URL('../ios/App/CapApp-SPM/Package.swift', import.meta.url);
  const generated = readFileSync(appPackage, 'utf8');
  writeFileSync(appPackage, generated.replace(/\\/g, '/'));
  console.log('iOS: Google SPM provider and portable package paths ready.');
}
