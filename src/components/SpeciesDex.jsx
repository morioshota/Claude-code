/* 🔍 種族図鑑(2026-11・集める楽しさ)
   全60種族(タイプごと6種族)の一覧。出会った種族は姿と名前、まだの種族はシルエットと「？？？」。
   種族は証券コードで決まる(不変条件1)ので、ここに並ぶのは「どの銘柄を登録・研究してきたか」の足あと。
   方針(CLAUDE.md): 遊びの指標で、銘柄の良し悪しとは無関係。集めるために銘柄を増やすことは勧めない */
import { useState } from "react";
import { Overlay, gridImage } from "./ui.jsx";
import { TYPES } from "../data/constants.js";
import { SPECIES_POOL } from "../data/species.js";
import { buildSpeciesPixels } from "../lib/sprites.js";
import { discoveredSpecies, SPECIES_TOTAL } from "../lib/stock.js";
import { evoPoolFor } from "../data/evolution.js";

const mono = "'DotGothic16', ui-monospace, monospace";

function SpeciesImg({ type, index, size, opts, hidden }) {
  const { grid, w, h } = buildSpeciesPixels(type, index, opts);
  const dw = h / w > 1.1 ? Math.round(size * 1.1 * (w / h)) : size;
  return (
    <img src={gridImage(grid)} alt="" width={dw} height={Math.round(dw * (h / w))}
      style={{ imageRendering: "pixelated", display: "block", filter: hidden ? "brightness(0) invert(.22)" : "none", opacity: hidden ? 0.75 : 1 }} />
  );
}

export function SpeciesDexModal({ stocks, onSelect, onClose }) {
  const found = discoveredSpecies(stocks);
  const [pick, setPick] = useState(null); // {type, index}
  const picked = pick && found.get(`${pick.type}:${pick.index}`);

  return (
    <Overlay onClose={onClose} z={60}>
      <div style={{ background: "#0e1122", border: "2px solid #3b4470", borderRadius: 18, padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontFamily: mono, fontSize: 15, color: "#ffd166" }}>
            🔍 種族図鑑 <span style={{ fontSize: 12, color: "#8b93b8" }}>{found.size}/{SPECIES_TOTAL}</span>
          </div>
          <button onClick={onClose} style={{ all: "unset", cursor: "pointer", color: "#8b93b8", fontSize: 18, padding: 4 }}>✕</button>
        </div>
        <div style={{ height: 8, borderRadius: 4, background: "#1b2140", overflow: "hidden", marginTop: 10 }}>
          <div style={{ width: `${(found.size / SPECIES_TOTAL) * 100}%`, height: "100%", background: "linear-gradient(90deg,#ffd16688,#ffd166)" }} />
        </div>

        {pick && picked && (
          <div style={{ marginTop: 12, border: `1.5px solid ${TYPES[pick.type].color}88`, borderRadius: 12, padding: 12, background: "#141830" }}>
            <div style={{ fontFamily: mono, fontSize: 14, color: "#f2f4ff" }}>{SPECIES_POOL[pick.type][pick.index].name}
              <span style={{ fontSize: 11, color: TYPES[pick.type].color, marginLeft: 8 }}>{TYPES[pick.type].icon} {TYPES[pick.type].label}</span>
            </div>
            {/* 育つすがた: 研究ステージで進化装飾が育つ(装飾の種類は銘柄ごとに違う。ここは見本) */}
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end", marginTop: 10, overflowX: "auto" }}>
              {[1, 2, 3, 4].map((st) => (
                <div key={st} style={{ textAlign: "center", flexShrink: 0 }}>
                  <SpeciesImg type={pick.type} index={pick.index} size={st === 1 ? 52 : 60} opts={{ stageNo: st, evoKind: evoPoolFor(pick.type)[0] }} />
                  <div style={{ fontSize: 9.5, color: "#6b7394", marginTop: 3 }}>ST{st}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 10, color: "#5b6284", marginTop: 4 }}>育つすがたの見本です（進化のかざりは銘柄ごとに違います）</div>
            <div style={{ fontSize: 11.5, color: "#c7cdec", marginTop: 8, lineHeight: 1.8 }}>
              この種族の銘柄：
              {picked.map((s) => (
                <button key={s.id} onClick={() => { onClose(); onSelect(s.id); }} style={{ all: "unset", cursor: "pointer", color: "#ffd166", marginRight: 10 }}>
                  {s.name}{s.status === "sold" ? "（卒業）" : ""} ›
                </button>
              ))}
            </div>
          </div>
        )}

        {Object.keys(SPECIES_POOL).map((type) => {
          const t = TYPES[type], pool = SPECIES_POOL[type];
          const n = pool.filter((_, i) => found.has(`${type}:${i}`)).length;
          return (
            <div key={type} style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: t.color, marginBottom: 6 }}>
                {t.icon} {t.label} <span style={{ color: "#6b7394", fontWeight: 400 }}>{n}/{pool.length}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6 }}>
                {pool.map((sp, i) => {
                  const got = found.has(`${type}:${i}`);
                  const on = pick && pick.type === type && pick.index === i;
                  return (
                    <button key={i} onClick={() => got && setPick(on ? null : { type, index: i })} style={{
                      all: "unset", cursor: got ? "pointer" : "default", boxSizing: "border-box", borderRadius: 10, padding: "8px 4px 6px",
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 4, minHeight: 86,
                      background: got ? t.dark : "#10142a", border: `1.5px solid ${on ? t.color : got ? `${t.color}55` : "#1f2540"}`,
                    }}>
                      <SpeciesImg type={type} index={i} size={46} hidden={!got} />
                      <span style={{ fontSize: 10.5, color: got ? "#f2f4ff" : "#4a5170", fontWeight: got ? 700 : 400, textAlign: "center", lineHeight: 1.3 }}>{got ? sp.name : "？？？"}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        <div style={{ fontSize: 10, color: "#5b6284", marginTop: 14, lineHeight: 1.7 }}>
          種族は証券コードで決まり、登録した銘柄（卒業生も含む）の種族がここに残ります。
          集めた数は研究の足あとを表す遊びの指標で、銘柄の良し悪しや売買とは関係ありません。
        </div>
      </div>
    </Overlay>
  );
}
