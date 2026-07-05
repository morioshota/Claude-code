/* パーティ分析・実績バッジ・バックアップの各モーダル */

import { useState, useRef } from "react";
import { Gauge, btnStyle, Overlay } from "./ui.jsx";
import { TYPES, ACHIEVEMENTS } from "../data/constants.js";
import { evalAchievements } from "../lib/stock.js";
import { today } from "../lib/util.js";

function PartyModal({ stocks, onClose }) {
  const holds = stocks.filter((s) => s.status === "hold");
  const byType = {};
  holds.forEach((s) => { byType[s.type] = (byType[s.type] || 0) + 1; });
  const rows = Object.entries(byType).sort((a, b) => b[1] - a[1]);
  const maxPct = holds.length > 0 ? Math.round((rows[0]?.[1] || 0) / holds.length * 100) : 0;

  return (
    <Overlay onClose={onClose} z={60}>
      <div style={{ background: "#0e1122", border: "2px solid #3b4470", borderRadius: 18, padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontFamily: "'DotGothic16', monospace", fontSize: 15, color: "#60a5fa" }}>📊 パーティ編成分析</div>
          <button onClick={onClose} style={{ all: "unset", cursor: "pointer", color: "#8b93b8", fontSize: 18, padding: 4 }}>✕</button>
        </div>
        <div style={{ fontSize: 11.5, color: "#8b93b8", marginTop: 2, marginBottom: 14 }}>
          ホカク済み（保有）{holds.length}銘柄のタイプ構成。実質はセクター集中の可視化です
        </div>
        {holds.length === 0 ? (
          <div style={{ fontSize: 12.5, color: "#5b6284", textAlign: "center", padding: "20px 0" }}>保有銘柄がまだいません</div>
        ) : (
          <>
            {rows.map(([k, count]) => {
              const t = TYPES[k] || TYPES.metal;
              const pct = Math.round((count / holds.length) * 100);
              return (
                <div key={k} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                    <span style={{ color: t.color, fontWeight: 700 }}>{t.icon} {t.label}<span style={{ color: "#5b6284", fontWeight: 400, fontSize: 10 }}>（{t.sub}）</span></span>
                    <span style={{ fontFamily: "'DotGothic16', monospace", color: "#dfe4ff" }}>{count}銘柄 / {pct}%</span>
                  </div>
                  <Gauge value={count} max={holds.length} color={t.color} />
                </div>
              );
            })}
            <div style={{
              marginTop: 14, borderRadius: 10, padding: "10px 12px", fontSize: 12, lineHeight: 1.7,
              background: maxPct >= 40 ? "#2e230e" : "#0e2418",
              border: `1px solid ${maxPct >= 40 ? "#fbbf2466" : "#4ade8044"}`,
              color: maxPct >= 40 ? "#fcd34d" : "#86efac",
            }}>
              {maxPct >= 40
                ? `⚠ ${TYPES[rows[0][0]].label}タイプに銘柄数の${maxPct}%が集中しています。同じセクター要因で同時に動きやすい編成です`
                : "✓ タイプの偏りは大きくありません（銘柄数ベース）"}
            </div>
            <div style={{ fontSize: 10, color: "#5b6284", marginTop: 8, lineHeight: 1.6 }}>
              ※ 銘柄数ベースの構成比です。金額ベースの偏りとは異なる場合があります（このアプリは株価・評価額を扱いません）。
            </div>
          </>
        )}
      </div>
    </Overlay>
  );
}

function BadgeModal({ stocks, onClose }) {
  const unlocked = evalAchievements(stocks);
  return (
    <Overlay onClose={onClose} z={60}>
      <div style={{ background: "#0e1122", border: "2px solid #3b4470", borderRadius: 18, padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontFamily: "'DotGothic16', monospace", fontSize: 15, color: "#ffd166" }}>
            🎖 実績バッジ <span style={{ fontSize: 12, color: "#8b93b8" }}>{unlocked.size}/{ACHIEVEMENTS.length}</span>
          </div>
          <button onClick={onClose} style={{ all: "unset", cursor: "pointer", color: "#8b93b8", fontSize: 18, padding: 4 }}>✕</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10, marginTop: 14 }}>
          {ACHIEVEMENTS.map((a) => {
            const got = unlocked.has(a.id);
            return (
              <div key={a.id} style={{
                border: `1.5px solid ${got ? "#ffd16688" : "#252b48"}`, borderRadius: 12, padding: "12px 10px",
                textAlign: "center", background: got ? "#1c160a" : "#10142a",
                filter: got ? "none" : "grayscale(1)", opacity: got ? 1 : 0.45,
              }}>
                <div style={{ fontSize: 26 }}>{a.icon}</div>
                <div style={{ fontSize: 12, fontWeight: 800, color: got ? "#ffd166" : "#8b93b8", marginTop: 4 }}>{a.name}</div>
                <div style={{ fontSize: 10, color: "#8b93b8", marginTop: 3, lineHeight: 1.5 }}>{a.desc}</div>
              </div>
            );
          })}
        </div>
      </div>
    </Overlay>
  );
}

function DataPortModal({ stocks, onExport, onImport, onClose }) {
  const [preview, setPreview] = useState(null); // 読み込んだバックアップの中身 {data, stockCount, noteCount}
  const [mode, setMode] = useState("merge"); // 'merge'|'replace'
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // {ok, text}
  const fileRef = useRef(null);

  const totalNotes = (notes) => Object.values(notes || {}).reduce((a, arr) => a + (Array.isArray(arr) ? arr.length : 0), 0);

  const doExport = async () => {
    setBusy(true); setMsg(null);
    try {
      const data = await onExport();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kabu-dex-backup-${today()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg({ ok: true, text: `${data.stocks.length}銘柄・${totalNotes(data.notes)}件の記録を書き出しました` });
    } catch (e) {
      setMsg({ ok: false, text: "書き出しに失敗しました。もう一度お試しください" });
    }
    setBusy(false);
  };

  const onFile = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setMsg(null); setPreview(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || !Array.isArray(data.stocks)) throw new Error("bad format");
        const valid = data.stocks.filter((s) => s && s.name && s.code != null);
        if (valid.length === 0) throw new Error("empty");
        setPreview({ data, stockCount: valid.length, noteCount: totalNotes(data.notes), exportedAt: data.exportedAt || "" });
      } catch (err) {
        setMsg({ ok: false, text: "このファイルはKABU DEXのバックアップとして読み込めませんでした" });
      }
    };
    reader.readAsText(file);
    e.target.value = ""; // 同じファイルの再選択を許可
  };

  const doImport = async () => {
    if (!preview) return;
    if (mode === "replace" && !window.confirm("現在の図鑑と調査記録をバックアップの内容で置き換えます。よろしいですか？\n（この操作は元に戻せません。先に「書き出し」で現状を保存しておくと安全です）")) return;
    setBusy(true); setMsg(null);
    try {
      const result = await onImport(preview.data, mode);
      setMsg({ ok: true, text: mode === "replace"
        ? `置き換えました（${result.stockCount}銘柄・${result.noteCount}件の記録）`
        : `${result.stockCount}銘柄・${result.noteCount}件の記録を追加しました${result.skipped > 0 ? `（登録済みの${result.skipped}銘柄はスキップ）` : ""}` });
      setPreview(null);
    } catch (e) {
      setMsg({ ok: false, text: "読み込みに失敗しました。既存のデータは変更されていません" });
    }
    setBusy(false);
  };

  const secTitle = { fontFamily: "'DotGothic16', monospace", fontSize: 13, color: "#dfe4ff", marginBottom: 6 };

  return (
    <Overlay onClose={onClose} z={60}>
      <div style={{ background: "#0e1122", border: "2px solid #3b4470", borderRadius: 18, padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontFamily: "'DotGothic16', monospace", fontSize: 15, color: "#4ade80" }}>💾 バックアップ</div>
          <button onClick={onClose} style={{ all: "unset", cursor: "pointer", color: "#8b93b8", fontSize: 18, padding: 4 }}>✕</button>
        </div>
        <div style={{ fontSize: 11.5, color: "#8b93b8", marginTop: 2, marginBottom: 14, lineHeight: 1.7 }}>
          データはブラウザ内（localStorage）に保存されているため、キャッシュ削除などで消えることがあります。定期的にファイルへ書き出しておくのがおすすめです。
        </div>

        {/* エクスポート */}
        <div style={{ border: "1px solid #252b48", borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
          <div style={secTitle}>📤 書き出し（エクスポート）</div>
          <div style={{ fontSize: 11.5, color: "#8b93b8", marginBottom: 10 }}>
            図鑑の全銘柄と生態調査記録をJSONファイルとしてダウンロードします（現在 {stocks.length}銘柄）
          </div>
          <button onClick={doExport} disabled={busy} style={{ ...btnStyle("#4ade80"), opacity: busy ? 0.5 : 1 }}>
            ⬇ JSONファイルに書き出す
          </button>
        </div>

        {/* インポート */}
        <div style={{ border: "1px solid #252b48", borderRadius: 12, padding: "12px 14px" }}>
          <div style={secTitle}>📥 読み込み（インポート）</div>
          <div style={{ fontSize: 11.5, color: "#8b93b8", marginBottom: 10 }}>
            書き出したバックアップファイルを選んで復元します
          </div>
          <input ref={fileRef} type="file" accept=".json,application/json" onChange={onFile} style={{ display: "none" }} />
          <button onClick={() => fileRef.current && fileRef.current.click()} disabled={busy} style={{ ...btnStyle("#60a5fa"), opacity: busy ? 0.5 : 1 }}>
            📂 ファイルを選ぶ
          </button>

          {preview && (
            <div style={{ marginTop: 12, background: "#12152a", border: "1px solid #2a3050", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 12, color: "#dfe4ff", marginBottom: 8 }}>
                📄 {preview.stockCount}銘柄・{preview.noteCount}件の記録
                {preview.exportedAt && <span style={{ color: "#5b6284", fontSize: 10.5 }}>（{String(preview.exportedAt).slice(0, 10)} 書き出し）</span>}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                {[["merge", "➕ 追加（登録済みの証券コードはスキップ）", "#60a5fa"], ["replace", "♻ 置き換え（現在のデータを消して復元）", "#f87171"]].map(([k, label, color]) => (
                  <button key={k} onClick={() => setMode(k)} style={{
                    all: "unset", cursor: "pointer", padding: "6px 11px", borderRadius: 999, fontSize: 11, fontWeight: 700,
                    border: `1.5px solid ${mode === k ? color : "#252b48"}`,
                    background: mode === k ? `${color}1a` : "transparent",
                    color: mode === k ? color : "#5b6284",
                  }}>{label}</button>
                ))}
              </div>
              <button onClick={doImport} disabled={busy} style={{
                all: "unset", cursor: "pointer", padding: "8px 16px", borderRadius: 10, fontSize: 12.5, fontWeight: 800,
                background: mode === "replace" ? "#f87171" : "#60a5fa", color: "#0a0d1c", opacity: busy ? 0.5 : 1,
              }}>
                {busy ? "読み込み中…" : mode === "replace" ? "置き換えて復元する" : "図鑑に追加する"}
              </button>
            </div>
          )}
        </div>

        {msg && (
          <div style={{
            marginTop: 12, borderRadius: 10, padding: "9px 12px", fontSize: 12, lineHeight: 1.6,
            background: msg.ok ? "#0e2418" : "#2e1414",
            border: `1px solid ${msg.ok ? "#4ade8044" : "#f8717166"}`,
            color: msg.ok ? "#86efac" : "#fca5a5",
          }}>
            {msg.ok ? "✓ " : "⚠ "}{msg.text}
          </div>
        )}
      </div>
    </Overlay>
  );
}

/* ============ 牧場モード ============ */

// 動きの元気さ: 0=げんき(はねる) 1=ふつう 2=のんびり 3=すいみん(90日超)

export { PartyModal, BadgeModal, DataPortModal };
