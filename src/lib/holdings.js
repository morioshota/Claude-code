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

/* ---- 損切りライン ----
   これは「オーナー自身が事前に決めたルール」であって、アプリからの売買推奨ではない。
   画面では「あなたが決めた-8%のラインを超えています」という事実だけを伝え、
   「売るべき」「損切りしましょう」等の指示は書かないこと(CLAUDE.md)。
   判定に使う株価は遅延データなので、リアルタイムの執行判断には使えない旨も併記する。 */

export const DEFAULT_STOP_LOSS_PCT = -8;  // 未設定の保有銘柄に使う共通の初期値
export const NEAR_MARGIN_PCT = 2;         // ラインまで2%以内なら「まもなく」を予告

/* 設定値(%)。未設定は共通の初期値、0を入れた銘柄は「判定しない」 */
export const stopLossPctOf = (stock) => {
  const raw = stock.stopLossPct;
  if (raw === 0) return null;
  const v = Number(raw);
  if (Number.isFinite(v) && v < 0) return v;
  return DEFAULT_STOP_LOSS_PCT;
};

/* ラインに到達する株価(平均取得単価から計算)。保有情報がなければnull */
export const stopLossPriceOf = (stock) => {
  const h = holdingOf(stock);
  const pct = stopLossPctOf(stock);
  if (!h || pct === null) return null;
  return h.avg * (1 + pct / 100);
};

/* 状態: null(対象外) | "ok" | "near"(あと2%以内) | "over"(超過) */
export const stopLossStateOf = (stock, quote) => {
  const pnl = pnlOf(stock, quote);
  const pct = stopLossPctOf(stock);
  if (!pnl || pct === null) return null;
  if (pnl.pct <= pct) return "over";
  if (pnl.pct <= pct + NEAR_MARGIN_PCT) return "near";
  return "ok";
};

/* ラインまであと何%か(nearの予告文用)。超過済みなら0 */
export const marginToStopLoss = (stock, quote) => {
  const pnl = pnlOf(stock, quote);
  const pct = stopLossPctOf(stock);
  if (!pnl || pct === null) return null;
  return Math.max(0, pnl.pct - pct);
};

/* 通貨ごとの表示(為替換算はしない=事実のみ) */export const fmtMoney = (v, currency, signed = false) => {
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
