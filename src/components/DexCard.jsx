/* 図鑑カード(ステージで見た目が進化) */

import { Creature, RarityBadge, TypeChip, StatusBadge } from "./ui.jsx";
import { TYPES, RARITIES } from "../data/constants.js";
import { calcLevel, stageOf, freshInfo } from "../lib/stock.js";

function DexCard({ stock, onClick }) {
  const t = TYPES[stock.type] || TYPES.metal;
  const r = RARITIES.find((x) => x.key === stock.rarity) || RARITIES[0];
  const lv = calcLevel(stock);
  const stage = stageOf(lv);
  const fresh = freshInfo(stock);
  const sold = stock.status === "sold";

  const inner = (
    <div style={{
      background: stage.no >= 3
        ? `radial-gradient(120% 90% at 50% 0%, ${t.dark} 0%, #12152a 65%)`
        : `linear-gradient(160deg, ${t.dark} 0%, #12152a 70%)`,
      border: stage.no >= 4 ? "none" : `${stage.no >= 2 ? 2 : 1.5}px solid ${sold ? "#374151" : t.color}${stage.no >= 3 ? "aa" : "66"}`,
      borderRadius: 13, padding: 12, position: "relative", height: "100%", boxSizing: "border-box",
      boxShadow: !sold && (stage.no >= 3 || stock.rarity >= 4) ? r.glow : "none",
    }}>
      {stage.no >= 3 && !sold && (
        <>
          <span style={{ position: "absolute", top: 6, left: 8, color: t.color, fontSize: 10, opacity: .8 }}>✦</span>
          <span style={{ position: "absolute", bottom: 8, right: 8, color: t.color, fontSize: 10, opacity: .8 }}>✦</span>
        </>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={{ fontFamily: "'DotGothic16', monospace", fontSize: 11, color: "#6b7394" }}>No.{String(stock.no).padStart(3, "0")}</span>
        <RarityBadge rarity={stock.rarity} size={13} />
      </div>
      <div style={{
        display: "flex", justifyContent: "center", margin: "2px 0 4px",
        filter: sold ? "none" : `drop-shadow(0 0 ${6 + stage.no * 3}px ${t.color}${stage.no >= 3 ? "aa" : "66"})`,
        animation: stage.no >= 4 && !sold ? "kzAura 2.4s ease-in-out infinite" : "none",
      }}>
        <Creature stock={stock} size={stage.iconSize + 38} sleeping={!!(fresh && fresh.days !== null && fresh.days > 90)} />
      </div>
      <div style={{ textAlign: "center", marginBottom: 4 }}>
        <span style={{
          fontFamily: "'DotGothic16', monospace", fontSize: 9.5, letterSpacing: 1,
          color: stage.no >= 4 ? "#ffd166" : stage.no >= 3 ? t.color : "#5b6284",
          border: `1px solid ${stage.no >= 4 ? "#ffd166" : stage.no >= 3 ? t.color : "#333a5c"}55`,
          borderRadius: 999, padding: "1px 8px",
        }}>
          {stage.no >= 4 ? "👑 " : ""}S{stage.no} {stage.name}
        </span>
      </div>
      <div style={{ textAlign: "center", fontWeight: 800, fontSize: 14, color: "#eef1ff", lineHeight: 1.3, minHeight: 36 }}>
        {stock.name}
        <div style={{ fontFamily: "'DotGothic16', monospace", fontSize: 10, color: "#8b93b8", fontWeight: 400 }}>{stock.code}</div>
      </div>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
        <TypeChip typeKey={stock.type} small />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <StatusBadge status={stock.status} />
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          {fresh && <span title={fresh.label} style={{ fontSize: 12 }}>{fresh.icon}</span>}
          <span style={{ fontFamily: "'DotGothic16', monospace", fontSize: 12, color: "#ffd166" }}>Lv.{lv}</span>
        </span>
      </div>
    </div>
  );

  return (
    <button onClick={onClick} style={{
      all: "unset", cursor: "pointer", display: "block",
      borderRadius: 15, position: "relative",
      padding: stage.no >= 4 && !sold ? 2 : 0,
      background: stage.no >= 4 && !sold
        ? "linear-gradient(120deg, #f0abfc, #ffd166, #4ade80, #60a5fa, #f0abfc)" : "transparent",
      backgroundSize: "300% 300%",
      animation: stage.no >= 4 && !sold ? "kzHolo 6s linear infinite" : "none",
      opacity: sold ? 0.55 : 1, filter: sold ? "grayscale(.7)" : "none",
      transition: "transform .15s ease",
    }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-3px)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
    >
      {inner}
    </button>
  );
}

export { DexCard };
