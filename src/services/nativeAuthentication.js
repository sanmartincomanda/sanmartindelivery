export async function loadNativeAuthentication(importPlugin = () => import('@capacitor-firebase/authentication')) {
  const { FirebaseAuthentication } = await importPlugin();
  // Capacitor's Proxy synthesizes a `then` method. Returning it from an async
  // loader makes Promise resolution call that nonexistent native method and hang.
  // Return a plain facade, never the raw plugin Proxy (including for revocation).
  return {
    signInWithGoogle: options => FirebaseAuthentication.signInWithGoogle(options),
    signInWithApple: options => FirebaseAuthentication.signInWithApple(options),
  };
}
