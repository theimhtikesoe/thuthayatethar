const SHELL_CACHE = "thuthayatethar-shell-v2";
const BOOK_CACHE = "thuthayatethar-books-v2";
const SHELL = ["/", "/manifest.webmanifest", "/logo.svg", "/icon.svg", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png", "/pdf.worker.min.js"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== SHELL_CACHE && key !== BOOK_CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
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
  if (url.pathname === "/api/catalog") {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request.url, response.clone());
        return response;
      } catch { return (await cache.match(request.url)) || new Response(JSON.stringify({ ok: false, books: [] }), { headers: { "content-type": "application/json" } }); }
    })());
    return;
  }
  if (url.origin === self.location.origin && ["/pdf.worker.min.js"].includes(url.pathname)) {
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
  if (url.origin === self.location.origin && (url.pathname === "/" || url.pathname === "/admin")) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch { return (await cache.match(request)) || (await cache.match("/")) || new Response("Offline", { status: 503 }); }
    })());
  }
});
