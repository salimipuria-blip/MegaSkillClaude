// Public legacy shell only. NEVER cache signed-in team pages, APIs, image blobs, or cross-origin requests.
const VERSION='viking-static-public-v4';
const PUBLIC=['/','/index.html','/manifest.webmanifest'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(PUBLIC)));self.skipWaiting()});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==VERSION).map(key=>caches.delete(key)))));self.clients.claim()});
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET'||new URL(request.url).origin!==self.location.origin)return;
 const pathname=new URL(request.url).pathname;
 if(pathname.startsWith('/team/'))return; // authenticated app uses network requests only
 if(!PUBLIC.includes(pathname))return;
 event.respondWith(fetch(request).then(response=>{
  if(response.ok&&response.type==='basic')event.waitUntil(caches.open(VERSION).then(cache=>cache.put(request,response.clone())));
  return response;
 }).catch(()=>caches.match(request)));
});