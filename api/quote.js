/*
 * 株価取得プロキシ (Vercel Serverless Function)
 * Yahoo Finance の chart API から参考株価(遅延)を取得しJSONで返す。
 * ブラウザから直接叩けない(CORS)ため同一オリジンで中継する。
 *
 * 注: stooq.com はクラウド(Vercel)からのアクセスを弾く(404)ため、
 *     サーバー経由でも安定して動くYahoo Financeのエンドポイントに変更した。
 *
 * 方針(CLAUDE.md): 表示のみ・推奨なし。事実(価格・日時・出典)だけを返す。
 * Yahoo Financeは非公式エンドポイント。個人利用・表示目的での利用にとどめる。
 */

const YF_BASE = process.env.YAHOO_BASE_URL || "https://query1.finance.yahoo.com";
// Yahooシンボル: 7203.T / 186A.T(東証) / RKLB / BRK-B(米国)。/ や空白等は拒否
const SYMBOL_RE = /^[A-Za-z0-9][A-Za-z0-9.\-^]{0,11}$/;

const send = (res, status, body) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
};

// Unix秒(UTC) + 取引所のGMTオフセット秒 → 取引所ローカルの日付/時刻文字列
const localDateTime = (unixSec, gmtoffsetSec) => {
  const d = new Date((unixSec + (gmtoffsetSec || 0)) * 1000);
  const iso = d.toISOString(); // オフセット済みなのでUTC表記=現地表記になる
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") { res.statusCode = 204; res.end(); return; }
  if (req.method !== "GET") return send(res, 405, { error: "GETのみ" });

  const url = new URL(req.url, "http://localhost");
  const symbol = String(url.searchParams.get("symbol") || "").trim();
  if (!SYMBOL_RE.test(symbol)) {
    return send(res, 400, { error: "symbolが不正です（例: 7203.T / RKLB）" });
  }

  try {
    const upstream = await fetch(
      `${YF_BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
      {
        headers: {
          // 一部環境でUA無しだと弾かれるためブラウザ風UAを付与
          "User-Agent": "Mozilla/5.0 (compatible; kabu-dex/1.0; personal use)",
          "Accept": "application/json",
        },
      }
    );
    if (upstream.status === 404) {
      return send(res, 404, { error: "この銘柄の株価データが見つかりません", symbol });
    }
    if (!upstream.ok) return send(res, 502, { error: `取得失敗 (${upstream.status})` });

    const data = await upstream.json();
    const result = data && data.chart && Array.isArray(data.chart.result) ? data.chart.result[0] : null;
    const meta = result && result.meta ? result.meta : null;
    const price = meta && (meta.regularMarketPrice ?? meta.previousClose);
    if (!meta || typeof price !== "number") {
      return send(res, 404, { error: "この銘柄の株価データが見つかりません", symbol });
    }

    const { date, time } = localDateTime(meta.regularMarketTime || Math.floor(Date.now() / 1000), meta.gmtoffset);
    // Vercelエッジで10分キャッシュ(全ユーザー共有)。取得回数を抑える
    res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=1800");
    return send(res, 200, {
      symbol: meta.symbol || symbol,
      close: price,
      currency: meta.currency || (symbol.endsWith(".T") ? "JPY" : "USD"),
      date,
      time,
      source: "Yahoo Finance（遅延）",
    });
  } catch (e) {
    return send(res, 502, { error: "株価サーバーへの接続に失敗しました" });
  }
}
