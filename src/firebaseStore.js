import { getApps, initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

export const STORE_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyC_BORzYEyLsWqAmhf6woYmqwKyi_Bw6h4',
  authDomain: 'tiendavirtual-2ced1.firebaseapp.com',
  projectId: 'tiendavirtual-2ced1',
  storageBucket: 'tiendavirtual-2ced1.firebasestorage.app',
  messagingSenderId: '833772833243',
  appId: '1:833772833243:web:a8b95bfc33475e88537ffe',
  measurementId: 'G-SYL7DXEJZH',
};

const STORE_APP_NAME = 'sanmartin-storefront';

const existingStoreApp = getApps().find((app) => app.name === STORE_APP_NAME);
export const storeApp = existingStoreApp || initializeApp(STORE_FIREBASE_CONFIG, STORE_APP_NAME);
export const storeFirestore = getFirestore(storeApp);
export const storeStorage = getStorage(storeApp);
