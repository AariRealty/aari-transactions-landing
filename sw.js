// Aari Transactions service worker
// Handles Web Push delivery and notification taps. Kept intentionally minimal:
// no offline caching yet, so it never serves a stale portal.
self.addEventListener('install', function(){ self.skipWaiting(); });
self.addEventListener('activate', function(event){ event.waitUntil(self.clients.claim()); });

self.addEventListener('push', function(event){
  var data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch(e){ data = { title: 'Aari Transactions', body: (event.data && event.data.text) ? event.data.text() : '' }; }
  var title = data.title || 'Aari Transactions';
  var opts = {
    body: data.body || '',
    icon: '/images/aari-icon-192.png',
    badge: '/images/aari-icon-192.png',
    tag: data.tag || 'aari',
    renotify: true,
    data: { url: data.url || '/tc-portal' }
  };
  event.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', function(event){
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || '/tc-portal';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list){
      for(var i = 0; i < list.length; i++){
        var c = list[i];
        // /tc-portal (Jul 30 clean URL) and /files.html (what it rewrites to,
        // still valid) are the same page — match either so an already-open tab
        // gets reused instead of opening a second one.
        if((c.url.indexOf('/files.html') !== -1 || c.url.indexOf('/tc-portal') !== -1) && 'focus' in c){
          try { c.navigate(url); } catch(e){}
          return c.focus();
        }
      }
      if(self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
