import { deleteApp, initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { get, getDatabase, ref, set } from 'firebase/database';

const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyA6LKWFpuIUH4g6owCzIbMbqOzNwV_UIro',
  authDomain: 'comanda-digital-ac1ec.firebaseapp.com',
  databaseURL: 'https://comanda-digital-ac1ec-default-rtdb.firebaseio.com',
  projectId: 'comanda-digital-ac1ec',
  storageBucket: 'comanda-digital-ac1ec.firebasestorage.app',
  messagingSenderId: '41323183250',
  appId: '1:41323183250:web:aa1d7ea9cbbc353a917a4b',
};

const AUTH_DOMAIN = 'auth.sanmartinsr.local';
const sanitizeToken = (value = '') =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._-]/g, '');
const internalEmail = (username) => `${sanitizeToken(username)}@admin.${AUTH_DOMAIN}`;
const authPassword = (password) => {
  const value = String(password || '');
  return value.length < 6 ? `${value}26` : value;
};

const branchAdmins = [
  {
    username: 'adminNi',
    password: 'adminni',
    branchId: 'nindiri',
    branchName: 'Carnes San Martin Nindiri',
    displayName: 'Administrador Nindiri',
  },
  {
    username: 'adminMY',
    password: 'adminmy',
    branchId: 'masaya',
    branchName: 'Carnes San Martin Masaya',
    displayName: 'Administrador Masaya',
  },
];

const adminApp = initializeApp(FIREBASE_CONFIG, `branch-admin-bootstrap-${Date.now()}`);
const adminAuth = getAuth(adminApp);
const database = getDatabase(adminApp);

async function createOrVerifyUser(user, index) {
  const userApp = initializeApp(FIREBASE_CONFIG, `branch-user-${index}-${Date.now()}`);
  const userAuth = getAuth(userApp);
  const email = internalEmail(user.username);
  let authUser;

  try {
    const credential = await createUserWithEmailAndPassword(userAuth, email, authPassword(user.password));
    authUser = credential.user;
  } catch (error) {
    if (error?.code !== 'auth/email-already-in-use') throw error;
    const credential = await signInWithEmailAndPassword(userAuth, email, authPassword(user.password));
    authUser = credential.user;
  }

  await updateProfile(authUser, { displayName: user.displayName }).catch(() => {});
  await set(ref(database, `userRoles/${authUser.uid}`), {
    role: 'branch_admin',
    username: user.username,
    scope: 'admin',
    email,
    displayName: user.displayName,
    branchId: user.branchId,
    storeBranchId: user.branchId,
    branchName: user.branchName,
    updatedAt: Date.now(),
  });
  await signOut(userAuth).catch(() => {});
  await deleteApp(userApp);
  return { username: user.username, branchId: user.branchId, uid: authUser.uid };
}

async function main() {
  const masterUsername = String(process.env.BOOTSTRAP_ADMIN_USER || 'admin').trim();
  const masterPassword = String(process.env.BOOTSTRAP_ADMIN_PASSWORD || 'admin');
  const masterCredential = await signInWithEmailAndPassword(
    adminAuth,
    internalEmail(masterUsername),
    authPassword(masterPassword)
  );
  const roleSnapshot = await get(ref(database, `userRoles/${masterCredential.user.uid}`));
  if (roleSnapshot.val()?.role !== 'admin') {
    throw new Error('La cuenta usada para crear sucursales no es administrador maestro.');
  }

  for (let index = 0; index < branchAdmins.length; index += 1) {
    const result = await createOrVerifyUser(branchAdmins[index], index);
    console.log(`OK ${result.username}: ${result.branchId}`);
  }
  console.log('Administradores de sucursal listos.');
}

main()
  .catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await signOut(adminAuth).catch(() => {});
    await deleteApp(adminApp).catch(() => {});
  });
