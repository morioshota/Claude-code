/* 共通UI部品: マークダウン表示/クリーチャー表示/バッジ/ゲージ/モーダル枠 */

import { TYPES, RARITIES, STATUSES } from "../data/constants.js";
import { evoFxOf } from "../data/evolution.js";
import { buildPixels } from "../lib/sprites.js";
import { moveTierOf } from "../lib/stock.js";
import { hashStr, today } from "../lib/util.js";

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

/* きらめき(✦)1つぶんの光。ドット絵の✦の上にこれを重ねると
   「置いてある模様」ではなく「またたく光」に見える */
/* 色の格子→画像(dataURL)。1ドット=1要素のSVGより軽い(高精細の種族は格子が約4倍) */
const IMG_CACHE = new WeakMap();
function gridImage(grid) {
  let url = IMG_CACHE.get(grid);
  if (url) return url;
  const h = grid.length, w = grid[0].length;
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d");
  grid.forEach((row, y) => row.forEach((c, x) => { if (c) { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); } }));
  url = cv.toDataURL();
  IMG_CACHE.set(grid, url);
  return url;
}

const GLINT_PATH = "M0,-2.7 L0.7,-0.7 L2.7,0 L0.7,0.7 L0,2.7 L-0.7,0.7 L-2.7,0 L-0.7,-0.7 Z";

/* live: 生きている動き(まばたき・呼吸・鮮度に合わせたしぐさ)を付ける。図鑑カードと詳細だけで使う(一覧表などは止め絵)
   しぐさは研究の鮮度(不変条件3)と同じ区切り: 0-14日=はねる / -45日=ゆれて歩く / -90日=ゆっくり / 90日超=眠る(Zzz)。
   きょう調べた子は♪を出して喜ぶ。株価は関係しない(不変条件5) */
function Creature({ stock, size = 64, sleeping = false, shadow = true, live = false }) {
  const { grid, w, h, sparkles } = buildPixels(stock, sleeping);
  const blinkGrid = live && !sleeping ? buildPixels(stock, false, { closed: true }).grid : null;
  const tier = live ? (sleeping ? 3 : moveTierOf(stock)) : -1;
  const happy = live && !sleeping && stock.lastResearch === today();
  // 動きの出だしは銘柄ごとにずらす(そろって動くと機械的に見える)
  const phase = live ? (hashStr(String(stock.code || stock.name || "")) % 40) / 10 : 0;
  const glints = sleeping ? [] : (sparkles || []);
  // 進化演出の なごり(2026-11)。レア以上の演出を引いた子だけ、生きている表示(図鑑カード・詳細)で さりげなく出す
  const trace = live && !sleeping ? evoFxOf(stock) : null;
  // 幅だけで大きさを決めると、背の高い種族(長い耳・旗など)でカードが縦に伸びる。高さにも上限を設ける
  const dispW = h / w > 1.15 ? Math.round(size * 1.15 * (w / h)) : size;
  const svg = (
    <svg width={dispW} height={Math.round(dispW * (h / w))} viewBox={`0 0 ${w} ${h}`}
      shapeRendering="crispEdges" className={live ? `kzCr kzCr${tier}${happy ? " kzCrHappy" : ""}` : undefined}
      style={{ display: "block", imageRendering: "pixelated", position: "relative", zIndex: 1, overflow: "visible", animationDelay: live ? `-${phase}s` : undefined }}>
      <image href={gridImage(grid)} x="0" y="0" width={w} height={h} style={{ imageRendering: "pixelated" }} />
      {/* まばたき: 目を閉じた絵を重ねて、ときどき一瞬だけ見せる */}
      {blinkGrid && blinkGrid.length === h && (
        <image className="kzCrBlink" href={gridImage(blinkGrid)} x="0" y="0" width={w} height={h}
          style={{ imageRendering: "pixelated", animationDelay: `-${(phase * 1.3).toFixed(1)}s`, animationDuration: `${(3.8 + (phase % 2)).toFixed(1)}s` }} />
      )}
      {/* ✦の位置でまたたく光(オーラ進化・色違い)。位置はsprites.jsが返す */}
      {glints.map((s, i) => (
        <g key={`gl${i}`} transform={`translate(${s.x + 0.5} ${s.y + 0.5})`}>
          <path className="kzGlintGlow" d={GLINT_PATH} fill={s.kind === "shiny" ? "#f0abfc" : "#ffd166"}
            style={{ animationDelay: `${(i * 0.31).toFixed(2)}s`, animationDuration: `${(2.0 + (i % 3) * 0.4).toFixed(2)}s` }} />
          <path className="kzGlint" d={GLINT_PATH} fill="#ffffff"
            style={{ animationDelay: `${(i * 0.31).toFixed(2)}s`, animationDuration: `${(2.0 + (i % 3) * 0.4).toFixed(2)}s` }} />
        </g>
      ))}
    </svg>
  );
  // HD-2D風の足元の落とし影(柔らかい楕円)。地面に立っている立体感を出す
  const withShadow = (
    <div style={{ position: "relative", display: "inline-block" }}>
      {shadow && (
        <div style={{
          position: "absolute", left: "12%", right: "12%", bottom: "-4%", height: "14%",
          background: "radial-gradient(ellipse at center, rgba(0,0,0,.42) 0%, rgba(0,0,0,0) 68%)",
          zIndex: 0, pointerEvents: "none",
        }} />
      )}
      {svg}
      {tier === 3 && <span className="kzCrZzz" style={{ position: "absolute", right: "-6%", top: "-8%", zIndex: 2, fontFamily: "'DotGothic16', monospace", fontSize: Math.max(9, size * 0.2), color: "#a5b4fc", pointerEvents: "none" }}>z</span>}
      {trace && <FxTrace kind={trace} size={size} delay={phase} />}
      {happy && <span className="kzCrNote" style={{ position: "absolute", right: "-4%", top: "-10%", zIndex: 2, fontSize: Math.max(10, size * 0.22), color: "#ffd166", pointerEvents: "none" }}>♪</span>}
    </div>
  );
  const traced = trace && TRACE_GLOW[trace] ? <div className={TRACE_GLOW[trace]} style={{ display: "inline-block", animationDelay: `-${phase}s` }}>{withShadow}</div> : withShadow;
  if (!stock.shiny) return traced;
  // 色違いはきらめきのオーラをまとう(動きを減らす設定では@media側でアニメ停止)
  return <div style={{ animation: "kzShiny 2.2s ease-in-out infinite", display: "inline-block" }}>{traced}</div>;
}

/* なごりの光(体のまわり)。CSSは KabuDex.jsx の kzTr* */
const TRACE_GLOW = { inazuma: "kzTrZap", niji: "kzTrNiji", ougon: "kzTrGold" };
/* なごりの粒(ときどき出る小さな飾り)。位置は大きさに合わせる */
function FxTrace({ kind, size, delay }) {
  const fs = Math.max(9, size * 0.17);
  const base = { position: "absolute", zIndex: 2, pointerEvents: "none", fontSize: fs, lineHeight: 1, animationDelay: `-${(delay * 1.7).toFixed(1)}s` };
  if (kind === "ryusei") return <span className="kzTrStar" style={{ ...base, right: "-10%", top: "4%", fontSize: fs * 1.3, color: "#fff7d6", textShadow: "0 0 6px #fde68a, 6px -4px 6px #fde68a99, 12px -8px 8px #fde68a55" }}>✦</span>;
  if (kind === "sakura") return <span className="kzTrPetal" style={{ ...base, left: "8%", top: "-6%", color: "#f9a8d4" }}>❀</span>;
  if (kind === "shabon") return <span className="kzTrBubble" style={{ ...base, left: "70%", bottom: "4%", width: fs * 1.1, height: fs * 1.1, borderRadius: "50%", border: "1px solid #cffafecc",
    background: "radial-gradient(circle at 32% 30%, #ffffffdd 0 14%, #a5f3fc33 30%, #e9d5ff44 70%, #a5f3fc66 100%)" }} />;
  if (kind === "ougon") return <span className="kzTrGlint" style={{ ...base, left: "14%", top: "8%", color: "#fff7d6", textShadow: "0 0 6px #ffd166" }}>✦</span>;
  return null;
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

/* ---- 押し込めるボタン ----
   立体的に浮いていて、押すと沈む(:activeはCSS側の .kzBtn で処理)。
   選択中は「押し込まれたまま」になり、いまどれを選んでいるかが姿勢で分かる。
   色はボタンの主色。押し込みの深さ(3px)はCSSと合わせてある。
   ⚠ ここに all:"unset" を書かないこと。インラインのほうが強いので .kzBtn の
     box-shadow / transform / :active が丸ごと消える(リセットはCSS側の .kzBtn が担当) */
function PressButton({ color = "#8b93b8", active = false, filled = false, onClick, title, style, children }) {
  const base = filled ? color : "transparent";
  return (
    <button
      type="button" onClick={onClick} title={title}
      className={`kzBtn${active ? " kzBtnOn" : ""}`}
      style={{
        display: "flex", gap: 6,
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        border: `1.5px solid ${active ? color : `${color}77`}`,
        background: filled ? base : active ? `${color}26` : `${color}0f`,
        color: filled ? "#1b1200" : color,
        // 沈み込みの土台。押すとこの影が縮む
        "--kzBtnShadow": active ? `${color}55` : `${color}44`,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function Overlay({ onClose, children, z = 50 }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(5,7,18,.82)", backdropFilter: "blur(4px)", zIndex: z, display: "flex", justifyContent: "center", alignItems: "flex-start", overflowY: "auto", padding: "24px 12px" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(580px, 100%)" }}>{children}</div>
    </div>
  );
}

function FilterChip({ active, onClick, color, children }) {
  return (
    <button onClick={onClick} className={`kzBtn kzChip${active ? " kzBtnOn" : ""}`} style={{
      padding: "5px 12px", borderRadius: 999,
      border: `1.5px solid ${active ? color : "#252b48"}`,
      background: active ? `${color}26` : "#ffffff08",
      color: active ? color : "#6b7394", fontSize: 11.5, fontWeight: 700,
      whiteSpace: "nowrap", "--kzBtnShadow": active ? `${color}55` : "#00000066",
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

export { inlineBold, MdView, gridImage, Creature, RarityBadge, TypeChip, StatusBadge, Gauge, btnStyle, PressButton, Overlay, FilterChip, pageStyle };
