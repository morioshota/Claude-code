/* ドット絵生成: 姿は hashStr(証券コード) をシードに決定論的に抽選(CLAUDE.md不変条件1) */

import { CREATURE_LOOK, SPECIES_POOL } from "../data/species.js";
import { calcLevel, stageOf } from "./stock.js";
import { hashStr, mulberry32, shade } from "./util.js";

function buildPixels(stock, sleeping) {
  const look = CREATURE_LOOK[stock.type] || CREATURE_LOOK.metal;
  const pool = SPECIES_POOL[stock.type] || SPECIES_POOL.metal;
  // シードは証券コード(なければ銘柄名)。内部IDは使わない:
  // IDはデータ初期化のたびに再発行されるが、コードなら「1721=同じ姿」が永久に保証される
  const seedSrc = String(stock.code || stock.name || "??").toUpperCase().trim();
  const rng = mulberry32(hashStr(seedSrc));
  const species = pool[Math.floor(rng() * pool.length)];
  const body = look.bodies[Math.floor(rng() * look.bodies.length)];
  const pattern = Math.floor(rng() * 3);   // 0なし 1ぶち 2しま
  const flip = rng() < 0.35;               // 左右反転の個体
  const darker = shade(body, 0.72);
  const striped = shade(body, 0.84);
  const colors = {
    b: body, s: look.belly, a: look.accent, o: "#1f2430",
    w: "#ffffff", y: "#ffd166", e: sleeping ? "#1f2430" : "#111827",
  };
  const w = Math.max(...species.px.map((r) => r.length));
  let grid = species.px.map((row, y) => {
    const padded = row.padEnd(w, ".");
    return [...padded].map((ch, x) => {
      if (ch === ".") return null;
      let col = colors[ch] || body;
      if (ch === "b") {
        if (pattern === 1 && (x * 7 + y * 5) % 11 === 0) col = darker;
        if (pattern === 2 && y % 4 === 1) col = striped;
      }
      return col;
    });
  });
  if (flip) grid = grid.map((row) => [...row].reverse());
  // ステージ4は王冠を頭上に
  const stageNo = stageOf(calcLevel(stock)).no;
  if (stageNo >= 4) {
    outer:
    for (let y = 0; y < grid.length; y++) {
      const xs = grid[y].map((c, i) => (c ? i : -1)).filter((i) => i >= 0);
      if (xs.length > 0) {
        const cx = Math.round((xs[0] + xs[xs.length - 1]) / 2);
        if (y >= 1) {
          [cx - 1, cx, cx + 1].forEach((xx, i) => {
            if (xx >= 0 && xx < w) grid[y - 1][xx] = i === 1 ? "#ffd166" : "#f59e0b";
          });
        }
        break outer;
      }
    }
  }
  return { grid, w, h: grid.length, speciesName: species.name };
}

/* 図鑑・詳細用: SVGでドットを描く(カクカク保持) */

function spriteCanvasFor(stock, sleeping) {
  const { grid, w, h } = buildPixels(stock, sleeping);
  const S = 9, W = 132, labelH = 20;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = h * S + labelH;
  const ctx = cv.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  const ox = Math.floor((W - w * S) / 2);
  grid.forEach((row, y) => row.forEach((col, x) => {
    if (col) { ctx.fillStyle = col; ctx.fillRect(ox + x * S, y * S, S, S); }
  }));
  if (sleeping) { ctx.font = "15px sans-serif"; ctx.fillText("💤", ox + w * S - 8, 14); }
  const name = stock.name.length > 7 ? stock.name.slice(0, 6) + "…" : stock.name;
  ctx.font = "bold 13px sans-serif";
  ctx.textAlign = "center";
  const tw = Math.min(W - 2, ctx.measureText(name).width + 12);
  ctx.fillStyle = "rgba(10,13,28,.78)";
  ctx.fillRect((W - tw) / 2, h * S + 2, tw, 16);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(name, W / 2, h * S + 14);
  return cv;
}

export { buildPixels, spriteCanvasFor };
