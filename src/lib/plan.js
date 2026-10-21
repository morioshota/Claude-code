/* 🧭 つぎの一手(チャットの株スキルで決めた計画の控え)。
   kabu-research / kabu-entry-plan / kabu-position-decision が出す「記録用サマリー」の中身を
   stock.plan に保存する。すべてオーナー自身が事前に決めた条件の備忘であって、
   この図鑑からの売買推奨ではない(CLAUDE.md)。抽選・ガチャには一切関与しない(不変条件5)。

   stock.plan = {
     step: "todo" | "researched" | "designed",   // すすみぐあい(ウォッチ中のみ意味を持つ)
     entries: [{ label: "打診", price: 3200 }, ...], // 指値(最大3段)
     exitPrice: 2650,          // 撤退ライン(週足終値で判定)。あれば にげるライン(%) より優先
     target: 4000,             // 第1利確の目安(kabu-research)
     validUntil: "YYYY-MM-DD", // エントリー設計の有効期限
     nextDate: "YYYY-MM-DD",   // 次に見る日(答え合わせ日・決算日)
     nextWhat: "2Q決算で実力営業利益を照合",
     updatedAt: "YYYY-MM-DD",
   }
   ⚠ 研究ステージ(レアリティ)とは別物。名前がぶつからないよう画面では「すすみぐあい」と呼ぶ */

import { today } from "./util.js";

const DAY_MS = 86400000;

export const PLAN_STEPS = {
  todo:       { label: "未調査", icon: "🔍", hint: "kabu-research で調べる段階" },
  researched: { label: "調査済", icon: "📘", hint: "kabu-entry-plan で買付を設計する段階" },
  designed:   { label: "設計済", icon: "📐", hint: "指値を置いて待つ段階" },
};
export const PLAN_STEP_KEYS = Object.keys(PLAN_STEPS);

const posNum = (v) => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[,，\s円$]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const isDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v));

/* 保存用に整える: 空の項目は消し、何も残らなければ null(=フィールドごと消す) */
export const cleanPlan = (p) => {
  if (!p || typeof p !== "object") return null;
  const out = {};
  if (PLAN_STEPS[p.step]) out.step = p.step;
  const entries = (Array.isArray(p.entries) ? p.entries : [])
    .map((e) => ({ label: String((e && e.label) || "").trim().slice(0, 12), price: posNum(e && e.price) }))
    .filter((e) => e.price !== null)
    .slice(0, 3);
  if (entries.length) out.entries = entries.map((e, i) => ({ label: e.label || ENTRY_LABELS[i], price: e.price }));
  const exit = posNum(p.exitPrice); if (exit !== null) out.exitPrice = exit;
  const target = posNum(p.target); if (target !== null) out.target = target;
  if (isDate(p.validUntil)) out.validUntil = p.validUntil;
  if (isDate(p.nextDate)) out.nextDate = p.nextDate;
  const what = String(p.nextWhat || "").trim().slice(0, 80);
  if (what) out.nextWhat = what;
  const keys = Object.keys(out);
  if (!keys.length) return null;
  out.updatedAt = isDate(p.updatedAt) ? p.updatedAt : today();
  return out;
};

export const ENTRY_LABELS = ["打診", "追加①", "追加②"];

/* 記録された撤退ライン(価格)。無ければ null */
export const exitPriceOf = (stock) => posNum(stock && stock.plan && stock.plan.exitPrice);

const daysUntil = (date, now = Date.parse(today())) => Math.round((Date.parse(date) - now) / DAY_MS);

/* 次に見る日。{date, what, days}(days<0 は期日を過ぎている)。売却済み・未設定は null */
export const nextReviewOf = (stock) => {
  const p = stock && stock.plan;
  if (!p || stock.status === "sold" || !isDate(p.nextDate)) return null;
  return { date: p.nextDate, what: p.nextWhat || "", days: daysUntil(p.nextDate) };
};

/* エントリー設計の有効期限。ウォッチ中だけ。{date, days} */
export const planExpiryOf = (stock) => {
  const p = stock && stock.plan;
  if (!p || stock.status !== "watch" || !isDate(p.validUntil) || !(p.entries || []).length) return null;
  return { date: p.validUntil, days: daysUntil(p.validUntil) };
};

/* 図鑑ヘッダーの📌に出す銘柄: 次に見る日が within 日以内か過ぎている / 設計の期限切れ */
export const dueReviews = (stocks, within = 7) => {
  const out = [];
  (stocks || []).forEach((s) => {
    const r = nextReviewOf(s);
    if (r && r.days <= within) out.push({ stock: s, kind: "review", date: r.date, days: r.days, text: r.what });
    const x = planExpiryOf(s);
    if (x && x.days <= within) out.push({ stock: s, kind: "expiry", date: x.date, days: x.days, text: "エントリー設計の有効期限" });
  });
  return out.sort((a, b) => a.days - b.days);
};

/* ---- 記録用サマリーの貼り付け取り込み ----
   チャットの株スキルが最後に出す、次のような箇条を読み取る(多少の揺れは許す):
     - ステータス: エントリー設計済
     - 指値: 打診3,200円 / 追加①3,000円 / 追加②2,800円
     - 撤退ライン: 週足終値2,650円割れ
     - 目標: 第1 4,000円
     - 設計の有効期限: 2026-11-07(株価が…)
     - 次の答え合わせ日: 2026-11-07(2Q決算)
     次: ステータス「調査済」/ 次回は11月7日の決算後に entry-plan で組み直し
   読めなかった行は無視して、読めた項目だけを返す(画面で確認してから反映する) */

const NUM = String.raw`(\d{1,3}(?:[,，]\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)`;
const numIn = (s) => { const m = String(s).match(new RegExp(NUM)); return m ? posNum(m[1]) : null; };

/* 「2026-11-07」「2026/11/7」「11/7」「11月7日」→ YYYY-MM-DD(年なしは今日以降で最も近い日) */
export const parseDateLoose = (s, base = today()) => {
  const t = String(s || "");
  let m = t.match(/(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})/);
  if (m) return fmtYmd(+m[1], +m[2], +m[3]);
  m = t.match(/(\d{1,2})\s*[/月]\s*(\d{1,2})日?/);
  if (!m) return null;
  const mo = +m[1], da = +m[2];
  if (mo < 1 || mo > 12 || da < 1 || da > 31) return null;
  const y = +base.slice(0, 4);
  const cand = fmtYmd(y, mo, da);
  return cand && cand < base ? fmtYmd(y + 1, mo, da) : cand;
};
const fmtYmd = (y, m, d) => {
  const s = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const dt = new Date(s + "T00:00:00Z");
  return isNaN(dt) || dt.getUTCMonth() + 1 !== m ? null : s;
};

const stepFromText = (s) => {
  if (/未調査/.test(s)) return "todo";
  if (/設計/.test(s)) return "designed";
  if (/調査済|調査完了|リサーチ済/.test(s)) return "researched";
  return null;
};

/* 括弧の中身(補足)を取り出す: 「2026-11-07(2Q決算)」→「2Q決算」 */
const paren = (s) => { const m = String(s).match(/[（(]([^）)]+)[）)]/); return m ? m[1].trim() : ""; };

export const parsePlanSummary = (text, base = today()) => {
  const patch = {};
  const found = [];
  const lines = String(text || "").split(/\r?\n/).map((l) => l.replace(/^\s*(?:[-*・>]|\d+\.)\s*/, "").trim()).filter(Boolean);
  for (const line of lines) {
    const [rawKey, ...rest] = line.split(/[:：]/);
    const key = rawKey.trim();
    const val = rest.join(":").trim();
    if (!val) {
      // 株ナビの一行「次: ステータス「調査済」/ 次回は11月7日…」はコロンで割れるのでここには来ない
      continue;
    }
    if (/^ステータス|すすみぐあい/.test(key)) {
      const st = stepFromText(val); if (st) { patch.step = st; found.push("すすみぐあい"); }
    } else if (/^指値/.test(key)) {
      const entries = [];
      val.split(/[/／、,]\s*(?=[^\d])/).forEach((part, i) => {
        const price = numIn(part); if (price === null) return;
        const label = (part.match(/^\s*([^\d\s]+?)\s*[\d]/) || [])[1];
        entries.push({ label: (label || ENTRY_LABELS[i] || "").replace(/[:：]/g, "").trim(), price });
      });
      if (entries.length) { patch.entries = entries.slice(0, 3); found.push("指値"); }
    } else if (/撤退/.test(key)) {
      const p = numIn(val.replace(/週足終値/, "")); if (p !== null) { patch.exitPrice = p; found.push("撤退ライン"); }
    } else if (/^目標|利確/.test(key)) {
      const p = numIn(val.replace(/第\s*[1１一]\s*/, "")); if (p !== null) { patch.target = p; found.push("目標"); }
    } else if (/有効期限|期限/.test(key)) {
      const d = parseDateLoose(val, base); if (d) { patch.validUntil = d; found.push("設計の有効期限"); }
    } else if (/答え合わせ|次に見る|見直し日|次回/.test(key)) {
      const d = parseDateLoose(val, base);
      if (d) {
        patch.nextDate = d;
        const w = paren(val) || (/決算/.test(key) ? "決算" : "");
        if (w) patch.nextWhat = w;
        found.push("次に見る日");
      }
    } else if (/^次$/.test(key)) {
      // 株ナビの締めの一行。ステータスと、日付があれば次に見る日を拾う
      const st = stepFromText(val); if (st && !patch.step) { patch.step = st; found.push("すすみぐあい"); }
      const d = parseDateLoose(val.replace(/^[^/／]*[/／]/, ""), base);
      if (d && !patch.nextDate) {
        patch.nextDate = d;
        const w = val.split(/[/／]/).slice(1).join("/").trim();
        if (w) patch.nextWhat = w.slice(0, 80);
        found.push("次に見る日");
      }
    }
  }
  return { patch, found: [...new Set(found)] };
};

/* 既存の計画に取り込み結果を重ねる(取り込んだ項目だけ上書き) */
export const mergePlan = (current, patch) => cleanPlan({ ...(current || {}), ...patch, updatedAt: today() });
