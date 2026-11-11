# INSTRUCTIVO DE IMPLEMENTACIÓN — 10 MEJORAS
App: **Presupuesto Eléctrico PRO** (`presupuesto/`) · Guía para Claude Code · 09/11/2026
Companion de `docs/mejoras.txt` (mismo orden 1→10). Aquí se baja a código concreto.

---

## CÓMO USAR ESTA GUÍA

- Trabaja **fase por fase y en orden** (1→10). Cada fase es independiente salvo donde se indica (la 3 usa la 2; la 7 usa la 1).
- Antes de cada fase relee los archivos que vas a tocar. **No añadas dependencias ni build**: la app es HTML+JS clásico que corre con `file://` y offline (PWA).
- Al terminar CADA fase: `node scripts/check.mjs` debe dar **Todo correcto**, sube `CACHE` en `scripts/sw.js` (v9→v10→…) y prueba la app en el navegador.
- Idioma de UI y comentarios: **español**. Estilo del código: funciones globales, `@ts-check`, JSDoc ligero, helpers existentes (`esc()`, `money()`, `nfC`, `cur()`, `toast()`, `debounce()`, `LS()`).

### Mapa del código (anclajes reales, verificados)

| Qué | Dónde |
|---|---|
| Orden de carga | `index.html`, al final de `<body>`: `js/data.js` → `js/pure.js` → `js/calc.js` → `js/pdf.js` → `js/app.js` |
| Datos: `GRUPOS`, `PART_BY_ID`, `TT`, `MARCAS`, `MAT_ITEMS`, `EMISOR_DEF`, `LS()` | `js/data.js` |
| Puras: `money`, `nfC`, `chipVal`, `rebtSug`, `seccionCaida`, `redondeoTotal`, `totalLetra`… | `js/pure.js` |
| Render y cálculo: `renderGrupos`, `renderMec`, `renderLibres`, `renderAlb`, `renderTpls`, `pQty`, `pPr`, `calc`, `getState`, `applyState`, `migrate`, `save`, `nextNum`, `Store` | `js/calc.js` |
| PDF y ficheros: `rowsA`, `rowsB`, `buildPDF`, `buildFacturaPDF`, `askTipoPDF`, `dlTipo`, `pdfDownload`, `sharePDF`, `downloadBlob`, `jsonExport`, `buildAISchema`, `importAI` | `js/pdf.js` |
| Eventos y arranque: delegación `input`/`change`/`click`, `init()`, multi-obra (`pe-works`), tema, IndexedDB | `js/app.js` |
| HTML: secciones `sec-datos`…`sec-resumen` (steps 0–6), modales `#modal`, `#modal-tipo`, `#modal-works`, `#modal-import`, nav `#secnav` | `index.html` |

### Estado y persistencia (leer antes de tocar nada)

- Estado único del presupuesto: `localStorage['presu-electrico-pro-v3']` (const `KEY` en calc.js). Estructura `getState()`: `{v:5, vals:{}, chips:{}, libres:[], albs:[], wizard:bool}`.
  - `vals` guarda `el.value` de **todo input/select/textarea con `id` dentro de `#presu`** → toda UI nueva con `id` dentro de `#presu` se persiste sola (ojo: en checkbox `value` no refleja `checked`; para checkboxes usa persistencia explícita).
  - Cambios de esquema: bump `st.v` + rama nueva en `migrate()` (calculo.js). Si solo AÑADES claves opcionales no hace falta migrar (ausente = default).
- Otras claves `pe-*` existentes: `pe-works` (obras), `pe-tpls` (plantillas {n,q}), `pe-clients`, `pe-marcas`, `pe-niveles`, `pe-counters`, `pe-profile`, `pe-theme`, `pe-lastbackup`. Las nuevas siguen el patrón `pe-<cosa>`.
- Todo cambio de datos pasa por `calc(); save();` (o `Store.commit()`); para reemplazar estado completo usa `Store.apply(st)`.

### Cosas que YA EXISTEN (no las reimplémentes)

- **Margen sobre materiales**: input `#f-margen` (%, index.html sección Resumen) aplicado en `calc()` a `matA`; fila `#r-rowMargen`. También coeficiente global `#f-coef`.
- **Plantillas de cantidades**: `pe-tpls` + `renderTpls()` + botones `#btn-tpl-save` / `data-tpl-ap` (aplican `{q}` por `data-id`).
- **«Mis obras»** (biblioteca básica): `pe-works`, modal `#modal-works`, abrir/duplicar/archivar/borrar (`app.js` `guardarObraActual`, `renderObras`, `abrirObra`). Numeración correlativa `nextNum()` → `PE-2026-001`.
- **Tema claro/oscuro/auto** (`applyTheme`), **wizard por pasos**, **undo/redo**, **flechas ↑/↓** sobre inputs `[data-qty]`/`[data-free]`, **compartir PDF** (`sharePDF`), **export/import JSON+IA**, respaldo mensual, IndexedDB espejo.
- **Validez de la oferta**: select `#f-validez` ya existe en `sec-datos`.
- **Líneas libres globales**: `LIBRES` + `#libres-wrap` + `#btn-libre-add` (nombre/precio/cantidad, sin grupo).

---

## FASE 1 · Margen de beneficio: valor por defecto + aviso

**Estado actual**: el mecanismo existe (`f-margen` % sobre material) pero llega a **0** y casi nadie lo ve. El margen no debe salir en el PDF del cliente.

1. `index.html` (sección Resumen, junto a `#f-margen`, línea ~603): cambia `value="0"` → `value="25"` y añade un `<span class="tt" data-tip="...">?</span>` explicando: «% de beneficio sobre el precio de compra del material (tubo, cable, mecanismos). Recomendado 25–35%. No aparece en el PDF del cliente.»
2. `js/calc.js` en `calc()`: si `base>0 && matA>0 && margenPct===0`, pinta un aviso en un nuevo `<small id="margen-hint">` (junto al input): «⚠ Material sin margen (0%)». Si `margenPct>0`, texto vacío.
3. No toques `migrate()`: `f-margen` tiene `id` dentro de `#presu`, se persiste solo.

**Verificar**: app recién cargada → 25%; resumen muestra la fila «Beneficio sobre materiales»; poner 0 muestra el aviso; el PDF del cliente NO menciona margen.

## FASE 2 · Casilla «L+T+N ×3» en cables unipolares

**Estado actual**: los cables unipolares (`cab15, cab25, cab46, cab6, cabz15, cabz25, cabz4, cabz6` en `g-canal`, data.js) se presupuestan por metro de CABLE; el ×3 es manual (solo aviso en tooltip).

1. `js/data.js`: añade flag `ltn:true` a esas 8 partidas y documenta en el typedef `@property {boolean=} ltn`. (Ojo: las **mangueras** `mang325/mang36/rz1325` NO lo llevan: ya traen 3 conductores.)
2. `js/calc.js` `renderGrupos()`: si `p.ltn`, añade tras el input Cant. un checkbox
   `<label class="ltn" title="Un circuito lleva 3 conductores (fase+neutro+tetra): multiplica ×3 los metros escritos"><input type="checkbox" id="x3-${p.id}" data-ltn="${p.id}"> ×3 L+T+N</label>`.
   Dále `id` (para que el `change` de `#presu input[type=checkbox][id]` ya dispare `calc()+save()` gratis) pero NO confíes en `vals` para restaurarlo.
3. Persistencia explícita: en `getState()` añade `x3:Object.fromEntries($$('#presu [data-ltn]').map(c=>[c.dataset.ltn,c.checked]))`; en `applyState()`, antes de `calc()`, restaura: `Object.entries(st.x3||{}).forEach(([id,on])=>{const c=$('#x3-'+id); if(c) c.checked=!!on;})`. Sin migración (ausente = sin marcar).
4. `js/calc.js` `calc()`: para partidas `p.ltn`, cantidad efectiva `qEff = qty * (x3 marcado ? 3 : 1)`; `imp = qEff*pr`; y el texto de `[data-sub]` distinto: `${qty} m ×3 = ${qEff} m × ${pr} = …` cuando está marcada.
5. `js/pdf.js` `rowsA()`: misma lógica (lee `#x3-<id>` igual que calc; puedes exportar de calc.js un helper `ltnOn(id)` y reutilizarlo, pdf.js se carga después). La fila del PDF debe mostrar los metros efectivos.
6. CSS en `index.html`: estilo pequeño para `.ltn` (chip discreto).

**Verificar**: 30 m + casilla en `cab25` → sub «30 m ×3 = 90 m × 0,39 = 35,10 €»; recargar conserva la casilla; PDF muestra 90 m × 0,39; un presupuesto viejo (sin `x3`) carga igual.

## FASE 3 · Estimador de metros desde puntos

Depende de la FASE 2 (usa sus casillas). **Estado actual**: no existe nada similar.

1. `js/pure.js`: función pura `estimarMetros(ench,int_,luz,m2)` → `{tubo,cab15,cab25,cajillos,jornadas}` con constantes ajustables y redondeos a 10 m:
   - `puntos = ench+int_+luz`
   - `tubo   = r10(max(50, puntos*7 + m2*0.5))`
   - `cab15  = r10((luz+int_)*7*1.15)` · `cab25 = r10(ench*7*1.15)` (metros de CIRCUITO; el ×3 lo pone la casilla de FASE 2)
   - `cajillos = puntos` · `jornadas = max(1, ceil(tubo/80))`
   Añade tests en `tests/pure.test.mjs` siguiendo el estilo existente (mira cómo importa el módulo).
2. `index.html`: al inicio de `sec-canal` un `<details id="estimador">` con inputs `est-ench, est-int, est-luz, est-m2`, botón `#btn-estimar` y `#est-res` vacío.
3. `js/calc.js`: `estimar()` → llama a `estimarMetros()`, pinta en `#est-res` una tabla «concepto → metros calculados → checkbox aplicar (marcado)» y botón **Aplicar**: para cada fila marcada escribe `$('#q-<id>').value`, marca `#x3-cab15/#x3-cab25` (FASE 2) para cables, `calc(); save();` y hace `scroll` + clase `flash` breve en las filas rellenadas.
4. Delegación de clicks en `js/app.js` (bloque `document.addEventListener('click',…)`) o `onclick` directo como el resto de botones (`$('#btn-estimar').onclick=estimar` en app.js junto a los demás).

**Verificar**: 12 enchufes + 8 interruptores + 10 luces + 90 m² → tubo ≈ 260 m, cab15 ≈ 150 m con casilla ×3, cab25 ≈ 160 m con ×3, 30 cajillos, 3–4 jornadas; tras aplicar, todo se puede retocar a mano; los tests nuevos pasan.

## FASE 4 · Plantillas de fábrica (trabajos típicos)

**Estado actual**: el usuario puede guardar SUS plantillas (`pe-tpls`, `{n,q}` = cantidades por `data-id`). Faltan las de fábrica.

1. `js/data.js`: `const TPL_FACTORY=[ … ]` con 6 presets `{n,q}` (usa ids reales de GRUPOS y de MAT_ITEMS):
   - «Vivienda nueva 70 m²» / «Vivienda nueva 90 m²» / «Vivienda nueva 120 m²» (enchufes/interruptores/conmutaciones/puntos de luz/cajillos/tubo/cables con valores típicos, escala con m²)
   - «Reforma de cocina» (enchufes, fuerza, cable 2,5/6, jornada)
   - «Cambio de cuadro + boletín» (cajacgmp, iga, dif, pia×8, boletin)
   - «Línea exterior enterrada» (rz1325, tubo26, cajaestanca, mang36 si procede)
2. `js/app.js` `init()`: si `!LS('pe-tpls-seeded')`, haz `LS('pe-tpls', [...TPL_FACTORY, ...(LS('pe-tpls')||[])])` y `LS('pe-tpls-seeded',1)`. El listado/aplicar/borrar ya funciona con `renderTpls()` y `data-tpl-ap` (app.js:174-177): aplicar pone `q` en cada `.partida` (y **0 en las que no estén** en la plantilla: documéntalo en la UI con una nota bajo `#tpl-list`).
3. Nota UI en `index.html` bajo el bloque de plantillas (sec-canal): «Aplicar una plantilla sobrescribe las cantidades de las filas».

**Verificar**: primera carga muestra las 6 de fábrica + las propias; aplicar rellena cantidades; se pueden borrar; `pe-tpls-seeded` evita duplicarlas en cada arranque.

## FASE 5 · Biblioteca: búsqueda y «Nuevo presupuesto»

**Estado actual**: «Mis obras» ya guarda/abre/duplica/archiva (`pe-works`, `#modal-works`). Faltan filtro por texto y un flujo limpio para empezar el siguiente presupuesto sin perder el actual.

1. `index.html` modal `#modal-works`: input `#works-filtro` (placeholder «Filtrar por Nº o cliente…») sobre `#works-list`.
2. `js/app.js` `renderObras(filtro)`: filtra `arr` por `meta.num`/`meta.cliente` (case-insensitive) antes de pintar; `input` del filtro → `renderObras(v)` (debounce ya disponible).
3. Botón «Nuevo» en la topbar junto a «Mis obras» (`index.html`) → función `nuevoPresupuesto()` en app.js:
   1. `guardarObraActual(true)` (guarda silencioso del actual, conserva `WORK_ID` viejo),
   2. limpia: todos `#presu [data-qty],[data-free],#presu input[type=number][id^=q-]` a `0/''`, `LIBRES=[]; renderLibres()`, `ALBROWS=ALB_DEF.map(a=>({...a})); renderAlb()`, `[data-ltn]` sin marcar, campos de cliente (`f-cli-*`) vacíos,
   3. `$('#f-num').value=nextNum('PE')`, `f-fecha`= hoy, `f-ver`='' ,
   4. `WORK_ID=null` (para que el siguiente guardado cree obra nueva), `calc(); save(); toast('Presupuesto nuevo: '+num,'ok')`.

**Verificar**: hacer PE-001, guardar, «Nuevo» → PE-002 en limpio; ambos en «Mis obras»; el filtro encuentra por cliente.

## FASE 6 · Actualizador de precios (pegar listado Leroy Merlin)

**Estado actual**: `refp` vive en data.js y `pPr()` lo lee en vivo; no hay overrides. (No confundas con `precios.json`/`aplicarTarifasExternas`, que era para marcas/niveles.)

1. `js/pure.js`: función pura `parseLM(texto, patterns)` → `[{id, pvp, pvpSinIVA, unidad, fecha}]`. Estrategia por partida: cada patrón es una regex que casa el nombre (p. ej. `cab25: /H07V-?K[^\n]*2[,.]5\s*mm/i`), y el precio con IVA es el **primer `(\d+[.,]\d+)\s*€` tras el match**; los metros del rollo con `/(\d+)\s*m/` tras el nombre. Devuelve PVP, PVP÷1,21 y €/m (precio sin IVA ÷ metros).
2. Tabla `REFP_PAT` en `js/data.js`: para cada partida con `refp` (tubos, cables H07V-K y H07Z1-K, mangueras, cajillo, cajaestanca, borna, difcomp…) su(s) regex y si es €/m o €/ud.
3. `localStorage 'pe-refp'` = `{id: precio}` overrides + `'pe-refp-fecha'`. En `js/app.js` `init()`, **antes de `renderGrupos()`**: si hay overrides, `PART_BY_ID[id].refp = ovr[id]` (los chips se pintan de `p.refp`; `pPr()` ya lee en vivo).
4. UI: nuevo modal `#modal-precios` (copia el patrón de `#modal-import`): `<textarea>`, botón **Analizar** → tabla diff «Concepto · actual · nuevo (PVP→sin IVA) · [aplicar ☑]» con `parseLM()`, botón **Aplicar seleccionados** → guarda en `pe-refp`, repinta (`renderGrupos(); repriceChips(); calc(); save()`), toast con nº de cambios y fecha. Ábrelo desde un botón en el menú (`#menu-panel`) «Actualizar precios».
5. En `#modal-precios` muestra siempre «Última actualización: <fecha>»; si >90 días, aviso `toast(...,'err')` en `init()`.

**Verificar**: pegar el bloque «Cable LEXMAN H07V-K 100 metros 2,5 mm² … 47,56 €/Rollo o 0,48 €/Metro» → propone `cab25 = 0,39` (47,56÷1,21÷100); aplicar cambia el chip; recargar persiste; tests de `parseLM` en `tests/pure.test.mjs` pasan.

## FASE 7 · PDF más profesional

**Estado actual**: `f-validez` existe; el PDF (buildPDF, pdf.js) ya saca secciones/totales/firmas/cronograma. Faltan condiciones al pie, desglose opcional y «copia interna».

1. Verifica si `buildPDF()` imprime la validez (busca `f-validez` en pdf.js); si no, añádela junto a la fecha: «Validez de la oferta: `idv('f-validez')`».
2. `index.html` en `card-docs`: nuevo `<textarea id="f-condiciones">` con default «Pago: 50% a la entrega de materiales / 50% al finalizar. Garantía de 3 años en la instalación. Precio sujeto a no conformidades ocultas.» (se persiste solo por `vals`). `buildPDF()`: píntalo como bloque pequeño tras los totales.
3. Desglose opcional: checkbox `#f-pdf-desglose` en `card-docs` («incluir desglose Material / Mano de obra»). En `buildPDF()`, si está marcado, añade dos líneas tras la base usando `calc().matT/.moT` (pdf.js puede llamar `calc()`).
4. Copia interna: en el modal `#modal-tipo` añade botón «PDF interno (coste y margen)» → `dlTipo('interno')` → `buildPDF({interno:true})`: marca visible «COPIA INTERNA — NO ENVIAR AL CLIENTE» (cabecera, rojo) y añade tabla con `margenPct`, `margenAmt` (de `calc()`) y `costeM` si aplica. **Nunca** incluyas estos datos en el PDF normal.

**Verificar**: PDF cliente con validez + condiciones; con y sin desglose; PDF interno con margen y banda de aviso; la numeración ya sale de `f-num` (`nextNum`).

## FASE 8 · Estados y seguimiento de presupuestos

Depende de la FASE 5 (usa `pe-works`). **Estado actual**: `meta={num,ver,cliente,fecha,total,saved,arch}` sin estados.

1. Extiende `meta` con `estado` ('borrador'|'enviado'|'aceptado'|'rechazado', default 'borrador') y `fEnvio` (ISO). En `renderObras()` añade por fila un `<select data-work-estado>` con las 4 opciones + badge de color (borrador gris, enviado azul, aceptado verde, rechazado rojo) y la fecha de envío si la hay.
2. Delegación `change` en app.js: `t.matches('[data-work-estado]')` → actualiza `works[id].meta.estado` (y `fEnvio=new Date().toISOString()` al pasar a 'enviado'), `LS('pe-works',…); renderObras();`.
3. Al descargar/compartir PDF de tipo presupuesto (`pdfDownload`, `sharePDF`, `dlTipo('presupuesto')`): si la obra actual está guardada, ofrece marcar 'enviado' (toast con acción o preguntar con `confirm` suave estilo propio).
4. Bloque «Pendientes de respuesta» arriba de `#works-list`: obras con `estado==='enviado'` y `fEnvio` más antiguo de 7 días. Por cada una:
   - **WhatsApp**: `window.open('https://wa.me/?text='+encodeURIComponent(plantilla))` con plantilla «Hola {cliente}, te escribo por el presupuesto {num} ({total} €). ¿Has podido revisarlo? Un saludo, Carly».
   - **Recordatorio .ics**: `downloadBlob()` (pdf.js:670) con `BEGIN:VCALENDAR…VEVENT` DTSTART mañana 10:00, SUMMARY «Seguimiento {num} {cliente}». (Nota: .ics con fecha flotante `YYYYMMDDTHHMMSS`, sin TZ, es lo más portable.)

**Verificar**: marcar 'enviado' → aparece con fecha; forzar una `fEnvio` de hace 8 días (edita localStorage) → aparece en Pendientes; WhatsApp abre con el texto; el .ics se descarga y el calendario lo acepta.

## FASE 9 · Modo obra en el móvil

**Estado actual**: tema oscuro ya existe; las flechas ↑/↓ ya suben cantidades; falta una vista compacta táctil. **No toques el tema.**

1. `inputmode="decimal"` en TODOS los `<input type="number">` que se generan (`renderGrupos`, `renderMec`, `renderLibres`, `renderAlb`, estimador) y en los estáticos de `index.html` → teclado numérico en móvil.
2. Botones rápidos junto a Cant. en partidas `unit==='m'`: `+10 +25 +50` (mini botones `data-quick="+10"` con `data-target="<id>"`); delegación en el `click` global de app.js: suma al input, `calc(); save();`. (En la FASE 2, si existe `#x3-<id>`, los atajos suman metros de circuito, igual que teclear.)
3. Modo obra: botón topbar `#btn-obra` → `document.body.classList.toggle('obra')` + `LS('pe-obra',on)` restaurado en `init()`. CSS `body.obra`: `.p-row{flex-wrap:wrap}` (Cant. + atajos en una línea, chips en otra con scroll-x), `.partida{padding reducido}`, y la `#sumbar` (resumen superior) fija abajo tipo bottom-bar con `base` y `total` siempre visibles.
4. Prueba real en devtools a 390 px de ancho: nada exige zoom horizontal; total visible siempre.

**Verificar**: en 390 px, activar modo obra → filas a una columna, total fijo abajo; +10 suma 10 m; el teclado del móvil es numérico; la preferencia persiste.

## FASE 10 · Partidas personalizadas dentro de cada grupo

**Estado actual**: `LIBRES` (nombre/precio/cantidad) es una lista **global** en `#libres-wrap`. Faltan: añadirlas desde cada sección y que salgan en su sección del PDF.

1. Extiende cada libre con `g` (id del `div` del grupo) y `unit` opcional: `{n,p,q,g:'g-mec',unit:'ud'}`. Los estados viejos (sin `g`) se quedan en el bloque global actual (retrocompatible, sin migración).
2. `renderGrupos()`: al final de cada grupo añade botón discreto `<button data-libadd="g-XXX">+ Añadir línea</button>`. Delegación `click`: `LIBRES.push({n:'',p:0,q:1,g:…}); renderLibres(); calc(); save();`.
3. `renderLibres()`: pinta cada libre **dentro de su grupo** (`$('#'+L.g)`) con el mismo markup actual (`data-lib` n/p/q + `data-libdel`); las sin `g` siguen en `#libres-wrap`. La persistencia ya existe (`st.libres`), solo asegúrate de copiar `g`/`unit` en `getState()`.
4. `js/pdf.js` `rowsA()`: incluye cada libre en la sección de su grupo (busca cómo se pintan hoy las libres en `buildPDF` — con `libSum`/tabla — y reasignalás por sección); las globales, donde estén ahora.
5. Acepta `Enter` en el campo nombre para crear la siguiente línea (detalle de usabilidad, delegación `keydown`).

**Verificar**: «+ Añadir línea» en Mecanismos crea ahí «Ventilador de techo (suministrado por cliente)»; aparece en esa sección del PDF; recargar persiste; presupuestos antiguos con libres globales siguen viéndose y calculándose.

---

## CIERRE DE CADA FASE (checklist)

- [ ] `node scripts/check.mjs` → «Todo correcto» (sintaxis + tests; añade tests en `tests/pure.test.mjs` para toda lógica pura nueva: `estimarMetros`, `parseLM`,…)
- [ ] `scripts/sw.js`: `CACHE` +1 (los usuarios PWA reciben la versión nueva)
- [ ] Prueba manual en navegador: presupuesto guardado viejo carga sin errores (consola limpia)
- [ ] Sin cambios de esquema rotos: si tocaste `getState()`, comprobaste `migrate()` y un estado v5 viejo
- [ ] Nada de margen/coste interno se filtra al PDF del cliente (fases 1, 6, 7)

## FUERA DE ALCANCE

- No cambiar ids de partidas existentes (rompe presupuestos guardados y `vals`).
- No introducir frameworks, bundlers, ni dependencias npm nuevas (la app vive sin build y offline).
- No tocar `MARCAS`/`MAT_ITEMS`/ATMOSS salvo que una fase lo pida.
- `docs/precios.txt` es documentación de tarifas: si una fase cambia un `refp` de fábrica, actualiza también ese fichero.
