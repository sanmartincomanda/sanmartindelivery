// src/PedidosRuta.jsx
import React, { useEffect, useMemo, useState } from "react";
import { ref, push, onValue, update, remove, runTransaction } from "firebase/database";
import { database } from "./firebase";

/******************** UTIL ********************/

const normalizar = (s = "") =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function safeStr(v) {
  return typeof v === "string" ? v : (v ?? "").toString();
}

/******************** PEDIDOS RUTA ********************/
export default function PedidosRuta({ clientes = [] }) {

  const [fechaPedido, setFechaPedido] = useState(hoyISO());
  // ====== Pedidos Ruta (separado de orders) ======
  const [rutaOrders, setRutaOrders] = useState([]);

  // ====== Form (cliente buscable) ======
  const [clienteQuery, setClienteQuery] = useState("");
  const [selectedClientKey, setSelectedClientKey] = useState("");
  const [selectedClient, setSelectedClient] = useState(null);

  const [pedido, setPedido] = useState("");
  const [ruta, setRuta] = useState("Ruta 1"); // Ruta 1 | Ruta 2 | Sin ruta

  // ====== Cargar pedidos de ruta (solo hoy) ======
  useEffect(() => {
    const today = hoyISO();
    const rutaRef = ref(database, "rutaOrders");

    return onValue(
      rutaRef,
      (snapshot) => {
        const data = snapshot.val();
        if (!data) {
          setRutaOrders([]);
          return;
        }

        const arr = Object.entries(data)
          .map(([key, val]) => ({ firebaseKey: key, ...val }))
          .filter((p) => p.fecha === today)
          .sort(
            (a, b) =>
              Number(a.ordenRuta || 0) - Number(b.ordenRuta || 0) ||
              Number(a.id || 0) - Number(b.id || 0)
          );

        setRutaOrders(arr);
      },
      (error) => {
        console.error("Error leyendo rutaOrders:", error);
        alert("Error leyendo rutaOrders: " + (error?.code || error?.message || String(error)));
      }
    );
  }, []);

  // ====== Filtrar clientes (para no renderizar 3800 options) ======
  const clientesFiltrados = useMemo(() => {
    if (!clientes || clientes.length === 0) return [];
    const q = normalizar(clienteQuery);

    let arr = clientes;
    if (q) {
      arr = clientes.filter((c) => {
        const blob = normalizar(
          `${safeStr(c.nombre)} ${safeStr(c.codigo)} ${safeStr(c.direccion)}`
        );
        return blob.includes(q);
      });
    } else {
      // Muestra pequeña si no busca
      arr = clientes.slice(0, 60);
    }

    return arr.slice(0, 200);
  }, [clientes, clienteQuery]);

  // ====== Sincronizar selectedClient ======
  useEffect(() => {
    if (!selectedClientKey) {
      setSelectedClient(null);
      return;
    }
    const c = (clientes || []).find((x) => x.firebaseKey === selectedClientKey) || null;
    setSelectedClient(c);
  }, [selectedClientKey, clientes]);

  // ====== Next ordenRuta por ruta (solo hoy) ======
  const nextOrdenRuta = useMemo(() => {
    if (ruta === "Sin ruta") return 0;
    const max = rutaOrders
      .filter((o) => (o.ruta || "Sin ruta") === ruta)
      .reduce((m, o) => Math.max(m, Number(o.ordenRuta || 0)), 0);
    return max + 1;
  }, [rutaOrders, ruta]);

  const resetForm = () => {
    setClienteQuery("");
    setSelectedClientKey("");
    setSelectedClient(null);
    setPedido("");
    setRuta("Ruta 1");
  };

  // ====== Crear pedido de ruta con ID diario por contador (NO se repite aunque borres) ======
  const crearPedidoRuta = async (e) => {
    e.preventDefault();

    if (!clientes || clientes.length === 0) {
      alert("Todavía están cargando los clientes. Esperá un momento.");
      return;
    }
    if (!selectedClient) {
      alert("Seleccioná un cliente de la lista.");
      return;
    }
    if (!pedido.trim()) return;

    const fecha = fechaPedido || hoyISO();
    const hora = new Date().toLocaleTimeString();

    // contador diario
  const counterRef = ref(database, `rutaCounters/${fecha}`);
const tx = await runTransaction(counterRef, (current) => (current || 0) + 1);
const idDiario = tx.snapshot.val();


    const payload = {
      id: idDiario, // ID del día
      fecha,
      hora,
      estado: "Pendiente",
      cocinero: "", // cocina lo asigna
      cliente: safeStr(selectedClient.nombre),
      clienteCodigo: safeStr(selectedClient.codigo) || "-",
      direccion: safeStr(selectedClient.direccion) || "-",
      pedido: pedido.trim(),
      ruta, // Ruta 1 | Ruta 2 | Sin ruta
      ordenRuta: ruta === "Sin ruta" ? 0 : nextOrdenRuta,
      rutaNotas: "",
      timestampIngreso: hora,
    };

    await push(ref(database, "rutaOrders"), payload);
    resetForm();
  };

  // ====== Update helper ======
  const setCampo = (firebaseKey, payload) => {
    if (!firebaseKey) return;
    update(ref(database, `rutaOrders/${firebaseKey}`), payload);
  };

  // ====== Borrar pedido ======
  const borrarPedidoRuta = async (p) => {
    const ok = window.confirm(`¿Borrar pedido de ruta #${p.id}? Esto no se puede deshacer.`);
    if (!ok) return;
    await remove(ref(database, `rutaOrders/${p.firebaseKey}`));
  };

  // ====== Swap orden dentro de la misma ruta ======
  const cambiarOrden = async (p, delta) => {
    const r = p.ruta || "Sin ruta";
    if (r === "Sin ruta") return;

    const lista = [...rutaOrders]
      .filter((x) => (x.ruta || "Sin ruta") === r)
      .sort(
        (a, b) =>
          Number(a.ordenRuta || 0) - Number(b.ordenRuta || 0) ||
          Number(a.id || 0) - Number(b.id || 0)
      );

    const idx = lista.findIndex((x) => x.firebaseKey === p.firebaseKey);
    if (idx === -1) return;

    const j = idx + delta;
    if (j < 0 || j >= lista.length) return;

    const a = lista[idx];
    const b = lista[j];
    const oa = Number(a.ordenRuta || 0);
    const ob = Number(b.ordenRuta || 0);

    await Promise.all([
      update(ref(database, `rutaOrders/${a.firebaseKey}`), { ordenRuta: ob }),
      update(ref(database, `rutaOrders/${b.firebaseKey}`), { ordenRuta: oa }),
    ]);
  };

  // ====== Paneles ======
  const porRuta1 = rutaOrders.filter((p) => (p.ruta || "Sin ruta") === "Ruta 1");
  const porRuta2 = rutaOrders.filter((p) => (p.ruta || "Sin ruta") === "Ruta 2");
  const sinRuta = rutaOrders.filter((p) => (p.ruta || "Sin ruta") === "Sin ruta");

  return (
    <div style={{ padding: 20 }}>
      <h2>Pedidos Ruta</h2>

      {/* FORM */}
      <form
        onSubmit={crearPedidoRuta}
        style={{
          marginBottom: 18,
          background: "white",
          padding: 12,
          borderRadius: 10,
          border: "1px solid #ddd",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 220px", gap: 10 }}>
          {/* CLIENTE BUSCABLE */}
          <div>
            <label>Cliente (escribí para buscar)</label>
            <input
              value={clienteQuery}
              onChange={(e) => {
                setClienteQuery(e.target.value);
                setSelectedClientKey("");
                setSelectedClient(null);
              }}
              placeholder="Nombre / código / dirección"
              style={{ width: "100%", padding: 8, marginBottom: 8 }}
            />

            <select
              value={selectedClientKey}
              onChange={(e) => setSelectedClientKey(e.target.value)}
              style={{ width: "100%", padding: 8 }}
              size={8}
              disabled={!clientes || clientes.length === 0}
              required
            >
              {!clientes || clientes.length === 0 ? (
                <option value="">Cargando clientes…</option>
              ) : clientesFiltrados.length === 0 ? (
                <option value="">Sin resultados</option>
              ) : (
                <>
                  <option value="" disabled>
                    Seleccioná un cliente…
                  </option>
                  {clientesFiltrados.map((c) => (
                    <option key={c.firebaseKey} value={c.firebaseKey}>
                      {safeStr(c.nombre)} — {safeStr(c.codigo)} — {safeStr(c.direccion)}
                    </option>
                  ))}
                </>
              )}
            </select>

            {!!clientes?.length && (
              <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
                Mostrando {clientesFiltrados.length} de {clientes.length} clientes
              </div>
            )}

            {selectedClient && (
              <div style={{ fontSize: 12, marginTop: 6 }}>
                <strong>Seleccionado:</strong> {safeStr(selectedClient.nombre)} ·{" "}
                <strong>Dir:</strong> {safeStr(selectedClient.direccion)}
              </div>
            )}
          </div>

          {/* RUTA */}
          <div>
            <label>Ruta</label>
            <select
              value={ruta}
              onChange={(e) => setRuta(e.target.value)}
              style={{ width: "100%", padding: 8 }}
            >
              <option>Ruta 1</option>
              <option>Ruta 2</option>
              <option>Sin ruta</option>
            </select>
            <div>
  <label>Fecha del pedido</label>
  <input
    type="date"
    value={fechaPedido}
    onChange={(e) => setFechaPedido(e.target.value)}
    style={{ width: "100%", padding: 8 }}
  />
</div>

            <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
              ID del día (auto): se asigna al guardar ·{" "}
              {ruta === "Sin ruta" ? (
                <>Orden: <strong>0</strong></>
              ) : (
                <>Próximo orden en {ruta}: <strong>{nextOrdenRuta}</strong></>
              )}
              </div>
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
          <label>Pedido</label>
          <textarea
            rows={4}
            value={pedido}
            onChange={(e) => setPedido(e.target.value)}
            style={{ width: "100%", padding: 8, resize: "vertical" }}
            placeholder="Pedido de ruta..."
            required
          />
        </div>
        

        <button type="submit" style={{ marginTop: 10, padding: "10px 16px" }}>
          Agregar Pedido Ruta
        </button>
      </form>

      {/* LISTAS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        <RutaPanel
          titulo="Ruta 1"
          pedidos={porRuta1}
          sinOrden={false}
          onMover={(p, d) => cambiarOrden(p, d)}
          onSetCampo={setCampo}
          onBorrar={borrarPedidoRuta}
        />
        <RutaPanel
          titulo="Ruta 2"
          pedidos={porRuta2}
          sinOrden={false}
          onMover={(p, d) => cambiarOrden(p, d)}
          onSetCampo={setCampo}
          onBorrar={borrarPedidoRuta}
        />
        <RutaPanel
          titulo="Sin ruta"
          pedidos={sinRuta}
          sinOrden={true}
          onMover={() => {}}
          onSetCampo={setCampo}
          onBorrar={borrarPedidoRuta}
        />
      </div>
    </div>
  );
}

/******************** PANEL ********************/
function RutaPanel({ titulo, pedidos, onSetCampo, onMover, onBorrar, sinOrden }) {
  const ordenados = [...pedidos].sort(
    (a, b) =>
      Number(a.ordenRuta || 0) - Number(b.ordenRuta || 0) ||
      Number(a.id || 0) - Number(b.id || 0)
  );

  return (
    <div style={{ background: "white", border: "1px solid #ddd", borderRadius: 10, padding: 12 }}>
      <h3 style={{ marginTop: 0 }}>
        {titulo} <span style={{ fontWeight: 400 }}>({ordenados.length})</span>
      </h3>

      {ordenados.length === 0 ? (
        <div style={{ color: "#666" }}>Sin pedidos.</div>
      ) : (
        ordenados.map((p) => (
          <div key={p.firebaseKey} style={{ border: "1px solid #eee", borderRadius: 10, padding: 10, marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontWeight: 700 }}>#{p.id} — {p.cliente}</div>
                <div style={{ fontSize: 13 }}><strong>Dirección:</strong> {p.direccion || "-"}</div>
                <div style={{ fontSize: 13 }}>
                  <strong>Estado:</strong> {p.estado || "Pendiente"}
                  {" · "}
                  <strong>Ruta:</strong> {p.ruta || "Sin ruta"}
                  {!sinOrden && (
                    <>
                      {" · "}
                      <strong>Orden:</strong> {Number(p.ordenRuta || 0)}
                    </>
                  )}
                </div>
              </div>

              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                {!sinOrden && (
                  <>
                    <button type="button" onClick={() => onMover(p, -1)}>↑</button>
                    <button type="button" onClick={() => onMover(p, +1)}>↓</button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => onBorrar(p)}
                  style={{ background: "#ffe5e5", border: "1px solid #ffb3b3" }}
                >
                  Borrar
                </button>
              <button type="button" onClick={() => borrarOrdenPedido(p)}>
  🧹 Borrar orden
</button>
              </div>
            </div>

            <div style={{ marginTop: 8 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Pedido</div>
              <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{p.pedido}</pre>
            </div>

            <div style={{ marginTop: 8 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Notas Ruta</div>
              <textarea
                rows={2}
                defaultValue={p.rutaNotas || ""}
                onBlur={(e) => onSetCampo(p.firebaseKey, { rutaNotas: e.target.value })}
                placeholder="Ej: llamar antes, cobrar C$, etc."
                style={{ width: "100%", resize: "vertical" }}
              />
            </div>

            <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <label style={{ fontSize: 13 }}>Mover a:</label>
              <select
                value={p.ruta || "Sin ruta"}
                onChange={(e) => {
                  const newRuta = e.target.value;
                  onSetCampo(p.firebaseKey, {
                    ruta: newRuta,
                    ordenRuta: newRuta === "Sin ruta" ? 0 : (Number(p.ordenRuta || 1) || 1),
                  });
                }}
              >
                <option>Ruta 1</option>
                <option>Ruta 2</option>
                <option>Sin ruta</option>
              </select>

              {!sinOrden && (
                <>
                  <label style={{ fontSize: 13 }}>Orden</label>
                  <input
                    type="number"
                    value={Number(p.ordenRuta || 0)}
                    onChange={(e) => onSetCampo(p.firebaseKey, { ordenRuta: Number(e.target.value || 0) })}
                    style={{ width: 80 }}
                  />
                </>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
