// Génère les icônes PNG de la PWA à partir de public/icons/icon.svg
// avec un Chromium installé localement (playwright-core ne télécharge aucun navigateur).
// Usage : node scripts/make-icons.mjs [chemin/vers/chromium]
import { chromium } from 'playwright-core';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../public/icons/', import.meta.url));
const svg = await readFile(dir + 'icon.svg', 'utf8');
const executablePath = process.argv[2] ?? process.env.CHROMIUM_PATH ?? '/usr/bin/chromium';

const browser = await chromium.launch({ executablePath });
const page = await browser.newPage();

async function render(file, size, { maskable = false } = {}) {
  await page.setViewportSize({ width: size, height: size });
  // Icône « maskable » : fond plein et contenu réduit dans la zone sûre (80 %).
  const inner = maskable
    ? `<div style="width:${size}px;height:${size}px;background:#140a0c;display:flex;align-items:center;justify-content:center">
         <div style="width:${size * 0.8}px;height:${size * 0.8}px">${svg.replace('rx="96"', 'rx="0"')}</div></div>`
    : `<div style="width:${size}px;height:${size}px">${svg}</div>`;
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{width:100%;height:100%;display:block}</style>${inner}`);
  await page.screenshot({ path: dir + file, omitBackground: !maskable });
  console.log('écrit', file);
}

await render('icon-192.png', 192);
await render('icon-512.png', 512);
await render('icon-maskable-512.png', 512, { maskable: true });
await render('apple-touch-icon.png', 180, { maskable: true });
await browser.close();
