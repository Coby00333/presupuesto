/* tests/dom.test.mjs — Tests de interfaz con jsdom (#2 mejoras2)
   La app es DOM clásico sin build: montamos index.html con los 5 módulos
   inlineados en un JSDOM (runScripts:'dangerously') y probamos el flujo real
   de arranque, cantidades, totales, IVA mixto y persistencia del formulario.
   jsdom no trae fetch/indexedDB/serviceWorker/crypto.subtle: la app ya los
   guarda, así que el arranque debe completarse sin errores de script.
   Requiere `npm install` dentro de scripts/ (jsdom); si falta, se omite.
   Ejecutar: npm test (scripts/) · node --test tests/ (raíz) */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* jsdom vive en scripts/node_modules (la raíz no tiene package.json): se
   resuelve desde allí para poder lanzar los tests desde cualquier cwd. */
let JSDOM, VirtualConsole;
try {
  const req = createRequire(path.resolve(ROOT, 'scripts', 'package.json'));
  ({ JSDOM, VirtualConsole } = req('jsdom'));
} catch { /* sin dependencias instaladas: todo el fichero se marca skip */ }
const hasDom = !!JSDOM;

/** Errores de script capturados durante el arranque (sin el ruido "Not implemented"). */
let scriptErrors = [];

/** Monta la app: index.html con los módulos inlineados en el orden de producción.
    OJO: split/join en vez de String.replace — replace interpretaría los «$$»
    del código fuente como patrones de sustitución y lo corrompería. */
function boot() {
  let html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  for (const f of ['data', 'pure', 'calc', 'pdf', 'app']) {
    const src = readFileSync(path.join(ROOT, 'js', `${f}.js`), 'utf8');
    html = html.split(`<script src="js/${f}.js"></script>`).join(`<script>\n${src}\n</script>`);
  }
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => {
    if (!/not implemented/i.test(String(e && e.message))) scriptErrors.push(String((e && e.message) || e));
  });
  return new JSDOM(html, {
    url: 'https://localhost/',      // habilita localStorage/sessionStorage
    runScripts: 'dangerously',
    pretendToBeVisual: true,        // requestAnimationFrame
    virtualConsole: vc,
  });
}

let dom;
test.after(() => { if (dom) dom.window.close(); });   // corta los timers de init()

/** init() es async y continúa en microtareas: espera a que termine de renderizar. */
const flush = () => new Promise(r => setTimeout(r, 60));

/** "1.234,56 €" → 1234.56 */
function eur(s) {
  return parseFloat(String(s).replace(/[€\s.]/g, '').replace(',', '.')) || 0;
}

test('arranque: módulos cargados y partidas renderizadas sin errores', { skip: !hasDom }, async () => {
  dom = boot();
  await flush();
  const d = dom.window.document;
  assert.equal(scriptErrors.length, 0, `errores de script en el arranque: ${scriptErrors.join(' | ')}`);
  assert.equal(typeof dom.window.calc, 'function', 'calc() debe ser global');
  assert.equal(typeof dom.window.getState, 'function');
  assert.ok(d.querySelectorAll('.partida[data-id]').length >= 10, 'debe pintar el catálogo de partidas');
  assert.ok(d.getElementById('s-T'), 'debe existir el total #s-T');
});

test('cantidades: rellenar enchufes actualiza Base y Total', { skip: !hasDom }, () => {
  const d = dom.window.document;
  const q = d.querySelector('.partida[data-id="enchufes"] [data-qty]');
  assert.ok(q, 'la partida «enchufes» existe');
  q.value = '10';
  dom.window.calc();
  assert.ok(eur(d.getElementById('s-base').textContent) > 0, 'la base debe ser > 0');
  assert.ok(eur(d.getElementById('s-T').textContent) > eur(d.getElementById('s-base').textContent),
    'el total incluye IVA y debe superar a la base');
});

test('×3 L+T+N: marcar el juego completo triplica el cable', { skip: !hasDom }, () => {
  const d = dom.window.document, w = dom.window;
  const setX3 = on => { const x = d.querySelector('.partida[data-id="cab25"] [data-ltn]'); x.checked = on; };
  const tot = () => { w.calc(); return eur(d.getElementById('s-T').textContent); };
  const q = d.querySelector('.partida[data-id="cab25"] [data-qty]');
  assert.ok(q && d.querySelector('.partida[data-id="cab25"] [data-ltn]'), 'cab25 debe ofrecer ×3');
  q.value = '0'; const t0 = tot();               // sin cable: extras fijos si los hay
  q.value = '10'; setX3(false); const t1 = tot(); // 10 m
  setX3(true); const t2 = tot();                  // 30 m (fase+neutro+tierra)
  const imp = t1 - t0;
  assert.ok(imp > 0, 'el cable con cantidad debe sumar importe');
  assert.ok(Math.abs((t2 - t1) - 2 * imp) <= Math.max(0.05, imp * 0.02),
    `esperaba triplicar el cable: +10 m→${t1} €, ×3→${t2} € (base sin cable ${t0} €)`);
});

test('IVA mixto: el interruptor muestra el reparto y la etiqueta cambia', { skip: !hasDom }, () => {
  const d = dom.window.document, w = dom.window;
  const mix = d.getElementById('f-iva-mixto'), wrap = d.getElementById('f-iva-p10-wrap');
  assert.ok(mix && wrap, 'deben existir #f-iva-mixto y #f-iva-p10-wrap');
  mix.checked = true;
  mix.dispatchEvent(new w.Event('change', { bubbles: true }));   // handler delegado
  assert.notEqual(wrap.style.display, 'none', 'el campo % al 10 debe verse');
  d.querySelector('.partida[data-id="enchufes"] [data-qty]').value = '10';
  d.getElementById('f-iva-p10').value = '60';
  w.calc();
  assert.match(d.getElementById('r-iva-label').textContent, /10% \+ 21%/, 'la etiqueta debe anunciar el doble IVA');
  assert.match(d.getElementById('r-iva-label').textContent, /60/, 'y el reparto 60/40');
});

test('persistencia: getState/applyState devuelven el formulario a su estado', { skip: !hasDom }, () => {
  const d = dom.window.document, w = dom.window;
  /* #8 mejoras2 (fase 2): getState() ya no lee el DOM — los cambios de usuario
     pasan por eventos reales (así los captura el listener delegado + fieldSync) */
  const type = (el, v) => { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
  const q = d.querySelector('.partida[data-id="enchufes"] [data-qty]');
  type(q, '12');
  const mix = d.getElementById('f-iva-mixto');
  mix.checked = true;
  mix.dispatchEvent(new w.Event('change', { bubbles: true }));
  const st = w.getState();
  assert.equal(st.vals['f-iva-mixto'], '1', 'los checkbox se guardan como 1/0');
  type(q, '0');
  mix.checked = false;
  w.applyState(st);
  assert.equal(q.value, '12', 'la cantidad se restaura');
  assert.equal(mix.checked, true, 'y también el checkbox');
});

test('obras (#5 mejoras2): guardar, leer por worksGet() y duplicar', { skip: !hasDom }, () => {
  const d = dom.window.document, w = dom.window;
  assert.equal(typeof w.worksGet, 'function', 'worksGet() debe ser global');
  const cn = d.getElementById('f-cli-nombre');
  cn.value = 'Cliente de prueba';
  cn.dispatchEvent(new w.Event('input', { bubbles: true }));   /* fase 2: memoria vía evento */
  w.guardarObraActual(true);
  const works = w.worksGet();
  const ids = Object.keys(works);
  assert.ok(ids.length >= 1, 'debe haber al menos una obra guardada');
  const hit = works[ids[ids.length - 1]];
  assert.equal(hit.meta.cliente, 'Cliente de prueba');
  assert.ok(hit.state && hit.state.vals, 'la obra conserva su getState() completo');
  /* duplicar vía el click delegado: la copia nace en borrador con nº nuevo (#8) */
  const btn = d.createElement('button');
  btn.setAttribute('data-work-dup', ids[ids.length - 1]);
  d.body.appendChild(btn);
  btn.click();
  const works2 = w.worksGet();
  assert.equal(Object.keys(works2).length, ids.length + 1, 'duplicar añade una obra nueva');
  const nid = Object.keys(works2).find(k => !ids.includes(k));
  const copia = works2[nid];
  assert.equal(copia.meta.estado, 'borrador', 'la copia empieza en borrador');
  assert.notEqual(copia.meta.num, hit.meta.num, 'y recibe numeración propia');
  btn.remove();
});

test('#8 mejoras2 (fase 1): líneas libres viven en memoria, el DOM es reflejo', { skip: !hasDom }, () => {
  const d = dom.window.document, w = dom.window;
  const type = (el, v) => { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
  /* añadir una línea de grupo y una global */
  w.addLibre('g-canal'); w.addLibre(null);
  assert.equal(d.querySelectorAll('.lib-row').length, 2, 'dos filas pintadas');
  /* editar la del grupo por el input delegado → queda en memoria (getState) */
  type(d.querySelector('[data-lib="n"][data-i="0"]'), 'Rozas extra');
  type(d.querySelector('[data-lib="p"][data-i="0"]'), '150');
  type(d.querySelector('[data-lib="q"][data-i="0"]'), '2');
  const st = w.getState();
  assert.equal(st.libres.length, 2);
  /* campo a campo: deepStrictEqual compara prototipos y los objetos del realm
     de jsdom no son "iguales" a los literales de Node */
  assert.equal(st.libres[0].g, 'g-canal');
  assert.equal(st.libres[0].n, 'Rozas extra');
  assert.equal(st.libres[0].p, 150);
  assert.equal(st.libres[0].q, 2);
  /* el cálculo pinta el subtotal desde la memoria */
  w.calc();
  const sub = d.querySelector('[data-lib="p"][data-i="0"]').closest('.lib-row').querySelector('[data-sub]');
  assert.match(sub.textContent, /300/, 'el subtotal de 150×2 debe pintarse');
  /* borrar la segunda: desaparece de memoria Y del DOM, y repintar no la revive */
  d.querySelector('[data-libdel="1"]').click();
  assert.equal(w.getState().libres.length, 1, 'la línea borrada no vuelve ni por getState');
  w.renderLibres();
  assert.equal(d.querySelectorAll('.lib-row').length, 1, 'ni tras repintar desde memoria');
  assert.equal(w.getState().libres[0].n, 'Rozas extra', 'la que queda es la buena');
});

test('#8 mejoras2 (fase 1): albañilería en memoria y applyState limpia bien', { skip: !hasDom }, () => {
  const d = dom.window.document, w = dom.window;
  const type = (el, v) => { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
  const n0 = w.getState().albs.length;
  d.getElementById('btn-alb-add').click();
  assert.equal(w.getState().albs.length, n0 + 1, 'añadir fila = +1 en memoria');
  const id = w.getState().albs[n0].id;
  type(d.querySelector(`#alb-rows .alb-row[data-id="${id}"] [data-albh]`), '3');
  assert.equal(w.getState().albs.find(a => a.id === id).h, 3, 'las horas editadas quedan en memoria');
  d.querySelector(`[data-albdel="${id}"]`).click();
  assert.equal(w.getState().albs.length, n0, 'borrar fila la quita de memoria y repinta');
  /* aplicar un estado sin albañilería debe limpiar las filas (antes no lo hacía) */
  w.applyState({ v: 5, vals: {}, chips: {}, x3: {}, libres: [], albs: [], wizard: false });
  assert.equal(d.querySelectorAll('#alb-rows .alb-row').length, 0, 'applyState con albs:[] limpia las filas');
  assert.equal(d.querySelectorAll('.lib-row').length, 0, 'y también las libres');
});

test('#8 mejoras2 (fase 2): vals/chips/x3 viven en memoria, no en el DOM', { skip: !hasDom }, () => {
  const d = dom.window.document, w = dom.window;
  const type = (el, v) => { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
  /* escritura de usuario → memoria */
  const q = d.querySelector('.partida[data-id="enchufes"] [data-qty]');
  assert.ok(q && q.id, 'la cantidad de enchufes debe tener id q-*');
  type(q, '7');
  assert.equal(w.getState().vals[q.id], '7', 'el input delegado actualiza VALS');
  /* casilla ×3 → X3 y (por paridad de formato) también VALS */
  const x = d.querySelector('.partida[data-id="cab25"] [data-ltn]');
  x.checked = true;
  x.dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.equal(w.getState().x3['cab25'], true, 'la casilla L+T+N entra en X3');
  assert.equal(w.getState().vals[x.id], '1', 'y también en vals');
  /* nivel de precio (radio pr-*) → CHIPS por índice */
  const r = d.querySelector('.partida[data-id="enchufes"] input[type=radio][data-idx="0"]');
  r.checked = true;
  r.dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.equal(w.getState().chips['enchufes'], 0, 'el radio elegido entra en CHIPS por índice');
  /* escritor programático → DOM y memoria siempre juntos */
  w.setField('f-ver', 'v9');
  assert.equal(d.getElementById('f-ver').value, 'v9', 'setField pinta el DOM');
  assert.equal(w.getState().vals['f-ver'], 'v9', 'y actualiza la memoria');
  /* getState ya NO lee el formulario: un .value a pelo (sin evento) no contamina el estado */
  q.value = '99';
  assert.equal(w.getState().vals[q.id], '7', 'la memoria manda sobre el DOM');
});
