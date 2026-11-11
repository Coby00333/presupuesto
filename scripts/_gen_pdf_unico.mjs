#!/usr/bin/env node
/* Presupuesto ÚNICO Arganda 32 v2 — fusión de los 2 borradores de agregar.txt,
   aplicando las notas: manguera 3x10 (350 €), sin "entubada 2x16",
   cajas de registro 12 ud × (24 mat + 30 M.O.), extras "por confirmar". */
import { writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const VENDOR = 'C:/Users/carly/OneDrive/Desktop/Proyectos/presupuesto/vendor/';

const ctx = {
  console,
  btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  atob: (s) => Buffer.from(s, 'base64').toString('binary'),
  navigator: { userAgent: 'Node' },
  location: { origin: 'null' }
};
ctx.window = ctx; ctx.self = ctx;
vm.createContext(ctx);
vm.runInContext(readFileSync(VENDOR + 'jspdf.umd.min.js', 'utf8'), ctx, { filename: 'jspdf.umd.min.js' });
vm.runInContext(readFileSync(VENDOR + 'jspdf.plugin.autotable.min.js', 'utf8'), ctx, { filename: 'jspdf.plugin.autotable.min.js' });
const jsPDF = ctx.jspdf.jsPDF;

/* ---------- datos generales ---------- */
const FECHA = '02/11/2026';
const REF = 'PE-2026-006 · versión 2 (documento único)';

const EMISOR = [
  'EMISOR',
  'Carly Díaz Gutiérrez — Instalador electricista',
  'Calle Ayamonte 1, 2-3 · 29002 Málaga',
  'NIF 60478208F · Tel. 633 898 407',
  'eleinsta06@gmail.com',
  'RIIA 0023979287',
  'RC Zurich One · Póliza 00000169787371'
];
const CLIENTE = [
  'CLIENTE / PROMOTORA',
  'DOFITEC',
  'Obra: Vivienda + Anexo · Calle Arganda 32, Málaga',
  'Proyecto: REFORMA VIVIENDA CALLE ARGANDA 32',
  'torres&cascallana arquitectos',
  'Fecha: ' + FECHA + ' · Validez: 5 días hábiles',
  'Nº ' + REF
];

/* ---------- PARTIDA A · MATERIALES (filas: ref, desc, ud, cant, €/ud) ---------- */
const MAT = [
  { t: 'A.1 · MECANISMOS Y PUNTOS — material por marca + mano de obra', rows: [
    ['16.05.09', 'Bases de enchufe 16 A con toma de tierra (20 + 41 según borradores; = medición proyecto)', 'ud', 61, 25],
    ['16.05.01', 'Interruptores simples (3 + 4)', 'ud', 7, 20],
    ['16.05.03-04', 'Conmutadores — conmutación de 2 puntos (12 + 8)', 'ud', 20, 22],
    ['16.05.05', 'Cruzamientos — 3 o más puntos', 'ud', 3, 23],
    ['16.05.06', 'Timbre / zumbador diurno (con pulsador)', 'ud', 2, 20]
  ]},
  { t: 'A.2 · ACOMETIDA, CONTADOR Y PROTECCIONES', rows: [
    ['16.02.01', 'Módulo / caja para contador monofásico', 'ud', 2, 200],
    ['16.03.01', 'Línea de enlace (derivación individual) 4×25+1G16 mm² RZ1-K(AS) bajo tubo PE Ø90 mm — 35 m', 'ud', 2, 225],
    ['16.04.01', 'Caja modular para cuadro (36 módulos)', 'ud', 3, 80],
    ['16.04.01', 'IGA interruptor general automático monofásico 40 A', 'ud', 3, 140],
    ['16.04.01', 'Diferenciales 2P 40 A 30 mA', 'ud', 5, 35],
    ['16.04.01', 'PIA magnetotérmicos por circuito (C1…C9)', 'ud', 24, 20]
  ]},
  { t: 'A.3 · CANALIZACIONES, CABLEADO Y ACCESORIOS', rows: [
    ['16.05 / 16.06', 'Tubo corrugado Ø16–20 mm para empotrar (rollo 100 m) — 5 + 5 rollos', 'rollo', 10, 23],
    ['16.05 / 16.06', 'Tubo corrugado Ø25–40 mm para empotrar (rollo)', 'rollo', 5, 24],
    ['16.05.12', 'Cable 750 V 1×1,5 mm² (iluminación / maniobra)', 'importe', '—', null, 480],
    ['16.05.14-17', 'Cable 750 V 1×2,5 mm² (tomas de uso general)', 'importe', '—', null, 414],
    ['16.05.13/18', 'Cable 750 V 1×4/6 mm² (cocina, horno, lavadora, climatización)', 'importe', '—', null, 220],
    ['16.05', 'Regletas de conexión varias (clemas)', 'importe', '—', null, 30],
    ['—', 'Manguera 3×10 mm — material (partida añadida)', 'importe', '—', null, 350]
  ]}
];

/* ---------- PARTIDA B · MANO DE OBRA ---------- */
const MO = [
  { t: 'B.1 · MECANISMOS Y PUNTOS', rows: [
    ['16.05.01-05', 'Puntos de luz (preinstalación: corrugado + cable)', 'ud', 26, 10]
  ]},
  { t: 'B.2 · CANALIZACIONES Y CAJAS DE REGISTRO', rows: [
    ['16.05 / 16.06', 'Canalizaciones con tubo corrugado (2 + 5 jornadas)', 'ud', 7, 180],
    ['—', 'Cajas de registro — instalación y cableado (24 € de material + 30 € de M.O. por unidad)', 'ud', 12, 54]
  ]},
  { t: 'B.3 · TRAMITACIÓN', rows: [
    ['—', 'Tramitación administrativa y Boletín Eléctrico (CIE)', 'ud', 1, 250]
  ]}
];

/* ---------- PARTIDA C · DEL PROYECTO, POR CONFIRMAR ---------- */
const PC = [
  { t: 'C.1 · PUESTA A TIERRA (cap. 16.01)', rows: [
    ['16.01.01', 'Red de toma de tierra para estructura (55 m cobre desnudo 35 mm² + 6 picas + soldaduras)', 'ud', 1],
    ['16.01.02', 'Toma de tierra con pica de 2 m + arqueta de registro PP 30×30 (vivienda + anexo)', 'ud', 2],
    ['16.01.03', 'Red de equipotencialidad en baños — conductor rígido 4 mm² (3 vivienda + 2 anexo)', 'ud', 5]
  ]},
  { t: 'C.2 · CONTADORES Y CUADROS (cap. 16.02 / 16.04)', rows: [
    ['16.02.01', 'Caja de protección y medida CPM2-S4 + equipo de medida, con 2 subcontadores (centralización)', 'ud', 3],
    ['16.04.01', 'Cuadro de distribución Legrand electrif. elevada montado, conexionado y rotulado (completa las partidas A.2: IGA 25 A, 3 dif. 40 A/30 mA, 12 PIAs)', 'ud', 2]
  ]},
  { t: 'C.3 · INSTALACIÓN INTERIOR — OTROS MECANISMOS (cap. 16.05)', rows: [
    ['16.05.07', 'Tomas de TV', 'ud', 8],
    ['16.05.08', 'Tomas de teléfono / RJ45', 'ud', 8],
    ['16.05.10', 'Bases de enchufe estancas de superficie (zagúan, patios, terraza y A/A)', 'ud', 10],
    ['16.05.11', 'Bases de enchufe 25 A horno + vitro (tubo Ø32 + cable 6 mm²)', 'ud', 5]
  ]},
  { t: 'C.4 · INSTALACIÓN EXTERIOR (cap. 16.06)', rows: [
    ['16.06.01', 'Canalización subterránea de usos varios 3×6 mm² bajo tubo Ø50', 'm', 47],
    ['16.06.02', 'Alumbrado exterior de patio — canalización subterránea 3×2,5 mm² bajo tubo Ø50', 'm', 60],
    ['16.06.04', 'Arquetas de polipropileno 30×30×30', 'ud', 17]
  ]},
  { t: 'C.5 · ILUMINACIÓN — SOLO COLOCACIÓN, luminarias suministradas por la promotora (cap. 17)', rows: [
    ['17.02', 'Bloques autónomos de emergencia 1 h (2 entradas)', 'ud', 2],
    ['17.03-17.08', 'Luminarias orientables LED, portalámparas, regletas TL5, proyectores empotrables, tiras LED y transformadores', 'ud', 39]
  ]},
  { t: 'C.6 · TELECOMUNICACIONES (cap. 18) — preinstalación con cable guía', rows: [
    ['18.02-18.06', 'Preinstalación ICT: acometidas, canalizaciones de enlace e interiores, pares de cobre y fibra óptica', 'gl', 1]
  ]},
  { t: 'C.7 · CLIMATIZACIÓN Y VENTILACIÓN (cap. 19)', rows: [
    ['19.01', 'Sistema multisplit 2×1 inverter bomba de calor (anexo: salón + dormitorio)', 'ud', 1],
    ['19.02', 'Sistema multisplit 5×1 inverter bomba de calor (vivienda)', 'ud', 1],
    ['19.03', 'Ventilación mecánica controlada de baños y cocinas (VMC)', 'ud', 2]
  ]}
];

/* ---------- importes ---------- */
const rowImporte = (r) => (r.length === 6 ? r[5] : r[3] * r[4]);
const SUBT_MAT = MAT.flatMap(s => s.rows).reduce((s, r) => s + rowImporte(r), 0);
const SUBT_MO = MO.flatMap(s => s.rows).reduce((s, r) => s + rowImporte(r), 0);
const SUBTOTAL = SUBT_MAT + SUBT_MO;
const IVA = Math.round(SUBTOTAL * 21) / 100;
const TOTAL = SUBTOTAL + IVA;

/* ---------- formato ---------- */
function eur(n) {
  const [i, d] = n.toFixed(2).split('.');
  return i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + d;
}
const GRIS = [56, 62, 66];
const AZUL = [22, 61, 91];
const GRISCLA = [120, 128, 134];

/* ---------- documento ---------- */
const doc = new jsPDF({ unit: 'mm', format: 'a4' });
const W = 210, M = 16;
const autoTable = (o) => doc.autoTable(o);

function cabecera(pag) {
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(130);
  doc.text('Carly Díaz Gutiérrez · Instalador electricista · RIIA 0023979287', M, 10);
  doc.text('BORRADOR v2 · documento único', W - M, 10, { align: 'right' });
  doc.setDrawColor(210); doc.line(M, 12.5, W - M, 12.5);
}

function marcaAguaYpie(tot, pag) {
  doc.saveGraphicsState();
  doc.setGState(new ctx.jspdf.GState({ opacity: 0.14 }));
  doc.setFont('helvetica', 'bold'); doc.setFontSize(52); doc.setTextColor(120, 125, 130);
  doc.text('BORRADOR', W / 2, 175, { align: 'center', angle: 38 });
  doc.restoreGraphicsState();
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(130);
  doc.text(`Documento de borrador — pendientes las partidas «por confirmar» · pág. ${pag} de ${tot}`, W / 2, 291, { align: 'center' });
}

/* tabla con secciones: filas [ref, desc, ud, cant, €/ud, (importe)] */
function tablaPartidas(startY, titulo, grupos, conPie) {
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...AZUL);
  doc.text(titulo, M, startY);
  const body = [];
  grupos.forEach(g => {
    body.push([{ content: g.t, colSpan: 6, styles: { fillColor: [236, 240, 243], textColor: AZUL, fontStyle: 'bold', fontSize: 7.4, cellPadding: 1.4 } }]);
    g.rows.forEach(r => body.push(r));
  });
  const filas = body.map(r => Array.isArray(r) && typeof r[0] === 'string'
    ? [r[0], r[1], r[2], String(r[3]), r.length === 6 ? '—' : eur(r[4]), eur(rowImporte(r)) + ' €']
    : r);
  autoTable({
    startY: startY + 3,
    head: [['Cap.', 'Partida', 'Ud', 'Cant.', '€/ud', 'Importe']],
    body: filas,
    ...(conPie ? { foot: [['', conPie, '', '', '', eur(conPie === 'SUBTOTAL MATERIALES' ? SUBT_MAT : SUBT_MO) + ' €']] } : {}),
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 7.4, cellPadding: 1.5, textColor: GRIS, lineColor: [225, 228, 231], lineWidth: .15, valign: 'middle' },
    headStyles: { fillColor: AZUL, textColor: 255, fontStyle: 'bold', halign: 'left' },
    footStyles: { fillColor: [236, 240, 243], textColor: AZUL, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 17, fontSize: 6.6 },
      2: { cellWidth: 12, halign: 'center' },
      3: { cellWidth: 11, halign: 'center' },
      4: { cellWidth: 15, halign: 'right' },
      5: { cellWidth: 22, halign: 'right', fontStyle: 'bold' }
    },
    margin: { left: M, right: M }
  });
  return doc.lastAutoTable.finalY;
}

/* ---- página 1 ---- */
cabecera(1);
doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...AZUL);
doc.text('PRESUPUESTO DE INSTALACIÓN ELÉCTRICA', M, 22);
doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...GRIS);
doc.text('Reforma de vivienda · Calle Arganda 32, Málaga (vivienda + anexo)', M, 28);
doc.setFontSize(8); doc.setTextColor(120);
doc.text(`Nº ${REF} · Fecha ${FECHA} · Documento NO VÁLIDO COMO PRESUPUESTO DEFINITIVO`, M, 33);
doc.text('Fusiona los dos borradores v1 (1.473 € + 6.717 €) en un único presupuesto, agrupado por partidas relacionadas.', M, 37);

let y = 42;
doc.setFillColor(244, 246, 248);
doc.roundedRect(M, y, (W - 2 * M), 34, 2, 2, 'F');
doc.setFontSize(7.5);
EMISOR.forEach((t, i) => {
  doc.setFont('helvetica', i === 0 ? 'bold' : 'normal');
  doc.setTextColor(...(i === 0 ? AZUL : GRIS));
  doc.text(t, M + 4, y + 5 + i * 4.2);
});
CLIENTE.forEach((t, i) => {
  doc.setFont('helvetica', i === 0 ? 'bold' : 'normal');
  doc.setTextColor(...(i === 0 ? AZUL : GRIS));
  doc.text(t, W / 2 + 4, y + 5 + i * 4.2);
});
y += 38;

y = tablaPartidas(y, 'PARTE A · MATERIALES', MAT, 'SUBTOTAL MATERIALES') + 5;
doc.setFont('helvetica', 'italic'); doc.setFontSize(7); doc.setTextColor(130);
doc.text('Nota de fusión: cantidades sumadas de ambos borradores; tubo Ø16–20 unificado a 23 €/rollo (precio del borrador definitivo).', M, y);
doc.text('Los subtotales declarados en los borradores incluían 502 € en partidas sin desglose ni justificación: se eliminan.', M, y + 3.5);

/* ---- página 2 · mano de obra + resumen ---- */
doc.addPage(); cabecera(2);
y = tablaPartidas(20, 'PARTE B · MANO DE OBRA', MO, 'SUBTOTAL MANO DE OBRA Y TRAMITACIÓN') + 8;

autoTable({
  startY: y,
  head: [['', 'RESUMEN — PRESUPUESTO ÚNICO']],
  body: [
    ['Materiales (Parte A)', eur(SUBT_MAT) + ' €'],
    ['Mano de obra y tramitación (Parte B)', eur(SUBT_MO) + ' €'],
    ['Subtotal instalación eléctrica', eur(SUBTOTAL) + ' €'],
    ['Base imponible', eur(SUBTOTAL) + ' €'],
    ['IVA 21 %', eur(IVA) + ' €'],
    ['TOTAL (I.V.A. incluido)', eur(TOTAL) + ' €']
  ],
  theme: 'plain',
  styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.4, textColor: GRIS },
  headStyles: { fillColor: AZUL, textColor: 255, fontStyle: 'bold' },
  columnStyles: { 0: { cellWidth: 60 }, 1: { halign: 'right', fontStyle: 'bold' } },
  margin: { left: M, right: M },
  didParseCell: d => { if (d.section === 'body' && d.row.index === 5) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.textColor = AZUL; d.cell.styles.fontSize = 8.6; } }
});
y = doc.lastAutoTable.finalY + 4;
doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(...GRIS);
doc.text('Son ' + eur(TOTAL) + ' € (diez mil cuatrocientos cincuenta y cinco euros con sesenta y un céntimos).', M, y);
doc.text('Las partidas de la Parte C (por confirmar) NO están incluidas en estos importes.', M, y + 4);

/* ---- página 3 · partidas por confirmar ---- */
doc.addPage(); cabecera(3);
doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...AZUL);
doc.text('PARTE C · PARTIDAS DEL PROYECTO DEL ARQUITECTO — PRECIO POR CONFIRMAR', M, 20);
doc.setFont('helvetica', 'normal'); doc.setFontSize(7.6); doc.setTextColor(...GRIS);
doc.text('Partidas de la medición (torres&cascallana) que no tienen precio en los borradores. Pendientes de valoración.', M, 24.5);
const pcBody = [];
PC.forEach(g => {
  pcBody.push([{ content: g.t, colSpan: 4, styles: { fillColor: [236, 240, 243], textColor: AZUL, fontStyle: 'bold', fontSize: 7.4, cellPadding: 1.4 } }]);
  g.rows.forEach(r => pcBody.push(r));
});
autoTable({
  startY: 27,
  head: [['Cap.', 'Partida', 'Ud', 'Cant.']],
  body: pcBody.map(r => Array.isArray(r) && typeof r[0] === 'string' ? [r[0], r[1], r[2], String(r[3])] : r),
  theme: 'grid',
  styles: { font: 'helvetica', fontSize: 7.4, cellPadding: 1.5, textColor: GRIS, lineColor: [225, 228, 231], lineWidth: .15, valign: 'middle' },
  headStyles: { fillColor: GRISCLA, textColor: 255, fontStyle: 'bold', halign: 'left' },
  columnStyles: { 0: { cellWidth: 17, fontSize: 6.6 }, 2: { cellWidth: 12, halign: 'center' }, 3: { cellWidth: 11, halign: 'center' } },
  margin: { left: M, right: M }
});
y = doc.lastAutoTable.finalY + 5;
doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(130);
[
  'Los circuitos C1–C11 de vivienda y anexo (alumbrado, usos varios, cocina, lavadora/lavavajillas/termo, secadora, baños/cocina, A/A y alimentación a cuadro secundario) quedan incluidos en la partida B.2 de canalizaciones.',
  'Las arquetas de obra de fábrica 50×50×50 (3 ud) las ejecuta la constructora: ver exclusiones.'
].forEach((t, i) => doc.text('· ' + t, M, y + i * 3.5));

/* ---- página 4 · cronograma, exclusiones y firmas ---- */
doc.addPage(); cabecera(4);

doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...AZUL);
doc.text('CRONOGRAMA DE EJECUCIÓN', M, 20);
autoTable({
  startY: 23,
  head: [['Fase', 'Trabajos', 'Plazo']],
  body: [
    ['1 · Preparación', 'Marcado de trazados y protección de la obra', 'A convenir'],
    ['2 · Rozas y picado', 'Picado de regatas, cajetines y huecos (ayudas de albañilería — constructora)', '—'],
    ['3 · Canalizaciones', 'Tubos, cables, cuadro general y protecciones', '—'],
    ['4 · Mecanismos', 'Colocación de mecanismos, pruebas y ajustes', '—'],
    ['5 · Tramitación', 'Certificado de instalación y Boletín Eléctrico (CIE)', 'Incluido · 1 sem']
  ],
  theme: 'grid',
  styles: { font: 'helvetica', fontSize: 7.6, cellPadding: 1.6, textColor: GRIS, lineColor: [225, 228, 231], lineWidth: .15 },
  headStyles: { fillColor: AZUL, textColor: 255, fontStyle: 'bold', halign: 'left' },
  columnStyles: { 0: { cellWidth: 34, fontStyle: 'bold' }, 2: { cellWidth: 30 } },
  margin: { left: M, right: M }
});
doc.setFont('helvetica', 'normal'); doc.setFontSize(7.6); doc.setTextColor(...GRIS);
doc.text('Duración estimada del conjunto: 4 semanas desde la aprobación y el arranque de obra.', M, doc.lastAutoTable.finalY + 5);

autoTable({
  startY: doc.lastAutoTable.finalY + 12,
  head: [['EXCLUSIONES', 'CONDICIONES']],
  body: [
    ['Rozas y albañilería (constructora)', 'Forma de pago: 50 % al inicio / 50 % a la finalización'],
    ['Arquetas de obra de fábrica 50×50×50 (constructora)', 'Validez de la oferta: 5 días hábiles desde la fecha del documento'],
    ['Suministro de luminarias (promotora) — solo colocación, por confirmar', 'Precios orientativos: pueden variar si no se aprueba en las 48 h siguientes'],
    ['Parte C completa: precio por confirmar', 'Garantía: 3 años sobre la instalación conforme a normativa vigente'],
    ['Gastos generales', 'Ejecución: 1 instalador · Precios «todo incluido» en mecanismos (marca + caja + tubo + cable + M.O.)'],
    ['', 'RGPD (UE) 2016/679 y LOPDGDD 3/2018: datos usados solo para este presupuesto y su ejecución']
  ],
  theme: 'grid',
  styles: { font: 'helvetica', fontSize: 7.4, cellPadding: 1.6, textColor: GRIS, lineColor: [225, 228, 231], lineWidth: .15, valign: 'top' },
  headStyles: { fillColor: GRISCLA, textColor: 255, fontStyle: 'bold', halign: 'left' },
  columnStyles: { 0: { cellWidth: (W - 2 * M) / 2 }, 1: { cellWidth: (W - 2 * M) / 2 } },
  margin: { left: M, right: M }
});

doc.setFont('helvetica', 'italic'); doc.setFontSize(7.6); doc.setTextColor(...GRIS);
doc.text('La firma implica la aceptación del presupuesto ' + REF + ', importes, exclusiones y condiciones.', M, 262);
doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
doc.text('Firma del cliente (aceptación): ______________________', M, 272);
doc.text('Firma del instalador: ______________________', W - M, 272, { align: 'right' });

/* marca de agua y pie en todas las páginas */
const TOT = doc.getNumberOfPages();
for (let p = 1; p <= TOT; p++) { doc.setPage(p); marcaAguaYpie(TOT, p); }

/* guardar */
const out = path.join(dir, 'Presupuesto Arganda 32 v2 (unico).pdf');
writeFileSync(out, Buffer.from(doc.output('arraybuffer')));
console.log('OK →', out, '·', doc.getNumberOfPages(), 'páginas');
console.log('Materiales:', eur(SUBT_MAT), '· M.O.:', eur(SUBT_MO), '· Subtotal:', eur(SUBTOTAL), '· IVA:', eur(IVA), '· TOTAL:', eur(TOTAL));
