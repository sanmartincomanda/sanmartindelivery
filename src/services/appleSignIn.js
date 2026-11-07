const authError = (code, message) => Object.assign(new Error(message), { code });

export const canUseNativeAppleSignIn = (runtime) =>
  runtime.isNativePlatform() && runtime.getPlatform() === 'ios';

export async function signInApple({ runtime, loadNative, credentialFromTokens, signInCredential, saveDisplayName }) {
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

export function getAppleAuthErrorMessage(error = {}) {
  const text = `${error.code || ''} ${error.message || ''}`;
  if (/cancel|1001/i.test(text)) return 'Se cancelo el ingreso con Apple. Puedes intentarlo nuevamente.';
  if (/network|conexion/i.test(text)) return 'No pudimos conectar con Apple. Revisa tu conexion e intenta nuevamente.';
  if (error.code === 'auth/account-exists-with-different-credential') {
    return 'Este correo ya tiene otra forma de ingreso. Usa tu acceso anterior para conservar tu cuenta.';
  }
  if (error.code === 'auth/native-apple-unavailable') return 'Actualiza la app para ingresar con Apple. Tambien puedes usar tu correo y contrasena.';
  return 'No pudimos completar el ingreso con Apple. Intenta de nuevo o usa tu correo y contrasena.';
}
