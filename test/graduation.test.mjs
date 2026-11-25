// 卒業の記録を残したまま、もう一度ウォッチ・保有する(node test/graduation.test.mjs)
import assert from "node:assert/strict";
import { archiveGraduation, withGraduations, graduatesOf, updateGraduate } from "../src/lib/graduation.js";
import { positionsOf } from "../src/lib/portfolio.js";

const sold = { id: "f", name: "富士通", code: "6702", type: "tech", status: "sold", noteCount: 4, logs: [{ date: "2026-05-01", text: "m" }],
  buyDate: "2025-04-01", soldAt: "2026-10-01", avgPrice: 3000, shares: 100, sellShares: 100, sellPrice: 3500, sellReason: "target", lesson: "決算前に入りすぎた" };

// 1) 再リリース(卒業→ウォッチ): 卒業ぶんは控えに移り、研究の記録はそのまま
{
  const w = archiveGraduation(sold, { ...sold, status: "watch" });
  assert.equal(w.status, "watch"); assert.equal(w.soldAt, undefined); assert.equal(w.lesson, undefined); assert.equal(w.avgPrice, undefined);
  assert.equal(w.noteCount, 4); assert.equal(w.logs.length, 1);
  assert.equal(w.graduations.length, 1); assert.equal(w.graduations[0].id, "g-2026-10-01"); assert.equal(w.graduations[0].lesson, "決算前に入りすぎた");
  const gs = graduatesOf([w]);
  assert.equal(gs.length, 1); assert.equal(gs[0].status, "sold"); assert.equal(gs[0].sellPrice, 3500); assert.equal(gs[0].id, "f#g-2026-10-01"); assert.equal(gs[0].noteCount, 4);
  // 資産の推移にも保有期間が残る
  const ps = positionsOf([w]);
  assert.equal(ps.length, 1); assert.equal(ps[0].from, "2025-04-01"); assert.equal(ps[0].to, "2026-10-01"); assert.equal(ps[0].shares, 100);
  // アルバムで学びを直すと控えに書き戻る
  const e = updateGraduate([w], "f#g-2026-10-01", { lesson: "直した" });
  assert.equal(e[0].graduations[0].lesson, "直した");
  // もう一度買って、もう一度卒業 → アルバムには2回ぶん、資産の推移にも2期間
  const h = { ...w, status: "hold", buyDate: "2026-11-10", avgPrice: 3200, shares: 50 };
  const s2 = { ...h, status: "sold", soldAt: "2027-02-01", sellPrice: 3600 };
  const all = graduatesOf([s2]);
  assert.equal(all.length, 2); assert.deepEqual(all.map((g) => g.gradNo), [1, 2]);
  assert.equal(positionsOf([s2]).length, 2);
  // フォームで同時に新しい株数を入れたなら、それは残す
  const f2 = archiveGraduation(sold, { ...sold, status: "hold", shares: 30, avgPrice: 2900, buyDate: "2026-11-20" });
  assert.equal(f2.shares, 30); assert.equal(f2.graduations[0].shares, 100);
}

// 2) 救済: 以前の再リリースで status だけ戻っていた子
{
  const old = { ...sold, status: "watch" };
  const m = withGraduations(old);
  assert.equal(m.soldAt, undefined); assert.equal(m.graduations.length, 1); assert.equal(m.graduations[0].avgPrice, 3000);
  assert.equal(withGraduations(m), m, "2回読み込んでも増えない");
  assert.equal(withGraduations(sold), sold, "卒業中はそのまま");
  // 保有中に戻していた子: 買い直し(購入日が売却日より後)なら今の株数・単価は残す
  const hold = withGraduations({ ...sold, status: "hold", buyDate: "2026-11-01", avgPrice: 3300, shares: 10 });
  assert.equal(hold.shares, 10); assert.equal(hold.avgPrice, 3300); assert.equal(hold.soldAt, undefined);
  assert.equal(hold.graduations[0].sellPrice, 3500); assert.equal(hold.graduations[0].avgPrice, undefined);
}
console.log("graduation: ok");
