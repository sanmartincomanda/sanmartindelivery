import React from 'react';
import './StoreLegalPage.css';
import {
  STORE_ACCOUNT_DELETION_URL,
  STORE_SUPPORT_EMAIL,
} from '../services/storeLegal';

const LOGO_PATH = '/tienda/branding/logo-mark.svg';

export default function PrivacyPolicyView() {
  return (
    <main className="store-legal-page">
      <div className="store-legal-shell">
        <header className="store-legal-header">
          <img className="store-legal-logo" src={LOGO_PATH} alt="Carnes San Martin" />
          <div>
            <h1>Politica de privacidad</h1>
            <p>Carnes San Martin · Aplicacion de tienda y delivery</p>
          </div>
        </header>

        <article className="store-legal-card">
          <p><strong>Ultima actualizacion:</strong> 3 de agosto de 2026.</p>
          <p>
            Carnes San Martin respeta tu privacidad. Esta politica explica que informacion usamos al
            navegar, crear una cuenta, hacer pedidos, elegir una sucursal y participar en Miembro Gold.
          </p>

          <h2>Informacion que recopilamos</h2>
          <ul>
            <li>Nombre, correo electronico, telefono e identificadores de cuenta.</li>
            <li>Direccion, referencia y ubicacion precisa elegida para calcular cobertura y entrega.</li>
            <li>Pedidos, productos, montos, sucursal, cupones, puntos y recompensas.</li>
            <li>Metodo de pago seleccionado. No almacenamos numeros completos de tarjetas.</li>
            <li>Datos tecnicos necesarios para autenticacion, seguridad y funcionamiento de la app.</li>
          </ul>

          <h2>Como usamos la informacion</h2>
          <ul>
            <li>Crear y proteger tu cuenta.</li>
            <li>Mostrar la sucursal disponible y calcular el servicio a domicilio.</li>
            <li>Preparar, actualizar, entregar y dar seguimiento a tus pedidos.</li>
            <li>Administrar cupones, promociones, puntos y canjes.</li>
            <li>Atender consultas, prevenir fraude y mejorar la estabilidad del servicio.</li>
          </ul>

          <h2>Con quien se comparte</h2>
          <p>
            Compartimos solo lo necesario con personal autorizado de la sucursal, cocina y entregadores
            asignados. Utilizamos proveedores como Google Firebase, Google Maps y sistemas operativos de
            facturacion y pedidos. No vendemos tu informacion personal.
          </p>

          <h2>Ubicacion</h2>
          <p>
            La ubicacion se solicita mientras usas la app para seleccionar una tienda cercana, validar la
            cobertura y entregar el pedido. No solicitamos ubicacion en segundo plano. Puedes rechazar el
            permiso, aunque algunas funciones de delivery no estaran disponibles.
          </p>

          <h2>Seguridad y conservacion</h2>
          <p>
            Protegemos la informacion durante su transmision mediante HTTPS y aplicamos controles de acceso.
            Conservamos el perfil mientras la cuenta permanezca activa. Al solicitar eliminacion, procesaremos
            la solicitud en un plazo de hasta 30 dias. Algunos comprobantes o datos de pedidos pueden conservarse
            cuando exista una obligacion legal, contable, de seguridad o prevencion de fraude; en esos casos se
            limita su uso y se elimina o anonimiza cuando deja de ser necesario.
          </p>

          <h2>Eliminacion de cuenta</h2>
          <p>
            Puedes solicitarla desde <strong>Mi perfil</strong> dentro de la app o mediante nuestra pagina
            publica de eliminacion. La eliminacion incluye el perfil y los datos asociados que no debamos
            conservar legalmente.
          </p>
          <div className="store-legal-actions">
            <a className="store-legal-button" href={STORE_ACCOUNT_DELETION_URL}>Solicitar eliminacion</a>
            <a className="store-legal-button secondary" href={`mailto:${STORE_SUPPORT_EMAIL}`}>Contactar soporte</a>
          </div>

          <h2>Menores de edad</h2>
          <p>
            La aplicacion no esta dirigida especificamente a menores de 13 anos. Las compras y entregas deben
            realizarse con supervision de una persona adulta cuando corresponda.
          </p>

          <h2>Contacto</h2>
          <p>
            Para consultas sobre privacidad escribe a{' '}
            <a href={`mailto:${STORE_SUPPORT_EMAIL}`}>{STORE_SUPPORT_EMAIL}</a>.
          </p>
        </article>

        <footer className="store-legal-footer">Carnes San Martin · Nicaragua</footer>
      </div>
    </main>
  );
}
