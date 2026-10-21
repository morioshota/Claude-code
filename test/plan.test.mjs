/* 🧭 つぎの一手(lib/plan.js)と、撤退ライン優先の判定(lib/holdings.js)のテスト。
   実行: node test/plan.test.mjs */

import assert from "node:assert/strict";
import { parsePlanSummary, parseDateLoose, cleanPlan, mergePlan, nextReviewOf, planExpiryOf, dueReviews, exitPriceOf } from "../src/lib/plan.js";
import { stopLossRuleOf, stopLossStateOf, stopLossLabelOf, marginToStopLoss } from "../src/lib/holdings.js";
import { upcomingEvents } from "../src/lib/events.js";
import { today } from "../src/lib/util.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok -", name); };
const addDays = (d) => new Date(Date.parse(today()) + d * 86400000).toISOString().slice(0, 10);

t("entry-plan の記録用サマリーを読み取る", () => {
  const text = `### 記録用サマリー(銘柄図鑑・日次レビュー連携用)
- ステータス: エントリー設計済
- 指値: 打診3,200円 / 追加①3,000円 / 追加②2,800円
- 撤退ライン: 週足終値2,650円割れ
- 目標: 第1 4,000円
- 設計の有効期限: 2026-11-07(株価が3,000〜3,500円を外れたら組み直し)
- 次の答え合わせ日: 2026-11-07(2Q決算)`;
  const { patch, found } = parsePlanSummary(text, "2026-10-21");
  assert.equal(patch.step, "designed");
  assert.deepEqual(patch.entries, [
    { label: "打診", price: 3200 }, { label: "追加①", price: 3000 }, { label: "追加②", price: 2800 },
  ]);
  assert.equal(patch.exitPrice, 2650);
  assert.equal(patch.target, 4000);
  assert.equal(patch.validUntil, "2026-11-07");
  assert.equal(patch.nextDate, "2026-11-07");
  assert.equal(patch.nextWhat, "2Q決算");
  assert.deepEqual(found.sort(), ["すすみぐあい", "指値", "撤退ライン", "目標", "設計の有効期限", "次に見る日"].sort());
});

t("株ナビの締めの一行を読み取る(年なしの日付は今日以降の最も近い日)", () => {
  const { patch } = parsePlanSummary("次: ステータス「調査済」/ 次回は11月7日の決算後に entry-plan で組み直し", "2026-10-21");
  assert.equal(patch.step, "researched");
  assert.equal(patch.nextDate, "2026-11-07");
  assert.match(patch.nextWhat, /11月7日の決算後/);
  // 12月に書いた「1/15」は翌年
  assert.equal(parseDateLoose("1/15", "2026-12-20"), "2027-01-15");
  assert.equal(parseDateLoose("2/30", "2026-01-01"), null);
});

t("米国株(ドル・小数)と表記ゆれ", () => {
  const { patch } = parsePlanSummary("* 指値：打診 $99.5 / 追加① 92\n* 撤退ライン：週足終値で $85.25 割れ\n* 次回決算: 2026/11/10", "2026-10-21");
  assert.deepEqual(patch.entries.map((e) => e.price), [99.5, 92]);
  assert.equal(patch.exitPrice, 85.25);
  assert.equal(patch.nextDate, "2026-11-10");
  assert.equal(patch.nextWhat, "決算");
});

t("読めない文章は何も返さない", () => {
  const { patch, found } = parsePlanSummary("今日は大きく下げた。地合いのせいかも。");
  assert.deepEqual(patch, {});
  assert.deepEqual(found, []);
});

t("cleanPlan は空の項目を落とし、何も無ければ null", () => {
  assert.equal(cleanPlan({ step: "", entries: [{ price: "" }], exitPrice: "", nextDate: "" }), null);
  const p = cleanPlan({ step: "bogus", entries: [{ label: "", price: "1,000" }], exitPrice: "900" });
  assert.equal(p.step, undefined);
  assert.deepEqual(p.entries, [{ label: "打診", price: 1000 }]);
  assert.equal(p.exitPrice, 900);
  assert.ok(p.updatedAt);
});

t("mergePlan は取り込んだ項目だけ上書きする", () => {
  const p = mergePlan({ exitPrice: 2650, target: 4000, nextDate: "2026-11-07" }, { exitPrice: 2700 });
  assert.equal(p.exitPrice, 2700);
  assert.equal(p.target, 4000);
  assert.equal(p.nextDate, "2026-11-07");
});

const held = (plan, extra = {}) => ({ status: "hold", shares: 100, avgPrice: 3000, plan, logs: [], ...extra });
const q = (close) => ({ close, currency: "JPY" });

t("撤退ライン(価格)があれば にげるライン(%)より優先する", () => {
  const s = held({ exitPrice: 2650 }, { stopLossPct: -20 });
  assert.equal(exitPriceOf(s), 2650);
  assert.deepEqual(stopLossRuleOf(s), { kind: "price", price: 2650 });
  assert.equal(stopLossStateOf(s, q(2600)), "over");
  assert.equal(stopLossStateOf(s, q(2700)), "near"); // (2700-2650)/2700 = 1.85% ≤ 2%
  assert.equal(stopLossStateOf(s, q(2900)), "ok");
  assert.equal(marginToStopLoss(s, q(2600)), 0);
  assert.equal(stopLossLabelOf(s, "JPY"), "撤退ライン 2,650円");
});

t("撤退ラインが無ければ従来どおり(%)。判定しない(0)も維持", () => {
  const s = held(undefined);
  assert.deepEqual(stopLossRuleOf(s), { kind: "pct", pct: -8, price: 2760 });
  assert.equal(stopLossStateOf(s, q(2700)), "over");
  assert.equal(stopLossLabelOf(s), "にげるライン -8%");
  assert.equal(stopLossRuleOf(held(undefined, { stopLossPct: 0 })), null);
  // 判定しない設定でも、撤退ラインを記録したらそれで判定する
  assert.equal(stopLossStateOf(held({ exitPrice: 2650 }, { stopLossPct: 0 }), q(2600)), "over");
  // ウォッチ中は保有情報が無いので判定しない
  assert.equal(stopLossRuleOf({ status: "watch", plan: { exitPrice: 2650 } }), null);
});

t("次に見る日・設計の期限・📌の対象", () => {
  const w = { id: "w", name: "W", status: "watch", logs: [], plan: { entries: [{ label: "打診", price: 1 }], validUntil: addDays(3), nextDate: addDays(-2), nextWhat: "決算" } };
  const h = { id: "h", name: "H", status: "hold", logs: [], plan: { nextDate: addDays(30) } };
  const sold = { id: "s", name: "S", status: "sold", logs: [], plan: { nextDate: addDays(1) } };
  assert.equal(nextReviewOf(w).days, -2);
  assert.equal(planExpiryOf(w).days, 3);
  assert.equal(planExpiryOf(h), null);
  assert.equal(nextReviewOf(sold), null);
  const due = dueReviews([w, h, sold], 7);
  assert.deepEqual(due.map((d) => `${d.stock.id}:${d.kind}`), ["w:review", "w:expiry"]);
});

t("🗓もうすぐ(牧場)に次に見る日が出る。同じ日のメモより計画を優先", () => {
  const d = addDays(5);
  const s = { status: "hold", logs: [{ date: today(), text: `決算は${+d.slice(5, 7)}/${+d.slice(8, 10)}` }], plan: { nextDate: d, nextWhat: "2Q決算で照合" } };
  const ev = upcomingEvents(s);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].plan, true);
  assert.match(ev[0].text, /📌 2Q決算で照合/);
});

console.log(`\n${n} tests passed`);
