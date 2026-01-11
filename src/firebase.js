import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyA6LKWFpuIUH4g6owCzIbMbqOzNwV_UIro",
  authDomain: "comanda-digital-ac1ec.firebaseapp.com",
  databaseURL: "https://comanda-digital-ac1ec-default-rtdb.firebaseio.com",
  projectId: "comanda-digital-ac1ec",
  storageBucket: "comanda-digital-ac1ec.appspot.com",
  messagingSenderId: "41323183250",
  appId: "1:41323183250:web:aa1d7ea9cbbc353a917a4b",
};

const app = initializeApp(firebaseConfig);
export const database = getDatabase(app);
