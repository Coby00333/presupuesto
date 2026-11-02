// @ts-check
'use strict';
/* =====================================================================
   calc.js — Cálculo, render del formulario, estado y catálogos
   Depende de data.js y pure.js (cargados antes). No debe usarse document
   en la cabecera de módulo (se ejecuta con el DOM ya parseado, al final
   de <body>).
   ===================================================================== */

/* ================= utilidades DOM ================= */
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const num=id=>{const el=document.getElementById(id);return el?parseFloat(String(el.value).replace(',','.'))||0:0};
const idv=id=>{ const el=document.getElementById(id); return el?String(el.value||'').trim():''; };
const fdate=s=>{ if(!s) return new Date().toLocaleDateString('es-ES');
  const p=String(s).split('-'); return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:s; };
/** Escapado de datos del usuario antes de insertarlos en HTML (#3). */
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/** Debounce (#50) para eventos de tecleo. */
function debounce(fn,ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms||140); }; }
/** Ejecuta fn cuando el navegador está inactivo (save diferido #50). */
const idle=fn=>('requestIdleCallback' in window)
  ? requestIdleCallback(fn,{timeout:800}) : setTimeout(fn,120);

/* ---- toasts (sustituyen a alert, #24) ---- */
function toast(msg,type){
  const w=$('#toast-wrap'); if(!w) return;
  const d=document.createElement('div');
  d.className='toast'+(type?' '+type:''); d.textContent=msg; w.appendChild(d);
  setTimeout(()=>{ d.classList.add('out'); setTimeout(()=>d.remove(),320); },3600);
  while(w.children.length>4) w.firstChild.remove();
}

/* ---- Store único (#2): puerta de entrada al estado ----
   Reduce las fuentes duplicadas: todo cambio pasa por Store.commit() /
   Store.apply() y los suscriptores se enteran (navbar, obras, backup…). */
const Store={
  /** @type {Array<function(string|null):void>} */ subs:[],
  get(){ return getState(); },
  apply(st){ applyState(st); this._emit(); },
  commit(){ save(); this._emit(); },
  subscribe(fn){ if(typeof fn==='function') this.subs.push(fn); },
  _emit(){ this.subs.forEach(f=>{ try{ f(lastSnap); }catch(e){} }); }
};

/* ================= render ================= */
function renderGrupos(){
  GRUPOS.forEach(g=>{
    const host=$('#'+g.div); if(!host) return;
    if(g.div==='g-mec'){ renderMec(host); return; }
    host.innerHTML='';
    const sub=document.createElement('div'); sub.className='group-sub'; sub.textContent=g.titulo; host.appendChild(sub);
    g.partidas.forEach(p=>{
      const box=document.createElement('div'); box.className='partida'; box.dataset.id=p.id;
      const tip=p.tt?` <span class="tt" tabindex="0" data-tip="${esc(TT[p.tt])}">?</span>`:'';
      const unit=p.unit==='m'?'m':p.unit;
      /* partidas sin niveles: chip fijo con el precio de referencia (€/m) */
      const chips=basePrices(p).length?basePrices(p).map((pr,i)=>{
        const v=chipVal(pr,1);
        return `<label class="chip-opt${i===basePrices(p).length-1?' sel':''}" title="${nfC.format(v)} ${cur().sym}">
          <input type="radio" name="pr-${p.id}" value="${v}" data-idx="${i}" ${i===basePrices(p).length-1?'checked':''}>
          <span>${nfC.format(v)} ${cur().sym}</span></label>`;}).join('')
        :(p.refp!=null
          ?`<span class="chip-opt sel" data-refpr title="Precio de referencia ${nfC.format(p.refp)} ${cur().sym}/${unit} — el precio libre lo sustituye">${nfC.format(p.refp)} ${cur().sym}/${unit}</span>`
          :'');
      box.innerHTML=`
        <div class="p-head">
          <span class="p-name">${esc(p.name)}${tip} <small>(${unit})</small></span>
          <span class="p-sub" data-sub>—</span>
        </div>
        <div class="p-row">
          <span class="qty-wrap"><label>Cant.</label>
            <input type="number" min="0" step="${p.unit==='m'?0.5:1}" value="${p.qty||0}" id="q-${p.id}" data-qty="${p.id}"></span>
          <div class="chips">${chips}</div>
          <span class="qty-wrap free-wrap" title="Escribe tu propio precio${p.unit==='m'?' por metro':''}: si lo rellenas sustituye al nivel elegido">
            <label>Precio libre${p.unit==='m'?' €/m':''}</label>
            <input type="number" min="0" step="0.1" id="free-${p.id}" data-free="${p.id}" placeholder="—"></span>
        </div>`;
      host.appendChild(box);
    });
  });
}
function renderAlb(){
  const host=$('#alb-rows'); if(!host) return;
  host.innerHTML='';
  ALBROWS.forEach(a=>{
    const row=document.createElement('div'); row.className='partida alb-row'; row.dataset.id=a.id;
    row.innerHTML=`
      <div class="p-head">
        <input type="text" class="cname" value="${esc(a.name||'')}" data-albn="${esc(a.id)}" placeholder="Concepto de albañilería" aria-label="Concepto">
        <span class="p-sub" data-sub>—</span>
      </div>
      <div class="p-row">
        <span class="qty-wrap"><label>Horas</label>
          <input type="number" min="0" step="0.5" value="${a.h||0}" data-albh="${esc(a.id)}" title="Horas estimadas"></span>
        <span class="qty-wrap free-wrap" title="Precio por hora de albañilería">
          <label>€/h</label>
          <input type="number" min="0" step="0.5" value="${a.p!=null?a.p:28}" data-albp="${esc(a.id)}" title="Precio por hora"></span>
        <button type="button" class="btn mini danger" data-albdel="${esc(a.id)}" title="Eliminar">×</button>
      </div>`;
    host.appendChild(row);
  });
}
function renderLibres(){
  const host=$('#libres-wrap'); if(!host) return;
  host.innerHTML='';
  LIBRES.forEach((L,i)=>{
    const row=document.createElement('div'); row.className='partida lib-row';
    row.innerHTML=`
      <div class="p-head">
        <input type="text" class="cname" placeholder="Concepto" value="${esc(L.n||'')}" data-lib="n" data-i="${i}" aria-label="Concepto">
        <span class="p-sub" data-sub>—</span>
      </div>
      <div class="p-row">
        <span class="qty-wrap"><label>Precio ${cur().sym}</label>
          <input type="number" min="0" step="0.01" value="${L.p||0}" data-lib="p" data-i="${i}" aria-label="Precio"></span>
        <span class="qty-wrap"><label>Cant.</label>
          <input type="number" min="0" step="1" value="${L.q||0}" data-lib="q" data-i="${i}" aria-label="Cantidad"></span>
        <button type="button" class="btn mini danger" data-libdel="${i}" title="Eliminar">×</button>
      </div>`;
    host.appendChild(row);
  });
}
function renderClientes(){
  const cs=LS('pe-clients')||[], sel=$('#sel-clientes'); if(!sel) return;
  sel.innerHTML='<option value="">— elegir cliente guardado —</option>'+
    cs.map((c,i)=>`<option value="${i}">${esc(c.n)}</option>`).join('');
}
function renderTpls(){
  const ts=LS('pe-tpls')||[], host=$('#tpl-list'); if(!host) return;
  host.innerHTML=ts.length?'<table class="mini-table"><tr><th>Plantilla</th><th></th></tr>'+
    ts.map((t,i)=>`<tr><td>${esc(t.n)}</td><td style="text-align:right">
      <button type="button" class="btn mini primary" data-tpl-ap="${i}">Aplicar</button>
      <button type="button" class="btn mini danger" data-tpl-del="${i}">Borrar</button></td></tr>`).join('')+'</table>'
    :'<p class="hint">Sin plantillas guardadas todavía.</p>';
}

/* ================= mecanismos unificados: material por marca + mano de obra =================
   Las filas se muestran igual que las del apartado 3: los niveles de precio
   de cada partida ya incluyen la mano de obra + el material de la marca. */
function renderMec(host){
  const g=GRUPOS.find(x=>x.div==='g-mec'); if(!g) return;
  host.innerHTML='';
  const sub=document.createElement('div'); sub.className='group-sub'; sub.textContent=g.titulo;
  host.appendChild(sub);
  g.partidas.forEach(p=>{
    const box=document.createElement('div'); box.className='partida'; box.dataset.id=p.id;
    const tip=p.tt?` <span class="tt" tabindex="0" data-tip="${esc(TT[p.tt])}">?</span>`:'';
    const chips=basePrices(p).map((_,i)=>{
      return `<label class="chip-opt${i===basePrices(p).length-1?' sel':''}" title="Mano de obra + material">
        <input type="radio" name="pr-${p.id}" value="0" data-idx="${i}" ${i===basePrices(p).length-1?'checked':''}>
        <span>—</span></label>`;}).join('');
    box.innerHTML=`
      <div class="p-head">
        <span class="p-name">${esc(p.name)}${tip} <small>(${p.unit})</small></span>
        <span class="p-sub" data-sub>—</span>
      </div>
      <div class="p-row">
        <span class="qty-wrap"><label>Cant.</label>
          <input type="number" min="0" step="1" value="${p.qty||0}" id="q-${p.id}" data-qty="${p.id}"></span>
        <div class="chips">${chips}</div>
        <span class="qty-wrap free-wrap" title="Escribe tu propio precio por unidad (mano de obra + material): si lo rellenas sustituye al nivel elegido">
          <label>Precio libre</label>
          <input type="number" min="0" step="0.1" id="free-${p.id}" data-free="${p.id}" placeholder="—"></span>
      </div>
      <div class="p-mat" data-mathint></div>`;
    host.appendChild(box);
  });
  /* items de material sin partida asociada (TV, datos, marcos…): mismo módulo,
     una sola fila de precio (el material de la marca, sin mano de obra) */
  MAT_ITEMS.filter(it=>!MAT_MEC[it.id]).forEach(it=>{
    const box=document.createElement('div'); box.className='partida'; box.dataset.id=it.id;
    box.innerHTML=`
      <div class="p-head">
        <span class="p-name">${esc(it.name)} <small>(ud)</small></span>
        <span class="p-sub" data-sub>—</span>
      </div>
      <div class="p-row">
        <span class="qty-wrap"><label>Cant.</label>
          <input type="number" min="0" step="1" value="0" id="mq-${it.id}" data-qty="${it.id}"></span>
        <div class="chips"><span class="chip-opt sel" data-matpr title="Precio de material de la marca elegida (se actualiza al cambiar de marca)">—</span></div>
        <span class="qty-wrap free-wrap" title="Escribe tu propio precio: si lo rellenas sustituye al precio de la marca">
          <label>Precio libre</label>
          <input type="number" min="0" step="0.1" id="free-${it.id}" data-free="${it.id}" placeholder="—"></span>
      </div>`;
    host.appendChild(box);
  });
  updateMat();
}
function updateMat(){
  const sel=$('#f-marca'); if(!sel) return;
  const M=MARCAS[sel.value]||MARCAS.miluz;
  /* partidas de mecanismos: cada nivel = mano de obra + material de la marca */
  GRUPOS.forEach(g=>{
    if(g.div!=='g-mec') return;
    g.partidas.forEach(p=>{
      const row=document.querySelector(`.partida[data-id="${p.id}"]`); if(!row) return;
      const mid=MEC_MAT[p.id]; if(!mid) return;
      const pr=M.p[mid];
      const bp=basePrices(p);
      row.querySelectorAll('input[type=radio]').forEach((r,i)=>{
        const v=(pr!=null)?chipVal(bp[i]+pr,1):chipVal(bp[i],1);
        r.value=v;
        const lb=r.closest('.chip-opt'); lb.querySelector('span').textContent=nfC.format(v)+' '+cur().sym;
      });
      const hint=row.querySelector('[data-mathint]');
      if(hint) hint.textContent=(pr!=null)
        ?`Material ${MARCA_SHORT[sel.value]}: ${M.ref[mid]||'sin ref.'} · ${nfC.format(pr)} ${cur().sym}/ud incluido en los precios`
        :`Material ${MARCA_SHORT[sel.value]}: sin precio para esta marca (los niveles son solo mano de obra)`;
    });
  });
  /* filas de solo material (TV, datos, marcos…): precio único de la marca */
  MAT_ITEMS.forEach(it=>{
    if(MAT_MEC[it.id]) return;
    const row=document.querySelector(`.partida[data-id="${it.id}"]`); if(!row) return;
    const chip=row.querySelector('[data-matpr]'); if(!chip) return;
    const pr=M.p[it.id];
    chip.textContent=pr==null?'N/D':nfC.format(pr)+' '+cur().sym;
  });
}
/* ---- comparar marcas (#30) ---- */
function compararMarcas(){
  const box=$('#cmp-box'); if(!box) return;
  const qs={}; let totQ=0;
  MAT_ITEMS.forEach(it=>{ const q=matQty(it.id); qs[it.id]=q; totQ+=q; });
  if(!totQ){ box.hidden=false; box.innerHTML='<p class="hint" style="margin:0">Escribe primero cantidades en las filas para comparar marcas.</p>'; return; }
  const res=MARCA_KEYS.map(k=>{
    let t=0, faltan=0;
    MAT_ITEMS.forEach(it=>{ const pr=MARCAS[k].p[it.id];
      if(qs[it.id]>0){ if(pr==null) faltan++; else t+=pr*qs[it.id]; } });
    return {k,t,faltan};
  });
  const milu=res.find(r=>r.k==='miluz').t||0;
  const min=Math.min(...res.map(r=>r.t||Infinity));
  box.hidden=false;
  box.innerHTML='<b style="font-size:.85rem">Comparativa con tus cantidades</b>'+
    '<table class="mini-table"><thead><tr><th>Marca</th><th style="text-align:right">Total material</th>'+
    '<th style="text-align:right">vs Miluz</th><th style="text-align:right"></th></tr></thead><tbody>'+
    res.map(r=>{
      const dif=milu>0? (r.t-milu)/milu*100 : 0;
      const pct=dif===0?'—':(dif>0?'+':'−')+nfC.format(Math.abs(dif))+'%';
      return `<tr${r.t===min?' class="cmp-best"':''}><td>${esc(MARCAS[r.k].label)}${r.faltan?` <small style="color:var(--warn)">(${r.faltan} sin precio)</small>`:''}</td>`+
        `<td style="text-align:right;font-weight:700;color:${r.t===min?'var(--ok)':'inherit'}">${money(r.t)}${r.t===min?' ★':''}</td>`+
        `<td style="text-align:right">${pct}</td>`+
        `<td style="text-align:right"><button type="button" class="btn mini" data-cmpuse="${r.k}">Usar</button></td></tr>`;
    }).join('')+'</tbody></table>'+
    '<p class="hint" style="margin:6px 0 0">★ la más económica con estas cantidades. «Usar» cambia la marca de las filas de material.</p>';
}

/* ================= niveles de precio por partida (#25) ================= */
function renderNivelesEditor(){
  const wrap=$('#niveles-editor-wrap'); if(!wrap) return;
  const parts=GRUPOS.flatMap(g=>g.partidas).filter(p=>basePrices(p).length);  /* sin partidas de precio libre */
  const niv=Math.max(...parts.map(p=>basePrices(p).length));
  const rows=parts.map(p=>{
    const pr=basePrices(p);
    const cells=pr.map((v,i)=>
      `<td style="text-align:right"><input type="number" min="0" step="0.01" data-niv="${p.id}" data-idx="${i}" value="${v}"></td>`).join('');
    return '<tr><td>'+esc(p.name)+'</td>'+cells+'<td style="text-align:right;color:var(--tx2)">—</td>'.repeat(niv-pr.length)+'</tr>';
  }).join('');
  wrap.innerHTML='<table class="mini-table"><thead><tr><th>Partida</th>'+
    Array.from({length:niv},(_,i)=>`<th style="text-align:right">Nivel ${i+1}</th>`).join('')+
    '</tr></thead><tbody>'+rows+'</tbody></table>';
}
function saveNiveles(){
  NIV_OVR={};
  $$('#niveles-editor input[data-niv]').forEach(inp=>{
    const id=inp.dataset.niv, i=parseInt(inp.dataset.idx,10);
    const v=parseFloat(String(inp.value).replace(',','.'));
    if(!isFinite(v)) return;
    const base=GRUPOS.flatMap(g=>g.partidas).find(p=>p.id===id);
    if(!base) return;
    (NIV_OVR[id]=NIV_OVR[id]||basePrices(base).slice())[i]=v;
  });
  /* solo guarda las partidas con algún cambio respecto de fábrica */
  GRUPOS.flatMap(g=>g.partidas).forEach(p=>{
    const ovr=NIV_OVR[p.id], fac=p.prices;
    if(ovr&&ovr.every((v,i)=>Math.abs(v-fac[i])<0.005)) delete NIV_OVR[p.id];
  });
  LS('pe-niveles',NIV_OVR);
  renderGrupos(); repriceChips(); Store.commit();
  const n=Object.keys(NIV_OVR).length;
  toast(n?`Niveles guardados (${n} partida(s) personalizadas).`:'Niveles de fábrica restaurados.','ok');
}
function resetNiveles(){
  NIV_OVR={}; LS('pe-niveles',{});
  renderNivelesEditor(); renderGrupos(); repriceChips(); Store.commit();
  toast('Niveles de precio restaurados a fábrica.','ok');
}

/* ================= REBT avanzado: caída de tensión (#26) ================= */
function renderRebtAvanzado(){
  const box=$('#rebt-avanzado-res'); if(!box) return;
  const ench=pQty('enchufes'), luz=pQty('pluz');
  const sug=rebtSug(ench,luz);
  if(!sug.pias){ box.hidden=true; box.innerHTML=''; return; }
  const L=num('rebt-l')||18, lim=parseFloat($('#rebt-lim').value)||5;
  const circ=[];
  for(let i=0;i<sug.tomas;i++) circ.push(['C tomas '+(i+1),3450,5,2.5]);
  for(let i=0;i<sug.lucz;i++) circ.push(['C iluminación '+(i+1),1100,3,1.5]);
  circ.push(['C cocina + horno',5750,5,6]);
  circ.push(['C lavadora/lavavaj.',3450,5,2.5]);
  circ.push(['C baño',3450,5,2.5]);
  circ.push(['C climatización',3450,5,2.5]);
  const rows=circ.map(([n,pW,pmin,smin])=>{
    const r=seccionCaida(pW,L,pmin);
    const rec=Math.max(r.seccion,smin);
    return `<tr><td>${n}</td><td style="text-align:right">${pW}</td>
      <td style="text-align:right">${nfC.format(r.I)}</td>
      <td style="text-align:right">${nfC.format(smin)}</td>
      <td style="text-align:right">${nfC.format(rec)} mm²</td></tr>`;
  }).join('');
  box.hidden=false;
  box.innerHTML='<p class="hint" style="margin:4px 0 0">Orientativo según ITC-BT-19/28/37 (cobre, 230 V, L='+nfC.format(L)+' m, cos φ 0,9, tubo empotrado). La sección recomendada es la mayor entre la mínima del REBT y la de caída de tensión (3% iluminación · 5% resto).</p>'+
    '<table class="mini-table"><thead><tr><th>Circuito</th><th style="text-align:right">Potencia W</th>'+
    '<th style="text-align:right">I (A)</th><th style="text-align:right">S mín REBT</th><th style="text-align:right">S recomendada</th></tr></thead>'+
    '<tbody>'+rows+'</tbody></table>';
}

/* ================= precios dinámicos ================= */
function repriceChips(){
  GRUPOS.forEach(g=>{
    g.partidas.forEach(p=>{
      const box=document.querySelector(`.partida[data-id="${p.id}"]`); if(!box) return;
      const pr=basePrices(p);
      const idx=parseInt((box.querySelector('input:checked')||{}).dataset?.idx ?? pr.length-1,10);
      box.querySelectorAll('input[type=radio]').forEach((r,i)=>{
        const v=chipVal(pr[i],1); r.value=v;
        const lb=r.closest('.chip-opt'); lb.querySelector('span').textContent=nfC.format(v)+' '+cur().sym;
      });
      const sel=box.querySelectorAll('input[type=radio]')[Math.min(idx,pr.length-1)];
      if(sel){ sel.checked=true; sel.closest('.chip-opt').classList.add('sel'); }
    });
  });
  /* los niveles de mecanismos vuelven a incluir el material de la marca */
  if($('#f-marca')) updateMat();
}

/* ================= cálculo ================= */
function pQty(id){ const el=document.querySelector(`.partida[data-id="${id}"] [data-qty]`); return el?(parseFloat(el.value)||0):0; }
/* precio efectivo de una partida: precio libre > nivel (radio) > precio de referencia (€/m) */
function pPr(id){ const box=document.querySelector(`.partida[data-id="${id}"]`);
  const rp=(PART_BY_ID[id]&&PART_BY_ID[id].refp)||0;
  if(!box) return rp;
  const f=box.querySelector('[data-free]'); const fv=f?(parseFloat(f.value)||0):0; if(fv>0) return fv;
  const el=box.querySelector('input:checked'); return el?(parseFloat(el.value)||0):rp; }
/* precio de material de un ítem del catálogo según la marca elegida (null = N/D) */
function matPr(itId){ const sel=$('#f-marca'); const M=sel?(MARCAS[sel.value]||MARCAS.miluz):MARCAS.miluz; return M.p[itId]; }
/* cantidad de un ítem: la de su partida asociada o la de su propia fila */
function matQty(itId){ return pQty(MAT_MEC[itId]||itId); }
function calc(){
  updateMat();
  let sumA=0, sumA0=0, matA=0, moA=0, partidas=0, totalPartidas=0, ench=0;
  const coef=num('f-coef')||1;                      /* coef único (#28) */
  GRUPOS.forEach(g=>{
    g.partidas.forEach(p=>{
      totalPartidas++;
      const box=document.querySelector(`.partida[data-id="${p.id}"]`);
      const mid=(g.div==='g-mec'&&MEC_MAT[p.id])||null;   /* partida con material asociado */
      const mp=mid?matPr(mid):null;
      let qty=0, pr=0, imp=0;
      if(box){
        qty=parseFloat(box.querySelector('[data-qty]').value)||0;
        pr=pPr(p.id);        /* en mecanismos ya incluye la mano de obra + el material */
        imp=qty*pr;
        box.querySelector('[data-sub]').textContent=(qty>0&&pr>0)?`${nfC.format(qty)} × ${nfC.format(pr)} = ${money(imp)}`:'—';
      }
      const impC=imp*coef;
      sumA0+=imp; sumA+=impC;
      /* reparto material/mano de obra: el material de la marca cuenta como material */
      const mpQ=(mp!=null&&mp>0)?qty*mp:0;
      if(mpQ>0){ matA+=mpQ*coef; moA+=impC-mpQ*coef; }
      else if(p.cls==='mo') moA+=impC; else matA+=impC;
      if(p.id==='enchufes') ench=qty;
      if(qty>0) partidas++;
      if(box) box.classList.toggle('has-qty',qty>0);
    });
  });
  /* material sin partida asociada (TV, datos, marcos…): suma directa al presupuesto */
  MAT_ITEMS.forEach(it=>{
    if(MAT_MEC[it.id]) return;
    const box=document.querySelector(`.partida[data-id="${it.id}"]`);
    const q=matQty(it.id);
    const fv=box?(parseFloat(box.querySelector('[data-free]').value)||0):0;
    const mp=fv>0?fv:matPr(it.id);
    const imp=(q>0&&mp!=null&&mp>0)?q*mp:0;
    if(box){
      box.querySelector('[data-sub]').textContent=imp>0?`${nfC.format(q)} × ${nfC.format(mp)} = ${money(imp)}`:'—';
      box.classList.toggle('has-qty',imp>0);
    }
    if(imp>0){ sumA0+=imp; sumA+=imp; matA+=imp; }
  });
  let libSum=0;
  $$('#libres-wrap .lib-row').forEach(r=>{
    const p=parseFloat(r.querySelector('[data-lib="p"]').value)||0;
    const q=parseFloat(r.querySelector('[data-lib="q"]').value)||0;
    const imp=p*q; libSum+=imp;
    r.querySelector('[data-sub]').textContent=q>0?money(imp):'—';
  });
  sumA0+=libSum; sumA+=libSum;
  /* margen sobre materiales (#29) */
  const margenPct=Math.min(200,Math.max(0,num('f-margen')));
  const margenAmt=matA*margenPct/100;
  sumA+=margenAmt;
  matA+=margenAmt;
  const coefAlb=coef;
  let sumB=0, horas=0;
  $$('#alb-rows .alb-row').forEach(r=>{
    const h=parseFloat(r.querySelector('[data-albh]').value)||0;
    const pr=parseFloat(r.querySelector('[data-albp]').value)||0;
    const imp=h*pr; horas+=h; sumB+=imp;
    r.querySelector('[data-sub]').textContent=money(imp);
    r.classList.toggle('off',h<=0);
  });
  sumB+=num('f-alb-mat')+num('f-alb-maq')+num('f-alb-e1')+num('f-alb-e2');
  const fh=$('#f-alb-horas'); if(fh) fh.value=nfC.format(horas);
  const sumAc=sumA, sumBc=sumB*coefAlb;
  const base=sumAc+sumBc;
  const dv=num('f-desc-val'), dt=$('#f-desc-tipo').value;
  const dvolP=(ench>60)?Math.min(30,Math.max(0,num('f-desc-vol'))):0;
  const dvol=base*dvolP/100;
  const descCom=dt==='%'? base*dv/100 : Math.min(dv,base);
  const desc=descCom+dvol;
  const baseDes=base-desc;
  const ivaP=parseFloat(document.querySelector('input[name=iva]:checked').value)||0;
  const iva=baseDes*ivaP/100;
  const rnd=$('#f-redondeo').value;
  const total=redondeoTotal(baseDes+iva,rnd);
  const rndAmt=total-(baseDes+iva);
  const moT=base-matA;
  /* coste estimado con precios Miluz cuando se usa otra marca (#29) */
  let costeM=0, ventaM=0;
  const marca=$('#f-marca')?$('#f-marca').value:'miluz';
  if(marca!=='miluz'){
    MAT_ITEMS.forEach(it=>{
      const q=matQty(it.id);
      const pm=MARCAS.miluz.p[it.id], pv=MARCAS[marca].p[it.id];
      if(q>0&&pm!=null){ costeM+=pm*q; }
      if(q>0&&pv!=null){ ventaM+=pv*q; }
    });
  }
  const T=(id,v)=>{const el=document.getElementById(id); if(el) el.textContent=v;};
  T('r-A',money(sumAc)); T('r-B',money(sumBc)); $('#r-rowB').style.display=sumBc>0?'':'none';
  const showParts=base>0;
  $('#r-rowMat').style.display=showParts?'':'none';
  $('#r-rowMo').style.display=showParts?'':'none';
  if(showParts){ T('r-mat',money(matA)); T('r-mo',money(moT)); }
  if(coef>1){ T('r-coef','×'+nfC.format(coef)+' = +'+money(base-(sumA0+sumB))); $('#r-rowCoef').style.display=''; }
  else $('#r-rowCoef').style.display='none';
  if(margenAmt>0){ T('r-margen',`+ ${money(margenAmt)} (${nfC.format(margenPct)}% s/material)`); $('#r-rowMargen').style.display=''; }
  else $('#r-rowMargen').style.display='none';
  if(costeM>0&&ventaM>0){
    const mg=ventaM-costeM;
    T('r-coste',money(costeM)+' → venta '+money(ventaM));
    T('r-margenc','+ '+money(mg)+' ('+nfC.format(costeM>0?mg/costeM*100:0)+'%)');
    $('#r-rowCoste').style.display=''; $('#r-rowMargenC').style.display='';
  } else { $('#r-rowCoste').style.display='none'; $('#r-rowMargenC').style.display='none'; }
  T('r-base',money(base));
  if(descCom>0){ T('r-desc','− '+money(descCom)); $('#r-rowDesc').style.display=''; }
  else $('#r-rowDesc').style.display='none';
  if(dvol>0){ T('r-dvol',`− ${money(dvol)} (${nfC.format(dvolP)}%)`); $('#r-rowDvol').style.display=''; }
  else $('#r-rowDvol').style.display='none';
  const estDv=$('#f-desc-vol-estado');
  if(estDv) estDv.value=ench>60?`Activo: ${nfC.format(dvolP)}% con ${ench} enchufes`:`Inactivo (≤60 enchufes · ahora ${ench})`;
  T('r-iva-label',ivaP?`IVA (${nfC.format(ivaP)}%)`:'IVA (no incluido)');
  T('r-iva',ivaP?money(iva):'—');
  if(rndAmt!==0){ T('r-rnd',(rndAmt>0?'+ ':'− ')+money(Math.abs(rndAmt))); $('#r-rowRnd').style.display=''; }
  else $('#r-rowRnd').style.display='none';
  T('r-total',money(total));
  T('r-letra',totalLetra(total));
  T('s-base',money(base)); T('s-IVA',ivaP?money(iva):'—'); T('s-T',money(total));
  T('sv-base',money(base));
  T('sv-IVA',ivaP?money(iva):'—'); T('sv-T',money(total));
  const pct=base>0? matA/base*100:50;
  const donut=$('#donut');
  if(donut) donut.style.background=`conic-gradient(var(--acc) 0 ${pct}%, var(--warn) ${pct}% 100%)`;
  T('d-mat',money(matA)); T('d-mo',money(moT));
  $('#bar').style.width=Math.round(partidas/totalPartidas*100)+'%';
  $('#progress-text').textContent=`${partidas} de ${totalPartidas} partidas`;
  document.title=`${idv('f-num')||'PE'}${idv('f-ver')?' '+idv('f-ver'):''} — ${idv('f-cli-nombre')||'Presupuesto eléctrico'}`;
  return {sumA:sumAc,sumB:sumBc,sumA0,sumB0:sumB,base,desc,descCom,dvol,dvolP,baseDes,ivaP,iva,rnd,rndAmt,total,coef,matT:matA,moT,horas,libSum,ench,margenPct,margenAmt,costeM,ventaM};
}

/* ================= estado / deshacer / persistencia ================= */
const KEY='presu-electrico-pro-v3';
let UNDO=[], REDO=[], lastSnap=null, LOADING=true, DIRTY=false;
function getState(){
  const st={v:5, vals:{}, chips:{},
    libres:$$('#libres-wrap .lib-row').map(r=>({n:r.querySelector('[data-lib="n"]').value, p:parseFloat(r.querySelector('[data-lib="p"]').value)||0, q:parseFloat(r.querySelector('[data-lib="q"]').value)||0})),
    albs:$$('#alb-rows .alb-row').map(r=>({id:r.dataset.id, n:r.querySelector('.cname').value, h:parseFloat(r.querySelector('[data-albh]').value)||0, p:parseFloat(r.querySelector('[data-albp]').value)||0})),
    wizard:document.body.classList.contains('wizard') };
  $$('#presu input[id],#presu select[id],#presu textarea[id]').forEach(el=>{
    if(el.type==='file'||el.readOnly) return; st.vals[el.id]=el.value; });
  GRUPOS.forEach(g=>g.partidas.forEach(p=>{
    const b=document.querySelector(`.partida[data-id="${p.id}"] input:checked`);
    st.chips[p.id]=b?parseInt(b.dataset.idx,10):basePrices(p).length-1; }));
  return st;
}
/** Migraciones de esquema (#7): los estados antiguos no se pierden. */
function migrate(st){
  if(!st) return st;
  if(st.v==null) st.v=2;
  if(st.v<3){
    /* v2→v3: las partidas de tubo pasaron de importe directo a €/m (#32);
       el importe guardado se conserva como partida libre. */
    ['tubo23','tubo26'].forEach(id=>{
      const v=parseFloat((st.vals||{})['dir-'+id]);
      if(v>0){
        st.libres=(st.libres||[]).concat([{n:'Tubo corrugado Ø '+(id==='tubo23'?'16–20':'25–40')+' mm (importe versión anterior)',p:v,q:1}]);
        delete st.vals['dir-'+id];
      }
    });
    st.v=3;
  }
  if(st.v<4){
    /* v3→v4: los importes directos (cables, regletas) pasan a filas por unidades
       como el resto: Cant. 1 + Precio libre = importe guardado */
    Object.keys(st.vals||{}).forEach(k=>{
      if(!k.startsWith('dir-')) return;
      const v=parseFloat(st.vals[k]);
      if(v>0){ st.vals['q-'+k.slice(4)]=1; st.vals['free-'+k.slice(4)]=v; }
      delete st.vals[k];
    });
    st.v=4;
  }
  if(st.v<5){
    /* v4→v5: tubos pasan de rollos a METROS (×100 el Ø16–20, ×50 el Ø25–40) y
       su precio libre de €/rollo a €/m; los cables (importe directo Cant.1 +
       Precio libre) no se pueden convertir a metros: el importe se conserva
       como partida libre para no perderlo */
    const M={tubo23:100,tubo26:50};
    Object.entries(M).forEach(([id,f])=>{
      const q=parseFloat((st.vals||{})['q-'+id])||0;
      const fr=parseFloat((st.vals||{})['free-'+id])||0;
      if(q>0) st.vals['q-'+id]=q*f;
      if(fr>0) st.vals['free-'+id]=Math.round(fr/f*100)/100;
    });
    ['cab15','cab25','cab46'].forEach(id=>{
      const q=parseFloat((st.vals||{})['q-'+id])||0;
      const fr=parseFloat((st.vals||{})['free-'+id])||0;
      if(fr>0){
        const P=PART_BY_ID[id];
        st.libres=(st.libres||[]).concat([{n:(P?P.name:id)+' (importe versión anterior)',p:fr,q:q>0?q:1}]);
        st.vals['q-'+id]=0; st.vals['free-'+id]='';
      }
    });
    st.v=5;
  }
  return st;
}
function applyState(st){
  if(!st) return;
  st=migrate(st);
  document.body.classList.toggle('wizard',!!st.wizard);
  const bw=$('#btn-wizard'); if(bw) bw.textContent=st.wizard?'Vista completa (todas las secciones)':'Modo asistente por pasos';
  if(st.wizard) showStep(0);
  Object.entries(st.vals||{}).forEach(([id,v])=>{
    const el=document.getElementById(id);
    if(el&&el.type!=='file'&&!el.readOnly) el.value=v; });
  renderLibres(); $$('#libres-wrap .lib-row').forEach((r,i)=>{
    const L=(st.libres||[])[i]; if(!L) return;
    r.querySelector('[data-lib="n"]').value=L.n||''; r.querySelector('[data-lib="p"]').value=L.p||0; r.querySelector('[data-lib="q"]').value=L.q||0; });
  if(Array.isArray(st.albs)&&st.albs.length){
    ALBROWS=st.albs.map(a=>({id:a.id||('alb-'+Math.random().toString(36).slice(2,9)), name:a.n||'', h:a.h||0, p:a.p!=null?a.p:28}));
    renderAlb();
  }
  repriceChips();
  Object.entries(st.chips||{}).forEach(([id,idx])=>{
    const box=document.querySelector(`.partida[data-id="${id}"]`); if(!box) return;
    const r=box.querySelectorAll('input[type=radio]')[idx]; if(!r) return;
    r.checked=true; box.querySelectorAll('.chip-opt').forEach(c=>c.classList.remove('sel'));
    r.closest('.chip-opt').classList.add('sel'); });
  calc();
}
function save(){
  const s=JSON.stringify(getState());
  if(lastSnap!==null&&s!==lastSnap&&!LOADING){ UNDO.push(lastSnap); if(UNDO.length>60)UNDO.shift(); REDO=[]; DIRTY=true; }
  lastSnap=s;
  let quotaErr=false;
  try{ localStorage.setItem(KEY,s); }
  catch(e){ quotaErr=true; }
  if(quotaErr) toast('No se pudo guardar en localStorage (¿lleno?). Exporta un respaldo JSON.','err');
  if(window.__peIDB&&window.__peIDB.putState) window.__peIDB.putState(s);   /* espejo IndexedDB (#11) */
  const t=new Date(); const si=$('#saved-ind'); if(si) si.textContent='Guardado '+t.toLocaleTimeString('es-ES');
}
function doUndo(){ if(!UNDO.length||LOADING) return; REDO.push(lastSnap); lastSnap=UNDO.pop();
  try{ localStorage.setItem(KEY,lastSnap); }catch(e){}
  if(window.__peIDB&&window.__peIDB.putState) window.__peIDB.putState(lastSnap);
  applyState(JSON.parse(lastSnap)); DIRTY=false; Store._emit(); }
function doRedo(){ if(!REDO.length||LOADING) return; UNDO.push(lastSnap); lastSnap=REDO.pop();
  try{ localStorage.setItem(KEY,lastSnap); }catch(e){}
  if(window.__peIDB&&window.__peIDB.putState) window.__peIDB.putState(lastSnap);
  applyState(JSON.parse(lastSnap)); DIRTY=false; Store._emit(); }

/* ================= catálogos ================= */
/** Numeración independiente por tipo y año (#14): PE-2026-001 / FA-2026-001. */
function nextNum(tipo){
  tipo=tipo==='FA'?'FA':'PE';
  const y=new Date().getFullYear();
  const cs=LS('pe-counters')||{};
  if(tipo==='PE'&&cs.PE==null){ const legacy=LS('pe-counter'); if(legacy) cs.PE={[y]:legacy}; }
  cs[tipo]=cs[tipo]||{};
  cs[tipo][y]=(cs[tipo][y]||0)+1;
  LS('pe-counters',cs);
  return `${tipo}-${y}-${String(cs[tipo][y]).padStart(3,'0')}`;
}
function setSelByText(id,val){ const s=document.getElementById(id); if(!s||val==null||val==='') return;
  const o=[...s.options].find(o=>o.textContent.toLowerCase().includes(String(val).toLowerCase())||o.value===String(val));
  if(o) s.value=o.value; }
