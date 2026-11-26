// 通算損益(node test/totals.test.mjs)
import assert from "node:assert/strict";
import { totalsOf, avgCostOf } from "../src/lib/portfolio.js";

const stocks = [
  // 保有中: 100株×1000円 → 1200円(含み +20,000)。一部売却 50株を1100円で(確定 +5,000・売った分の取得額 50,000)
  { id: "a", name: "A", code: "1111", status: "hold", shares: 100, avgPrice: 1000,
    trades: [{ id: "1", date: "2026-01-01", kind: "buy", shares: 150, price: 1000, initial: true }, { id: "2", date: "2026-02-01", kind: "sell", shares: 50, price: 1100 }] },
  // 卒業: 200株 平均500 → 600で売却(確定 +20,000・取得額 100,000)
  { id: "b", name: "B", code: "2222", status: "sold", shares: 200, avgPrice: 500, sellPrice: 600, buyDate: "2025-01-01", soldAt: "2026-01-01" },
  // 前回の卒業があり、いまはウォッチ: 10株 平均2000 → 1800で売却(確定 −2,000・取得額 20,000)
  { id: "c", name: "C", code: "3333", status: "watch", graduations: [{ id: "g-2026-03-01", avgPrice: 2000, shares: 10, sellPrice: 1800, soldAt: "2026-03-01" }] },
  // 売却単価が無い卒業生は数えない
  { id: "d", name: "D", code: "4444", status: "sold", shares: 10, avgPrice: 100 },
];
const { list, missingSale } = totalsOf(stocks, { a: { close: 1200, currency: "JPY" } }, "2026-12-31");
const t = list[0];
assert.equal(t.unreal, 20000);
assert.equal(t.realized, 5000 + 20000 - 2000);
assert.equal(t.pnl, 43000);
assert.equal(t.pct, (43000 / t.avgCost) * 100);
assert.deepEqual(missingSale, ["D"]);

// 平均取得額: 売って買い直しても積み上がらない(オーナーの例: 100万円で1〜6月A社、7〜12月B社 → 平均100万円)
{
  const ex = [
    { id: "A", name: "A", code: "1001", status: "sold", shares: 100, avgPrice: 10000, buyDate: "2025-01-01", soldAt: "2025-07-01", sellPrice: 10500 },
    { id: "B", name: "B", code: "1002", status: "hold", shares: 100, avgPrice: 10000, buyDate: "2025-07-01" },
  ];
  const r = avgCostOf(ex, "2025-12-31").by.JPY;
  assert.ok(Math.abs(r.avgCost - 1000000) < 1, String(r.avgCost));
  // 途中で買い足し: 前半100万・後半300万 → 平均およそ200万
  const ex2 = [{ id: "C", name: "C", code: "1003", status: "hold", trades: [
    { id: "1", date: "2025-01-01", kind: "buy", shares: 100, price: 10000, initial: true },
    { id: "2", date: "2025-07-02", kind: "buy", shares: 200, price: 10000 }] }];
  const r2 = avgCostOf(ex2, "2025-12-31").by.JPY;
  assert.ok(Math.abs(r2.avgCost - 2000000) < 20000, String(r2.avgCost));
  assert.deepEqual(avgCostOf([{ id: "D", name: "D", code: "1004", status: "hold", shares: 1, avgPrice: 1 }], "2025-12-31").noDate, ["D"]);
}
console.log("totals: ok");
