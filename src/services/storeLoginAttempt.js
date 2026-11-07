const loginError = code => Object.assign(new Error(code), { code });

export function withAuthDeadline(promise, timeoutMs = 15000, onTimeout = () => {}) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      onTimeout();
      reject(loginError('auth/request-timeout'));
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function createStoreLoginRunner() {
  let active = null;
  return (operation, { timeoutMs = 45000 } = {}) => {
    if (active) return Promise.reject(loginError('auth/operation-pending'));
    const attempt = { expired: false };
    active = attempt;
    const checkActive = () => {
      if (attempt.expired) throw loginError('auth/request-timeout');
    };
    let work;
    try {
      // Invoke synchronously so web Google popup keeps the user's click gesture.
      work = Promise.resolve(operation(checkActive));
    } catch (error) {
      work = Promise.reject(error);
    }
    const settled = work.then(result => { checkActive(); return result; }).finally(() => {
      if (active === attempt) active = null;
    });
    // A timed-out native dialog may still finish. Do not start a competing
    // sign-in or let its late result overwrite a different account/profile.
    return withAuthDeadline(settled, timeoutMs, () => { attempt.expired = true; });
  };
}

export function getStoreLoginErrorMessage(error = {}) {
  if (error.code === 'auth/request-timeout') return 'El ingreso tardo demasiado. Revisa tu conexion e intenta de nuevo. Si la ventana de acceso sigue abierta, cierrala primero.';
  if (error.code === 'auth/operation-pending') return 'El ingreso anterior sigue abierto. Cierralo antes de volver a intentar; si no responde, cierra y vuelve a abrir la app.';
  if (error.code === 'auth/network-request-failed' || error.code === 'NETWORK_ERROR') return 'No pudimos conectar. Revisa tu conexion e intenta de nuevo.';
  if (error.code === 'auth/too-many-requests') return 'Hubo varios intentos seguidos. Espera un momento antes de volver a intentar.';
  if (/permission.denied/i.test(String(error.code || ''))) return 'Tu acceso fue recibido, pero no pudimos cargar el perfil. Intenta de nuevo o contacta a la tienda.';
  return '';
}

export const canTryLegacyStoreLogin = error => [
  'auth/invalid-credential', 'auth/user-not-found', 'auth/wrong-password',
  'auth/invalid-login-credentials',
].includes(error?.code);
