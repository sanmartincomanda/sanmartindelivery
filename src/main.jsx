
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

const CHUNK_RECOVERY_FLAG = "sanmartin_chunk_recovery_once";

const getChunkErrorMessage = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message || String(value);
  if (typeof value?.reason?.message === "string") return value.reason.message;
  if (typeof value?.message === "string") return value.message;
  return String(value);
};

const isChunkLoadFailure = (value) => {
  const message = getChunkErrorMessage(value).toLowerCase();
  return (
    message.includes("failed to fetch dynamically imported module") ||
    message.includes("error loading dynamically imported module") ||
    message.includes("loading chunk") ||
    message.includes("importing a module script failed") ||
    message.includes("expected a javascript-or-wasm module script")
  );
};

const reloadForChunkRecovery = () => {
  if (typeof window === "undefined") return;
  const alreadyRetried = window.sessionStorage.getItem(CHUNK_RECOVERY_FLAG) === "1";
  if (alreadyRetried) return;
  window.sessionStorage.setItem(CHUNK_RECOVERY_FLAG, "1");
  window.location.reload();
};

if (typeof window !== "undefined") {
  window.addEventListener("error", (event) => {
    if (isChunkLoadFailure(event?.error || event?.message)) {
      reloadForChunkRecovery();
    }
  });

  window.addEventListener("unhandledrejection", (event) => {
    if (isChunkLoadFailure(event?.reason)) {
      reloadForChunkRecovery();
    }
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
