#!/usr/bin/env node
/* tests/e2e/pdf.e2e.mjs — E2E de humo con Playwright (#2 mejoras2)
   Abre la app real (file://, sin servidor), rellena una cantidad, genera el
   PDF de presupuesto y comprueba que lo que descarga el navegador es un PDF
   de verdad (cabecera %PDF). La librería jsPDF se carga del vendor/ local,
   así que no hace falta red.
   Requiere: npm install en scripts/ + npx playwright install chromium.
   Ejecutar: npm run e2e (scripts/) · node tests/e2e/pdf.e2e.mjs (raíz). */
import { readFileSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

let chromium;
try {
  ({ chromium } = createRequire(path.resolve(ROOT, 'scripts', 'package.json'))('playwright'));
} catch {
  console.error('✗ Playwright no instalado — npm install dentro de scripts/ y');
  console.error('  npx playwright install chromium (desde scripts/).');
  process.exit(process.env.CI ? 1 : 0);   // en local no rompe `npm run check`
}

const OUT = path.join(ROOT, 'tests', 'e2e', 'out');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
try {
  /* viewport de móvil: a ≥1280 px la .sumbar (con #btn-pdf2) se oculta por CSS */
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', e => { console.error('pageerror:', e.message); });
  await page.goto('file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/'));

  /* datos mínimos: 10 enchufes sobre el catálogo recién renderizado */
  await page.waitForSelector('.partida[data-id="enchufes"] [data-qty]');
  await page.fill('.partida[data-id="enchufes"] [data-qty]', '10');

  /* flujo real de descarga: botón PDF → elegir «Presupuesto» */
  await page.click('#btn-pdf2');
  await page.waitForSelector('#modal-tipo.show', { timeout: 5000 });
  const dlPromise = page.waitForEvent('download', { timeout: 30000 });
  await page.click('#btn-dl-presu');
  const dl = await dlPromise;

  const file = path.join(OUT, dl.suggestedFilename());
  await dl.saveAs(file);
  const buf = readFileSync(file);
  if (buf.subarray(0, 5).toString('latin1') !== '%PDF-')
    throw new Error(`el archivo descargado no es un PDF: ${file} (${buf.length} bytes)`);
  if (!/Presupuesto/.test(dl.suggestedFilename()))
    throw new Error(`nombre inesperado: ${dl.suggestedFilename()}`);
  console.log(`✓ E2E PDF ok — ${dl.suggestedFilename()} (${buf.length} bytes)`);
} finally {
  await browser.close();
}
