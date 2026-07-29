/*
 * 株価チャート用の時系列プロキシ (Vercel Serverless Function)
 * Yahoo Finance の chart API から期間ぶんの終値を取り、間引いてJSONで返す。
 *
 * 注: 現在値を返す api/quote.js と同じ非公式エンドポイントだが、crumb不要で動く系統。
 * 方針(CLAUDE.md): 返すのは日付と終値という事実のみ。騰落の判定・色分けはしない。
 */

const YF_BASE = process.env.YAHOO_BASE_URL || "https://query1.finance.yahoo.com";
const SYMBOL_RE = /^[A-Za-z0-9][A-Za-z0-9.\-^]{0,11}$/;

// 期間 → Yahooのrange/interval。長期ほど粗い足にして転送量を抑える
const RANGES = {
  "1mo": { range: "1mo", interval: "1d" },
  "3mo": { range: "3mo", interval: "1d" },
  "6mo": { range: "6mo", interval: "1d" },
  "1y":  { range: "1y",  interval: "1d" },
  "3y":  { range: "3y",  interval: "1wk" },
  "5y":  { range: "5y",  interval: "1wk" },
};
const MAX_POINTS = 160; // これ以上は等間隔で間引く(折れ線の見た目は変わらない)

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
  const symbol = String(url.searchParams.get("symbol") || "").trim();
  const rangeKey = String(url.searchParams.get("range") || "1y").trim();
  if (!SYMBOL_RE.test(symbol)) return send(res, 400, { error: "symbolが不正です（例: 7203.T / RKLB）" });
  const cfg = RANGES[rangeKey];
  if (!cfg) return send(res, 400, { error: "rangeが不正です（1mo/3mo/6mo/1y/3y/5y）" });

  try {
    const upstream = await fetch(
      `${YF_BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${cfg.interval}&range=${cfg.range}`,
      { headers: { "User-Agent": "Mozilla/5.0 (compatible; kabu-dex/1.0; personal use)", Accept: "application/json" } }
    );
    if (upstream.status === 404) return send(res, 404, { error: "この銘柄の株価データが見つかりません", symbol });
    if (!upstream.ok) return send(res, 502, { error: `取得失敗 (${upstream.status})` });

    const data = await upstream.json();
    const result = data && data.chart && Array.isArray(data.chart.result) ? data.chart.result[0] : null;
    const meta = result && result.meta ? result.meta : null;
    const ts = result && Array.isArray(result.timestamp) ? result.timestamp : [];
    const quote = result && result.indicators && Array.isArray(result.indicators.quote) ? result.indicators.quote[0] : null;
    const closes = quote && Array.isArray(quote.close) ? quote.close : [];
    if (!meta || ts.length === 0 || closes.length === 0) {
      return send(res, 404, { error: "この銘柄の株価データが見つかりません", symbol });
    }

    // 欠損(休場でnullになる)を落としてから等間隔に間引く
    const pairs = [];
    for (let i = 0; i < ts.length; i++) {
      const c = closes[i];
      if (typeof c === "number" && Number.isFinite(c)) {
        pairs.push([new Date((ts[i] + (meta.gmtoffset || 0)) * 1000).toISOString().slice(0, 10), Math.round(c * 100) / 100]);
      }
    }
    if (pairs.length === 0) return send(res, 404, { error: "この銘柄の株価データが見つかりません", symbol });

    let points = pairs;
    if (pairs.length > MAX_POINTS) {
      const step = pairs.length / MAX_POINTS;
      points = [];
      for (let k = 0; k < MAX_POINTS; k++) points.push(pairs[Math.floor(k * step)]);
      if (points[points.length - 1][0] !== pairs[pairs.length - 1][0]) points.push(pairs[pairs.length - 1]); // 最新は必ず残す
    }

    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=21600");
    return send(res, 200, {
      symbol: meta.symbol || symbol,
      currency: meta.currency || (symbol.endsWith(".T") ? "JPY" : "USD"),
      range: rangeKey,
      points,
      source: "Yahoo Finance（遅延）",
    });
  } catch (e) {
    return send(res, 502, { error: "株価サーバーへの接続に失敗しました" });
  }
}
