#!/usr/bin/env node
/* Genera "Presupuesto BORRADOR Arganda 32 v1.1.pdf" con jsPDF+autotable (vendor del proyecto presupuesto). */
import { writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const VENDOR = 'C:/Users/carly/OneDrive/Desktop/Proyectos/presupuesto/vendor/';

/* Cargamos los UMD del vendor en un sandbox: así usan su rama "global"
   (ctx.jspdf = {...}) y autotable encuentra el jspdf global y aplica el plugin. */
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

/* ---------- datos ---------- */
const FECHA = '01/11/2026';
const REF = 'PE-2026-006 · versión 1.1 (borrador)';

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
  'Fecha: ' + FECHA,
  'Nº ' + REF
];

/* partidas cuantificadas con los precios del cuestionario */
const A = [
  ['16.01.02', 'Puesta a tierra con pica y arqueta (vivienda + anexo)', 'ud', 2, 25],
  ['16.01.03', 'Equipotencialidad (baños: 3 vivienda + 2 anexo)', 'ud', 5, 40],
  ['16.02.01', 'Centralización de contadores: CPMP + cuadros de mando de vivienda y anexo (2 subcontadores)', 'ud', 3, 500],
  ['16.03.01', 'Derivación individual 35 m (solo mano de obra)', 'ud', 2, 80],
  ['16.04.01', 'Montaje e instalación de PIAs (12 PIAs · 20 €/ud de instalación + material a confirmar)', 'ud', 12, 20],
  ['16.05.09', 'Tomas de corriente Schuko — todo incluido: mecanismo Jung + caja + tubo + cable 2,5 + M.O.', 'ud', 61, 25],
  ['16.05.01-05', 'Puntos de luz preinstalados (10 sencillos + 3 múltiples + 7+7 conmutados + 4 cruzamiento; en tus PDFs: 26)', 'ud', 31, 10],
  ['16.05.06', 'Pulsador de timbre', 'ud', 2, 20],
  ['16.06/Circ.', 'Canalizaciones: tubo + cableado de circuitos (7 jornadas: 2 anexo + 5 vivienda)', 'día', 7, 180],
  ['—', 'Boletín y tramitación (solo gestión)', 'ud', 1, 250]
];
const SUBT_A = A.reduce((s, r) => s + r[3] * r[4], 0); // 5.535 €

/* partidas de la medición pendientes de precio */
const B = [
  ['16.01.01', 'Toma de tierra en estructura (patillones)', 'ud', 1],
  ['16.04.01', 'Cuadro de distribución Legrand electrif. elevada: IGA 25 A, 3 dif. 40 A/30 mA tipo A, 12 PIAs (vivienda + anexo)', 'ud', 2],
  ['16.05.01', 'Interruptor de luz sencillo', 'ud', 10],
  ['16.05.02', 'Interruptor sencillo múltiple', 'ud', 3],
  ['16.05.03', 'Conmutado sencillo', 'ud', 7],
  ['16.05.04', 'Conmutado múltiple', 'ud', 7],
  ['16.05.05', 'Conmutación por cruzamiento', 'ud', 4],
  ['16.05.07', 'Toma de TV', 'ud', 8],
  ['16.05.08', 'Toma de teléfono', 'ud', 8],
  ['16.05.10', 'Toma de corriente estanca', 'ud', 10],
  ['16.05.11', 'Base 25 A (fuerza)', 'ud', 5],
  ['16.06.02', 'Alumbrado de patio (60 m de tubería)', 'm', 60],
  ['Circ. C1-C11', 'Circuitos de vivienda y anexo (incluidos en las 7 jornadas de canalización)', '—', 'Incl.']
];

/* ---------- formato ---------- */
function eur(n) {
  const [i, d] = n.toFixed(2).split('.');
  return i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + d;
}
const GRIS = [56, 62, 66];
const AZUL = [22, 61, 91];

/* ---------- documento ---------- */
const doc = new jsPDF({ unit: 'mm', format: 'a4' });
const W = 210, M = 16;
const autoTable = (o) => doc.autoTable(o);

function marcaAguaYpie(tot, pag) {
  doc.saveGraphicsState();
  doc.setGState(new ctx.jspdf.GState({ opacity: 0.14 }));
  doc.setFont('helvetica', 'bold'); doc.setFontSize(52); doc.setTextColor(120, 125, 130);
  doc.text('BORRADOR', W / 2, 175, { align: 'center', angle: 38 });
  doc.restoreGraphicsState();
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(130);
  doc.text(`Documento de borrador — precios pendientes de confirmación · pág. ${pag} de ${tot}`, W / 2, 291, { align: 'center' });
}

function cabecera() {
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(130);
  doc.text('Carly Díaz Gutiérrez · Instalador electricista · RIIA 0023979287', M, 10);
  doc.text('BORRADOR v1.1', W - M, 10, { align: 'right' });
  doc.setDrawColor(210); doc.line(M, 12.5, W - M, 12.5);
}

/* ---- página 1 ---- */
cabecera();
doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...AZUL);
doc.text('PRESUPUESTO DE INSTALACIÓN ELÉCTRICA', M, 22);
doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...GRIS);
doc.text('Reforma de vivienda · Calle Arganda 32, Málaga (vivienda + anexo)', M, 28);
doc.setFontSize(8); doc.setTextColor(120);
doc.text(`Nº ${REF} · Fecha ${FECHA} · Documento NO VÁLIDO COMO PRESUPUESTO DEFINITIVO`, M, 33);

let y = 39;
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
y += 40;

doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...AZUL);
doc.text('Medición del proyecto (cap. 16 electricidad, torres&cascallana)', M, y);
doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRIS);
y += 5;
[
  'Cuadros de protección: 2 cuadros con 13 circuitos cada uno (vivienda + anexo) · centralización con 2 subcontadores',
  'Puntos de luz: 64 · Puntos de mecanismos e instalaciones: 98 · Cajas de registro: 9',
  'Puesta a tierra: 2 picas (vivienda + anexo) · Equipotencialidad: 5 baños · Derivación individual: 35 m'
].forEach((t, i) => { doc.text('· ' + t, M + 1, y + i * 4); });
y += 14;

autoTable({
  startY: y,
  head: [['Cap.', 'Partidas cuantificadas (precios según lo acordado)', 'Ud', 'Cant.', '€/ud', 'Importe']],
  body: A.map(r => [r[0], r[1], r[2], String(r[3]), eur(r[4]), eur(r[3] * r[4])]),
  foot: [['', 'SUBTOTAL CUANTIFICADO (antes de partidas a confirmar e IVA)', '', '', '', eur(SUBT_A) + ' €']],
  theme: 'grid',
  styles: { font: 'helvetica', fontSize: 7.6, cellPadding: 1.6, textColor: GRIS, lineColor: [225, 228, 231], lineWidth: .15 },
  headStyles: { fillColor: AZUL, textColor: 255, fontStyle: 'bold', halign: 'left' },
  footStyles: { fillColor: [236, 240, 243], textColor: AZUL, fontStyle: 'bold' },
  columnStyles: { 0: { cellWidth: 17, fontSize: 6.8 }, 2: { cellWidth: 8, halign: 'center' }, 3: { cellWidth: 11, halign: 'center' }, 4: { cellWidth: 15, halign: 'right' }, 5: { cellWidth: 21, halign: 'right', fontStyle: 'bold' } },
  margin: { left: M, right: M }
});

/* ---- página 2 ---- */
doc.addPage(); cabecera();
let y2 = 22;
autoTable({
  startY: y2,
  head: [['Cap.', 'Partidas de la medición PENDIENTES DE PRECIO ("a confirmar")', 'Ud', 'Cant.']],
  body: B.map(r => [r[0], r[1], r[2], String(r[3])]),
  theme: 'grid',
  styles: { font: 'helvetica', fontSize: 7.6, cellPadding: 1.6, textColor: GRIS, lineColor: [225, 228, 231], lineWidth: .15 },
  headStyles: { fillColor: [120, 128, 134], textColor: 255, fontStyle: 'bold', halign: 'left' },
  columnStyles: { 0: { cellWidth: 17, fontSize: 6.8 }, 2: { cellWidth: 8, halign: 'center' }, 3: { cellWidth: 11, halign: 'center' } },
  margin: { left: M, right: M }
});

y2 = doc.lastAutoTable.finalY + 8;
doc.setFont('helvetica', 'normal'); doc.setFontSize(7.6); doc.setTextColor(...GRIS);
[
  'Nota: tus presupuestos contabilizan 7 interruptores, 20 conmutadores y 3 cruzamientos (la medición del proyecto: 10 + 3 / 7 + 7 / 4). A confirmar qué criterio se aplica.',
  'Cap. 17 Iluminación: luminarias suministradas por la promotora — solo colocación, precio por confirmar (2 de emergencia + 5 + 18 + 4 + 4 + 4 de estancias).',
  'Cap. 18 Telecomunicaciones (ICT): preinstalación NO incluida en este presupuesto.',
  'Cap. 19 Climatización (multisplit 2×1 y 5×1 + VMC): instalador aparte, EXCLUIDO.'
].forEach((t, i) => doc.text('· ' + t, M, y2 + i * 4));
y2 += 18;

autoTable({
  startY: y2,
  head: [['', 'IMPORTES DE REFERENCIA — tus dos presupuestos sumados (v1 + planta 1)']],
  body: [
    ['Materiales', eur(5918) + ' €'],
    ['Mano de obra', eur(1770) + ' €'],
    ['Subtotal', eur(8190) + ' €'],
    ['IVA 21 %', eur(8190 * .21) + ' €'],
    ['TOTAL (aprox.)', eur(8190 * 1.21) + ' €']
  ],
  theme: 'plain',
  styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.4, textColor: GRIS },
  headStyles: { fillColor: AZUL, textColor: 255, fontStyle: 'bold' },
  columnStyles: { 0: { cellWidth: 40 }, 1: { halign: 'right', fontStyle: 'bold' } },
  margin: { left: M, right: M },
  didParseCell: d => { if (d.section === 'body' && d.row.index === 4) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.textColor = AZUL; } }
});

y2 = doc.lastAutoTable.finalY + 8;
autoTable({
  startY: y2,
  head: [['EXCLUSIONES', 'CONDICIONES']],
  body: [
    ['Albañilería y rozas (constructora)', 'IVA 21 % no incluido (se aplica sobre el subtotal)'],
    ['Arquetas de obra (constructora)', 'Validez del presupuesto: 5 días hábiles'],
    ['Iluminación: la suministra la promotora', 'Pago: 50 % al inicio · 50 % al finalizar'],
    ['Aire acondicionado y VMC (otro instalador)', 'Garantía: 1 año'],
    ['Instalación de telecomunicaciones (ICT)', 'Ejecución: 1 instalador'],
    ['Gastos generales', 'Precios "todo incluido": mecanismo Jung + caja + tubo + cable 2,5 + M.O.'],
    ['', 'RGPD: los datos del cliente se usan solo para este presupuesto y el encargo; no se ceden a terceros.']
  ],
  theme: 'grid',
  styles: { font: 'helvetica', fontSize: 7.4, cellPadding: 1.6, textColor: GRIS, lineColor: [225, 228, 231], lineWidth: .15, valign: 'top' },
  headStyles: { fillColor: [120, 128, 134], textColor: 255, fontStyle: 'bold', halign: 'left' },
  columnStyles: { 0: { cellWidth: (W - 2 * M) / 2 }, 1: { cellWidth: (W - 2 * M) / 2 } },
  margin: { left: M, right: M }
});

const TOT = doc.getNumberOfPages();
for (let p = 1; p <= TOT; p++) { doc.setPage(p); marcaAguaYpie(TOT, p); }

doc.setFont('helvetica', 'italic'); doc.setFontSize(7); doc.setTextColor(130);
doc.setPage(TOT);
doc.text('Firma del cliente (aceptación del borrador): ______________________', W - M, 280, { align: 'right' });

/* guardar */
const out = path.join(dir, 'Presupuesto BORRADOR Arganda 32 v1.1.pdf');
writeFileSync(out, Buffer.from(doc.output('arraybuffer')));
console.log('OK →', out, '·', doc.getNumberOfPages(), 'páginas');
