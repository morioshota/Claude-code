// 進化演出の種類と なごり(node test/evofx.test.mjs)
import assert from "node:assert/strict";
import { rollEvoFx, applyEvoFxRoll, evoFxOf, EVO_FX } from "../src/data/evolution.js";

// 階級の確率は従来どおり(通常70/レア25/超レア5)、種類は階級の中から
const n = 200000, cnt = { normal: 0, rare: 0, ultra: 0 }, kinds = {};
for (let i = 0; i < n; i++) { const r = rollEvoFx(); cnt[r.tier]++; kinds[r.kind] = (kinds[r.kind] || 0) + 1; assert.equal(EVO_FX[r.kind].tier, r.tier); }
assert.ok(Math.abs(cnt.ultra / n - 0.05) < 0.005 && Math.abs(cnt.rare / n - 0.25) < 0.01);
assert.equal(Object.keys(kinds).length, Object.keys(EVO_FX).length);

const s0 = { code: "7203", noteCount: 1 };
const a = applyEvoFxRoll(s0, { tier: "normal", kind: "kirari" }, 2, "2026-11-14");
assert.equal(a.evoFx, undefined); assert.equal(evoFxOf(a), null); assert.equal(a.evoFxBest, "normal");
const b = applyEvoFxRoll(a, { tier: "rare", kind: "sakura" }, 3, "2026-11-15");
assert.equal(b.evoFx, "sakura"); assert.equal(b.evoFxLog.length, 2);
const c = applyEvoFxRoll(b, { tier: "rare", kind: "shabon" }, 4, "2026-11-16");
assert.equal(c.evoFx, "sakura", "同じ階級なら最初の なごり のまま");
const d = applyEvoFxRoll(c, { tier: "ultra", kind: "ougon" }, 5, "2026-11-17");
assert.equal(d.evoFx, "ougon"); assert.equal(d.evoFxBest, "ultra");
// 古いデータ(階級だけ保存)は証券コードから決定論的に
const old = { code: "6758", evoFxBest: "rare" };
assert.equal(evoFxOf(old), evoFxOf({ ...old })); assert.equal(EVO_FX[evoFxOf(old)].tier, "rare");
assert.equal(EVO_FX[evoFxOf({ code: "NVDA", evoFxBest: "ultra" })].tier, "ultra");
// 古いデータの子がレアをもう一度引いても、いまの なごり は変わらない
assert.equal(applyEvoFxRoll(old, { tier: "rare", kind: "inazuma" }, 3, "x").evoFx, evoFxOf(old));
console.log("evofx: ok");
