// Keep user-downloaded books independent from deploy-specific app-shell caches.
// A new Vercel build may replace the shell, but must not make users download
// every saved PDF again.
const SHELL_CACHE = "thuthayatethar-shell-v7";
const BOOK_CACHE = "thuthayatethar-books";
const CATALOG_CACHE = "thuthayatethar-catalog-v2";
const BOOK_WORKER_ORIGIN = "https://thuthayatethar-telegram-ingestion.hlah3894.workers.dev";
const SHELL = ["/", "/manifest.webmanifest", "/logo.svg", "/icon.svg", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png", "/pdf.worker.min.js", "/covers/tian-guan-ci-fu.webp"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const stableBooks = await caches.open(BOOK_CACHE);
    for (const key of keys.filter((name) => name.startsWith("thuthayatethar-books-") && name !== BOOK_CACHE)) {
      const oldBooks = await caches.open(key);
      for (const request of await oldBooks.keys()) {
        const response = await oldBooks.match(request);
        if (response && !(await stableBooks.match(request))) await stableBooks.put(request, response);
      }
    }
    await Promise.all(keys.filter((key) => key !== SHELL_CACHE && key !== BOOK_CACHE && key !== CATALOG_CACHE && !key.startsWith("thuthayatethar-books-")).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  const isAppNavigation = request.mode === "navigate" && url.origin === self.location.origin;
  const isExternalBookAsset = url.origin === BOOK_WORKER_ORIGIN && /^\/book\/[^/]+\/(?:pdf|cover)$/.test(url.pathname);
  // Catalog responses include SoundCloud URLs and remain available offline;
  // book covers use the book-asset cache below. SoundCloud audio itself is a
  // licensed third-party stream and is intentionally never cached here.
  if (url.hostname === "w.soundcloud.com" || url.hostname === "soundcloud.com" || url.hostname === "on.soundcloud.com") return;
  if (isExternalBookAsset) {
    event.respondWith((async () => {
      const cache = await caches.open(BOOK_CACHE);
      const cached = await cache.match(request.url);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok && !(url.pathname.endsWith("/pdf") && request.headers.has("range"))) {
          await cache.put(request.url, response.clone());
        }
        return response;
      } catch { return cached || new Response("Offline", { status: 503 }); }
    })());
    return;
  }
  if (url.pathname.startsWith("/api/books/") && url.pathname.endsWith("/pdf")) {
    event.respondWith((async () => {
      const cache = await caches.open(BOOK_CACHE);
      const cached = await cache.match(request.url);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok && !request.headers.has("range")) await cache.put(request.url, response.clone());
        return response;
      } catch { return cached || new Response("Offline", { status: 503 }); }
    })());
    return;
  }
  if (url.pathname.startsWith("/api/books/") && url.pathname.endsWith("/cover")) {
    event.respondWith((async () => {
      const cache = await caches.open(BOOK_CACHE);
      const cached = await cache.match(request.url);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request.url, response.clone());
        return response;
      } catch { return cached || new Response("Offline", { status: 503 }); }
    })());
    return;
  }
  if (url.pathname === "/api/soundcloud/cover") {
    event.respondWith((async () => {
      const cache = await caches.open(BOOK_CACHE);
      const cached = await cache.match(request.url);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok && response.headers.get("content-type")?.startsWith("image/")) {
          try { await cache.put(request.url, response.clone()); } catch { /* Keep the online cover if storage is full. */ }
        }
        return response;
      } catch { return cached || new Response("Offline", { status: 503 }); }
    })());
    return;
  }
  if (url.pathname === "/api/catalog") {
    event.respondWith((async () => {
      const cache = await caches.open(CATALOG_CACHE);
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(new Request(`${self.location.origin}/api/catalog`), response.clone());
        return response;
      } catch { return (await cache.match(`${self.location.origin}/api/catalog`)) || new Response(JSON.stringify({ ok: false, books: [] }), { headers: { "content-type": "application/json" } }); }
    })());
    return;
  }
  if (url.origin === self.location.origin && ["/pdf.worker.min.js", "/covers/tian-guan-ci-fu.webp"].includes(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })());
    return;
  }
  if (url.origin === self.location.origin && url.pathname.startsWith("/_next/static/")) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch { return (await cache.match(request)) || new Response("Offline", { status: 503 }); }
    })());
    return;
  }
  if (isAppNavigation && (url.pathname === "/" || url.pathname === "/admin")) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch {
        return (await cache.match(request)) || (await cache.match("/")) || new Response("Offline", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
      }
    })());
  }
});
