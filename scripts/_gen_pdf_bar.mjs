#!/usr/bin/env node
/* Presupuesto BORRADOR Bar «Paréntesis» (bar centro) — materiales + mano de obra, IVA 21 %.
   Fuente: Bar centro/info.txt (trabajo/M.O./material, tarifas Leroy Merlin sin IVA). */
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
const REF = 'PB-2026-001 · versión 1 (borrador)';

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
  'CLIENTE',
  'Bar Paréntesis',
  'Obra: reforma y adecuación eléctrica del local (bar centro)',
  'Málaga',
  'Fecha: ' + FECHA + ' · Validez: 5 días hábiles',
  'Nº ' + REF
];

/* ---------- PARTE A · MATERIALES (sin IVA; filas: ref, desc, ud, cant, €/ud) ---------- */
const MAT = [
  { t: 'A.1 · PROTECCIONES Y CUADRO', rows: [
    ['A1', 'Magnetotérmico bipolar 10 A R9 Schneider (circuito de alumbrado C1)', 'ud', 1, 7.00],
    ['A2', 'Cuadro eléctrico FAMATEL Nuova 14 módulos, de superficie (cuadro secundario)', 'ud', 1, 17.60],
    ['A3', 'Caja estanca seccionadora con puente de 100 A (acometida)', 'ud', 1, 8.68]
  ]},
  { t: 'A.2 · EMERGENCIAS Y CANALIZACIONES', rows: [
    ['A4', 'Luz de emergencia 120 lm blanco neutro', 'ud', 1, 15.00],
    ['A5', 'Manguera LEXMAN H07RV-K negra 3×1,5 mm² · rollo de 5 m (alimentación a la columna)', 'ud', 1, 13.00],
    ['A6', 'Canaleta adhesiva TEHALIT blanca 15×15 mm · barra de 2 m (8 m en total)', 'ud', 4, 3.21]
  ]},
  { t: 'A.3 · TOMA DE TIERRA', rows: [
    ['A7', 'Pica de cobre 1500×15×15 mm', 'ud', 1, 7.02],
    ['A8', 'Grapa de latón 28×48×10 mm (fijación de la pica)', 'ud', 1, 1.07]
  ]}
];

/* ---------- PARTE B · MANO DE OBRA Y SERVICIOS ---------- */
const MO = [
  { t: 'B.1 · CIRCUITOS, CUADROS Y PROTECCIONES', rows: [
    ['B1', 'C1 alumbrado — instalación de magnetotérmico 10 A', 'ud', 1, 60],
    ['B2', 'Cuadro secundario (IGA + diferencial + PIA 10 A) — montaje y conexionado', 'ud', 1, 180],
    ['B3', 'Limpieza de cuadro: eliminar circuitos anulados, retirar cuadro antiguo, definir y etiquetar circuitos', 'ud', 1, 200],
    ['B4', 'Separar el alumbrado del carril central del circuito C2', 'ud', 1, 20],
    ['B5', 'Subir al techo la manguera del circuito general', 'ud', 1, 40]
  ]},
  { t: 'B.2 · EMERGENCIAS E ILUMINACIÓN', rows: [
    ['B6', 'Instalar 1 lámpara de emergencia', 'ud', 1, 25],
    ['B7', 'Cablear a la columna (alimentación de la emergencia)', 'ud', 1, 25],
    ['B8', 'Retirar la lámpara de emergencia en mal estado', 'ud', 1, 25],
    ['B9', 'Conectar el LED del espejo', 'ud', 1, 25],
    ['B10', 'Revisar / sustituir alumbrado central planta 1 (material de sustitución aparte)', 'ud', 1, 15]
  ]},
  { t: 'B.3 · INSTALACIONES VARIAS', rows: [
    ['B11', 'Agregar toma de tierra (pica y cable)', 'ud', 1, 120],
    ['B12', 'Tendido de tubo para la nueva acometida', 'ud', 1, 40],
    ['B13', 'Fijar 1 caja de superficie a la pared', 'ud', 1, 20],
    ['B14', 'Canaleta del aseo', 'ud', 1, 30]
  ]},
  { t: 'B.4 · SERVICIOS', rows: [
    ['B15', 'Transporte de mercancías', 'ud', 1, 80]
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

function cabecera() {
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(130);
  doc.text('Carly Díaz Gutiérrez · Instalador electricista · RIIA 0023979287', M, 10);
  doc.text('BORRADOR · Bar Paréntesis', W - M, 10, { align: 'right' });
  doc.setDrawColor(210); doc.line(M, 12.5, W - M, 12.5);
}

function marcaAguaYpie(tot, pag) {
  doc.saveGraphicsState();
  doc.setGState(new ctx.jspdf.GState({ opacity: 0.14 }));
  doc.setFont('helvetica', 'bold'); doc.setFontSize(52); doc.setTextColor(120, 125, 130);
  doc.text('BORRADOR', W / 2, 175, { align: 'center', angle: 38 });
  doc.restoreGraphicsState();
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(130);
  doc.text(`Documento de borrador — pendiente de confirmación · pág. ${pag} de ${tot}`, W / 2, 291, { align: 'center' });
}

/* tabla con secciones: filas [ref, desc, ud, cant, €/ud] */
function tablaPartidas(startY, titulo, grupos, pieLabel, pieImporte) {
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...AZUL);
  doc.text(titulo, M, startY);
  const body = [];
  grupos.forEach(g => {
    body.push([{ content: g.t, colSpan: 6, styles: { fillColor: [236, 240, 243], textColor: AZUL, fontStyle: 'bold', fontSize: 7.4, cellPadding: 1.4 } }]);
    g.rows.forEach(r => body.push(r));
  });
  const filas = body.map(r => Array.isArray(r) && typeof r[0] === 'string'
    ? [r[0], r[1], r[2], String(r[3]), eur(r[4]), eur(rowImporte(r)) + ' €']
    : r);
  autoTable({
    startY: startY + 3,
    head: [['Ref.', 'Partida', 'Ud', 'Cant.', '€/ud', 'Importe']],
    body: filas,
    foot: [['', pieLabel, '', '', '', eur(pieImporte) + ' €']],
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 7.4, cellPadding: 1.5, textColor: GRIS, lineColor: [225, 228, 231], lineWidth: .15, valign: 'middle' },
    headStyles: { fillColor: AZUL, textColor: 255, fontStyle: 'bold', halign: 'left' },
    footStyles: { fillColor: [236, 240, 243], textColor: AZUL, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 10, fontSize: 6.8 },
      2: { cellWidth: 11, halign: 'center' },
      3: { cellWidth: 11, halign: 'center' },
      4: { cellWidth: 15, halign: 'right' },
      5: { cellWidth: 22, halign: 'right', fontStyle: 'bold' }
    },
    margin: { left: M, right: M }
  });
  return doc.lastAutoTable.finalY;
}

/* ---- página 1 ---- */
cabecera();
doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...AZUL);
doc.text('PRESUPUESTO DE INSTALACIÓN ELÉCTRICA', M, 22);
doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...GRIS);
doc.text('Bar «Paréntesis» · reforma y adecuación eléctrica · Málaga (centro)', M, 28);
doc.setFontSize(8); doc.setTextColor(120);
doc.text(`Nº ${REF} · Fecha ${FECHA} · Documento NO VÁLIDO COMO PRESUPUESTO DEFINITIVO`, M, 33);

let y = 38;
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

y = tablaPartidas(y, 'PARTE A · MATERIALES (precios sin IVA)', MAT, 'SUBTOTAL MATERIALES', SUBT_MAT) + 5;
doc.setFont('helvetica', 'italic'); doc.setFontSize(7); doc.setTextColor(130);
[
  'Precios de material sin IVA según tarifas Leroy Merlin del 02/11/2026; el IVA 21 % se aplica una sola vez en el resumen.',
  'El magnetotérmico 10 A figuraba repetido en las notas de obra: se presupuesta 1 ud; si el cuadro secundario necesita su propio PIA 10 A: +7,00 €.',
  'No se han presupuestado IGA ni diferencial del cuadro secundario (parte B2, solo mano de obra): confirmar si se suministran.'
].forEach((t, i) => doc.text('· ' + t, M, y + i * 3.5));

/* ---- página 2 · mano de obra + resumen ---- */
doc.addPage(); cabecera();
y = tablaPartidas(20, 'PARTE B · MANO DE OBRA Y SERVICIOS', MO, 'SUBTOTAL MANO DE OBRA Y SERVICIOS', SUBT_MO) + 8;

autoTable({
  startY: y,
  head: [['', 'RESUMEN — PRESUPUESTO BAR PARÉNTESIS']],
  body: [
    ['Materiales sin IVA (Parte A)', eur(SUBT_MAT) + ' €'],
    ['Mano de obra y servicios (Parte B)', eur(SUBT_MO) + ' €'],
    ['Base imponible', eur(SUBTOTAL) + ' €'],
    ['IVA 21 %', eur(IVA) + ' €'],
    ['TOTAL (I.V.A. incluido)', eur(TOTAL) + ' €']
  ],
  theme: 'plain',
  styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.4, textColor: GRIS },
  headStyles: { fillColor: AZUL, textColor: 255, fontStyle: 'bold' },
  columnStyles: { 0: { cellWidth: 60 }, 1: { halign: 'right', fontStyle: 'bold' } },
  margin: { left: M, right: M },
  didParseCell: d => { if (d.section === 'body' && d.row.index === 4) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.textColor = AZUL; d.cell.styles.fontSize = 8.6; } }
});
y = doc.lastAutoTable.finalY + 4;
doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(...GRIS);
doc.text('Son ' + eur(TOTAL) + ' € (mil ciento noventa y cuatro euros con cincuenta y dos céntimos).', M, y);
doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(130);
[
  'El material de sustitución del alumbrado central de planta 1 no está incluido: se define o proporciona aparte.',
  'Tendido de tubo de la acometida (B12) presupuestado como mano de obra: el tubo, si se compra, va aparte.',
  'Forma de pago: 50 % al inicio / 50 % a la finalización · Validez de la oferta: 5 días hábiles · Garantía: 3 años.'
].forEach((t, i) => doc.text('· ' + t, M, y + 5 + i * 3.5));

doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRIS);
doc.text('Firma del cliente (aceptación): ______________________', M, 272);
doc.text('Firma del instalador: ______________________', W - M, 272, { align: 'right' });

/* marca de agua y pie en todas las páginas */
const TOT = doc.getNumberOfPages();
for (let p = 1; p <= TOT; p++) { doc.setPage(p); marcaAguaYpie(TOT, p); }

/* guardar */
const out = path.join(dir, '..', 'Bar centro', 'Presupuesto Bar Parentesis v1 (borrador).pdf');
writeFileSync(out, Buffer.from(doc.output('arraybuffer')));
console.log('OK →', out, '·', doc.getNumberOfPages(), 'páginas');
console.log('Materiales:', eur(SUBT_MAT), '· M.O.:', eur(SUBT_MO), '· Base:', eur(SUBTOTAL), '· IVA 21%:', eur(IVA), '· TOTAL:', eur(TOTAL));
