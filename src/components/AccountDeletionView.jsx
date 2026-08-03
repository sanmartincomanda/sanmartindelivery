import React, { useState } from 'react';
import './StoreLegalPage.css';
import {
  STORE_PRIVACY_URL,
  STORE_SUPPORT_EMAIL,
} from '../services/storeLegal';

const LOGO_PATH = '/tienda/branding/logo-mark.svg';

export default function AccountDeletionView() {
  const [form, setForm] = useState({ email: '', phone: '', reason: '' });

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const subject = 'Solicitud de eliminacion de cuenta - Carnes San Martin';
    const body = [
      'Solicito eliminar mi cuenta y los datos personales asociados.',
      '',
      `Correo de la cuenta: ${form.email.trim() || 'No indicado'}`,
      `Telefono: ${form.phone.trim() || 'No indicado'}`,
      `Motivo opcional: ${form.reason.trim() || 'No indicado'}`,
      '',
      'Entiendo que pueden conservarse registros requeridos por obligaciones legales o contables.',
    ].join('\n');

    window.location.href = `mailto:${STORE_SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <main className="store-legal-page">
      <div className="store-legal-shell">
        <header className="store-legal-header">
          <img className="store-legal-logo" src={LOGO_PATH} alt="Carnes San Martin" />
          <div>
            <h1>Eliminar mi cuenta</h1>
            <p>Carnes San Martin · Solicitud de cuenta y datos</p>
          </div>
        </header>

        <article className="store-legal-card">
          <h2>Antes de solicitarla</h2>
          <p>
            Eliminaremos tu perfil, acceso y datos personales asociados que no debamos conservar. Tus puntos,
            cupones y beneficios pendientes dejaran de estar disponibles. Procesaremos la solicitud en un plazo
            de hasta 30 dias y podremos contactarte para confirmar que eres la persona titular de la cuenta.
          </p>
          <p className="store-legal-note">
            Los comprobantes o registros de pedidos que deban conservarse por obligaciones legales, contables,
            seguridad o prevencion de fraude se mantendran solo durante el plazo aplicable.
          </p>

          <form className="store-legal-form" onSubmit={handleSubmit}>
            <label>
              Correo de la cuenta
              <input
                type="email"
                value={form.email}
                onChange={(event) => updateField('email', event.target.value)}
                placeholder="correo@ejemplo.com"
                required
              />
            </label>
            <label>
              Telefono
              <input
                value={form.phone}
                onChange={(event) => updateField('phone', event.target.value)}
                placeholder="Numero asociado a tu cuenta"
                inputMode="tel"
                required
              />
            </label>
            <label>
              Motivo (opcional)
              <textarea
                value={form.reason}
                onChange={(event) => updateField('reason', event.target.value)}
                placeholder="Puedes contarnos brevemente el motivo"
              />
            </label>
            <button className="store-legal-button" type="submit">Enviar solicitud por correo</button>
          </form>

          <div className="store-legal-actions">
            <a className="store-legal-button secondary" href="https://tienda.sanmartinsr.com/">Volver a la tienda</a>
            <a className="store-legal-button secondary" href={STORE_PRIVACY_URL}>Ver politica de privacidad</a>
          </div>
        </article>

        <footer className="store-legal-footer">
          Tambien puedes escribir directamente a {STORE_SUPPORT_EMAIL}
        </footer>
      </div>
    </main>
  );
}
