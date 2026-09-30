/* ☁️ 同期の設定(バックアップ画面の一番上)。しくみは lib/sync.js / api/sync.js */
import { useState, useEffect } from "react";
import { btnStyle } from "./ui.jsx";
import {
  serverStatus, prepareRegistration, finishRegistration, prepareLogin, finishLogin,
  syncNow, stopSync, getSyncState, onSyncState, deviceName,
} from "../lib/sync.js";

const fmtTime = (iso) => {
  if (!iso) return "まだ";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
// Face ID を閉じた・時間切れ などをやさしい言葉に
const errText = (e) => {
  if (!e) return "";
  if (e.name === "NotAllowedError" || e.name === "AbortError") return "Face ID(パスキー)がキャンセルされたか、時間切れになりました。もう一度お試しください";
  if (e.name === "InvalidStateError") return "この端末のパスキーはもう登録されています。「Face IDでログイン」をお使いください";
  return e.message || "うまくいきませんでした";
};

export function SyncPanel() {
  const [srv, setSrv] = useState(null); // サーバーの状態 {ready, registered, loggedIn, devices} / {error}
  const [st, setSt] = useState(getSyncState());
  const [code, setCode] = useState("");
  const [prep, setPrep] = useState(null); // {kind:'reg'|'auth', nonce, options} 先に取っておくチャレンジ
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [showCode, setShowCode] = useState(false);

  const refresh = async () => {
    try { setSrv(await serverStatus()); } catch (e) { setSrv({ error: e.status === 404 ? "none" : e.message }); }
  };
  useEffect(() => { refresh(); return onSyncState(setSt); }, []);
  // ログイン用のチャレンジは画面を開いた時点で取っておく(Safari対策。lib/sync.js参照)
  useEffect(() => {
    if (srv && srv.ready && srv.registered && (!srv.loggedIn || st.phase === "login") && !prep && !showCode) {
      prepareLogin().then((p) => setPrep({ kind: "auth", ...p })).catch(() => {});
    }
  }, [srv, st.phase, prep, showCode]);

  const run = async (fn) => {
    setBusy(true); setMsg(null);
    try { await fn(); } catch (e) { setMsg({ ok: false, text: errText(e) }); setPrep(null); }
    setBusy(false);
  };
  const start = async () => {
    const res = await syncNow("auto");
    if (res && res.error) throw res.error;
    if (res && !res.needChoice) setMsg({ ok: true, text: res.applied ? "クラウドの図鑑をこの端末に取り込みました" : "同期を始めました。これからは自動でそろいます" });
  };

  const box = { border: "1px solid #1f3a5a", borderRadius: 12, padding: "12px 14px", marginBottom: 12, background: "#0c1526" };
  const title = { fontFamily: "'DotGothic16', monospace", fontSize: 13, color: "#7dd3fc", marginBottom: 6 };
  const note = { fontSize: 11.5, color: "#8b93b8", lineHeight: 1.7, marginBottom: 10 };
  const input = { boxSizing: "border-box", width: "100%", maxWidth: 260, background: "#12152a", border: "1px solid #2a3050", borderRadius: 8, color: "#f2f4ff", padding: "8px 10px", fontSize: 16, marginBottom: 8 }; // 16px未満だとiPhoneが入力時に拡大する
  const row = { display: "flex", gap: 8, flexWrap: "wrap" };

  let body;
  if (!srv) body = <div style={note}>確認中…</div>;
  else if (srv.error || !srv.ready) {
    body = (
      <div style={note}>
        {srv.error === "none"
          ? "この開き方では同期を使えません（Vercelで公開しているアプリで使えます）。"
          : `同期サーバーの準備がまだです：${srv.error || ""}（設定手順は docs/DEPLOY.md の「同期」）`}
      </div>
    );
  } else if (st.phase === "choice" && st.choice) {
    body = (
      <>
        <div style={{ ...note, color: "#fcd34d" }}>
          クラウドにはすでに図鑑（{st.choice.cloud}銘柄）があります。この端末の図鑑（{st.choice.local}銘柄）とどちらを使いますか？
          <br />※端末ごとに作った銘柄は別物として扱われるため、混ぜると重複します。迷ったら先に「書き出し」でこの端末の分を保存してください
        </div>
        <div style={row}>
          <button disabled={busy} onClick={() => run(async () => {
            if (!window.confirm(`この端末の図鑑（${st.choice.local}銘柄）をクラウドの図鑑で置き換えます。よろしいですか？`)) return;
            const res = await syncNow("cloud"); if (res && res.error) throw res.error;
            setMsg({ ok: true, text: "クラウドの図鑑をこの端末に取り込みました" });
          })} style={btnStyle("#7dd3fc")}>☁️ クラウドの図鑑を使う</button>
          <button disabled={busy} onClick={() => run(async () => {
            if (!window.confirm(`クラウドの図鑑（${st.choice.cloud}銘柄）を、この端末の図鑑で上書きします。ほかの端末の図鑑も置き換わります。よろしいですか？`)) return;
            const res = await syncNow("upload"); if (res && res.error) throw res.error;
            setMsg({ ok: true, text: "この端末の図鑑をクラウドに送りました" });
          })} style={btnStyle("#f87171")}>📱 この端末の図鑑で上書き</button>
        </div>
      </>
    );
  } else if (!srv.registered || showCode) {
    // はじめて(1台目) / パスキーを失くしたときの作り直し: セットアップコードが要る
    body = (
      <>
        <div style={note}>
          {srv.registered
            ? "この端末に新しくパスキーを作ります。Vercelに設定した「セットアップコード」を入力してください。"
            : "iPhone と PC で同じ図鑑を使えるようにします。まず Vercel に設定した「セットアップコード」を入力し、Face ID（パスキー）を作ります。次回からはコード不要です。"}
        </div>
        {!prep ? (
          <>
            <input type="password" value={code} onChange={(e) => setCode(e.target.value)} placeholder="セットアップコード" autoComplete="off" style={input} />
            <div style={row}>
              <button disabled={busy || !code.trim()} onClick={() => run(async () => { const p = await prepareRegistration(code.trim()); setPrep({ kind: "reg", ...p }); })}
                style={{ ...btnStyle("#7dd3fc"), opacity: busy || !code.trim() ? 0.5 : 1 }}>次へ</button>
              {srv.registered && <button onClick={() => { setShowCode(false); setPrep(null); }} style={btnStyle("#8b93b8")}>もどる</button>}
            </div>
          </>
        ) : (
          <button disabled={busy} onClick={() => run(async () => {
            await finishRegistration(prep, deviceName()); setPrep(null); setShowCode(false); setCode("");
            await refresh(); await start();
          })} style={btnStyle("#4ade80")}>🔐 Face IDでパスキーを作る</button>
        )}
      </>
    );
  } else if (!srv.loggedIn || st.phase === "login") {
    body = (
      <>
        <div style={note}>
          Face ID（パスキー）でログインすると、この端末でも同期できます。
          PCでは画面に出るQRコードをiPhoneで読み取る方法でもログインできます。一度ログインすれば、使っているあいだは続きます。
        </div>
        <div style={row}>
          <button disabled={busy || !prep || prep.kind !== "auth"} onClick={() => run(async () => {
            await finishLogin(prep); setPrep(null); await refresh(); await start();
          })} style={{ ...btnStyle("#4ade80"), opacity: busy || !prep ? 0.5 : 1 }}>🔐 Face IDでログイン</button>
          <button onClick={() => { setShowCode(true); setPrep(null); }} style={btnStyle("#8b93b8")}>パスキーを失くした／使えない</button>
        </div>
      </>
    );
  } else if (!st.on) {
    body = (
      <>
        <div style={note}>ログイン済みです。この端末の図鑑をクラウドとそろえます。</div>
        <button disabled={busy} onClick={() => run(start)} style={btnStyle("#4ade80")}>☁️ この端末で同期を始める</button>
      </>
    );
  } else {
    body = (
      <>
        <div style={{ ...note, color: st.phase === "error" ? "#fca5a5" : "#86efac" }}>
          {st.phase === "syncing" ? "⏳ 同期中…" : st.phase === "error" ? `⚠ ${st.error}（自動でやり直します）` : `✓ 同期中の端末です（最終：${fmtTime(st.lastAt)}）`}
          <br /><span style={{ color: "#8b93b8" }}>記録を保存すると自動で送り、アプリを開いたときに取り込みます。とくべつパックは端末ごと（同期しません）。</span>
        </div>
        <div style={row}>
          <button disabled={busy || st.phase === "syncing"} onClick={() => run(async () => { const r = await syncNow(); if (r && r.error) throw r.error; setMsg({ ok: true, text: "そろえました" }); })} style={btnStyle("#7dd3fc")}>🔄 今すぐ同期</button>
          <button disabled={busy} onClick={() => run(async () => {
            if (!window.confirm("この端末で同期をやめます（この端末のデータもクラウドのデータも消えません）。よろしいですか？")) return;
            await stopSync(); await refresh();
          })} style={btnStyle("#8b93b8")}>この端末で同期をやめる</button>
        </div>
        {srv.devices && srv.devices.length > 0 && (
          <div style={{ fontSize: 10.5, color: "#5b6284", marginTop: 10 }}>
            パスキーを登録した端末：{srv.devices.map((d) => `${d.name}（${String(d.createdAt).slice(0, 10)}）`).join("・")}
          </div>
        )}
      </>
    );
  }

  return (
    <div style={box}>
      <div style={title}>☁️ 同期（iPhone ⇄ PC）</div>
      {body}
      {msg && <div style={{ marginTop: 10, fontSize: 11.5, color: msg.ok ? "#86efac" : "#fca5a5", lineHeight: 1.6 }}>{msg.ok ? "✓ " : "⚠ "}{msg.text}</div>}
    </div>
  );
}
