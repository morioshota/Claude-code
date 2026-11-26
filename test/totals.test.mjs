// 通算損益(node test/totals.test.mjs)
import assert from "node:assert/strict";
import { totalsOf } from "../src/lib/portfolio.js";

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
const { list, missingSale } = totalsOf(stocks, { a: { close: 1200, currency: "JPY" } });
const t = list[0];
assert.equal(t.unreal, 20000);
assert.equal(t.realized, 5000 + 20000 - 2000);
assert.equal(t.cost, 100000 + 50000 + 100000 + 20000);
assert.equal(t.pnl, 43000);
assert.ok(Math.abs(t.pct - (43000 / 270000) * 100) < 1e-9);
assert.deepEqual(missingSale, ["D"]);
console.log("totals: ok");
