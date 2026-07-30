const CACHE_NAME = "memory-garden-v18";
const APP_SHELL = [
  "/",
  "/index.html",
  "/styles.css?v=18",
  "/app.js?v=18",
  "/manifest.webmanifest",
  "/assets/sprites/tree-sheet.png",
  "/assets/sprites/bird-sheet.png",
  "/assets/sprites/plant-sheet.png",
  "/assets/sprites/garden-sheet.png",
  "/assets/sprites/plot-bed-v2.png",
  "/assets/sprites/ui-ornaments.png",
  "/assets/sprites/bird-perched.png",
  "/assets/sprites/wildflowers.png",
  "/assets/sprites/foliage-left.png",
  "/assets/sprites/foliage-right.png",
  "/assets/sprites/memory-garden-logo-v2.png",
  "/assets/sprites/garden-ground-v2.png",
  "/assets/sprites/memory-tree-v2.png",
  "/assets/sprites/tree-rings-v2.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (
          response.ok &&
          new URL(event.request.url).origin === self.location.origin
        ) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request)),
  );
});
