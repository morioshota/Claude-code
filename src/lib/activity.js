/* 研究活動の記録(草カレンダー用)
   storage key: kabu-activity-v1 = { days: {"YYYY-MM-DD": 回数}, seeded: true }
   「回数」は調査記録・クイックメモ・銘柄登録・トリガー点検などの研究行動の数。
   株価や市場とは無関係——研究の習慣そのものを可視化する。 */

import { storage } from "./storage.js";
import { today } from "./util.js";

const KEY = "kabu-activity-v1";

export const loadActivity = async () => {
  try {
    const res = await storage.get(KEY);
    const data = res && res.value ? JSON.parse(res.value) : null;
    if (data && typeof data.days === "object") return data;
  } catch (e) { /* 壊れていたら作り直す(草は派生データなので実害なし) */ }
  return { days: {}, seeded: false };
};

const save = async (data) => {
  try { await storage.set(KEY, JSON.stringify(data)); } catch (e) { /* 保存失敗しても本体に影響させない */ }
};

/* 今日の活動を+n。更新後のdataを返す(UI即時反映用) */
export const recordActivity = async (n = 1) => {
  const data = await loadActivity();
  const d = today();
  data.days[d] = (data.days[d] || 0) + n;
  await save(data);
  return data;
};

/* 初回のみ: 既存のクイックメモ・調査記録の日付から過去の草を復元する */
export const seedActivity = async (stocks, loadNotesFn) => {
  const data = await loadActivity();
  if (data.seeded) return data;
  for (const s of stocks) {
    for (const log of s.logs || []) {
      if (log.date) data.days[log.date] = (data.days[log.date] || 0) + 1;
    }
    try {
      const notes = await loadNotesFn(s.id);
      for (const n of notes || []) {
        if (n.date) data.days[n.date] = (data.days[n.date] || 0) + 1;
      }
    } catch (e) { /* 読めない記録はスキップ */ }
  }
  data.seeded = true;
  await save(data);
  return data;
};

/* 連続日数(今日または昨日まで継続中)と最長記録 */
export const streaks = (days) => {
  const set = new Set(Object.keys(days).filter((d) => days[d] > 0));
  const dayMs = 86400000;
  const toStr = (t) => new Date(t).toISOString().slice(0, 10);
  // 現在の連続: 今日から遡る(今日まだ活動してなければ昨日から)
  let cur = 0;
  let t = Date.now();
  if (!set.has(toStr(t))) t -= dayMs;
  while (set.has(toStr(t))) { cur++; t -= dayMs; }
  // 最長連続
  let max = 0;
  for (const d of set) {
    const prev = toStr(new Date(d + "T00:00:00").getTime() - dayMs);
    if (set.has(prev)) continue; // 連続の先頭だけから数える
    let len = 0;
    let tt = new Date(d + "T00:00:00").getTime();
    while (set.has(toStr(tt))) { len++; tt += dayMs; }
    if (len > max) max = len;
  }
  return { current: cur, max };
};

export const ACTIVITY_KEY = KEY;
