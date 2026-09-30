/* 保有資産の集計と、資産の推移の再現(2026-09末)
   方針(CLAUDE.md): 時価・含み損益は「事実の表示」。予測・売買推奨・良し悪しの判定はしない。
   為替換算はしない(円とドルは別々に集計する)。

   推移は「記録にある保有情報 × 過去の終値」からさかのぼって再現した試算:
   - 売買の記録(trades: 買い増し・一部売却。lib/lots.js)がある銘柄: 記録どおりに日ごとの株数・平均取得単価を再現する
   - 記録が無い保有中の銘柄: 購入日(buyDate)から今まで、今の株数・平均取得単価で持っていたものとして計算
     (購入日が未入力なら表示期間のはじめから持っていた扱い)
   - リリース(売却)済みの銘柄: 購入日〜売却日(soldAt)のあいだ、売却株数(無ければ株数)で持っていたものとして計算
   日々の記録を別に保存しないので、iPhoneとPCのどちらで開いても同じ推移になる(同期も不要)。 */

import { holdingOf, pnlOf } from "./holdings.js";
import { fetchChart } from "./fundamentals.js";
import { hasTrades, replayTrades, stateAt } from "./lots.js";

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
    const timeline = hasTrades(s) ? replayTrades(s.trades).timeline : null;
    if (!timeline && (!(shares0 > 0) || !(avg > 0))) return;
    if (timeline && !timeline.length) return;
    const from = timeline ? timeline[0].date : s.buyDate || "";
    if (s.status === "hold") out.push({ stock: s, shares: shares0, avg, from, to: "", timeline });
    else if (s.status === "sold" && s.soldAt) out.push({ stock: s, shares: shares0, avg, from, to: s.soldAt, sellPrice: Number(s.sellPrice) || null, timeline });
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
/* 「全期間」の起点: いちばん早い購入日(売買の記録のはじめを含む)。無ければ null */
export function firstHoldDate(positions) {
  const ds = positions.map((p) => p.from).filter(Boolean).sort();
  return ds[0] || null;
}

/* 「全期間」で取りに行く足の長さ: 起点から今日までを覆う、いちばん短い期間(細かい足のほうが見やすい) */
export function rangeForSince(since) {
  if (!since) return "5y";
  const days = (Date.now() - new Date(since + "T00:00:00").getTime()) / 864e5 + 7;
  for (const [key, d] of [["1mo", 30], ["3mo", 90], ["6mo", 180], ["1y", 365], ["3y", 1095], ["5y", 1825], ["10y", 3650]]) if (days <= d) return key;
  return "max";
}

export function buildHistory(positions, charts, currency, since) {
  const pos = positions.filter((p) => charts[p.stock.id] && (charts[p.stock.id].currency || curOfCode(p.stock)) === currency);
  const dateSet = new Set();
  pos.forEach((p) => charts[p.stock.id].points.forEach(([d]) => dateSet.add(d)));
  let dates = [...dateSet].sort();
  // 全期間: 起点(最初の購入日)の直前の1点だけ残して、それより前は切る → グラフも内わけも「保有なし(0円)」から始まる
  if (since) { const k = dates.findIndex((d) => d >= since); if (k > 1) dates = dates.slice(k - 1); }
  if (dates.length < 2) return null;
  const first = dates[0], last = dates[dates.length - 1];

  // 銘柄ごとに「その日までの最後の終値」を引けるようにしておく(銘柄ごとに間引き位置が違うため)
  const series = pos.map((p) => ({ ...p, pts: charts[p.stock.id].points }));

  // 売却で「含み損益 → 実現損益」に移った額(日付つき)。時価の変化の内わけで「値動きのぶん」と分けるのに使う
  //  一部売却: (売値 − その時点の平均)×株数 / 卒業(全部売却): (売却単価 − 平均)×株数。売却単価が未入力なら売却日の前の終値で見積もる
  const realizedEvents = [];
  series.forEach((p) => {
    if (p.timeline) p.timeline.forEach((st) => { if (st.trade.kind === "sell" && st.realized != null) realizedEvents.push({ date: st.trade.date || "", amt: st.realized }); });
    if (p.to) {
      let sh = p.shares, av = p.avg;
      if (p.timeline) { let st = null; for (const t of p.timeline) { if (!t.date || t.date < p.to) st = t; else break; } if (!st || st.shares <= 0) return; sh = st.shares; av = st.avg; }
      let price = p.sellPrice;
      if (!price) { const before = p.pts.filter(([d]) => d < p.to); price = before.length ? before[before.length - 1][1] : null; }
      if (price) realizedEvents.push({ date: p.to, amt: (price - av) * sh });
    }
  });
  realizedEvents.sort((a, b) => a.date.localeCompare(b.date));
  let rk = 0, realizedCum = 0;

  const cursor = series.map(() => -1);
  const points = dates.map((d) => {
    while (rk < realizedEvents.length && realizedEvents[rk].date <= d) realizedCum += realizedEvents[rk++].amt;
    const items = [];
    let value = 0, cost = 0, gain = 0, loss = 0, gainN = 0, lossN = 0;
    series.forEach((p, k) => {
      while (cursor[k] + 1 < p.pts.length && p.pts[cursor[k] + 1][0] <= d) cursor[k]++;
      let sh = p.shares, av = p.avg;
      if (p.timeline) { // 売買の記録どおりに、その日の株数・平均取得単価を使う
        const st = stateAt(p.timeline, d);
        if (!st || st.shares <= 0) return;
        sh = st.shares; av = st.avg;
      } else if (p.from && d < p.from) return;
      if (p.to && d >= p.to) return;
      if (cursor[k] < 0) return; // まだ株価の無い日(上場前など)
      const close = p.pts[cursor[k]][1];
      const v = close * sh, c = av * sh, pl = v - c;
      value += v; cost += c;
      if (pl > 0) { gain += pl; gainN++; } else if (pl < 0) { loss += pl; lossN++; }
      items.push({ id: p.stock.id, value: v, cost: c, pnl: pl, pct: (pl / c) * 100, close });
    });
    return { date: d, value, cost, pnl: value - cost, realized: realizedCum, gain, loss, gainN, lossN, items };
  });

  // できごと: 期間内の購入日・売却日(自分の記録=事実)
  const events = [];
  series.forEach((p) => {
    if (p.timeline) {
      p.timeline.forEach((st) => {
        const t = st.trade;
        if (!t.date || t.date < first || t.date > last) return;
        events.push({ date: t.date, kind: t.kind, id: p.stock.id, name: p.stock.name, amount: t.price * t.shares, shares: t.shares,
          realized: t.kind === "sell" ? st.realized : null, label: t.initial ? "購入" : t.kind === "buy" ? "買い増し" : "一部売却" });
      });
    } else if (p.from && p.from >= first && p.from <= last) events.push({ date: p.from, kind: "buy", id: p.stock.id, name: p.stock.name, amount: p.avg * p.shares, label: "購入" });
    if (p.to && p.to >= first && p.to <= last) {
      const realized = p.sellPrice ? (p.sellPrice - p.avg) * p.shares : null;
      events.push({ date: p.to, kind: "sell", id: p.stock.id, name: p.stock.name, amount: (p.sellPrice || 0) * p.shares, realized, label: "売却（卒業）" });
    }
  });
  events.sort((a, b) => a.date.localeCompare(b.date));
  // イベントを載せる点(その日以降で最初の点)
  events.forEach((e) => { e.index = Math.max(0, dates.findIndex((d) => d >= e.date)); if (e.index < 0) e.index = dates.length - 1; });

  const assumed = series.filter((p) => !p.from).map((p) => p.stock.name); // 購入日が未入力=期間のはじめから保有扱い
  const skipped = positions.filter((p) => !charts[p.stock.id]).map((p) => p.stock.name); // 株価が取れなかった
  return { currency, dates, points, events, assumed, skipped, stocks: Object.fromEntries(series.map((p) => [p.stock.id, p.stock])) };
}

/* 期間はじめ→ある日までの「時価の変化」を3つに分ける(必ず 時価の変化 = dCost + dMove + dExit になる):
   dCost … 投資額の増減(買った・売ったぶん。取得額ベース)
   dMove … 値動きのぶん(持っていた株の株価の変化。売った株は売値までの値動き)
   dExit … 売却で確定したぶん(含み損益が実現損益に移って時価から抜けた額 = −実現損益) */
export function flowBetween(a, b) {
  const dRealized = (b.realized || 0) - (a.realized || 0);
  const dPnl = b.pnl - a.pnl;
  return { dValue: b.value - a.value, dCost: b.cost - a.cost, dPnl, dRealized, dMove: dPnl + dRealized, dExit: -dRealized || 0 };
}
