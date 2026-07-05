/* 銘柄の追加・編集フォーム */

import { useState } from "react";
import { btnStyle, Overlay } from "./ui.jsx";
import { TYPES, RARITIES, STATUSES } from "../data/constants.js";

function StockForm({ initial, onSave, onCancel }) {
  const [f, setF] = useState(initial || {
    name: "", code: "", market: "", type: "tech", rarity: 2, status: "watch",
    hypothesis: "", bullets: [], risks: [], triggers: [], logs: [],
  });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const listToText = (a) => (a || []).join("\n");
  const textToList = (s) => s.split("\n").map((x) => x.trim()).filter(Boolean);

  const label = { fontFamily: "'DotGothic16', monospace", fontSize: 11, color: "#8b93b8", letterSpacing: 1.5, display: "block", marginBottom: 4, marginTop: 12 };
  const input = { width: "100%", boxSizing: "border-box", background: "#0b0e1d", border: "1px solid #2a3050", borderRadius: 8, color: "#eef1ff", padding: "9px 10px", fontSize: 13.5, outline: "none" };

  return (
    <Overlay onClose={onCancel} z={60}>
      <div style={{ background: "#0e1122", border: "2px solid #3b4470", borderRadius: 18, padding: 18 }}>
        <div style={{ fontFamily: "'DotGothic16', monospace", fontSize: 15, color: "#ffd166", marginBottom: 4 }}>
          {initial ? "▶ カードを編集" : "▶ あたらしい銘柄をゲット！"}
        </div>
        <div style={{ fontSize: 11.5, color: "#8b93b8" }}>リサーチした銘柄を図鑑に登録します</div>

        <label style={label}>銘柄名 *</label>
        <input style={input} value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="例: 明電舎" />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={label}>コード *</label>
            <input style={input} value={f.code} onChange={(e) => set("code", e.target.value)} placeholder="例: 6508" />
          </div>
          <div>
            <label style={label}>市場</label>
            <input style={input} value={f.market} onChange={(e) => set("market", e.target.value)} placeholder="例: 東証プライム" />
          </div>
        </div>

        <label style={label}>タイプ（セクター属性）</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {Object.entries(TYPES).map(([k, t]) => (
            <button key={k} onClick={() => set("type", k)} style={{
              all: "unset", cursor: "pointer", padding: "5px 10px", borderRadius: 999,
              border: `1.5px solid ${f.type === k ? t.color : "#2a3050"}`,
              background: f.type === k ? t.dark : "transparent",
              color: f.type === k ? t.color : "#8b93b8", fontSize: 11.5, fontWeight: 700,
            }}>
              {t.icon} {t.label}<span style={{ fontSize: 9, opacity: .7 }}>（{t.sub}）</span>
            </button>
          ))}
        </div>

        <label style={label}>レアリティ（自分の確信度・注目度でOK）</label>
        <div style={{ display: "flex", gap: 6 }}>
          {RARITIES.map((r) => (
            <button key={r.key} onClick={() => set("rarity", r.key)} style={{
              all: "unset", cursor: "pointer", padding: "6px 12px", borderRadius: 8,
              border: `1.5px solid ${f.rarity === r.key ? r.color : "#2a3050"}`,
              color: f.rarity === r.key ? r.color : "#5b6284",
              fontFamily: "'DotGothic16', monospace", fontWeight: 700, fontSize: 13,
              boxShadow: f.rarity === r.key ? r.glow : "none",
            }}>{r.label}</button>
          ))}
        </div>

        <label style={label}>ステータス</label>
        <div style={{ display: "flex", gap: 6 }}>
          {Object.entries(STATUSES).map(([k, s]) => (
            <button key={k} onClick={() => set("status", k)} style={{
              all: "unset", cursor: "pointer", padding: "6px 12px", borderRadius: 8,
              border: `1.5px solid ${f.status === k ? s.color : "#2a3050"}`,
              color: f.status === k ? s.color : "#5b6284", fontSize: 12, fontWeight: 700,
            }}>{s.icon} {s.label}</button>
          ))}
        </div>

        <label style={label}>マクロ仮説（この銘柄を調べる背景）</label>
        <textarea style={{ ...input, minHeight: 54, resize: "vertical" }} value={f.hypothesis}
          onChange={(e) => set("hypothesis", e.target.value)} placeholder="例: 宇宙産業は政府支出拡大で中長期成長" />

        <label style={label}>わざ ＝ 強気材料（1行に1つ）</label>
        <textarea style={{ ...input, minHeight: 60, resize: "vertical" }} defaultValue={listToText(f.bullets)}
          onChange={(e) => set("bullets", textToList(e.target.value))} placeholder={"防衛予算の拡大\nデータセンター需要"} />

        <label style={label}>よわてん ＝ リスク（1行に1つ）</label>
        <textarea style={{ ...input, minHeight: 60, resize: "vertical" }} defaultValue={listToText(f.risks)}
          onChange={(e) => set("risks", textToList(e.target.value))} placeholder={"市況依存\n為替リスク"} />

        <label style={label}>にげるタイミング ＝ 前提が崩れる条件（1行に1つ）</label>
        <textarea style={{ ...input, minHeight: 50, resize: "vertical" }} defaultValue={listToText(f.triggers)}
          onChange={(e) => set("triggers", textToList(e.target.value))} placeholder="例: 2四半期連続で受注が前年割れ" />

        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button
            onClick={() => { if (f.name.trim() && f.code.trim()) onSave(f); }}
            style={{
              all: "unset", cursor: "pointer", flex: 1, textAlign: "center",
              background: f.name.trim() && f.code.trim() ? "#ffd166" : "#3a3f5c",
              color: f.name.trim() && f.code.trim() ? "#221a00" : "#6b7394",
              fontWeight: 800, borderRadius: 10, padding: "11px 0", fontSize: 14,
            }}>
            {initial ? "保存する" : "ゲットする！"}
          </button>
          <button onClick={onCancel} style={{ ...btnStyle("#8b93b8"), padding: "11px 18px" }}>やめる</button>
        </div>
      </div>
    </Overlay>
  );
}

export { StockForm };
