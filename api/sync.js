/*
 * 同期サーバー (Vercel Serverless Function)  2026-09末
 * iPhone と PC で同じ図鑑データを使うための保存先。オーナー1人用。
 *
 * ログイン: パスキー(Face ID / Touch ID / Windows Hello)。最初の1回と「端末を失くしたときの回復」だけ
 *           環境変数 SYNC_SETUP_CODE(オーナーが決める合言葉)を入力する。知らない人は登録できない。
 * セッション: HttpOnly の署名つきCookie(90日)。毎回のログインは不要。署名の鍵はRedisに1回だけ作る。
 * 保存先: Upstash Redis(REST)。Vercelの Storage → Upstash を入れると KV_REST_API_URL/TOKEN が自動で入る。
 *   kd:ver            … データの版番号(書き込みのたびに+1)
 *   kd:doc            … {stocks, activity, noteHashes, updatedAt}
 *   kd:notes:{id}     … 銘柄ごとの生態調査記録(大きいので分けて置き、変わったものだけやり取りする)
 *   kd:creds          … 登録したパスキーの一覧
 *   kd:chal:{nonce}   … 登録/ログインのチャレンジ(5分で消える)
 *   kd:secret         … セッション署名の鍵
 * 書き込みは「読んだ版番号のままなら書く」を Lua で1回にまとめる(2台が同時に書いても壊れない)。
 * ⚠ とくべつパック(著作権のある絵)は同期しない。クライアントが送らない。
 */
import crypto from "node:crypto";
import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse,
} from "@simplewebauthn/server";

const RURL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const RTOK = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
const SETUP = String(process.env.SYNC_SETUP_CODE || "");
const SESSION_DAYS = 90;
const COOKIE = "kd_s";
const DEL = "__DEL__";

const CAS_LUA = `
local v = tonumber(redis.call('GET', KEYS[1]) or '0')
if v ~= tonumber(ARGV[1]) then return {0, v} end
for i = 2, #ARGV, 2 do
  if ARGV[i + 1] == '${DEL}' then redis.call('DEL', ARGV[i]) else redis.call('SET', ARGV[i], ARGV[i + 1]) end
end
redis.call('SET', KEYS[1], v + 1)
return {1, v + 1}`;

export function makeRedis(url, token) {
  const call = async (cmd) => {
    const r = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(cmd) });
    const j = await r.json();
    if (j.error) throw new Error(j.error);
    return j.result;
  };
  return {
    get: (k) => call(["GET", k]),
    set: (k, v, ex) => call(ex ? ["SET", k, v, "EX", String(ex)] : ["SET", k, v]),
    setnx: (k, v) => call(["SET", k, v, "NX"]),
    getdel: (k) => call(["GETDEL", k]),
    incr: async (k, ex) => { const n = await call(["INCR", k]); if (n === 1 && ex) await call(["EXPIRE", k, String(ex)]); return n; },
    mget: (keys) => (keys.length ? call(["MGET", ...keys]) : Promise.resolve([])),
    // 版番号が expected のままなら pairs(キー・値。値が DEL なら削除)を書き、版を+1する
    cas: async (expected, pairs) => {
      const r = await call(["EVAL", CAS_LUA, "1", "kd:ver", String(expected), ...pairs.flat()]);
      return { ok: r[0] === 1, version: Number(r[1]) };
    },
  };
}

let redisImpl = null;
export const __setRedis = (r) => { redisImpl = r; }; // テスト用(ローカルの疑似Redis)
const R = () => redisImpl || (RURL && RTOK ? (redisImpl = makeRedis(RURL, RTOK)) : null);

const send = (res, status, body, headers = {}) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
  res.end(JSON.stringify(body));
};
const readBody = async (req) => {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  const chunks = []; for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch (e) { return {}; }
};
const b64u = (buf) => Buffer.from(buf).toString("base64url");
const unb64u = (s) => new Uint8Array(Buffer.from(s, "base64url"));
const sha = (s) => crypto.createHash("sha256").update(s).digest("base64url").slice(0, 22);
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

/* 相手先(オリジン)。パスキーはこのドメインに結びつく */
const originOf = (req) => {
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "");
  const proto = String(req.headers["x-forwarded-proto"] || (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https"));
  return { origin: `${proto}://${host}`, rpID: host.split(":")[0] };
};

/* ---- セッション(署名つきCookie) ---- */
const secretOf = async (r) => {
  let s = await r.get("kd:secret");
  if (!s) { await r.setnx("kd:secret", crypto.randomBytes(32).toString("hex")); s = await r.get("kd:secret"); }
  return s;
};
const sign = (secret, payload) => crypto.createHmac("sha256", secret).update(payload).digest("base64url");
const cookieOf = (req, name) => {
  const m = String(req.headers.cookie || "").split(/;\s*/).find((c) => c.startsWith(name + "="));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : "";
};
const isLoggedIn = async (req, r) => {
  const v = cookieOf(req, COOKIE); if (!v) return false;
  const [exp, mac] = v.split(".");
  if (!exp || !mac || Number(exp) < Date.now()) return false;
  return safeEq(mac, sign(await secretOf(r), exp));
};
const sessionCookie = async (req, r) => {
  const exp = String(Date.now() + SESSION_DAYS * 86400e3);
  const secure = originOf(req).origin.startsWith("https") ? "; Secure" : "";
  return `${COOKIE}=${exp}.${sign(await secretOf(r), exp)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`;
};

const credsOf = async (r) => { try { return JSON.parse((await r.get("kd:creds")) || "[]"); } catch (e) { return []; } };

export default async function handler(req, res) {
  const r = R();
  const url = new URL(req.url, "http://localhost");
  const a = url.searchParams.get("a") || "status";
  if (!r || !SETUP) {
    return send(res, a === "status" ? 200 : 503, { ready: false, error: !r ? "保存先(Upstash Redis)が未設定です" : "SYNC_SETUP_CODE が未設定です" });
  }
  const { origin, rpID } = originOf(req);
  const body = req.method === "POST" ? await readBody(req) : {};

  try {
    if (a === "status") {
      const creds = await credsOf(r);
      return send(res, 200, { ready: true, registered: creds.length > 0, loggedIn: await isLoggedIn(req, r), devices: creds.map((c) => ({ name: c.name, createdAt: c.createdAt })) });
    }

    /* ---- パスキー登録: ログイン中(端末の追加) または セットアップコード(初回・回復) ---- */
    if (a === "reg-options") {
      const logged = await isLoggedIn(req, r);
      if (!logged) {
        const fails = Number((await r.get("kd:fail")) || 0);
        if (fails >= 10) return send(res, 429, { error: "間違いが続いたため1時間ロックしています" });
        if (!body.setupCode || !safeEq(String(body.setupCode).trim(), SETUP)) {
          await r.incr("kd:fail", 3600);
          return send(res, 403, { error: "セットアップコードが違います" });
        }
      }
      const creds = await credsOf(r);
      const options = await generateRegistrationOptions({
        rpName: "KABU DEX", rpID, userName: "owner", userDisplayName: "KABU DEX オーナー",
        userID: new TextEncoder().encode("kabu-dex-owner"),
        attestationType: "none",
        excludeCredentials: creds.map((c) => ({ id: c.id, transports: c.transports })),
        authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
      });
      const nonce = crypto.randomBytes(16).toString("hex");
      await r.set(`kd:chal:${nonce}`, JSON.stringify({ c: options.challenge, kind: "reg" }), 300);
      return send(res, 200, { nonce, options });
    }
    if (a === "reg-verify") {
      const ch = JSON.parse((await r.getdel(`kd:chal:${body.nonce}`)) || "null");
      if (!ch || ch.kind !== "reg") return send(res, 400, { error: "時間切れです。もう一度お試しください" });
      const v = await verifyRegistrationResponse({ response: body.response, expectedChallenge: ch.c, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true });
      if (!v.verified || !v.registrationInfo) return send(res, 400, { error: "登録を確認できませんでした" });
      const { credential } = v.registrationInfo;
      const creds = (await credsOf(r)).filter((c) => c.id !== credential.id);
      creds.push({ id: credential.id, publicKey: b64u(credential.publicKey), counter: credential.counter, transports: credential.transports || [], name: String(body.name || "この端末").slice(0, 40), createdAt: new Date().toISOString() });
      await r.set("kd:creds", JSON.stringify(creds.slice(-10)));
      await r.set("kd:fail", "0");
      return send(res, 200, { ok: true }, { "Set-Cookie": await sessionCookie(req, r) });
    }

    /* ---- パスキーでログイン ---- */
    if (a === "auth-options") {
      const creds = await credsOf(r);
      if (!creds.length) return send(res, 400, { error: "まだ登録がありません" });
      const options = await generateAuthenticationOptions({ rpID, userVerification: "required", allowCredentials: creds.map((c) => ({ id: c.id, transports: c.transports })) });
      const nonce = crypto.randomBytes(16).toString("hex");
      await r.set(`kd:chal:${nonce}`, JSON.stringify({ c: options.challenge, kind: "auth" }), 300);
      return send(res, 200, { nonce, options });
    }
    if (a === "auth-verify") {
      const ch = JSON.parse((await r.getdel(`kd:chal:${body.nonce}`)) || "null");
      if (!ch || ch.kind !== "auth") return send(res, 400, { error: "時間切れです。もう一度お試しください" });
      const creds = await credsOf(r);
      const cred = creds.find((c) => c.id === (body.response && body.response.id));
      if (!cred) return send(res, 400, { error: "この端末のパスキーは登録されていません" });
      const v = await verifyAuthenticationResponse({
        response: body.response, expectedChallenge: ch.c, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true,
        credential: { id: cred.id, publicKey: unb64u(cred.publicKey), counter: cred.counter, transports: cred.transports },
      });
      if (!v.verified) return send(res, 400, { error: "ログインを確認できませんでした" });
      cred.counter = v.authenticationInfo.newCounter;
      await r.set("kd:creds", JSON.stringify(creds));
      return send(res, 200, { ok: true }, { "Set-Cookie": await sessionCookie(req, r) });
    }
    if (a === "logout") {
      return send(res, 200, { ok: true }, { "Set-Cookie": `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` });
    }

    /* ---- ここから先はログインが必要 ---- */
    if (!(await isLoggedIn(req, r))) return send(res, 401, { error: "ログインが必要です" });

    if (a === "pull") {
      // 使っているあいだはセッションを延ばす(残り60日を切ったら90日に戻す)=ふだん使いでFace IDは出てこない
      const exp = Number(cookieOf(req, COOKIE).split(".")[0] || 0);
      const extra = exp - Date.now() < 60 * 86400e3 ? { "Set-Cookie": await sessionCookie(req, r) } : {};
      // have: クライアントが知っている銘柄ごとの記録のハッシュ。違うものだけ返す
      const [ver, docS] = await r.mget(["kd:ver", "kd:doc"]);
      const doc = docS ? JSON.parse(docS) : null;
      const version = Number(ver || 0);
      if (!doc) return send(res, 200, { version, doc: null, notes: {} }, extra);
      const have = body.have && typeof body.have === "object" ? body.have : {};
      const need = Object.keys(doc.noteHashes || {}).filter((id) => have[id] !== doc.noteHashes[id]);
      const vals = await r.mget(need.map((id) => `kd:notes:${id}`));
      const notes = {}; need.forEach((id, i) => { notes[id] = vals[i] ? JSON.parse(vals[i]) : []; });
      return send(res, 200, { version, doc, notes }, extra);
    }
    if (a === "push") {
      const baseVersion = Number(body.baseVersion || 0);
      const docIn = body.doc || {};
      if (!Array.isArray(docIn.stocks)) return send(res, 400, { error: "データの形式が違います" });
      const cur = JSON.parse((await r.get("kd:doc")) || "null");
      const noteHashes = { ...((cur && cur.noteHashes) || {}) };
      const pairs = [];
      Object.entries(body.notes || {}).forEach(([id, arr]) => {
        if (arr === null) { delete noteHashes[id]; pairs.push([`kd:notes:${id}`, DEL]); return; }
        const s = JSON.stringify(Array.isArray(arr) ? arr : []);
        noteHashes[id] = sha(s); pairs.push([`kd:notes:${id}`, s]);
      });
      // 図鑑から消えた銘柄の記録も片付ける
      const ids = new Set(docIn.stocks.map((s) => s.id));
      Object.keys(noteHashes).forEach((id) => { if (!ids.has(id)) { delete noteHashes[id]; pairs.push([`kd:notes:${id}`, DEL]); } });
      const doc = { stocks: docIn.stocks, activity: docIn.activity || null, noteHashes, updatedAt: new Date().toISOString() };
      pairs.unshift(["kd:doc", JSON.stringify(doc)]);
      const out = await r.cas(baseVersion, pairs);
      if (!out.ok) return send(res, 409, { error: "ほかの端末で先に更新されました", version: out.version });
      return send(res, 200, { version: out.version, noteHashes });
    }
    return send(res, 404, { error: "不明な操作です" });
  } catch (e) {
    return send(res, 500, { error: "同期サーバーでエラーが起きました", detail: String(e && e.message || e).slice(0, 200) });
  }
}
