/*
 * 決算日プロキシ (Vercel Serverless Function)  2026-10
 * 銘柄の「過去の決算発表日」と「次の決算予定日」を Yahoo Finance から集めて返す。
 *
 * Yahooには決算日だけを返す公式の口が無いので、取れる所から順に集めて合わせる(どれかが壊れても残りで動く):
 *   A. visualization API(earnings) … Yahooの決算カレンダー画面が使う口。過去数年ぶん＋予定。cookie＋crumb必須
 *   B. quoteSummary calendarEvents … 次の決算予定日(だけ)。cookie＋crumb必須
 *   C. chart API の events=earn   … 過去の決算日が入ることがある(crumb不要)
 * 日付は取引所の現地日付に直す(東証=日本時間、それ以外=米国東部時間のおおよそ)。
 *
 * 方針(CLAUDE.md): 返すのは日付という事実のみ。決算の良し悪しの判定はしない。
 * ?debug=1 で各取得元の結果(件数・状態)も返す(動作確認用)。
 */

const YF1 = process.env.YAHOO_BASE_URL || "https://query1.finance.yahoo.com";
const YF2 = process.env.YAHOO2_BASE_URL || "https://query2.finance.yahoo.com";
const FC = process.env.YAHOO_FC_URL || "https://fc.yahoo.com";
const UA = "Mozilla/5.0 (compatible; kabu-dex/1.0; personal use)"; // ⚠ ブラウザ風のUAだとYahooが429を返した(2026-10)
const SYMBOL_RE = /^[A-Za-z0-9][A-Za-z0-9.\-^]{0,11}$/;

const send = (res, status, body) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
};

/* ---- cookie + crumb (api/fundamentals.js と同じ手順) ---- */
let crumbCache = { crumb: null, cookie: null, at: 0 };
const CRUMB_TTL = 30 * 60 * 1000;
const readSetCookie = (headers) => {
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const raw = headers.get("set-cookie");
  return raw ? [raw] : [];
};
async function getCrumb(force) {
  if (!force && crumbCache.crumb && Date.now() - crumbCache.at < CRUMB_TTL) return crumbCache;
  const r1 = await fetch(FC, { headers: { "User-Agent": UA, Accept: "text/html" }, redirect: "follow" });
  const cookie = readSetCookie(r1.headers).map((c) => c.split(";")[0]).filter(Boolean).join("; ");
  const r2 = await fetch(`${YF2}/v1/test/getcrumb`, { headers: { "User-Agent": UA, Accept: "text/plain", ...(cookie ? { Cookie: cookie } : {}) } });
  const crumb = (await r2.text()).trim();
  if (!crumb || crumb.length > 64 || crumb.includes("<")) throw new Error("crumb unavailable");
  crumbCache = { crumb, cookie, at: Date.now() };
  return crumbCache;
}

/* 時刻 → 取引所の現地日付(YYYY-MM-DD)。東証は+9時間、それ以外は米国東部(-5時間でおおよそ) */
export const localDateOf = (ms, symbol) => {
  if (!Number.isFinite(ms)) return null;
  const off = /\.T$/i.test(symbol) ? 9 : -5;
  return new Date(ms + off * 3600e3).toISOString().slice(0, 10);
};
const toMs = (v) => {
  if (v === null || v === undefined) return NaN;
  if (typeof v === "number") return v < 1e11 ? v * 1000 : v; // 秒 or ミリ秒
  if (typeof v === "object" && typeof v.raw === "number") return toMs(v.raw);
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? t : NaN;
};

/* A. visualization(earnings) — 過去＋予定 */
async function fromVisualization(symbol) {
  const call = async (force) => {
    const { crumb, cookie } = await getCrumb(force);
    return fetch(`${YF1}/v1/finance/visualization?crumb=${encodeURIComponent(crumb)}&lang=en-US&region=US`, {
      method: "POST",
      headers: { "User-Agent": UA, Accept: "application/json", "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify({
        size: 60, offset: 0, sortField: "startdatetime", sortType: "DESC", entityIdType: "earnings",
        includeFields: ["ticker", "startdatetime", "eventname", "eventtype", "epsactual", "timeZoneShortName"],
        query: { operator: "eq", operands: ["ticker", symbol] },
      }),
    });
  };
  let r = await call(false);
  if (r.status === 401 || r.status === 403) r = await call(true);
  if (!r.ok) return { status: r.status, dates: [] };
  const j = await r.json();
  const doc = j && j.finance && j.finance.result && j.finance.result[0] && j.finance.result[0].documents && j.finance.result[0].documents[0];
  if (!doc || !Array.isArray(doc.rows)) return { status: "no-rows", dates: [] };
  const cols = (doc.columns || []).map((c) => c.id || c.label);
  const iDt = cols.indexOf("startdatetime");
  const dates = doc.rows.map((row) => localDateOf(toMs(row[iDt]), symbol)).filter(Boolean);
  return { status: 200, dates, raw: { cols, head: doc.rows.slice(0, 3), tail: doc.rows.slice(-3), total: doc.total ?? (j.finance.result[0].total) } };
}

/* B. quoteSummary calendarEvents — 次の予定 */
async function fromCalendar(symbol) {
  const call = async (force) => {
    const { crumb, cookie } = await getCrumb(force);
    return fetch(`${YF2}/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=calendarEvents&formatted=false&crumb=${encodeURIComponent(crumb)}`, {
      headers: { "User-Agent": UA, Accept: "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    });
  };
  let r = await call(false);
  if (r.status === 401 || r.status === 403) r = await call(true);
  if (!r.ok) return { status: r.status, dates: [] };
  const j = await r.json();
  const ce = j && j.quoteSummary && j.quoteSummary.result && j.quoteSummary.result[0] && j.quoteSummary.result[0].calendarEvents;
  const list = ce && ce.earnings && Array.isArray(ce.earnings.earningsDate) ? ce.earnings.earningsDate : [];
  // 予定が「幅」で返ることがある(2件)。はじめの日だけを使う
  const d = list.length ? localDateOf(toMs(list[0]), symbol) : null;
  return { status: 200, dates: d ? [d] : [] };
}

/* C. chart events=earn — 過去(入っていれば) */
async function fromChart(symbol) {
  const r = await fetch(`${YF1}/v8/finance/chart/${encodeURIComponent(symbol)}?range=10y&interval=1mo&events=earn`, {
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  if (!r.ok) return { status: r.status, dates: [] };
  const j = await r.json();
  const ev = j && j.chart && j.chart.result && j.chart.result[0] && j.chart.result[0].events && j.chart.result[0].events.earnings;
  const dates = ev ? Object.values(ev).map((e) => localDateOf(toMs(e.date), symbol)).filter(Boolean) : [];
  return { status: 200, dates };
}

/* 近すぎる日付(取得元ごとに1日ずれる等)を1件にまとめる: 3日以内なら早いほうを残す */
export const mergeDates = (lists) => {
  const all = [...new Set(lists.flat())].sort();
  const out = [];
  for (const d of all) {
    const prev = out[out.length - 1];
    if (prev && (Date.parse(d) - Date.parse(prev)) / 864e5 <= 3) continue;
    out.push(d);
  }
  return out;
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") { res.statusCode = 204; res.end(); return; }
  if (req.method !== "GET") return send(res, 405, { error: "GETのみ" });
  const url = new URL(req.url, "http://localhost");
  const symbol = String(url.searchParams.get("symbol") || "").trim();
  const debug = url.searchParams.get("debug") === "1";
  if (!SYMBOL_RE.test(symbol)) return send(res, 400, { error: "symbolが不正です（例: 7203.T / RKLB）" });

  const safe = (p) => p.catch((e) => ({ status: `error: ${e && e.message}`, dates: [] }));
  const [a, b, c] = await Promise.all([safe(fromVisualization(symbol)), safe(fromCalendar(symbol)), safe(fromChart(symbol))]);
  const dates = mergeDates([a.dates, b.dates, c.dates]);
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const body = {
    symbol,
    past: dates.filter((d) => d <= today),
    upcoming: dates.filter((d) => d > today),
    source: "Yahoo Finance",
    ...(debug ? { debug: { visualization: { status: a.status, n: a.dates.length, raw: a.raw }, calendar: { status: b.status, dates: b.dates }, chart: { status: c.status, n: c.dates.length } } } : {}),
  };
  // 決算日はめったに変わらない。エッジ12時間(デバッグ時はキャッシュしない)
  res.setHeader("Cache-Control", debug ? "no-store" : "public, s-maxage=43200, stale-while-revalidate=86400");
  return send(res, 200, body);
}
