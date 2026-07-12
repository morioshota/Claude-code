/* 卒業アルバム(殿堂):
   リリース(売却)した銘柄を「学んだこと」一言つきで保存する投資日記。
   図鑑からは今までどおり見えるが、ここでは思い出として色鮮やかに並ぶ。
   売買成績を評価する機能ではない——学びを残すのが目的(オーナー方針)。 */

import { useState } from "react";
import { Creature, TypeChip, btnStyle, Overlay } from "./ui.jsx";
import { TYPES } from "../data/constants.js";
import { calcLevel, stageOf } from "../lib/stock.js";

/* リリース確定前に「学んだこと」を書く卒業式モーダル */
export function GraduationModal({ stock, onConfirm, onCancel }) {
  const [lesson, setLesson] = useState(stock.lesson || "");
  return (
    <Overlay onClose={onCancel} z={80}>
      <div style={{ background: "#0e1122", border: "2px solid #3b4470", borderRadius: 18, padding: 18 }}>
        <div style={{ fontFamily: "'DotGothic16', monospace", fontSize: 15, color: "#9ca3af" }}>🕊️ 卒業式</div>
        <div style={{ fontSize: 12, color: "#8b93b8", marginTop: 2, lineHeight: 1.7 }}>
          {stock.name} を野生にかえします。研究の記録と思い出はアルバムに残ります
        </div>
        <div style={{ display: "flex", justifyContent: "center", margin: "14px 0 6px" }}>
          <Creature stock={stock} size={84} />
        </div>
        <div style={{ textAlign: "center", fontFamily: "'DotGothic16', monospace", fontSize: 13, color: "#dfe4ff" }}>
          {stock.name}（Lv.{calcLevel(stock)}・調査記録{stock.noteCount || 0}件）
        </div>
        <label style={{ fontFamily: "'DotGothic16', monospace", fontSize: 11, color: "#8b93b8", letterSpacing: 1.5, display: "block", marginTop: 14, marginBottom: 4 }}>
          この銘柄から学んだこと（任意・あとから書けます）
        </label>
        <textarea
          value={lesson} onChange={(e) => setLesson(e.target.value)} autoFocus
          placeholder="例: 仮説どおり受注は伸びたが、買値が高すぎた。次はバリュエーションも仮説に入れる"
          style={{ width: "100%", boxSizing: "border-box", minHeight: 80, background: "#0b0e1d", border: "1px solid #2a3050", borderRadius: 8, color: "#eef1ff", padding: "9px 10px", fontSize: 13, outline: "none", resize: "vertical", lineHeight: 1.6 }}
        />
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <button onClick={() => onConfirm(lesson.trim())} style={{ all: "unset", cursor: "pointer", flex: 1, textAlign: "center", background: "#9ca3af", color: "#111827", fontWeight: 800, borderRadius: 10, padding: "11px 0", fontSize: 14 }}>
            🕊️ 卒業させる
          </button>
          <button onClick={onCancel} style={{ ...btnStyle("#8b93b8"), padding: "11px 18px" }}>やめる</button>
        </div>
      </div>
    </Overlay>
  );
}

/* 卒業生ひとりぶんのカード */
function AlbumCard({ stock, onSelect, onSaveLesson }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(stock.lesson || "");
  const t = TYPES[stock.type] || TYPES.metal;
  const lv = calcLevel(stock);
  const stage = stageOf(lv);

  return (
    <div style={{ background: "linear-gradient(160deg, #141830 0%, #0e1122 70%)", border: "1.5px solid #2a3050", borderRadius: 14, padding: 14 }}>
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <button onClick={() => onSelect(stock.id)} style={{ all: "unset", cursor: "pointer", filter: `drop-shadow(0 0 8px ${t.color}66)` }} title="詳細を開く">
          <Creature stock={stock} size={62} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#f2f4ff" }}>
            {stock.shiny ? "✨" : ""}{stock.name} <span style={{ fontSize: 11, color: "#6b7394", fontWeight: 400 }}>{stock.code}</span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
            <TypeChip typeKey={stock.type} small />
            <span style={{ fontFamily: "'DotGothic16', monospace", fontSize: 10.5, color: t.color }}>Lv.{lv}「{stage.name}」まで到達</span>
          </div>
          <div style={{ fontSize: 10.5, color: "#5b6284", marginTop: 4 }}>
            🕊️ 卒業日: {stock.soldAt || "記録なし"}　🔬 調査記録 {stock.noteCount || 0}件
          </div>
        </div>
      </div>

      <div style={{ marginTop: 10, background: "#10142a", border: "1px solid #262d4d", borderRadius: 10, padding: "10px 12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <span style={{ fontFamily: "'DotGothic16', monospace", fontSize: 10.5, color: "#fbbf24", letterSpacing: 1.5 }}>📖 学んだこと</span>
          {!editing && (
            <button onClick={() => { setDraft(stock.lesson || ""); setEditing(true); }} style={{ all: "unset", cursor: "pointer", fontSize: 10.5, color: "#8b93b8" }}>✏️ 編集</button>
          )}
        </div>
        {editing ? (
          <div>
            <textarea
              value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus
              style={{ width: "100%", boxSizing: "border-box", minHeight: 60, background: "#0b0e1d", border: "1px solid #2a3050", borderRadius: 8, color: "#eef1ff", padding: "8px 10px", fontSize: 12.5, outline: "none", resize: "vertical", lineHeight: 1.6 }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <button onClick={() => { onSaveLesson(stock.id, draft.trim()); setEditing(false); }} style={{ ...btnStyle("#4ade80"), padding: "5px 14px", fontSize: 11.5 }}>保存</button>
              <button onClick={() => setEditing(false)} style={{ ...btnStyle("#8b93b8"), padding: "5px 12px", fontSize: 11.5 }}>やめる</button>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: stock.lesson ? "#dfe4ff" : "#5b6284", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
            {stock.lesson || "まだ書かれていません。振り返って一言残しておくと、次の研究に効きます"}
          </div>
        )}
      </div>
    </div>
  );
}

export function AlbumView({ stocks, onSelect, onSaveLesson }) {
  const grads = stocks
    .filter((s) => s.status === "sold")
    .sort((a, b) => String(b.soldAt || "").localeCompare(String(a.soldAt || "")));

  if (grads.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "50px 20px", color: "#5b6284", border: "2px dashed #2a3050", borderRadius: 16, fontSize: 13, lineHeight: 2 }}>
        <div style={{ fontSize: 34, marginBottom: 8 }}>🎓</div>
        まだ卒業生はいません。<br />
        銘柄をリリース（売却）すると、学んだことと一緒にここへ記録されます
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 11.5, color: "#8b93b8", marginBottom: 12, lineHeight: 1.7 }}>
        🎓 卒業生 {grads.length}名 — 手放した銘柄の研究記録と学びのアルバム。成績表ではなく、次の研究のための振り返りです
      </div>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
        {grads.map((s) => (
          <AlbumCard key={s.id} stock={s} onSelect={onSelect} onSaveLesson={onSaveLesson} />
        ))}
      </div>
    </div>
  );
}
