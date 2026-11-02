/* sw.js — Service Worker PWA (#49)
   Estrategia network-first: con red se sirve siempre la última versión y se
   refresca la caché; sin red se sirve la copia local (funcionamiento offline
   completo, los datos del usuario viven en localStorage/IndexedDB). */
'use strict';
const CACHE='presu-pro-v7';
const ASSETS=[
  './','./index.html','./manifest.webmanifest','./icons/icon.svg','./precios.json',
  './js/data.js','./js/pure.js','./js/calc.js','./js/pdf.js','./js/app.js',
];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).catch(()=>{}).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil(
    caches.keys()
      .then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;
  const url=new URL(e.request.url);
  if(url.origin!==self.location.origin) return;   // vendor CDN y fuentes: fuera
  e.respondWith(
    fetch(e.request).then(res=>{
      const copy=res.clone();
      caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{});
      return res;
    }).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html')))
  );
});
