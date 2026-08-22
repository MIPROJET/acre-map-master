// AcreMap Service Worker — hors ligne complet (app shell + assets + tuiles) + notifications
const CACHE = "acremap-v5";
const TILE_CACHE = "acremap-tiles-v1";
const SHELL = ["/", "/login", "/app", "/manifest.webmanifest", "/favicon.png", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u)))).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE && k !== TILE_CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

function isTile(url) {
  return /tile\.openstreetmap|arcgisonline|tile\.thunderforest|stamen|esri|basemaps|googleapis\.com\/maps|mt[0-9]\.google/.test(url.hostname + url.pathname);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // 0) Jamais de cache pour les appels serveur / API / Supabase (auth, données live)
  if (
    url.pathname.startsWith("/_serverFn") ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/.mcp") ||
    /supabase\.co$/.test(url.hostname)
  ) {
    return;
  }

  // 1) Tuiles cartographiques : cache-first, persistant (utilisation hors ligne sur le terrain)
  if (isTile(url)) {
    event.respondWith(
      caches.open(TILE_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const res = await fetch(req);
          if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
          return res;
        } catch {
          return cached || Response.error();
        }
      })
    );
    return;
  }

  // 2) Navigations : réseau puis repli sur l'app shell mise en cache
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          const c = await caches.open(CACHE);
          c.put(req, res.clone()).catch(() => {});
          return res;
        } catch {
          const c = await caches.open(CACHE);
          return (await c.match(req)) || (await c.match("/app")) || (await c.match("/")) || Response.error();
        }
      })()
    );
    return;
  }

  // 3) Assets même origine (JS/CSS/images/polices) : stale-while-revalidate
  if (url.origin === self.location.origin) {
    event.respondWith(
      (async () => {
        const c = await caches.open(CACHE);
        const cached = await c.match(req);
        const network = fetch(req)
          .then((res) => { if (res && res.ok) c.put(req, res.clone()).catch(() => {}); return res; })
          .catch(() => null);
        return cached || (await network) || Response.error();
      })()
    );
    return;
  }

  // 4) Polices / CDN externes : cache-first
  if (/fonts\.googleapis\.com|fonts\.gstatic\.com|unpkg\.com|cdn\.jsdelivr\.net/.test(url.hostname)) {
    event.respondWith(
      (async () => {
        const c = await caches.open(CACHE);
        const cached = await c.match(req);
        if (cached) return cached;
        try {
          const res = await fetch(req);
          if (res && (res.ok || res.type === "opaque")) c.put(req, res.clone()).catch(() => {});
          return res;
        } catch {
          return Response.error();
        }
      })()
    );
  }
});

// Pré-chargement de tuiles demandé par la page (zone de travail → utilisation hors ligne)
self.addEventListener("message", (event) => {
  const data = event.data || {};

  if (data.type === "prefetch-tiles" && Array.isArray(data.urls)) {
    event.waitUntil(
      caches.open(TILE_CACHE).then(async (cache) => {
        let done = 0;
        for (const u of data.urls.slice(0, 4000)) {
          try {
            if (!(await cache.match(u))) {
              const res = await fetch(u, { mode: "no-cors" });
              if (res) await cache.put(u, res.clone());
            }
            done++;
          } catch { /* réseau indisponible → on continue */ }
        }
        const clients = await self.clients.matchAll({ includeUncontrolled: true });
        clients.forEach((c) => c.postMessage({ type: "prefetch-tiles-done", done, total: data.urls.length }));
      })
    );
    return;
  }

  if (data.type === "show-notification") {
    self.registration.showNotification(data.title || "AcreMap", {
      body: data.body || "",
      tag: data.tag,
      icon: "/icon-192.png",
      badge: "/favicon.png",
      requireInteraction: true,
      vibrate: [300, 100, 300, 100, 500],
      data: data.data || {},
    });
  }
});

self.addEventListener("push", (event) => {
  let payload = { title: "AcreMap", body: "Nouvelle notification", tag: "acremap", data: {} };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {}
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      icon: "/icon-192.png",
      badge: "/favicon.png",
      requireInteraction: true,
      vibrate: [300, 100, 300, 100, 500],
      data: payload.data,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/app";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if ("focus" in c) { c.navigate(targetUrl); return c.focus(); }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
