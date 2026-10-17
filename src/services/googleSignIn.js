const authError = (code, message) => Object.assign(new Error(message), { code });

const needsAndroidAccountPicker = (error = {}) => {
  const text = `${error.code || ''} ${error.message || ''}`;
  if (/cancel|12501|developer_error|DEVELOPER_ERROR|configuration/i.test(text)) return false;
  return /NoCredentialException|TYPE_NO_CREDENTIAL|no credentials available|credential manager.*not supported/i.test(text);
};

// Keep Google OAuth out of embedded WebViews. Only the browser uses a popup.
export async function signInGoogle({ runtime, loadNative, signInPopup, credentialFromTokens, signInCredential }) {
  if (!runtime.isNativePlatform()) return (await signInPopup()).user;
  if (!runtime.isPluginAvailable('FirebaseAuthentication')) {
    throw authError('auth/native-google-unavailable', 'Native Google sign-in is missing.');
  }
  const native = await loadNative();
  const android = runtime.getPlatform() === 'android';
  let result;
  try {
    result = await native.signInWithGoogle({ skipNativeAuth: true, ...(android ? { useCredentialManager: true } : {}) });
  } catch (error) {
    if (!android || !needsAndroidAccountPicker(error)) throw error;
    // Older Google Play Services may not supply a Credential Manager account.
    result = await native.signInWithGoogle({ skipNativeAuth: true, useCredentialManager: false });
  }
  const idToken = result?.credential?.idToken;
  if (!idToken) throw authError('auth/missing-google-id-token', 'Google did not return an ID token.');
  const credential = credentialFromTokens(idToken, result.credential.accessToken || null);
  return (await signInCredential(credential)).user;
}

export function getGoogleAuthErrorMessage(error = {}) {
  const code = String(error.code || '');
  const message = String(error.message || '');
  if (code === 'auth/popup-blocked') return 'Permite las ventanas emergentes para esta pagina y vuelve a tocar Continuar con Google.';
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request' || /cancel|12501/i.test(message)) {
    return 'Se cancelo el ingreso con Google. Puedes intentarlo nuevamente.';
  }
  if (code === 'auth/native-google-unavailable' || code === 'UNIMPLEMENTED') {
    return 'Actualiza la app desde Play Store para ingresar con Google. Mientras tanto puedes ingresar con correo y contrasena.';
  }
  if (code === 'auth/network-request-failed' || /network|network_error/i.test(message)) {
    return 'No pudimos conectar con Google. Revisa tu conexion e intenta nuevamente.';
  }
  if (code === 'auth/account-exists-with-different-credential') {
    return 'Este correo ya tiene otra forma de ingreso. Entra con tu correo y contrasena para conservar tu cuenta.';
  }
  if (code === 'auth/unauthorized-domain' || code === 'auth/operation-not-allowed' || /DEVELOPER_ERROR|configuration|ApiException: 10/i.test(message)) {
    return 'El acceso con Google necesita una revision de configuracion. Puedes ingresar con correo y contrasena o contactar a la tienda.';
  }
  return 'No pudimos completar el ingreso con Google. Intenta de nuevo o ingresa con correo y contrasena.';
}
