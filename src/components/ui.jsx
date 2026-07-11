/* 共通UI部品: マークダウン表示/クリーチャー表示/バッジ/ゲージ/モーダル枠 */

import { TYPES, RARITIES, STATUSES } from "../data/constants.js";
import { buildPixels } from "../lib/sprites.js";

function inlineBold(str, keyBase) {
  const parts = String(str).split("**");
  if (parts.length < 3) return str;
  return parts.map((p, i) =>
    i % 2 === 1 ? <b key={`${keyBase}-${i}`} style={{ color: "#ffe9a8" }}>{p}</b> : p
  );
}

function MdView({ text }) {
  const lines = String(text || "").split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // 表ブロック
    if (line.trim().startsWith("|")) {
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const cells = lines[i].trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
        const isSep = cells.every((c) => /^:?-{2,}:?$/.test(c) || c === "");
        if (!isSep) rows.push(cells);
        i++;
      }
      out.push(
        <div key={`t${i}`} style={{ overflowX: "auto", margin: "8px 0" }}>
          <table style={{ borderCollapse: "collapse", fontSize: 12, minWidth: "60%" }}>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, ci) => (
                    <td key={ci} style={{
                      border: "1px solid #2a3050", padding: "4px 8px",
                      color: ri === 0 ? "#ffd166" : "#dfe4ff",
                      fontWeight: ri === 0 ? 700 : 400, whiteSpace: "nowrap",
                    }}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }
    if (line.startsWith("### ")) out.push(<div key={i} style={{ fontSize: 13, fontWeight: 800, color: "#c7cdec", margin: "10px 0 2px" }}>{line.slice(4)}</div>);
    else if (line.startsWith("## ")) out.push(<div key={i} style={{ fontSize: 13.5, fontWeight: 800, color: "#ffd166", margin: "12px 0 3px", borderLeft: "3px solid #ffd166", paddingLeft: 8 }}>{line.slice(3)}</div>);
    else if (line.startsWith("# ")) out.push(<div key={i} style={{ fontSize: 15, fontWeight: 800, color: "#f2f4ff", margin: "4px 0 6px" }}>{line.slice(2)}</div>);
    else if (/^\s*([-・*]|\d+\.)\s+/.test(line)) out.push(
      <div key={i} style={{ fontSize: 12.5, color: "#dfe4ff", lineHeight: 1.7, paddingLeft: 14, position: "relative" }}>
        <span style={{ position: "absolute", left: 0, color: "#6b7394" }}>▸</span>
        {inlineBold(line.replace(/^\s*([-・*]|\d+\.)\s+/, ""), `b${i}`)}
      </div>
    );
    else if (line.trim() === "") out.push(<div key={i} style={{ height: 6 }} />);
    else out.push(<div key={i} style={{ fontSize: 12.5, color: "#dfe4ff", lineHeight: 1.7 }}>{inlineBold(line, `p${i}`)}</div>);
    i++;
  }
  return <div>{out}</div>;
}

function Creature({ stock, size = 64, sleeping = false }) {
  const { grid, w, h } = buildPixels(stock, sleeping);
  const svg = (
    <svg width={size} height={Math.round(size * (h / w))} viewBox={`0 0 ${w} ${h}`}
      shapeRendering="crispEdges" style={{ display: "block", imageRendering: "pixelated" }}>
      {grid.map((row, y) => row.map((c, x) => (
        c ? <rect key={`${x}-${y}`} x={x} y={y} width="1.02" height="1.02" fill={c} /> : null
      )))}
    </svg>
  );
  if (!stock.shiny) return svg;
  // 色違いはきらめきのオーラをまとう(動きを減らす設定では@media側でアニメ停止)
  return <div style={{ animation: "kzShiny 2.2s ease-in-out infinite" }}>{svg}</div>;
}

/* 3D用: canvasテクスチャ(名前ラベル・💤入り)を生成 */

function RarityBadge({ rarity, size = 14 }) {
  const r = RARITIES.find((x) => x.key === rarity) || RARITIES[0];
  return (
    <span style={{ fontFamily: "'DotGothic16', monospace", fontWeight: 700, fontSize: size, color: r.color, textShadow: r.glow === "none" ? "none" : r.glow, letterSpacing: 1 }}>
      {r.label}
    </span>
  );
}

function TypeChip({ typeKey, small }) {
  const t = TYPES[typeKey] || TYPES.metal;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: t.dark, color: t.color, border: `1px solid ${t.color}55`, borderRadius: 999, padding: small ? "1px 8px" : "3px 10px", fontSize: small ? 10 : 12, fontWeight: 700, whiteSpace: "nowrap" }}>
      <span>{t.icon}</span>{t.label}
    </span>
  );
}

function StatusBadge({ status }) {
  const s = STATUSES[status] || STATUSES.watch;
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: s.color, fontSize: 11, fontWeight: 700 }}>{s.icon} {s.label}</span>;
}

function Gauge({ value, max, color }) {
  const pct = Math.min(100, Math.round((value / Math.max(1, max)) * 100));
  return (
    <div style={{ background: "#1a1f33", borderRadius: 999, height: 8, overflow: "hidden", border: "1px solid #2a3050" }}>
      <div style={{ width: `${pct}%`, height: "100%", borderRadius: 999, background: `linear-gradient(90deg, ${color}88, ${color})`, transition: "width .5s ease" }} />
    </div>
  );
}

const btnStyle = (color) => ({
  all: "unset", cursor: "pointer", border: `1.5px solid ${color}88`, color,
  borderRadius: 10, padding: "8px 14px", fontSize: 12.5, fontWeight: 700,
});

function Overlay({ onClose, children, z = 50 }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(5,7,18,.82)", backdropFilter: "blur(4px)", zIndex: z, display: "flex", justifyContent: "center", alignItems: "flex-start", overflowY: "auto", padding: "24px 12px" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(580px, 100%)" }}>{children}</div>
    </div>
  );
}

function FilterChip({ active, onClick, color, children }) {
  return (
    <button onClick={onClick} style={{
      all: "unset", cursor: "pointer", padding: "4px 11px", borderRadius: 999,
      border: `1.5px solid ${active ? color : "#252b48"}`,
      background: active ? `${color}1a` : "transparent",
      color: active ? color : "#5b6284", fontSize: 11.5, fontWeight: 700,
    }}>
      {children}
    </button>
  );
}

const pageStyle = {
  minHeight: "100vh",
  background: "radial-gradient(1200px 600px at 70% -10%, #1c1445 0%, #0a0d1c 55%) #0a0d1c",
  color: "#eef1ff",
  fontFamily: "'Hiragino Kaku Gothic ProN', 'Noto Sans JP', 'Yu Gothic', sans-serif",
};

export { inlineBold, MdView, Creature, RarityBadge, TypeChip, StatusBadge, Gauge, btnStyle, Overlay, FilterChip, pageStyle };
