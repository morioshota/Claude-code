/* リリース(売却)した銘柄の「売買の記録」と、振り返り用の事実の計算。
   方針(CLAUDE.md): 表示するのは事実だけ。成績の良し悪しの判定・色分け・
   「売らなければ良かった」等の評価文言は書かない。学びはオーナー自身が lesson に書く。

   stock に保存するフィールド(すべて任意):
     buyDate   … 購入日 YYYY-MM-DD(保有中から入力できる)
     soldAt    … 売却日 YYYY-MM-DD(従来の「卒業日」をそのまま売却日として使う)
     sellPrice … 売却単価(日本株=円/米国株=ドル)
     sellShares… 売却株数(未入力なら shares)
     sellReason… 売却理由のキー(SELL_REASONS)
   平均取得単価・株数は保有中に入れた avgPrice / shares をそのまま使う */

import { daysSince } from "./util.js";
import { stopLossPctOf } from "./holdings.js";

/* 売却理由。オーナー自身が選ぶ「そのときの自分の判断の記録」 */
export const SELL_REASONS = [
  { key: "trigger",  icon: "🧩", label: "前提が崩れた" },
  { key: "stoploss", icon: "🚨", label: "にげるラインに到達" },
  { key: "target",   icon: "🎯", label: "決めていた価格に届いた" },
  { key: "swap",     icon: "🔁", label: "資金を入れ替えた" },
  { key: "need",     icon: "👛", label: "お金が必要になった" },
  { key: "other",    icon: "📝", label: "その他" },
];
export const SELL_REASON_BY_KEY = Object.fromEntries(SELL_REASONS.map((r) => [r.key, r]));

export const currencyOf = (stock) => (/^[0-9]/.test(String(stock.code || "")) ? "JPY" : "USD");

const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };

/* 2つの日付の間の日数(どちらか欠けていればnull) */
export const daysBetween = (a, b) => {
  if (!a || !b) return null;
  const t1 = Date.parse(a), t2 = Date.parse(b);
  if (!Number.isFinite(t1) || !Number.isFinite(t2)) return null;
  return Math.round((t2 - t1) / 864e5);
};

/* 売買の記録と実現損益(事実)。平均取得単価と売却単価がそろわなければ損益はnull */
export const tradeOf = (stock) => {
  const avg = num(stock.avgPrice);
  const sell = num(stock.sellPrice);
  const shares = num(stock.sellShares) || num(stock.shares);
  const currency = currencyOf(stock);
  const days = daysBetween(stock.buyDate, stock.soldAt);
  const out = { avg, sell, shares, currency, days, buyDate: stock.buyDate || "", soldAt: stock.soldAt || "",
    reason: SELL_REASON_BY_KEY[stock.sellReason] || null, pnl: null, pct: null, stop: null };
  if (avg && sell) {
    out.pct = ((sell - avg) / avg) * 100;
    if (shares) out.pnl = (sell - avg) * shares;
  }
  // 自分で決めていた にげるライン と売却単価の位置関係(事実。守れた/守れなかったの評価はしない)
  const pct = stopLossPctOf({ ...stock, status: "hold" });
  if (avg && pct !== null) {
    const line = avg * (1 + pct / 100);
    out.stop = { pct, line, sellBelow: sell ? sell <= line : null };
  }
  return out;
};

/* 振り返りチャートに要る期間(購入日〜きょうを覆う最小のレンジ) */
export const reviewRangeOf = (stock) => {
  const start = stock.buyDate || stock.soldAt;
  const d = daysSince(start);
  if (d === null) return "1y";
  if (d <= 28) return "1mo";
  if (d <= 88) return "3mo";
  if (d <= 178) return "6mo";
  if (d <= 360) return "1y";
  if (d <= 1090) return "3y";
  return "5y";
};

/* チャートの終値から、保有中と売却後の事実を拾う。
   points=[[YYYY-MM-DD, 終値]...](間引き済みなので極値は概算) */
export const reviewFactsOf = (stock, points) => {
  const t = tradeOf(stock);
  if (!points || points.length < 2) return null;
  const from = stock.buyDate || "";
  const to = stock.soldAt || "9999-12-31";
  const held = points.filter((p) => (!from || p[0] >= from) && p[0] <= to);
  const after = points.filter((p) => p[0] > to);
  const facts = { held: null, after: null };
  if (held.length >= 2 && t.avg) {
    let hi = held[0], lo = held[0];
    held.forEach((p) => { if (p[1] > hi[1]) hi = p; if (p[1] < lo[1]) lo = p; });
    facts.held = {
      hi, lo, fromBuy: !!from,
      hiPct: ((hi[1] - t.avg) / t.avg) * 100,
      loPct: ((lo[1] - t.avg) / t.avg) * 100,
    };
  }
  if (after.length >= 1 && t.sell) {
    const last = after[after.length - 1];
    facts.after = { last, pct: ((last[1] - t.sell) / t.sell) * 100 };
  }
  return facts;
};
