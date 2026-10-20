// Playwright CLI run-code --filename scripts/qaProductViewport.cjs
// Open a product in an isolated, unauthenticated browser first. No order is sent.
async page => {
  const sheet = page.locator('.store-product-sheet');
  await sheet.waitFor({ state: 'visible' });
  const results = [];
  for (const [width, height] of [[390, 680], [390, 844], [360, 560], [430, 750], [844, 390], [1280, 900], [390, 680]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const inspect = () => sheet.evaluate(s => {
      const body = s.querySelector('.store-detail-grid');
      const footer = s.querySelector('.store-product-sheet-footer');
      const button = footer.querySelector('button');
      const r = button.getBoundingClientRect();
      const photo = s.querySelector('.store-detail-image').getBoundingClientRect();
      const copy = s.querySelector('.store-product-sheet-copy').getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return {
        visible: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth,
        reachable: hit === button || button.contains(hit),
        overlap: photo.left < copy.right && photo.right > copy.left && photo.top < copy.bottom && photo.bottom > copy.top,
        overflow: document.documentElement.scrollWidth > innerWidth,
        bottom: r.bottom,
        scrollable: body.scrollHeight > body.clientHeight,
      };
    });
    await sheet.locator('.store-detail-grid').evaluate(e => { e.scrollTop = 0; });
    const before = await inspect();
    if (!before.visible || !before.reachable || before.overlap || before.overflow) throw new Error(JSON.stringify({width, height, before}));
    await sheet.locator('.store-detail-grid').evaluate(e => { e.scrollTop = e.scrollHeight; });
    const after = await inspect();
    if (!after.visible || !after.reachable || Math.abs(after.bottom - before.bottom) > 1) throw new Error('Purchase action moved while scrolling');
    results.push({ width, height, ...before });
  }
  await sheet.getByRole('button', {name: '1.5 lb', exact: true}).click();
  const selected = await sheet.locator('.store-product-sheet-footer').innerText();
  if (!selected.includes('1.5 lb')) throw new Error('Selection was not reflected in the fixed action');
  await page.screenshot({path: 'output/playwright/product-viewport-verified.png', scale: 'css'});
  await sheet.getByRole('button', {name: /Agregar al carrito/}).click();
  await sheet.waitFor({state: 'hidden'});
  return {results, selected, addedToCart: true};
}
