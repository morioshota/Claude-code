/* 保有情報(株数・平均取得単価)と含み損益の計算。
   方針(CLAUDE.md): 時価・含み損益は「事実の表示」。予測・売買推奨はしない。
   様子(mood)は含み損益の事実をクリーチャーのコンディションに写す遊び演出で、
   抽選(色違い・進化・演出ガチャ)には一切関与しない(不変条件5)。 */

import { fetchQuote } from "./quotes.js";

/* 保有情報が入力済みなら {shares, avg} を返す(保有ステータスのみ) */
export const holdingOf = (s) => {
  const shares = Number(s.shares), avg = Number(s.avgPrice);
  if (s.status !== "hold" || !Number.isFinite(shares) || !Number.isFinite(avg)) return null;
  if (shares <= 0 || avg <= 0) return null;
  return { shares, avg };
};

/* 含み損益(事実)。株価が取れないときはnull=何も表示しない */
export const pnlOf = (stock, quote) => {
  const h = holdingOf(stock);
  if (!h || !quote || typeof quote.close !== "number") return null;
  const value = quote.close * h.shares;
  const cost = h.avg * h.shares;
  const pnl = value - cost;
  return { currency: quote.currency || "JPY", value, cost, pnl, pct: (pnl / cost) * 100 };
};

/* 様子(コンディション)。含み損益率の事実を段階に写すだけで、良し悪しの推奨ではない */
export const MOODS = {
  peak:  { key: "peak",  icon: "✨", label: "ぜっこうちょう" },
  good:  { key: "good",  icon: "♪",  label: "げんき" },
  flat:  { key: "flat",  icon: "",   label: "ふつう" },
  low:   { key: "low",   icon: "💧", label: "ちょっとおつかれ" },
  tired: { key: "tired", icon: "💧", label: "おつかれぎみ" },
};
export const moodOf = (pnl) => {
  if (!pnl) return null;
  if (pnl.pct >= 15) return MOODS.peak;
  if (pnl.pct >= 3) return MOODS.good;
  if (pnl.pct > -3) return MOODS.flat;
  if (pnl.pct > -15) return MOODS.low;
  return MOODS.tired;
};

/* 通貨ごとの表示(為替換算はしない=事実のみ) */
export const fmtMoney = (v, currency, signed = false) => {
  const sign = signed && v > 0 ? "+" : ""; // マイナスはtoLocaleStringが付ける
  if (currency === "JPY") return `${sign}${Math.round(v).toLocaleString("ja-JP")}円`;
  return `${sign}$${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
};
export const fmtPct = (pct) => `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;

/* 保有情報のある銘柄の株価をまとめて取得(quotes.jsのキャッシュに乗る)。
   返り値: { [stockId]: quote } 。失敗した銘柄は含まれない */
export const fetchHeldQuotes = async (stocks) => {
  const held = stocks.filter((s) => holdingOf(s));
  const results = await Promise.all(held.map((s) => fetchQuote(s).catch(() => null)));
  const map = {};
  held.forEach((s, i) => { if (results[i]) map[s.id] = results[i]; });
  return map;
};
