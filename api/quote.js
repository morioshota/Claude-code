/*
 * 株価取得プロキシ (Vercel Serverless Function)
 * stooq.com の無料遅延データ(CSV)をJSONに変換して返す。
 * ブラウザから直接stooqを叩けない(CORS)ため同一オリジンで中継する。
 *
 * 方針(CLAUDE.md): 表示のみ・推奨なし。事実(価格・日時)だけを返す。
 * stooqのデータは個人利用向け。エッジキャッシュ(10分)で取得回数を抑える。
 */

const STOOQ_BASE = process.env.STOOQ_BASE_URL || "https://stooq.com";
const SYMBOL_RE = /^[0-9a-z]{1,8}\.(jp|us)$/;

const send = (res, status, body) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") { res.statusCode = 204; res.end(); return; }
  if (req.method !== "GET") return send(res, 405, { error: "GETのみ" });

  const url = new URL(req.url, "http://localhost");
  const symbol = String(url.searchParams.get("symbol") || "").toLowerCase();
  if (!SYMBOL_RE.test(symbol)) {
    return send(res, 400, { error: "symbolが不正です（例: 1721.jp / rklb.us）" });
  }

  try {
    const upstream = await fetch(
      `${STOOQ_BASE}/q/l/?s=${encodeURIComponent(symbol)}&f=sd2t2ohlcv&h&e=csv`,
      { headers: { "User-Agent": "kabu-dex/1.0 (personal use)" } }
    );
    if (!upstream.ok) return send(res, 502, { error: `取得失敗 (${upstream.status})` });
    const csv = await upstream.text();

    // 形式: Symbol,Date,Time,Open,High,Low,Close,Volume / 未知の銘柄はN/D
    const lines = csv.trim().split("\n");
    const row = lines[1] ? lines[1].split(",") : [];
    const [sym, date, time, open, high, low, close, volume] = row.map((s) => (s || "").trim());
    if (!close || close === "N/D") {
      return send(res, 404, { error: "この銘柄の株価データが見つかりません", symbol });
    }

    // Vercelエッジで10分キャッシュ(全ユーザー共有)。stooqへの負荷と取得回数を抑える
    res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=1800");
    return send(res, 200, {
      symbol: sym.toLowerCase(),
      close: Number(close),
      open: open === "N/D" ? null : Number(open),
      high: high === "N/D" ? null : Number(high),
      low: low === "N/D" ? null : Number(low),
      volume: volume === "N/D" ? null : Number(volume),
      date, // 例: 2026-07-03 (現地日付)
      time, // 例: 15:30:00
      currency: symbol.endsWith(".jp") ? "JPY" : "USD",
      source: "stooq (遅延データ)",
    });
  } catch (e) {
    return send(res, 502, { error: "株価サーバーへの接続に失敗しました" });
  }
}
