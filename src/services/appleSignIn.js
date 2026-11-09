const authError = (code, message) => Object.assign(new Error(message), { code });

export const canUseNativeAppleSignIn = (runtime) =>
  runtime.isNativePlatform() && runtime.getPlatform() === 'ios';

export const canUseAppleSignIn = (runtime) =>
  !runtime.isNativePlatform() || canUseNativeAppleSignIn(runtime);

export async function signInApple({ runtime, loadNative, signInPopup, credentialFromTokens, signInCredential, saveDisplayName }) {
  // Invoke from the click without loading the native plugin or losing the popup gesture.
  if (!runtime.isNativePlatform()) return (await signInPopup()).user;
  if (!canUseNativeAppleSignIn(runtime) || !runtime.isPluginAvailable('FirebaseAuthentication')) {
    throw authError('auth/native-apple-unavailable', 'Native Apple sign-in is unavailable.');
  }
  const native = await loadNative();
  // The native SDK generates a cryptographic nonce; Firebase verifies its hash.
  const result = await native.signInWithApple({ skipNativeAuth: true });
  const { idToken, nonce } = result?.credential || {};
  if (!idToken || !nonce) throw authError('auth/missing-apple-credential', 'Apple did not return a complete credential.');
  const { user } = await signInCredential(credentialFromTokens(idToken, nonce));
  const displayName = String(result?.user?.displayName || '').trim();
  // Apple only shares the full name on the first authorization.
  if (displayName && !user.displayName) await saveDisplayName(user, displayName);
  return user;
}

export async function revokeAppleForDeletion({ runtime, user, loadNative, credentialFromTokens, reauthenticate,
  reauthenticatePopup, credentialFromResult, revokeAccessToken, apiKey, fetchImpl = fetch }) {
  if (!user?.providerData?.some(item => item.providerId === 'apple.com')) return false;
  if (!runtime.isNativePlatform()) {
    const result = await reauthenticatePopup(user);
    if (result?.user?.uid !== user.uid) throw authError('auth/user-mismatch', 'The Apple account does not match.');
    const accessToken = credentialFromResult(result)?.accessToken;
    if (!accessToken) throw authError('auth/missing-apple-credential', 'Apple did not return an access token.');
    await revokeAccessToken(accessToken);
    return true;
  }
  if (!canUseNativeAppleSignIn(runtime)) return false;
  if (!runtime.isPluginAvailable('FirebaseAuthentication')) throw authError('auth/native-apple-unavailable', 'Apple authentication is unavailable.');
  const native = await loadNative();
  const result = await native.signInWithApple({ skipNativeAuth: true });
  const { idToken, nonce, authorizationCode } = result?.credential || {};
  if (!idToken || !nonce || !authorizationCode) throw authError('auth/missing-apple-credential', 'Apple did not return a complete credential.');
  // Reauthentication rejects another Apple account instead of changing the active customer.
  await reauthenticate(user, credentialFromTokens(idToken, nonce));
  const firebaseToken = await user.getIdToken(true);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    // Same Identity Platform request used by Firebase's native revokeToken API.
    // Use the existing JS session, not a second persistent native Firebase session.
    const response = await fetchImpl(`https://identitytoolkit.googleapis.com/v2/accounts:revokeToken?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId: 'apple.com', tokenType: 'CODE', token: authorizationCode, idToken: firebaseToken }),
      signal: controller.signal,
    });
    if (!response.ok) throw authError('auth/apple-revocation-failed', 'Apple access could not be revoked. Please retry.');
    return true;
  } finally {
    clearTimeout(timeout);
  }
}

export function getAppleAuthErrorMessage(error = {}) {
  const text = `${error.code || ''} ${error.message || ''}`;
  if (error.code === 'auth/popup-blocked') return 'Permite las ventanas emergentes para esta pagina y vuelve a tocar Continuar con Apple.';
  if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') return 'Se cancelo el ingreso con Apple. Puedes intentarlo nuevamente.';
  if (['auth/unauthorized-domain', 'auth/operation-not-allowed', 'auth/invalid-oauth-client-id'].includes(error.code)) {
    return 'El acceso con Apple necesita una revision de configuracion. Puedes ingresar con correo y contrasena o contactar a la tienda.';
  }
  if (/cancel|1001/i.test(text)) return 'Se cancelo el ingreso con Apple. Puedes intentarlo nuevamente.';
  if (/network|conexion/i.test(text)) return 'No pudimos conectar con Apple. Revisa tu conexion e intenta nuevamente.';
  if (error.code === 'auth/account-exists-with-different-credential') {
    return 'Este correo ya tiene otra forma de ingreso. Usa tu acceso anterior para conservar tu cuenta.';
  }
  if (error.code === 'auth/native-apple-unavailable') return 'Actualiza la app para ingresar con Apple. Tambien puedes usar tu correo y contrasena.';
  return 'No pudimos completar el ingreso con Apple. Intenta de nuevo o usa tu correo y contrasena.';
}
