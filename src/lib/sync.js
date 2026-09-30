/*
 * ☁️ 同期(クライアント側)  2026-09末
 * iPhone と PC で同じ図鑑を使う。サーバーは api/sync.js(パスキーでログイン・Upstash Redisに保存)。
 *
 * しくみ(3者マージ): 前回そろえたときの状態(base)をこの端末に覚えておき、
 *   「この端末で変わったところ」と「ほかの端末で変わったところ」を base と比べて見つけ、両方を生かして合わせる。
 *   - 図鑑の銘柄: 内部IDごと。両方が別の項目を変えたら項目ごとに合わせる。同じ項目を両方で変えたらこの端末を優先。
 *     クイック記録(logs)は1件ずつ合わせる(両方で書いた記録はどちらも残る)。最終調査日・点検日は新しいほう。
 *     削除: 片方で消して、もう片方で変えていなければ消える(変えていたら残す=データを失わない側に倒す)
 *   - 生態調査記録: 銘柄ごと。両方で変わったら記録のIDごとに合わせる
 *   - 草カレンダー: 日ごとに「base + それぞれの増えた分」
 * 書き込みはサーバーの版番号で守る(他の端末が先に書いたら409→取り直してやり直す)。
 * ⚠ とくべつパック(kabu-special-pack)・効果音・バックアップ日などの端末の設定は同期しない。
 * ⚠ 保存は localStorage を直接読み書きする(書き戻しの直前に「その間に操作がなかったか」を同じ瞬間に確かめるため)。
 */
import { STORAGE_KEY, noteKey, SEED } from "../data/constants.js";
import { ACTIVITY_KEY } from "./activity.js";
import { onStorageWrite } from "./storage.js";
import { startRegistration, startAuthentication } from "@simplewebauthn/browser";
import { applyTrades } from "./lots.js";

const ON_KEY = "kabu-sync-on";
const BASE_KEY = "kabu-sync-base";
const LAST_KEY = "kabu-sync-last";
const API = "/api/sync";
const LS = typeof localStorage !== "undefined" ? localStorage : null;

/* ---- 小道具 ---- */
const lsGet = (k) => { try { return LS ? LS.getItem(k) : null; } catch (e) { return null; } };
const lsSet = (k, v) => LS.setItem(k, v);
const lsDel = (k) => { try { LS.removeItem(k); } catch (e) { /* 無くてもよい */ } };
const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } };
// キーの順番に左右されない比較(端末ごとに項目の並びが違っても「同じ」と判定する)
const stable = (v) => JSON.stringify(v, (k, x) => (x && typeof x === "object" && !Array.isArray(x)
  ? Object.keys(x).sort().reduce((o, kk) => { o[kk] = x[kk]; return o; }, {}) : x));
const eq = (a, b) => stable(a) === stable(b);
const h = (str) => { // FNV-1a 32bit ×2(長さ込み)。変化の検出用
  let a = 0x811c9dc5, b = 0x01000193 ^ str.length;
  for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); a = Math.imul(a ^ c, 16777619); b = Math.imul(b ^ c, 2246822519); }
  return (a >>> 0).toString(36) + (b >>> 0).toString(36) + str.length.toString(36);
};
const EMPTY_H = h("[]");
const rawNotes = (id) => lsGet(noteKey(id)) || "[]";

export const deviceName = () => {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && typeof navigator !== "undefined" && navigator.maxTouchPoints > 1)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows PC";
  return "PC";
};

async function api(a, body) {
  const r = await fetch(`${API}?a=${a}`, {
    method: body ? "POST" : "GET", credentials: "same-origin", cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  let j = {};
  try { j = await r.json(); } catch (e) { /* 本文なし */ }
  if (!r.ok) { const e = new Error(j.error || `通信エラー(${r.status})`); e.status = r.status; e.data = j; throw e; }
  return j;
}

/* ---- 状態(画面へ知らせる) ---- */
let state = { on: lsGet(ON_KEY) === "1", phase: "idle", lastAt: lsGet(LAST_KEY) || "", error: "", choice: null };
const subs = new Set();
const setState = (patch) => { state = { ...state, ...patch }; subs.forEach((fn) => fn(state)); };
export const getSyncState = () => state;
export const onSyncState = (fn) => { subs.add(fn); return () => subs.delete(fn); };

/* ---- 3者マージの部品 ---- */
const logKey = (x) => `${x && x.date}\u0001${x && x.text}`;
// 配列をキーごとに3者マージ: 片方で消したもの(baseにあって相手に無い)は消す、片方で足したものは足す
function mergeList(b = [], l = [], r = [], keyOf) {
  const bk = new Set(b.map(keyOf)), lk = new Set(l.map(keyOf)), rk = new Set(r.map(keyOf));
  const out = l.filter((x) => rk.has(keyOf(x)) || !bk.has(keyOf(x)));
  r.forEach((x) => { const k = keyOf(x); if (!lk.has(k) && !bk.has(k)) out.push(x); });
  return out;
}
const byDate = (arr) => arr.map((x, i) => [x, i]).sort((p, q) => String(p[0].date || "").localeCompare(String(q[0].date || "")) || p[1] - q[1]).map((p) => p[0]);
const maxStr = (a, b) => (String(a || "") >= String(b || "") ? a : b);

function mergeStock(b, l, r) {
  if (eq(l, r) || eq(r, b)) return l;
  if (eq(l, b)) return r;
  const out = {};
  new Set([...Object.keys(b), ...Object.keys(l), ...Object.keys(r)]).forEach((k) => {
    let v;
    if (k === "logs") v = byDate(mergeList(b.logs, l.logs, r.logs, logKey));
    else if (k === "trades") {
      // 売買の記録は1件ずつ合わせる。「はじめの保有」を両方の端末で別々に作っていたら、この端末のほうを1件だけ残す
      const m = mergeList(b.trades || [], l.trades || [], r.trades || [], (x) => x && x.id);
      const lInit = (l.trades || []).find((x) => x.initial);
      const inits = m.filter((x) => x.initial);
      v = inits.length > 1 ? m.filter((x) => !x.initial || x === (lInit || inits[0])) : m;
      if (!v.length) v = undefined;
    }
    else if (k === "lastResearch" || k === "lastTriggerCheck") v = maxStr(l[k], r[k]);
    else if (k === "shiny") v = !!(l.shiny || r.shiny) || undefined; // 色違いは一度当たったら消えない(不変条件6)
    else v = eq(l[k], b[k]) ? r[k] : l[k];
    if (v !== undefined) out[k] = v;
  });
  if (out.shiny && !out.shinyAt) out.shinyAt = l.shinyAt || r.shinyAt;
  // 売買の記録があれば、株数・平均取得単価・購入日は合わせた記録から計算し直す
  if (out.trades && !eq(out.trades, l.trades)) return applyTrades(out, out.trades);
  return out;
}

/* 銘柄一覧の3者マージ。keepL/keepR = 片方で消されたが、もう片方で変えていたので残した銘柄 */
function mergeStocks(B, L, R) {
  const bm = new Map(B.map((s) => [s.id, s])), lm = new Map(L.map((s) => [s.id, s])), rm = new Map(R.map((s) => [s.id, s]));
  const out = [], keepL = new Set(), keepR = new Set();
  const ids = [...new Set([...L.map((s) => s.id), ...R.map((s) => s.id)])];
  ids.forEach((id) => {
    const b = bm.get(id), l = lm.get(id), r = rm.get(id);
    if (l && r) out.push(b ? mergeStock(b, l, r) : l);
    else if (l) { if (!b) out.push(l); else if (!eq(l, b)) { out.push(l); keepL.add(id); } }
    else if (r) { if (!b) out.push(r); else if (!eq(r, b)) { out.push(r); keepR.add(id); } }
  });
  // 図鑑No.: 2台で同時に登録すると番号がかぶる → 後ろの番号を振り直す
  out.sort((p, q) => (p.no || 0) - (q.no || 0));
  let max = out.reduce((m, s) => Math.max(m, s.no || 0), 0);
  const seen = new Set();
  const fixed = out.map((s) => { if (seen.has(s.no)) return { ...s, no: ++max }; seen.add(s.no); return s; });
  return { stocks: fixed, keepL, keepR };
}

function mergeActivity(B, L, R) {
  const b = (B && B.days) || {}, l = (L && L.days) || {}, r = (R && R.days) || {};
  const days = {};
  new Set([...Object.keys(b), ...Object.keys(l), ...Object.keys(r)]).forEach((d) => {
    const base = b[d] || 0;
    days[d] = base + Math.max(0, (l[d] || 0) - base) + Math.max(0, (r[d] || 0) - base);
  });
  return { days, seeded: true };
}

const noteIdOf = (n) => (n && n.id) || `${n && n.date}\u0001${n && n.title}`;
// 初めて開いたときの見本データ(SEED)のまま=何も書いていない端末か
const DEF = { triggers: [], logs: [], bullets: [], risks: [] };
const strip = ({ id, no, noteCount, lastResearch, ...rest }) => rest;
const isPristine = (stocks) => stocks.length === SEED.length && stocks.every((s) => {
  const seed = SEED.find((x) => String(x.code) === String(s.code));
  return seed && !s.noteCount && !s.lastResearch && eq(strip({ ...DEF, ...seed }), strip({ ...DEF, ...s }));
}) || stocks.length === 0;

/* ---- 1回の同期 ----
   mode: 初めてこの端末でつなぐとき、クラウドに別のデータがあったら "cloud"(クラウドを使う) / "upload"(この端末で上書き) を選ぶ
   戻り値: {applied: この端末のデータを書き換えたか, needChoice?} */
let seq = 0; // 図鑑・記録・草への書き込みの通し番号(同期の最中に操作があったか調べる)

async function syncOnce(mode) {
  const startSeq = seq;
  const localRaw = lsGet(STORAGE_KEY);
  const L = (parse(localRaw, {}).stocks) || [];
  const LA = parse(lsGet(ACTIVITY_KEY), { days: {} });
  let base = parse(lsGet(BASE_KEY), null);

  const have = {};
  if (base) Object.entries(base.notes || {}).forEach(([id, n]) => { if (n.r) have[id] = n.r; });
  const pulled = await api("pull", { have });
  const remote = pulled.doc;
  if (base && (!remote || pulled.version < base.version)) base = null; // クラウドが作り直されていたら初めてと同じ扱い

  // 初めてつなぐ端末で、クラウドにもう図鑑がある
  let adopt = false;
  if (!base && remote) {
    if (mode === "cloud" || (mode !== "upload" && isPristine(L))) adopt = true;
    else if (mode !== "upload") return { needChoice: { local: L.length, cloud: remote.stocks.length } };
  }

  const remoteNoteH = (remote && remote.noteHashes) || {};
  let merged, activity, keepL = new Set(), keepR = new Set();
  const B = base ? base.stocks : [];
  if (adopt) { merged = remote.stocks; activity = mergeActivity(null, LA, remote.activity); }
  else if (!remote || mode === "upload") { merged = L; activity = LA.days ? { ...LA, seeded: true } : { days: {}, seeded: true }; }
  else {
    ({ stocks: merged, keepL, keepR } = mergeStocks(B, L, remote.stocks));
    activity = mergeActivity(base.activity, LA, remote.activity);
  }

  // 記録: 残した銘柄ごとに決める
  const needFetch = [];
  const plan = merged.map((s) => {
    const id = s.id, bn = base && base.notes && base.notes[id];
    const lraw = rawNotes(id), lh = h(lraw);
    const rh = remoteNoteH[id] || null;
    const remoteChanged = adopt || mode === "upload" ? adopt : (bn ? bn.r : null) !== rh;
    const localChanged = adopt ? false : mode === "upload" || !remote ? true : bn ? bn.l !== lh : lh !== EMPTY_H;
    return { id, bn, lraw, lh, rh, remoteChanged: remoteChanged || keepR.has(id), localChanged: localChanged && !keepR.has(id) };
  });
  plan.forEach((p) => { if (p.remoteChanged && p.rh && !pulled.notes[p.id]) needFetch.push(p.id); });
  if (needFetch.length) { // 変わっていないので送られてこなかった記録を取り寄せる(消した銘柄を相手が編集していた等)
    const have2 = { ...have }; needFetch.forEach((id) => delete have2[id]);
    const again = await api("pull", { have: have2 });
    if (again.version !== pulled.version) throw Object.assign(new Error("retry"), { status: 409 });
    Object.assign(pulled.notes, again.notes);
  }

  const notesOut = {}; // サーバーへ送る記録(null=削除)
  const writeNotes = {}; // この端末へ書き戻す記録
  const baseNotes = {};
  const counts = {};
  plan.forEach((p) => {
    const rArr = p.rh ? (pulled.notes[p.id] || null) : [];
    let out; // 最終的な記録(文字列)
    if (keepL.has(p.id)) out = p.lraw;
    else if (!p.remoteChanged) out = p.lraw;
    else if (!p.localChanged) out = JSON.stringify(rArr || []);
    else {
      const bIds = new Set((p.bn && p.bn.ids) || []);
      const lArr = parse(p.lraw, []);
      const m = mergeList([...bIds].map((id) => ({ id })), lArr, rArr || [], noteIdOf);
      out = JSON.stringify(byDate(m));
    }
    const oh = h(out);
    // クラウドの中身と同じか
    const remoteH = p.remoteChanged ? h(JSON.stringify(rArr || [])) : p.bn ? p.bn.l : EMPTY_H;
    if (oh !== remoteH || mode === "upload") notesOut[p.id] = out === "[]" ? null : JSON.parse(out);
    if (oh !== p.lh) { writeNotes[p.id] = out; counts[p.id] = JSON.parse(out).length; }
    baseNotes[p.id] = { l: oh, r: p.rh, ids: JSON.parse(out).map(noteIdOf) };
  });
  // 記録の件数(noteCount)を記録の中身に合わせる
  merged = merged.map((s) => (counts[s.id] !== undefined && s.noteCount !== counts[s.id] ? { ...s, noteCount: counts[s.id] } : s));
  if (mode === "upload" && remote) Object.keys(remoteNoteH).forEach((id) => { if (!merged.some((s) => s.id === id)) notesOut[id] = null; });

  const docChanged = !remote || !eq(merged, remote.stocks) || !eq(activity.days, (remote.activity || {}).days || {});
  let version = pulled.version;
  let noteHashes = remoteNoteH;
  if (docChanged || Object.keys(notesOut).length) {
    const pushed = await api("push", { baseVersion: pulled.version, doc: { stocks: merged, activity }, notes: notesOut });
    version = pushed.version; noteHashes = pushed.noteHashes || {};
  }
  Object.keys(baseNotes).forEach((id) => { baseNotes[id].r = noteHashes[id] || null; });

  // この端末へ書き戻す。同期の最中に操作があったら書かずにやり直す(操作を上書きしないため)
  if (seq !== startSeq || lsGet(STORAGE_KEY) !== localRaw) throw Object.assign(new Error("retry"), { status: 409 });
  const localChanged = !eq(merged, L) || Object.keys(writeNotes).length > 0 || !eq(activity.days, LA.days || {});
  if (localChanged) {
    Object.entries(writeNotes).forEach(([id, raw]) => { if (raw === "[]") lsDel(noteKey(id)); else lsSet(noteKey(id), raw); });
    L.forEach((s) => { if (!merged.some((m) => m.id === s.id)) lsDel(noteKey(s.id)); });
    lsSet(STORAGE_KEY, JSON.stringify({ ...parse(localRaw, {}), stocks: merged }));
    lsSet(ACTIVITY_KEY, JSON.stringify(activity));
  }
  lsSet(BASE_KEY, JSON.stringify({ version, stocks: merged, activity, notes: baseNotes }));
  return { applied: localChanged };
}

/* ---- いつ同期するか ---- */
let running = false, again = false, timer = null, onApplied = null, lastRun = 0;

export async function syncNow(mode) {
  if (!state.on && !mode) return;
  if (running) { again = true; return; }
  running = true; lastRun = Date.now();
  setState({ phase: "syncing", error: "" });
  try {
    let res;
    for (let i = 0; i < 4; i++) {
      try { res = await syncOnce(mode); break; } catch (e) {
        if (e.status === 409 && i < 3) { await new Promise((r) => setTimeout(r, 300 + i * 500)); continue; }
        throw e;
      }
    }
    if (res.needChoice) { setState({ phase: "choice", choice: res.needChoice }); return res; }
    if (!state.on) { lsSet(ON_KEY, "1"); setState({ on: true }); }
    const at = new Date().toISOString();
    try { lsSet(LAST_KEY, at); } catch (e) { /* 表示用なので失敗してよい */ }
    setState({ phase: "idle", lastAt: at, choice: null });
    if (res.applied && onApplied) onApplied();
    return res;
  } catch (e) {
    if (e.status === 401) setState({ phase: "login", error: "" });
    else setState({ phase: "error", error: e.message || "同期できませんでした" });
    return { error: e };
  } finally {
    running = false;
    if (again) { again = false; schedule(500); }
  }
}

function schedule(ms = 1500) {
  if (!state.on || state.phase === "login" || state.phase === "choice") return;
  clearTimeout(timer);
  timer = setTimeout(() => { timer = null; syncNow(); }, ms);
}

let started = false;
/* KabuDex の読み込み後に1回だけ呼ぶ。applied = 別の端末の変更を取り込んだとき(画面を読み直す) */
export function initSync(applied) {
  onApplied = applied;
  if (started) return;
  started = true;
  onStorageWrite((key) => {
    if (key === STORAGE_KEY || key === ACTIVITY_KEY || key.startsWith("kabu-notes:")) { seq++; schedule(); }
  });
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") { if (Date.now() - lastRun > 8000) syncNow(); }
      else if (timer) { clearTimeout(timer); timer = null; syncNow(); } // 閉じる前に送り残しを送る
    });
    window.addEventListener("online", () => syncNow());
    setInterval(() => { if (document.visibilityState === "visible" && Date.now() - lastRun > 4 * 60e3) syncNow(); }, 60e3);
  }
  if (state.on) syncNow();
}

/* ---- ログインまわり ---- */
export const serverStatus = () => api("status");

/* ⚠ Safari は「ボタンを押した直後」でないと Face ID を出さない。通信をはさむと断られることがあるので、
   チャレンジは先に取っておき(prepare*)、ボタンの中では Face ID を呼ぶだけにする(finish*)。チャレンジの有効期限は5分 */
export async function prepareRegistration(setupCode) {
  return api("reg-options", { setupCode });
}
export async function finishRegistration(prep, name) {
  const response = await startRegistration({ optionsJSON: prep.options });
  await api("reg-verify", { nonce: prep.nonce, response, name: name || deviceName() });
}
export async function prepareLogin() {
  return api("auth-options", {});
}
export async function finishLogin(prep) {
  const response = await startAuthentication({ optionsJSON: prep.options });
  await api("auth-verify", { nonce: prep.nonce, response });
  if (state.phase === "login") setState({ phase: "idle" });
}

/* この端末で同期をやめる(データはこの端末にもクラウドにも残る)。
   前回そろえた状態(base)は残す: 再開したとき「どちらを使うか」を聞かずに、止めていた間の変更を合わせられる */
export async function stopSync() {
  try { await api("logout", {}); } catch (e) { /* オフラインでも止める */ }
  lsDel(ON_KEY);
  clearTimeout(timer); timer = null;
  setState({ on: false, phase: "idle", choice: null, error: "" });
}
