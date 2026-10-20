const INK = '#102d49';
const BLUE = '#0044c5';
const RED = '#ff000c';
const FONT = '"Space Grotesk", sans-serif';
export const SHARE_PAGE_SIZE = 4;

export function promotionSharePages(products = []) {
  const seen = new Set();
  const valid = products.filter(product => {
    if (!product?.code || seen.has(product.code) || product.price == null || product.price === ''
      || !Number.isFinite(Number(product.price)) || Number(product.price) < 0) return false;
    seen.add(product.code);
    return true;
  });
  return Array.from({ length: Math.ceil(valid.length / SHARE_PAGE_SIZE) }, (_, i) =>
    valid.slice(i * SHARE_PAGE_SIZE, (i + 1) * SHARE_PAGE_SIZE));
}

export function promotionShareExpired(endsAt, now = Date.now()) {
  const end = Date.parse(endsAt);
  return Number.isFinite(end) && now >= end;
}

export function promotionShareFilename(title, page = 0) {
  const slug = String(title || 'promocion').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70);
  return `san-martin-${slug || 'promocion'}-${page + 1}.png`;
}

export const promotionShareMoney = value => `C$${Number(value).toLocaleString('en-US', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
})}`;

function loadImage(source) {
  return new Promise((resolve, reject) => {
    if (!source) return reject(new Error('Falta la foto de uno de los productos.'));
    const image = new Image();
    image.crossOrigin = 'anonymous';
    const timer = setTimeout(() => { image.src = ''; reject(new Error('Las fotos tardaron demasiado. Intentá nuevamente.')); }, 15000);
    image.onload = () => { clearTimeout(timer); resolve(image); };
    image.onerror = () => { clearTimeout(timer); reject(new Error('No se pudo preparar una foto para compartir. Revisá tu conexión o intentá con otro producto.')); };
    image.src = source;
  });
}

function textBlock(ctx, text, x, y, width, height, size, color = INK, weight = 700) {
  let lines;
  do {
    ctx.font = `${weight} ${size}px ${FONT}`;
    lines = [''];
    for (const word of String(text || '').split(/\s+/)) {
      const last = lines.length - 1;
      const next = `${lines[last]} ${word}`.trim();
      if (ctx.measureText(next).width <= width) lines[last] = next;
      else if (ctx.measureText(word).width <= width) lines.push(word);
      else {
        for (const char of `${lines[last] ? ' ' : ''}${word}`) {
          const index = lines.length - 1;
          if (ctx.measureText(lines[index] + char).width > width) lines.push(char);
          else lines[index] += char;
        }
      }
    }
    if (lines.length * size * 1.18 <= height) break;
    size -= 1;
  } while (size > 10);
  ctx.fillStyle = color;
  ctx.textBaseline = 'top';
  lines.forEach((line, i) => ctx.fillText(line, x, y + i * size * 1.18));
}

function contain(ctx, image, x, y, w, h) {
  const scale = Math.min(w / image.width, h / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  ctx.drawImage(image, x + (w - width) / 2, y + (h - height) / 2, width, height);
}

// Local canvas composition: no customer data, paid image API or backend writes.
export async function renderPromotionShare({ title, products, branchName, endsAt, page, pageCount }) {
  if (!products.length || products.length > SHARE_PAGE_SIZE) throw new Error('No hay productos para compartir.');
  if (promotionShareExpired(endsAt)) throw new Error('Esta promoción ya finalizó.');
  await document.fonts.load(`700 32px ${FONT}`);
  const [logo, ...photos] = await Promise.all([
    loadImage('/tienda/branding/logo-full.svg'),
    ...products.map(product => loadImage(product.image)),
  ]);
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Tu navegador no permite generar la imagen.');
  ctx.fillStyle = '#f5f3ed';
  ctx.fillRect(0, 0, 1080, 1350);
  ctx.strokeStyle = '#dbe5f3';
  ctx.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.arc(1050, 30, 160 + i * 42, 0, Math.PI * 2);
    ctx.stroke();
  }
  contain(ctx, logo, 54, 36, 190, 88);
  textBlock(ctx, String(branchName || 'Tienda virtual'), 590, 62, 435, 48, 25, BLUE);
  textBlock(ctx, 'PRECIAZOS', 52, 142, 890, 100, 91, BLUE);
  ctx.fillStyle = RED;
  ctx.beginPath(); ctx.arc(998, 198, 24, 0, Math.PI * 2); ctx.fill();
  textBlock(ctx, products.length === 1 && title === products[0].name ? 'EN CARNES SAN MARTÍN, SÍ.' : title, 56, 250, 965, 72, 33);
  ctx.fillStyle = RED;
  ctx.fillRect(56, 332, 115, 6);
  const solo = products.length === 1;
  const pair = products.length === 2;
  const columns = solo ? 1 : 2;
  const cardWidth = solo ? 968 : 468;
  products.forEach((product, index) => {
    const x = 56 + (index % columns) * 500;
    const y = solo || pair ? 362 : 362 + Math.floor(index / columns) * 390;
    const photoHeight = solo ? 515 : pair ? 500 : 210;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, cardWidth, photoHeight);
    contain(ctx, photos[index], x + 14, y + 12, cardWidth - 28, photoHeight - 24);
    const discounted = Number(product.originalPrice) > Number(product.price) && product.hasSpecialPromotion;
    if (discounted) {
      const percent = Math.floor((1 - Number(product.price) / Number(product.originalPrice)) * 100 + 0.00001);
      // Never advertise a larger reduction than the displayed prices support.
      if (percent > 0) {
        ctx.fillStyle = RED; ctx.fillRect(x, y, 114, 49);
        textBlock(ctx, `−${percent}%`, x + 14, y + 8, 93, 37, 29, '#ffffff');
      }
    }
    textBlock(ctx, product.name, x, y + photoHeight + 14, cardWidth, solo || pair ? 106 : 64, solo ? 44 : pair ? 32 : 25);
    const priceY = solo ? 1015 : pair ? 1010 : y + photoHeight + 84;
    textBlock(ctx, promotionShareMoney(product.price), x, priceY, solo ? 660 : 310, solo ? 92 : 55, solo ? 80 : 43, BLUE);
    textBlock(ctx, `/ ${product.unit || 'unidad'}`, x + (solo ? 690 : 320), priceY + 8, solo ? 265 : 148, 40, solo ? 30 : 22);
    if (discounted) {
      textBlock(ctx, `Antes ${promotionShareMoney(product.originalPrice)}`, x, solo ? 1111 : pair ? 1070 : y + photoHeight + 137, cardWidth, 28, 20, '#59697a', 500);
    }
  });
  ctx.fillStyle = BLUE; ctx.fillRect(0, 1174, 1080, 176);
  textBlock(ctx, 'HOY SE COME BIEN.', 56, 1200, 968, 56, 42, '#ffffff');
  textBlock(ctx, 'Pedí en tienda.sanmartinsr.com', 56, 1261, 968, 40, 28, '#ffffff', 500);
  const date = endsAt && Number.isFinite(Date.parse(endsAt))
    ? `Hasta ${new Intl.DateTimeFormat('es-NI', { timeZone: 'America/Managua', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(endsAt))}. `
    : '';
  textBlock(ctx, `${date}Precios sujetos a vigencia y disponibilidad. ${pageCount > 1 ? `${page + 1}/${pageCount}` : ''}`,
    56, 1310, 968, 25, 17, '#ffffff', 400);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('No se pudo crear la imagen.')), 'image/png'));
}
