// 🔮 転生(lib/reborn.js)。node test/reborn.test.mjs
import assert from "node:assert/strict";
import { REBORN_COST, withRebornInit, rebornPointsOf, rebornStateOf, rollReborn, startReborn, previewReborn, settleReborn, currentEvoOf } from "../src/lib/reborn.js";
import { EVO_KIND_KEYS, normEvo } from "../src/data/evolution.js";

let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log("✓", name); };
const st = (over = {}) => ({ id: "a", code: "1721", name: "A", type: "build", status: "hold", noteCount: 0, logs: [], ...over });
const memos = (n) => new Array(n).fill({ date: "", text: "x" });

t("前からいる銘柄は研究ぶんの半分を持つ。新しい銘柄(rebornSpent=0)は全部", () => {
  const old = withRebornInit(st({ noteCount: 5, logs: memos(6) })); // 研究ぶん 21 → 半分(切り上げ11)を使った扱い
  assert.equal(old.rebornSpent, 11);
  assert.equal(rebornPointsOf(old), 10);
  assert.equal(rebornPointsOf(st({ noteCount: 1, rebornSpent: 0 })), 3);
  assert.equal(withRebornInit(old), old); // 2回目は何もしない
});

t("ポイントは調査でだけ増え、使ってもLvは変わらない", () => {
  const s = st({ noteCount: 4, rebornSpent: 0 }); // 12pt
  assert.equal(rebornStateOf(s).ok, true);
  const s2 = startReborn(s, { evoPattern: "hat" });
  assert.equal(rebornPointsOf(s2), 12 - REBORN_COST);
  assert.equal(s2.noteCount, 4);
  assert.equal(rebornStateOf(s2).ok, false); // えらぶまで次は引けない
});

t("足りない・ステージ1・卒業生は転生できない", () => {
  assert.equal(rebornStateOf(st({ noteCount: 3, rebornSpent: 0 })).ok, false); // 9pt
  assert.equal(rebornStateOf(st({ noteCount: 0, logs: memos(2), rebornSpent: -20 })).ok, false); // ST1
  assert.equal(rebornStateOf(st({ noteCount: 9, rebornSpent: 0, status: "sold" })).ok, false);
});

t("かざりは今のもの以外の全種類から。パックが無ければユニークキャラは出ない", () => {
  const s = st({ noteCount: 4, evoPattern: "horns" });
  const seen = new Set();
  for (let i = 0; i < 400; i++) { const o = rollReborn(s, []); assert.ok(!o.special); seen.add(o.evoPattern); }
  assert.ok(!seen.has("horns"));
  assert.equal(seen.size, EVO_KIND_KEYS.length - 1);
});

t("パックがあれば25%でユニークキャラ。今のキャラは出ない", () => {
  const pack = [{ key: "x" }, { key: "y" }];
  assert.deepEqual(rollReborn(st({ noteCount: 4 }), pack, () => 0.1), { special: "x" });
  assert.ok(rollReborn(st({ noteCount: 4 }), pack, () => 0.9).evoPattern);
  assert.deepEqual(rollReborn(st({ noteCount: 4, special: "x" }), pack, () => 0.1), { special: "y" });
});

t("えらぶ: このまま=姿は変わらない / 転生先=かざりが変わる / ユニーク→元の種族にも戻れる", () => {
  const s = startReborn(st({ noteCount: 4, evoPattern: "horns", rebornSpent: 0 }), { evoPattern: "hat" });
  const keep = settleReborn(s, false);
  assert.equal(keep.evoPattern, "horns"); assert.equal(keep.rebornOffer, undefined); assert.equal(keep.rebornSpent, REBORN_COST);
  const go = settleReborn(s, true);
  assert.equal(go.evoPattern, "hat"); assert.equal(go.rebornCount, 1);
  const sp = settleReborn(startReborn(st({ noteCount: 4 }), { special: "x" }), true);
  assert.equal(sp.special, "x"); assert.ok(sp.specialAt);
  const back = settleReborn(startReborn(sp, { evoPattern: "wand" }), true);
  assert.equal(back.special, undefined); assert.equal(back.evoPattern, "wand");
  assert.equal(previewReborn(s).evoPattern, "hat");
});

t("古いかざりの名前は新しいかざりに読み替える", () => {
  assert.equal(normEvo("flame"), "wand"); assert.equal(normEvo("spikes"), "leaf"); assert.equal(normEvo("horns"), "horns");
  assert.equal(currentEvoOf(st({ evoPattern: "antenna" })), "halo");
});

console.log(`\n${passed} passed`);
