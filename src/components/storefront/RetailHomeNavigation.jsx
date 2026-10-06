import React, { createContext, useContext } from 'react';

export const RetailHomeContext = createContext(null);

export function RetailHomeButton({ className = '' }) {
  const navigation = useContext(RetailHomeContext);
  if (!navigation) return null;
  return (
    <button type="button" className={`retail-home-button ${className}`} onClick={navigation.onHome}
      disabled={navigation.busy} aria-label="Volver al inicio">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m3 10 9-7 9 7M5 9v12h5v-7h4v7h5V9" />
      </svg>
      <span>Inicio</span>
    </button>
  );
}

export function RetailBackActions({ children }) {
  const navigation = useContext(RetailHomeContext);
  return navigation ? <span className="retail-back-actions">{children}<RetailHomeButton /></span> : children;
}
