// @ts-check
'use strict';
/* =====================================================================
   data.js — Datos técnicos y tarifas de la aplicación
   Presupuesto Eléctrico PRO · se carga en primer lugar (sin tocar el DOM)
   Fuentes de verdad: GRUPOS (partidas por niveles) · MARCAS/MAT_ITEMS
   (material por marca). Los precios editables por el usuario viven en
   localStorage (pe-marcas) y opcionalmente se actualizan desde
   precios.json (versión externa) sin tocar este archivo.
   ===================================================================== */

/**
 * Acceso seguro a localStorage (JSON).
 * @param {string} k clave
 * @param {any=} v valor a guardar; si es undefined, lee
 * @returns {any} valor leído (o null)
 */
const LS=function(k,v){ try{
  if(v===undefined) return JSON.parse(localStorage.getItem(k));
  localStorage.setItem(k,JSON.stringify(v));
}catch(e){ return null; } };

/* ---- moneda (EUR) ---- */
const CURS={EUR:{r:1,sym:'€',name:'euros'}};
/** @type {string} */ let CUR='EUR';
const cur=()=>CURS[CUR];

/* ---- textos de ayuda técnica ---- */
const TT={
  iga:'IGA: Interruptor General Automático. Corta toda la instalación; se dimensiona según la potencia contratada (40A monofásico habitual).',
  dif:'Diferencial: protege a las personas contra contactos indirectos (30 mA). Orientativo: 1 por cada 4 circuitos, mínimo 2.',
  pia:'PIA: pequeño interruptor automático (magnetotérmico) que protege cada circuito contra sobrecargas y cortocircuitos.',
  boletin:'Boletín eléctrico (CIE): certificado de instalación exigido para dar de alta el suministro. Incluye tramitación ante industria.',
  pluz:'Punto de luz: preinstalación con tubo corrugado y cable hasta el punto (no incluye luminaria).',
  acometida:'Acometida: línea desde la red de la compañía hasta la caja de contador.',
  tubo23:'Precio de referencia de compra: rollo LEXMAN Ø20 de 100 m ≈ 18 € → 0,18 €/m. Escribe los metros y el total se calcula solo; el precio libre sustituye al de referencia.',
  tubo26:'Precio de referencia de compra: rollo LEXMAN Ø32 de 50 m ≈ 20 € → 0,40 €/m (forrado Ø25 de 75 m ≈ 25 € → 0,33 €/m). Escribe los metros y el total se calcula solo.',
  cab15:'Precio de referencia de compra: bobina TOP CABLE H07Z1-K 1,5 mm² de 200 m ≈ 168 € → 0,84 €/m. Escribe los metros y el total se calcula solo.',
  cab25:'Precio de referencia de compra: bobina TOP CABLE H07Z1-K 2,5 mm² de 200 m ≈ 264 € → 1,32 €/m. Escribe los metros y el total se calcula solo.',
  cab46:'Precio de referencia de compra: 4 mm² ≈ 75 €/25 m → 3,00 €/m · 6 mm² ≈ 90 €/25 m → 3,60 €/m. Escribe los metros y el total se calcula solo.',
};

/**
 * @typedef {Object} Partida
 * @property {string} id
 * @property {string} name
 * @property {string} unit ud|m|rollo|viaje|global
 * @property {number[]} prices niveles de precio (vacío = referencia o solo precio libre)
 * @property {number} qty
 * @property {'mat'|'mo'} cls parte 1 materiales / parte 2 mano de obra
 * @property {string=} tt clave de TT
 * @property {number=} refp precio de referencia por unidad (€/m) para partidas sin niveles
 * @typedef {Object} Grupo
 * @property {string} div id del contenedor DOM
 * @property {string} titulo
 * @property {Partida[]} partidas
 * @typedef {Object} ItemMat
 * @property {string} id
 * @property {string} name
 * @typedef {Object} Marca
 * @property {string} label
 * @property {string} tipo
 * @property {Record<string,string>} ref
 * @property {Record<string,number|null>} p
 */

/* ---- partidas por niveles (#32: tubo en €/m reales LEXMAN) ---- */
/** @type {Grupo[]} */
const GRUPOS=[
  { div:'g-mec', titulo:'Mecanismos y puntos — material por marca + mano de obra', partidas:[
    { id:'enchufes', name:'Bases de enchufe 16A con toma de tierra', unit:'ud', prices:[25,34,43,51,60], qty:0, cls:'mat' },
    { id:'interrup', name:'Interruptores simples', unit:'ud', prices:[20,27,34,41,48], qty:0, cls:'mat' },
    { id:'conmut', name:'Conmutadores (conmutación 2 puntos)', unit:'ud', prices:[22,29,36,43,50], qty:0, cls:'mat' },
    { id:'cruza', name:'Cruzamientos (3 o más puntos)', unit:'ud', prices:[23,30,38,45,52], qty:0, cls:'mat' },
    { id:'puls', name:'Pulsadores (timbre / reguladores)', unit:'ud', prices:[19,26,33,39,46], qty:0, cls:'mat' },
    { id:'timbre', name:'Timbre / zumbador diurno', unit:'ud', prices:[25,34,43,51,60], qty:0, cls:'mat' },
    { id:'pluz', name:'Puntos de luz (preinstalación: corrugado + cable)', unit:'ud', prices:[19,26,33,39,46], qty:0, cls:'mo' },
  ]},
  { div:'g-cuadro', titulo:'Acometida, tierra y protecciones', partidas:[
    { id:'acometida', name:'Acometida entubada', unit:'ud', prices:[95,140,185,225,270], qty:0, cls:'mat', tt:'acometida' },
    { id:'contador', name:'Módulo / caja para contador monofásico', unit:'ud', prices:[75,105,140,170,200], qty:0, cls:'mat' },
    { id:'enlace', name:'Línea de enlace (derivación individual) entubada 2×16 mm²', unit:'ud', prices:[95,140,185,225,270], qty:0, cls:'mat' },
    { id:'tierra', name:'Puesta a tierra (cable 1×35 mm² + puntones)', unit:'ud', prices:[115,160,205,255,300], qty:0, cls:'mat' },
    { id:'seccion', name:'Caja seccionadora / comprobación de tierra', unit:'ud', prices:[25,39,53,66,80], qty:0, cls:'mat' },
    { id:'cajacgmp', name:'Caja modular para cuadro (36 módulos)', unit:'ud', prices:[57,80,104,127,150], qty:0, cls:'mat' },
    { id:'iga', name:'IGA interruptor general automático monofásico 40A', unit:'ud', prices:[25,37,49,60,72], qty:0, cls:'mat', tt:'iga' },
    { id:'dif', name:'Diferenciales 2P 40A 30mA', unit:'ud', prices:[35,47,59,71,83], qty:0, cls:'mat', tt:'dif' },
    { id:'pia', name:'PIA magnetotérmicos por circuito (C1…C9)', unit:'ud', prices:[7,10,14,17,20], qty:0, cls:'mat', tt:'pia' },
  ]},
  { div:'g-canal', titulo:'Canalizaciones, cableado y tramitación', partidas:[
    /* tubo, cable y transporte: precio libre del instalador (sin niveles sugeridos);
       referencia de compra en docs/precios.txt (LEXMAN, TOP CABLE) */
    { id:'tubo23', name:'Tubo corrugado Ø16–20 mm para empotrar (rollo 100 m)', unit:'rollo', prices:[], qty:0, cls:'mat' },
    { id:'tubo26', name:'Tubo corrugado Ø25–40 mm para empotrar (rollo)', unit:'rollo', prices:[], qty:0, cls:'mat' },
    { id:'cab15', name:'Cable 750V 1×1,5 mm² (iluminación / maniobra)', unit:'global', prices:[], qty:0, cls:'mat' },
    { id:'cab25', name:'Cable 750V 1×2,5 mm² (tomas de uso general)', unit:'global', prices:[], qty:0, cls:'mat' },
    { id:'cab46', name:'Cable 750V 1×4/6 mm² (cocina, horno, lavadora, climatización)', unit:'global', prices:[], qty:0, cls:'mat' },
    { id:'regletas', name:'Regletas de conexión varias (clemas)', unit:'global', prices:[13,20,27,33,40], qty:0, cls:'mat' },
    { id:'manoobra', name:'Mano de obra especializada: montaje e interconexión', unit:'global', prices:[565,850,1135,1415,1700], qty:0, cls:'mo' },
    { id:'boletin', name:'Tramitación administrativa y Boletín Eléctrico (CIE)', unit:'ud', prices:[95,135,175,210,250], qty:0, cls:'mo', tt:'boletin' },
  ]},
  /* servicio de transporte: precio libre por viaje (sin niveles sugeridos) */
  { div:'g-serv', titulo:'Servicios — transporte y desplazamientos', partidas:[
    { id:'transporte', name:'Transporte de materiales y desplazamientos', unit:'viaje', prices:[], qty:0, cls:'mo' },
  ]},
];

/* ---- unificación mecanismos + material por marca: partida ↔ item de catálogo ----
   La cantidad de la partida arrastra el material de la marca elegida;
   el precio de la partida es solo mano de obra. */
const MEC_MAT={enchufes:'enchufe16',interrup:'inter',conmut:'conmut',cruza:'cruza',puls:'puls',timbre:'timbre'};
const MAT_MEC=Object.fromEntries(Object.entries(MEC_MAT).map(([k,v])=>[v,k]));

const ALB_DEF=[
  { id:'marcado', name:'Marcado de rozas', h:0 },
  { id:'picado', name:'Picado de regatas', h:0 },
  { id:'cajetin', name:'Colocación de cajetines y cajas de empalme', h:0 },
  { id:'tapado', name:'Tapado de rozas con mortero', h:0 },
  { id:'collado', name:'Collado de caja de cuadro (magnetotérmica) con yeso', h:0 },
  { id:'pluzalb', name:'Puntos de luz en techos y paredes con corrugado', h:0 },
];
let ALBROWS=ALB_DEF.map(a=>({...a}));
let LIBRES=[];

/* ================= material por marca (Miluz + catálogo ATMOSS 2025/26) =================
   #44: catálogo ampliado (detector PIR, toma fuerza 25A, variador).
   Precios nulos = no disponible en esa marca. */
/** @type {ItemMat[]} */
const MAT_ITEMS=[
  {id:'enchufe16',   name:'Base de enchufe Schuko 16A'},
  {id:'enchufeDoble',name:'Base doble de enchufe 16A'},
  {id:'f25',         name:'Base de fuerza Schuko 25A'},
  {id:'inter',       name:'Interruptor simple'},
  {id:'interDoble',  name:'Interruptor doble'},
  {id:'conmut',      name:'Conmutador'},
  {id:'conmutDoble', name:'Conmutador doble'},
  {id:'cruza',       name:'Cruzamiento'},
  {id:'conmutCruza', name:'Conmutador + cruzamiento'},
  {id:'puls',        name:'Pulsador'},
  {id:'pulsSimb',    name:'Pulsador con símbolo (timbre/luz)'},
  {id:'timbre',      name:'Timbre / zumbador'},
  {id:'tv',          name:'Toma TV + FM + SAT'},
  {id:'rj45',        name:'Toma RJ45 CAT6'},
  {id:'rj11',        name:'Toma teléfono RJ11'},
  {id:'usb',         name:'Base 16A + 2 USB'},
  {id:'tapaCiega',   name:'Tapa ciega'},
  {id:'pir',         name:'Detector de movimiento (PIR)'},
  {id:'variador',    name:'Regulador / variador de luz'},
  {id:'marco1',      name:'Marco simple (1 elemento)'},
  {id:'marco2',      name:'Marco doble (2 elementos)'},
  {id:'marco3',      name:'Marco triple (3 elementos)'},
  {id:'marco4',      name:'Marco cuádruple (4 elementos)'},
];

/** @type {Record<string,Marca>} */
const MARCAS={
  miluz:{label:'MILUZ blanco', tipo:'precio de compra', ref:{},
    p:{enchufe16:3, enchufeDoble:6, f25:9.5, inter:3, interDoble:6, conmut:3, conmutDoble:6, cruza:6,
       conmutCruza:9, puls:3, pulsSimb:3, timbre:8, tv:15, rj45:10, rj11:8, usb:null,
       tapaCiega:1, pir:24, variador:17, marco1:1, marco2:2, marco3:3, marco4:4}},
  s20b:{label:'ATMOSS Dynamic S20 blanco', tipo:'PVPR catálogo',
    ref:{enchufe16:'S20.112.10',enchufeDoble:'S20.125.10',inter:'S20.101.10',interDoble:'S20.104.10',
      conmut:'S20.102.10',conmutDoble:'S20.105.10',cruza:'S20.107.10',conmutCruza:'S20.136.10',
      puls:'S20.109.10',pulsSimb:'S20.127.10',timbre:'S20.132.10',tv:'S20.121.10',rj45:'S20.116.10',
      rj11:'S20.115.10',usb:'S20.114.10',tapaCiega:'S20.118.10',
      marco1:'S20.301.10',marco2:'S20.302.10',marco3:'S20.303.10',marco4:'S20.304.10'},
    p:{enchufe16:5.88, enchufeDoble:11.68, f25:null, inter:3.92, interDoble:5.80, conmut:5.68, conmutDoble:9.36,
       cruza:8.56, conmutCruza:12.88, puls:4.24, pulsSimb:4.24, timbre:21.84, tv:2.12, rj45:12.92,
       rj11:7.28, usb:48.16, tapaCiega:1.92, pir:null, variador:null,
       marco1:1.16, marco2:1.68, marco3:2.60, marco4:4.28}},
  s20a:{label:'ATMOSS Dynamic S20 aluminio', tipo:'PVPR catálogo',
    ref:{enchufe16:'S20.112.11',enchufeDoble:'S20.125.11',inter:'S20.101.11',interDoble:'S20.104.11',
      conmut:'S20.102.11',conmutDoble:'S20.105.11',cruza:'S20.107.11',conmutCruza:'S20.136.10',
      puls:'S20.109.11',pulsSimb:'S20.127.11',timbre:'S20.132.11',tv:'S20.121.11',rj45:'S20.116.11',
      rj11:'S20.115.11',usb:'S20.114.11',tapaCiega:'S20.118.11',
      marco1:'S20.301.11',marco2:'S20.302.11',marco3:'S20.303.11',marco4:'S20.304.11'},
    p:{enchufe16:6.80, enchufeDoble:12.48, f25:null, inter:4.92, interDoble:7.32, conmut:6.68, conmutDoble:10.88,
       cruza:9.80, conmutCruza:12.88, puls:5.20, pulsSimb:5.32, timbre:25.00, tv:2.52, rj45:14.80,
       rj11:8.28, usb:49.24, tapaCiega:2.84, pir:null, variador:null,
       marco1:2.40, marco2:3.48, marco3:5.60, marco4:9.96}},
  s20t:{label:'ATMOSS Dynamic S20 antracita', tipo:'PVPR catálogo (mecanismo + tecla antracita)',
    ref:{enchufe16:'S20.112.10',enchufeDoble:'S20.125.11',inter:'S20.101.10',interDoble:'S20.104.10',
      conmut:'S20.102.10',conmutDoble:'S20.105.10',cruza:'S20.107.10',conmutCruza:'S20.136.10',
      puls:'S20.109.10',pulsSimb:'S20.127.10',timbre:'S20.132.10',tv:'S20.121.11',rj45:'S20.116.11',
      rj11:'S20.115.11',usb:'S20.114.11',tapaCiega:'S20.118.11',
      marco1:'S20.301.12',marco2:'S20.302.12',marco3:'S20.303.12',marco4:'S20.304.12'},
    p:{enchufe16:7.88, enchufeDoble:12.48, f25:null, inter:5.40, interDoble:7.88, conmut:7.16, conmutDoble:11.44,
       cruza:10.12, conmutCruza:12.88, puls:5.72, pulsSimb:5.88, timbre:23.72, tv:2.52, rj45:14.80,
       rj11:8.28, usb:49.24, tapaCiega:2.84, pir:null, variador:null,
       marco1:2.60, marco2:4.12, marco3:6.08, marco4:10.44}},
  s30:{label:'ATMOSS Dynamic PLUS S30 blanco', tipo:'PVPR catálogo (mecanismo + tecla)',
    ref:{enchufe16:'S30.512+612',enchufeDoble:'2×S30.512',inter:'S30.501+601',interDoble:'S30.504+604',
      conmut:'S30.502+601',conmutDoble:'S30.505+604',cruza:'S30.507+607',conmutCruza:'',
      puls:'S30.509+609',pulsSimb:'S30.529+629',timbre:'S30.532+632',tv:'S30.621.10',rj45:'S30.516+616',
      rj11:'S30.515+615',usb:'S30.514+614',tapaCiega:'S30.618.10',
      marco1:'S30.821.10',marco2:'S30.822.10',marco3:'S30.823.10',marco4:'S30.824.10'},
    p:{enchufe16:7.00, enchufeDoble:14.00, f25:null, inter:4.64, interDoble:9.36, conmut:6.00, conmutDoble:9.20,
       cruza:9.56, conmutCruza:null, puls:4.96, pulsSimb:5.00, timbre:22.64, tv:2.12, rj45:10.04,
       rj11:8.16, usb:47.24, tapaCiega:1.96, pir:null, variador:null,
       marco1:1.68, marco2:2.92, marco3:3.68, marco4:4.80}},
};
/* ---- precios editables por marca (#43) + niveles editables (#25) ----
   MARCAS_BASE = tarifas de fábrica; los overrides del usuario se guardan en
   localStorage (pe-marcas) y se reaplican en init. precios.json (#42) puede
   sustituir la base sin tocar este archivo. */
let MARCAS_BASE=JSON.parse(JSON.stringify(MARCAS));
const MARCA_KEYS=Object.keys(MARCAS);
const MARCA_SHORT={miluz:'Miluz',s20b:'S20 blan.',s20a:'S20 alum.',s20t:'S20 antr.',s30:'S30 blan.'};
/** @type {Record<string,number[]>} */ let NIV_OVR={};
/** Versiones de tarifas: PRECIOS_VER interno; precios.json puede traer una mayor. */
let PRECIOS_VER=1;

/**
 * Niveles efectivos de una partida (override del usuario o fábrica).
 * @param {Partida} p
 * @returns {number[]}
 */
function basePrices(p){ const o=NIV_OVR[p.id]; return (o&&o.length===p.prices.length)?o:p.prices; }

/** Aplica overrides de precios por marca guardados (pe-marcas). */
function applyPreciosGuardados(){
  const ovr=LS('pe-marcas'); if(!ovr) return;
  MARCA_KEYS.forEach(k=>{
    Object.entries(ovr[k]||{}).forEach(([id,v])=>{ MARCAS[k].p[id]=v; });
  });
}
/** Aplica overrides de los 5 niveles por partida guardados (pe-niveles, #25). */
function applyNivelesGuardados(){
  NIV_OVR=LS('pe-niveles')||{};
}
/**
 * Sustituye las tarifas de fábrica desde un objeto de precios.json (#42).
 * @param {{version:number,marcas?:Object,niveles?:Record<string,number[]>}} d
 */
function aplicarTarifasExternas(d){
  if(!d||!(d.version>PRECIOS_VER)) return false;
  if(d.marcas){
    MARCA_KEYS.forEach(k=>{
      if(!d.marcas[k]) return;
      Object.entries(d.marcas[k]).forEach(([id,v])=>{ MARCAS_BASE[k].p[id]=v; });
      MARCAS[k].p={...MARCAS_BASE[k].p};
    });
    applyPreciosGuardados();
  }
  if(d.niveles){ Object.entries(d.niveles).forEach(([id,pr])=>{
    const g=GRUPOS.flatMap(x=>x.partidas).find(p=>p.id===id);
    if(g&&g.prices.length&&Array.isArray(pr)&&pr.length===g.prices.length) g.prices=pr.map(Number);
  }); NIV_OVR={}; }
  PRECIOS_VER=d.version;
  return true;
}

/* ---- datos por defecto del emisor ---- */
const EMISOR_DEF={
  'f-inst-nombre':'Carly Díaz Gutiérrez',
  'f-inst-pob':'Calle Ayamonte 1, 2-3 · Málaga',
  'f-inst-nif':'60478208F',
  'f-inst-tel':'633 898 407',
  'f-inst-mail':'eleinsta06@gmail.com',
  'f-inst-aut':'0023979287',
  'f-inst-rc':'Zurich One · Póliza 00000169787371'
};
