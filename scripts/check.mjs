#!/usr/bin/env node
/* scripts/check.mjs — Verificación local (#6)
   1) node --check de cada módulo de la app (sintaxis clásica de navegador).
   2) node --test tests/ (núcleo de cálculo puro).
   Uso: npm run check */
import { readdirSync } from 'node:fs';
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

console.log('— Tests (node:test) —');
const t = spawnSync(process.execPath, ['--test', 'tests/pure.test.mjs'], { cwd: ROOT, encoding: 'utf8' });
process.stdout.write(t.stdout || '');
process.stderr.write(t.stderr || '');
if (t.status !== 0) fail++;

console.log(fail ? `\n${fail} comprobaciones fallidas` : '\nTodo correcto');
process.exit(fail ? 1 : 0);
