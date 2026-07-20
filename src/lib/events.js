/* クイックメモに書かれた日付(「決算は8/8」等)を拾って「もうすぐ」を検出する。
   事実(あなた自身が書いた予定)のリマインドのみ。予測・推奨はしない */

import { today } from "./util.js";

const DAY_MS = 86400000;

/* 「8/8」「8月8日」「2026-08-08」を拾う */
const DATE_RE = /(\d{4})-(\d{1,2})-(\d{1,2})|(\d{1,2})[/月](\d{1,2})日?/g;

const clipText = (t, n = 22) => {
  const s = String(t || "").replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
};

/* stockのクイックメモから今後horizon日以内の予定を返す: [{m, d, days, text}] */
export const upcomingEvents = (stock, horizon = 21) => {
  const now = Date.parse(today());
  const out = [];
  const seen = new Set();
  for (const log of stock.logs || []) {
    const text = String(log.text || "");
    for (const m of text.matchAll(DATE_RE)) {
      let when;
      if (m[1]) {
        when = Date.parse(`${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`);
      } else {
        const mo = +m[4], da = +m[5];
        if (mo < 1 || mo > 12 || da < 1 || da > 31) continue;
        const y = new Date(now).getUTCFullYear();
        when = Date.UTC(y, mo - 1, da);
        if (when < now) when = Date.UTC(y + 1, mo - 1, da); // 年をまたぐ予定(12月に書いた1/15など)
      }
      if (!Number.isFinite(when)) continue;
      const days = Math.round((when - now) / DAY_MS);
      if (days < 0 || days > horizon) continue;
      const dt = new Date(when);
      const key = `${dt.getUTCMonth() + 1}/${dt.getUTCDate()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), days, text: clipText(text) });
    }
  }
  return out.sort((a, b) => a.days - b.days);
};
