/* 🗓 決算日(2026-10・オーナー要望)
   銘柄ごとの決算発表日を stock.earnings に保存する。
     [{ date:"YYYY-MM-DD", auto?:true (自動取得), hidden?:true (自動取得を自分で消した印) }]
   - 自動取得(api/earnings.js = Yahoo)で見つかった日は自動で書き足す。手で足した日・消した日はそのまま
   - 自動取得の日を消すと hidden の印だけ残す(次の取り込みで復活させないため)
   - 決算日をはさんだ値動き(前の取引日の終値→次の取引日の終値)は api/chart.js?around= から取る
   方針(CLAUDE.md): 日付と終値という事実の表示のみ。決算の良し悪しの判定・売買の推奨はしない */

import { symbolFor } from "./quotes.js";
import { today } from "./util.js";

const DAY = 864e5;
const near = (a, b, days = 7) => Math.abs(Date.parse(a) - Date.parse(b)) / DAY <= days;

/* 表示する決算日(消したものを除く・古い順) */
export const earningsOf = (stock) =>
  (Array.isArray(stock.earnings) ? stock.earnings : []).filter((e) => e && e.date && !e.hidden).sort((a, b) => a.date.localeCompare(b.date));

/* 次の決算予定(今日以降でいちばん近い日) */
export const nextEarningsOf = (stock, now = today()) => earningsOf(stock).find((e) => e.date >= now) || null;

/* 自動取得の結果を書き足す。変わらなければ null を返す
   - 近い日(7日以内)が既にあれば足さない(取得元で1日ずれることがあるため)
   - 予定(今日より後)の自動の日は、取得した予定に置き換える(会社が日程を決め直すことがあるため) */
export function mergeAutoEarnings(stock, api, now = today()) {
  if (!api) return null;
  const cur = Array.isArray(stock.earnings) ? stock.earnings : [];
  const found = [...(api.past || []), ...(api.upcoming || [])].filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  if (!found.length) return null;
  let next = cur;
  if ((api.upcoming || []).length) {
    next = next.filter((e) => !(e.auto && !e.hidden && e.date > now && !(api.upcoming || []).some((u) => near(u, e.date, 0))));
  }
  const add = found.filter((d) => !next.some((e) => near(e.date, d)));
  if (!add.length && next.length === cur.length) return null;
  return [...next, ...add.map((date) => ({ date, auto: true }))].sort((a, b) => a.date.localeCompare(b.date));
}

/* 手で足す。同じ日に消した印があれば戻す */
export function addEarning(stock, date) {
  const cur = Array.isArray(stock.earnings) ? stock.earnings : [];
  if (cur.some((e) => e.date === date && !e.hidden)) return cur;
  return [...cur.filter((e) => e.date !== date), { date }].sort((a, b) => a.date.localeCompare(b.date));
}

/* 消す。自動取得の日は印を残す(次の取り込みで戻ってこないように) */
export function removeEarning(stock, date) {
  const cur = Array.isArray(stock.earnings) ? stock.earnings : [];
  return cur.flatMap((e) => (e.date !== date ? [e] : e.auto ? [{ date, auto: true, hidden: true }] : []));
}

/* ---- 取得(端末キャッシュつき) ---- */
const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 容量不足は無視 */ } };
const EARN_TTL = 24 * 3600e3;   // 決算日は1日1回で十分
const MOVE_TTL = 6 * 3600e3;

export async function fetchEarnings(stock, { force = false } = {}) {
  const symbol = symbolFor(stock);
  if (!symbol) return null;
  const key = `kabu-earn:${symbol}`;
  const c = lsGet(key);
  if (!force && c && Date.now() - c.at < EARN_TTL) return c.data;
  try {
    const r = await fetch(`/api/earnings?symbol=${encodeURIComponent(symbol)}${force ? `&_=${Date.now()}` : ""}`);
    if (!r.ok) return null;
    const data = await r.json();
    lsSet(key, { at: Date.now(), data });
    return data;
  } catch (e) { return null; }
}

/* 決算日をはさんだ値動き。{ [date]: {before:[date,close], after:[date,close]} } */
export async function fetchEarningsMoves(stock, dates, { force = false } = {}) {
  const symbol = symbolFor(stock);
  const ds = [...new Set(dates)].sort();
  if (!symbol || !ds.length) return {};
  const key = `kabu-earnmv:${symbol}:${ds.join(",")}`;
  const c = lsGet(key);
  if (!force && c && Date.now() - c.at < MOVE_TTL) return c.data;
  try {
    const r = await fetch(`/api/chart?symbol=${encodeURIComponent(symbol)}&around=${ds.join(",")}${force ? `&_=${Date.now()}` : ""}`);
    if (!r.ok) return {};
    const j = await r.json();
    const data = Object.fromEntries((j.moves || []).map((m) => [m.date, m]));
    // 古いキャッシュ(別の日付の組み合わせ)を掃除してから保存
    try { Object.keys(localStorage).forEach((k) => { if (k.startsWith(`kabu-earnmv:${symbol}:`) && k !== key) localStorage.removeItem(k); }); } catch (e) { /* 無視 */ }
    lsSet(key, { at: Date.now(), data });
    return data;
  } catch (e) { return {}; }
}

/* 値動き1件 → {diff, pct}。どちらかの終値が無ければ null */
export const moveOf = (m) => (m && m.before && m.after ? { diff: m.after[1] - m.before[1], pct: ((m.after[1] - m.before[1]) / m.before[1]) * 100 } : null);
