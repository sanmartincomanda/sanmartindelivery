import React, { useEffect, useState } from 'react';
import { resolveWhaticketPendingOrder, subscribeWhaticketPendingOrders } from '../services/whaticketClientLinks';
import './WhaticketClientLinkPanel.css';

const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const CUSTOMER_STATUSES = ['awaiting_customer', 'question_error', 'question_sending', 'creating_client', 'creating_order'];

function PendingContact({ order, clientes, onResolved }) {
  const [mode, setMode] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const awaitingCustomer = CUSTOMER_STATUSES.includes(order.status);
  const term = normalize(search.trim());
  const suggestions = term.length >= 2 ? clientes.filter((client) => (
    [client.nombre, client.codigo, client.telefono, client.direccion].some((value) => normalize(value).includes(term))
  )).slice(0, 20) : [];

  const execute = async (action, extras = {}) => {
    setBusy(true);
    setError('');
    try {
      const result = await resolveWhaticketPendingOrder({ intakeId: order.id, action, ...extras });
      if (result.order) onResolved(`Pedido ${result.order.orderNumber} registrado con el código ${result.order.clienteCodigo}.`);
      else if (result.status === 'awaiting_customer') onResolved('Solicitud de nombre y dirección enviada al cliente por WhatsApp.');
    } catch (failure) {
      setError(failure?.message || 'No se pudo procesar la solicitud.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="whaticket-link-card" aria-busy={busy}>
      <div className="whaticket-link-card__heading">
        <div><strong>{order.contactName}</strong><span>+{order.phone} · {order.storeBranchId} · {order.fulfillmentType === 'pickup' ? 'Pickup' : 'Delivery'}</span></div>
        <span className="whaticket-link-badge">{awaitingCustomer ? 'Registro nuevo pendiente' : 'Sin cliente vinculado'}</span>
      </div>
      <p className="whaticket-link-order">{order.orderText}</p>
      {order.notes && <p>{order.notes}</p>}
      {!awaitingCustomer && <p>Se recibió un pedido del Agente Pedidos. Elija cómo registrar a este contacto.</p>}
      {awaitingCustomer && <p>{order.questionSentAt
        ? 'Se pidió al cliente su nombre de registro y dirección por WhatsApp. El agente podrá completar el registro con su respuesta.'
        : 'Revise el chat antes de repetir la solicitud. Puede completar los datos recibidos o vincular un cliente existente.'}</p>}
      {order.error && <p className="whaticket-link-error" role="alert">{order.error}</p>}
      <div className="whaticket-link-actions">
        <button type="button" disabled={busy} onClick={() => { setMode('existing'); setError(''); }}>Vincular cliente</button>
        {!awaitingCustomer && <button type="button" disabled={busy} onClick={() => { setMode('new'); setError(''); }}>Cliente nuevo</button>}
        {order.status === 'question_error' && <button type="button" disabled={busy} onClick={() => setMode('new')}>Reintentar solicitud</button>}
      </div>
      {mode === 'new' && <div className="whaticket-link-choice">
        <p>Se enviará al mismo chat: “Para registrar su código de cliente, ¿con qué nombre le gustaría quedar registrado y cuál es su dirección completa?”</p>
        <p>El código se generará automáticamente al recibir ambos datos. {order.status === 'question_error' && 'Confirme primero que el mensaje anterior no llegó.'}</p>
        <button type="button" disabled={busy} className="whaticket-link-primary" onClick={() => execute('new_client')}>{busy ? 'Enviando…' : 'Confirmar y pedir datos por WhatsApp'}</button>
      </div>}
      {mode === 'existing' && <div className="whaticket-link-choice">
        <label>Buscar cliente de AdminTV por nombre, código, teléfono o dirección
          <input value={search} disabled={busy} placeholder="Nombre o código del cliente" onChange={(event) => { setSearch(event.target.value); setSelected(null); }} />
        </label>
        {term.length >= 2 && !suggestions.length && <p>No se encontraron clientes. Pruebe con otro nombre o código.</p>}
        <ul className="whaticket-link-results">
          {suggestions.map((client) => <li key={client.firebaseKey}>
            <button type="button" disabled={busy} aria-pressed={selected?.firebaseKey === client.firebaseKey} onClick={() => setSelected(client)}>
              <strong>{client.codigo} · {client.nombre}</strong><span>{client.direccion || 'Sin dirección registrada'}</span>
            </button>
          </li>)}
        </ul>
        {selected && <div className="whaticket-link-selected"><strong>Cliente elegido: {selected.codigo} · {selected.nombre}</strong><p>{selected.direccion || 'Sin dirección registrada'}</p><p>Se guardará el vínculo para los siguientes pedidos de este contacto. No se enviarán preguntas al cliente.</p></div>}
        <button type="button" disabled={busy || !selected} className="whaticket-link-primary" onClick={() => execute('link_existing', { clientKey: selected.firebaseKey })}>{busy ? 'Registrando…' : 'Confirmar vínculo y registrar pedido'}</button>
      </div>}
      {awaitingCustomer && mode !== 'existing' && <details className="whaticket-link-details">
        <summary>Completar con los datos que respondió el cliente</summary>
        <p>Use únicamente el nombre y dirección confirmados por el cliente. También puede completarlos el agente mediante la API.</p>
        <label>Nombre para el registro<input disabled={busy} value={name} maxLength={160} onChange={(event) => setName(event.target.value)} /></label>
        <label>Dirección completa<textarea disabled={busy} value={address} maxLength={500} onChange={(event) => setAddress(event.target.value)} /></label>
        <button type="button" disabled={busy || !name.trim() || !address.trim()} className="whaticket-link-primary" onClick={() => execute('complete_new', { customer: { name, address } })}>{busy ? 'Registrando…' : 'Crear cliente y registrar pedido'}</button>
      </details>}
      {error && <p className="whaticket-link-error" role="alert">{error}</p>}
    </article>
  );
}

export default function WhaticketClientLinkPanel({ clientes = [], branchScope = '' }) {
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    setError('');
    setOrders([]);
    return subscribeWhaticketPendingOrders(branchScope, setOrders, () => {
      setError('No se pudo cargar la bandeja del Agente Pedidos. Revise su sesión y conexión.');
    });
  }, [branchScope]);
  return (
    <section className="whaticket-link-panel" aria-label="Pedidos de Whaticket pendientes de vinculación">
      <div className="whaticket-link-panel__title"><h2>Agente Pedidos</h2><span>{orders.length} por resolver</span></div>
      <p>{orders.length ? 'Resuelva el cliente antes de enviar estos pedidos a la comanda.' : 'Los pedidos de contactos sin vínculo aparecerán aquí para elegir Cliente nuevo o Vincular cliente.'}</p>
      {error && <p className="whaticket-link-error" role="alert">{error}</p>}
      {notice && <p className="whaticket-link-notice" role="status">{notice}</p>}
      {orders.map((order) => <PendingContact key={order.id} order={order} clientes={clientes} onResolved={setNotice} />)}
    </section>
  );
}
