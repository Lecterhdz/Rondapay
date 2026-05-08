// sw.js - Service Worker para RondaPay PWA
const CACHE_NAME = 'rondapay-v2'; // ✅ Incrementar versión para forzar update

// Archivos a cachear (paths RELATIVOS desde la raíz del repo)
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './manifest.json'
  // ❌ NO incluir icon-192.png si usas SVG embebido en manifest
];

// Install: cachear assets estáticos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('✅ SW: Cacheando assets', ASSETS);
        return cache.addAll(ASSETS);
      })
      .catch((err) => {
        console.warn('⚠️ SW: Algunos assets no se cachearon', err);
        // No fallar la instalación si un asset opcional falla
      })
  );
  // Activar nuevo SW inmediatamente
  self.skipWaiting();
});

// Activate: limpiar caches antiguos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: estrategia Network-First con fallback a cache
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Ignorar requests de otros orígenes (CDN, APIs externas)
  if (url.origin !== location.origin) {
    event.respondWith(fetch(request));
    return;
  }
  
  // Estrategia: Network-First para HTML/JS/CSS, Cache-First para assets
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request).then((response) => {
        // Actualizar cache si la respuesta es válida
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      }).catch(() => cached); // Fallback a cache si offline
      
      return cached || fetchPromise;
    })
  );
});

// Mensajería para skipWaiting desde la app
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
