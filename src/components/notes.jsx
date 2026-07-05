/* 生態調査記録(フィールドノート)の追加と表示 */

import { useState } from "react";
import { MdView, btnStyle, Overlay } from "./ui.jsx";
import { MEMO_TEMPLATE } from "../data/constants.js";
import { today, uid } from "../lib/util.js";

function NoteEditor({ stock, hasPrev, onSave, onCancel }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [diff, setDiff] = useState("");
  const [saving, setSaving] = useState(false);
  const input = { width: "100%", boxSizing: "border-box", background: "#0b0e1d", border: "1px solid #2a3050", borderRadius: 8, color: "#eef1ff", padding: "9px 10px", fontSize: 13, outline: "none" };
  const label = { fontFamily: "'DotGothic16', monospace", fontSize: 11, color: "#8b93b8", letterSpacing: 1.5, display: "block", marginBottom: 4, marginTop: 12 };

  const save = async () => {
    if (!body.trim() || saving) return;
    setSaving(true);
    const ok = await onSave({ id: uid(), date: today(), title: title.trim(), body: body.trim(), diff: diff.trim(), ai: false });
    if (!ok) setSaving(false); // 失敗時は再試行できる状態に戻す(入力は保持される)
  };

  return (
    <Overlay onClose={onCancel} z={70}>
      <div style={{ background: "#0e1122", border: "2px solid #3b4470", borderRadius: 18, padding: 18 }}>
        <div style={{ fontFamily: "'DotGothic16', monospace", fontSize: 15, color: "#4ade80" }}>🔬 生態調査記録を追加</div>
        <div style={{ fontSize: 11.5, color: "#8b93b8", marginTop: 2 }}>
          {stock.name}（{stock.code}）｜チャットで作った投資メモをそのまま貼り付けできます（＋3Lv）
        </div>

        <label style={label}>タイトル（任意）</label>
        <input style={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例: 3Q決算レビュー / 初回リサーチ" />

        <label style={label}>投資メモ本文 *（マークダウン対応：見出し・表・リスト）</label>
        <textarea style={{ ...input, minHeight: 220, resize: "vertical", fontFamily: "inherit", lineHeight: 1.6 }}
          value={body} onChange={(e) => setBody(e.target.value)}
          placeholder="# 投資メモ: 〇〇(コード) …をここに貼り付け" />
        <button onClick={() => setBody((b) => (b ? b : MEMO_TEMPLATE))} disabled={!!body}
          style={{ ...btnStyle("#8b93b8"), padding: "5px 10px", fontSize: 11, marginTop: 6, opacity: body ? .4 : 1 }}>
          📋 kabu-researchテンプレを挿入
        </button>

        {hasPrev && (
          <>
            <label style={label}>前回調査との差分（再調査時の推奨項目）</label>
            <textarea style={{ ...input, minHeight: 70, resize: "vertical" }}
              value={diff} onChange={(e) => setDiff(e.target.value)}
              placeholder="例: 通期ガイダンス上方修正。仮説は維持、進捗率が前回58%→72%" />
          </>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button onClick={save} disabled={!body.trim() || saving} style={{
            all: "unset", cursor: body.trim() && !saving ? "pointer" : "default", flex: 1, textAlign: "center",
            background: body.trim() && !saving ? "#4ade80" : "#3a3f5c",
            color: body.trim() && !saving ? "#03210f" : "#6b7394",
            fontWeight: 800, borderRadius: 10, padding: "11px 0", fontSize: 14,
          }}>{saving ? "保存中…" : "記録を保存（＋3Lv）"}</button>
          <button onClick={onCancel} style={{ ...btnStyle("#8b93b8"), padding: "11px 18px" }}>やめる</button>
        </div>
      </div>
    </Overlay>
  );
}

function NoteItem({ note, index, total, onDelete }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(note.body);
      setCopied(true); setTimeout(() => setCopied(false), 1500);
    } catch (e) { /* クリップボード不可の環境では何もしない */ }
  };

  return (
    <div style={{ border: "1px solid #262d4d", borderRadius: 10, marginBottom: 8, overflow: "hidden", background: "#10142a" }}>
      <button onClick={() => setOpen(!open)} style={{ all: "unset", cursor: "pointer", display: "flex", width: "100%", boxSizing: "border-box", justifyContent: "space-between", alignItems: "center", padding: "9px 12px" }}>
        <span style={{ fontSize: 12.5, color: "#dfe4ff", fontWeight: 700, display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{ fontFamily: "'DotGothic16', monospace", color: "#6b7394", flexShrink: 0 }}>📖 調査{total - index}</span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{note.title || "（無題の記録）"}</span>
          {note.ai && <span style={{ fontSize: 9.5, color: "#c084fc", border: "1px solid #c084fc66", borderRadius: 999, padding: "0 6px", flexShrink: 0 }}>🤖下書き・要検証</span>}
        </span>
        <span style={{ fontFamily: "'DotGothic16', monospace", fontSize: 11, color: "#6b7394", flexShrink: 0, marginLeft: 8 }}>{note.date} {open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ padding: "4px 12px 12px", borderTop: "1px dashed #262d4d" }}>
          {note.diff && (
            <div style={{ background: "#1a1f0e", border: "1px solid #a3e63544", borderRadius: 8, padding: "8px 10px", margin: "8px 0" }}>
              <div style={{ fontFamily: "'DotGothic16', monospace", fontSize: 10, color: "#a3e635", marginBottom: 3 }}>Δ 前回調査との差分</div>
              <div style={{ fontSize: 12.5, color: "#dfe4ff", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{note.diff}</div>
            </div>
          )}
          <div style={{ marginTop: 6 }}><MdView text={note.body} /></div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={copy} style={{ ...btnStyle("#8b93b8"), padding: "5px 10px", fontSize: 11 }}>{copied ? "✓ コピーした" : "📋 本文をコピー"}</button>
            {!confirm
              ? <button onClick={() => setConfirm(true)} style={{ ...btnStyle("#f87171"), padding: "5px 10px", fontSize: 11 }}>🗑 この記録を削除</button>
              : <button onClick={() => onDelete(note.id)} style={{ ...btnStyle("#f87171"), padding: "5px 10px", fontSize: 11, background: "#f87171", color: "#2a0505" }}>本当に削除する？（-3Lv）</button>}
          </div>
        </div>
      )}
    </div>
  );
}

export { NoteEditor, NoteItem };
