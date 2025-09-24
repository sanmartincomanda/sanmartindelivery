// firebase.js
import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

const firebaseConfig = {
  apiKey: "AIzaSyA6LKWFpuIUH4g6owCzIbMbqOzNwV_UIro",
  authDomain: "comanda-digital-ac1ec.firebaseapp.com",
  databaseURL: "https://comanda-digital-ac1ec-default-rtdb.firebaseio.com",
  projectId: "comanda-digital-ac1ec",
  storageBucket: "comanda-digital-ac1ec.firebasestorage.app",
  messagingSenderId: "41323183250",
  appId: "1:41323183250:web:aa1d7ea9cbbc353a917a4b",
};

const app = initializeApp(firebaseConfig);

// HABILITA MODO DEBUG (dev / netlify preview). Debe ir antes de initializeAppCheck.
if (typeof window !== 'undefined') {
  // true => genera/usa token de debug automáticamente
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
}

initializeAppCheck(app, {
  // Con DEBUG activado, se usa el token de debug y no vas a ver el challenge
  provider: new ReCaptchaV3Provider('debug-only'),
  isTokenAutoRefreshEnabled: true,
});

export const database = getDatabase(app);
