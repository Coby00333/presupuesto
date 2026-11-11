#!/usr/bin/env node
/* scripts/check.mjs — Verificación local (#6 + #3/#2 mejoras2)
   1) node --check de cada módulo de la app (sintaxis clásica de navegador).
   2) tsc --noEmit con jsconfig.json (tipado JSDoc de los módulos con
      @ts-check; requiere `npm install` dentro de scripts/ — si typescript
      no está instalado se avisa y se continúa).
   3) node --test tests/ (núcleo puro + interfaz DOM con jsdom).
   Uso: npm run check (desde scripts/) o node scripts/check.mjs (raíz) */
import { readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fail = 0;

const files = readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js'));
console.log(`— Sintaxis (${files.length} módulos) —`);
for (const f of files) {
  const r = spawnSync(process.execPath, ['--check', path.join('js', f)], { cwd: ROOT, encoding: 'utf8' });
  if (r.status === 0) console.log(`  ok   js/${f}`);
  else { fail++; console.error(`  FAIL js/${f}\n${r.stderr}`); }
}
const sw = spawnSync(process.execPath, ['--check', 'sw.js'], { cwd: ROOT, encoding: 'utf8' });
if (sw.status === 0) console.log('  ok   sw.js');
else { fail++; console.error(`  FAIL sw.js\n${sw.stderr}`); }

console.log('— Tipado (tsc --noEmit, @ts-check) —');
const tsc = path.join(ROOT, 'scripts', 'node_modules', 'typescript', 'bin', 'tsc');
if (existsSync(tsc)) {
  const c = spawnSync(process.execPath, [tsc, '--noEmit', '-p', 'jsconfig.json'], { cwd: ROOT, encoding: 'utf8' });
  if (c.status === 0) console.log('  ok   jsconfig.json (módulos con @ts-check)');
  else { fail++; process.stdout.write(c.stdout || ''); process.stderr.write(c.stderr || ''); }
} else console.log('  —    typescript no instalado (npm install en scripts/) — paso omitido');

console.log('— Tests (node:test) —');
// Se pasan los *.test.mjs como rutas explícitas: `--test tests/` falla en
// Windows y el patrón glob de --test exige Node ≥ 21; la CI usa Node 20.
// Los E2E (tests/e2e) corren aparte, no aquí.
const testFiles = readdirSync(path.join(ROOT, 'tests'))
  .filter(f => f.endsWith('.test.mjs'))
  .map(f => path.join('tests', f));
if (!testFiles.length) { fail++; console.error('  FAIL no hay tests en tests/'); }
else {
  const t = spawnSync(process.execPath, ['--test', ...testFiles], { cwd: ROOT, encoding: 'utf8' });
  process.stdout.write(t.stdout || '');
  process.stderr.write(t.stderr || '');
  if (t.status !== 0) fail++;
}

console.log(fail ? `\n${fail} comprobaciones fallidas` : '\nTodo correcto');
process.exit(fail ? 1 : 0);
