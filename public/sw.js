const CACHE='mould-shell-v4';
self.addEventListener('install',event=>{self.skipWaiting();event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(['/','/mapel-icon-192.png','/mapel-icon-512.png','/mapel-icon-180.png','/manifest.webmanifest'])));});
self.addEventListener('activate',event=>event.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('mould-shell-')&&key!==CACHE).map(key=>caches.delete(key))))])));
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin||['localhost','127.0.0.1'].includes(url.hostname))return;
 if(url.pathname.startsWith('/_next/static/'))event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{if(response.ok&&response.headers.get('cache-control')?.includes('immutable')){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,copy)));}return response;})));
 else if(request.mode==='navigate')event.respondWith(fetch(request).catch(()=>caches.match('/')));
});
