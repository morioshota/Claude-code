/* 売買の記録(買い増し・一部売却)と、そこから決まる株数・平均取得単価  2026-09末
   stock.trades = [{ id, date:"YYYY-MM-DD"|"", kind:"buy"|"sell", shares, price, initial? }]
   - initial: 記録を始める前から持っていたぶん(それまでの 株数×平均取得単価 を1件にまとめたもの。日付は購入日)
   - 平均取得単価は「移動平均法」: 買うたびに (持ち株の取得額＋今回の取得額)÷合計株数 で更新し、売っても変わらない
   - 一部売却の実現損益 = (売却単価 − その時点の平均取得単価) × 売った株数
   記録がある銘柄は、stock.shares / stock.avgPrice / stock.buyDate をこの計算結果で上書きして保存する
   (ほかの画面・計算は従来どおり shares / avgPrice を読めばよい)。
   方針(CLAUDE.md): 記録と計算は事実のみ。売買の良し悪しの判定や推奨はしない */
import { uid } from "./util.js";

const byDate = (a, b) => String(a.date || "").localeCompare(String(b.date || "")) || (a.initial ? -1 : b.initial ? 1 : 0);

/* 記録を日付順にたどって、各時点の株数・平均取得単価と実現損益を出す。
   timeline: [{date, shares, avg, trade, realized}] (その取引の直後の状態) */
export function replayTrades(trades) {
  const list = [...(trades || [])].sort(byDate);
  let shares = 0, avg = 0, realized = 0;
  const timeline = [];
  list.forEach((t) => {
    const q = Number(t.shares), p = Number(t.price);
    if (!(q > 0) || !(p > 0)) return;
    let r = null;
    if (t.kind === "sell") {
      const sold = Math.min(q, shares);
      r = (p - avg) * sold;
      realized += r;
      shares -= sold;
      if (shares <= 1e-9) { shares = 0; }
    } else {
      avg = (avg * shares + p * q) / (shares + q);
      shares += q;
    }
    timeline.push({ date: t.date || "", shares, avg, trade: t, realized: r });
  });
  return { shares, avg, realized, timeline };
}

/* 記録を始める: いまの 株数×平均取得単価 を「はじめの保有」として1件にする */
export function initialTradesOf(stock) {
  const q = Number(stock.shares), p = Number(stock.avgPrice);
  if (!(q > 0) || !(p > 0)) return [];
  return [{ id: uid(), date: stock.buyDate || "", kind: "buy", shares: q, price: p, initial: true }];
}

/* 記録から stock の保有情報を作り直す(保存用) */
export function applyTrades(stock, trades) {
  const sorted = [...trades].sort(byDate);
  const { shares, avg } = replayTrades(sorted);
  const first = sorted.find((t) => t.kind === "buy");
  const ns = { ...stock, trades: sorted };
  if (sorted.length === 0) { delete ns.trades; return ns; }
  ns.shares = shares;
  ns.avgPrice = shares > 0 ? Math.round(avg * 10000) / 10000 : stock.avgPrice;
  if (first && first.date) ns.buyDate = first.date;
  return ns;
}

/* ある日の保有状態(その日までの最後の取引の直後)。記録より前ならnull */
export function stateAt(timeline, date) {
  let s = null;
  for (const t of timeline) { if (!t.date || t.date <= date) s = t; else break; }
  return s;
}

export const hasTrades = (stock) => Array.isArray(stock.trades) && stock.trades.length > 0;
export const partialRealizedOf = (stock) => (hasTrades(stock) ? replayTrades(stock.trades).realized : 0);
