// App-shell cache for offline use. Bump CACHE when shipping changes.
// Only same-origin GET requests for app files are cached; video never touches the network.
// The MediaPipe bundle, wasm and model (vendor/, ~22 MB) are cached by the fetch handler the first
// time an analysis runs, not at install, to keep the first load light.
const CACHE = 'gait-shell-v6';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/config.js',
  './js/placeholder.js',
  './js/util.js',
  './js/engine/analysis.js',
  './js/engine/format.js',
  './js/engine/summary.js',
  './js/views/upload.js',
  './js/views/intake.js',
  './js/views/results.js',
  './js/views/analyzing.js',
  './js/pipeline/run.js',
  './js/pipeline/mp4.js',
  './js/pipeline/decode.js',
  './js/pipeline/pose.js',
  './js/pipeline/kinematics.js',
  './js/pipeline/stats.js',
  './js/pipeline/gate.js',
  './js/pipeline/strides.js',
  './js/pipeline/events.js',
  './js/pipeline/metrics.js',
  './js/pipeline/rear-events.js',
  './js/pipeline/emit.js',
  './js/pipeline/file-check.js',
  './js/pipeline/hip-anchor.js',
  './js/pipeline/posterior.js',
  './js/pipeline/measurements.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Stale-while-revalidate: serve from cache, refresh in the background.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== location.origin) return;
  // Never cache development pages or test clips (real client video).
  if (/\/(test|test-data)\//.test(url.pathname)) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request, { ignoreSearch: true });
      const network = fetch(request)
        .then((res) => {
          if (res.ok) cache.put(request, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
