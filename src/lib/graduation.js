/* 🎓 卒業の記録を残したまま、もう一度ウォッチ・保有する(2026-11・オーナー要望)
   以前は「再リリース(卒業→ウォッチ)」でステータスだけ戻していたので、売却の記録(売却日・売却単価・学び・
   買ったときの株数と平均取得単価)が銘柄に残っていても、アルバム・資産の推移から見えなくなっていた
   (どちらも status==="sold" の銘柄しか見ないため)。
   いまは卒業ぶんを stock.graduations[] に1件ずつ控え、アルバム・資産の推移・実現損益はそこからも読む。
   調査記録・メモ・研究Lv・姿は銘柄にそのまま残る(同じ子が、また調べられる)。

   stock.graduations = [{ id, buyDate, soldAt, avgPrice, shares, sellShares, sellPrice, sellReason, lesson, trades }]
   id は売却日から決める(g-YYYY-MM-DD)。2台の端末で別々に読み替えても同じものになる */

export const SALE_FIELDS = ["buyDate", "soldAt", "avgPrice", "shares", "sellShares", "sellPrice", "sellReason", "lesson", "trades"];
const has = (v) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0);
const gradId = (soldAt, list) => {
  let id = `g-${soldAt || "unknown"}`, n = 2;
  while (list.some((g) => g.id === id)) id = `g-${soldAt || "unknown"}-${n++}`;
  return id;
};
const pick = (src, keys) => { const o = {}; keys.forEach((k) => { if (has(src[k])) o[k] = src[k]; }); return o; };

/* 卒業→ウォッチ/保有に戻すとき。before=卒業中の銘柄、after=戻したあとの銘柄(フォームで書き換えた項目を含みうる)
   卒業ぶんを graduations に移し、銘柄からは「前回の売買」の項目を消す(フォームで新しく入れた値は残す) */
export function archiveGraduation(before, after = before) {
  const list = Array.isArray(before.graduations) ? before.graduations : [];
  const g = { id: gradId(before.soldAt, list), ...pick(before, SALE_FIELDS) };
  const out = { ...after, graduations: [...list, g] };
  SALE_FIELDS.forEach((k) => {
    // 値が卒業中のときと同じ(=新しく入れていない)ものだけ消す
    if (JSON.stringify(after[k]) === JSON.stringify(before[k])) delete out[k];
  });
  return out;
}

/* 読み込み時の救済: 以前の「再リリース」で卒業の記録が銘柄に残ったままの子(status が sold 以外なのに soldAt がある)を、
   graduations に移す。保存データは次に保存したときに書き換わる(読み込みでは書かない)
   - ウォッチ中: 前回の売買の項目は全部 前回のもの → まるごと移す
   - 保有中: 株数・平均取得単価が「前回」か「買い直したあと」か区別できないので、銘柄には残したまま写しを取る
     (購入日が売却日より後なら買い直し=前回の株数・単価は分からない) */
export function withGraduations(s) {
  if (!s || s.status === "sold" || !s.soldAt) return s;
  if (s.status !== "hold") return archiveGraduation({ ...s, status: "sold" }, { ...s });
  const list = Array.isArray(s.graduations) ? s.graduations : [];
  const rebought = s.buyDate && s.buyDate > s.soldAt;
  const g = { id: gradId(s.soldAt, list), ...pick(s, ["soldAt", "sellShares", "sellPrice", "sellReason", "lesson"]) };
  if (!rebought) Object.assign(g, pick(s, ["buyDate", "avgPrice", "shares"]));
  const oldTrades = (s.trades || []).filter((t) => t.date && t.date <= s.soldAt);
  if (oldTrades.length && !rebought) g.trades = oldTrades;
  const out = { ...s, graduations: [...list, g] };
  ["soldAt", "sellShares", "sellPrice", "sellReason", "lesson"].forEach((k) => delete out[k]);
  return out;
}

/* アルバム・資産の推移・実現損益で使う「卒業生」の一覧。
   いま卒業中の銘柄はそのまま、前回までの卒業は1件ずつ「その時の姿」の仮の銘柄にする
   (id は `${銘柄のid}#${卒業のid}`。編集は updateGraduate で元の銘柄へ戻す) */
export function graduatesOf(stocks) {
  const out = [];
  (stocks || []).forEach((s) => {
    const past = Array.isArray(s.graduations) ? s.graduations : [];
    const count = past.length + (s.status === "sold" ? 1 : 0);
    past.forEach((g, i) => {
      const base = { ...s };
      SALE_FIELDS.forEach((k) => delete base[k]);
      delete base.graduations;
      out.push({ ...base, ...g, id: `${s.id}#${g.id}`, status: "sold", gradOf: s.id, gradId: g.id, gradNo: i + 1, gradCount: count, ownerStatus: s.status });
    });
    if (s.status === "sold") out.push(past.length ? { ...s, gradNo: count, gradCount: count } : s);
  });
  return out;
}

export const isGraduateId = (id) => String(id).includes("#");
export const ownerIdOf = (id) => String(id).split("#")[0];

/* 仮の銘柄(前回までの卒業)への編集を、元の銘柄の graduations に書き戻す。patch の値が空なら項目を消す */
export function updateGraduate(stocks, vid, patch) {
  const [sid, gid] = String(vid).split("#");
  return stocks.map((s) => {
    if (s.id !== sid) return s;
    return { ...s, graduations: (s.graduations || []).map((g) => {
      if (g.id !== gid) return g;
      const ng = { ...g, ...patch };
      Object.keys(patch).forEach((k) => { if (!has(patch[k])) delete ng[k]; });
      return ng;
    }) };
  });
}
