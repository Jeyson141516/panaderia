/* ============================================================
   Service Worker — Panadería Familiar
   ------------------------------------------------------------
   Estrategia de caché:
   - Navegaciones (HTML): red primero, caché como respaldo offline.
   - Assets locales (css/js): stale-while-revalidate: se sirve la
     copia en caché al instante y se actualiza en segundo plano.
   - CDN de Firebase (gstatic) y Google Fonts: caché primero, red
     como respaldo, para evitar peticiones repetidas.
   Al cambiar CACHE_VERSION se limpian las cachés antiguas.
   ============================================================ */
const CACHE_VERSION = 'panaderia-v3';
const CACHE_RUNTIME = 'panaderia-runtime';

const PRECACHE = [
    './',
    './index.html',
    './inventario.html',
    './personal.html',
    './reportes.html',
    './reporte-impresion.html',
    './personal-impresion.html',
    './login.html',
    './css/style.css',
    './js/config.js',
    './js/firebase-config.js',
    './js/auth.js',
    './js/theme.js',
    './js/session.js',
    './js/utils.js',
    './js/ui.js',
    './js/login.js',
    './js/ventas.js',
    './js/inventario.js',
    './js/personal.js',
    './js/reportes.js',
    './js/reporte-impresion.js',
    './js/personal-impresion.js'
];

self.addEventListener('install', (evento) => {
    evento.waitUntil(
        caches.open(CACHE_VERSION)
            .then((cache) => Promise.all(
                PRECACHE.map((ruta) => cache.add(ruta).catch(() => {}))
            ))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (evento) => {
    evento.waitUntil(
        caches.keys()
            .then((claves) => Promise.all(
                claves.filter((c) => c !== CACHE_VERSION && c !== CACHE_RUNTIME)
                    .map((c) => caches.delete(c))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (evento) => {
    const { request } = evento;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    const mismoOrigen = url.origin === self.location.origin;

    // Navegaciones: red primero (contenido fresco), caché como respaldo offline.
    if (mismoOrigen && request.mode === 'navigate') {
        evento.respondWith(
            fetch(request)
                .then((respuesta) => {
                    const copia = respuesta.clone();
                    caches.open(CACHE_VERSION).then((cache) => cache.put(request, copia));
                    return respuesta;
                })
                .catch(() =>
                    caches.match(request).then((enCache) => enCache || caches.match('./index.html'))
                )
        );
        return;
    }

    // Assets locales: stale-while-revalidate (respuesta instantánea + refresco).
    if (mismoOrigen) {
        evento.respondWith(
            caches.match(request).then((enCache) => {
                const refresco = fetch(request)
                    .then((respuesta) => {
                        if (respuesta && respuesta.ok) {
                            const copia = respuesta.clone();
                            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copia));
                        }
                        return respuesta;
                    })
                    .catch(() => enCache);
                return enCache || refresco;
            })
        );
        return;
    }

    // CDN de Firebase y Google Fonts: caché primero, red como respaldo.
    if (url.hostname === 'www.gstatic.com' || url.hostname.endsWith('gstatic.com') || url.hostname.endsWith('googleapis.com')) {
        evento.respondWith(
            caches.open(CACHE_RUNTIME).then((cache) =>
                cache.match(request).then((enCache) =>
                    enCache ||
                    fetch(request).then((respuesta) => {
                        if (respuesta && respuesta.ok) cache.put(request, respuesta.clone());
                        return respuesta;
                    }).catch(() => enCache)
                )
            )
        );
    }
});
