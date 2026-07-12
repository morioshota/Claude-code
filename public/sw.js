/* KABU DEX Service Worker
   目的: ホーム画面アプリ(PWA)としてオフラインでも図鑑を開けるようにする。
   方針:
   - ページ本体(navigate)はネットワーク優先: デプロイ直後も最新のindex.htmlを取りに行き、
     オフライン時だけキャッシュにフォールバックする(古いバンドルを掴み続けない)
   - ハッシュ付きアセット(js/css等)はstale-while-revalidate: 即表示しつつ裏で更新
   - /api/ (株価・AI)は一切キャッシュしない(常に生データ) */

const CACHE = "kabu-dex-v1";

// インストール時にindex.htmlと、そこから参照されるアセット(js/css/アイコン)を
// プリキャッシュする。これをしないと「初回訪問のリソースはSW有効化前に読まれて
// キャッシュに入らない」ため、初回訪問後のオフライン起動が失敗する
self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    try {
      const res = await fetch("/", { cache: "no-cache" });
      await c.put("/__index", res.clone());
      const html = await res.text();
      const urls = [...html.matchAll(/(?:src|href)="(\/[^"]+)"/g)].map((m) => m[1]);
      await Promise.all(urls.map(async (u) => {
        try {
          const r = await fetch(u);
          if (r.ok) await c.put(u, r);
        } catch (err) { /* 個別失敗は無視(次回のSWRで拾う) */ }
      }));
    } catch (err) { /* オフラインインストール等。次のfetchで埋まる */ }
    await self.skipWaiting(); // 新しいSWをすぐ有効化(バンドルはハッシュ付きなので安全)
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // 株価等はキャッシュしない

  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("/__index", copy));
          return res;
        })
        .catch(() => caches.match("/__index", { ignoreVary: true }))
    );
    return;
  }

  // ignoreVary: プリキャッシュ(Originヘッダなし)とモジュールスクリプト(CORS=Originあり)で
  // Varyの一致判定が外れてオフライン時にキャッシュを引けなくなるのを防ぐ
  e.respondWith(
    caches.match(e.request, { ignoreVary: true }).then((hit) => {
      const refetch = fetch(e.request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || refetch;
    })
  );
});
