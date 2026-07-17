import { getApps, initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyA6LKWFpuIUH4g6owCzIbMbqOzNwV_UIro',
  authDomain: 'comanda-digital-ac1ec.firebaseapp.com',
  databaseURL: 'https://comanda-digital-ac1ec-default-rtdb.firebaseio.com',
  projectId: 'comanda-digital-ac1ec',
  storageBucket: 'comanda-digital-ac1ec.firebasestorage.app',
  messagingSenderId: '41323183250',
  appId: '1:41323183250:web:aa1d7ea9cbbc353a917a4b',
};

const SCRIPT_APP_NAME = 'sicar-script-auth';
const AUTH_DOMAIN = 'auth.sanmartinsr.local';

let authPromise = null;

const sanitizeEmailToken = (value = '') =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._-]/g, '');

const buildInternalEmail = (username, scope = 'internal') => {
  const cleanUsername = sanitizeEmailToken(username);
  const cleanScope = sanitizeEmailToken(scope) || 'internal';
  return `${cleanUsername || 'usuario'}@${cleanScope}.${AUTH_DOMAIN}`;
};

const resolvePassword = (value = '') => {
  const rawPassword = String(value || '');
  return rawPassword.length < 6 ? `${rawPassword}26` : rawPassword;
};

const getScriptFirebaseApp = () => {
  const existingApp = getApps().find((entry) => entry.name === SCRIPT_APP_NAME);
  return existingApp || initializeApp(FIREBASE_CONFIG, SCRIPT_APP_NAME);
};

export const getAuthenticatedFirebaseDatabase = () => getDatabase(getScriptFirebaseApp());

const resolveScriptCredentials = () => {
  const username = String(process.env.SICAR_FIREBASE_USERNAME || 'admin').trim() || 'admin';
  const scope = String(process.env.SICAR_FIREBASE_SCOPE || 'admin').trim() || 'admin';

  return {
    email: String(process.env.SICAR_FIREBASE_EMAIL || buildInternalEmail(username, scope)).trim(),
    password: resolvePassword(process.env.SICAR_FIREBASE_PASSWORD || 'admin'),
  };
};

export async function ensureAuthenticatedFirebaseSession(options = {}) {
  const app = getScriptFirebaseApp();
  const auth = getAuth(app);
  const forceRefresh = options?.forceRefresh === true;

  if (!forceRefresh && auth.currentUser) {
    try {
      await auth.currentUser.getIdToken(true);
      return auth.currentUser;
    } catch {
    }
  }

  if (authPromise) {
    return authPromise;
  }

  const { email, password } = resolveScriptCredentials();

  authPromise = Promise.resolve()
    .then(async () => {
      if (forceRefresh && auth.currentUser) {
        await signOut(auth).catch(() => {});
      }
    })
    .then(() => signInWithEmailAndPassword(auth, email, password))
    .then((credential) => credential.user)
    .catch((error) => {
      authPromise = null;
      throw error;
    });

  return authPromise;
}

export async function refreshAuthenticatedFirebaseSession() {
  return ensureAuthenticatedFirebaseSession({ forceRefresh: true });
}
