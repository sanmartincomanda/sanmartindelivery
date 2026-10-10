import { auth } from '../firebase.js';

const origin = String(import.meta.env.VITE_ROUTE_API_ORIGIN || 'https://tienda.sanmartinsr.com').replace(/\/$/, '');
export const requestRouteAction = async (action, payload = {}) => {
  if (!auth.currentUser) throw new Error('Inicia sesion para continuar.');
  const token = await auth.currentUser.getIdToken();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(`${origin}/.netlify/functions/route-san-martin`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, action }),
      signal: controller.signal,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(result.error || 'No se pudo consultar Ruta San Martin. Intenta nuevamente.'), { code: result.code });
    return result;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Ruta tardo en responder. Revisa tu conexion e intenta nuevamente.');
    throw error;
  } finally { clearTimeout(timeout); }
};
