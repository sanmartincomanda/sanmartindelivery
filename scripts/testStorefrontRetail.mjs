import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// npm run dev -- --host 127.0.0.1 --port 5178 must be running.
// PLAYWRIGHT_MODULE_PATH can point to an existing Playwright installation.
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const origin = process.env.STOREFRONT_QA_URL || 'http://127.0.0.1:5178';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) throw new Error('QA mutations are restricted to localhost fixtures.');
const out = path.resolve('output/playwright/storefront-2026');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await context.newPage();
page.setDefaultTimeout(10000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const results = [];
let baseCss = '';
async function shot(name) {
  await Promise.race([visibleImages(), new Promise((resolve) => setTimeout(resolve, 5000))]);
  await page.waitForTimeout(280);
  await page.screenshot({ path: path.join(out, `${name}.png`), scale: 'css', animations: 'disabled' });
}
async function visibleImages() {
  await page.locator('img').evaluateAll((images) => Promise.all(images.filter((img) => {
    const box = img.getBoundingClientRect();
    return box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth;
  }).map((img) => img.decode().catch(() => {}))));
}
async function test(name, fn) {
  try { await fn(); results.push({ name, result: 'PASS' }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, result: 'FAIL', message: error.message }); console.error(`FAIL ${name}: ${error.message}`); await shot(`failure-${results.length}`).catch(() => {}); }
  finally { await context.setOffline(false); }
}
async function fit() {
  const size = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
  assert.ok(size.scroll <= size.width + 1, `Horizontal overflow: ${JSON.stringify(size)}`);
}
async function openFixture(query = '') {
  await page.goto(`${origin}/tests/storefront/${query}`);
  await page.locator('.storefront-retail').waitFor();
  if (baseCss) await page.addStyleTag({ content: baseCss });
}
async function title(text) { await page.getByRole('heading', { name: text, exact: true }).waitFor(); }
async function next() { await page.getByRole('button', { name: 'Continuar', exact: true }).click(); }
async function toReview({ mode, query = '', coupon = false } = {}) {
  await openFixture(query); await next();
  if (mode) await page.getByRole('button', { name: mode, exact: true }).click();
  await next(); await next();
  if (mode === 'Ruta San Martín') { await page.locator('[aria-label="Franja de entrega de Ruta San Martin"] button').first().click(); await next(); }
  await title('Método de pago'); await next();
  if (coupon) { await page.getByRole('textbox', { name: 'Código promocional' }).fill('QA10'); await page.getByRole('button', { name: 'Aplicar', exact: true }).click(); }
  await next(); await title('Revisá tu pedido');
}

await test('Inicio: cuatro selecciones, fotografía temprana, nombres, navegación y sin overflow', async () => {
  await page.goto(`${origin}/granada`);
  await page.locator('.retail-product').first().waitFor({ timeout: 25000 });
  baseCss = await page.locator('.store-shell > style').innerText();
  assert.ok(await page.locator('.store-product-group').count() <= 4);
  const box = await page.locator('.retail-product-photo').first().boundingBox();
  assert.ok(box.y < 450, `First product starts at ${box.y}`);
  await page.locator('.retail-product img').first().evaluate((img) => img.decode().catch(() => {}));
  await fit(); await shot('after-home-390');
});
await test('Categorías: todas abren productos sin pantalla intermedia y vuelven', async () => {
  await page.getByRole('button', { name: 'Categorías', exact: true }).click();
  const count = await page.locator('.retail-category-grid > button').count();
  assert.ok(count >= 8);
  for (let i = 0; i < count; i++) {
    await page.locator('.retail-category-grid > button').nth(i).click();
    await page.locator('.retail-catalog-heading').waitFor();
    assert.ok(await page.locator('.retail-product').count() > 0);
    await page.getByRole('button', { name: 'Categorías', exact: true }).click();
  }
  await shot('after-categories-390');
});
await test('Categoría, producto, cantidad, regreso, scroll y carrito persistente', async () => {
  await page.locator('.retail-category-grid button').filter({ hasText: /^Res/ }).click();
  await page.locator('.retail-product').first().waitFor();
  await page.locator('.retail-product').nth(3).scrollIntoViewIfNeeded();
  const beforeScroll = await page.evaluate(() => scrollY);
  const product = page.locator('.retail-product').nth(3);
  const name = await product.locator('.retail-product-name').innerText();
  await product.getByRole('button', { name: `Ver ${name}`, exact: true }).click();
  await page.locator('.store-product-sheet').waitFor();
  await page.getByRole('button', { name: `Aumentar cantidad de ${name}`, exact: true }).click();
  await shot('after-product-390');
  await page.getByRole('button', { name: /^Agregar al carrito/ }).click();
  await page.locator('.store-product-sheet').waitFor({ state: 'detached' });
  await page.waitForTimeout(150);
  assert.ok(Math.abs(await page.evaluate(() => scrollY) - beforeScroll) < 100, 'Scroll was not restored');
  assert.ok(await page.getByRole('button', { name: `Reducir ${name}`, exact: true }).isVisible());
  await page.getByRole('button', { name: 'Abrir carrito', exact: true }).click();
  await title('Tu carrito'); await shot('after-cart-390');
  await next(); await title('Cómo lo recibís');
  await page.getByRole('button', { name: 'Retiro en tienda', exact: true }).click();
  await next(); await title('Retiro en tienda');
  assert.ok(await page.getByRole('button', { name: 'Crear cuenta', exact: true }).isVisible());
  await page.locator('.retail-checkout-screen').getByRole('button', { name: 'Atrás', exact: true }).click();
  await title('Cómo lo recibís');
  assert.equal(await page.getByRole('button', { name: 'Retiro en tienda', exact: true }).getAttribute('aria-pressed'), 'true');
});
await test('Buscar, resultado vacío, limpiar y volver del producto conserva consulta', async () => {
  await page.goto(`${origin}/granada`); await page.locator('.retail-product').first().waitFor();
  const search = page.getByRole('searchbox', { name: 'Buscar carnes, cortes y productos' });
  await search.fill('zzsincoincidenciaszz');
  await page.getByText('No encontramos productos', { exact: true }).waitFor();
  await search.fill('rib');
  await page.locator('.retail-product').first().waitFor();
  await page.locator('.retail-product-link').first().click();
  await page.locator('.store-product-sheet').waitFor();
  await page.keyboard.press('Escape');
  await page.locator('.store-product-sheet').waitFor({ state: 'detached' });
  assert.equal(await search.inputValue(), 'rib');
  await shot('after-search-390');
});
await test('Registro y mapa: abrir, permiso denegado, pin manual y regresar sin registrarse', async () => {
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
  await page.getByRole('textbox', { name: 'Nombre completo', exact: true }).fill('Prueba local');
  await page.getByRole('button', { name: 'Elegir punto en el mapa', exact: true }).click();
  await page.locator('.store-map-picker').waitFor();
  await visibleImages(); await fit(); await shot('after-map-390');
  await page.getByRole('button', { name: 'Mi ubicacion', exact: true }).click();
  await page.locator('.store-map-location-feedback.error').waitFor();
  await page.goBack();
  await page.locator('.store-map-picker').waitFor({ state: 'detached' });
  assert.equal(await page.getByRole('textbox', { name: 'Nombre completo', exact: true }).inputValue(), 'Prueba local');
  await page.getByRole('button', { name: 'Elegir punto en el mapa', exact: true }).click();
  await page.getByRole('button', { name: 'Cerrar ayuda', exact: true }).click();
  const pin = await page.locator('.store-map-google-link').getAttribute('href');
  await page.locator('.store-map-canvas').click({ position: { x: 260, y: 320 } });
  assert.notEqual(await page.locator('.store-map-google-link').getAttribute('href'), pin);
  await page.locator('.store-map-picker').getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.locator('.store-map-picker').waitFor({ state: 'detached', timeout: 20000 });
  await page.getByText('Ubicacion confirmada', { exact: true }).waitFor();
  assert.equal(await page.getByRole('textbox', { name: 'Nombre completo', exact: true }).inputValue(), 'Prueba local');
  await shot('after-register-390');
  await page.getByRole('button', { name: 'Navegar catalogo', exact: true }).click();
});
await test('Offline: aviso, catálogo conservado y recuperación', async () => {
  await context.setOffline(true);
  await page.getByText(/Sin conexión. Podés revisar/).waitFor();
  assert.ok(await page.locator('.retail-product').count() > 0);
  await shot('after-offline-390');
  await context.setOffline(false);
  await page.getByText(/Sin conexión. Podés revisar/).waitFor({ state: 'detached' });
});
await test('Checkout Delivery: dirección, pago, cupón inválido/válido, Gold, revisión y confirmación simulada', async () => {
  await openFixture(); await next(); await next(); await title('Dirección de entrega');
  await page.getByRole('button', { name: /Otra dirección/ }).click();
  await page.getByRole('textbox', { name: 'Dirección escrita', exact: true }).fill('Casa de mamá, dirección de prueba');
  await page.getByRole('textbox', { name: 'Referencia', exact: true }).fill('Puerta azul');
  await page.locator('.retail-option').filter({ hasText: 'Casa' }).first().click();
  await next(); await title('Método de pago');
  await page.getByRole('textbox', { name: 'Necesito cambio para', exact: true }).fill('2000');
  await shot('after-payment-390'); await next();
  await page.getByRole('textbox', { name: 'Código promocional' }).fill('INVALIDO');
  await page.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await page.getByText('Cupón no encontrado o inactivo.', { exact: true }).waitFor();
  await page.getByRole('textbox', { name: 'Código promocional' }).fill('QA10');
  await page.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await page.getByRole('button', { name: 'Ver recompensas', exact: true }).click();
  await page.locator('.sm-gold-screen').waitFor(); await visibleImages(); await shot('after-gold-390');
  assert.ok(await page.locator('.sm-gold-reward-card').filter({ hasText: 'Premio agotado' }).isVisible());
  await page.getByRole('button', { name: 'Canjear', exact: true }).click();
  await title('Tus beneficios');
  assert.equal(await page.getByRole('textbox', { name: 'Código promocional' }).inputValue(), 'QA10');
  await next(); await title('Revisá tu pedido');
  await page.getByRole('textbox', { name: /Notas para tu pedido/ }).fill('Nota QA');
  await shot('after-review-390'); await fit();
  await page.getByRole('button', { name: 'Confirmar pedido', exact: true }).click();
  const payload = JSON.parse(await page.getByTestId('submitted').innerText());
  assert.equal(payload.customer.cambioPara, '2000'); assert.equal(payload.coupon.code, 'QA10');
  assert.equal(payload.reward.rewardId, 'qa-reward'); assert.equal(payload.notes, 'Nota QA');
  assert.equal(payload.total, 1262.4); assert.equal(payload.items.length, 2);
  await title('Recibimos tu pedido'); await shot('after-confirmation-390');
  await page.getByRole('button', { name: 'Ver estado del pedido', exact: true }).click();
  await title('Tu pedido');
});
await test('Retiro: pasa por dirección de sucursal, pago y revisión, sin enviar desde carrito', async () => {
  await toReview({ mode: 'Retiro en tienda' });
  assert.equal(await page.getByTestId('submitted').count(), 0);
  await page.getByRole('button', { name: 'Confirmar pedido', exact: true }).click();
  const payload = JSON.parse(await page.getByTestId('submitted').innerText());
  assert.equal(payload.mode, 'pickup'); assert.equal(payload.total, 1336);
});
await test('Ruta: franja vigente, envío gratis y conservación de horario', async () => {
  await openFixture(); await next(); await page.getByRole('button', { name: 'Ruta San Martín', exact: true }).click(); await next(); await next();
  await title('Elegí tu horario'); assert.equal(await page.getByRole('button', { name: 'Continuar', exact: true }).isDisabled(), true);
  const option = page.locator('[aria-label="Franja de entrega de Ruta San Martin"] button').first();
  const label = await option.innerText(); await option.click(); await shot('after-route-390'); await next();
  await page.getByRole('button', { name: 'Atrás', exact: true }).click();
  assert.equal(await page.locator('[aria-label="Franja de entrega de Ruta San Martin"] button[aria-pressed="true"]').innerText(), label);
  await next(); await next(); await next();
  await page.getByRole('button', { name: 'Confirmar pedido', exact: true }).click();
  const payload = JSON.parse(await page.getByTestId('submitted').innerText());
  assert.ok(payload.slot); assert.equal(payload.total, 1336);
});
await test('Tienda cerrada: navegar checkout permitido, Delivery no confirma y Ruta sí', async () => {
  await toReview({ query: '?closed' }); assert.ok(await page.getByRole('button', { name: 'Confirmar pedido', exact: true }).isDisabled());
  await page.getByRole('button', { name: 'Ver horario', exact: true }).click();
  await page.getByRole('dialog', { name: 'Cerrado por ahora' }).waitFor(); await shot('after-hours-390');
  await page.getByRole('button', { name: 'Cerrar horario', exact: true }).click();
  await toReview({ query: '?closed', mode: 'Ruta San Martín' }); assert.ok(await page.getByRole('button', { name: 'Confirmar pedido', exact: true }).isEnabled());
});
await test('Cobertura y offline impiden confirmar; carrito vacío no puede continuar', async () => {
  await toReview({ query: '?unavailable' }); assert.ok(await page.getByRole('button', { name: 'Confirmar pedido', exact: true }).isDisabled());
  await toReview(); await context.setOffline(true); await page.getByText(/Sin conexión. Tu carrito sigue aquí/).waitFor(); assert.ok(await page.getByRole('button', { name: 'Confirmar pedido', exact: true }).isDisabled()); await context.setOffline(false);
  await openFixture(); await page.getByRole('button', { name: /^Quitar RIB/ }).click(); await page.getByRole('button', { name: /^Quitar FILETE/ }).click();
  await title('Tu carrito está vacío'); assert.equal(await page.getByRole('button', { name: 'Continuar', exact: true }).count(), 0);
});
await test('Regalía: selector, elegir, regresar, precio cero y agotados', async () => {
  await openFixture('?gift'); await page.locator('.first-reward-checkout').getByRole('button', { name: 'Elegir', exact: true }).click();
  await page.locator('.first-reward-option button').click();
  await page.getByRole('button', { name: 'Cerrar selector de regalos', exact: true }).click();
  await page.locator('.first-reward-order-line').waitFor(); assert.ok((await page.locator('.first-reward-order-line').innerText()).includes('C$0.00'));
  await shot('after-gift-390');
  await openFixture('?gift&soldout'); await page.locator('.first-reward-checkout').getByRole('button', { name: 'Elegir', exact: true }).click();
  await page.locator('.first-reward-empty').waitFor(); assert.equal(await page.locator('.first-reward-option').count(), 0);
});
await test('Perfil: menú, información, direcciones guardadas, editar y persistir al callback', async () => {
  await openFixture('?screen=profile'); await page.getByRole('button', { name: /Mi información/ }).click();
  await page.getByRole('textbox', { name: 'Nombre y apellido' }).fill('Nombre QA actualizado');
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  assert.equal(JSON.parse(await page.getByTestId('saved').innerText()).nombre, 'Nombre QA actualizado');
  await page.getByRole('button', { name: /Direcciones Tus/ }).click();
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  await page.getByRole('textbox', { name: 'Direccion escrita', exact: true }).fill('Dirección QA actualizada');
  await page.getByRole('button', { name: 'Guardar direccion', exact: true }).click();
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  assert.equal(JSON.parse(await page.getByTestId('saved').innerText()).direccion, 'Dirección QA actualizada');
  await shot('after-profile-390');
});
await test('Actividad y tracking: recibido, preparando, listo, enviado, entregado y cancelado', async () => {
  await openFixture('?screen=activity');
  assert.equal(await page.locator('.retail-order-row').count(), 4);
  for (let i = 0; i < 4; i++) {
    await page.locator('.retail-order-row').nth(i).click(); await title('Tu pedido');
    await page.getByText('Ver detalle del pedido', { exact: true }).click();
    assert.ok(await page.getByText(/RIB EYE PREMIUM PARA PARRILLA/).first().isVisible());
    if (i === 3) {
      assert.equal(await page.locator('.store-route-map').count(), 0);
      assert.ok((await page.locator('.store-preparation-copy').boundingBox()).width > 280);
      await page.evaluate(() => scrollTo(0,0)); await shot('after-tracking-390');
    }
    await page.getByRole('button', { name: 'Actividad', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Anteriores', exact: true }).click();
  assert.equal(await page.locator('.retail-order-row').count(), 2);
  await page.locator('.retail-order-row').filter({ hasText: 'cancelado' }).click();
  assert.equal(await page.locator('.retail-tracking').count(), 0);
});
await test('Gold: historial, volver y premio agotado no canjeable', async () => {
  await openFixture('?screen=profile'); await page.getByRole('button', { name: /Miembro Gold/ }).click();
  const exhausted = page.locator('.sm-gold-reward-card').filter({ hasText: 'Premio agotado' });
  assert.equal(await exhausted.getByRole('button', { name: 'Canjear' }).count(), 0);
  await page.getByRole('button', { name: 'Movimientos', exact: true }).click();
  await page.locator('.sm-gold-transactions-list').waitFor(); await shot('after-gold-history-390');
  await page.getByRole('button', { name: 'Premios', exact: true }).click();
  await page.locator('.sm-gold-rewards-grid').waitFor(); await page.getByRole('button', { name: 'Tienda', exact: true }).click();
  await title('Perfil');
});
await test('Historial navegador: atrás/adelante mantiene categoría, búsqueda, cantidad de producto y carrito', async () => {
  await page.goto(`${origin}/granada`); await page.locator('.retail-product').first().waitFor();
  await page.getByRole('button', { name: 'Categorías', exact: true }).click();
  await page.locator('.retail-category-grid button').filter({ hasText: /^Res/ }).click();
  await page.locator('.retail-product-link').first().click();
  const quantity = page.locator('.store-product-sheet input').first();
  const beforeQuantity = await quantity.inputValue();
  await page.locator('.store-product-sheet').getByRole('button', { name: /^Aumentar cantidad/ }).click();
  await page.waitForFunction((previous) => document.querySelector('.store-product-sheet input')?.value !== previous, beforeQuantity);
  const value = await quantity.inputValue();
  await page.goBack(); await page.locator('.store-product-sheet').waitFor({ state: 'detached' });
  await page.goForward(); await page.locator('.store-product-sheet').waitFor();
  assert.equal(await quantity.inputValue(), value);
  await page.getByRole('button', { name: /^Agregar al carrito/ }).click();
  await page.locator('.store-product-sheet').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Abrir carrito', exact: true }).click(); await title('Tu carrito');
  await next(); await title('Cómo lo recibís'); await page.goBack(); await title('Tu carrito');
  await page.goForward(); await title('Cómo lo recibís');
  await page.locator('.retail-checkout-screen').getByRole('button', { name: 'Atrás', exact: true }).click();
  await title('Tu carrito');
  assert.ok(await page.locator('.retail-cart-line').count() > 0);
});
await test('Ruta: menos de C$1000 bloquea horario y cupón bajo el mínimo bloquea confirmación', async () => {
  await openFixture(); await page.getByRole('button', { name: /^Quitar FILETE/ }).click();
  await page.getByRole('button', { name: /^Reducir RIB/ }).click();
  await page.getByRole('button', { name: /^Reducir RIB/ }).click();
  await next(); await page.getByRole('button', { name: 'Ruta San Martín', exact: true }).click();
  await next(); await next(); await title('Elegí tu horario');
  await page.locator('[aria-label="Franja de entrega de Ruta San Martin"] button').first().click();
  assert.ok(await page.getByRole('button', { name: 'Continuar', exact: true }).isDisabled());
  await openFixture();
  await page.getByRole('button', { name: /^Reducir RIB/ }).click();
  await page.getByRole('button', { name: /^Reducir RIB/ }).click();
  await next(); await page.getByRole('button', { name: 'Ruta San Martín', exact: true }).click();
  await next(); await next(); await page.locator('[aria-label="Franja de entrega de Ruta San Martin"] button').first().click();
  await next(); await next();
  await page.getByRole('textbox', { name: 'Código promocional' }).fill('QA10');
  await page.getByRole('button', { name: 'Aplicar', exact: true }).click(); await next();
  assert.ok(await page.getByRole('button', { name: 'Confirmar pedido', exact: true }).isDisabled());
});
await test('Pago: efectivo, tarjeta y link conservados al volver; sin abrir pasarela ni cobrar', async () => {
  await openFixture(); await next(); await next(); await next(); await title('Método de pago');
  const options = await page.locator('.retail-option-list button').allTextContents();
  assert.equal(options.length, 3);
  for (let i = 0; i < options.length; i++) {
    await page.locator('.retail-option-list button').nth(i).click();
    await next(); await page.getByRole('button', { name: 'Atrás', exact: true }).click();
    assert.equal(await page.locator('.retail-option-list button').nth(i).getAttribute('aria-pressed'), 'true');
  }
});
await test('Imagen fallida: fallback visible; carga diferida y dimensiones reservadas', async () => {
  await page.goto(`${origin}/granada`); await page.locator('.retail-product').first().waitFor();
  const photo = page.locator('.retail-product img').first();
  assert.equal(await photo.getAttribute('loading'), 'lazy');
  assert.equal(await photo.getAttribute('width'), '320');
  const original = await photo.getAttribute('src');
  await page.route(original, (route) => route.abort());
  await photo.evaluate((img) => { img.src = '/qa-missing-product.jpg'; });
  await page.waitForFunction(() => document.querySelector('.retail-product img')?.currentSrc.includes('product-placeholder'));
  await photo.evaluate((img) => img.decode());
  assert.ok(await photo.evaluate((img) => img.complete && img.naturalWidth > 0));
  await page.unroute(original);
});
await test('Catálogo paginado: cargar más, volver del producto y conservar lista', async () => {
  await page.goto(`${origin}/granada`); await page.locator('.retail-product').first().waitFor();
  await page.getByRole('button', { name: 'Ver todo el catálogo', exact: false }).click();
  assert.equal(await page.locator('.retail-product').count(), 24);
  await page.getByRole('button', { name: /^Ver más productos/ }).click();
  assert.equal(await page.locator('.retail-product').count(), 48);
  await page.locator('.retail-product-link').nth(30).click();
  await page.locator('.store-product-sheet').waitFor(); await page.keyboard.press('Escape');
  await page.locator('.store-product-sheet').waitFor({ state: 'detached' });
  assert.equal(await page.locator('.retail-product').count(), 48);
});
await test('Desktop: carrito lateral, detalle ancho y targets principales accesibles', async () => {
  await page.setViewportSize({ width:1440, height:960 });
  await page.goto(`${origin}/granada`); await page.locator('.retail-product').first().waitFor();
  await page.locator('.retail-card-add').first().click();
  const side = page.locator('.store-floating-cart'); await side.waitFor();
  assert.ok((await side.boundingBox()).width >= 300); await fit(); await shot('after-desktop-cart');
  await page.locator('.retail-product-link').first().click();
  assert.ok((await page.locator('.store-product-sheet').boundingBox()).width >= 800);
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width:390, height:844 });
  await page.getByRole('button', { name: 'Abrir carrito', exact: true }).click();
  const cta = page.getByRole('button', { name: 'Continuar', exact: true });
  assert.ok((await cta.boundingBox()).height >= 44);
  const colors = await cta.evaluate((button) => ({ foreground: getComputedStyle(button).color, background: getComputedStyle(button).backgroundColor }));
  const luminance = (color) => color.match(/\d+(\.\d+)?/g).slice(0,3).map(Number).map((value) => { const c = value / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; }).reduce((sum, value, index) => sum + value * [.2126,.7152,.0722][index], 0);
  const values = [luminance(colors.foreground), luminance(colors.background)].sort((a,b) => b-a);
  assert.ok((values[0]+.05)/(values[1]+.05) >= 4.5, `CTA contrast ${JSON.stringify(colors)}`);
});
await test('Teclado/zoom texto: checkout a 360x500 y texto 200%, sin desbordamiento', async () => {
  await page.setViewportSize({ width:360, height:500 });
  await openFixture(); await next(); await next(); await next();
  await page.getByRole('textbox', { name: 'Necesito cambio para', exact: true }).focus();
  await fit();
  assert.ok((await page.locator('.retail-checkout-footer').boundingBox()).y < 500);
  await page.setViewportSize({ width:390, height:844 });
  await openFixture('?screen=profile');
  await page.addStyleTag({ content: '.storefront-retail :is(h1,h2,strong,small,p,button) { font-size: 200% !important; }' });
  await fit();
});
await test('Responsive 360/390/430, tablet y desktop: inicio y CTA checkout', async () => {
  for (const [width, height] of [[360,800],[390,844],[430,932],[820,1180],[1440,960]]) {
    await page.setViewportSize({ width, height });
    await page.goto(`${origin}/granada`); await page.locator('.retail-product').first().waitFor(); await fit();
    await shot(`after-home-${width}`);
    await openFixture(); await next(); await fit();
    const rect = await page.locator('.retail-checkout-footer').boundingBox();
    assert.ok(rect.y >= 0 && rect.y + rect.height <= height + 1);
    await shot(`after-checkout-${width}`);
  }
  await page.setViewportSize({ width:390, height:844 });
});
await test('Accesibilidad: foco contenido, Tab atrapado, Escape y movimiento reducido', async () => {
  await openFixture();
  assert.ok(await page.evaluate(() => document.querySelector('.retail-checkout-screen').contains(document.activeElement)));
  await page.getByRole('button', { name: 'Continuar', exact: true }).focus(); await page.keyboard.press('Tab');
  assert.ok(await page.evaluate(() => document.querySelector('.retail-checkout-screen').contains(document.activeElement)));
  await page.emulateMedia({ reducedMotion:'reduce' });
  await next();
  assert.equal(await page.locator('.retail-checkout-content').evaluate((element) => getComputedStyle(element).animationName), 'none');
  await page.keyboard.press('Escape'); await title('Tu carrito');
  await page.emulateMedia({ reducedMotion:'no-preference' });
});
await test('Sucursales Granada/Nindiri/Masaya conservan identidad y catálogo', async () => {
  for (const branch of ['granada','nindiri','masaya']) {
    await page.goto(`${origin}/${branch}`); await page.locator('.retail-product').first().waitFor();
    assert.ok((await page.locator('.store-branch-pill').innerText()).toLowerCase().includes(branch)); await fit();
  }
});
await test('Contenedor Android: catálogo, agregar, carrito y entrega sin choque de estilos nativos', async () => {
  const nativeOrigin = process.env.NATIVE_QA_URL || 'http://127.0.0.1:5179';
  assert.match(nativeOrigin, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
  await page.goto(nativeOrigin);
  await page.getByRole('button', { name: 'Navegar catalogo', exact: true }).click();
  await page.locator('.retail-product').first().waitFor();
  assert.equal(await page.locator('html').getAttribute('data-app-target'), 'store-android');
  await page.locator('.retail-card-add').first().click();
  await page.getByRole('button', { name: 'Abrir carrito', exact: true }).click(); await title('Tu carrito');
  await next(); await title('Cómo lo recibís'); await fit(); await shot('after-android-delivery-390');
});
await test('Sin errores JavaScript en recorridos frescos', async () => { assert.deepEqual(errors, []); });
await writeFile(path.join(out, 'qa-results.json'), JSON.stringify({ at: new Date().toISOString(), origin, results, errors, limits: ['No real accounts, orders, payments or stock reservations were created.', 'Authenticated screens use local callback fixtures, not backend integration tests.'] }, null, 2));
await browser.close();
const failures = results.filter((item) => item.result === 'FAIL');
console.log(`${results.length - failures.length}/${results.length} groups passed. Report: ${out}`);
process.exitCode = failures.length ? 1 : 0;
