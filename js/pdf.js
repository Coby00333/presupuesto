// @ts-check
'use strict';
/* =====================================================================
   pdf.js — Generación de documentos (jsPDF) y exportación/importación
   · buildPDF()            presupuesto (Gantt #39, logo/firma #34)
   · buildFacturaPDF()     factura (Veri*factu #37: serie, QR y hash
                           encadenado), logo/firma
   Depende de data.js, pure.js y calc.js.
   ===================================================================== */

/* ---- carga de librerías bajo demanda: local (vendor/) primero ----
   El fallback CDN lleva hash SRI (sha512) verificado contra la API de cdnjs
   y contra la copia local de vendor/: si el CDN estuviera comprometido y el
   archivo no coincide byte a byte, el navegador se niega a ejecutarlo (#7
   mejoras2) y la app cae al PDF de respaldo HTML. */
const VENDOR={
  jspdf:['vendor/jspdf.umd.min.js',{src:'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    sri:'sha512-qZvrmS2ekKPF2mSznTQsxqPgnpkI4DNTlrdUmTzrDgektczlKNRRhy5X5AAOnx5S09ydFYWWNSfcEqDTTHgtNA=='}],
  autotable:['vendor/jspdf.plugin.autotable.min.js',{src:'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
    sri:'sha512-2/YdOMV+YNpanLCF5MdQwaoFRVbTmrJ4u4EpqS/USXAQNUDgI5uwYi6J98WVtJKcfe1AbgerygzDFToxAlOGEQ=='}],
  qrcode:['vendor/qrcode.min.js',{src:'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js',
    sri:'sha512-ZDSPMa/JM1D+7kdg2x3BsruQ6T/JpJo3jJDWkCZsP+5yVyp1KfESqLI+7RqB5k24F7p2cV7i2YHh/890y6P6Sw=='}]
};
function loadScript(src,timeout,sri){ return new Promise((res,rej)=>{
  const s=document.createElement('script'); s.src=src;
  if(sri){ s.integrity=sri; s.crossOrigin='anonymous'; }
  const t=setTimeout(()=>{s.remove();rej(new Error('timeout'));},timeout||10000);
  s.onload=()=>{clearTimeout(t);res();};
  s.onerror=()=>{clearTimeout(t);s.remove();rej(new Error('net'));};
  document.head.appendChild(s);
});}
async function loadFirst(urls,timeout){
  for(const u of urls){
    const src=typeof u==='string'?u:u.src;
    try{ await loadScript(src,timeout,typeof u==='object'?u.sri:null); return; }catch(e){}
  }
  throw new Error('no source');
}
async function ensurePdf(){
  if(!(window.jspdf&&window.jspdf.jsPDF))
    await loadFirst(VENDOR.jspdf);
  if(window.jspdf&&window.jspdf.jsPDF&&!window.jspdf.jsPDF.API.autoTable)
    await loadFirst(VENDOR.autotable);
}
async function ensureQR(){
  if(!window.qrcode){ try{ await loadFirst(VENDOR.qrcode,6000); }catch(e){} }
}

/* ---- utilidades de documento ---- */
let PDF_FONT='helvetica', ACC_COLOR='#2f6ae0';
/* paleta del documento (tinta, secundario, filetes, fondos, zebra, descuentos) */
const INK=[26,32,44], TX2=[108,117,129], LINE=[224,229,236], SOFT=[246,248,251],
  COLHD=[237,242,249], HDTX=[72,82,98], ZEBRA=[250,252,254], RED=[190,60,60];
const hexRGB=hex=>{ hex=(hex&&/^#[0-9a-fA-F]{6}$/.test(hex))?hex:'#2f6ae0';
  return [parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)]; };
function fname(ext){ const n=idv('f-num').replace(/[^\w-]+/g,'_')||'documento';
  const v=idv('f-ver').replace(/[^\w]/g,'');
  const tipo=window.__PDF_INTERNO?'Interno':(idv('f-doc-tipo')==='factura'?'Factura':'Presupuesto');
  return `${tipo}_${n}${v?'_'+v:''}.${ext||'pdf'}`; }
function busy(on){ const b=$('#loading-pdf'); if(b) b.classList.toggle('show',!!on); }
/** Añade una imagen dataURL (PNG/JPEG) ajustando su altura. */
function addImgFit(doc,dataUrl,x,y,h,ar){
  if(!dataUrl||!ar) return 0;
  const fmt=dataUrl.startsWith('data:image/png')?'PNG':'JPEG';
  const w=h*ar;
  try{ doc.addImage(dataUrl,fmt,x,y,w,h); }catch(e){ return 0; }
  return w;
}
function qrPaint(doc,text,x,y,size){
  if(!window.qrcode) return false;
  try{
    const qr=window.qrcode(0,'M'); qr.addData(text); qr.make();
    const n=qr.getModuleCount(), cell=size/n;
    doc.setFillColor(25,30,45);
    for(let rr=0;rr<n;rr++)for(let cc=0;cc<n;cc++)
      if(qr.isDark(rr,cc)) doc.rect(x+cc*cell,y+rr*cell,cell,cell,'F');
    return true;
  }catch(e){ return false; }
}

/* ---- filas de datos para documentos ---- */
/* líneas libres de un grupo (#10 mejoras): cuentan como material de la sección.
   #8 mejoras2 (fase 1): se leen de LIBRES (memoria), no del DOM */
function libresDe(div){
  const rows=[]; let sum=0;
  LIBRES.forEach(L=>{
    if((L.g||null)!==div) return;
    const n=L.n||'Partida adicional', p=L.p||0, q=L.q||0;
    if(q<=0&&p<=0) return;
    const imp=p*q; sum+=imp;
    rows.push([n,'ud',nfC.format(q),nfC.format(p),nf.format(imp)+' '+cur().sym]);
  });
  return {rows,sum};
}
function rowsA(){
  const secs=[];
  const marca=$('#f-marca')?$('#f-marca').value:'miluz';
  GRUPOS.forEach(g=>{
    const isMec=g.div==='g-mec';
    const gm=[], go=[]; let sm=0, so=0;
    g.partidas.forEach(p=>{
      const q=qEffOf(p.id); if(q<=0) return;   /* ×3 L+T+N ya aplicado (#2 mejoras) */
      /* en mecanismos el precio ya incluye mano de obra + material de la marca */
      const pu=pPr(p.id);
      const imp=q*pu;
      if(imp<=0) return;   /* partida de precio libre sin precio: no va al documento */
      const row=[p.name,p.unit,nfC.format(q),nfC.format(pu),nf.format(imp)+' '+cur().sym];
      if(p.cls==='mo'){ go.push(row); so+=imp; } else { gm.push(row); sm+=imp; }
    });
    if(isMec){
      /* material sin partida asociada (TV, datos, marcos…): filas de solo material */
      MAT_ITEMS.forEach(it=>{
        if(MAT_MEC[it.id]) return;
        const q=matQty(it.id); if(q<=0) return;
        const pr=matPr(it.id); if(pr==null||pr<=0) return;
        const imp=q*pr;
        gm.push([it.name,'ud',nfC.format(q),nfC.format(pr),nf.format(imp)+' '+cur().sym]); sm+=imp;
      });
      /* sección única del grupo: material de marca + mano de obra en el precio/ud */
      const Lg=libresDe(g.div); gm.push(...Lg.rows); sm+=Lg.sum;   /* libres del grupo (#10) */
      const rows=gm.concat(go);
      if(rows.length) secs.push({titulo:g.titulo,parte:'mec',rows,sum:sm+so,
        head:'MECANISMOS Y PUNTOS — material '+MARCA_SHORT[marca]+' + mano de obra (precio/ud con material y MO)'});
      return;
    }
    const Lg2=libresDe(g.div); gm.push(...Lg2.rows); sm+=Lg2.sum;  /* libres del grupo (#10) */
    if(gm.length) secs.push({titulo:g.titulo,parte:'mat',rows:gm,sum:sm});
    if(go.length) secs.push({titulo:g.titulo,parte:'mo',rows:go,sum:so});
  });
  const lib=[]; let sl=0;
  LIBRES.forEach(L=>{   /* globales: sin grupo o con grupo que ya no existe en el DOM */
    if(L.g&&document.querySelector(`.g-libres[data-glib="${L.g}"]`)) return;
    const n=L.n||'Partida adicional', p=L.p||0, q=L.q||0;
    if(q<=0&&p<=0) return;
    sl+=p*q;
    lib.push([n,'ud',nfC.format(q),nfC.format(p),nf.format(p*q)+' '+cur().sym]);
  });
  if(lib.length) secs.push({titulo:'Partidas adicionales de esta obra',parte:'mo',rows:lib,sum:sl});
  return secs;
}
function rowsB(){
  const rows=ALBROWS.map(a=>{   /* #8 mejoras2 (fase 1): memoria, no DOM */
    const h=a.h||0, p=a.p!=null?a.p:28, nm=a.name||'Partida';
    return [nm,'h',nfC.format(h),nfC.format(p),nf.format(h*p)+' '+cur().sym];
  });
  if(num('f-alb-mat')) rows.push(['Material de albañilería (mortero, yeso, accesorios)','—','1','—',nf.format(num('f-alb-mat'))+' '+cur().sym]);
  if(num('f-alb-maq')) rows.push(['Alquiler de máquinas y medio elevador','—','1','—',nf.format(num('f-alb-maq'))+' '+cur().sym]);
  if(num('f-alb-e1')) rows.push(['Andamiaje / medios auxiliares','—','1','—',nf.format(num('f-alb-e1'))+' '+cur().sym]);
  if(num('f-alb-e2')) rows.push(['Retirada y eliminación de residuos','—','1','—',nf.format(num('f-alb-e2'))+' '+cur().sym]);
  return rows;
}
/** Totales del presupuesto único (instalación + ayudas de albañilería). */
function totalsFor(r){
  const base=r.base;
  const dv=num('f-desc-val'), dt=$('#f-desc-tipo').value;
  const dvolP=(r.ench>60)?Math.min(30,Math.max(0,num('f-desc-vol'))):0;
  const mixEl=document.getElementById('f-iva-mixto');
  const mix=!!(mixEl&&mixEl.checked);                        /* #4 mejoras2: doble IVA */
  const t=/** @type {Totals} */(totalsForMix(base,(dt==='%'? base*dv/100 : Math.min(dv,base)),base*dvolP/100,
    r.ivaP,$('#f-redondeo').value,mix,num('f-iva-p10')));
  t.dvolP=dvolP;
  return t;
}

/* ============================ PDF PRESUPUESTO ============================ */
async function buildPDF(){
  if(idv('f-doc-tipo')==='factura') return buildFacturaPDF();
  await ensurePdf();
  const r=calc();
  const marca=(document.querySelector('input[name=wm]:checked')||{}).value||'';
  const t=totalsFor(r);
  const acc=hexRGB(ACC_COLOR);
  const font=PDF_FONT;
  const A=window.__peAssets||{};
  const inst={n:idv('f-inst-nombre')||'Instalador autorizado',pob:idv('f-inst-pob'),nif:idv('f-inst-nif'),
    tel:idv('f-inst-tel'),mail:idv('f-inst-mail'),aut:idv('f-inst-aut'),rc:idv('f-inst-rc')};
  const cli={n:idv('f-cli-nombre')||'—',nif:idv('f-cli-nif'),dir:idv('f-cli-dir'),
    pob:idv('f-cli-pob'),mun:idv('f-cli-mun'),prov:idv('f-cli-prov'),ccaa:idv('f-cli-ccaa'),
    cat:idv('f-cli-cat'),tel:idv('f-cli-tel'),mail:idv('f-cli-mail')};
  const num0=idv('f-num')||'PE', ver=idv('f-ver');
  const {jsPDF}=window.jspdf;
  const doc=new jsPDF({unit:'mm',format:'a4'});
  const W=210,H=297,M=16; let y=13;

  /* cabecera: banda de acento, identidad (izq.) y título a dos niveles (der.) */
  doc.setFillColor(acc[0],acc[1],acc[2]); doc.rect(0,0,W,5,'F');
  const interno=!!window.__PDF_INTERNO;          /* #7 mejoras: copia interna */
  if(interno){ doc.setFillColor(RED[0],RED[1],RED[2]); doc.rect(0,5,W,7,'F');
    doc.setTextColor(255); doc.setFont(font,'bold'); doc.setFontSize(8.5);
    doc.text('COPIA INTERNA — COSTE Y MARGEN · NO ENVIAR AL CLIENTE',W/2,9.9,{align:'center'});
    doc.setTextColor(INK[0],INK[1],INK[2]); y=21; }
  doc.setFont(font,'bold'); doc.setFontSize(12.5); doc.setTextColor(INK[0],INK[1],INK[2]);
  const logoW=(A.logo&&A.logoAR)?addImgFit(doc,A.logo,M,y,11,A.logoAR):0;
  const lx=M+logoW+(logoW?4:0);
  doc.text(inst.n,lx,y+3.5);
  const nameW=lx+doc.getTextWidth(inst.n);
  doc.setFont(font,'normal'); doc.setFontSize(7.5); doc.setTextColor(TX2[0],TX2[1],TX2[2]);
  const instLines=[inst.pob,inst.nif&&('NIF: '+inst.nif),inst.tel,inst.mail,
    inst.aut&&('Empresa instaladora autorizada: '+inst.aut),inst.rc&&('Seguro RC: '+inst.rc)].filter(Boolean);
  instLines.forEach((s,i)=>doc.text(s,lx,y+8.5+i*3.4));
  const TITLE='PRESUPUESTO';
  let tfs=19; doc.setFont(font,'bold'); doc.setTextColor(INK[0],INK[1],INK[2]); doc.setFontSize(tfs);
  while(tfs>11&&nameW+8>W-M-doc.getTextWidth(TITLE)){ tfs-=0.5; doc.setFontSize(tfs); }
  doc.text(TITLE,W-M,y+4,{align:'right'});
  doc.setFont(font,'normal'); doc.setFontSize(8); doc.setTextColor(TX2[0],TX2[1],TX2[2]);
  doc.text('INSTALACIÓN ELÉCTRICA'.split('').join(' '),W-M,y+8.4,{align:'right'});
  doc.setFontSize(8.5);
  doc.text(`Nº ${num0}${ver?' · '+ver:''} · ${fdate(idv('f-fecha'))}`,W-M,y+13,{align:'right'});
  y=Math.max(y+8.5+instLines.length*3.4,30)+6;

  /* bloque cliente / obra (#13: campos completos del boletín) */
  const pobFull=[cli.pob,cli.mun,cli.prov,cli.ccaa].filter(Boolean).join(' · ');
  const cliLines=[['Cliente',cli.n],cli.nif&&['NIF',cli.nif],cli.dir&&['Obra',cli.dir],
    pobFull&&['',pobFull],cli.cat&&['Ref. cat.',cli.cat],
    cli.tel&&['Tel.',cli.tel],cli.mail&&['Email',cli.mail]].filter(Boolean);
  const tipoTxt=$('#f-tipo').selectedOptions?$('#f-tipo').selectedOptions[0].textContent:'—';
  const pagoTxt=$('#f-pago').selectedOptions?$('#f-pago').selectedOptions[0].textContent:'—';
  const uso=$('#f-uso')&&$('#f-uso').value;
  const metaLines=[['Tipo de obra',tipoTxt],uso&&['Uso previsto',uso],
    idv('f-m2')&&['Superficie',idv('f-m2')+' m²'],
    ['Validez',idv('f-validez')],['Forma de pago',pagoTxt]].filter(Boolean);
  const bh2=Math.max(cliLines.length,metaLines.length)*4.2+12;
  doc.setFillColor(SOFT[0],SOFT[1],SOFT[2]); doc.roundedRect(M,y,W-2*M,bh2,2.5,2.5,'F');
  doc.setDrawColor(LINE[0],LINE[1],LINE[2]); doc.setLineWidth(0.25);
  doc.line(W/2,y+3,W/2,y+bh2-3);
  doc.setFont(font,'bold'); doc.setFontSize(6.5); doc.setTextColor(acc[0],acc[1],acc[2]);
  doc.text('CLIENTE Y OBRA',M+4,y+5);
  doc.text('DATOS DEL PRESUPUESTO',W/2+4,y+5);
  const fitTxt=(s,x,yy,maxW)=>{ let fs=8; doc.setFontSize(fs);
    while(fs>6.2&&doc.getTextWidth(s)>maxW){ fs-=0.2; doc.setFontSize(fs); } doc.text(s,x,yy); };
  cliLines.forEach((L,i)=>{ const yy=y+10.5+i*4.2;
    doc.setFont(font,'bold'); doc.setFontSize(8); doc.setTextColor(HDTX[0],HDTX[1],HDTX[2]);
    doc.text(String(L[0]),M+4,yy);
    doc.setFont(font,'normal'); doc.setTextColor(INK[0],INK[1],INK[2]);
    fitTxt(String(L[1]),M+23,yy,W/2-3-(M+23)); });
  metaLines.forEach((L,i)=>{ const yy=y+10.5+i*4.2;
    doc.setFont(font,'bold'); doc.setFontSize(8); doc.setTextColor(HDTX[0],HDTX[1],HDTX[2]);
    doc.text(String(L[0]),W/2+4,yy);
    doc.setFont(font,'normal'); doc.setTextColor(INK[0],INK[1],INK[2]);
    fitTxt(String(L[1]),W/2+27,yy,W-M-4-(W/2+27)); });
  y+=bh2+7;

  /* tablas de partidas: fila de sección en acento + fila de columnas, zebra suave */
  const secciones=rowsA(), bRows=rowsB();
  const showA=secciones.length>0;
  const showB=bRows.length>0;
  const headS={fillColor:COLHD,textColor:HDTX,fontStyle:'bold',fontSize:7,
    cellPadding:{top:1.6,bottom:1.6,left:2,right:2},lineColor:LINE,lineWidth:0.1,valign:'middle'};
  const bodyS={fontSize:7.6,textColor:INK,cellPadding:{top:1.7,bottom:1.7,left:2,right:2},
    lineColor:LINE,lineWidth:0.1,valign:'middle'};
  const COLS=[{content:'Concepto',styles:{halign:'left'}},{content:'Ud',styles:{halign:'center'}},
    {content:'Cant.',styles:{halign:'right'}},{content:'€/ud',styles:{halign:'right'}},
    {content:'Importe',styles:{halign:'right'}}];
  function table(head,body,opts){
    const o=Object.assign({startY:y,head,body,theme:'grid',styles:bodyS,headStyles:headS,
      alternateRowStyles:{fillColor:ZEBRA},
      columnStyles:{1:{halign:'center',cellWidth:11},2:{halign:'right',cellWidth:13},
        3:{halign:'right',cellWidth:15},4:{halign:'right',cellWidth:23,fontStyle:'bold'}},
      margin:{left:M,right:M}},opts||{});
    doc.autoTable(o); y=doc.lastAutoTable.finalY+4;
  }
  function secTable(titulo,rows){
    table([[{content:titulo,colSpan:5,styles:{fillColor:acc,textColor:255,fontStyle:'bold',fontSize:8,halign:'left'}}],COLS],rows);
  }
  function subtotal(txt,val,big){
    doc.setFont(font,'bold'); doc.setFontSize(big?10:8.5);
    if(big) doc.setTextColor(INK[0],INK[1],INK[2]); else doc.setTextColor(HDTX[0],HDTX[1],HDTX[2]);
    const dy=big?3.6:2.6;
    doc.text(txt,M,y+dy); doc.text(val,W-M,y+dy,{align:'right'});
    y+=big?9:6.2;
  }
  function h2(txt){
    if(y+12>H-40){ doc.addPage(); y=16; }
    doc.setFillColor(acc[0],acc[1],acc[2]); doc.rect(M,y-3.2,2.6,4.8,'F');
    doc.setFont(font,'bold'); doc.setFontSize(10.5); doc.setTextColor(INK[0],INK[1],INK[2]);
    doc.text(txt,M+5,y+0.5); y+=7;
  }
  if(showA){
    const mecSecs=secciones.filter(s=>s.parte==='mec');
    const matSecs=secciones.filter(s=>s.parte==='mat');
    const moSecs=secciones.filter(s=>s.parte==='mo');
    if(mecSecs.length){
      mecSecs.forEach(sec=>secTable((/** @type {any} */(sec)).head||sec.titulo,sec.rows));
      subtotal('Subtotal mecanismos y puntos',nf.format(mecSecs.reduce((a,s)=>a+s.sum,0))+' '+cur().sym);
    }
    if(matSecs.length){
      matSecs.forEach(sec=>secTable('PARTE 1 · MATERIALES — '+sec.titulo,sec.rows));
      subtotal('Subtotal materiales',nf.format(matSecs.reduce((a,s)=>a+s.sum,0))+' '+cur().sym);
    }
    if(moSecs.length){
      moSecs.forEach(sec=>secTable('PARTE 2 · MANO DE OBRA — '+sec.titulo,sec.rows));
      subtotal('Subtotal mano de obra y tramitación',nf.format(moSecs.reduce((a,s)=>a+s.sum,0))+' '+cur().sym);
    }
    if(r.margenPct>0){ doc.setFont(font,'italic'); doc.setFontSize(7.5); doc.setTextColor(TX2[0],TX2[1],TX2[2]);
      doc.text(`Incluye beneficio sobre materiales: ${nfC.format(r.margenPct)}%.`,M,y); y+=4.5; }
    if(r.coef>1){ doc.setFont(font,'italic'); doc.setFontSize(7.5); doc.setTextColor(TX2[0],TX2[1],TX2[2]);
      doc.text(`Coeficiente de dificultad aplicado: ×${nfC.format(r.coef)}.`,M,y); y+=4.5; }
    subtotal('Subtotal instalación eléctrica',nf.format(r.sumA)+' '+cur().sym,true);
  }
  if(showB){
    secTable('AYUDAS DE ALBAÑILERÍA — rozas, picado y tapado para la instalación eléctrica',bRows);
    subtotal('Subtotal ayudas de albañilería',nf.format(r.sumB)+' '+cur().sym,true);
  }
  if(showA&&showB){
    subtotal('Subtotal presupuesto',nf.format(r.base)+' '+cur().sym,true);
  }

  /* bloque de totales: panel suave + banda TOTAL en color */
  const dTxt=$('#f-desc-tipo').value==='%'? nfC.format(num('f-desc-val'))+'%' : nf.format(num('f-desc-val'))+' '+cur().sym;
  const totRows=[];
  if(t.desc>0){
    totRows.push(['s','Precio de partida (base)',nf.format(t.base)+' '+cur().sym]);
    totRows.push(['d',`Descuento comercial (${dTxt})`,'- '+nf.format(t.desc)+' '+cur().sym]);
    if(t.dvolP>0) totRows.push(['d',`Descuento por volumen (${nfC.format(t.dvolP)}%)`,'- '+nf.format(t.base*t.dvolP/100)+' '+cur().sym]);
    totRows.push(['b','Base imponible',nf.format(t.baseDes)+' '+cur().sym]);
  }else totRows.push(['b','Base imponible',nf.format(t.baseDes)+' '+cur().sym]);
  if(t.ivaMix){ totRows.push(['n','IVA 10% (rehabilitación)',nf.format(t.ivaMix.iva10)+' '+cur().sym]);   /* #4 mejoras2 */
    totRows.push(['n','IVA 21% (materiales / obra nueva)',nf.format(t.ivaMix.iva21)+' '+cur().sym]); }
  else if(r.ivaP) totRows.push(['n',`IVA ${nfC.format(r.ivaP)}%`,nf.format(t.iva)+' '+cur().sym]);
  const rndAdj=t.total-(t.baseDes+t.iva);
  if(Math.abs(rndAdj)>0.004) totRows.push(['n','Redondeo comercial',(rndAdj>0?'+ ':'- ')+nf.format(Math.abs(rndAdj))+' '+cur().sym]);
  /* desglose material / mano de obra opcional (#7 mejoras) */
  if(($('#f-pdf-desglose')||{}).checked&&r.matT>0){
    const ix=totRows.findIndex(rw=>rw[0]==='b');
    if(ix>=0) totRows.splice(ix+1,0,
      ['n','De los cuales — material',nf.format(r.matT)+' '+cur().sym],
      ['n','De los cuales — mano de obra',nf.format(r.moT)+' '+cur().sym]);
  }
  const px=W-M-92, pw=92, rowH=4.6;
  const panH=8.5+(totRows.length-1)*rowH+4, bandH=11;
  if(y+panH+bandH+12>H-40){ doc.addPage(); y=16; }
  doc.setFillColor(SOFT[0],SOFT[1],SOFT[2]); doc.roundedRect(px,y,pw,panH,2.5,2.5,'F');
  let ty=y+8.5;
  totRows.forEach(rw=>{
    const [cls,lab,val]=rw;
    doc.setFontSize(8.5);
    if(cls==='d'){ doc.setFont(font,'normal'); doc.setTextColor(RED[0],RED[1],RED[2]); }
    else if(cls==='b'){ doc.setFont(font,'bold'); doc.setTextColor(INK[0],INK[1],INK[2]); }
    else{ doc.setFont(font,'normal'); doc.setTextColor(TX2[0],TX2[1],TX2[2]); }
    doc.text(lab,px+4,ty); doc.text(val,px+pw-4,ty,{align:'right'});
    if(cls==='s'){ const wv=doc.getTextWidth(val);
      doc.setDrawColor(TX2[0],TX2[1],TX2[2]); doc.setLineWidth(0.3);
      doc.line(px+pw-4-wv,ty-1,px+pw-4,ty-1); }
    ty+=rowH;
  });
  const by=y+panH+1.5;
  doc.setFillColor(acc[0],acc[1],acc[2]); doc.roundedRect(px,by,pw,bandH,2.5,2.5,'F');
  doc.setTextColor(255); doc.setFont(font,'bold'); doc.setFontSize(12.5);
  doc.text('TOTAL',px+4,by+7.6);
  doc.text(nf.format(t.total)+' '+cur().sym,px+pw-4,by+7.6,{align:'right'});
  y=Math.max(y+panH,by+bandH)+2;
  if(t.total>0){ doc.setFont(font,'italic'); doc.setFontSize(8.5); doc.setTextColor(TX2[0],TX2[1],TX2[2]);
    doc.text(totalLetra(t.total),M,y); y+=5.5; }
  y+=2; doc.setTextColor(INK[0],INK[1],INK[2]);

  /* desglose interno de márgenes: SOLO en la copia interna (#7 mejoras) */
  if(interno){
    h2('Interno — márgenes (no visible para el cliente)');
    const irows=[['Beneficio sobre materiales',`+ ${nf.format(r.margenAmt)} ${cur().sym} (${nfC.format(r.margenPct)}%)`],
      ['Material facturado (con margen)',nf.format(r.matT)+' '+cur().sym],
      ['Mano de obra y servicios',nf.format(r.moT)+' '+cur().sym],
      ['Coeficiente de dificultad','×'+nfC.format(r.coef)]];
    if(r.costeM>0) irows.push(['Coste material estimado (compra en marca)',nf.format(r.costeM)+' '+cur().sym]);
    const fRefp=LS('pe-refp-fecha');                   /* #9 mejoras2: trazabilidad de precios */
    irows.push(['Precios de referencia',fRefp?fdate(String(fRefp).slice(0,10)):'de fábrica (09/11/2026)']);
    table([['Concepto interno','Valor']],irows,{columnStyles:{1:{halign:'right'}}});
  }

  /* cronograma + Gantt (#39) */
  if(showA){
    h2('Cronograma de ejecución');
    const wA=ganttWeeks(idv('f-plazoA')), wB=ganttWeeks(idv('f-plazoB'));
    const Wt=Math.max(wA?wA.max:0,wB?wB.max:0,4);
    table([['Fase','Trabajos','Plazo estimado','Semanas']],[
      ['1 · Preparación','Marcado de trazados y protección de la obra','A convenir',nfC.format(Wt*0.08)],
      ['2 · Rozas y picado','Picado de regatas, cajetines y huecos (ayudas de albañilería)',idv('f-plazoB')||'—',wB?String(wB.max):'—'],
      ['3 · Canalizaciones','Tubos, cables, cuadro general y protecciones',idv('f-plazoA')||'—',wA?String(wA.max):'—'],
      ['4 · Mecanismos','Colocación de mecanismos, pruebas y ajustes',idv('f-plazoA')||'—',wA?String(Math.max(1,Math.round(wA.max*0.4))):'—'],
      ['5 · Tramitación','Certificado de instalación y Boletín Eléctrico (CIE)','Incluido',nfC.format(Math.max(1,Wt*0.07))],
    ],{columnStyles:{3:{halign:'right'}}});
    /* barras Gantt simples con jsPDF rect */
    if(y+26<H-40){
      const gx=M+34, gw=W-2*M-40;
      /** @type {[string,number,number][]} */ const fases=[['Preparación',0,0.08],['Rozas y picado',0.05,0.15],['Canalizaciones',0.15,0.55],
        ['Mecanismos',0.5,0.85],['Tramitación',0.85,0.98]];
      doc.setFontSize(7); doc.setTextColor(TX2[0],TX2[1],TX2[2]);
      fases.forEach(([n,a,b],i)=>{
        const yy=y+2+i*4.4;
        doc.setFont(font,'normal'); doc.text(n,M,yy+2.6);
        doc.setFillColor(LINE[0],LINE[1],LINE[2]); doc.rect(gx,yy,gw,3,'F');
        doc.setFillColor(acc[0],acc[1],acc[2]);
        doc.rect(gx+gw*a,yy,gw*(b-a),3,'F');
      });
      doc.setTextColor(TX2[0],TX2[1],TX2[2]);
      doc.text('0',gx-1,y+2.6,{align:'right'});
      doc.text(nfC.format(Wt)+' sem',gx+gw+2,y+2.6);
      y+=fases.length*4.4+4; doc.setTextColor(INK[0],INK[1],INK[2]);
    }
  }

  /* garantías y condiciones (#36) */
  h2('Garantías y condiciones');
  doc.setFont(font,'normal'); doc.setFontSize(8.2); doc.setTextColor(HDTX[0],HDTX[1],HDTX[2]);
  const cond=[];
  cond.push(`Forma de pago: ${pagoTxt}.`);
  cond.push(`Validez de la oferta: ${idv('f-validez')} desde la fecha del documento.`);
  cond.push('Precios orientativos: pueden variar si el presupuesto no se aprueba en las 48 horas siguientes a su emisión.');
  if(inst.aut) cond.push(`Nº de autorización de empresa instaladora: ${inst.aut} (REBT, RD 842/2002).`);
  if(inst.rc) cond.push(`Seguro de responsabilidad civil: ${inst.rc}.`);
  cond.forEach(c=>{ const ls=doc.splitTextToSize('•  '+c,W-2*M-2);
    if(y+ls.length*4.2>H-40){ doc.addPage(); y=16; }
    doc.text(ls,M,y); y+=ls.length*4.2+1.2; });
  /* condiciones propias del instalador (#7 mejoras) */
  String(($('#f-condiciones')||{}).value||'').split('\n').map(s=>s.trim()).filter(Boolean)
    .forEach(c=>{ const ls=doc.splitTextToSize('•  '+c,W-2*M-2);
      if(y+ls.length*4.2>H-40){ doc.addPage(); y=16; }
      doc.text(ls,M,y); y+=ls.length*4.2+1.2; });

  /* RGPD */
  doc.setFontSize(7.5); doc.setTextColor(TX2[0],TX2[1],TX2[2]);
  const rgpd='Los datos personales facilitados se tratan con la única finalidad de gestionar el presente presupuesto y, en su caso, la ejecución de la obra, conforme al RGPD (UE) 2016/679 y la LOPDGDD 3/2018.';
  const rl=doc.splitTextToSize(rgpd,W-2*M);
  if(y+rl.length*3.4>H-48){ doc.addPage(); y=16; }
  doc.text(rl,M,y); y+=rl.length*3.4+4; doc.setTextColor(INK[0],INK[1],INK[2]);

  /* QR + firmas (#34: firma digital del instalador) */
  const waLink=inst.tel?('https://wa.me/'+inst.tel.replace(/[^0-9]/g,'')):'';
  if(waLink) await ensureQR();
  if(H-y<54){ doc.addPage(); y=16; }
  const fy=y+8; let qrSize=0;
  if(waLink&&window.qrcode&&qrPaint(doc,waLink,M,fy-2,17)){
    doc.setFontSize(7); doc.setTextColor(TX2[0],TX2[1],TX2[2]); doc.text('Escríbenos',M,fy-2+20.5);
    qrSize=17;
  }
  const bx1=M+(qrSize?qrSize+8:0), bw=(W-2*M-(qrSize?qrSize+8:0)-8)/2;
  doc.setDrawColor(LINE[0],LINE[1],LINE[2]); doc.setLineWidth(0.35);
  doc.roundedRect(bx1,fy,bw,25,2,2); doc.roundedRect(bx1+bw+8,fy,bw,25,2,2);
  doc.setFont(font,'bold'); doc.setFontSize(6.5); doc.setTextColor(TX2[0],TX2[1],TX2[2]);
  doc.text('FIRMA DEL CLIENTE (ACEPTACIÓN)',bx1+3.5,fy+4.5);
  doc.text('FIRMA DEL INSTALADOR',bx1+bw+11.5,fy+4.5);
  doc.setDrawColor(175,183,194); doc.setLineWidth(0.25);
  doc.line(bx1+4,fy+19,bx1+bw-4,fy+19);
  doc.line(bx1+bw+12,fy+19,bx1+2*bw+4,fy+19);
  if(A.firma&&A.firmaAR){ addImgFit(doc,A.firma,bx1+bw+8+4,fy+6,12,A.firmaAR); }
  doc.setFont(font,'normal'); doc.setFontSize(7.5); doc.setTextColor(TX2[0],TX2[1],TX2[2]);
  doc.text(`La firma implica la aceptación del presupuesto nº ${num0}${ver?' '+ver:''}, importes, exclusiones y condiciones.`,bx1,fy+29.5);
  doc.setTextColor(INK[0],INK[1],INK[2]);

  /* marca de agua + pies de página (#35) */
  const npag=doc.getNumberOfPages();
  for(let i=1;i<=npag;i++){
    doc.setPage(i);
    if(marca){
      let gs=false; try{ doc.setGState(doc.GState({opacity:0.12})); gs=true; }catch(e){}
      doc.setFont(font,'bold'); doc.setFontSize(50);
      doc.setTextColor(gs?120:232);
      doc.text(marca,W/2,H/2,{align:'center',angle:38});
      try{ doc.setGState(doc.GState({opacity:1})); }catch(e){}
    }
    doc.setFont(font,'normal'); doc.setFontSize(7.5); doc.setTextColor(TX2[0],TX2[1],TX2[2]);
    doc.setDrawColor(acc[0],acc[1],acc[2]); doc.setLineWidth(0.8); doc.line(M,H-14,M+16,H-14);
    doc.setDrawColor(LINE[0],LINE[1],LINE[2]); doc.setLineWidth(0.25); doc.line(M+16,H-14,W-M,H-14);
    doc.text(`${inst.n}${inst.nif?' · '+inst.nif:''}`,M,H-10);
    doc.text(`${num0}${ver?' '+ver:''}`,W/2,H-10,{align:'center'});
    doc.text(`Página ${i} de ${npag}`,W-M,H-10,{align:'right'});
    doc.setTextColor(INK[0],INK[1],INK[2]);
  }
  return doc;
}

/* ============================ PDF FACTURA ============================ */
async function buildFacturaPDF(){
  await ensurePdf();
  const r=calc(), t=totalsFor(r);
  const acc=hexRGB(ACC_COLOR), font='helvetica';
  const A=window.__peAssets||{};
  const inst={n:idv('f-inst-nombre')||'Instalador autorizado',pob:idv('f-inst-pob'),nif:idv('f-inst-nif'),
    tel:idv('f-inst-tel'),mail:idv('f-inst-mail'),aut:idv('f-inst-aut'),rc:idv('f-inst-rc')};
  const cli={n:idv('f-cli-nombre')||'—',nif:idv('f-cli-nif'),dir:idv('f-cli-dir'),
    pob:idv('f-cli-pob'),tel:idv('f-cli-tel'),mail:idv('f-cli-mail')};
  const num0=idv('f-num')||'F', ver=idv('f-ver');
  const pagoTxt=$('#f-pago').selectedOptions?$('#f-pago').selectedOptions[0].textContent:'—';
  const {jsPDF}=window.jspdf;
  const doc=new jsPDF({unit:'mm',format:'a4'});
  const W=210,H=297,M=16; let y=0;

  /* banda superior de color + logo (#34) */
  doc.setFillColor(acc[0],acc[1],acc[2]); doc.rect(0,0,W,30,'F');
  const tx=M;
  doc.setTextColor(255); doc.setFont(font,'bold'); doc.setFontSize(16);
  doc.text('FACTURA',W-M,19,{align:'right'});
  let nx=tx;
  if(A.logo&&A.logoAR){ doc.setFillColor(255,255,255); /* fondo suave tras el logo */
    const lw=addImgFit(doc,A.logo,tx,7,16,A.logoAR); nx=tx+(lw?lw+5:0); }
  doc.setFontSize(11); doc.text(inst.n,nx,13);
  doc.setFont(font,'normal'); doc.setFontSize(7.5);
  [inst.pob,inst.tel,inst.mail].filter(Boolean).forEach((s,i)=>doc.text(String(s),nx,17.5+i*3.8));
  y=38;

  /* Veri*factu (#37): hash encadenado de la serie */
  const cadena=factsGet();   /* libro de facturas (IndexedDB, #5 mejoras2) */
  const prev=cadena.length?cadena[cadena.length-1].hash:'';
  const fhash=await hashFactura(prev,`${num0}|${idv('f-fecha')}|${nf.format(t.base)}|${nfC.format(r.ivaP)}|${nf.format(t.total)}`);
  window.__LAST_FACT={num:num0,fecha:idv('f-fecha'),cliente:idv('f-cli-nombre')||'—',base:t.base,ivaP:r.ivaP,
    ivas:t.ivaMix?{p10:t.ivaMix.p10,iva10:t.ivaMix.iva10,iva21:t.ivaMix.iva21}:null,   /* #4 mejoras2 */
    total:t.total,hash:fhash,prev:prev||null,cobrada:false,fCobro:null};

  /* nº, fecha y forma de pago */
  doc.setTextColor(INK[0],INK[1],INK[2]); doc.setFont(font,'bold'); doc.setFontSize(12);
  doc.text(`Factura nº ${num0}${ver?' ('+ver+')':''}`,M,y);
  doc.setFont(font,'normal'); doc.setFontSize(9); doc.setTextColor(TX2[0],TX2[1],TX2[2]);
  doc.text(`Fecha de emisión: ${fdate(idv('f-fecha'))}`,W-M,y,{align:'right'});
  y+=5;
  doc.text(`Forma de pago: ${pagoTxt}`,W-M,y,{align:'right'});
  y+=10;

  /* bloques emisor / cliente */
  const colW=(W-2*M-8)/2;
  const emiLines=[inst.nif&&'NIF: '+inst.nif,inst.tel&&'Tel.: '+inst.tel,inst.mail,
    inst.aut&&'Empresa instaladora (RIIA): '+inst.aut,inst.rc&&'Seguro RC: '+inst.rc].filter(Boolean);
  const cliLines=[cli.nif&&'NIF/CIF: '+cli.nif,cli.dir,cli.pob,cli.tel&&'Tel.: '+cli.tel,cli.mail].filter(Boolean);
  const bh=Math.max(emiLines.length,cliLines.length)*4+14;
  doc.setFillColor(SOFT[0],SOFT[1],SOFT[2]);
  doc.roundedRect(M,y,colW,bh,2.5,2.5,'F'); doc.roundedRect(M+colW+8,y,colW,bh,2.5,2.5,'F');
  doc.setFillColor(acc[0],acc[1],acc[2]); doc.roundedRect(M+colW+8,y,1.4,bh,0.7,0.7,'F');
  doc.setFont(font,'bold'); doc.setFontSize(7); doc.setTextColor(acc[0],acc[1],acc[2]);
  doc.text('EMISOR',M+4,y+5); doc.text('FACTURAR A',M+colW+12,y+5);
  doc.setTextColor(INK[0],INK[1],INK[2]); doc.setFontSize(8.5);
  doc.setFont(font,'bold'); doc.text(inst.n,M+4,y+10);
  doc.text(cli.n,M+colW+12,y+10);
  doc.setFont(font,'normal'); doc.setTextColor(TX2[0],TX2[1],TX2[2]);
  emiLines.forEach((s,i)=>doc.text(String(s),M+4,y+14+i*4));
  cliLines.forEach((s,i)=>doc.text(String(s),M+colW+12,y+14+i*4));
  y+=bh+8;

  /* tabla de partidas: fila de sección en acento + fila de columnas, zebra suave */
  const headS={fillColor:COLHD,textColor:HDTX,fontStyle:'bold',fontSize:7,
    cellPadding:{top:1.6,bottom:1.6,left:2,right:2},lineColor:LINE,lineWidth:0.1,valign:'middle'};
  const bodyS={fontSize:7.8,textColor:INK,cellPadding:{top:1.7,bottom:1.7,left:2,right:2},
    lineColor:LINE,lineWidth:0.1,valign:'middle'};
  const COLS=[{content:'Concepto',styles:{halign:'left'}},{content:'Ud',styles:{halign:'center'}},
    {content:'Cant.',styles:{halign:'right'}},{content:'€/ud',styles:{halign:'right'}},
    {content:'Importe',styles:{halign:'right'}}];
  function ftable(head,body,opts){
    const o=Object.assign({startY:y,head,body,theme:'grid',styles:bodyS,headStyles:headS,
      alternateRowStyles:{fillColor:ZEBRA},
      columnStyles:{1:{halign:'center',cellWidth:11},2:{halign:'right',cellWidth:13},
        3:{halign:'right',cellWidth:15},4:{halign:'right',cellWidth:23,fontStyle:'bold'}},
      margin:{left:M,right:M}},opts||{});
    doc.autoTable(o); y=doc.lastAutoTable.finalY+4;
  }
  function fsec(titulo,rows){
    ftable([[{content:titulo,colSpan:5,styles:{fillColor:acc,textColor:255,fontStyle:'bold',fontSize:8,halign:'left'}}],COLS],rows);
  }
  const secciones=rowsA(), bRows=rowsB();
  const hayAlgo=secciones.length>0||bRows.length>0;
  if(secciones.length)
    secciones.forEach(sec=>fsec((/** @type {any} */(sec)).head||sec.titulo,sec.rows));
  if(bRows.length)
    fsec('Ayudas de albañilería',bRows);
  if(!hayAlgo){ doc.setFont(font,'italic'); doc.setFontSize(9); doc.setTextColor(TX2[0],TX2[1],TX2[2]);
    doc.text('Sin partidas que facturar.',M,y); y+=6; doc.setTextColor(INK[0],INK[1],INK[2]); }
  if(r.coef>1){ doc.setFont(font,'italic'); doc.setFontSize(7.5); doc.setTextColor(TX2[0],TX2[1],TX2[2]);
    doc.text(`Importes con coeficiente de dificultad ×${nfC.format(r.coef)}.`,M,y); y+=4.5; }
  if(r.margenPct>0){ doc.setFont(font,'italic'); doc.setFontSize(7.5); doc.setTextColor(TX2[0],TX2[1],TX2[2]);
    doc.text(`Incluye beneficio sobre materiales: ${nfC.format(r.margenPct)}%.`,M,y); y+=4.5; }

  /* totales: panel suave + banda TOTAL A PAGAR en color */
  y+=4;
  const px=W-M-88, pw=88;
  const totRows=[['n','Base',nf.format(t.base)+' '+cur().sym]];
  if(t.desc>0){
    totRows.push(['d','Descuento comercial','- '+nf.format(t.desc)+' '+cur().sym]);
    totRows.push(['b','Base imponible',nf.format(t.baseDes)+' '+cur().sym]);
  }
  if(t.ivaMix){ totRows.push(['n','IVA 10% (rehabilitación)',nf.format(t.ivaMix.iva10)+' '+cur().sym]);   /* #4 mejoras2 */
    totRows.push(['n','IVA 21% (materiales / obra nueva)',nf.format(t.ivaMix.iva21)+' '+cur().sym]); }
  else if(r.ivaP) totRows.push(['n',`IVA ${nfC.format(r.ivaP)}%`,nf.format(t.iva)+' '+cur().sym]);
  const rndAdj=t.total-(t.baseDes+t.iva);
  if(Math.abs(rndAdj)>0.004) totRows.push(['n','Redondeo',(rndAdj>0?'+ ':'- ')+nf.format(Math.abs(rndAdj))+' '+cur().sym]);
  const rowH=4.8, panH=8.5+(totRows.length-1)*rowH+4, bandH=11;
  if(y+panH+bandH+10>H-40){ doc.addPage(); y=16; }
  doc.setFillColor(SOFT[0],SOFT[1],SOFT[2]); doc.roundedRect(px,y,pw,panH,2.5,2.5,'F');
  let ty=y+8.5;
  totRows.forEach(rw=>{
    const [cls,lab,val]=rw;
    doc.setFontSize(8.8);
    if(cls==='d'){ doc.setFont(font,'normal'); doc.setTextColor(RED[0],RED[1],RED[2]); }
    else if(cls==='b'){ doc.setFont(font,'bold'); doc.setTextColor(INK[0],INK[1],INK[2]); }
    else{ doc.setFont(font,'normal'); doc.setTextColor(TX2[0],TX2[1],TX2[2]); }
    doc.text(lab,px+4,ty); doc.text(val,px+pw-4,ty,{align:'right'});
    ty+=rowH;
  });
  const by=y+panH+1.5;
  doc.setFillColor(acc[0],acc[1],acc[2]); doc.roundedRect(px,by,pw,bandH,2.5,2.5,'F');
  doc.setTextColor(255); doc.setFont(font,'bold'); doc.setFontSize(12);
  doc.text('TOTAL A PAGAR',px+4,by+7.5);
  doc.text(nf.format(t.total)+' '+cur().sym,px+pw-4,by+7.5,{align:'right'});
  y=Math.max(y+panH,by+bandH)+2;
  if(t.total>0){ doc.setFont(font,'italic'); doc.setFontSize(8.5); doc.setTextColor(TX2[0],TX2[1],TX2[2]);
    doc.text(totalLetra(t.total),M,y); y+=6; }

  /* Veri*factu: QR + hash encadenado (#37) */
  await ensureQR();
  const vfTxt=`VERIFACTU|${num0}|${idv('f-fecha')}|${nf.format(t.total)}|${fhash.slice(0,16)}`;
  if(window.qrcode&&qrPaint(doc,vfTxt,M,y+2,20)){
    doc.setFontSize(7); doc.setTextColor(TX2[0],TX2[1],TX2[2]);
    doc.text('Verificación (Veri*factu / Ley Antifraude)',M,y+25);
    doc.text('Hash encadenado: '+fhash.slice(0,32),M,y+29);
    doc.text('Anterior: '+(prev?prev.slice(0,32):'primera de la serie'),M,y+33);
    doc.setTextColor(INK[0],INK[1],INK[2]); y+=36;
  } else {
    doc.setFontSize(7.5); doc.setTextColor(TX2[0],TX2[1],TX2[2]);
    doc.text('Hash encadenado: '+fhash.slice(0,32),M,y+4); doc.setTextColor(INK[0],INK[1],INK[2]); y+=8;
  }

  /* condiciones y datos fiscales */
  doc.setFont(font,'normal'); doc.setFontSize(8.2); doc.setTextColor(HDTX[0],HDTX[1],HDTX[2]);
  const cond=[
    `Forma de pago: ${pagoTxt}.`,
    `Factura nº ${num0}${ver?' ('+ver+')':''} emitida el ${fdate(idv('f-fecha'))}${cli.n? ' a '+cli.n:''}.`,
    inst.aut?`Empresa instaladora autorizada · Nº RIIA ${inst.aut} (REBT, RD 842/2002).`:null,
    inst.rc?`Seguro de responsabilidad civil: ${inst.rc}.`:null,
  ].filter(Boolean);
  cond.forEach(c=>{ const ls=doc.splitTextToSize('•  '+c,W-2*M-2); doc.text(ls,M,y); y+=ls.length*4.2+1.2; });
  const rgpd='Datos tratados conforme al RGPD (UE) 2016/679 y la LOPDGDD 3/2018, con la única finalidad de gestionar la factura y la obra.';
  doc.setFontSize(7.5); doc.setTextColor(TX2[0],TX2[1],TX2[2]);
  const rl=doc.splitTextToSize(rgpd,W-2*M);
  if(y+rl.length*3.4>H-24){ doc.addPage(); y=16; }
  doc.text(rl,M,y); y+=rl.length*3.4; doc.setTextColor(INK[0],INK[1],INK[2]);

  /* pie de página en todas las páginas */
  const npag=doc.getNumberOfPages();
  for(let i=1;i<=npag;i++){
    doc.setPage(i);
    doc.setFont(font,'normal'); doc.setFontSize(7.5); doc.setTextColor(TX2[0],TX2[1],TX2[2]);
    doc.setDrawColor(acc[0],acc[1],acc[2]); doc.setLineWidth(0.8); doc.line(M,H-14,M+16,H-14);
    doc.setDrawColor(LINE[0],LINE[1],LINE[2]); doc.setLineWidth(0.25); doc.line(M+16,H-14,W-M,H-14);
    doc.text(`${inst.n}${inst.nif?' · NIF '+inst.nif:''}${inst.mail?' · '+inst.mail:''}`,M,H-10);
    doc.text(`Factura ${num0}`,W/2,H-10,{align:'center'});
    doc.text(`Página ${i} de ${npag}`,W-M,H-10,{align:'right'});
    doc.setTextColor(INK[0],INK[1],INK[2]);
  }
  return doc;
}
/** Registra la factura en la cadena local (al descargarla realmente). */
function commitFactura(){
  const f=window.__LAST_FACT; if(!f) return;
  const cadena=factsGet();   /* libro de facturas (IndexedDB, #5 mejoras2) */
  if(cadena.some(x=>x.num===f.num&&x.hash===f.hash)) return;
  cadena.push({num:f.num,fecha:f.fecha,cliente:f.cliente||'',base:f.base,ivaP:f.ivaP,ivas:f.ivas||null,
    total:f.total,hash:f.hash,cobrada:false,fCobro:null});   /* #4 mejoras2: libro de cobros */
  factsSet(cadena.slice(-200));
  window.__LAST_FACT=null;
}

/* ---- vista previa HTML de respaldo (sin jsPDF) ---- */
function tableHTML(){
  const r=calc(), t=totalsFor(r);
  let h='<table><tr><th colspan="5">Instalación eléctrica</th></tr><tr><th>Concepto</th><th>Ud</th><th>Cant</th><th>Precio</th><th>Importe</th></tr>';
  rowsA().forEach(sec=>sec.rows.forEach(row=>{ h+='<tr>'+row.map(c=>`<td>${esc(c)}</td>`).join('')+'</tr>'; }));
  h+=`</table><p><b>Subtotal instalación eléctrica: ${nf.format(r.sumA)} ${cur().sym}</b></p>`;
  if(r.sumB>0){ h+='<table><tr><th colspan="5">Ayudas de albañilería</th></tr><tr><th>Concepto</th><th>Ud</th><th>Cant</th><th>Precio</th><th>Importe</th></tr>';
    rowsB().forEach(row=>{ h+='<tr>'+row.map(c=>`<td>${esc(c)}</td>`).join('')+'</tr>'; });
    h+=`</table><p><b>Subtotal ayudas de albañilería: ${nf.format(r.sumB)} ${cur().sym}</b></p>`;
    h+=`<p><b>Subtotal presupuesto: ${nf.format(r.base)} ${cur().sym}</b></p>`; }
  h+=`<table>${t.desc?`<tr><td colspan="4">Descuento</td><td>− ${nf.format(t.desc)}</td></tr>`:''}
    <tr><td colspan="4">Base imponible</td><td>${nf.format(t.baseDes)}</td></tr>
    ${t.ivaMix?`<tr><td colspan="4">IVA 10% (rehabilitación)</td><td>${nf.format(t.ivaMix.iva10)}</td></tr>
    <tr><td colspan="4">IVA 21% (materiales / obra nueva)</td><td>${nf.format(t.ivaMix.iva21)}</td></tr>`
      :(r.ivaP?`<tr><td colspan="4">IVA ${nfC.format(r.ivaP)}%</td><td>${nf.format(t.iva)}</td></tr>`:'')}
    <tr><td colspan="4"><b>TOTAL</b></td><td><b>${nf.format(t.total)} ${cur().sym}</b></td></tr></table>
    <p><i>${esc(totalLetra(t.total))}</i></p>`;
  return h;
}
function fallbackPrint(){
  const w=window.open('','_blank','width=900,height=650');
  if(!w){ toast('Permite las ventanas emergentes para imprimir, o usa «Descargar PDF» con conexión a internet.','err'); return; }
  const marca=(document.querySelector('input[name=wm]:checked')||{}).value||'';
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(idv('f-num'))}</title>
<style>body{font-family:'Segoe UI',Arial,sans-serif;color:#1a2233;padding:24px;max-width:900px;margin:auto}
h1{font-size:19px}table{width:100%;border-collapse:collapse;margin:10px 0}th,td{border:1px solid #b9c3d6;padding:5px 8px;font-size:12px;text-align:left}
th{background:#e8edf6}td:nth-child(n+3){text-align:right}.firmas{display:flex;gap:24px;margin-top:34px}
.firmas div{flex:1;border:1px solid #555;height:70px}
.wm{position:fixed;top:45%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);font-size:70px;color:rgba(0,0,0,.12);font-weight:800;z-index:9}</style></head><body>
${marca?`<div class="wm">${esc(marca)}</div>`:''}
<h1>PRESUPUESTO DE INSTALACIÓN ELÉCTRICA · ${esc(idv('f-num'))} ${esc(idv('f-ver'))}</h1>
<p>${esc(idv('f-inst-nombre'))} ${esc(idv('f-inst-pob'))} · NIF ${esc(idv('f-inst-nif'))} · ${esc(idv('f-inst-tel'))} ${esc(idv('f-inst-mail'))}<br>
Cliente: ${esc(idv('f-cli-nombre'))} · Obra: ${esc(idv('f-cli-dir'))} ${esc(idv('f-cli-pob'))} · Fecha: ${fdate(idv('f-fecha'))}</p>
${tableHTML()}
<div class="firmas"><div></div><div></div></div>
<p style="font-size:10px">La firma implica la aceptación del presupuesto, exclusiones y condiciones. Datos tratados conforme al RGPD.</p>
</body></html>`);
  w.document.close();
  /* #7 mejoras2: sin <script> inline (la ventana hereda la CSP del opener);
     imprimimos desde aquí una vez pintado el documento */
  setTimeout(()=>{ try{ w.focus(); w.print(); }catch(e){} },350);
}

/* ============================ descarga / envío ============================ */
let LAST_URL=null;
async function pdfDownload(){ busy(true);
  try{ const doc=await buildPDF(); doc.save(fname());
    if(idv('f-doc-tipo')==='factura') commitFactura();   /* #37 */
    else if(!window.__PDF_INTERNO) marcarEnviadoSiProcede();  /* #8 mejoras */
  }
  catch(e){ console.error(e); fallbackPrint(); }
  finally{ busy(false); window.__PDF_INTERNO=false; } }
function askTipoPDF(){ const m=$('#modal-tipo'); if(m) m.classList.add('show'); }
function dlTipo(tipo){ const m=$('#modal-tipo'); if(m) m.classList.remove('show');
  window.__PDF_INTERNO=(tipo==='interno');            /* #7 mejoras */
  setField('f-doc-tipo',(tipo==='interno')?'presupuesto':tipo);
  if(tipo==='factura'&&!/^(FE|FA)-/.test(idv('f-num')))   /* #4 mejoras2: serie correlativa FE-año */
    setField('f-num',nextNum('FE'));
  Store.commit(); pdfDownload(); }
async function pdfPreview(){ busy(true);
  try{ const doc=await buildPDF();
    if(LAST_URL) URL.revokeObjectURL(LAST_URL);
    LAST_URL=URL.createObjectURL(doc.output('blob'));
    $('#pdf-frame').src=LAST_URL; $('#modal').classList.add('show');
  }catch(e){ console.error(e); fallbackPrint(); }
  finally{ busy(false); } }
/* #41: envío por email / Web Share API */
async function sharePDF(){
  const r=calc();
  const resumen=`Presupuesto ${idv('f-num')} ${idv('f-ver')} — ${idv('f-cli-nombre')||'cliente'} — TOTAL: ${money(r.total)}`;
  try{
    const doc=await buildPDF();
    const blob=doc.output('blob');
    const file=new File([blob],fname(),{type:'application/pdf'});
    if(navigator.canShare&&navigator.canShare({files:[file]})){
      await navigator.share({files:[file],title:resumen,text:resumen});
      if(idv('f-doc-tipo')==='factura') commitFactura();
      else marcarEnviadoSiProcede();                   /* #8 mejoras */
      return;
    }
  }catch(e){ /* sin soporte o cancelado: caer a mailto */ }
  const mail=idv('f-cli-mail');
  const url='mailto:'+(mail?encodeURIComponent(mail):'')+
    '?subject='+encodeURIComponent('Presupuesto '+idv('f-num')+' — '+idv('f-inst-nombre'))+
    '&body='+encodeURIComponent(resumen+'\n\nGenera el PDF con el botón «Descargar PDF» y adjúntalo a este correo.');
  window.location.href=url;
}

/* ============================ exportaciones ============================ */
function downloadBlob(content,name,type){
  const b=new Blob(['\ufeff'+content],{type});
  const u=URL.createObjectURL(b);
  const a=document.createElement('a'); a.href=u; a.download=name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(u),4000);
}
/* ---- esquema JSON legible por IA (ampliado #13) ---- */
function buildAISchema(){
  const ivaChk=document.querySelector('input[name=iva]:checked');
  const dd={
    numero:idv('f-num'), version:idv('f-ver'), fecha:idv('f-fecha'),
    tipo_obra:$('#f-tipo').selectedOptions?$('#f-tipo').selectedOptions[0].textContent:'',
    superficie_m2:num('f-m2'),
    uso_previsto:$('#f-uso')?$('#f-uso').value:'',
    validez:$('#f-validez').selectedOptions?$('#f-validez').selectedOptions[0].textContent:'',
    forma_pago:$('#f-pago').selectedOptions?$('#f-pago').selectedOptions[0].textContent:'',
    coeficiente_dificultad:parseFloat($('#f-coef').value)||1,
    margen_materiales_pct:num('f-margen'),
    plazo_instalacion:idv('f-plazoA'), plazo_albanileria:idv('f-plazoB'),
    iva_porcentaje:ivaChk?parseFloat(ivaChk.value):10,
    iva_mixto:!!(document.getElementById('f-iva-mixto')&&document.getElementById('f-iva-mixto').checked),
    iva_parte_10_pct:num('f-iva-p10'),
    descuento:{valor:num('f-desc-val'),tipo:$('#f-desc-tipo').value},
    tipo_documento:$('#f-doc-tipo').value
  };
  const emi={nombre:idv('f-inst-nombre'),direccion:idv('f-inst-pob'),nif:idv('f-inst-nif'),
    telefono:idv('f-inst-tel'),email:idv('f-inst-mail'),
    numero_autorizacion_RIIA:idv('f-inst-aut'),seguro_rc:idv('f-inst-rc')};
  const cli={nombre:idv('f-cli-nombre'),nif:idv('f-cli-nif'),direccion_obra:idv('f-cli-dir'),
    municipio:idv('f-cli-mun'),provincia:idv('f-cli-prov'),comunidad_autonoma:idv('f-cli-ccaa'),
    ref_catastral:idv('f-cli-cat'),poblacion:idv('f-cli-pob'),telefono:idv('f-cli-tel'),email:idv('f-cli-mail')};
  const por_unidades={};
  GRUPOS.forEach(g=>g.partidas.forEach(p=>{
    const f=document.querySelector(`.partida[data-id="${p.id}"] [data-free]`);
    por_unidades[p.id]={concepto:p.name,unidad:p.unit,cantidad:pQty(p.id),
      precio_libre:(f&&(parseFloat(f.value)||0))||null,
      precio_referencia:(p.refp!=null?p.refp:null)};
  }));
  const alb={precio_hora:num('f-alb-tarifa'),horas:{},
    material_auxiliar:num('f-alb-mat'),maquinas:num('f-alb-maq'),
    andamio:num('f-alb-e1'),retirada_residuos:num('f-alb-e2')};
  ALBROWS.forEach(a=>{ alb.horas[a.id]={concepto:a.name||a.id,horas:a.h||0}; });   /* #8 mejoras2: memoria */
  const libres=LIBRES.map(L=>({grupo:L.g||null,concepto:L.n||'',precio:L.p||0,cantidad:L.q||0}));
  return {esquema:'presupuesto-electrico-ia-v1',
    datos_generales:dd, emisor:emi, cliente:cli,
    partidas_por_unidades:por_unidades,
    albanileria:alb, partidas_libres:libres};
}
function importAI(d){
  /* #8 mejoras2 (fase 2): setField escribe DOM+memoria — antes los valores
     importados no entraban en getState() hasta que alguien tecleaba */
  const set=(id,v)=>{ if(v!=null&&v!=='') setField(id,v); };
  const dd=d.datos_generales||d.datos_presupuesto||{};
  set('f-num',dd.numero); set('f-ver',dd.version); set('f-fecha',dd.fecha);
  setSelByText('f-tipo',dd.tipo_obra); set('f-m2',dd.superficie_m2);
  if(dd.uso_previsto) setSelByText('f-uso',dd.uso_previsto);
  setSelByText('f-validez',dd.validez); setSelByText('f-pago',dd.forma_pago);
  set('f-coef',dd.coeficiente_dificultad);
  set('f-margen',dd.margen_materiales_pct);
  set('f-plazoA',dd.plazo_instalacion||dd.plazo_presupuesto_A);
  set('f-plazoB',dd.plazo_albanileria||dd.plazo_presupuesto_B);
  if(dd.iva_porcentaje!=null){ const pct=parseFloat(String(dd.iva_porcentaje).replace('%','').replace(',','.'));
    const iv=[...document.querySelectorAll('input[name=iva]')].find(x=>parseFloat(x.value)===pct);
    if(iv){ iv.checked=true; } }
  if(dd.descuento&&dd.descuento.valor!=null){ set('f-desc-val',dd.descuento.valor);
    setSelByText('f-desc-tipo',dd.descuento.tipo||'%'); }
  if(dd.tipo_documento) set('f-doc-tipo',dd.tipo_documento);
  const emi=d.emisor||{};
  set('f-inst-nombre',emi.nombre); set('f-inst-pob',emi.direccion); set('f-inst-nif',emi.nif);
  set('f-inst-tel',emi.telefono); set('f-inst-mail',emi.email);
  set('f-inst-aut',emi.numero_autorizacion_RIIA||emi.riia); set('f-inst-rc',emi.seguro_rc);
  const cli=d.cliente||{};
  set('f-cli-nombre',cli.nombre); set('f-cli-nif',cli.nif);
  set('f-cli-dir',cli.direccion_obra||cli.direccion); set('f-cli-mun',cli.municipio);
  set('f-cli-prov',cli.provincia); set('f-cli-ccaa',cli.comunidad_autonoma);
  set('f-cli-cat',cli.ref_catastral); set('f-cli-pob',cli.poblacion);
  set('f-cli-tel',cli.telefono); set('f-cli-mail',cli.email);
  Object.entries(d.partidas_por_unidades||{}).forEach(([id,v])=>{
    if(!v||typeof v!=='object') return;
    const box=document.querySelector(`.partida[data-id="${id}"]`); if(!box) return;
    const q=box.querySelector('[data-qty]'); if(q&&v.cantidad!=null){ q.value=v.cantidad; fieldSync(q); }
    const f=box.querySelector('[data-free]'); if(f&&v.precio_libre){ f.value=v.precio_libre; fieldSync(f); } });
  /* compat: esquemas antiguos con importes directos.
     En tubo/cable por metros (refp) un importe total no puede convertirse a metros → partida libre */
  const compatLib=[];
  Object.entries(d.canalizaciones_importe_directo||{}).forEach(([id,v])=>{
    if(!v||typeof v!=='object'||!(parseFloat(v.importe_eur)>0)) return;
    const box=document.querySelector(`.partida[data-id="${id}"]`); if(!box) return;
    const P=PART_BY_ID[id];
    if(P&&P.refp!=null){ compatLib.push({n:P.name+' (importe esquema antiguo)',p:parseFloat(v.importe_eur),q:1}); return; }
    const q=box.querySelector('[data-qty]'); if(q){ q.value=1; fieldSync(q); }
    const f=box.querySelector('[data-free]'); if(f){ f.value=v.importe_eur; fieldSync(f); } });
  const al=d.albanileria||{};
  /* #8 mejoras2 (fase 1): el precio/hora se aplica en ALBROWS (memoria) y se
     repinta desde ella — antes se pisaban los inputs del DOM a mano */
  if(al.precio_hora){ set('f-alb-tarifa',al.precio_hora);
    ALBROWS.forEach(a=>{ a.p=al.precio_hora; }); }
  set('f-alb-mat',al.material_auxiliar);
  set('f-alb-maq',al.maquinas); set('f-alb-e1',al.andamio); set('f-alb-e2',al.retirada_residuos);
  if(al.horas&&Object.keys(al.horas).length){
    ALBROWS=Object.entries(al.horas).map(([id,v])=>({
      id, name:(v&&v.concepto)||id, h:(v&&parseFloat(v.horas))||0, p:al.precio_hora||28 }));
  }
  renderAlb();
  if((Array.isArray(d.partidas_libres)&&d.partidas_libres.length)||compatLib.length){
    LIBRES=(Array.isArray(d.partidas_libres)?d.partidas_libres:[])
      .map(L=>({g:L.grupo||null,n:L.concepto||'',p:L.precio||0,q:L.cantidad||0})).concat(compatLib);
    renderLibres();
  }
  repriceChips(); calc(); Store.commit();
}
function jsonExport(){
  downloadBlob(JSON.stringify({app:'presupuesto-electrico-pro',v:3,
    meta:{num:idv('f-num'),ver:idv('f-ver'),fecha:idv('f-fecha'),cliente:idv('f-cli-nombre'),total:money(calc().total)},
    ia:buildAISchema(), state:getState()},null,2),fname('json'),'application/json');
}
/* #15: importación con validación y previsualización antes de aplicar */
function validaEsquemaIA(d){
  const errs=[];
  const dd=d.datos_generales||d.datos_presupuesto||{};
  if(!d.esquema&&!d.ia&&!dd&&!d.partidas_por_unidades&&!d.canalizaciones_importe_directo)
    errs.push('No se reconoce la estructura del esquema (faltan datos_generales / partidas).');
  const pu=d.partidas_por_unidades||{}, di=d.canalizaciones_importe_directo||{};
  const nP=Object.keys(pu).length+Object.keys(di).length;
  if(!nP) errs.push('El esquema no trae ninguna partida.');
  const ids=GRUPOS.flatMap(g=>g.partidas).map(p=>p.id);
  const desconocidas=[...Object.keys(pu),...Object.keys(di)].filter(id=>!ids.includes(id));
  if(desconocidas.length) errs.push('Partidas desconocidas (se ignorarán): '+desconocidas.join(', '));
  return {ok:errs.length===0,errs:errs,nPartidas:nP,
    num:dd.numero||'—',cliente:(d.cliente&&d.cliente.nombre)||'—'};
}
function jsonImport(file){
  const rd=new FileReader();
  rd.onload=()=>{ try{
      const d=JSON.parse(String(rd.result));
      const esIA=d.ia||d.datos_generales||d.partidas_por_unidades||d.canalizaciones_importe_directo;
      if(esIA){
        /* previsualización con validación (#15) */
        const data=d.ia||d;
        const v=validaEsquemaIA(data);
        const box=$('#imp-preview'); if(!box){ importAI(data); return; }
        box.innerHTML='<b>Esquema IA detectado</b>'+
          `<table class="mini-table"><tbody>
            <tr><td>Nº documento</td><td style="text-align:right">${esc(v.num)}</td></tr>
            <tr><td>Cliente</td><td style="text-align:right">${esc(v.cliente)}</td></tr>
            <tr><td>Partidas</td><td style="text-align:right">${v.nPartidas}</td></tr>
          </tbody></table>`+
          (v.errs.length?'<ul style="font-size:.8rem;color:var(--warn);margin:6px 0;padding-left:18px">'+
            v.errs.map(e=>`<li>${esc(e)}</li>`).join('')+'</ul>':'<p class="hint" style="margin:6px 0 0">Esquema válido. Se sustituirán los datos actuales del formulario.</p>');
        window.__IMPORT_PENDING=data;
        $('#modal-import').classList.add('show');
      }else{ const st=d.state||d;
        if(!st.vals) throw new Error('formato');
        Store.apply(st); LOADING=false; Store.commit();
        toast('Presupuesto importado correctamente.','ok'); }
    }catch(e){ toast('El archivo JSON no es válido.','err'); } };
  rd.readAsText(file);
}
