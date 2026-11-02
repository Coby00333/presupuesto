// @ts-check
'use strict';
/* =====================================================================
   app.js — Arranque, eventos, IndexedDB (#11), multi-obra (#9), tema (#16),
   accesibilidad (#47), PWA (#49), rendimiento de entrada (#50)
   y copia de seguridad (#10). Carga al final de <body>.
   ===================================================================== */

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
    }catch(e){ res(false); } }); }
};
window.__peIDB={
  async putState(s){ if(typeof s==='string'){ try{ s=JSON.parse(s); }catch(e){ return; } } idb.put('state',s); },
  async getState(){ return idb.get('state'); }
};

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
function guardarObraActual(silent){
  const r=calc();
  const works=LS('pe-works')||{};
  WORK_ID=WORK_ID||('w'+Date.now().toString(36));
  works[WORK_ID]={meta:{num:idv('f-num')||'—',ver:idv('f-ver'),cliente:idv('f-cli-nombre')||'—',
    fecha:idv('f-fecha'),total:money(r.total),saved:new Date().toISOString()},state:getState(),arch:false};
  LS('pe-works',works);
  if(!silent) toast('Obra guardada en «Mis obras» ('+works[WORK_ID].meta.num+').','ok');
}
function renderObras(){
  const host=$('#works-list'); if(!host) return;
  const works=LS('pe-works')||{};
  const arr=Object.entries(works).map(([id,w])=>({id,...w}))
    .sort((a,b)=>String(b.meta.saved||'').localeCompare(String(a.meta.saved||'')));
  const act=arr.filter(w=>!w.arch), arc=arr.filter(w=>w.arch);
  const row=w=>`<tr${w.id===WORK_ID?' style="outline:1px solid var(--acc)"':''}>
    <td>${esc(w.meta.num)}${w.meta.ver?' '+esc(w.meta.ver):''}</td><td>${esc(w.meta.cliente)}</td>
    <td style="text-align:right">${esc(w.meta.total)}</td>
    <td style="text-align:right">${w.meta.fecha?esc(fdate(w.meta.fecha)):''}</td>
    <td style="text-align:right;white-space:nowrap">
      <button type="button" class="btn mini primary" data-work-open="${w.id}">Abrir</button>
      <button type="button" class="btn mini" data-work-dup="${w.id}">Duplicar</button>
      <button type="button" class="btn mini danger" data-work-${w.arch?'del':'arch'}="${w.id}">${w.arch?'Borrar':'Archivar'}</button>
    </td></tr>`;
  const tabla=a=>a.length?'<table class="mini-table"><thead><tr><th>Nº</th><th>Cliente</th>'+
    '<th style="text-align:right">Total</th><th style="text-align:right">Fecha</th><th></th></tr></thead><tbody>'+
    a.map(row).join('')+'</tbody></table>':'<p class="hint">Sin obras guardadas todavía.</p>';
  host.innerHTML='<b style="font-size:.85rem">Activas</b>'+tabla(act)+
    (arc.length?'<div class="menu-sep" style="margin:10px 0"></div><b style="font-size:.85rem">Archivadas</b>'+tabla(arc):'');
}
function abrirObra(id){
  const works=LS('pe-works')||{}, w=works[id]; if(!w) return;
  WORK_ID=id;
  Store.apply(w.state); LOADING=false; Store.commit();
  $('#modal-works').classList.remove('show');
  toast('Obra '+w.meta.num+' cargada.','ok');
}

/* ================= copia de seguridad automática (#10) ================= */
function backupMensual(){
  const last=LS('pe-lastbackup');
  const now=Date.now();
  if(last&&now-new Date(last).getTime()<30*24*3600*1000) return;
  downloadBlob(JSON.stringify({app:'presupuesto-electrico-pro',v:3,
    meta:{num:idv('f-num'),cliente:idv('f-cli-nombre'),total:money(calc().total)},
    ia:buildAISchema(),state:getState()},null,2),
    'respaldo_presupuestos_'+new Date().toISOString().slice(0,10)+'.json','application/json');
  LS('pe-lastbackup',new Date().toISOString());
  toast('Copia de seguridad mensual descargada automáticamente.','ok');
}

/* ================= eventos globales ================= */
/* #50: debounce de calc + save diferido con requestIdleCallback */
const onInputDebounced=debounce(()=>{ calc(); idle(()=>save()); },140);
document.addEventListener('input',e=>{
  const t=e.target;
  if(t.matches('#presu input[id],#presu select[id],#presu textarea[id],[data-qty],[data-free],[data-albh],[data-albp],[data-albn],[data-lib]')){
    onInputDebounced();
  }
});
document.addEventListener('change',e=>{
  const t=e.target;
  if(t.matches('input[type=radio][name^=pr-]')){
    const lb=t.closest('.chip-opt');
    lb.parentElement.querySelectorAll('.chip-opt').forEach(c=>c.classList.remove('sel'));
    lb.classList.add('sel'); calc(); save(); return;
  }
  if(t.name==='iva'||t.name==='wm'||t.matches('#presu select[id],#presu input[type=checkbox][id]')){ calc(); save(); return; }
  if(t.id==='f-marca'){ updateMat(); calc(); save(); return; }
  if(t.id==='rebt-l'||t.id==='rebt-lim'){ renderRebtAvanzado(); return; }
  if(t.id==='sel-clientes'&&t.value!==''){
    const c=(LS('pe-clients')||[])[parseInt(t.value,10)]; if(!c) return;
    $('#f-cli-nombre').value=c.n||''; $('#f-cli-nif').value=c.nif||''; $('#f-cli-dir').value=c.dir||'';
    $('#f-cli-mun').value=c.mun||''; $('#f-cli-prov').value=c.prov||''; $('#f-cli-ccaa').value=c.ccaa||'';
    $('#f-cli-cat').value=c.cat||'';
    $('#f-cli-pob').value=c.pob||''; $('#f-cli-tel').value=c.tel||''; $('#f-cli-mail').value=c.mail||'';
    calc(); save(); return;
  }
});
document.addEventListener('click',async e=>{
  const b=e.target.closest('button,[data-libdel]'); if(!b) return;
  const d=b.dataset||{};
  if(d.libdel!==undefined){ b.closest('.lib-row')?.remove(); calc(); save(); return; }
  if(d.albdel!==undefined){ b.closest('.alb-row')?.remove(); calc(); save(); return; }
  if(d.tplAp!==undefined){ const t=(LS('pe-tpls')||[])[parseInt(d.tplAp,10)];
    if(t){ $$('.partida').forEach(box=>{
      const q=box.querySelector('[data-qty]'); if(q) q.value=t.q[box.dataset.id]??0; }); calc(); save(); } return; }
  if(d.tplDel!==undefined){ const ts=LS('pe-tpls')||[]; ts.splice(parseInt(d.tplDel,10),1); LS('pe-tpls',ts); renderTpls(); return; }
  if(d.cmpuse!==undefined){ $('#f-marca').value=d.cmpuse; updateMat(); calc(); save();
    toast('Marca de la tabla cambiada a '+MARCAS[d.cmpuse].label+'.','ok'); return; }
  if(d.workOpen!==undefined){ abrirObra(d.workOpen); return; }
  if(d.workDup!==undefined){
    const works=LS('pe-works')||{}, w=works[d.workDup]; if(!w) return;
    const nid='w'+Date.now().toString(36);
    works[nid]={meta:{...w.meta,num:nextNum('PE'),saved:new Date().toISOString()},state:w.state,arch:false};
    LS('pe-works',works); renderObras();
    toast('Obra duplicada como '+works[nid].meta.num+'.','ok'); return;
  }
  if(d.workArch!==undefined){
    const works=LS('pe-works')||{}; if(works[d.workArch]) works[d.workArch].arch=true;
    LS('pe-works',works); renderObras(); return;
  }
  if(d.workDel!==undefined){
    const works=LS('pe-works')||{}; delete works[d.workDel];
    LS('pe-works',works); renderObras(); return;
  }
});

/* ================= acciones de botones ================= */
$('#btn-newnum').onclick=()=>{
  const tipo=idv('f-doc-tipo')==='factura'?'FA':'PE';           /* #14 */
  $('#f-num').value=nextNum(tipo); save();
};
$('#btn-upver').onclick=()=>{ const m=idv('f-ver').match(/(\d+)/);
  $('#f-ver').value='v'+((m?parseInt(m[1],10):1)+1); save(); };
$('#btn-rebt-av').onclick=renderRebtAvanzado;
$('#btn-libre-add').onclick=()=>{ const row=document.createElement('div'); row.className='partida lib-row';
  row.innerHTML=`<div class="p-head">
      <input type="text" class="cname" placeholder="Concepto" value="" data-lib="n" aria-label="Concepto">
      <span class="p-sub" data-sub>—</span></div>
    <div class="p-row">
      <span class="qty-wrap"><label>Precio ${cur().sym}</label>
        <input type="number" min="0" step="0.01" value="0" data-lib="p" aria-label="Precio"></span>
      <span class="qty-wrap"><label>Cant.</label>
        <input type="number" min="0" step="1" value="0" data-lib="q" aria-label="Cantidad"></span>
      <button type="button" class="btn mini danger" data-libdel title="Eliminar">×</button></div>`;
  $('#libres-wrap').appendChild(row); calc(); save(); };
$('#btn-cli-save').onclick=()=>{ const n=idv('f-cli-nombre'); if(!n){ toast('Escribe el nombre del cliente.','err'); return; }
  const cs=LS('pe-clients')||[];
  const c={n,nif:idv('f-cli-nif'),dir:idv('f-cli-dir'),mun:idv('f-cli-mun'),prov:idv('f-cli-prov'),
    ccaa:idv('f-cli-ccaa'),cat:idv('f-cli-cat'),pob:idv('f-cli-pob'),tel:idv('f-cli-tel'),mail:idv('f-cli-mail')};
  const ix=cs.findIndex(x=>x.n.toLowerCase()===n.toLowerCase());
  if(ix>=0) cs[ix]=c; else cs.push(c);
  LS('pe-clients',cs); renderClientes(); $('#sel-clientes').value=String(ix>=0?ix:cs.length-1);
  toast('Cliente guardado.','ok'); };
$('#btn-cli-del').onclick=()=>{ const v=$('#sel-clientes').value;
  if(v===''){ toast('Elige un cliente de la lista para borrar.','err'); return; }
  const cs=LS('pe-clients')||[]; cs.splice(parseInt(v,10),1); LS('pe-clients',cs); renderClientes(); };
$('#btn-tpl-save').onclick=()=>{ const n=idv('inp-tpl-nombre'); if(!n){ toast('Pon un nombre a la plantilla.','err'); return; }
  const q={}; $$('.partida').forEach(b=>q[b.dataset.id]=pQty(b.dataset.id));
  const ts=LS('pe-tpls')||[]; ts.push({n,q}); LS('pe-tpls',ts); renderTpls(); $('#inp-tpl-nombre').value='';
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
  Object.entries(EMISOR_DEF).forEach(([id,v])=>{ const el=document.getElementById(id); if(el) el.value=v; });
  try{ localStorage.removeItem('pe-profile'); }catch(e){}
  $('#perfil-hint').textContent='Valores de fábrica restaurados (perfil guardado eliminado).';
  calc(); save(); toast('Perfil restablecido a los valores de fábrica.','ok'); };
['logo','firma'].forEach(k=>{
  const fi=document.getElementById('file-'+k);
  if(fi) fi.addEventListener('change',e=>{ setAsset(k,e.target.files&&e.target.files[0]); e.target.value=''; });
  const del=document.getElementById('btn-del-'+k);
  if(del) del.onclick=()=>quitarAsset(k);
});
$('#btn-alb-add').onclick=()=>{
  const row=document.createElement('div'); row.className='partida alb-row';
  const id='alb-'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
  row.dataset.id=id;
  row.innerHTML=`<div class="p-head">
      <input type="text" class="cname" value="" data-albn="${id}" placeholder="Concepto de albañilería" aria-label="Concepto">
      <span class="p-sub" data-sub>—</span></div>
    <div class="p-row">
      <span class="qty-wrap"><label>Horas</label>
        <input type="number" min="0" step="0.5" value="0" data-albh="${id}" title="Horas estimadas"></span>
      <span class="qty-wrap free-wrap" title="Precio por hora de albañilería">
        <label>€/h</label>
        <input type="number" min="0" step="0.5" value="${num('f-alb-tarifa')||28}" data-albp="${id}" title="Precio por hora"></span>
      <button type="button" class="btn mini danger" data-albdel="${id}" title="Eliminar">×</button></div>`;
  $('#alb-rows').appendChild(row);
  row.querySelector('.cname').focus();
};

/* ---- PDF, importación y obras ---- */
$('#btn-pdf').onclick=askTipoPDF; $('#btn-pdf2').onclick=askTipoPDF; $('#btn-pdf-top').onclick=askTipoPDF;
$('#btn-preview').onclick=pdfPreview; $('#btn-preview-m').onclick=pdfPreview;
$('#btn-share').onclick=sharePDF; $('#btn-share-m').onclick=sharePDF;   /* #41 */
$('#btn-json-exp').onclick=jsonExport;
$('#file-json').addEventListener('change',e=>{ if(e.target.files&&e.target.files[0]) jsonImport(e.target.files[0]); e.target.value=''; });
$('#btn-imp-cancel').onclick=()=>$('#modal-import').classList.remove('show');
$('#btn-imp-ok').onclick=()=>{ $('#modal-import').classList.remove('show');
  if(window.__IMPORT_PENDING){ importAI(window.__IMPORT_PENDING); window.__IMPORT_PENDING=null;
    LOADING=false; Store.commit(); toast('Datos importados correctamente (esquema IA).','ok'); } };
$('#btn-dl-presu').onclick=()=>dlTipo('presupuesto');
$('#btn-dl-fact').onclick=()=>dlTipo('factura');
$('#btn-dl-cancel').onclick=()=>$('#modal-tipo').classList.remove('show');
$('#modal-tipo').addEventListener('click',e=>{ if(e.target.id==='modal-tipo') e.currentTarget.classList.remove('show'); });
$('#btn-modal-dl').onclick=()=>{ if(!LAST_URL) return;
  const a=document.createElement('a'); a.href=LAST_URL; a.download=fname(); document.body.appendChild(a); a.click(); a.remove();
  if(idv('f-doc-tipo')==='factura') commitFactura(); };
$('#btn-modal-x').onclick=()=>$('#modal').classList.remove('show');
$('#btn-work-save').onclick=()=>guardarObraActual(false);
$('#btn-works').onclick=()=>{ renderObras(); $('#modal-works').classList.add('show'); };
$('#btn-works-x').onclick=()=>$('#modal-works').classList.remove('show');
$('#modal-works').addEventListener('click',e=>{ if(e.target.id==='modal-works') e.currentTarget.classList.remove('show'); });
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
document.addEventListener('click',e=>{ if(!e.target.closest('.menu-wrap')){
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
  if(e.key==='Escape'){ ['#modal','#modal-tipo','#modal-works','#modal-import'].forEach(s=>$(s)?.classList.remove('show'));
    $('#menu-panel').hidden=true; $('#btn-menu').setAttribute('aria-expanded','false');
    $('#side').classList.remove('open'); $('#side-backdrop').classList.remove('show'); return; }
  /* foco atrapado en diálogos modales */
  const modalOpen=$('#modal.show')||$('#modal-tipo.show')||$('#modal-works.show')||$('#modal-import.show');
  if(modalOpen&&e.key==='Tab'){
    const f=focusablesIn(modalOpen); if(!f.length) return;
    const first=f[0], last=f[f.length-1];
    if(e.shiftKey&&document.activeElement===first){ e.preventDefault(); last.focus(); }
    else if(!e.shiftKey&&document.activeElement===last){ e.preventDefault(); first.focus(); }
    else if(!modalOpen.contains(document.activeElement)){ e.preventDefault(); first.focus(); }
    return;
  }
  const tag=(e.target.tagName||'').toUpperCase();
  const typing=tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT';
  if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){ e.preventDefault(); askTipoPDF(); return; }
  if((e.ctrlKey||e.metaKey)&&(e.key==='p'||e.key==='P')){ e.preventDefault(); pdfPreview(); return; }
  if((e.ctrlKey||e.metaKey)&&(e.key==='s'||e.key==='S')){ e.preventDefault(); jsonExport(); return; }
  if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&(e.key==='z'||e.key==='Z')&&!typing){ e.preventDefault(); doUndo(); return; }
  if((e.ctrlKey||e.metaKey)&&(e.key==='y'||e.key==='Y')&&!typing){ e.preventDefault(); doRedo(); return; }
  if((e.key==='ArrowUp'||e.key==='ArrowDown')&&e.target.matches&&e.target.matches('[data-qty],[data-free]')){
    e.preventDefault(); const d=e.key==='ArrowUp'?1:-1;
    e.target.value=Math.max(0,(parseFloat(e.target.value)||0)+d); calc(); save(); }
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
  let cur=null;
  $$('#secnav a').forEach(a=>{ const el=document.getElementById(a.dataset.sec);
    if(el&&el.getBoundingClientRect().top<=130) cur=a; });
  if(cur) setActiveSec(cur.dataset.sec);
});},{passive:true});
document.addEventListener('click',e=>{
  const a=e.target.closest('#secnav a,a[data-sec]'); if(!a) return;
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
  await idb.open();
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
  renderGrupos(); renderNivelesEditor();
  renderAlb(); renderLibres();
  renderClientes(); renderTpls();
  if(!idv('f-fecha')) $('#f-fecha').value=new Date().toISOString().slice(0,10);
  if(!idv('f-num')) $('#f-num').value=nextNum('PE');
  applyColor(ACC_COLOR);
  applyTheme(LS('pe-theme')||'auto');                             /* #16 */
  if(saved){ try{ Store.apply(typeof saved==='string'?JSON.parse(saved):saved); }
    catch(err){ console.warn('Estado guardado no recuperable:',err); } }
  const prof=LS('pe-profile');
  if(prof) Object.entries(prof).forEach(([id,v])=>{ const el=document.getElementById(id); if(el&&v!=null) el.value=v; });
  Object.entries(EMISOR_DEF).forEach(([id,v])=>{ if(!idv(id)){ const el=document.getElementById(id); if(el) el.value=v; } });
  LOADING=false;
  repriceChips(); calc(); save();
  a11yInit();                                                     /* #47 */
  if(!document.body.classList.contains('wizard')) setActiveSec('sec-datos');
  setTimeout(backupMensual,2500);                                 /* #10 */
  /* precios.json externo (#42): solo con http(s), fallo silencioso en file:// */
  if(/^https?:$/.test(location.protocol)){
    fetch('precios.json?v='+Date.now()).then(r=>r.json()).then(d=>{
      if(aplicarTarifasExternas(d)){
        renderNivelesEditor(); renderGrupos();
        repriceChips(); calc(); save();
        toast('Tarifas actualizadas desde precios.json (v'+d.version+').','ok');
      }
    }).catch(()=>{});
  }
  /* PWA (#49): registra el service worker si procede */
  if('serviceWorker' in navigator&&/^https?:$/.test(location.protocol)&&location.hostname!=='localhost'){
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  }
  Store.subscribe(()=>{ /* puntos de extensión futuros (navbar, obras…) */ });
}
init();
