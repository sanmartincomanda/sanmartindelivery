import React, { useMemo } from 'react';
import {
  DEFAULT_STORE_DELIVERY_SETTINGS,
  DEFAULT_STORE_OPERATION_HOURS,
  STORE_OPERATION_DAY_LABELS,
  STORE_OPERATION_DAY_ORDER,
  buildStoreOperationScheduleSummary,
  getStoreOperationStatus,
  normalizeStoreOperationHours,
} from '../services/storeDeliverySettings';

export default function StoreOperationHoursEditor({
  value,
  onChange,
  title = 'Horario de operaciones',
  description = 'La tienda virtual usa este horario para permitir o detener pedidos.',
  disabled = false,
}) {
  const operationHours = useMemo(
    () => normalizeStoreOperationHours(value, DEFAULT_STORE_OPERATION_HOURS),
    [value]
  );
  const settings = useMemo(
    () => ({ ...DEFAULT_STORE_DELIVERY_SETTINGS, operationHours }),
    [operationHours]
  );
  const operationStatus = useMemo(() => getStoreOperationStatus(settings), [settings]);
  const scheduleSummary = useMemo(
    () => buildStoreOperationScheduleSummary(settings),
    [settings]
  );

  const updateDay = (dayKey, field, nextValue) => {
    onChange?.({
      ...operationHours,
      [dayKey]: {
        ...operationHours[dayKey],
        [field]: field === 'enabled' ? nextValue === true : nextValue,
      },
    });
  };

  return (
    <section className="store-hours-editor">
      <style>{`
        .store-hours-editor {
          display: grid;
          gap: 13px;
          padding: 16px;
          border: 1px solid #dbe7f4;
          border-radius: 18px;
          background: #ffffff;
        }
        .store-hours-editor__head {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-start;
        }
        .store-hours-editor__head h3 {
          margin: 0;
          color: #102a4a;
          font-size: 19px;
        }
        .store-hours-editor__head p {
          margin: 4px 0 0;
          color: #64748b;
          font-size: 13px;
          font-weight: 700;
          line-height: 1.45;
        }
        .store-hours-editor__status {
          flex: 0 0 auto;
          padding: 7px 11px;
          border-radius: 999px;
          background: #dcfce7;
          color: #047857;
          font-size: 12px;
          font-weight: 950;
        }
        .store-hours-editor__status.closed {
          background: #ffedd5;
          color: #9a3412;
        }
        .store-hours-editor__days {
          display: grid;
          gap: 8px;
        }
        .store-hours-editor__day {
          display: grid;
          grid-template-columns: minmax(120px, 1fr) repeat(2, minmax(105px, 145px));
          gap: 9px;
          align-items: center;
          padding: 9px 10px;
          border: 1px solid #edf2f7;
          border-radius: 12px;
          background: #fbfdff;
        }
        .store-hours-editor__day label {
          display: flex;
          align-items: center;
          gap: 9px;
          color: #17324f;
          font-size: 13px;
          font-weight: 900;
        }
        .store-hours-editor__day input[type='checkbox'] {
          width: 18px;
          height: 18px;
        }
        .store-hours-editor__day input[type='time'] {
          width: 100%;
          min-height: 40px;
          padding: 0 9px;
          border: 1px solid #cbdced;
          border-radius: 11px;
          background: #ffffff;
          color: #102a4a;
          font: inherit;
          font-weight: 800;
        }
        .store-hours-editor__summary {
          margin: 0;
          color: #52708f;
          font-size: 12px;
          font-weight: 750;
          line-height: 1.5;
        }
        @media (max-width: 700px) {
          .store-hours-editor__head {
            flex-direction: column;
          }
          .store-hours-editor__day {
            grid-template-columns: 1fr 1fr;
          }
          .store-hours-editor__day label {
            grid-column: 1 / -1;
          }
        }
      `}</style>

      <div className="store-hours-editor__head">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <span className={`store-hours-editor__status ${operationStatus.open ? '' : 'closed'}`}>
          {operationStatus.statusLabel}
        </span>
      </div>

      <div className="store-hours-editor__days">
        {STORE_OPERATION_DAY_ORDER.map((dayKey) => {
          const day = operationHours[dayKey] || DEFAULT_STORE_OPERATION_HOURS[dayKey];
          return (
            <div className="store-hours-editor__day" key={dayKey}>
              <label>
                <input
                  type="checkbox"
                  checked={day.enabled !== false}
                  onChange={(event) => updateDay(dayKey, 'enabled', event.target.checked)}
                  disabled={disabled}
                />
                {STORE_OPERATION_DAY_LABELS[dayKey] || dayKey}
              </label>
              <input
                type="time"
                value={day.open || '06:45'}
                onChange={(event) => updateDay(dayKey, 'open', event.target.value)}
                disabled={disabled || day.enabled === false}
                aria-label={`Apertura ${STORE_OPERATION_DAY_LABELS[dayKey] || dayKey}`}
              />
              <input
                type="time"
                value={day.close || '17:15'}
                onChange={(event) => updateDay(dayKey, 'close', event.target.value)}
                disabled={disabled || day.enabled === false}
                aria-label={`Cierre ${STORE_OPERATION_DAY_LABELS[dayKey] || dayKey}`}
              />
            </div>
          );
        })}
      </div>

      <p className="store-hours-editor__summary">Horario publicado: {scheduleSummary}</p>
    </section>
  );
}
