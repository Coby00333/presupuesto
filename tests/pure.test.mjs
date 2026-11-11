/* tests/pure.test.mjs — Tests del núcleo de cálculo (#5)
   js/data.js y js/pure.js son scripts clásicos de navegador (compatibles con
   file://), así que se concatenan en un solo contexto de node:vm y se
   devuelven referencias a las funciones puras. Nada de DOM: por eso viven
   en pure.js. Ejecutar: npm test  ·  node --test tests/ */
import test from 'node:test';
import assert from 'node:assert/strict';
import { deepEqual } from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { TextEncoder, TextDecoder } from 'node:util';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src =
  ['js/data.js', 'js/pure.js']
    .map(f => readFileSync(path.join(ROOT, f), 'utf8'))
    .join('\n;\n')
  + `\n;({ cur,
      letra, totalLetra, chipVal, rebtSug, seccionCaida, sugerirMarcos,
      redondeoTotal, totalsForPure, ivaMix, totalsForMix, ganttWeeks,
      hashFactura, estimarMetros, parseLM });`;

const sandbox = { console, crypto: globalThis.crypto ?? webcrypto, TextEncoder, TextDecoder };
vm.createContext(sandbox);
/** API con las funciones puras bajo prueba */
const api = vm.runInContext(src, sandbox, { filename: 'pure-bundle.js' });

const approx = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `esperaba ${b}, obtuvo ${a}`);

/* ---------- número en letra ---------- */
test('letra: unidades, decenas y centenas', () => {
  assert.equal(api.letra(0), 'cero');
  assert.equal(api.letra(7), 'siete');
  assert.equal(api.letra(21), 'veintiuno');
  assert.equal(api.letra(35), 'treinta y cinco');
  assert.equal(api.letra(100), 'cien');
  assert.equal(api.letra(101), 'ciento uno');
  assert.equal(api.letra(234), 'doscientos treinta y cuatro');
});
test('letra: miles y millones', () => {
  assert.equal(api.letra(1000), 'mil');
  assert.equal(api.letra(1234), 'mil doscientos treinta y cuatro');
  assert.equal(api.letra(1000000), 'un millón');
  assert.equal(api.letra(1234567), 'un millón doscientos treinta y cuatro mil quinientos sesenta y siete');
});
test('totalLetra: importe con céntimos', () => {
  assert.equal(api.totalLetra(1234.56), 'Son mil doscientos treinta y cuatro euros con 56 céntimos.');
  assert.equal(api.totalLetra(0), 'Son cero euros con 00 céntimos.');
});

/* ---------- precios dinámicos ---------- */
test('chipVal: redondeo entero >=20 y décima por debajo', () => {
  approx(api.chipVal(25, 1), 25);          // 25 → entero
  approx(api.chipVal(10, 1.5), 15);        // 15 → entero también
  approx(api.chipVal(1.5, 1), 1.5);        // <20 → 1 decimal
  approx(api.chipVal(3.33, 1.06), 3.5);    // 3.5298 → 3.5
});
test('chipVal: niveles de transporte (10/15/20/25) se respetan tal cual', () => {
  approx(api.chipVal(10, 1), 10);
  approx(api.chipVal(25, 1), 25);
});

/* ---------- REBT: nº de circuitos ---------- */
test('rebtSug: circuitos orientativos ITC-BT-19/28/34', () => {
  const r = api.rebtSug(16, 40);        // 16 enchufes, 40 luces
  assert.equal(r.tomas, 2);             // máx 8 por circuito
  assert.equal(r.lucz, 2);              // máx 20 por circuito
  assert.equal(r.pias, 8);              // +4 exclusivos (cocina, horno, lavadora, AA)
  assert.equal(r.difs, 2);              // 1 diferencial / 4 circuitos, mín 2
  const v = api.rebtSug(0, 0);          // obra vacía
  assert.equal(v.pias, 0);
  assert.equal(v.difs, 2);
});

/* ---------- REBT: sección por caída e intensidad ---------- */
test('seccionCaida: tomas 3450 W a 20 m → 2,5 mm²', () => {
  const r = api.seccionCaida(3450, 20);
  approx(r.I, 16.7, 0.05);
  approx(r.sAdm, 2.5);
  assert.ok(r.sCaida < 1);
  assert.equal(r.seccion, 2.5);
});
test('seccionCaida: cocina 5750 W a 35 m → 4 mm² (por intensidad)', () => {
  const r = api.seccionCaida(5750, 35);
  approx(r.I, 27.8, 0.05);
  assert.equal(r.sAdm, 4);
  assert.equal(r.seccion, 4);
});
test('seccionCaida: línea larga manda la caída de tensión', () => {
  const r = api.seccionCaida(3450, 60); // 60 m: ΔU exige más que la I admisible
  assert.ok(r.sCaida > r.sAdm);
  assert.equal(r.seccion, 4);
});

/* ---------- marcos automáticos ---------- */
test('sugerirMarcos: reparto 4→3→2→1', () => {
  deepEqual(api.sugerirMarcos(0), { n1: 0, n2: 0, n3: 0, n4: 0, total: 0, marcos: 0 });
  deepEqual(api.sugerirMarcos(9), { n1: 1, n2: 0, n3: 0, n4: 2, total: 9, marcos: 3 });
  deepEqual(api.sugerirMarcos(7), { n1: 0, n2: 0, n3: 1, n4: 1, total: 7, marcos: 2 });
  deepEqual(api.sugerirMarcos(4), { n1: 0, n2: 0, n3: 0, n4: 1, total: 4, marcos: 1 });
});

/* ---------- redondeo comercial ---------- */
test('redondeoTotal: múltiplos y precio psicológico x9', () => {
  assert.equal(api.redondeoTotal(1234, 0), 1234);
  assert.equal(api.redondeoTotal(1234, 1), 1234);
  assert.equal(api.redondeoTotal(1236, 10), 1240);
  assert.equal(api.redondeoTotal(1234, 10), 1230);
  assert.equal(api.redondeoTotal(1210, 'x9'), 1219);   // sube al siguiente …9
  assert.equal(api.redondeoTotal(1234, 'x9'), 1239);
  assert.equal(api.redondeoTotal(1239, 'x9'), 1239);   // ya acaba en 9
  assert.equal(api.redondeoTotal(15, 'x9'), 15);       // <19: sin tocar
});

/* ---------- totales ---------- */
test('totalsForPure: descuentos, IVA y redondeo final', () => {
  const t = api.totalsForPure(1000, 50, 50, 21, 'x9');
  assert.equal(t.desc, 100);
  assert.equal(t.baseDes, 900);
  assert.equal(t.iva, 189);
  assert.equal(t.total, 1089);                    // ya termina en 9
  const t2 = api.totalsForPure(1000, 0, 0, 21, 'x9');
  assert.equal(t2.total, 1219);                   // 1210 → 1219
  assert.equal(api.totalsForPure(100, 0, 0, 10, 0).total, 110);
});

/* ---------- IVA mixto (#4 mejoras2) ---------- */
test('ivaMix: reparto 60/40 sobre 1000 → 60 € + 84 € = 144 €', () => {
  const m = api.ivaMix(1000, 60);
  assert.equal(m.b10, 600);
  assert.equal(m.b21, 400);
  assert.equal(m.iva10, 60);
  assert.equal(m.iva21, 84);
  assert.equal(m.iva, 144);
});
test('ivaMix: límites y entradas de formulario', () => {
  assert.equal(api.ivaMix(1000, 150).b10, 1000);   // se recorta al 100 %
  assert.equal(api.ivaMix(1000, -5).b10, 0);       // y al 0 %
  assert.equal(api.ivaMix(1000, '55,5').b10, 555); // coma decimal tolerada
  assert.equal(api.ivaMix(1000, null).p10, 60);    // sin valor: 60 % por defecto
  assert.equal(api.ivaMix(1000, '').p10, 0);       // vacío → 0 (cadena no numérica)
});
test('totalsForMix: mix=true aplica las dos líneas y el redondeo', () => {
  const t = api.totalsForMix(1000, 0, 0, 10, 0, true, 60);
  assert.equal(t.baseDes, 1000);
  assert.equal(t.iva, 144);                        // 600×10% + 400×21%
  assert.equal(t.total, 1144);
  assert.ok(t.ivaMix);
  assert.equal(t.ivaMix.iva21, 84);
});
test('totalsForMix: mix=false equivale a totalsForPure (ivaMix null)', () => {
  const t = api.totalsForMix(1000, 50, 50, 21, 'x9', false, 60);
  assert.equal(t.ivaMix, null);
  assert.equal(t.total, 1089);                     // mismo caso que totalsForPure
});

/* ---------- Gantt ---------- */
test('ganttWeeks: interpreta textos de plazo', () => {
  deepEqual(api.ganttWeeks('3-4 semanas tras picado'), { min: 3, max: 4 });
  deepEqual(api.ganttWeeks('6 semanas'), { min: 6, max: 6 });
  deepEqual(api.ganttWeeks('8-5 semanas'), { min: 5, max: 8 }); // orden inverso
  assert.equal(api.ganttWeeks('inmediato'), null);
  assert.equal(api.ganttWeeks(''), null);
  assert.equal(api.ganttWeeks(null), null);
});

/* ---------- hash Veri*factu ---------- */
test('hashFactura: SHA-256 encadenado determinista', async () => {
  const h1 = await api.hashFactura('', 'PE-2026-001|2026-10-27|1000|1210');
  assert.match(h1, /^[0-9a-f]{64}$/);
  const h1b = await api.hashFactura('', 'PE-2026-001|2026-10-27|1000|1210');
  assert.equal(h1, h1b);                          // determinista
  const h2 = await api.hashFactura(h1, 'FA-2026-002|2026-11-02|900|1089');
  assert.notEqual(h1, h2);                        // cambia con el hash previo
  const h3 = await api.hashFactura(h1, 'FA-2026-003|2026-11-02|900|1089');
  assert.notEqual(h2, h3);                        // mismo previo, datos distintos
});

/* ---------- estimador de metros desde puntos (#3 mejoras) ---------- */
test('estimarMetros: vivienda típica 90 m² (20 ench + 10 int + 12 luz)', () => {
  const r = api.estimarMetros(20, 10, 12, 90);
  assert.equal(r.puntos, 42);
  assert.equal(r.tubo, 340);        // 42×7 + 90×0,5 = 339 → 340
  assert.equal(r.cab15, 180);       // (12+10)×7×1,15 = 177,1 → 180
  assert.equal(r.cab25, 160);       // 20×7×1,15 = 161 → 160
  assert.equal(r.cajillos, 42);     // uno por mecanismo
  assert.equal(r.jornadas, 5);      // ceil(340/80)
});
test('estimarMetros: mínimo de tubo y jornada aunque sea pequeño', () => {
  const r = api.estimarMetros(2, 1, 1, 30);
  assert.equal(r.tubo, 50);         // mínimo 50 m
  assert.equal(r.jornadas, 1);
  assert.equal(r.cajillos, 4);
});
test('estimarMetros: sin puntos → todo a cero (sin jornadas)', () => {
  const r = api.estimarMetros(0, 0, 0, 90);
  assert.equal(r.puntos, 0);
  assert.equal(r.jornadas, 0);      // no cobra jornada si no hay trabajo
  assert.equal(r.tubo, 50);         // el tubo conserva el mínimo
});
test('estimarMetros: acepta cadenas y negativos de un formulario', () => {
  const r = api.estimarMetros('8', '3', '4', '60');
  assert.equal(r.puntos, 15);
  assert.equal(r.cab25, 60);        // 8×7×1,15 = 64,4 → 60
  const n = api.estimarMetros(-5, 0, 0, 0);
  assert.equal(n.puntos, 0);        // negativos se recortan a 0
});

/* ---------- actualizador de precios (#6 mejoras) ---------- */
const PAT_LM = {
  cab25: { re: /H07V-?K[^\n]*2[,.]5\s*mm/i, modo: 'm' },
  difcomp: { re: /diferencial[^\n]*30\s*mA/i, modo: 'ud' },
};
test('parseLM: cable por metros — PVP del rollo ÷ IVA ÷ metros', () => {
  const r = api.parseLM('Cable LEXMAN H07V-K 100 metros 2,5 mm² 47,56 €/Rollo o 0,48 €/Metro', PAT_LM);
  assert.equal(r.length, 1);
  assert.equal(r[0].id, 'cab25');
  assert.equal(r[0].pvp, 47.56);
  assert.equal(r[0].metros, 100);            // "100 metros", no confunde con "2,5 mm"
  assert.equal(r[0].pvpSinIVA, 39.31);       // 47,56 ÷ 1,21
  assert.equal(r[0].final, 0.39);            // 39,31 / 100 m
});
test('parseLM: por unidades — diferencial con PVP', () => {
  const r = api.parseLM('Diferencial Schneider 2P 40 A 30 mA 30,25 €', PAT_LM);
  assert.equal(r.length, 1);
  assert.equal(r[0].pvpSinIVA, 25);
  assert.equal(r[0].final, 25);              // modo 'ud': sin dividir metros
});
test('parseLM: modo metros sin longitud de rollo → final 0 (se ignora)', () => {
  const r = api.parseLM('Cable H07V-K 2,5 mm² precio a consultar en tienda', PAT_LM);
  assert.equal(r.length, 0);                 // sin € no hay PVP
  const r2 = api.parseLM('Cable H07V-K 2,5 mm² 47,56 €', PAT_LM);
  assert.equal(r2.length, 1);
  assert.equal(r2[0].metros, 0);
  assert.equal(r2[0].final, 0);              // sin metros no puede calcular €/m
});
test('parseLM: texto vacío o sin patrones conocidos', () => {
  assert.equal(api.parseLM('', PAT_LM).length, 0);
  assert.equal(api.parseLM('Bombilla LED 12 W 9,99 €', PAT_LM).length, 0);
});

/* ---------- moneda ---------- */
test('cur: euro por defecto', () => {
  assert.equal(api.cur().sym, '€');
  assert.equal(api.cur().r, 1);
});
