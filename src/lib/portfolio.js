/* 保有資産の集計と、資産の推移の再現(2026-09末)
   方針(CLAUDE.md): 時価・含み損益は「事実の表示」。予測・売買推奨・良し悪しの判定はしない。
   為替換算はしない(円とドルは別々に集計する)。

   推移は「記録にある保有情報 × 過去の終値」からさかのぼって再現した試算:
   - 保有中の銘柄: 購入日(buyDate)から今まで、今の株数・平均取得単価で持っていたものとして計算
     (購入日が未入力なら表示期間のはじめから持っていた扱い。買い増し・一部売却の履歴は記録が無いので反映できない)
   - リリース(売却)済みの銘柄: 購入日〜売却日(soldAt)のあいだ、売却株数(無ければ株数)で持っていたものとして計算
   日々の記録を別に保存しないので、iPhoneとPCのどちらで開いても同じ推移になる(同期も不要)。 */

import { holdingOf, pnlOf } from "./holdings.js";
import { fetchChart } from "./fundamentals.js";

const curOfCode = (s) => (/^[0-9]/.test(String(s.code)) ? "JPY" : "USD");

/* ---- いまの保有資産(ヘッダーの集計) ---- */
export function summarize(stocks, quotes) {
  const by = {};
  let missing = 0;
  stocks.forEach((s) => {
    if (!holdingOf(s)) return;
    const p = pnlOf(s, quotes[s.id]);
    if (!p) { missing++; return; }
    const c = (by[p.currency] ||= { currency: p.currency, value: 0, cost: 0, pnl: 0, gain: 0, loss: 0, gainN: 0, lossN: 0, evenN: 0, n: 0 });
    c.value += p.value; c.cost += p.cost; c.pnl += p.pnl; c.n++;
    if (p.pnl > 0) { c.gain += p.pnl; c.gainN++; } else if (p.pnl < 0) { c.loss += p.pnl; c.lossN++; } else c.evenN++;
  });
  const list = Object.values(by).sort((a, b) => (a.currency === "JPY" ? -1 : b.currency === "JPY" ? 1 : 0));
  list.forEach((c) => { c.pct = c.cost ? (c.pnl / c.cost) * 100 : 0; });
  return { list, missing, held: stocks.filter((s) => holdingOf(s)).length };
}

/* ---- 推移に載せる銘柄(保有中＋売却の記録がある卒業生) ---- */
export function positionsOf(stocks) {
  const out = [];
  stocks.forEach((s) => {
    const shares0 = Number(s.status === "sold" ? (s.sellShares || s.shares) : s.shares);
    const avg = Number(s.avgPrice);
    if (!(shares0 > 0) || !(avg > 0)) return;
    if (s.status === "hold") out.push({ stock: s, shares: shares0, avg, from: s.buyDate || "", to: "" });
    else if (s.status === "sold" && s.soldAt) out.push({ stock: s, shares: shares0, avg, from: s.buyDate || "", to: s.soldAt, sellPrice: Number(s.sellPrice) || null });
  });
  return out;
}

/* 表示期間の終値をまとめて取る。{ [stockId]: {currency, points:[[date, close]]} } */
export async function fetchCharts(positions, range, force) {
  const res = await Promise.all(positions.map((p) => fetchChart(p.stock, range, { force }).catch(() => null)));
  const m = {};
  positions.forEach((p, i) => { if (res[i] && res[i].points && res[i].points.length) m[p.stock.id] = res[i]; });
  return m;
}

/* ある通貨の推移を組み立てる。
   返り値: { dates, points:[{date,value,cost,pnl,gain,loss,gainN,lossN,items:[{id,value,cost,pnl,pct}]}], events, assumed, skipped } */
export function buildHistory(positions, charts, currency) {
  const pos = positions.filter((p) => charts[p.stock.id] && (charts[p.stock.id].currency || curOfCode(p.stock)) === currency);
  const dateSet = new Set();
  pos.forEach((p) => charts[p.stock.id].points.forEach(([d]) => dateSet.add(d)));
  const dates = [...dateSet].sort();
  if (dates.length < 2) return null;
  const first = dates[0], last = dates[dates.length - 1];

  // 銘柄ごとに「その日までの最後の終値」を引けるようにしておく(銘柄ごとに間引き位置が違うため)
  const series = pos.map((p) => ({ ...p, pts: charts[p.stock.id].points }));
  const cursor = series.map(() => -1);
  const points = dates.map((d) => {
    const items = [];
    let value = 0, cost = 0, gain = 0, loss = 0, gainN = 0, lossN = 0;
    series.forEach((p, k) => {
      while (cursor[k] + 1 < p.pts.length && p.pts[cursor[k] + 1][0] <= d) cursor[k]++;
      if (p.from && d < p.from) return;
      if (p.to && d >= p.to) return;
      if (cursor[k] < 0) return; // まだ株価の無い日(上場前など)
      const close = p.pts[cursor[k]][1];
      const v = close * p.shares, c = p.avg * p.shares, pl = v - c;
      value += v; cost += c;
      if (pl > 0) { gain += pl; gainN++; } else if (pl < 0) { loss += pl; lossN++; }
      items.push({ id: p.stock.id, value: v, cost: c, pnl: pl, pct: (pl / c) * 100, close });
    });
    return { date: d, value, cost, pnl: value - cost, gain, loss, gainN, lossN, items };
  });

  // できごと: 期間内の購入日・売却日(自分の記録=事実)
  const events = [];
  series.forEach((p) => {
    if (p.from && p.from >= first && p.from <= last) events.push({ date: p.from, kind: "buy", id: p.stock.id, name: p.stock.name, amount: p.avg * p.shares });
    if (p.to && p.to >= first && p.to <= last) {
      const realized = p.sellPrice ? (p.sellPrice - p.avg) * p.shares : null;
      events.push({ date: p.to, kind: "sell", id: p.stock.id, name: p.stock.name, amount: (p.sellPrice || 0) * p.shares, realized });
    }
  });
  events.sort((a, b) => a.date.localeCompare(b.date));
  // イベントを載せる点(その日以降で最初の点)
  events.forEach((e) => { e.index = Math.max(0, dates.findIndex((d) => d >= e.date)); if (e.index < 0) e.index = dates.length - 1; });

  const assumed = series.filter((p) => !p.from).map((p) => p.stock.name); // 購入日が未入力=期間のはじめから保有扱い
  const skipped = positions.filter((p) => !charts[p.stock.id]).map((p) => p.stock.name); // 株価が取れなかった
  return { currency, dates, points, events, assumed, skipped, stocks: Object.fromEntries(series.map((p) => [p.stock.id, p.stock])) };
}

/* 期間はじめ→ある日までの「時価の変化」を、投資額の増減(買った/売った)と含み損益の増減(値動き)に分ける */
export function flowBetween(a, b) {
  return { dValue: b.value - a.value, dCost: b.cost - a.cost, dPnl: b.pnl - a.pnl };
}
