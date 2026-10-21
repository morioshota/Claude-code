/* クイックメモに書かれた日付(「決算は8/8」等)を拾って「もうすぐ」を検出する。
   事実(あなた自身が書いた予定)のリマインドのみ。予測・推奨はしない */

import { today } from "./util.js";
import { nextReviewOf, planExpiryOf } from "./plan.js";

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
  // 🧭 つぎの一手に記録した「次に見る日」と「設計の有効期限」(自分で決めた予定の事実)。
  // クイックメモと同じ日なら計画のほうを残す(何を確認する日かが書いてあるため)
  const planned = [
    nextReviewOf(stock) && { ...nextReviewOf(stock), text: `📌 ${nextReviewOf(stock).what || "次に見る日"}` },
    planExpiryOf(stock) && { ...planExpiryOf(stock), text: "📐 エントリー設計の有効期限" },
  ].filter(Boolean);
  planned.forEach((p) => {
    if (p.days < 0 || p.days > horizon) return;
    const dt = new Date(Date.parse(p.date));
    const m = dt.getUTCMonth() + 1, d = dt.getUTCDate();
    const i = out.findIndex((e) => e.m === m && e.d === d);
    const ev = { m, d, days: p.days, text: clipText(p.text), plan: true };
    if (i >= 0) out[i] = ev; else out.push(ev);
  });
  return out.sort((a, b) => a.days - b.days);
};
