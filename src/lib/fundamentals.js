/* ファンダメンタル指標の取得・キャッシュ・手入力とのマージ・整形。

   方針(CLAUDE.md): 表示するのは事実の数値のみ。「割安/割高」「買い時」等の判定はしない。
   目標株価・アナリスト評価は第三者(アナリスト)の意見という事実として扱い、
   UI側で必ず「アプリの推奨ではない」と明記する(2026-07オーナー承認)。

   取得は自動(Yahoo)＋手入力の併用:
   - 自動で取れた値をベースに、stock.fundamentals(手入力)があればそちらを優先する
   - Yahooの仕様変更で自動取得が壊れても、手入力の値だけで画面が成立する */

import { symbolFor } from "./quotes.js";

const TTL_MS = 12 * 60 * 60 * 1000;      // 指標は日次で十分
const NEG_TTL_MS = 6 * 60 * 60 * 1000;   // 未対応銘柄は6時間再問い合わせしない
const cacheKey = (symbol) => `kabu-fund:${symbol}`;

/* ---- 指標の定義(表示順・ラベル・書式) ----
   fmt: x=倍率 / pct=比率(0.102→10.2%) / pctRaw=すでに%の値 / money=通貨 / cap=時価総額 / num=素の数値 */
export const METRIC_GROUPS = [
  {
    key: "valuation", label: "バリュエーション", icon: "💰",
    metrics: [
      { key: "marketCap", label: "時価総額", sub: "Market Cap", fmt: "cap" },
      { key: "per", label: "PER", sub: "株価収益率", fmt: "x" },
      { key: "pbr", label: "PBR", sub: "株価純資産倍率", fmt: "x" },
      { key: "dividendYield", label: "配当利回り", sub: "Dividend Yield", fmt: "pct" },
      { key: "eps", label: "EPS", sub: "1株当たり利益", fmt: "money" },
      { key: "bps", label: "BPS", sub: "1株当たり純資産", fmt: "money" },
    ],
  },
  {
    key: "profit", label: "収益性・成長性", icon: "📈",
    metrics: [
      { key: "roe", label: "ROE", sub: "自己資本利益率", fmt: "pct" },
      { key: "roa", label: "ROA", sub: "総資産利益率", fmt: "pct" },
      { key: "operatingMargin", label: "営業利益率", sub: "Operating Margin", fmt: "pct" },
      { key: "revenueGrowth", label: "売上成長率", sub: "前年同期比", fmt: "pct", signed: true },
      { key: "epsGrowth", label: "EPS成長率", sub: "前年同期比", fmt: "pct", signed: true },
    ],
  },
  {
    key: "health", label: "財務健全性", icon: "🛡",
    metrics: [
      { key: "equityRatio", label: "自己資本比率", sub: "自己資本÷総資産", fmt: "pct" },
      { key: "debtToEquity", label: "負債資本比率", sub: "D/E（%）", fmt: "pctRaw" },
      { key: "currentRatio", label: "流動比率", sub: "Current Ratio", fmt: "x" },
    ],
  },
];

export const ALL_METRIC_KEYS = METRIC_GROUPS.flatMap((g) => g.metrics.map((m) => m.key));
export const METRIC_BY_KEY = Object.fromEntries(
  METRIC_GROUPS.flatMap((g) => g.metrics.map((m) => [m.key, m]))
);

/* アナリスト評価の表示名(第三者の意見をそのまま日本語にするだけ。色付けや強調はしない) */
export const RATING_LABEL = {
  strong_buy: "強い買い", strongbuy: "強い買い", buy: "買い",
  hold: "中立", underperform: "やや弱気", sell: "売り", strong_sell: "強い売り",
};

/* ---- 書式 ---- */
export const fmtCap = (v, currency) => {
  if (v === null || v === undefined) return null;
  if (currency === "JPY") {
    if (v >= 1e12) return `${(v / 1e12).toFixed(2)}兆`;
    if (v >= 1e8) return `${Math.round(v / 1e8).toLocaleString("ja-JP")}億`;
    return `${Math.round(v).toLocaleString("ja-JP")}`;
  }
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${Math.round(v).toLocaleString("en-US")}`;
};

export const fmtMetric = (metric, v, currency) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  const sign = metric.signed && v > 0 ? "+" : "";
  switch (metric.fmt) {
    case "cap": return fmtCap(v, currency);
    case "x": return `${v.toFixed(2)}x`;
    case "pct": return `${sign}${(v * 100).toFixed(2)}%`;
    case "pctRaw": return `${sign}${v.toFixed(1)}%`;
    case "money": return currency === "JPY"
      ? `${v.toLocaleString("ja-JP", { maximumFractionDigits: 2 })}円`
      : `$${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
    default: return String(v);
  }
};

/* 手入力欄の単位ヒント(入力は人が読める単位で受ける。%はそのまま10.2と書けばよい) */
export const inputHintOf = (metric) => {
  switch (metric.fmt) {
    case "cap": return "円/ドル（そのままの金額）";
    case "x": return "倍（例: 10.2）";
    case "pct":
    case "pctRaw": return "%（例: 10.2）";
    case "money": return "円/ドル";
    default: return "";
  }
};
/* 手入力(人間の単位) → 内部表現。pctは0.102形式に戻す */
export const parseManual = (metric, raw) => {
  const v = parseFloat(String(raw).replace(/[,\s]/g, ""));
  if (!Number.isFinite(v)) return null;
  return metric.fmt === "pct" ? v / 100 : v;
};
/* 内部表現 → 手入力欄に出す値 */
export const toManualInput = (metric, v) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return "";
  return String(metric.fmt === "pct" ? Math.round(v * 10000) / 100 : v);
};

/* ---- 取得 ---- */
export const fetchFundamentals = async (stock) => {
  const symbol = symbolFor(stock);
  if (!symbol) return null;

  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey(symbol)) || "null");
    if (cached && Date.now() - cached.at < (cached.data ? TTL_MS : NEG_TTL_MS)) return cached.data;
  } catch (e) { /* キャッシュ破損は無視して取得へ */ }

  const endpoint = import.meta.env?.VITE_FUND_PROXY || "/api/fundamentals";
  let data = null;
  let cacheable = false; // 一時的な失敗(オフライン等)はキャッシュせず次回再試行する
  try {
    const res = await fetch(`${endpoint}?symbol=${encodeURIComponent(symbol)}`);
    if (res.ok) {
      const j = await res.json();
      if (j && typeof j === "object" && !j.error) { data = j; cacheable = true; }
    } else if (res.status === 404) {
      cacheable = true; // 「この銘柄の指標は存在しない」と確定したときだけネガティブキャッシュ
    }
  } catch (e) { /* オフライン・未デプロイ等。手入力だけで表示する */ }

  if (cacheable) {
    try { localStorage.setItem(cacheKey(symbol), JSON.stringify({ at: Date.now(), data })); } catch (e) { /* 容量不足は無視 */ }
  }
  return data;
};

/* 自動取得と手入力を1つの表に畳む。手入力が入っている項目は手入力を優先 */
export const mergeMetrics = (auto, stock) => {
  const manual = (stock && stock.fundamentals) || {};
  const out = {};
  ALL_METRIC_KEYS.forEach((k) => {
    const m = manual[k];
    if (Number.isFinite(m)) out[k] = { value: m, manual: true };
    else if (auto && Number.isFinite(auto[k])) out[k] = { value: auto[k], manual: false };
    else out[k] = null;
  });
  return out;
};

/* チャート用の時系列。範囲ごとにキャッシュ(失敗時はnull=行ごと非表示) */
const chartKey = (symbol, range) => `kabu-chart:${symbol}:${range}`;
const CHART_TTL_MS = 60 * 60 * 1000;

export const fetchChart = async (stock, range) => {
  const symbol = symbolFor(stock);
  if (!symbol) return null;
  try {
    const cached = JSON.parse(localStorage.getItem(chartKey(symbol, range)) || "null");
    if (cached && Date.now() - cached.at < CHART_TTL_MS) return cached.data;
  } catch (e) { /* 破損は無視 */ }

  const endpoint = import.meta.env?.VITE_CHART_PROXY || "/api/chart";
  let data = null;
  let cacheable = false;
  try {
    const res = await fetch(`${endpoint}?symbol=${encodeURIComponent(symbol)}&range=${encodeURIComponent(range)}`);
    if (res.ok) {
      const j = await res.json();
      if (j && Array.isArray(j.points) && j.points.length > 1) { data = j; cacheable = true; }
    } else if (res.status === 404) {
      cacheable = true;
    }
  } catch (e) { /* 表示しないだけ */ }

  if (cacheable) {
    try { localStorage.setItem(chartKey(symbol, range), JSON.stringify({ at: Date.now(), data })); } catch (e) { /* 無視 */ }
  }
  return data;
};

export const CHART_RANGES = [
  { key: "1mo", label: "1ヶ月" },
  { key: "3mo", label: "3ヶ月" },
  { key: "6mo", label: "6ヶ月" },
  { key: "1y", label: "1年" },
  { key: "3y", label: "3年" },
  { key: "5y", label: "5年" },
];
