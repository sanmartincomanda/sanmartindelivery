export function initializeRuntimeAuth(app, runtime, sdk) {
  // Native providers already handle OAuth. The browser resolver can wait on
  // an auth-domain iframe that cannot complete inside a Capacitor WebView.
  if (runtime.isNativePlatform()) {
    return sdk.initializeAuth(app, {
      persistence: [sdk.indexedDBLocalPersistence, sdk.browserLocalPersistence],
    });
  }
  return sdk.getAuth(app);
}
