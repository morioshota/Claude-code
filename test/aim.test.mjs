// 👀 ねらいめライン(lib/aim.js)の判定。node test/aim.test.mjs
import assert from "node:assert/strict";
import { aimStateOf, aimTextOf, hasAim } from "../src/lib/aim.js";

let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log("✓", name); };
const watch = (entries) => ({ status: "watch", plan: { entries } });
const q = (close) => ({ close, currency: "JPY" });

t("指値が無い・保有中・株価が無いときは対象外", () => {
  assert.equal(aimStateOf(watch([]), q(100)), null);
  assert.equal(aimStateOf({ status: "hold", plan: { entries: [{ label: "打診", price: 100 }] } }, q(100)), null);
  assert.equal(aimStateOf(watch([{ label: "打診", price: 100 }]), null), null);
  assert.equal(hasAim(watch([{ label: "打診", price: 100 }])), true);
});

t("5%より遠ければ far、5%以内なら near(いちばん高い段で判定)", () => {
  const s = watch([{ label: "本命", price: 3000 }, { label: "打診", price: 3200 }]);
  assert.equal(aimStateOf(s, q(3400)).state, "far");        // 3200まで +6.25%
  const n = aimStateOf(s, q(3300));                          // 3200まで +3.1%
  assert.equal(n.state, "near");
  assert.equal(n.entry.label, "打診");
  assert.equal(aimTextOf(n, "JPY"), "ねらいめライン（打診 3,200円）まであと3.1%");
});

t("届いたら hit。届いたうち深い段と、次の段までの距離", () => {
  const s = watch([{ label: "打診", price: 3200 }, { label: "本命", price: 3000 }]);
  const h = aimStateOf(s, q(3100));
  assert.equal(h.state, "hit");
  assert.equal(h.entry.label, "打診");
  assert.equal(h.next.entry.label, "本命");
  assert.ok(Math.abs(h.next.dist - 3.333) < 0.01);
  const all = aimStateOf(s, q(2900));
  assert.equal(all.entry.label, "本命");
  assert.equal(all.next, null);
  assert.equal(aimTextOf(all, "JPY"), "ねらいめライン（本命 3,000円）に到達");
});

console.log(`\n${passed} passed`);
