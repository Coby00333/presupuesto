// @ts-check
'use strict';
/* =====================================================================
   pure.js — Núcleo de cálculo puro (sin DOM). Testable con node:test
   (tests/pure.test.mjs). Cualquier función que no toque document vive
   aquí para poder verificarse sin navegador.
   Depende de data.js (cur(), CURS…) cargado antes.
   ===================================================================== */

/* ---- formato ---- */
const nf=new Intl.NumberFormat('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2});
const nfC=new Intl.NumberFormat('es-ES',{maximumFractionDigits:2});
const money=n=>nf.format(n)+' '+cur().sym;

/* ---- número en letra (es-ES) ---- */
const _U=['','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve','diez','once','doce','trece','catorce','quince','dieciséis','diecisiete','dieciocho','diecinueve','veinte','veintiuno','veintidós','veintitrés','veinticuatro','veinticinco','veintiséis','veintisiete','veintiocho','veintinueve'];
const _D=['','','','treinta','cuarenta','cincuenta','sesenta','setenta','ochenta','noventa'];
const _C=['','ciento','doscientos','trescientos','cuatrocientos','quinientos','seiscientos','setecientos','ochocientos','novecientos'];
/** @param {number} n @returns {string} */
function _cent(n){ if(!n) return ''; if(n===100) return 'cien';
  let s=''; const c=(n/100|0), r=n%100;
  if(c) s+=_C[c];
  if(r){ if(s) s+=' '; if(r<30) s+=_U[r]; else { const d=(r/10|0), u=r%10; s+=_D[d]+(u?' y '+_U[u]:''); } }
  return s; }
/** @param {number} n @returns {string} */
function _miles(n){ if(n<1000) return _cent(n);
  const m=(n/1000|0), r=n%1000; let s=(m===1?'mil':_cent(m)+' mil');
  if(r) s+=' '+_cent(r); return s; }
/** @param {number} n @returns {string} */
function letra(n){ n=Math.round(n); if(n===0) return 'cero';
  if(n>999999999) return String(n);
  const M=(n/1e6|0), r=n%1e6;
  let s=M?(M===1?'un millón':_miles(M)+' millones'):'';
  if(r) s+=(s?' ':'')+_miles(r);
  return s; }
/** Importe total en letra ("Son … euros con … céntimos").
 *  @param {number} n @returns {string} */
function totalLetra(n){
  const e=Math.floor(n), c=Math.round((n-e)*100);
  return `Son ${letra(e)} ${cur().name} con ${String(c).padStart(2,'0')} céntimos.`;
}

/* ---- precios dinámicos ---- */
/** Precio de un nivel: base×multiplicador×tipo de cambio; ≥20 redondeo a entero.
 *  @param {number} base precio base
 *  @param {number} mult multiplicador (1 en todos los usos actuales)
 *  @returns {number} */
function chipVal(base, mult){
  const v=base*mult*cur().r;
  return v>=20?Math.round(v):Math.round(v*10)/10;
}

/* ---- REBT: nº de circuitos orientativo (ITC-BT-19/28/34) ----
 *  Tomas: máx 8/circuito · Luces: máx 20/circuito · +4 exclusivos
 *  (cocina, horno, lavadora, AA) · 1 diferencial por cada 4 circuitos.
 *  @param {number} ench nº de bases de enchufe
 *  @param {number} luz nº de puntos de luz
 *  @returns {{pias:number,difs:number,tomas:number,lucz:number}} */
function rebtSug(ench, luz){
  const tomas=Math.max(1,Math.ceil(ench/8)), lucz=Math.max(1,Math.ceil(luz/20));
  const pias=(ench+luz)>0? tomas+lucz+4 : 0;
  return { pias, difs:Math.max(2,Math.ceil(pias/4)), tomas, lucz };
}

/* ---- REBT avanzado (#26): sección por caída de tensión e intensidad ----
 *  ITC-BT-19 (grado electrificación) · ITC-BT-28 (secciones mínimas) ·
 *  ITC-BT-37 (líneas generales y derivadas). Cobre, monofásico 230 V,
 *  cos φ 0,9, instalado en tubo empotrado (2 conductores cargados).
 *  @param {number} pW potencia del circuito en W
 *  @param {number} L longitud del circuito en m
 *  @param {number=} porc límite de caída en % (3 iluminación · 5 resto)
 *  @param {number=} V tensión (230)
 *  @returns {{I:number,sAdm:number,sCaida:number,sRec:number,seccion:number}} */
const SECC_ADM={1.5:16,2.5:21,4:28,6:36,10:50,16:68,25:89,35:110,50:134};
function seccionCaida(pW,L,porc,V){
  porc=porc||5; V=V||230;
  const cos=0.9, rho=0.0175;
  const I=pW/(V*cos);
  let sCaida=(2*L*I*rho*cos)/(V*porc/100);          // mm² necesarios por ΔU
  let sAdm=1.5;                                     // mínima por intensidad
  for(const s of Object.keys(SECC_ADM).map(Number).sort((a,b)=>a-b)){
    if(SECC_ADM[s]>=I){ sAdm=s; break; } sAdm=s;
  }
  const secciones=Object.keys(SECC_ADM).map(Number).sort((a,b)=>a-b);
  let sRec=secciones[0];
  for(const s of secciones){ if(s>=Math.max(sAdm,sCaida)){ sRec=s; break; } sRec=s; }
  return {I:Math.round(I*10)/10,sAdm,sCaida:Math.round(sCaida*100)/100,sRec,seccion:sRec};
}

/* ---- marcos automáticos (#33) ----
 *  Reparte N slots de mecanismos en el menor nº de marcos (4→3→2→1).
 *  @param {number} N slots totales (un mecanismo doble ocupa 2)
 *  @returns {{n1:number,n2:number,n3:number,n4:number,total:number,marcos:number}} */
function sugerirMarcos(N){
  N=Math.max(0,Math.round(N));
  const n4=Math.floor(N/4); let r=N%4;
  let n3=0,n2=0,n1=0;
  if(r===3){ n3=1; r=0; } else if(r===2){ n2=1; r=0; } else if(r===1){ n1=1; r=0; }
  return {n1,n2,n3,n4,total:N,marcos:n1+n2+n3+n4};
}

/* ---- redondeo comercial (#46: múltiplos y "precio psicológico" X9) ----
 *  @param {number} t total sin redondear
 *  @param {number|string} modo 0 | 1 | 10 | 'x9'
 *  @returns {number} */
function redondeoTotal(t,modo){
  const m=modo==='x9'?'x9':(parseInt(String(modo),10)||0);
  if(m==='x9') return t>=19 ? Math.floor(t/10)*10+9 : t;
  if(m>0) return Math.round(t/m)*m;
  return t;
}

/* ---- totales puros (versión testable de totalsFor) ----
 *  @param {number} base base imponible antes de descuentos
 *  @param {number} descE descuento comercial en € (ya calculado)
 *  @param {number} dvolE descuento por volumen en € (ya calculado)
 *  @param {number} ivaP % IVA
 *  @param {number|string} rnd modo de redondeo
 *  @returns {{base:number,desc:number,baseDes:number,iva:number,total:number}} */
function totalsForPure(base,descE,dvolE,ivaP,rnd){
  const desc=descE+dvolE;
  const baseDes=base-desc;
  const iva=baseDes*ivaP/100;
  const total=redondeoTotal(baseDes+iva,rnd);
  return {base,desc,baseDes,iva,total};
}

/* ---- Gantt (#39): semanas a partir de textos de plazo ----
 *  "3-4 semanas tras picado" → {min:3,max:4}. @param {string} s
 *  @returns {{min:number,max:number}|null} */
function ganttWeeks(s){
  if(!s) return null;
  const m=String(s).match(/(\d+)\s*(?:-\s*(\d+))?\s*(?:semana|sem)/i);
  if(!m) return null;
  const a=parseInt(m[1],10), b=m[2]?parseInt(m[2],10):a;
  return {min:Math.min(a,b),max:Math.max(a,b)};
}

/* ---- hash encadenado Veri*factu (#37) ----
 *  SHA-256 (hex) del hash anterior + datos de la factura actual.
 *  @param {string} prevHash hash anterior (o '' en la primera)
 *  @param {string} payload  "num|fecha|base|iva|total"
 *  @returns {Promise<string>} hex (64) */
async function hashFactura(prevHash,payload){
  const data=new TextEncoder().encode(String(prevHash)+'|'+payload);
  const buf=await crypto.subtle.digest('SHA-256',data);
  return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
