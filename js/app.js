// @ts-check
'use strict';
/* =====================================================================
   app.js — Arranque, eventos, IndexedDB (#11), multi-obra (#9), tema (#16),
   accesibilidad (#47), PWA (#49), rendimiento de entrada (#50),
   copia de seguridad (#10) y obras/facturas en IndexedDB (#5 mejoras2).
   Carga al final de <body>.
   ===================================================================== */

/* ================= diagnóstico integrado (#10 mejoras2) =================
   Cola de errores (últimos 20, persistida en pe-errors) capturada lo antes
   posible + aviso visible de cuota de localStorage agotada. El informe se
   copia desde Opciones → «Diagnóstico». */
const APP_VER='3.1.0';
window.__peErrors=LS('pe-errors')||[];
function peLogErr(msg,src){
  try{
    const m=String(msg).slice(0,300);
    const last=window.__peErrors[window.__peErrors.length-1];
    if(last&&last.msg===m&&Date.now()-new Date(last.t).getTime()<5000) return;   /* no inundar */
    window.__peErrors.push({t:new Date().toISOString(),msg:m,src:src?String(src).slice(0,120):''});
    if(window.__peErrors.length>20) window.__peErrors.shift();
    LS('pe-errors',window.__peErrors);
  }catch(e){}
}
window.addEventListener('error',e=>peLogErr(e.message,(e.filename||'')+(e.lineno?':'+e.lineno:'')));
window.addEventListener('unhandledrejection',e=>peLogErr('Promesa rechazada: '+((e.reason&&(e.reason.message||e.reason))||''),'promise'));
let peQuotaShown=0;
window.__peQuotaWarn=(k)=>{                  /* enganchado por LS() en data.js */
  peLogErr('localStorage lleno (cuota agotada) al guardar «'+k+'»','storage');
  if(Date.now()-peQuotaShown<60000) return;
  peQuotaShown=Date.now();
  toast('Almacenamiento lleno: algunos datos no se han guardado. Exporta una copia total desde Opciones y borra obras antiguas.','err');
};

/* ================= IndexedDB como almacén principal (#11) ================= */
const idb={
  /** @type {IDBDatabase|null} */ db:null,
  open(){
    return new Promise((res)=>{
      if(!('indexedDB' in window)){ res(null); return; }
      const rq=indexedDB.open('presu-electrico-pro',1);
      rq.onupgradeneeded=()=>{ if(!rq.result.objectStoreNames.contains('kv')) rq.result.createObjectStore('kv'); };
      rq.onsuccess=()=>{ idb.db=rq.result; res(idb.db); };
      rq.onerror=()=>res(null);
    });
  },
  get(k){ return new Promise(res=>{
    if(!idb.db){ res(null); return; }
    try{ const tx=idb.db.transaction('kv','readonly').objectStore('kv').get(k);
      tx.onsuccess=()=>res(tx.result??null); tx.onerror=()=>res(null);
    }catch(e){ res(null); } }); },
  put(k,v){ return new Promise(res=>{
    if(!idb.db){ res(false); return; }
    try{ const tx=idb.db.transaction('kv','readwrite').objectStore('kv').put(v,k);
      tx.onsuccess=()=>res(true); tx.onerror=()=>res(false);
    }catch(e){ res(false); } }); },
  del(k){ return new Promise(res=>{
    if(!idb.db){ res(false); return; }
    try{ const tx=idb.db.transaction('kv','readwrite').objectStore('kv').delete(k);
      tx.onsuccess=()=>res(true); tx.onerror=()=>res(false);
    }catch(e){ res(false); } }); }
};
window.__peIDB={
  async putState(s){ if(typeof s==='string'){ try{ s=JSON.parse(s); }catch(e){ return; } } idb.put('state',s); },
  async getState(){ return idb.get('state'); }
};

/* ================= obras y facturas en IndexedDB (#5 mejoras2) =================
   localStorage aguanta ~5 MB y el logo/firma viajan como dataURL: con 2–3 años
   de obras (pe-works) y facturas (pe-facturas) la cuota revienta y LS() empieza
   a fallar. Esas dos colecciones viven ahora en IndexedDB, con una copia en
   memoria (WORKS/FACTS) para que el resto del código siga siendo síncrono. Si
   IndexedDB no está disponible (navegador viejo, jsdom), se cae a localStorage
   sin cambiar nada del comportamiento. En localStorage quedan solo el
   presupuesto activo y los ajustes: el arranque sigue siendo instantáneo. */
/** @type {Record<string,any>} */
let WORKS={};
/** @type {any[]} */
let FACTS=[];
function worksGet(){ return WORKS; }
function worksSet(w){
  WORKS=w||{};
  (idb.db?idb.put('works',WORKS):Promise.resolve(false))
    .then(ok=>{ if(!ok) LS('pe-works',WORKS); });   /* respaldo si IDB falla */
}
function factsGet(){ return FACTS; }
function factsSet(f){
  FACTS=Array.isArray(f)?f:[];
  (idb.db?idb.put('facturas',FACTS):Promise.resolve(false))
    .then(ok=>{ if(!ok) LS('pe-facturas',FACTS); });
}
/* Migración transparente en el primer arranque: si las obras/facturas siguen
   en localStorage se vuelcan a IndexedDB y se retiran de allí. Al restaurar una
   copia total se vuelven a escribir en localStorage, así que esta migración
   también sirve de camino de entrada después de cada restauración. */
async function migrarObrasFacturasIDB(){
  const lsW=LS('pe-works'), lsF=LS('pe-facturas');
  if(!idb.db){ WORKS=lsW||{}; FACTS=lsF||[]; return; }   /* sin IDB: como siempre */
  if(lsW){
    const prev=await idb.get('works');
    WORKS={...(prev||{}),...lsW};                       /* localStorage manda: es lo más reciente */
    if(await idb.put('works',WORKS)){ try{ localStorage.removeItem('pe-works'); }catch(e){} }
  } else WORKS=(await idb.get('works'))||{};
  if(lsF){
    const prev=(await idb.get('facturas'))||[];
    const seen=new Set(prev.map(f=>String(f.num)+'|'+String(f.hash)));
    FACTS=prev.concat(lsF.filter(f=>!seen.has(String(f.num)+'|'+String(f.hash))));
    if(await idb.put('facturas',FACTS)){ try{ localStorage.removeItem('pe-facturas'); }catch(e){} }
  } else FACTS=(await idb.get('facturas'))||[];
}

/* ================= imágenes (logo / firma / foto de obra, #34) ================= */
window.__peAssets=window.__peAssets||{};
function leerImagen(file,cb){
  const rd=new FileReader();
  rd.onload=()=>{
    const img=new Image();
    img.onload=()=>{
      const max=900; let w=img.width,h=img.height;
      if(w>max){ h=Math.round(h*max/w); w=max; }
      const cv=document.createElement('canvas'); cv.width=w; cv.height=h;
      cv.getContext('2d').drawImage(img,0,0,w,h);
      cb(cv.toDataURL('image/png'),w/h);
    };
    img.onerror=()=>toast('No se pudo leer la imagen.','err');
    img.src=String(rd.result);
  };
  rd.readAsDataURL(file);
}
function setAsset(key,file){
  if(!file) return;
  if(file.size>4*1024*1024){ toast('Imagen demasiado grande (máx. 4 MB).','err'); return; }
  leerImagen(file,(dataUrl,ar)=>{
    window.__peAssets[key]=dataUrl;
    window.__peAssets[key+'AR']=ar;
    idb.put('assets',window.__peAssets);
    const pv=document.getElementById('pv-'+key);
    if(pv){ pv.src=dataUrl; pv.hidden=false; }
    const del=document.getElementById('btn-del-'+key);
    if(del) del.hidden=false;
    toast('Imagen guardada (se usará en los PDF).','ok');
  });
}
function quitarAsset(key){
  delete window.__peAssets[key]; delete window.__peAssets[key+'AR'];
  idb.put('assets',window.__peAssets);
  const pv=document.getElementById('pv-'+key); if(pv) pv.hidden=true;
  const del=document.getElementById('btn-del-'+key); if(del) del.hidden=true;
}

/* ================= tema claro/oscuro (#16) ================= */
const mqLight=window.matchMedia?window.matchMedia('(prefers-color-scheme: light)'):null;
function applyTheme(mode){
  mode=mode||'auto';
  const light=mode==='light'||(mode==='auto'&&mqLight&&mqLight.matches);
  document.body.classList.toggle('light',light);
  document.body.classList.toggle('dark',!light);
  const sel=document.getElementById('f-theme'); if(sel) sel.value=mode;
  LS('pe-theme',mode);
}
if(mqLight&&mqLight.addEventListener) mqLight.addEventListener('change',()=>{ if((LS('pe-theme')||'auto')==='auto') applyTheme('auto'); });

/* ================= multi-obra (#9) ================= */
let WORK_ID=null;
/* estados de seguimiento (#8 mejoras) */
const ESTADOS={borrador:'Borrador',enviado:'Enviado',aceptado:'Aceptado',rechazado:'Rechazado'};
const EST_COL={borrador:'var(--tx2)',enviado:'var(--warn)',aceptado:'var(--ok)',rechazado:'var(--danger)'};
function guardarObraActual(silent){
  const r=calc();
  const works=worksGet();
  WORK_ID=WORK_ID||('w'+Date.now().toString(36));
  const prev=(works[WORK_ID]||{}).meta||{};
  works[WORK_ID]={meta:{num:idv('f-num')||'—',ver:idv('f-ver'),cliente:idv('f-cli-nombre')||'—',
    fecha:idv('f-fecha'),total:money(r.total),saved:new Date().toISOString(),
    estado:prev.estado||'borrador',fEnvio:prev.fEnvio||null},state:getState(),arch:false};
  worksSet(works);
  if(!silent) toast('Obra guardada en «Mis obras» ('+works[WORK_ID].meta.num+').','ok');
}
function renderObras(filtro){
  const host=$('#works-list'); if(!host) return;
  const works=worksGet();
  const f=(filtro||'').trim().toLowerCase();
  const arr=Object.entries(works).map(([id,w])=>({id,...w}))
    .filter(w=>!f||String(w.meta.num||'').toLowerCase().includes(f)||String(w.meta.cliente||'').toLowerCase().includes(f))
    .sort((a,b)=>String(b.meta.saved||'').localeCompare(String(a.meta.saved||'')));
  const act=arr.filter(w=>!w.arch), arc=arr.filter(w=>w.arch);
  /* seguimiento: enviados sin respuesta hace más de 7 días (#8 mejoras) */
  const pend=arr.filter(w=>(w.meta.estado||'borrador')==='enviado'&&w.meta.fEnvio
    &&Date.now()-new Date(w.meta.fEnvio).getTime()>7*86400e3);
  const pendHtml=pend.length?'<b style="font-size:.85rem;color:var(--warn)">Pendientes de respuesta (enviados +7 días)</b>'+
    '<table class="mini-table"><thead><tr><th>Obra</th><th>Cliente</th><th style="text-align:right">Enviada</th><th></th></tr></thead><tbody>'+
    pend.map(w=>`<tr><td>${esc(w.meta.num)}</td><td>${esc(w.meta.cliente)}</td>`+
      `<td style="text-align:right">hace ${Math.floor((Date.now()-new Date(w.meta.fEnvio).getTime())/86400e3)} d</td>`+
      `<td style="text-align:right;white-space:nowrap">
        <button type="button" class="btn mini" data-work-wa="${w.id}" title="Mensaje de seguimiento listo para WhatsApp">WhatsApp</button>
        <button type="button" class="btn mini" data-work-ics="${w.id}" title="Recordatorio en el calendario del móvil (.ics)">.ics</button></td></tr>`).join('')+
    '</tbody></table><div class="menu-sep" style="margin:10px 0"></div>':'';
  const row=w=>{ const est=w.meta.estado||'borrador';
    const env=(est==='enviado'&&w.meta.fEnvio)?Math.floor((Date.now()-new Date(w.meta.fEnvio).getTime())/86400e3):null;
    return `<tr${w.id===WORK_ID?' style="outline:1px solid var(--acc)"':''}>
    <td>${esc(w.meta.num)}${w.meta.ver?' '+esc(w.meta.ver):''}</td><td>${esc(w.meta.cliente)}</td>
    <td style="white-space:nowrap"><select data-work-estado="${w.id}" aria-label="Estado" style="color:${EST_COL[est]}">
      ${Object.entries(ESTADOS).map(([k,l])=>`<option value="${k}"${est===k?' selected':''}>${l}</option>`).join('')}</select>
      ${env!=null?`<br><small style="color:var(--tx2)">hace ${env} d</small>`:''}</td>
    <td style="text-align:right">${esc(w.meta.total)}</td>
    <td style="text-align:right">${w.meta.fecha?esc(fdate(w.meta.fecha)):''}</td>
    <td style="text-align:right;white-space:nowrap">
      <button type="button" class="btn mini primary" data-work-open="${w.id}">Abrir</button>
      <button type="button" class="btn mini" data-work-dup="${w.id}">Duplicar</button>
      <button type="button" class="btn mini danger" data-work-${w.arch?'del':'arch'}="${w.id}">${w.arch?'Borrar':'Archivar'}</button>
    </td></tr>`; };
  const vacio=f?'Ninguna obra coincide con la búsqueda.':'Sin obras guardadas todavía.';   /* #5 mejoras */
  const tabla=a=>a.length?'<table class="mini-table"><thead><tr><th>Nº</th><th>Cliente</th>'+
    '<th>Estado</th><th style="text-align:right">Total</th><th style="text-align:right">Fecha</th><th></th></tr></thead><tbody>'+
    a.map(row).join('')+'</tbody></table>':`<p class="hint">${vacio}</p>`;
  host.innerHTML=pendHtml+'<b style="font-size:.85rem">Activas</b>'+tabla(act)+
    (arc.length?'<div class="menu-sep" style="margin:10px 0"></div><b style="font-size:.85rem">Archivadas</b>'+tabla(arc):'');
}
/* seguimiento WhatsApp / calendario (#8 mejoras) */
function seguimientoWA(w){
  const tel=String((w.state&&w.state.vals&&w.state.vals['f-cli-tel'])||'').replace(/[^0-9]/g,'');
  const msg=`Hola ${w.meta.cliente||''}: te escribo por el presupuesto ${w.meta.num} (${w.meta.total}). `+
    `¿Has podido revisarlo? Quedo a tu disposición para cualquier duda. Un saludo, ${(idv('f-inst-nombre')||'').split(' ')[0]}`;
  window.open('https://wa.me/'+tel+'?text='+encodeURIComponent(msg),'_blank','noopener');  /* #7 mejoras2 */
}
function seguimientoICS(w){
  const fmt=d=>d.getFullYear()+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0')+
    'T'+String(d.getHours()).padStart(2,'0')+String(d.getMinutes()).padStart(2,'0')+'00';
  const ini=new Date(Date.now()+86400e3); ini.setHours(10,0,0,0);
  const fin=new Date(ini.getTime()+30*60000);
  const ics=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//presupuesto-electrico-pro//seguimiento//ES','BEGIN:VEVENT',
    'UID:'+w.id+'@presu-electrico-pro','DTSTAMP:'+fmt(new Date()),'DTSTART:'+fmt(ini),'DTEND:'+fmt(fin),
    'SUMMARY:Seguimiento '+w.meta.num+' — '+(w.meta.cliente||'cliente'),
    'DESCRIPTION:Recordatorio: presupuesto '+w.meta.num+' ('+w.meta.total+') enviado sin respuesta.',
    'BEGIN:VALARM','TRIGGER:-PT2H','ACTION:DISPLAY','DESCRIPTION:Seguimiento presupuesto','END:VALARM',
    'END:VEVENT','END:VCALENDAR'].join('\r\n');
  downloadBlob(ics,'recordatorio_'+w.meta.num+'.ics','text/calendar');
}
/* ofrece marcar la obra como enviada tras descargar/compartir el PDF (#8 mejoras) */
function marcarEnviadoSiProcede(){
  if(!WORK_ID) return;
  const works=worksGet(), w=works[WORK_ID]; if(!w) return;
  if((w.meta.estado||'borrador')!=='borrador') return;
  setTimeout(()=>{ if(confirm('¿Marco la obra '+w.meta.num+' como enviada al cliente?')){
    w.meta.estado='enviado'; w.meta.fEnvio=new Date().toISOString();
    worksSet(works); toast('Obra marcada como enviada.','ok');
  } },400);
}
function abrirObra(id){
  const works=worksGet(), w=works[id]; if(!w) return;
  WORK_ID=id;
  Store.apply(w.state); LOADING=false; Store.commit();
  $('#modal-works').classList.remove('show');
  toast('Obra '+w.meta.num+' cargada.','ok');
}
/* guarda la obra actual y empieza un presupuesto en blanco (#5 mejoras) */
function nuevoPresupuesto(){
  guardarObraActual(true);
  $$('.partida [data-qty]').forEach(q=>{ q.value=0; });
  $$('.partida [data-free]').forEach(q=>{ q.value=''; });
  $$('#presu [data-ltn]').forEach(c=>{ c.checked=false; });
  LIBRES=[]; renderLibres();
  ALBROWS=ALB_DEF.map(a=>({...a})); renderAlb();
  ['f-alb-mat','f-alb-maq','f-alb-e1','f-alb-e2'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=0; });
  ['f-cli-nombre','f-cli-nif','f-cli-dir','f-cli-mun','f-cli-prov','f-cli-ccaa','f-cli-cat','f-cli-pob','f-cli-tel','f-cli-mail','f-ver'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value=''; });
  $('#f-num').value=nextNum('PE');
  $('#f-fecha').value=new Date().toISOString().slice(0,10);
  resyncStateFromDom();   /* #8 mejoras2 (fase 2): el blanco recién pintado siembra el modelo */
  WORK_ID=null;
  $('#modal-works').classList.remove('show');
  calc(); save();
  toast('Presupuesto '+idv('f-num')+' en blanco — el anterior quedó en «Mis obras».','ok');
}

/* ================= copia de seguridad automática (#10) ================= */
function backupMensual(){
  const last=LS('pe-lastbackup');
  const now=Date.now();
  if(last&&now-new Date(last).getTime()<30*24*3600e3) return;
  exportarTodo();                        /* #1 mejoras2: la copia mensual ya es TOTAL, no solo el presupuesto */
  toast('Copia de seguridad mensual descargada: contiene todas tus obras, clientes, plantillas, facturas y precios.','ok');
}

/* ================= eventos globales ================= */
/* #50: debounce de calc + save diferido con requestIdleCallback */
const onInputDebounced=debounce(()=>{ calc(); idle(()=>save()); },140);
document.addEventListener('input',e=>{
  const t=/** @type {HTMLInputElement} */(e.target);
  fieldSync(t);   /* #8 mejoras2 (fase 2): vals/chips/x3 se actualizan en memoria */
  /* #8 mejoras2 (fase 1): líneas libres y albañilería se mutan en MEMORIA
     (LIBRES/ALBROWS); el DOM es reflejo y getState()/calc() ya no lo leen */
  if(t.matches&&t.matches('[data-lib]')){
    const i=parseInt(t.dataset.i,10), k=t.dataset.lib;
    if(LIBRES[i]) LIBRES[i][k]=k==='n'?t.value:(parseFloat(String(t.value).replace(',','.'))||0);
  } else if(t.matches&&t.matches('[data-albn],[data-albh],[data-albp]')){
    const id=t.dataset.albn||t.dataset.albh||t.dataset.albp;
    const a=ALBROWS.find(x=>x.id===id);
    if(a){
      if(t.dataset.albn!==undefined) a.name=t.value;
      else if(t.dataset.albh!==undefined) a.h=parseFloat(String(t.value).replace(',','.'))||0;
      else a.p=parseFloat(String(t.value).replace(',','.'))||0;
    }
  }
  if(t.matches('#presu input[id],#presu select[id],#presu textarea[id],[data-qty],[data-free],[data-albh],[data-albp],[data-albn],[data-lib]')){
    onInputDebounced();
  }
});
document.addEventListener('change',e=>{
  const t=/** @type {HTMLInputElement} */(e.target);
  fieldSync(t);   /* #8 mejoras2 (fase 2): selects, checkboxes y radios también van a memoria */
  if(t.matches('select[data-work-estado]')){                        /* #8 mejoras */
    const id=t.dataset.workEstado, works=worksGet(); if(!works[id]) return;
    works[id].meta.estado=t.value;
    if(t.value==='enviado'&&!works[id].meta.fEnvio) works[id].meta.fEnvio=new Date().toISOString();
    if(t.value==='borrador') works[id].meta.fEnvio=null;
    worksSet(works); renderObras(($('#works-filtro')||{}).value); return;
  }
  if(t.matches('input[type=radio][name^=pr-]')){
    const lb=t.closest('.chip-opt');
    lb.parentElement.querySelectorAll('.chip-opt').forEach(c=>c.classList.remove('sel'));
    lb.classList.add('sel'); calc(); save(); return;
  }
  if(t.id==='f-iva-mixto'){                                          /* #4 mejoras2: doble IVA */
    const w=$('#f-iva-p10-wrap'); if(w) w.style.display=t.checked?'':'none';
    calc(); save(); return; }
  if(t.matches('select[data-fact-cobrada]')){                       /* #4 mejoras2: libro de cobros */
    const facts=factsGet(), f=facts[parseInt(t.dataset.factCobrada,10)]; if(!f) return;
    f.cobrada=t.value==='1';
    if(f.cobrada&&!f.fCobro) f.fCobro=new Date().toISOString();
    if(!f.cobrada) f.fCobro=null;
    factsSet(facts); renderFacturas(); return; }
  if(t.matches('input[data-fact-fecha]')){
    const facts=factsGet(), f=facts[parseInt(t.dataset.factFecha,10)]; if(!f) return;
    f.fCobro=t.value||null;
    factsSet(facts); return; }
  if(t.name==='iva'||t.name==='wm'||t.matches('#presu select[id],#presu input[type=checkbox][id]')){ calc(); save(); return; }
  if(t.id==='f-marca'){ updateMat(); calc(); save(); return; }
  if(t.id==='rebt-l'||t.id==='rebt-lim'){ renderRebtAvanzado(); return; }
  if(t.id==='sel-clientes'&&t.value!==''){
    const c=(LS('pe-clients')||[])[parseInt(t.value,10)]; if(!c) return;
    fillFields({   /* #8 mejoras2 (fase 2): DOM+memoria siempre juntos */
      'f-cli-nombre':c.n||'','f-cli-nif':c.nif||'','f-cli-dir':c.dir||'',
      'f-cli-mun':c.mun||'','f-cli-prov':c.prov||'','f-cli-ccaa':c.ccaa||'',
      'f-cli-cat':c.cat||'','f-cli-pob':c.pob||'','f-cli-tel':c.tel||'','f-cli-mail':c.mail||''});
    calc(); save(); return;
  }
});
document.addEventListener('click',async e=>{
  const b=/** @type {Element} */(e.target).closest('button,[data-libdel]'); if(!b) return;
  const d=b.dataset||{};
  if(d.quick!==undefined){                                          /* #9 mejoras: +10/+25/+50 m */
    const el=document.getElementById('q-'+d.qkId); if(el){
      el.value=Math.max(0,(parseFloat(el.value)||0)+parseFloat(d.quick)); fieldSync(el); calc(); save(); } return; }
  if(d.libadd!==undefined){ addLibre(d.libadd); return; }           /* #10 mejoras */
  /* #8 mejoras2 (fase 1): se borra de la MEMORIA y se repinta desde ella —
     antes solo se quitaba la fila del DOM y la línea reaparecía al repintar */
  if(d.libdel!==undefined){
    const i=parseInt(d.libdel,10);
    if(!isNaN(i)&&LIBRES[i]) LIBRES.splice(i,1);
    renderLibres(); calc(); save(); return;
  }
  if(d.albdel!==undefined){
    ALBROWS=ALBROWS.filter(a=>a.id!==d.albdel);
    renderAlb(); calc(); save(); return;
  }
  if(d.tplAp!==undefined){ const t=(LS('pe-tpls')||[])[parseInt(d.tplAp,10)];
    if(t){ $$('.partida').forEach(box=>{
      const q=box.querySelector('[data-qty]'); if(q) q.value=t.q[box.dataset.id]??0; });
      $$('#presu [data-ltn]').forEach(c=>{ c.checked=!!(t.x3||{})[c.dataset.ltn]; });   /* #4 mejoras */
      resyncStateFromDom();   /* #8 mejoras2 (fase 2): la plantilla siembra el modelo */
      calc(); save(); } return; }
  if(d.tplDel!==undefined){ const ts=LS('pe-tpls')||[]; ts.splice(parseInt(d.tplDel,10),1); LS('pe-tpls',ts); renderTpls(); return; }
  if(d.refpHist!==undefined){                                        /* #9 mejoras2: rollback de precios */
    const hist=LS('pe-refp-historial')||[], h=hist[parseInt(d.refpHist,10)];
    if(!h) return;
    LS('pe-refp',{...(h.refp||{})});
    LS('pe-refp-fecha',h.fecha);
    aplicarRefpGuardados(); refreshRefpChips(); calc(); save(); renderHistPrecios();
    toast('Precios restaurados al punto del '+fdate(String(h.fecha).slice(0,10))+'.','ok');
    return; }
  if(d.cmpuse!==undefined){ setField('f-marca',d.cmpuse); updateMat(); calc(); save();
    toast('Marca de la tabla cambiada a '+MARCAS[d.cmpuse].label+'.','ok'); return; }
  if(d.workOpen!==undefined){ abrirObra(d.workOpen); return; }
  if(d.workDup!==undefined){
    const works=worksGet(), w=works[d.workDup]; if(!w) return;
    const nid='w'+Date.now().toString(36);
    works[nid]={meta:{...w.meta,num:nextNum('PE'),saved:new Date().toISOString(),
      estado:'borrador',fEnvio:null},state:w.state,arch:false};     /* la copia empieza en borrador (#8) */
    worksSet(works); renderObras();
    toast('Obra duplicada como '+works[nid].meta.num+'.','ok'); return;
  }
  if(d.workWa!==undefined){ const w=worksGet()[d.workWa]; if(w) seguimientoWA(w); return; }
  if(d.workIcs!==undefined){ const w=worksGet()[d.workIcs]; if(w) seguimientoICS(w); return; }
  if(d.workArch!==undefined){
    const works=worksGet(); if(works[d.workArch]) works[d.workArch].arch=true;
    worksSet(works); renderObras(); return;
  }
  if(d.workDel!==undefined){
    const works=worksGet(); delete works[d.workDel];
    worksSet(works); renderObras(); return;
  }
});

/* ================= acciones de botones ================= */
$('#btn-newnum').onclick=()=>{
  const tipo=idv('f-doc-tipo')==='factura'?'FE':'PE';           /* #4 mejoras2: serie FE-año */
  setField('f-num',nextNum(tipo)); save();
};
$('#btn-upver').onclick=()=>{ const m=idv('f-ver').match(/(\d+)/);
  setField('f-ver','v'+((m?parseInt(m[1],10):1)+1)); save(); };
$('#btn-rebt-av').onclick=renderRebtAvanzado;
$('#btn-estimar').onclick=estimar;                       /* #3 mejoras */
/* añade una línea libre: en el grupo indicado (#10 mejoras) o en el bloque
   global. #8 mejoras2 (fase 1): la línea nace en LIBRES y el DOM se repinta
   desde la memoria (con data-i coherente), nunca se inyecta a mano */
function addLibre(g){
  LIBRES.push({g:g||null,n:'',p:0,q:0});
  renderLibres();
  const c=document.querySelector(`[data-lib="n"][data-i="${LIBRES.length-1}"]`);
  if(c) /** @type {HTMLElement} */(c).focus();
  calc(); save();
}
$('#btn-libre-add').onclick=()=>addLibre(null);
$('#btn-cli-save').onclick=()=>{ const n=idv('f-cli-nombre'); if(!n){ toast('Escribe el nombre del cliente.','err'); return; }
  const cs=LS('pe-clients')||[];
  const c={n,nif:idv('f-cli-nif'),dir:idv('f-cli-dir'),mun:idv('f-cli-mun'),prov:idv('f-cli-prov'),
    ccaa:idv('f-cli-ccaa'),cat:idv('f-cli-cat'),pob:idv('f-cli-pob'),tel:idv('f-cli-tel'),mail:idv('f-cli-mail')};
  const ix=cs.findIndex(x=>x.n.toLowerCase()===n.toLowerCase());
  if(ix>=0) cs[ix]=c; else cs.push(c);
  LS('pe-clients',cs); renderClientes(); setField('sel-clientes',String(ix>=0?ix:cs.length-1));
  toast('Cliente guardado.','ok'); };
$('#btn-cli-del').onclick=()=>{ const v=$('#sel-clientes').value;
  if(v===''){ toast('Elige un cliente de la lista para borrar.','err'); return; }
  const cs=LS('pe-clients')||[]; cs.splice(parseInt(v,10),1); LS('pe-clients',cs); renderClientes(); };
$('#btn-tpl-save').onclick=()=>{ const n=idv('inp-tpl-nombre'); if(!n){ toast('Pon un nombre a la plantilla.','err'); return; }
  const q={}; $$('.partida').forEach(b=>q[b.dataset.id]=pQty(b.dataset.id));
  const x3={}; $$('#presu [data-ltn]').forEach(c=>{ if(c.checked) x3[c.dataset.ltn]=true; });  /* #4 mejoras */
  const ts=LS('pe-tpls')||[]; ts.push({n,q,x3}); LS('pe-tpls',ts); renderTpls(); setField('inp-tpl-nombre','');
  toast('Plantilla guardada.','ok'); };
$('#btn-mat-cmp').onclick=compararMarcas;
$('#btn-niveles-save').onclick=saveNiveles;                     /* #25 */
$('#btn-niveles-reset').onclick=resetNiveles;
const PERFIL_IDS=['f-inst-nombre','f-inst-pob','f-inst-nif','f-inst-tel','f-inst-mail','f-inst-aut','f-inst-rc'];
$('#btn-perfil-save').onclick=()=>{ const p={}; PERFIL_IDS.forEach(id=>p[id]=idv(id));
  LS('pe-profile',p); guardarObraActual(true); Store.commit();
  $('#perfil-hint').textContent='Guardado el '+new Date().toLocaleDateString('es-ES')+' a las '+new Date().toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})+'.';
  toast('Perfil del emisor guardado: se usará en nuevos documentos.','ok'); };
$('#btn-perfil-reset').onclick=()=>{
  Object.entries(EMISOR_DEF).forEach(([id,v])=>setField(id,v));
  try{ localStorage.removeItem('pe-profile'); }catch(e){}
  $('#perfil-hint').textContent='Valores de fábrica restaurados (perfil guardado eliminado).';
  calc(); save(); toast('Perfil restablecido a los valores de fábrica.','ok'); };
['logo','firma'].forEach(k=>{
  const fi=document.getElementById('file-'+k);
  if(fi) fi.addEventListener('change',e=>{ const fi2=/** @type {HTMLInputElement} */(e.target);
    setAsset(k,fi2.files&&fi2.files[0]); fi2.value=''; });
  const del=document.getElementById('btn-del-'+k);
  if(del) del.onclick=()=>quitarAsset(k);
});
$('#btn-alb-add').onclick=()=>{                 /* #8 mejoras2 (fase 1): nace en ALBROWS y se repinta */
  const id='alb-'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
  ALBROWS.push({id,name:'',h:0,p:num('f-alb-tarifa')||28});
  renderAlb();
  const c=document.querySelector(`[data-albn="${id}"]`);
  if(c) /** @type {HTMLElement} */(c).focus();
};

/* ---- PDF, importación y obras ---- */
$('#btn-pdf').onclick=askTipoPDF; $('#btn-pdf2').onclick=askTipoPDF; $('#btn-pdf-top').onclick=askTipoPDF;
$('#btn-preview').onclick=pdfPreview; $('#btn-preview-m').onclick=pdfPreview;
$('#btn-share').onclick=sharePDF; $('#btn-share-m').onclick=sharePDF;   /* #41 */
$('#btn-share-m2').onclick=sharePDF;                                    /* #7 mejoras2: sin onclick inline (CSP) */
$('#btn-json-exp').onclick=jsonExport;
$('#file-json').addEventListener('change',e=>{ if(e.target.files&&e.target.files[0]) jsonImport(e.target.files[0]); e.target.value=''; });
$('#btn-imp-cancel').onclick=()=>$('#modal-import').classList.remove('show');
$('#btn-imp-cancel2').onclick=()=>{ $('#modal-import').classList.remove('show');   /* #7 mejoras2: sin onclick inline (CSP) */
  window.__IMPORT_PENDING=null; window.__RESTORE_PENDING=null; };
$('#btn-imp-ok').onclick=()=>{ $('#modal-import').classList.remove('show');
  if(window.__RESTORE_PENDING){ aplicarRestauracionTotal(window.__RESTORE_PENDING); return; }  /* #1 mejoras2 */
  if(window.__IMPORT_PENDING){ importAI(window.__IMPORT_PENDING); window.__IMPORT_PENDING=null;
    LOADING=false; Store.commit(); toast('Datos importados correctamente (esquema IA).','ok'); } };
$('#btn-dl-presu').onclick=()=>dlTipo('presupuesto');
$('#btn-dl-fact').onclick=()=>dlTipo('factura');
$('#btn-dl-interno').onclick=()=>dlTipo('interno');          /* #7 mejoras */
$('#btn-dl-cancel').onclick=()=>$('#modal-tipo').classList.remove('show');
$('#modal-tipo').addEventListener('click',e=>{ if(e.target.id==='modal-tipo') e.currentTarget.classList.remove('show'); });
$('#btn-modal-dl').onclick=()=>{ if(!LAST_URL) return;
  const a=document.createElement('a'); a.href=LAST_URL; a.download=fname(); document.body.appendChild(a); a.click(); a.remove();
  if(idv('f-doc-tipo')==='factura') commitFactura(); };
$('#btn-modal-x').onclick=()=>$('#modal').classList.remove('show');
$('#btn-work-save').onclick=()=>guardarObraActual(false);
$('#btn-works').onclick=()=>{ const fi=$('#works-filtro'); if(fi) fi.value='';
  renderObras(); $('#modal-works').classList.add('show'); };
$('#btn-works-x').onclick=()=>$('#modal-works').classList.remove('show');
$('#works-filtro').oninput=e=>renderObras(e.target.value);        /* #5 mejoras */
$('#btn-nuevo-pe').onclick=nuevoPresupuesto;                      /* #5 mejoras */
$('#btn-nuevo-pe-m').onclick=nuevoPresupuesto;                    /* #5 mejoras */
$('#modal-works').addEventListener('click',e=>{ if(e.target.id==='modal-works') e.currentTarget.classList.remove('show'); });
/* ---- actualizador de precios (#6 mejoras) ---- */
function analizarPrecios(){
  const host=$('#precios-diff'), btn=$('#btn-precios-ap'); if(!host) return;
  const res=parseLM(idv('precios-texto'),REFP_PAT);
  if(!res.length){
    host.innerHTML='<p class="hint" style="color:var(--warn);font-weight:700">No se ha reconocido ningún artículo conocido. '+
      'Copia el listado con los nombres de producto y su precio en € (p. ej. «Cable LEXMAN H07V-K 2,5 mm² … 47,56 €»).</p>';
    if(btn) btn.disabled=true; return;
  }
  window.__PRECIOS_DIFF=res;
  host.innerHTML='<table class="mini-table"><thead><tr><th>Artículo</th><th style="text-align:right">PVP</th>'+
    '<th style="text-align:right">Actual</th><th style="text-align:right">Nuevo</th><th></th></tr></thead><tbody>'+
    res.map(r=>{
      const p=/** @type {any} */(PART_BY_ID[r.id]||{unit:'ud'});
      const nuevo=r.final>0?r.final:null;
      const dif=(nuevo!=null&&p.refp>0)?(nuevo-p.refp)/p.refp*100:null;
      return `<tr><td>${esc(p.name||r.id)}</td>`+
      `<td style="text-align:right">${nfC.format(r.pvp)} ${cur().sym}${r.metros?` <small>(${nfC.format(r.metros)} m)</small>`:''}</td>`+
      `<td style="text-align:right">${p.refp!=null?nfC.format(p.refp)+' '+cur().sym+'/'+(p.unit==='m'?'m':'ud'):'—'}</td>`+
      `<td style="text-align:right;font-weight:700;color:${dif==null?'inherit':(dif>0?'var(--danger)':'var(--ok)')}">${
        nuevo!=null?nfC.format(nuevo)+' '+cur().sym+'/'+(p.unit==='m'?'m':'ud'):'sin metros'}</td>`+
      `<td style="text-align:right">${nuevo!=null?`<label class="chip-opt"><input type="checkbox" class="prec-sel" data-id="${r.id}" checked> aplicar</label>`:''}</td></tr>`;
    }).join('')+'</tbody></table>'+
    '<p class="hint" style="margin:6px 0 0">PVP con IVA ÷ 1,21'+(res.some(r=>r.metros)?' ÷ metros del rollo':'')+
    '. Los precios aplicados viven en este navegador (pe-refp) y sustituyen al de fábrica hasta que vuelvas a actualizarlos.</p>';
  if(btn) btn.disabled=false;
}
function aplicarPrecios(){
  const sels=$$('#precios-diff .prec-sel:checked');
  if(!sels.length){ toast('Marca al menos un artículo para aplicar.','err'); return; }
  const ovr=LS('pe-refp')||{};
  const cambios={};                            /* #9 mejoras2: diff para el historial */
  sels.forEach(c=>{ const r=(window.__PRECIOS_DIFF||[]).find(x=>x.id===c.dataset.id);
    if(r&&r.final>0){
      const antes=(PART_BY_ID[r.id]&&PART_BY_ID[r.id].refp)||null;
      if(antes!==r.final) cambios[r.id]={a:antes,d:r.final};
      ovr[r.id]=r.final; } });
  LS('pe-refp',ovr);
  const fecha=new Date().toISOString();
  LS('pe-refp-fecha',fecha);
  if(Object.keys(cambios).length){              /* #9 mejoras2: entrada con snapshot exacto para rollback */
    const hist=LS('pe-refp-historial')||[];
    hist.push({fecha,refp:{...ovr},cambios});
    LS('pe-refp-historial',hist.slice(-20));
  }
  aplicarRefpGuardados(); refreshRefpChips(); calc(); save();
  $('#modal-precios').classList.remove('show');
  toast('Precios de referencia actualizados ('+sels.length+' artículo(s)).','ok');
}
$('#btn-precios').onclick=()=>{
  const fx=$('#pe-refp-fecha'), f=LS('pe-refp-fecha');
  if(fx) fx.textContent=f?('Última actualización: '+fdate(String(f).slice(0,10))+'.')
    :'Sin actualizaciones todavía: precios de fábrica del 09/11/2026.';
  $('#modal-precios').classList.add('show'); };
$('#btn-precios-x').onclick=()=>$('#modal-precios').classList.remove('show');
$('#btn-precios-an').onclick=analizarPrecios;
$('#btn-precios-ap').onclick=aplicarPrecios;
$('#modal-precios').addEventListener('click',e=>{ if(e.target.id==='modal-precios') e.currentTarget.classList.remove('show'); });
/* ---- historial de precios con rollback (#9 mejoras2) ---- */
function renderHistPrecios(){
  const host=$('#precios-hist'); if(!host) return;
  const hist=(LS('pe-refp-historial')||[]).slice().reverse();
  if(!hist.length){ host.innerHTML='<b style="font-size:.85rem">Historial</b><p class="hint" style="margin:4px 0 0">Sin actualizaciones todavía.</p>'; return; }
  host.innerHTML='<b style="font-size:.85rem">Historial de actualizaciones</b>'+
    hist.map((h,rix)=>{
      const n=hist.length-rix-1;   /* índice real (hist está invertida) */
      const dif=Object.entries(h.cambios||{}).map(([id,c])=>{
        const p=PART_BY_ID[id]||{name:id,unit:'ud'};
        return `<div class="hint" style="margin:0">${esc(p.name||id)}: ${c.a!=null?nfC.format(c.a):'—'} → <b>${nfC.format(c.d)} €/${p.unit==='m'?'m':'ud'}</b></div>`;
      }).join('');
      return `<div style="border:1px dashed var(--tx2);padding:8px;margin:8px 0">
        <div class="row-flex" style="margin:0">
          <b style="font-size:.82rem">${fdate(String(h.fecha).slice(0,10))} · ${new Date(h.fecha).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}</b>
          <button type="button" class="btn mini" data-refp-hist="${n}">Volver a este punto</button>
        </div>${dif}</div>`;
    }).join('');
}
$('#btn-precios').addEventListener('click',()=>renderHistPrecios(),true);   /* al abrir el modal */

/* ================= copia total + esquema versionado (#1 mejoras2) ================= */
const DB_VER=2;
/* Cadena de migraciones: cada paso transforma las claves pe-* de la versión
   v a la v+1 antes de que nada las lea. v1 = datos tal y como son hoy;
   v2 (ronda 2) = nace el propio registro versionado. Los futuros cambios de
   esquema añaden pasos aquí sin romper datos viejos guardados. */
function migrarDB(){
  const db=LS('pe-db');
  let v=db&&db.v?db.v:1;
  if(v<2) v=2;                    /* 1→2: sin transformación de datos todavía */
  if(!db||db.v!==v) LS('pe-db',{v});
}
/** Exporta TODAS las claves de localStorage (clientes, plantillas, precios,
 *  ajustes y presupuesto en pantalla) en un único JSON. Las obras y facturas
 *  viven en IndexedDB desde #5 (mejoras2): se inyectan con sus claves pe-*
 *  para que la copia siga siendo idéntica y compatible con versiones
 *  anteriores (y restaurable en navegadores sin IndexedDB). */
async function exportarTodo(){
  const keys={}; let bytes=0;
  for(let i=0;i<localStorage.length;i++){
    const k=localStorage.key(i); if(!k) continue;
    const raw=localStorage.getItem(k)||''; bytes+=raw.length;
    try{ keys[k]=JSON.parse(raw); }catch(e){ continue; }
  }
  if(Object.keys(WORKS).length) keys['pe-works']=WORKS;
  if(FACTS.length) keys['pe-facturas']=FACTS;
  const out={app:'presupuesto-electrico-pro-total',v:DB_VER,fecha:new Date().toISOString(),bytes,keys};
  downloadBlob(JSON.stringify(out),'copia_total_'+new Date().toISOString().slice(0,10)+'.json','application/json');
  LS('pe-lastbackup',new Date().toISOString());
  return out;
}
function restaurarPreview(d){
  const ks=(d&&d.keys)||{};
  const works=ks['pe-works']||{}, tpls=ks['pe-tpls']||[], clients=ks['pe-clients']||[],
    facts=ks['pe-facturas']||[], refp=ks['pe-refp']||{};
  return `<b>Copia total detectada</b> — ${d.fecha?fdate(String(d.fecha).slice(0,10))+' · '+new Date(d.fecha).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}):''}`+
    `<table class="mini-table"><tbody>
      <tr><td>Obras guardadas</td><td style="text-align:right">${Object.keys(works).length}</td></tr>
      <tr><td>Clientes</td><td style="text-align:right">${clients.length}</td></tr>
      <tr><td>Plantillas</td><td style="text-align:right">${tpls.length}</td></tr>
      <tr><td>Facturas emitidas</td><td style="text-align:right">${facts.length}</td></tr>
      <tr><td>Precios recalibrados</td><td style="text-align:right">${Object.keys(refp).length}</td></tr>
      <tr><td>Presupuesto en pantalla</td><td style="text-align:right">${ks[KEY]?'incluido':'no'}</td></tr>
    </tbody></table>
    <p class="hint" style="color:var(--warn);font-weight:700">Se sustituirán TODOS los datos de este navegador por los de la copia. Exporta antes una copia actual si no estás seguro.</p>`;
}
function aplicarRestauracionTotal(d){
  if(!d||!d.keys){ window.__RESTORE_PENDING=null; toast('La copia no es válida.','err'); return; }
  let n=0;
  Object.entries(d.keys).forEach(([k,v])=>{ try{ localStorage.setItem(k,JSON.stringify(v)); n++; }catch(e){} });
  /* las obras/facturas de IndexedDB deben REEMPLAZARSE por las de la copia:
     se borran de IDB y la migración del siguiente arranque vuelve a subirlas
     desde el localStorage recién escrito (#5 mejoras2) */
  (idb.db?idb.del('works'):Promise.resolve(false))
    .then(()=>idb.db?idb.del('facturas'):false)
    .then(()=>{ window.__RESTORE_PENDING=null;
      toast('Copia restaurada ('+n+' claves). Recargando la app…','ok');
      setTimeout(()=>location.reload(),900); });
}

/* ================= diagnóstico (#10 mejoras2) ================= */
const SW_CACHE_VER='presu-pro-v15';
async function infoDiag(){
  let uso='—';
  if(navigator.storage&&navigator.storage.estimate){
    try{ const e=await navigator.storage.estimate();
      uso=Math.round((e.usage||0)/1024)+' KB de ~'+Math.round((e.quota||0)/1048576)+' MB'; }catch(e){}
  }
  let lsBytes=0,nk=0;
  try{ for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i);
    if(k){ lsBytes+=(localStorage.getItem(k)||'').length; nk++; } } }catch(e){}
  const soporte=['serviceWorker: '+('serviceWorker' in navigator),
    'indexedDB: '+('indexedDB' in window),
    'share: '+!!navigator.share,
    'clipboard: '+!!(navigator.clipboard&&navigator.clipboard.writeText)];
  const errs=(window.__peErrors||[]).slice(-10).reverse();
  const obras=Object.keys(worksGet()).length, facts=factsGet().length;
  return {uso,lsBytes,nk,soporte,errs,obras,facts,idbOn:!!idb.db};
}
async function informeDiagTexto(){
  const i=await infoDiag();
  return ['PRESUPUESTO ELÉCTRICO PRO — INFORME DE DIAGNÓSTICO',
    'Versión: '+APP_VER+' · CACHE: '+SW_CACHE_VER+' · '+new Date().toISOString(),
    'Navegador: '+navigator.userAgent,
    'Soporte: '+i.soporte.join(' · '),
    'localStorage: '+i.nk+' claves · '+Math.round(i.lsBytes/1024)+' KB · almacenamiento: '+i.uso,
    'Obras: '+i.obras+' · Facturas: '+i.facts+' · en '+(i.idbOn?'IndexedDB':'localStorage (sin IndexedDB)'),
    'Errores recientes ('+i.errs.length+'):',
    ...(i.errs.length?i.errs.map(e=>'  · '+e.t+' — '+e.msg+(e.src?' ('+e.src+')':'')):['  (ninguno)'])
  ].join('\n');
}
async function abrirDiagnostico(){
  $('#modal-diag').classList.add('show');
  const box=$('#diag-info'); if(!box) return;
  const i=await infoDiag();
  const errs=i.errs.map(e=>`<tr><td>${esc(e.t.replace('T',' ').slice(0,16))}</td><td>${esc(e.msg)}${e.src?`<br><small>${esc(e.src)}</small>`:''}</td></tr>`).join('');
  box.innerHTML=`<table class="mini-table"><tbody>
    <tr><td>Versión de la app</td><td style="text-align:right">${APP_VER} · CACHE ${SW_CACHE_VER}</td></tr>
    <tr><td>Soporte</td><td style="text-align:right">${i.soporte.join(' · ')}</td></tr>
    <tr><td>localStorage</td><td style="text-align:right">${i.nk} claves · ${Math.round(i.lsBytes/1024)} KB</td></tr>
    <tr><td>Almacenamiento estimado</td><td style="text-align:right">${esc(i.uso)}</td></tr>
    <tr><td>Obras / facturas</td><td style="text-align:right">${i.obras} / ${i.facts} · en ${i.idbOn?'IndexedDB':'localStorage (sin IndexedDB)'}</td></tr>
  </tbody></table>
  <b style="font-size:.85rem">Últimos errores registrados</b>
  ${errs?'<table class="mini-table"><thead><tr><th>Fecha</th><th>Error</th></tr></thead><tbody>'+errs+'</tbody></table>':'<p class="hint">Ninguno registrado.</p>'}`;
}

/* ================= libro de facturas (#4 mejoras2) ================= */
function renderFacturas(){
  const host=$('#facturas-list'); if(!host) return;
  const facts=factsGet();
  if(!facts.length){ host.innerHTML='<p class="hint">Aún no hay facturas registradas: descarga un presupuesto como «Factura» y quedará en el libro con su hash Veri*factu.</p>'; return; }
  const tot=facts.reduce((a,f)=>a+(f.total||0),0);
  const cobr=facts.filter(f=>f.cobrada).reduce((a,f)=>a+(f.total||0),0);
  host.innerHTML='<table class="mini-table"><thead><tr><th>Fecha</th><th>Nº</th><th>Cliente</th>'+
    '<th style="text-align:right">Base</th><th style="text-align:right">IVA</th><th style="text-align:right">Total</th>'+
    '<th>Cobro</th></tr></thead><tbody>'+
    facts.map((f,i)=>{
      const iva=(f.total||0)-(f.base||0);
      return `<tr><td>${esc(fdate(String(f.fecha).slice(0,10)))}</td><td><b>${esc(f.num)}</b></td><td>${esc(f.cliente||'—')}</td>`+
        `<td style="text-align:right">${nf.format(f.base||0)}</td><td style="text-align:right">${nf.format(iva)}</td>`+
        `<td style="text-align:right"><b>${nf.format(f.total||0)} ${cur().sym}</b></td>`+
        `<td style="white-space:nowrap"><select data-fact-cobrada="${i}" style="color:${f.cobrada?'var(--ok)':'var(--warn)'}" aria-label="Estado de cobro">`+
          `<option value="0"${f.cobrada?'':' selected'}>Pendiente</option><option value="1"${f.cobrada?' selected':''}>Cobrada</option></select>`+
        (f.cobrada?` <input type="date" data-fact-fecha="${i}" value="${String(f.fCobro||'').slice(0,10)}" style="width:112px" aria-label="Fecha de cobro">`:'')+
        `</td></tr>`;
    }).join('')+
    `</tbody><tfoot><tr><td colspan="5">Facturado / cobrado</td>`+
    `<td style="text-align:right"><b>${nf.format(tot)} ${cur().sym}</b></td>`+
    `<td><b style="color:var(--ok)">${nf.format(cobr)} ${cur().sym}</b></td></tr></tfoot></table>`;
}
function exportarFacturasCSV(){
  const facts=factsGet();
  if(!facts.length){ toast('No hay facturas que exportar.','err'); return; }
  const rows=[['fecha','numero','cliente','base_eur','iva_eur','total_eur','estado','fecha_cobro','hash']];
  facts.forEach(f=>rows.push([String(f.fecha).slice(0,10),f.num,f.cliente||'',
    (f.base||0).toFixed(2).replace('.',','),((f.total||0)-(f.base||0)).toFixed(2).replace('.',','),
    (f.total||0).toFixed(2).replace('.',','),f.cobrada?'cobrada':'pendiente',
    String(f.fCobro||'').slice(0,10),f.hash||'']));
  downloadBlob(rows.map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(';')).join('\r\n'),
    'libro_facturas_'+new Date().getFullYear()+'.csv','text/csv');
}

/* ---- botones de facturación, copia total y diagnóstico ---- */
$('#btn-facturas').onclick=()=>{ renderFacturas(); $('#modal-facturas').classList.add('show'); };
$('#btn-facturas-x').onclick=()=>$('#modal-facturas').classList.remove('show');
$('#modal-facturas').addEventListener('click',e=>{ if(e.target.id==='modal-facturas') e.currentTarget.classList.remove('show'); });
$('#btn-fact-csv').onclick=exportarFacturasCSV;
$('#btn-export-total').onclick=()=>{ exportarTodo();
  toast('Copia total descargada: guárdala fuera del dispositivo (Drive, email…).','ok'); };
$('#file-dbtotal').addEventListener('change',e=>{
  const f=e.target.files&&e.target.files[0]; e.target.value='';
  if(!f) return;
  const rd=new FileReader();
  rd.onload=()=>{ try{
      const d=JSON.parse(String(rd.result));
      if(d.app!=='presupuesto-electrico-pro-total'||!d.keys) throw new Error('formato');
      $('#imp-preview').innerHTML=restaurarPreview(d);
      window.__RESTORE_PENDING=d; window.__IMPORT_PENDING=null;
      $('#modal-import').classList.add('show');
    }catch(err){ toast('No es una copia total válida (usa los archivos copia_total_*.json).','err'); } };
  rd.readAsText(f);
});
$('#btn-diag').onclick=abrirDiagnostico;
$('#btn-diag-x').onclick=()=>$('#modal-diag').classList.remove('show');
$('#modal-diag').addEventListener('click',e=>{ if(e.target.id==='modal-diag') e.currentTarget.classList.remove('show'); });
$('#btn-diag-copy').onclick=async()=>{ const t=await informeDiagTexto();
  if(navigator.clipboard&&navigator.clipboard.writeText)
    navigator.clipboard.writeText(t).then(()=>toast('Informe copiado al portapapeles.','ok'),()=>toast('No se pudo copiar.','err'));
  else toast('Este navegador no permite copiar al portapapeles.','err'); };
$('#btn-diag-clear').onclick=()=>{ window.__peErrors=[]; LS('pe-errors',[]);
  abrirDiagnostico(); toast('Errores registrados borrados.','ok'); };
/* ---- PWA: aviso de nueva versión e instalación (#6 mejoras2) ---- */
$('#btn-sw-reload').onclick=()=>location.reload();
$('#btn-sw-x').onclick=()=>{ try{ sessionStorage.setItem('pe-sw-dismiss','1'); }catch(e){}
  $('#sw-update').classList.remove('show'); };
$('#btn-install').onclick=async()=>{ const ev=window.__PWA_INSTALL; if(!ev) return;
  ev.prompt();
  try{ const c=await ev.userChoice; if(c&&c.outcome==='accepted') toast('Instalando la app…','ok'); }catch(e){}
  window.__PWA_INSTALL=null; const b=$('#btn-install'); if(b) b.hidden=true; };
/* ---- modo obra (#9 mejoras) ---- */
$('#btn-obra').onclick=()=>{
  const on=document.body.classList.toggle('obra');
  LS('pe-obra',on?1:0);
  const bo=$('#btn-obra');
  bo.classList.toggle('primary',on); bo.setAttribute('aria-pressed',String(on)); };
$('#btn-wizard').onclick=()=>{ const on=document.body.classList.toggle('wizard');
  $('#btn-wizard').textContent=on?'Vista completa (todas las secciones)':'Modo asistente por pasos';
  if(on) showStep(0); save(); };
$('#btn-undo').onclick=doUndo; $('#btn-redo').onclick=doRedo;
$('#wiz-prev').onclick=()=>showStep(WIZ-1);
$('#wiz-next').onclick=()=>{ if(WIZ===6) askTipoPDF(); else showStep(WIZ+1); };
$('#wiz-step').addEventListener('change',e=>showStep(parseInt(e.target.value,10)));
$('#btn-menu').addEventListener('click',e=>{ e.stopPropagation();
  const p=$('#menu-panel'); const open=p.hidden; p.hidden=!open;
  $('#btn-menu').setAttribute('aria-expanded',String(open)); });
document.addEventListener('click',e=>{ if(!/** @type {Element} */(e.target).closest('.menu-wrap')){
  $('#menu-panel').hidden=true; $('#btn-menu').setAttribute('aria-expanded','false'); } });
$('#f-theme').addEventListener('change',e=>applyTheme(e.target.value));          /* #16 */
$('#btn-side').addEventListener('click',()=>{                                   /* #19 */
  const s=$('#side'); s.classList.toggle('open');
  const b=$('#side-backdrop'); b.classList.toggle('show',s.classList.contains('open'));
});
$('#side-backdrop').addEventListener('click',()=>{ $('#side').classList.remove('open'); $('#side-backdrop').classList.remove('show'); });

/* ---- atajos de teclado (#23) + foco atrapado en modales (#47) ---- */
function focusablesIn(el){ return [...el.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')]
  .filter(x=>!x.disabled&&x.offsetParent!==null); }
document.addEventListener('keydown',e=>{
  const tgt=/** @type {Element} */(e.target);
  if(e.key==='Escape'){ ['#modal','#modal-tipo','#modal-works','#modal-import','#modal-precios','#modal-facturas','#modal-diag'].forEach(s=>$(s)?.classList.remove('show'));
    $('#menu-panel').hidden=true; $('#btn-menu').setAttribute('aria-expanded','false');
    $('#side').classList.remove('open'); $('#side-backdrop').classList.remove('show'); return; }
  /* foco atrapado en diálogos modales */
  const modalOpen=$('#modal.show')||$('#modal-tipo.show')||$('#modal-works.show')||$('#modal-import.show')||$('#modal-precios.show')||$('#modal-facturas.show')||$('#modal-diag.show');
  if(modalOpen&&e.key==='Tab'){
    const f=focusablesIn(modalOpen); if(!f.length) return;
    const first=f[0], last=f[f.length-1];
    if(e.shiftKey&&document.activeElement===first){ e.preventDefault(); last.focus(); }
    else if(!e.shiftKey&&document.activeElement===last){ e.preventDefault(); first.focus(); }
    else if(!modalOpen.contains(document.activeElement)){ e.preventDefault(); first.focus(); }
    return;
  }
  const tag=(tgt.tagName||'').toUpperCase();
  const typing=tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT';
  /* Enter en el concepto de una línea libre crea la siguiente (#10 mejoras) */
  if(e.key==='Enter'&&tgt.matches&&tgt.matches('[data-lib="n"]')){
    e.preventDefault();
    const gh=tgt.closest('.lib-row')?.closest('[data-glib]');
    addLibre(gh?gh.dataset.glib:null); return;
  }
  if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){ e.preventDefault(); askTipoPDF(); return; }
  if((e.ctrlKey||e.metaKey)&&(e.key==='p'||e.key==='P')){ e.preventDefault(); pdfPreview(); return; }
  if((e.ctrlKey||e.metaKey)&&(e.key==='s'||e.key==='S')){ e.preventDefault(); jsonExport(); return; }
  if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&(e.key==='z'||e.key==='Z')&&!typing){ e.preventDefault(); doUndo(); return; }
  if((e.ctrlKey||e.metaKey)&&(e.key==='y'||e.key==='Y')&&!typing){ e.preventDefault(); doRedo(); return; }
  if((e.key==='ArrowUp'||e.key==='ArrowDown')&&tgt.matches&&tgt.matches('[data-qty],[data-free]')){
    e.preventDefault(); const d=e.key==='ArrowUp'?1:-1;
    tgt.value=Math.max(0,(parseFloat(tgt.value)||0)+d); fieldSync(/** @type {HTMLInputElement} */(tgt)); calc(); save(); }
});

/* ---- aviso al salir con cambios sin persistir (#12) ---- */
window.addEventListener('beforeunload',e=>{
  if(DIRTY&&lastSnap!==null){
    try{ localStorage.setItem(KEY,lastSnap); }catch(err){}
  }
});

/* ---- navbar de secciones ---- */
function setActiveSec(id){ $$('#secnav a').forEach(a=>{
  const on=a.dataset.sec===id;
  a.classList.toggle('active',on);
  if(on) a.setAttribute('aria-current','true'); else a.removeAttribute('aria-current');
}); }
function goSection(id){
  const el=document.getElementById(id); if(!el) return;
  const card=el.closest('.card.step'); const stp=card?parseInt(card.dataset.step,10):-1;
  if(document.body.classList.contains('wizard')&&stp>=0){ showStep(stp); return; }
  if(document.body.classList.contains('wizard')){
    document.body.classList.remove('wizard');
    $('#btn-wizard').textContent='Modo asistente por pasos'; save();
  }
  setActiveSec(id);
  window.scrollTo({top:el.getBoundingClientRect().top+window.scrollY-96,behavior:'smooth'});
}
let _navT=null;
window.addEventListener('scroll',()=>{ if(_navT) return; _navT=requestAnimationFrame(()=>{ _navT=null;
  if(document.body.classList.contains('wizard')) return;
  let cur=/** @type {Element|null} */(null);
  $$('#secnav a').forEach(a=>{ const el=document.getElementById(a.dataset.sec);
    if(el&&el.getBoundingClientRect().top<=130) cur=a; });
  if(cur) setActiveSec(cur.dataset.sec);
});},{passive:true});
document.addEventListener('click',e=>{
  const a=/** @type {Element} */(e.target).closest('#secnav a,a[data-sec]'); if(!a) return;
  e.preventDefault(); goSection(a.dataset.sec);
});

/* ---- wizard ---- */
let WIZ=0;
function showStep(i){
  WIZ=Math.max(0,Math.min(6,i));
  $$('.card.step').forEach(c=>c.classList.toggle('active',c.dataset.step===String(WIZ)));
  $('#wiz-step').value=String(WIZ);
  $('#wiz-prev').disabled=WIZ===0;
  $('#wiz-next').textContent=WIZ===6?'Generar PDF':'Siguiente →';
  const act=$('.card.step.active'); if(act) setActiveSec(act.id);
  window.scrollTo({top:0,behavior:'smooth'});
}

/* ---- color de acento ---- */
function applyColor(hex){
  hex=(hex&&/^#[0-9a-fA-F]{6}$/.test(hex))?hex:'#2f6ae0';
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  const d=c=>Math.max(0,Math.round(c*0.72));
  const st=document.documentElement.style;
  st.setProperty('--acc',hex);
  st.setProperty('--acc2',`rgb(${d(r)},${d(g)},${d(b)})`);
}

/* ---- accesibilidad (#47): labels con for ---- */
function a11yInit(){
  $$('.field label').forEach(l=>{
    const f=l.closest('.field'); if(!f) return;
    const inp=f.querySelector('input,select,textarea');
    if(inp&&inp.id&&!l.htmlFor&&inp.type!=='radio'&&inp.type!=='checkbox') l.htmlFor=inp.id;
  });
}

/* ================= arranque ================= */
async function init(){
  migrarDB();                                       /* #1 mejoras2: migraciones de esquema antes de leer nada */
  await idb.open();
  await migrarObrasFacturasIDB();                   /* #5 mejoras2: obras y facturas a IndexedDB (o LS sin IDB) */
  /* estado en localStorage; si faltara, recuperar de IndexedDB (#11) */
  let saved=LS(KEY);
  if(!saved){ const s=await idb.get('state');
    if(s){ try{ localStorage.setItem(KEY,typeof s==='string'?s:JSON.stringify(s)); }catch(e){}
      const rn=$('#restored-note'); if(rn) rn.classList.add('show'); } }
  /* imágenes guardadas (#34) */
  const assets=await idb.get('assets');
  if(assets){ window.__peAssets=assets;
    ['logo','firma'].forEach(k=>{
      const pv=document.getElementById('pv-'+k);
      if(pv&&assets[k]){ pv.src=assets[k]; pv.hidden=false;
        const del=document.getElementById('btn-del-'+k); if(del) del.hidden=false; }
    }); }
  applyNivelesGuardados();                                        /* #25 */
  applyPreciosGuardados();
  aplicarRefpGuardados();                                         /* #6 mejoras: antes de renderGrupos */
  renderGrupos(); renderNivelesEditor();
  renderAlb(); renderLibres();
  renderClientes();
  /* plantillas de fábrica (#4 mejoras): se siembran una sola vez, sin pisar
     las que el usuario ya tenga guardadas */
  if(!LS('pe-tpls-seeded')){
    LS('pe-tpls',[...TPL_FACTORY.map(t=>({n:t.n,q:{...t.q},x3:{...(t.x3||{})}})),...(LS('pe-tpls')||[])]);
    LS('pe-tpls-seeded',1);
  }
  renderTpls();
  if(!idv('f-fecha')) $('#f-fecha').value=new Date().toISOString().slice(0,10);
  if(!idv('f-num')) $('#f-num').value=nextNum('PE');
  applyColor(ACC_COLOR);
  applyTheme(LS('pe-theme')||'auto');                             /* #16 */
  if(saved){ try{ Store.apply(typeof saved==='string'?JSON.parse(saved):saved); }
    catch(err){ console.warn('Estado guardado no recuperable:',err); } }
  const prof=LS('pe-profile');
  if(prof) Object.entries(prof).forEach(([id,v])=>setField(id,v));
  Object.entries(EMISOR_DEF).forEach(([id,v])=>{ if(!idv(id)) setField(id,v); });
  resyncStateFromDom();   /* #8 mejoras2 (fase 2): el arranque siembra VALS/CHIPS/X3 desde el DOM por defecto */
  LOADING=false;
  repriceChips(); calc(); save();
  a11yInit();                                                     /* #47 */
  if(!document.body.classList.contains('wizard')) setActiveSec('sec-datos');
  if(LS('pe-obra')){                                              /* #9 mejoras: modo obra persistente */
    document.body.classList.add('obra');
    const bo=$('#btn-obra'); if(bo){ bo.classList.add('primary'); bo.setAttribute('aria-pressed','true'); }
  }
  setTimeout(backupMensual,2500);                                 /* #10 */
  /* aviso precios de referencia desactualizados (#6 mejoras) */
  setTimeout(()=>{ const fR=LS('pe-refp-fecha');
    if(fR&&Date.now()-new Date(fR).getTime()>90*24*3600e3)
      toast('Precios de referencia sin actualizar desde el '+fdate(String(fR).slice(0,10))+' — usa «Actualizar precios» en Opciones.','err');
  },2700);
  /* precios.json externo (#42): solo con http(s), fallo silencioso en file:// */
  if(/^https?:$/.test(location.protocol)&&typeof fetch==='function'){
    fetch('precios.json?v='+Date.now()).then(r=>r.json()).then(d=>{
      if(aplicarTarifasExternas(d)){
        renderNivelesEditor(); renderGrupos();
        applyState(getState());   /* #8 mejoras2 (fase 2): repinta el DOM desde el modelo (renderGrupos borra lo escrito) */
        calc(); save();
        toast('Tarifas actualizadas desde precios.json (v'+d.version+').','ok');
      }
    }).catch(()=>{});
  }
  /* PWA (#49 + #6 mejoras2): service worker, aviso de nueva versión e instalación */
  if('serviceWorker' in navigator&&/^https?:$/.test(location.protocol)){
    /* skipWaiting+claim() disparan controllerchange también en la PRIMERA
       instalación: solo avisamos si ya había un controlador (actualización real). */
    const hadController=!!navigator.serviceWorker.controller;
    let swDismissed=false;
    try{ swDismissed=sessionStorage.getItem('pe-sw-dismiss')==='1'; }catch(e){}
    navigator.serviceWorker.addEventListener('controllerchange',()=>{
      if(!hadController||swDismissed) return;
      const b=$('#sw-update'); if(b) b.classList.add('show');
    });
    window.addEventListener('beforeinstallprompt',ev=>{       /* instalación como app */
      ev.preventDefault();
      window.__PWA_INSTALL=ev;
      const b=$('#btn-install'); if(b) b.hidden=false;
    });
    window.addEventListener('appinstalled',()=>{
      window.__PWA_INSTALL=null;
      const b=$('#btn-install'); if(b) b.hidden=true;
      toast('App instalada en el dispositivo.','ok');
    });
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  }
  Store.subscribe(()=>{ /* puntos de extensión futuros (navbar, obras…) */ });
}
init();
