import React, { useState, useEffect, useRef } from 'react';
import { getApp } from 'firebase/app';
import { ref, push, onValue, update, set } from 'firebase/database';
import { database } from './firebase';
import logo from './logo.svg';
import pedidoSound from './pedido.mp3';
import './App.css';

/******************** UTIL ********************/
const normalizar = (s = '') => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/******************** ORDER FORM ********************/
function OrderForm({ onAddOrder, nextOrderId, clientes }) {
  const [clienteInput, setClienteInput] = useState('');
  const [pedido, setPedido] = useState('');
  const [customId, setCustomId] = useState(nextOrderId);
  const [selectedClient, setSelectedClient] = useState(null);
  const [showNewClient, setShowNewClient] = useState(false);
  const [nuevoCliente, setNuevoCliente] = useState({ nombre: '', codigo: '', direccion: '' });
  const [savingClient, setSavingClient] = useState(false);


  useEffect(() => setCustomId(nextOrderId), [nextOrderId]);
useEffect(() => {
  try {
    console.log('Firebase projectId:', getApp().options.projectId);
    console.log('Realtime DB root:', ref(database).toString());
    // Debe verse algo como: https://TU-PROYECTO-default-rtdb.<region>.firebasedatabase.app/
  } catch (e) {
    console.error('No pude leer config de Firebase:', e);
  }
}, []);

  const sugerencias = clientes
    .filter(c => normalizar(c.nombre).includes(normalizar(clienteInput)))
    .slice(0, 8);

  const handleSelectCliente = (c) => {
    setSelectedClient(c);
    setClienteInput(c.nombre);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!pedido.trim()) return;

    // Si hay un cliente seleccionado, usamos sus datos. Si no, impedimos continuar.
    if (!selectedClient) {
      alert('Seleccioná un cliente de la lista (o agregá uno nuevo).');
      return;
    }

    const fecha = new Date().toISOString().slice(0, 10);
    const hora = new Date().toLocaleTimeString();

    onAddOrder({
      cliente: selectedClient.nombre,
      clienteCodigo: selectedClient.codigo || '-',
      direccion: selectedClient.direccion || '-',
      pedido,
      fecha,
      hora,
      id: customId
    });

    // reset
    setClienteInput('');
    setSelectedClient(null);
    setPedido('');
    setCustomId((prev) => Math.min(prev + 1, 100));
  };

const guardarNuevoCliente = async () => {
  const { nombre, codigo, direccion } = nuevoCliente;
  if (!nombre.trim() || !codigo.trim() || !direccion.trim()) {
    alert('Completá nombre, código y dirección para crear el cliente.');
    return;
  }
  try {
    const nuevoRef = push(ref(database, 'clients'));
    const data = { nombre: nombre.trim(), codigo: codigo.trim(), direccion: direccion.trim() };
    await set(nuevoRef, data);
    setShowNewClient(false);
    setNuevoCliente({ nombre: '', codigo: '', direccion: '' });
    setSelectedClient({ firebaseKey: nuevoRef.key, ...data });
    setClienteInput(data.nombre);
  } catch (err) {
    console.error('Error guardando cliente:', err);
    alert('No se pudo guardar el cliente. Detalle: ' + (err?.code || err?.message || String(err)));
  }
};



  return (
    <form onSubmit={handleSubmit} style={{ marginBottom: 20 }}>
      <label>Número de pedido:</label>
      <input
        type="number"
        value={customId}
        onChange={(e) => setCustomId(parseInt(e.target.value || '1', 10))}
        min={1}
        max={100}
        style={{ width: '100%', padding: 8, fontSize: 16, marginBottom: 10 }}
      />

      <label>Cliente:</label>
      <div style={{ position: 'relative', marginBottom: 10 }}>
        <input
          type="text"
          placeholder="Escribí y elegí de la lista"
          value={clienteInput}
          onChange={(e) => {
            setClienteInput(e.target.value);
            setSelectedClient(null);
          }}
          style={{ width: '100%', padding: 8, fontSize: 16 }}
          required
          autoComplete="off"
        />
        {/* Dropdown de sugerencias */}
        {clienteInput && !selectedClient && sugerencias.length > 0 && (
          <ul style={{
            position: 'absolute', top: '100%', left: 0, right: 0,
            background: 'white', border: '1px solid #ddd', borderRadius: 6,
            listStyle: 'none', margin: 0, padding: 0, zIndex: 10, maxHeight: 220, overflowY: 'auto'
          }}>
            {sugerencias.map((c) => (
              <li
                key={c.firebaseKey}
                onClick={() => handleSelectCliente(c)}
                style={{ padding: '8px 10px', cursor: 'pointer' }}
              >
                <div style={{ fontWeight: 600 }}>{c.nombre}</div>
                <small>Código: {c.codigo} · Dirección: {c.direccion}</small>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selectedClient && (
        <div style={{
          background: '#f6f9ff', border: '1px solid #cfe2ff', padding: 10,
          borderRadius: 8, marginBottom: 10
        }}>
          <div><strong>Cliente seleccionado:</strong> {selectedClient.nombre}</div>
          <div><strong>Código:</strong> {selectedClient.codigo}</div>
          <div><strong>Dirección:</strong> {selectedClient.direccion}</div>
          <button type="button" onClick={() => { setSelectedClient(null); setClienteInput(''); }}>Cambiar</button>
        </div>
      )}

      {!selectedClient && (
        <div style={{ marginBottom: 12 }}>
          <button type="button" onClick={() => setShowNewClient(v => !v)}>
            {showNewClient ? 'Cancelar nuevo cliente' : '➕ Agregar cliente nuevo'}
          </button>
        </div>
      )}

      {showNewClient && (
        <div style={{ background: '#fffaf0', border: '1px solid #ffe8a1', padding: 10, borderRadius: 8, marginBottom: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: 8 }}>
            <input
              placeholder="Nombre"
              value={nuevoCliente.nombre}
              onChange={(e) => setNuevoCliente({ ...nuevoCliente, nombre: e.target.value })}
              style={{ padding: 8, fontSize: 14 }}
            />
            <input
              placeholder="Código"
              value={nuevoCliente.codigo}
              onChange={(e) => setNuevoCliente({ ...nuevoCliente, codigo: e.target.value })}
              style={{ padding: 8, fontSize: 14 }}
            />
          </div>
          <input
            placeholder="Dirección"
            value={nuevoCliente.direccion}
            onChange={(e) => setNuevoCliente({ ...nuevoCliente, direccion: e.target.value })}
            style={{ marginTop: 8, padding: 8, width: '100%', fontSize: 14 }}
          />
          <div style={{ marginTop: 8 }}>
          <button type="button" onClick={guardarNuevoCliente} disabled={savingClient}>
  {savingClient ? 'Guardando…' : 'Guardar cliente'}
</button>

          </div>
        </div>
      )}

      <label>Pedido:</label>
      <textarea
        rows={5}
        placeholder="Escribí el pedido aquí"
        value={pedido}
        onChange={(e) => setPedido(e.target.value)}
        style={{ width: '100%', padding: 8, fontSize: 16, marginBottom: 10, resize: 'vertical' }}
        required
      />
      <button type="submit" style={{ padding: '10px 20px', fontSize: 16 }}>
        Agregar Pedido
      </button>
    </form>
  );
}

/******************** COLORES POR ESTADO ********************/
function getColors(estado) {
  switch (estado) {
    case 'Pendiente': return { background: '#d1ecf1', border: '#0c5460' };
    case 'En preparación': return { background: '#fff3cd', border: '#856404' };
    case 'Preparado': return { background: '#d4edda', border: '#155724' };
    case 'Enviado': return { background: 'rgba(40, 167, 69, 0.7)', border: '#155724' };
    case 'Cancelado': return { background: '#f8d7da', border: '#721c24' };
    default: return { background: '#f8f9fa', border: '#6c757d' };
  }
}

/******************** LISTA (ENVÍO) ********************/
function ListaPedidos({ pedidos, onEnviarPedido }) {
  return (
    <div style={{ padding: 20 }}>
      <h2>Lista de Pedidos de Hoy</h2>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {pedidos.map(({ id, cliente, clienteCodigo, direccion, estado, cocinero, repartidor }) => {
          const { background, border } = getColors(estado);
          const parpadeo = estado === 'Preparado' ? 'parpadeo' : '';
          return (
            <li key={id} className={parpadeo} style={{ padding: 10, borderBottom: '1px solid #ccc', backgroundColor: background, border: `2px solid ${border}`, borderRadius: 6, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div>
                  <strong>#{id}</strong> — <strong>{cliente}</strong> (Código: {clienteCodigo || '-'})
                  <div style={{ fontSize: 13 }}><em>Dirección:</em> {direccion || '-'}</div>
                </div>
                <em>{estado}</em>
              </div>

              {estado === 'En preparación' && cocinero && (
                <> (Cocinero: <strong>{cocinero}</strong>)</>
              )}

              {estado === 'Preparado' && (
                <div style={{ marginTop: 8 }}>
                  <label>Enviar pedido con: </label>
                  <select onChange={(e) => onEnviarPedido(id, e.target.value)} defaultValue="">
                    <option value="" disabled>Seleccionar...</option>
                    <option>Carlos Mora</option>
                    <option>Noel Hernadez</option>
                    <option>Noel Bendaña</option>
                    <option>Jose Orozco</option>
                    <option>Daniel Cruz</option>
                    <option>Otros</option>
                  </select>
                </div>
              )}
              {estado === 'Enviado' && repartidor && (
                <div style={{ marginTop: 5 }}>
                  <small>Enviado con: <strong>{repartidor}</strong></small>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/******************** COCINA ********************/
function KitchenView({ orders }) {
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const audioRef = useRef(null);

  const updateCampo = (firebaseKey, campo, valor) => {
    const orderRef = ref(database, `orders/${firebaseKey}`);
    update(orderRef, { [campo]: valor });
  };

  const handleSelectCocinero = (firebaseKey, valor) => {
    if (!valor) return;
    const now = new Date().toLocaleTimeString();
    update(ref(database, `orders/${firebaseKey}`), {
      cocinero: valor,
      estado: 'En preparación',
      timestampPreparacion: now
    });
  };

  const marcarPreparado = (firebaseKey) => {
    const now = new Date().toLocaleTimeString();
    update(ref(database, `orders/${firebaseKey}`), {
      estado: 'Preparado',
      timestampPreparado: now
    });
  };

  useEffect(() => {
    if (audioRef.current && orders.length > 0) {
      const latestOrder = orders[orders.length - 1];
      const now = new Date().toISOString().slice(0, 10);
      if (latestOrder.fecha === now && latestOrder.justAdded) {
        audioRef.current.play();
      }
    }
  }, [orders]);

  const cocineros = ['Noel Hernandez', 'Julio Amador', 'Roberto Centeno', 'Maria Gomez', 'Daniel Cruz', 'Jose Orozco', 'Otro'];
  const pedidosFiltrados = orders.filter(o => o.estado !== 'Enviado');

  return (
    <div style={{ padding: 20, fontSize: '20px' }}>
      <h2>Pedidos en Cocina</h2>
      <audio ref={audioRef} src={pedidoSound} preload="auto" />
      {pedidosFiltrados.length === 0 ? (
        <p>No hay pedidos para hoy</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {[...pedidosFiltrados].sort((a, b) => a.id - b.id).map(({ id, cliente, clienteCodigo, pedido, estado = 'Pendiente', firebaseKey, cocinero }) => {
            const isEditing = editingId === firebaseKey;
            const textStyle = estado === 'Cancelado' ? { textDecoration: 'line-through' } : {};
            const { background, border } = getColors(estado);

            return (
              <li key={firebaseKey} style={{ backgroundColor: background, border: `2px solid ${border}`, marginBottom: 10, padding: 15, borderRadius: 8 }}>
                <div style={{ marginBottom: 6 }}>
                  <strong>#{id} - Cliente:</strong> {cliente} — <strong>Código:</strong> {clienteCodigo || '-'}
                </div>
                <div style={{ marginTop: 5 }}>
                  <strong>Pedido:</strong>
                  {isEditing ? (
                    <>
                      <textarea
                        rows={3}
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        style={{ width: '100%', fontSize: '16px', resize: 'vertical', marginTop: 5 }}
                      />
                      <div style={{ marginTop: 5 }}>
                        <button onClick={() => { updateCampo(firebaseKey, 'pedido', editText); setEditingId(null); }}>Guardar</button>
                        <button onClick={() => setEditingId(null)} style={{ marginLeft: 10 }}>Cancelar</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <pre style={{ whiteSpace: 'pre-wrap', marginTop: 5, ...textStyle }}>{pedido}</pre>
                      <button onClick={() => { setEditingId(firebaseKey); setEditText(pedido); }} style={{ marginTop: 5 }}>✏️ Editar</button>
                    </>
                  )}
                </div>

                {estado === 'Pendiente' && (
                  <div style={{ marginTop: 8 }}>
                    <label>Seleccionar cocinero:</label>
                    <select onChange={(e) => handleSelectCocinero(firebaseKey, e.target.value)} defaultValue="">
                      <option value="" disabled>Seleccionar...</option>
                      {cocineros.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                )}
                {estado === 'En preparación' && (
                  <div style={{ marginTop: 10 }}>
                    <strong>Cocinero: {cocinero}</strong>
                    <button onClick={() => marcarPreparado(firebaseKey)} style={{ marginLeft: 10 }}>✅ Marcar como Preparado</button>
                  </div>
                )}
                <div style={{ marginTop: 10 }}>
                  {estado !== 'Cancelado' && (
                    <button
                      onClick={() => updateCampo(firebaseKey, 'estado', 'Cancelado')}
                      style={{ backgroundColor: '#dc3545', color: 'white', padding: '4px 10px', borderRadius: 4, border: 'none' }}
                    >
                      ❌ Cancelar
                    </button>
                  )}
                  {estado === 'Cancelado' && (
                    <button
                      onClick={() => updateCampo(firebaseKey, 'estado', 'Pendiente')}
                      style={{ backgroundColor: '#007bff', color: 'white', padding: '4px 10px', borderRadius: 4, border: 'none' }}
                    >
                      ↩️ Deshacer cancelación
                    </button>
                  )}
                </div>

              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/******************** EXPORTAR A EXCEL ********************/
function exportarAExcel(pedidos) {
  const rows = pedidos
    .filter(p => p.estado !== 'Cancelado')
    .map(p => [
      p.fecha,
      p.id,
      p.cliente,
      p.clienteCodigo || '-',
      p.direccion || '-',
      p.pedido.replace(/\n/g, ' '),
      p.estado,
      p.timestampIngreso || '-',
      p.timestampPreparacion || '-',
      p.timestampPreparado || '-',
      p.timestampEnviado || '-',
      p.cocinero || '-',
      p.repartidor || '-'
    ]);

  const header = [
    'Fecha', '#', 'Cliente', 'Código Cliente', 'Dirección', 'Pedido', 'Estado',
    'Ingreso', 'Preparación', 'Preparado', 'Enviado',
    'Cocinero', 'Repartidor'
  ];

  let htmlContent = '<table border="1"><tr>' + header.map(col => `<th>${col}</th>`).join('') + '</tr>';

  rows.forEach(r => {
    htmlContent += '<tr>' + r.map(val => `<td>${val}</td>`).join('') + '</tr>';
  });
  htmlContent += '</table>';

  const blob = new Blob([htmlContent], { type: 'application/vnd.ms-excel' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'historial_pedidos.xls';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/******************** ANTERIORES ********************/
function Anteriores({ pedidos }) {
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');

  const pedidosFiltrados = pedidos
    .filter(p => p.estado !== 'Cancelado')
    .filter(p => {
      if (!fechaInicio && !fechaFin) return true;
      const fechaPedido = new Date(p.fecha);
      const inicio = fechaInicio ? new Date(fechaInicio) : null;
      const fin = fechaFin ? new Date(fechaFin) : null;
      return (!inicio || fechaPedido >= inicio) && (!fin || fechaPedido <= fin);
    });

  return (
    <div style={{ padding: 20 }}>
      <h2>Pedidos Anteriores</h2>

      <div style={{ marginBottom: 10 }}>
        <label>Desde:</label>
        <input
          type="date"
          value={fechaInicio}
          onChange={(e) => setFechaInicio(e.target.value)}
          style={{ margin: '0 10px', padding: 5 }}
        />
        <label>Hasta:</label>
        <input
          type="date"
          value={fechaFin}
          onChange={(e) => setFechaFin(e.target.value)}
          style={{ margin: '0 10px', padding: 5 }}
        />
        <button
          onClick={() => exportarAExcel(pedidosFiltrados)}
          style={{ marginLeft: 20, padding: '6px 12px', fontSize: '14px' }}
        >
          Descargar como Excel
        </button>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }} border="1">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>#</th>
            <th>Cliente</th>
            <th>Código</th>
            <th>Dirección</th>
            <th>Pedido</th>
            <th>Estado</th>
            <th>Ingreso</th>
            <th>Preparación</th>
            <th>Preparado</th>
            <th>Enviado</th>
            <th>Cocinero</th>
            <th>Repartidor</th>
          </tr>
        </thead>
        <tbody>
          {pedidosFiltrados.map(({ id, cliente, clienteCodigo, direccion, pedido, estado, cocinero, repartidor, timestampIngreso, timestampPreparacion, timestampPreparado, timestampEnviado, fecha }) => (
            <tr key={`${fecha}-${id}`}>
              <td>{fecha}</td>
              <td>{id}</td>
              <td>{cliente}</td>
              <td>{clienteCodigo || '-'}</td>
              <td>{direccion || '-'}</td>
              <td style={{ whiteSpace: 'pre-wrap' }}>{pedido}</td>
              <td>{estado}</td>
              <td>{timestampIngreso || '-'}</td>
              <td>{timestampPreparacion || '-'}</td>
              <td>{timestampPreparado || '-'}</td>
              <td>{timestampEnviado || '-'}</td>
              <td>{cocinero || '-'}</td>
              <td>{repartidor || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/******************** CLIENTES: CARGA MASIVA + EDICIÓN ********************/
function ClientesManager({ clientes }) {
  const [editBuffer, setEditBuffer] = useState({}); // {firebaseKey: {nombre, codigo, direccion}}
  const [uploading, setUploading] = useState(false);
const [csvFile, setCsvFile] = useState(null);
const stripBOM = (s = '') => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
const normalize = (s = '') => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

const splitLine = (line, delim) => {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === delim && !inQuotes) { out.push(cur); cur = ''; }
    else { cur += ch; }
  }
  out.push(cur);
  return out.map(s => s.trim());
};

const cargarCSV = async () => {
  if (!csvFile) { alert('Primero seleccioná un archivo CSV.'); return; }
  setUploading(true);
  try {
    const textRaw = await csvFile.text();
    const text = stripBOM(textRaw);
    const lines = text.split(/\r\n|\n|\r/).filter(l => l.trim().length > 0);
    if (!lines.length) { alert('El archivo está vacío.'); return; }

    // Detectar delimitador en la primera línea
    const first = lines[0];
    const delim = ((first.match(/;/g) || []).length > (first.match(/,/g) || []).length) ? ';' : ',';

    // Mapear encabezados
    const header = splitLine(first, delim).map(h => normalize(h));
    const idxNombre = header.findIndex(h => ['nombre','cliente','cliente nombre','nombre cliente','razon social','razon','name'].some(k => h.includes(k)));
    const idxCodigo = header.findIndex(h => ['codigo','código','cod','id','codigo cliente','código cliente','client code'].some(k => h.includes(k)));
    const idxDireccion = header.findIndex(h => ['direccion','dirección','domicilio','direccion cliente','address','addr'].some(k => h.includes(k)));

    let start = 1;
    let map = { nombre: 0, codigo: 1, direccion: 2 };
    const hasHeader = idxNombre !== -1 || idxCodigo !== -1 || idxDireccion !== -1;
    if (hasHeader) {
      if (idxNombre !== -1) map.nombre = idxNombre;
      if (idxCodigo !== -1) map.codigo = idxCodigo;
      if (idxDireccion !== -1) map.direccion = idxDireccion;
    } else {
      start = 0; // sin encabezado → primeras 3 columnas
    }

    let ok = 0;
    for (let i = start; i < lines.length; i++) {
      const parts = splitLine(lines[i]).map(s => s.replace(/^"|"$/g, ''));
      const nombre = (parts[map.nombre] || '').trim();
      const codigo = (parts[map.codigo] || '').trim();
      const direccion = (parts[map.direccion] || '').trim();
      if (!nombre || !codigo || !direccion) continue;

      try {
        const nuevoRef = push(ref(database, 'clients'));
        await set(nuevoRef, { nombre, codigo, direccion });
        ok++;
      } catch (innerErr) {
        console.error('Error en fila', i + 1, innerErr);
      }
    }

    alert(`Carga masiva completada: ${ok} clientes agregados.`);
    setCsvFile(null);
  } catch (err) {
    console.error('Error leyendo CSV:', err);
    alert('Error leyendo CSV: ' + (err?.message || err));
  } finally {
    setUploading(false);
  }
};



  const onFile = async (file) => {
    const text = await file.text();
    // CSV esperado (con o sin encabezado): nombre,codigo,direccion
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    // Detectar encabezado
    const startIdx = lines[0].toLowerCase().includes('codigo') ? 1 : 0;
    for (let i = startIdx; i < lines.length; i++) {
      const parts = lines[i].split(',');
      const [nombre = '', codigo = '', direccion = ''] = parts.map(p => p.trim());
      if (!nombre || !codigo || !direccion) continue;
      const nuevoRef = push(ref(database, 'clients'));
      await set(nuevoRef, { nombre, codigo, direccion });
    }
    alert('Carga masiva completada');
  };

  const handleChange = (key, field, value) => {
    setEditBuffer(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  };

  const handleSave = async (c) => {
    const payload = editBuffer[c.firebaseKey] || { nombre: c.nombre, codigo: c.codigo, direccion: c.direccion };
    await update(ref(database, `clients/${c.firebaseKey}`), payload);
    setEditBuffer(prev => { const cp = { ...prev }; delete cp[c.firebaseKey]; return cp; });
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>Clientes</h2>
      <p>Subí un CSV (nombre,codigo,direccion). Elegí archivo y luego hacé clic en “Cargar CSV”.</p>
<input
  type="file"
  accept=".csv,text/csv,.txt"
  onChange={(e) => setCsvFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)}
/>
<button type="button" onClick={cargarCSV} disabled={uploading || !csvFile} style={{ marginLeft: 8 }}>
  {uploading ? 'Cargando…' : 'Cargar CSV'}
</button>


      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, marginTop: 12 }} border="1">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Código</th>
            <th>Dirección</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {clientes.map(c => {
            const buf = editBuffer[c.firebaseKey] || {};
            return (
              <tr key={c.firebaseKey}>
                <td>
                  <input
                    defaultValue={c.nombre}
                    onChange={(e) => handleChange(c.firebaseKey, 'nombre', e.target.value)}
                  />
                </td>
                <td>
                  <input
                    defaultValue={c.codigo}
                    onChange={(e) => handleChange(c.firebaseKey, 'codigo', e.target.value)}
                  />
                </td>
                <td>
                  <input
                    defaultValue={c.direccion}
                    onChange={(e) => handleChange(c.firebaseKey, 'direccion', e.target.value)}
                    style={{ width: '100%' }}
                  />
                </td>
                <td>
                  <button onClick={() => handleSave(c)}>Guardar</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/******************** APP ********************/
function App() {
  const [orders, setOrders] = useState([]);
  const [anteriores, setAnteriores] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [view, setView] = useState('ingreso');

  // Cargar pedidos
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const ordersRef = ref(database, 'orders');
    onValue(ordersRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const grouped = Object.entries(data).reduce((acc, [key, val]) => {
          const fecha = val.fecha;
          if (!acc[fecha]) acc[fecha] = [];
          acc[fecha].push({ firebaseKey: key, ...val });
          return acc;
        }, {});

        const pedidosHoy = (grouped[today] || []).sort((a, b) => a.id - b.id);
        const prev = Object.entries(grouped)
          .filter(([fecha]) => fecha !== today)
          .flatMap(([fecha, arr]) => arr.map((p, idx) => ({ ...p, fecha, id: p.id || idx + 1 })));

        setOrders(pedidosHoy);
        setAnteriores(prev);
      } else {
        setOrders([]);
        setAnteriores([]);
      }
    });
  }, []);

  // Cargar clientes
  useEffect(() => {
    const clientsRef = ref(database, 'clients');
    onValue(clientsRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) { setClientes([]); return; }
      const arr = Object.entries(data).map(([key, val]) => ({ firebaseKey: key, ...val }));
      // ordenar por nombre
      arr.sort((a, b) => a.nombre.localeCompare(b.nombre));
      setClientes(arr);
    });
  }, []);

  const getNextOrderId = () => {
    const maxId = orders.reduce((max, o) => Math.max(max, o.id || 0), 0) || 0;
    return maxId + 1;
  };

  const addOrder = ({ cliente, clienteCodigo, direccion, pedido, fecha, hora, id }) => {
    const timestamp = new Date().toLocaleTimeString();
    push(ref(database, 'orders'), {
      cliente,
      clienteCodigo,
      direccion,
      pedido,
      estado: 'Pendiente',
      fecha,
      id,
      timestampIngreso: timestamp,
      justAdded: true
    });
  };

  const handleEnviarPedido = (orderId, repartidor) => {
    const order = orders.find(o => o.id === orderId);
    if (order) {
      update(ref(database, `orders/${order.firebaseKey}`), {
        estado: 'Enviado',
        repartidor,
        timestampEnviado: new Date().toLocaleTimeString()
      });
    }
  };

  return (
    <div style={{ maxWidth: 1000, margin: '20px auto', padding: 20, fontFamily: 'Arial, sans-serif', backgroundColor: '#f0f8ff', borderRadius: 10 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src={logo} alt="Logo" style={{ width: 50, height: 50 }} />
          <h1 style={{ fontSize: '24px', fontWeight: 'bold' }}>Servicio Delivery</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setView('ingreso')} disabled={view === 'ingreso'}>Ingresar</button>
          <button onClick={() => setView('cocina')} disabled={view === 'cocina'}>Cocina</button>
          <button onClick={() => setView('lista')} disabled={view === 'lista'}>Lista de pedidos</button>
          <button onClick={() => setView('anteriores')} disabled={view === 'anteriores'}>Anteriores</button>
          <button onClick={() => setView('clientes')} disabled={view === 'clientes'}>Clientes</button>
        </div>
      </header>

      {view === 'ingreso' && <OrderForm onAddOrder={addOrder} nextOrderId={getNextOrderId()} clientes={clientes} />}
      {view === 'cocina' && <KitchenView orders={orders} />}
      {view === 'lista' && <ListaPedidos pedidos={orders} onEnviarPedido={handleEnviarPedido} />}
      {view === 'anteriores' && <Anteriores pedidos={anteriores} />}
      {view === 'clientes' && <ClientesManager clientes={clientes} />}

    </div>
  );
}

export default App;
