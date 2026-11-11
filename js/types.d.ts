/* js/types.d.ts — Declaraciones de las globals de ventana y del patrón DOM
   clásico que usan los módulos con @ts-check (#3 mejoras2). tsc --noEmit solo
   lee (cero build). sw.js queda fuera del proyecto (jsconfig.exclude): vive
   en contexto Worker. */

interface Window {
  /** UMD de jsPDF cargado dinámicamente desde vendor/ o el CDN */
  jspdf: any;
  /** qrcode-generator (vendor), usado por ensureQR/qrPaint */
  qrcode: any;
  /** Imágenes logo/firma (dataURL + ratio de aspecto) en IndexedDB */
  __peAssets: any;
  /** Factura pendiente de registrar al descargarla (Veri*factu) */
  __LAST_FACT: any;
  __PDF_INTERNO?: boolean;
  __PRECIOS_DIFF: any;
  __IMPORT_PENDING: any;
  __RESTORE_PENDING: any;
  __peIDB: any;
  __PWA_INSTALL: any;
  __peErrors: any[];
  __peQuotaWarn?: (k: string) => void;
}

/* La app es DOM clásico sin framework: los módulos leen .value/.checked/
   .files/.src directamente sobre elementos según su id (input, select,
   textarea, img). Reflejamos ese contrato vivo en Element para que tsc cace
   los typos que interesan (globals inexistentes, funciones mal escritas,
   aridad) sin rediseñar el acceso al DOM. */
interface Element {
  value: any;
  checked?: boolean;
  files?: any;
  selectedOptions?: any;
  options?: any;
  src?: string;
  title?: string;
  type?: string;
  readOnly?: boolean;
  dataset: any;
}

/** Resultado de totalsFor/totalsForPure/totalsForMix (pdf.js añade dvolP) */
interface Totals {
  base: number;
  desc: number;
  baseDes: number;
  iva: number;
  ivaMix: any;
  total: number;
  dvolP?: number;
}
