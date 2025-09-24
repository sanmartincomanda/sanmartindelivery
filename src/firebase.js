// firebase.js
import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
// Si quieres usar App Check en debug mientras desarrollas:
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

const firebaseConfig = {
  apiKey: "AIzaSyA6LKWFpuIUH4g6owCzIbMbqOzNwV_UIro",
  authDomain: "comanda-digital-ac1ec.firebaseapp.com",
  databaseURL: "https://comanda-digital-ac1ec-default-rtdb.firebaseio.com", // sin / final o con /, da igual
  projectId: "comanda-digital-ac1ec",
  storageBucket: "comanda-digital-ac1ec.appspot.com", // <- corregido
  messagingSenderId: "41323183250",
  appId: "1:41323183250:web:aa1d7ea9cbbc353a917a4b",
};

const app = initializeApp(firebaseConfig);

// (Opcional) App Check en modo debug para desarrollo
if (typeof window !== "undefined") {
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
}
initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider("debug-only"),
  isTokenAutoRefreshEnabled: true,
});

// Exporta la DB que usa tu App.jsx
export const database = getDatabase(app);


initializeAppCheck(app, {
  // Con DEBUG activado, se usa el token de debug y no vas a ver el challenge
  provider: new ReCaptchaV3Provider('debug-only'),
  isTokenAutoRefreshEnabled: true,
});
