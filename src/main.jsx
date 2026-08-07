
import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

const CHUNK_RECOVERY_FLAG = "sanmartin_chunk_recovery_once";
const INTERNAL_APP_HOSTS = new Set([
  "admintv.sanmartinsr.com",
  "cocina.sanmartinsr.com",
  "driver.sanmartinsr.com",
  "crm.sanmartinsr.com",
]);

const isLocalHostname = (hostname = "") => {
  const cleanHost = String(hostname || "").trim().toLowerCase();
  return (
    cleanHost === "localhost" ||
    cleanHost === "127.0.0.1" ||
    cleanHost === "::1" ||
    /^192\.168\.\d+\.\d+$/.test(cleanHost)
  );
};

const shouldLoadPublicStore = () => {
  if (typeof window === "undefined" || import.meta.env.MODE === "android") {
    return false;
  }

  const hostname = String(window.location.hostname || "").trim().toLowerCase();
  const pathname = String(window.location.pathname || "").replace(/\/+$/, "").toLowerCase();
  const hash = String(window.location.hash || "").replace(/^#\/?/, "").trim().toLowerCase();

  if (pathname === "/privacidad" || pathname === "/eliminar-cuenta") {
    return false;
  }

  if (hostname === "tienda.sanmartinsr.com") {
    return true;
  }

  if (INTERNAL_APP_HOSTS.has(hostname)) {
    return false;
  }

  if (isLocalHostname(hostname)) {
    return hash.startsWith("tienda") || ["/granada", "/nindiri", "/masaya"].includes(pathname);
  }

  return true;
};

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
  if (typeof window === "undefined") return false;
  const alreadyRetried = window.sessionStorage.getItem(CHUNK_RECOVERY_FLAG) === "1";
  if (alreadyRetried) return false;
  window.sessionStorage.setItem(CHUNK_RECOVERY_FLAG, "1");
  window.location.reload();
  return true;
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

const root = ReactDOM.createRoot(document.getElementById('root'));

function StartupScreen({ failed = false }) {
  return (
    <main
      aria-live="polite"
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        boxSizing: "border-box",
        color: "#102846",
        background: "linear-gradient(180deg, #f7fbff 0%, #edf6ff 100%)",
      }}
    >
      <section style={{ display: "grid", justifyItems: "center", gap: 14, textAlign: "center" }}>
        <img
          src="/tienda/branding/logo-mark.svg"
          alt="Carnes San Martin"
          width="72"
          height="72"
          style={{ display: "block" }}
        />
        <strong style={{ fontSize: 18 }}>
          {failed ? "No pudimos abrir la tienda" : "Preparando tu tienda"}
        </strong>
        <span style={{ color: "#466e98", fontSize: 14, fontWeight: 700 }}>
          {failed ? "Recarga la pagina para intentarlo nuevamente." : "Un momento, ya casi esta lista."}
        </span>
      </section>
    </main>
  );
}

root.render(
  <React.StrictMode>
    <StartupScreen />
  </React.StrictMode>
);

const applicationModule = shouldLoadPublicStore()
  ? import("./PublicStoreApp.jsx")
  : import("@app-entry");

applicationModule
  .then(({ default: App }) => {
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  })
  .catch((error) => {
    console.error("No se pudo cargar la aplicacion:", error);
    if (isChunkLoadFailure(error) && reloadForChunkRecovery()) {
      return;
    }

    root.render(
      <React.StrictMode>
        <StartupScreen failed />
      </React.StrictMode>
    );
  });
