/*
 * ファンダメンタル指標プロキシ (Vercel Serverless Function)
 * Yahoo Finance の quoteSummary から PER/PBR/ROE 等の指標を取得しJSONで返す。
 *
 * ⚠ このエンドポイントは2023年以降 cookie + crumb(ワンタイムトークン) が必須になった。
 *    fc.yahoo.com でcookieを取得 → /v1/test/getcrumb でcrumbを取得 → 本リクエストに付与、
 *    という手順を踏む。crumbはウォームなLambda内で30分キャッシュする。
 *    401が返ったらcrumbを捨てて1回だけ取り直す(トークン失効への対応)。
 *
 * 方針(CLAUDE.md): 数値は事実として返すだけ。アプリ側で「割安/割高」等の判定はしない。
 * 目標株価・アナリスト評価は「第三者(アナリスト)の意見」という事実として返し、
 * 表示側で必ず"アプリの推奨ではない"と明記する(2026-07オーナー承認)。
 */

const YF2 = process.env.YAHOO2_BASE_URL || "https://query2.finance.yahoo.com";
const FC = process.env.YAHOO_FC_URL || "https://fc.yahoo.com";
const UA = "Mozilla/5.0 (compatible; kabu-dex/1.0; personal use)";
const SYMBOL_RE = /^[A-Za-z0-9][A-Za-z0-9.\-^]{0,11}$/;

const MODULES = [
  "summaryDetail",
  "defaultKeyStatistics",
  "financialData",
  "balanceSheetHistoryQuarterly",
].join(",");

const send = (res, status, body) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
};

/* quoteSummaryは {raw, fmt} 形式と素の数値が混在する。どちらでも数値だけ取り出す */
const num = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "object" && typeof v.raw === "number") return Number.isFinite(v.raw) ? v.raw : null;
  return null;
};
const str = (v) => (typeof v === "string" && v ? v : null);
const div = (a, b) => (a !== null && b !== null && b !== 0 ? a / b : null);

/* ---- cookie + crumb ---- */
let crumbCache = { crumb: null, cookie: null, at: 0 };
const CRUMB_TTL = 30 * 60 * 1000;

const readSetCookie = (headers) => {
  // Node18+ は getSetCookie() で複数Set-Cookieを配列で取れる。無い環境は結合済み文字列で妥協
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const raw = headers.get("set-cookie");
  return raw ? [raw] : [];
};

async function getCrumb(force) {
  if (!force && crumbCache.crumb && Date.now() - crumbCache.at < CRUMB_TTL) return crumbCache;
  const r1 = await fetch(FC, { headers: { "User-Agent": UA, Accept: "text/html" }, redirect: "follow" });
  const cookie = readSetCookie(r1.headers)
    .map((c) => c.split(";")[0])
    .filter(Boolean)
    .join("; ");
  const r2 = await fetch(`${YF2}/v1/test/getcrumb`, {
    headers: { "User-Agent": UA, Accept: "text/plain", ...(cookie ? { Cookie: cookie } : {}) },
  });
  const crumb = (await r2.text()).trim();
  // HTMLが返ってきた(=ログイン画面等)ときはcrumbとして使えない
  if (!crumb || crumb.length > 64 || crumb.includes("<")) throw new Error("crumb unavailable");
  crumbCache = { crumb, cookie, at: Date.now() };
  return crumbCache;
}

async function fetchSummary(symbol) {
  const call = async (force) => {
    const { crumb, cookie } = await getCrumb(force);
    const url = `${YF2}/v10/finance/quoteSummary/${encodeURIComponent(symbol)}`
      + `?modules=${MODULES}&formatted=false&crumb=${encodeURIComponent(crumb)}`;
    return fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    });
  };
  let res = await call(false);
  if (res.status === 401 || res.status === 403) res = await call(true); // crumb失効 → 1回だけ取り直す
  return res;
}

/* ---- 自己資本比率(自己資本÷総資産) ----
   旧 balanceSheetHistoryQuarterly モジュールはYahooが実質廃止しており、
   貸借対照表の項目が返ってこない(2026-07時点で全銘柄が空だった)。
   Yahoo自身のサイトが使う fundamentals-timeseries から総資産・自己資本を取り直す。
   StockholdersEquity は非支配株主持分を含まないので日本の「自己資本」とほぼ一致する。 */

const TS_TYPES = [
  "quarterlyTotalAssets", "quarterlyStockholdersEquity",
  "annualTotalAssets", "annualStockholdersEquity",
];

/* timeseriesのレスポンスから型ごとの最新値を拾う(テストのためexportしている) */
export const pickLatestSeries = (json) => {
  const out = {};
  const results = json && json.timeseries && Array.isArray(json.timeseries.result) ? json.timeseries.result : [];
  for (const r of results) {
    const type = r && r.meta && Array.isArray(r.meta.type) ? r.meta.type[0] : null;
    if (!type || !Array.isArray(r[type])) continue;
    for (let i = r[type].length - 1; i >= 0; i--) {   // 新しい順に見て最初の有効値
      const e = r[type][i];
      const v = e ? num(e.reportedValue) : null;
      if (v !== null) { out[type] = v; break; }
    }
  }
  return out;
};

/* 四半期が揃っていれば四半期、無ければ通期。期がちぐはぐな組み合わせは使わない */
export const equityRatioOf = (series) => {
  const q = div(series.quarterlyStockholdersEquity ?? null, series.quarterlyTotalAssets ?? null);
  if (q !== null) return q;
  return div(series.annualStockholdersEquity ?? null, series.annualTotalAssets ?? null);
};

async function fetchEquityRatio(symbol) {
  const now = Math.floor(Date.now() / 1000);
  const from = now - 3 * 365 * 24 * 3600; // 3年ぶんあれば直近の期は必ず含まれる
  const call = async (force) => {
    const { crumb, cookie } = await getCrumb(force);
    const url = `${YF2}/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}`
      + `?symbol=${encodeURIComponent(symbol)}&type=${TS_TYPES.join(",")}`
      + `&period1=${from}&period2=${now}&merge=false&crumb=${encodeURIComponent(crumb)}`;
    return fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    });
  };
  try {
    let res = await call(false);
    if (res.status === 401 || res.status === 403) res = await call(true);
    if (!res.ok) return null;
    return equityRatioOf(pickLatestSeries(await res.json()));
  } catch (e) {
    return null; // 取れなければ手入力にまかせる(画面は成立する)
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") { res.statusCode = 204; res.end(); return; }
  if (req.method !== "GET") return send(res, 405, { error: "GETのみ" });

  const url = new URL(req.url, "http://localhost");
  const symbol = String(url.searchParams.get("symbol") || "").trim();
  if (!SYMBOL_RE.test(symbol)) return send(res, 400, { error: "symbolが不正です（例: 7203.T / RKLB）" });

  try {
    const upstream = await fetchSummary(symbol);
    if (upstream.status === 404) return send(res, 404, { error: "この銘柄の指標が見つかりません", symbol });
    if (!upstream.ok) return send(res, 502, { error: `指標の取得に失敗しました (${upstream.status})` });

    const data = await upstream.json();
    const r = data && data.quoteSummary && Array.isArray(data.quoteSummary.result) ? data.quoteSummary.result[0] : null;
    if (!r) return send(res, 404, { error: "この銘柄の指標が見つかりません", symbol });

    const sd = r.summaryDetail || {};
    const ks = r.defaultKeyStatistics || {};
    const fd = r.financialData || {};
    const bs = (r.balanceSheetHistoryQuarterly && r.balanceSheetHistoryQuarterly.balanceSheetStatements) || [];
    const b0 = bs[0] || {};

    // 自己資本比率(自己資本÷総資産)。まず旧BSモジュール、空ならtimeseriesへ。
    // 項目名はYahooの版によって揺れるため候補を順に見る
    const equity = num(b0.totalStockholderEquity) ?? num(b0.stockholdersEquity) ?? num(b0.totalEquityGrossMinorityInterest);
    const assets = num(b0.totalAssets);
    let equityRatio = div(equity, assets);
    if (equityRatio === null) equityRatio = await fetchEquityRatio(symbol);

    const currency = str(sd.currency) || str(fd.financialCurrency) || (symbol.endsWith(".T") ? "JPY" : "USD");

    const out = {
      symbol,
      currency,
      // バリュエーション
      marketCap: num(sd.marketCap) || num(ks.enterpriseValue),
      per: num(sd.trailingPE),
      forwardPer: num(sd.forwardPE),
      pbr: num(ks.priceToBook),
      dividendYield: num(sd.dividendYield),   // 0.0337 = 3.37%
      eps: num(ks.trailingEps),
      bps: num(ks.bookValue),
      // 収益性・成長性(いずれも比率。0.102 = 10.2%)
      roe: num(fd.returnOnEquity),
      roa: num(fd.returnOnAssets),
      operatingMargin: num(fd.operatingMargins),
      revenueGrowth: num(fd.revenueGrowth),
      epsGrowth: num(fd.earningsGrowth),
      // 財務健全性
      equityRatio,
      debtToEquity: num(fd.debtToEquity),      // %表記(107.1 = 107.1%)
      currentRatio: num(fd.currentRatio),
      // 市場の見方(第三者の意見。表示側で「推奨ではない」と明記する)
      targetPrice: num(fd.targetMeanPrice),
      analystRating: str(fd.recommendationKey),
      analystCount: num(fd.numberOfAnalystOpinions),
      source: "Yahoo Finance（遅延）",
      fetchedAt: new Date().toISOString().slice(0, 10),
    };

    // 指標が丸ごと空(=取得できていない)なら404扱いにして、表示側でフォールバックさせる
    const hasAny = ["marketCap", "per", "pbr", "roe", "roa", "eps", "equityRatio"].some((k) => out[k] !== null);
    if (!hasAny) return send(res, 404, { error: "この銘柄の指標が見つかりません", symbol });

    // 指標は日次更新で十分。エッジ6時間キャッシュ
    res.setHeader("Cache-Control", "public, s-maxage=21600, stale-while-revalidate=86400");
    return send(res, 200, out);
  } catch (e) {
    return send(res, 502, { error: "指標サーバーへの接続に失敗しました" });
  }
}
