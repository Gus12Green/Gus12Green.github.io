self.addEventListener('install', e => {
  e.waitUntil(
    caches.open('fft-v1').then(c => c.addAll([
      './',
      './index.html',
      './manifest.webmanifest',
      './icon-192.png',
      './icon-512.png'
    ]))
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
