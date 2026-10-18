// Иконки приложения из scripts/icon.html в public/icons. Запуск: node scripts/make-icons.mjs
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

const page_ = new URL('./icon.html', import.meta.url).href;
const out = fileURLToPath(new URL('../public/icons/', import.meta.url));
const SIZES = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
  ['icon-maskable-512.png', 512, true],
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 1100 } });
for (const [name, size, mask] of SIZES) {
  await page.goto(`${page_}?size=${size}${mask ? '&mask=1' : ''}`);
  await page.evaluate(() => document.fonts.ready);
  const ok = await page.evaluate(() => document.fonts.check('900 100px "Sofia Sans Extra Condensed"', 'А'));
  if (!ok) throw new Error('Шрифт Удара не загрузился');
  await page.locator('#icon').screenshot({ path: out + name });
  console.log(name);
}
await browser.close();
