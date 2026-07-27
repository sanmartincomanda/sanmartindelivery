import React, { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { getDistanceKm, normalizeLocation } from '../services/geo';

const formatDistance = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return '';
  }

  if (numeric < 1) {
    return `${Math.max(1, Math.round(numeric * 1000))} m`;
  }

  return `${numeric.toFixed(numeric < 10 ? 1 : 0)} km`;
};

const LocationPin = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M12 22s7-6.3 7-13a7 7 0 1 0-14 0c0 6.7 7 13 7 13Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    />
    <circle cx="12" cy="9" r="2.5" fill="currentColor" />
  </svg>
);

export function StoreBranchButton({ branch, locating = false, onClick }) {
  return (
    <button type="button" className="store-branch-pill" onClick={onClick}>
      <span className="store-branch-pill-icon">
        <LocationPin />
      </span>
      <span>
        <small>{locating ? 'Buscando tienda cercana...' : 'Tu tienda'}</small>
        <strong>{branch?.shortName || 'Granada'}</strong>
      </span>
      <span className="store-branch-pill-chevron" aria-hidden="true">
        ›
      </span>
    </button>
  );
}

export default function StoreBranchSelector({
  open = false,
  mode = 'list',
  branches = [],
  selectedBranch = null,
  nearestCandidate = null,
  userLocation = null,
  onSelect,
  onKeepCurrent,
  onClose,
}) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  const branchRows = useMemo(() => {
    const location = normalizeLocation(userLocation);
    return branches
      .filter((branch) => branch.active !== false)
      .map((branch) => ({
        ...branch,
        distanceKm: location ? getDistanceKm(location, branch.storeLocation) : Number.POSITIVE_INFINITY,
      }))
      .sort((left, right) => {
        if (Number.isFinite(left.distanceKm) || Number.isFinite(right.distanceKm)) {
          return left.distanceKm - right.distanceKm;
        }
        return Number(left.displayOrder || 0) - Number(right.displayOrder || 0);
      });
  }, [branches, userLocation]);

  if (!open) {
    return null;
  }

  const nearbyBranch = nearestCandidate?.branch || null;
  const isNearbyPrompt = mode === 'nearby' && nearbyBranch;

  const content = (
    <div className="store-branch-overlay" role="presentation" onClick={onClose}>
      <section
        className="store-branch-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Elegir tienda"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="store-branch-modal-handle" />
        <button type="button" className="store-branch-modal-close" onClick={onClose} aria-label="Cerrar">
          ×
        </button>

        {isNearbyPrompt ? (
          <>
            <div className="store-branch-nearby-icon">
              <LocationPin />
            </div>
            <span className="store-branch-eyebrow">Tienda cercana detectada</span>
            <h2>Parece que estás cerca de {nearbyBranch.name}</h2>
            <p>
              Está a aproximadamente <strong>{formatDistance(nearestCandidate.distanceKm)}</strong> de tu
              ubicación. ¿Quieres cambiar a esta tienda?
            </p>
            <div className="store-branch-nearby-card">
              <div>
                <strong>{nearbyBranch.name}</strong>
                <span>{nearbyBranch.address}</span>
              </div>
              <span>{formatDistance(nearestCandidate.distanceKm)}</span>
            </div>
            <button type="button" className="store-branch-primary" onClick={() => onSelect?.(nearbyBranch)}>
              Sí, cambiar a {nearbyBranch.shortName}
            </button>
            <button type="button" className="store-branch-secondary" onClick={onKeepCurrent}>
              No, haré el pedido para otra dirección
            </button>
          </>
        ) : (
          <>
            <span className="store-branch-eyebrow">Carnes San Martín</span>
            <h2>Elige tu tienda</h2>
            <p>Usaremos esta sucursal para calcular cobertura, pickup y preparar tu pedido.</p>
            <div className="store-branch-list">
              {branchRows.map((branch) => {
                const selected = branch.id === selectedBranch?.id;
                return (
                  <button
                    type="button"
                    key={branch.id}
                    className={`store-branch-row ${selected ? 'selected' : ''}`}
                    onClick={() => onSelect?.(branch)}
                  >
                    <span className="store-branch-row-pin">
                      <LocationPin />
                    </span>
                    <span className="store-branch-row-copy">
                      <strong>{branch.name}</strong>
                      <small>{branch.address}</small>
                      {branch.acceptingOrders === false && <em>Pedidos pausados</em>}
                    </span>
                    <span className="store-branch-row-meta">
                      {Number.isFinite(branch.distanceKm) && <small>{formatDistance(branch.distanceKm)}</small>}
                      <strong>{selected ? 'Actual' : 'Elegir'}</strong>
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </section>
      <style>{`
        .store-branch-overlay {
          position: fixed;
          inset: 0;
          z-index: 130;
          display: grid;
          place-items: center;
          padding: 18px;
          background: rgba(4, 14, 30, 0.72);
          backdrop-filter: blur(10px);
        }
        .store-branch-modal {
          position: relative;
          width: min(540px, 100%);
          max-height: min(760px, 92dvh);
          overflow: auto;
          border-radius: 30px;
          padding: 34px;
          background:
            radial-gradient(circle at top right, rgba(72, 156, 235, 0.18), transparent 36%),
            #ffffff;
          color: #102b4e;
          box-shadow: 0 36px 90px rgba(2, 14, 31, 0.35);
          font-family: "Trebuchet MS", "Segoe UI", sans-serif;
          animation: storeBranchEnter 180ms ease-out both;
        }
        .store-branch-modal-handle {
          display: none;
        }
        .store-branch-modal-close {
          position: absolute;
          top: 16px;
          right: 16px;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          border: 1px solid rgba(12, 77, 136, 0.12);
          background: #f4f9ff;
          color: #102b4e;
          font-size: 24px;
          cursor: pointer;
        }
        .store-branch-nearby-icon {
          width: 62px;
          height: 62px;
          display: grid;
          place-items: center;
          border-radius: 20px;
          color: #ffffff;
          background: linear-gradient(145deg, #0c4d88, #3b91de);
          box-shadow: 0 16px 30px rgba(12, 77, 136, 0.28);
        }
        .store-branch-nearby-icon svg {
          width: 30px;
          height: 30px;
        }
        .store-branch-eyebrow {
          display: block;
          margin-top: 20px;
          color: #c9232b;
          font-size: 12px;
          font-weight: 950;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .store-branch-modal h2 {
          margin: 8px 48px 8px 0;
          font-size: clamp(25px, 5vw, 34px);
          line-height: 1.05;
          letter-spacing: -0.035em;
        }
        .store-branch-modal > p {
          margin: 0 0 20px;
          color: #5e7188;
          font-weight: 700;
          line-height: 1.5;
        }
        .store-branch-nearby-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          margin: 20px 0;
          padding: 16px;
          border: 1px solid rgba(12, 77, 136, 0.14);
          border-radius: 18px;
          background: #f3f8fe;
        }
        .store-branch-nearby-card div {
          display: grid;
          gap: 4px;
        }
        .store-branch-nearby-card div span {
          color: #63758a;
          font-size: 13px;
          font-weight: 700;
        }
        .store-branch-nearby-card > span {
          color: #0c4d88;
          font-weight: 950;
          white-space: nowrap;
        }
        .store-branch-primary,
        .store-branch-secondary {
          width: 100%;
          min-height: 52px;
          margin-top: 10px;
          border-radius: 16px;
          border: 0;
          padding: 0 18px;
          font: inherit;
          font-weight: 950;
          cursor: pointer;
        }
        .store-branch-primary {
          color: #ffffff;
          background: linear-gradient(135deg, #0c4d88, #3b91de);
          box-shadow: 0 16px 28px rgba(12, 77, 136, 0.22);
        }
        .store-branch-secondary {
          color: #163554;
          background: #eef5fc;
          border: 1px solid rgba(12, 77, 136, 0.12);
        }
        .store-branch-list {
          display: grid;
          gap: 10px;
          margin-top: 20px;
        }
        .store-branch-row {
          width: 100%;
          display: grid;
          grid-template-columns: 44px minmax(0, 1fr) auto;
          align-items: center;
          gap: 12px;
          padding: 14px;
          border: 1px solid rgba(12, 77, 136, 0.12);
          border-radius: 18px;
          background: #ffffff;
          color: #102b4e;
          text-align: left;
          cursor: pointer;
        }
        .store-branch-row.selected {
          border-color: #2b83d2;
          background: linear-gradient(135deg, #eef7ff, #ffffff);
          box-shadow: 0 10px 24px rgba(12, 77, 136, 0.1);
        }
        .store-branch-row-pin {
          width: 44px;
          height: 44px;
          display: grid;
          place-items: center;
          border-radius: 14px;
          color: #0c4d88;
          background: #eaf4fd;
        }
        .store-branch-row-pin svg {
          width: 22px;
          height: 22px;
        }
        .store-branch-row-copy {
          min-width: 0;
          display: grid;
          gap: 3px;
        }
        .store-branch-row-copy small {
          color: #65788d;
          font-weight: 700;
        }
        .store-branch-row-copy em {
          color: #c9232b;
          font-size: 12px;
          font-style: normal;
          font-weight: 950;
        }
        .store-branch-row-meta {
          display: grid;
          justify-items: end;
          gap: 4px;
          color: #0c4d88;
        }
        .store-branch-row-meta small {
          color: #66788c;
          font-weight: 800;
        }
        @keyframes storeBranchEnter {
          from { opacity: 0; transform: translateY(12px) scale(0.985); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @media (max-width: 640px) {
          .store-branch-overlay {
            place-items: end center;
            padding: 0;
          }
          .store-branch-modal {
            width: 100%;
            max-height: 88dvh;
            border-radius: 28px 28px 0 0;
            padding: 28px 18px calc(22px + env(safe-area-inset-bottom));
          }
          .store-branch-modal-handle {
            display: block;
            width: 42px;
            height: 5px;
            margin: -16px auto 16px;
            border-radius: 999px;
            background: #cfdae6;
          }
          .store-branch-row {
            grid-template-columns: 40px minmax(0, 1fr) auto;
            padding: 12px;
          }
        }
      `}</style>
    </div>
  );

  return typeof document !== 'undefined' && document.body
    ? createPortal(content, document.body)
    : content;
}
