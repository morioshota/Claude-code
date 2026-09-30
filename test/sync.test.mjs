/* 同期の3者マージのテスト(2台の端末を1つのNodeで再現する)
   node test/sync.test.mjs
   ログインはサーバーの署名鍵から直接Cookieを作って省略する(パスキーのテストはブラウザ側で行う) */
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { mockRedis } from "./sync-mock.mjs";

process.env.SYNC_SETUP_CODE = "test-code";
const { default: handler, __setRedis } = await import("../api/sync.js");
const redis = mockRedis();
__setRedis(redis);

/* ---- 端末ごとの localStorage ---- */
class Store {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}
/* ---- fetch → handler ---- */
let cookie = "";
globalThis.fetch = async (url, opt = {}) => {
  const bodyStr = opt.body || "";
  const req = { url, method: opt.method || "GET", headers: { host: "localhost:5173", cookie }, body: bodyStr ? JSON.parse(bodyStr) : undefined };
  const out = { status: 200, headers: {}, body: "" };
  const res = { set statusCode(v) { out.status = v; }, setHeader(k, v) { out.headers[k.toLowerCase()] = v; }, end(b) { out.body = b; } };
  await handler(req, res);
  return { ok: out.status < 300, status: out.status, json: async () => JSON.parse(out.body || "{}") };
};

async function makeDevice(name) {
  const ls = new Store();
  globalThis.localStorage = ls; // sync.js は読み込み時の localStorage をつかむ
  const mod = await import(`../src/lib/sync.js?dev=${name}`);
  return { name, ls, mod };
}
const secret = async () => { await redis.setnx("kd:secret", "test-secret"); return redis.m.get("kd:secret"); };
const exp = String(Date.now() + 80 * 86400e3);
const sess = async () => `kd_s=${exp}.${crypto.createHmac("sha256", await secret()).update(exp).digest("base64url")}`;

const K = "kabu-zukan-v1", A = "kabu-activity-v1", N = (id) => `kabu-notes:${id}`;
const stocks = (d) => JSON.parse(d.ls.getItem(K)).stocks;
const put = (d, arr) => d.ls.setItem(K, JSON.stringify({ stocks: arr }));
const notes = (d, id) => JSON.parse(d.ls.getItem(N(id)) || "[]");
const edit = (d, id, fn) => put(d, stocks(d).map((s) => (s.id === id ? fn({ ...s }) : s)));
const sync = async (d, mode) => { cookie = await sess(); const r = await d.mod.syncNow(mode); if (r && r.error) throw r.error; return r; };

const st = (id, no, extra = {}) => ({ id, no, name: `銘柄${id}`, code: String(1000 + no), type: "build", status: "watch", logs: [], noteCount: 0, lastResearch: "", triggers: [], bullets: [], risks: [], ...extra });

let passed = 0;
const t = async (title, fn) => { await fn(); passed++; console.log("✓", title); };

const phone = await makeDevice("phone");
const pc = await makeDevice("pc");

await t("1台目: クラウドが空なら、この端末の図鑑を送る", async () => {
  put(phone, [st("a", 1, { noteCount: 1 }), st("b", 2, { logs: [{ date: "2026-09-01", text: "決算メモ" }] })]);
  phone.ls.setItem(N("a"), JSON.stringify([{ id: "n1", date: "2026-09-02", title: "初回", body: "本文" }]));
  phone.ls.setItem(A, JSON.stringify({ days: { "2026-09-01": 2 }, seeded: true }));
  await sync(phone, "auto");
  const doc = JSON.parse(redis.m.get("kd:doc"));
  assert.equal(doc.stocks.length, 2);
  assert.ok(redis.m.get("kd:notes:a"));
});

await t("2台目: 初期データだけの端末は自動でクラウドを使う", async () => {
  const { SEED } = await import("../src/data/constants.js");
  put(pc, SEED.map((s, i) => ({ ...s, id: `seed${i}`, no: i + 1, noteCount: 0, lastResearch: "" })));
  const r = await sync(pc, "auto");
  assert.equal(r.applied, true);
  assert.deepEqual(stocks(pc).map((s) => s.id), ["a", "b"]);
  assert.equal(notes(pc, "a")[0].body, "本文");
  assert.equal(JSON.parse(pc.ls.getItem(A)).days["2026-09-01"], 2);
});

await t("記録のある端末がつなぐときは、どちらを使うか聞く", async () => {
  const third = await makeDevice("third");
  put(third, [st("x", 1, { logs: [{ date: "2026-09-03", text: "x" }] })]);
  const r = await sync(third, "auto");
  assert.ok(r.needChoice);
  assert.equal(r.needChoice.cloud, 2);
  assert.equal(stocks(third)[0].id, "x"); // 何も書き換えていない
});

await t("別々の項目を同時に変えたら、両方とも残る", async () => {
  edit(phone, "a", (s) => ({ ...s, hypothesis: "iPhoneで書いた仮説" }));
  edit(pc, "a", (s) => ({ ...s, shares: 100, avgPrice: 3000 }));
  await sync(phone); await sync(pc); await sync(phone);
  for (const d of [phone, pc]) {
    const a = stocks(d).find((s) => s.id === "a");
    assert.equal(a.hypothesis, "iPhoneで書いた仮説");
    assert.equal(a.shares, 100);
  }
});

await t("クイック記録を両方で足したら、どちらも残る(日付順)", async () => {
  edit(phone, "b", (s) => ({ ...s, logs: [...s.logs, { date: "2026-09-10", text: "iPhoneのメモ" }], lastResearch: "2026-09-10" }));
  edit(pc, "b", (s) => ({ ...s, logs: [...s.logs, { date: "2026-09-05", text: "PCのメモ" }], lastResearch: "2026-09-05" }));
  await sync(pc); await sync(phone); await sync(pc);
  for (const d of [phone, pc]) {
    const b = stocks(d).find((s) => s.id === "b");
    assert.deepEqual(b.logs.map((l) => l.text), ["決算メモ", "PCのメモ", "iPhoneのメモ"]);
    assert.equal(b.lastResearch, "2026-09-10");
  }
});

await t("調査記録を両方で足したら、どちらも残り件数もそろう", async () => {
  phone.ls.setItem(N("a"), JSON.stringify([...notes(phone, "a"), { id: "n2", date: "2026-09-11", title: "iPhone", body: "p" }]));
  edit(phone, "a", (s) => ({ ...s, noteCount: 2, lastResearch: "2026-09-11" }));
  pc.ls.setItem(N("a"), JSON.stringify([...notes(pc, "a"), { id: "n3", date: "2026-09-12", title: "PC", body: "c" }]));
  edit(pc, "a", (s) => ({ ...s, noteCount: 2, lastResearch: "2026-09-12" }));
  await sync(phone); await sync(pc); await sync(phone);
  for (const d of [phone, pc]) {
    assert.deepEqual(notes(d, "a").map((n) => n.id), ["n1", "n2", "n3"]);
    assert.equal(stocks(d).find((s) => s.id === "a").noteCount, 3);
  }
});

await t("片方で記録を消したら、もう片方からも消える", async () => {
  phone.ls.setItem(N("a"), JSON.stringify(notes(phone, "a").filter((n) => n.id !== "n1")));
  edit(phone, "a", (s) => ({ ...s, noteCount: 2 }));
  await sync(phone); await sync(pc);
  assert.deepEqual(notes(pc, "a").map((n) => n.id), ["n2", "n3"]);
});

await t("同時に銘柄を登録しても両方残り、図鑑No.がかぶらない", async () => {
  put(phone, [...stocks(phone), st("c", 3, { name: "iPhoneで登録" })]);
  put(pc, [...stocks(pc), st("d", 3, { name: "PCで登録" })]);
  await sync(phone); await sync(pc); await sync(phone);
  for (const d of [phone, pc]) {
    const nos = stocks(d).map((s) => s.no);
    assert.equal(new Set(nos).size, nos.length);
    assert.deepEqual(stocks(d).map((s) => s.id).sort(), ["a", "b", "c", "d"]);
  }
});

await t("片方で銘柄を削除したら、もう片方からも記録ごと消える", async () => {
  put(pc, stocks(pc).filter((s) => s.id !== "c"));
  await sync(pc); await sync(phone);
  assert.ok(!stocks(phone).some((s) => s.id === "c"));
  assert.ok(!redis.m.has("kd:notes:c"));
});

await t("削除と編集がぶつかったら、編集した銘柄は残す(記録も)", async () => {
  phone.ls.setItem(N("d"), JSON.stringify([{ id: "dn", date: "2026-09-20", title: "d", body: "d" }]));
  edit(phone, "d", (s) => ({ ...s, noteCount: 1 }));
  put(pc, stocks(pc).filter((s) => s.id !== "d"));
  pc.ls.removeItem(N("d"));
  await sync(pc); await sync(phone); await sync(pc);
  for (const d of [phone, pc]) {
    assert.ok(stocks(d).some((s) => s.id === "d"));
    assert.equal(notes(d, "d").length, 1);
  }
});

await t("逆向き: 相手が編集した銘柄をこちらで消していたら、相手の銘柄と記録を戻す", async () => {
  pc.ls.setItem(N("b"), JSON.stringify([{ id: "bn", date: "2026-09-21", title: "b", body: "b" }]));
  edit(pc, "b", (s) => ({ ...s, noteCount: 1 }));
  await sync(pc);
  put(phone, stocks(phone).filter((s) => s.id !== "b")); phone.ls.removeItem(N("b"));
  edit(pc, "b", (s) => ({ ...s, hypothesis: "PCで更新" }));
  await sync(pc); await sync(phone);
  const b = stocks(phone).find((s) => s.id === "b");
  assert.equal(b && b.hypothesis, "PCで更新");
  assert.equal(notes(phone, "b").length, 1);
});

await t("草カレンダー: 同じ日に両方で研究したら足し算", async () => {
  const add = (d, n) => { const a = JSON.parse(d.ls.getItem(A) || '{"days":{}}'); a.days["2026-09-30"] = (a.days["2026-09-30"] || 0) + n; d.ls.setItem(A, JSON.stringify(a)); };
  add(phone, 3); add(pc, 2);
  await sync(phone); await sync(pc); await sync(phone);
  for (const d of [phone, pc]) assert.equal(JSON.parse(d.ls.getItem(A)).days["2026-09-30"], 5);
});

await t("色違いは一度当たったら消えない", async () => {
  edit(phone, "a", (s) => ({ ...s, shiny: true, shinyAt: "2026-09-30", hypothesis: "x" }));
  edit(pc, "a", (s) => ({ ...s, hypothesis: "y" }));
  await sync(pc); await sync(phone); await sync(pc);
  for (const d of [phone, pc]) assert.equal(stocks(d).find((s) => s.id === "a").shiny, true);
});

await t("変化が無ければ書き込まない(版番号が進まない)", async () => {
  const v = redis.m.get("kd:ver");
  await sync(phone); await sync(pc);
  assert.equal(redis.m.get("kd:ver"), v);
});

await t("「この端末で上書き」を選ぶと、クラウドがこの端末の図鑑になる", async () => {
  const fresh = await makeDevice("fresh");
  put(fresh, [st("z", 1, { logs: [{ date: "2026-09-29", text: "z" }] })]);
  fresh.ls.setItem(N("z"), JSON.stringify([{ id: "zn", date: "2026-09-29", title: "z", body: "z" }]));
  assert.ok((await sync(fresh, "auto")).needChoice);
  await sync(fresh, "upload");
  assert.deepEqual(JSON.parse(redis.m.get("kd:doc")).stocks.map((s) => s.id), ["z"]);
  assert.ok(!redis.m.has("kd:notes:a"));
  await sync(phone);
  assert.deepEqual(stocks(phone).map((s) => s.id), ["z"]);
  assert.equal(notes(phone, "z").length, 1);
});

await t("ログインしていなければ401で要ログインになる", async () => {
  cookie = "";
  const r = await phone.mod.syncNow();
  assert.equal(r.error.status, 401);
  assert.equal(phone.mod.getSyncState().phase, "login");
});

await t("セットアップコードを間違えると断られ、10回でロック", async () => {
  cookie = "";
  for (let i = 0; i < 10; i++) {
    const e = await phone.mod.prepareRegistration("wrong").catch((x) => x);
    assert.equal(e.status, 403);
  }
  const e = await phone.mod.prepareRegistration("test-code").catch((x) => x);
  assert.equal(e.status, 429);
});

console.log(`\n${passed} passed`);
