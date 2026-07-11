/* ドット絵生成: 姿は hashStr(証券コード) をシードに決定論的に抽選(CLAUDE.md不変条件1)
   進化装飾(evoPattern)と色違い(shiny)は「抽選結果をstockに永久保存」する方式で
   決定論を維持しつつ上乗せされる。 */

import { CREATURE_LOOK, SPECIES_POOL } from "../data/species.js";
import { evoPoolFor } from "../data/evolution.js";
import { calcLevel, stageOf } from "./stock.js";
import { hashStr, mulberry32, shade, hueShift } from "./util.js";

const GOLD = "#ffd166", WHITE = "#ffffff";

const put = (g, y, x, col) => {
  if (y >= 0 && y < g.length && x >= 0 && x < g[0].length) g[y][x] = col;
};
const padGrid = (grid, top, side) => {
  const w = grid[0].length + side * 2;
  const empty = () => new Array(w).fill(null);
  const padded = grid.map((row) => [...new Array(side).fill(null), ...row, ...new Array(side).fill(null)]);
  return [...Array.from({ length: top }, empty), ...padded, empty()];
};
const trimGrid = (grid) => {
  let g = grid;
  while (g.length > 1 && !g[0].some(Boolean)) g = g.slice(1);
  while (g.length > 1 && !g[g.length - 1].some(Boolean)) g = g.slice(0, -1);
  const used = g[0].map((_, x) => g.some((row) => row[x]));
  let l = used.indexOf(true), r = used.lastIndexOf(true);
  if (l < 0) { l = 0; r = g[0].length - 1; }
  return g.map((row) => row.slice(l, r + 1));
};
const topRow = (g) => g.findIndex((r) => r.some(Boolean));
const bottomRow = (g) => g.length - 1 - [...g].reverse().findIndex((r) => r.some(Boolean));
const rowBounds = (row) => {
  const xs = row.map((c, i) => (c ? i : -1)).filter((i) => i >= 0);
  return xs.length ? [xs[0], xs[xs.length - 1]] : null;
};

/* 進化装飾をグリッドに描く。level: 1(ステージ2) / 2(ステージ3) / 3(ステージ4)
   ステージが上がるほど同じ系統の装飾が育って大きくなる */
function applyEvoPattern(grid, kind, level, accent, body) {
  const g = padGrid(grid, 3 + level, 2 + level);
  const t = topRow(g), b = bottomRow(g);
  const tb = rowBounds(g[t]) || [0, g[0].length - 1];
  const bb = rowBounds(g[b]) || tb;
  const cx = Math.round((tb[0] + tb[1]) / 2);
  const midY = Math.round((t + b) / 2);
  const midL = rowBounds(g[midY]) ? rowBounds(g[midY])[0] : tb[0];
  const midR = rowBounds(g[midY]) ? rowBounds(g[midY])[1] : tb[1];

  switch (kind) {
    case "horns":
      for (let i = 1; i <= level; i++) {
        put(g, t - i, tb[0] + 1 + (i > 1 ? 0 : 0) - (i - 1), accent);
        put(g, t - i, tb[1] - 1 + (i - 1), accent);
      }
      if (level >= 3) { put(g, t - level - 1, tb[0] - level + 1, GOLD); put(g, t - level - 1, tb[1] + level - 1, GOLD); }
      break;
    case "antenna":
      for (let i = 1; i <= level; i++) put(g, t - i, cx, accent);
      put(g, t - level - 1, cx, GOLD);
      if (level >= 2) { put(g, t - 1, cx - 2, accent); put(g, t - 2, cx - 2, GOLD); put(g, t - 1, cx + 2, accent); put(g, t - 2, cx + 2, GOLD); }
      if (level >= 3) { put(g, t - level - 2, cx, WHITE); }
      break;
    case "wings":
      for (let i = 1; i <= level; i++) {
        for (let dy = 0; dy <= level - i; dy++) {
          put(g, midY - 1 + dy, midL - i, i === level ? GOLD : body);
          put(g, midY - 1 + dy, midR + i, i === level ? GOLD : body);
        }
      }
      break;
    case "tail":
      for (let i = 1; i <= level + 1; i++) put(g, b - i + 1, bb[1] + i, i === level + 1 ? GOLD : accent);
      if (level >= 3) put(g, b - level - 1, bb[1] + level + 2, GOLD);
      break;
    case "aura": {
      const spots = [
        [t - 2, tb[0] - 2], [t - 2, tb[1] + 2], [b + 1, bb[0] - 2], [b + 1, bb[1] + 2],
        [midY, midL - 3], [midY, midR + 3], [t - 3, cx],
        [midY - 2, midL - 2], [midY - 2, midR + 2], [b - 1, bb[0] - 3], [b - 1, bb[1] + 3],
      ];
      const n = level === 1 ? 4 : level === 2 ? 7 : 11;
      spots.slice(0, n).forEach(([y, x], i) => put(g, y, x, i % 3 === 0 ? GOLD : i % 3 === 1 ? WHITE : accent));
      break;
    }
    case "spikes":
      for (let x = tb[0]; x <= tb[1]; x += 2) {
        for (let i = 1; i <= Math.min(level, 2); i++) put(g, t - i, x, accent);
        if (level >= 3) put(g, t - 3, x, GOLD);
      }
      break;
    case "ears":
      for (let i = 1; i <= level; i++) {
        put(g, t - i, tb[0] + 2, body); put(g, t - i, tb[1] - 2, body);
        if (i < level) { put(g, t - i, tb[0] + 3, accent); put(g, t - i, tb[1] - 3, accent); }
      }
      break;
    case "crest":
      for (let i = 1; i <= level + 1; i++) put(g, t - i, cx, i % 2 ? accent : GOLD);
      if (level >= 2) { put(g, t - 1, cx - 1, accent); put(g, t - 1, cx + 1, accent); }
      if (level >= 3) { put(g, t - 2, cx - 1, GOLD); put(g, t - 2, cx + 1, GOLD); }
      break;
    case "flame":
      for (let dx = -level + 1; dx <= level - 1; dx++) {
        const h2 = level - Math.abs(dx);
        for (let i = 1; i <= h2; i++) {
          put(g, t - i, cx + dx, (dx + i) % 3 === 0 ? GOLD : (dx + i) % 3 === 1 ? accent : "#f97316");
        }
      }
      put(g, t - level - 1, cx, GOLD);
      break;
    case "crystal":
      put(g, t - 2, cx, GOLD);
      if (level >= 2) { put(g, t - 3, cx, accent); put(g, t - 2, cx - 1, accent); put(g, t - 2, cx + 1, accent); put(g, t - 1, cx, accent); }
      if (level >= 3) { put(g, t - 4, cx, WHITE); put(g, t - 3, cx - 1, GOLD); put(g, t - 3, cx + 1, GOLD); }
      break;
    default:
      break;
  }
  return g; // トリミングは呼び出し側で最後に1回(王冠・きらめきの余白を残すため)
}

function buildPixels(stock, sleeping) {
  const look = CREATURE_LOOK[stock.type] || CREATURE_LOOK.metal;
  const pool = SPECIES_POOL[stock.type] || SPECIES_POOL.metal;
  // シードは証券コード(なければ銘柄名)。内部IDは使わない:
  // IDはデータ初期化のたびに再発行されるが、コードなら「1721=同じ姿」が永久に保証される
  const seedSrc = String(stock.code || stock.name || "??").toUpperCase().trim();
  const rng = mulberry32(hashStr(seedSrc));
  const species = pool[Math.floor(rng() * pool.length)];
  let body = look.bodies[Math.floor(rng() * look.bodies.length)];
  let belly = look.belly, accent = look.accent;
  // 色違い(シャイニー): 当選時にstock.shinyへ永久保存される。配色を150度回した特別カラー
  const shiny = !!stock.shiny;
  if (shiny) { body = hueShift(body, 150); belly = hueShift(belly, 150); accent = hueShift(accent, 150); }
  const pattern = Math.floor(rng() * 3);   // 0なし 1ぶち 2しま
  const flip = rng() < 0.35;               // 左右反転の個体
  const darker = shade(body, 0.72);
  const striped = shade(body, 0.84);
  const colors = {
    b: body, s: belly, a: accent, o: "#1f2430",
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

  // 進化装飾: ステージ2以上で成長。パターンは進化時に抽選されstockに保存済み。
  // 保存がない(旧データ・インポート)場合はコードから決定論的にフォールバック
  const stageNo = stageOf(calcLevel(stock)).no;
  if (stageNo >= 2) {
    const evoPool = evoPoolFor(stock.type);
    const kind = stock.evoPattern || evoPool[hashStr(seedSrc + ":evo") % evoPool.length];
    grid = applyEvoPattern(grid, kind, Math.min(stageNo - 1, 3), accent, body);
  }
  // ステージ4は王冠を頭上に(体の中心=最も幅の広い行の中央に載せる)
  if (stageNo >= 4) {
    if (grid[0].some(Boolean)) grid = padGrid(grid, 1, 0); // 王冠の余白
    const gw = grid[0].length;
    let best = null; // {y, cx} 最も幅広い行
    grid.forEach((row, y) => {
      const bnd = rowBounds(row);
      if (bnd && (!best || bnd[1] - bnd[0] > best.span)) best = { y, cx: Math.round((bnd[0] + bnd[1]) / 2), span: bnd[1] - bnd[0] };
    });
    if (best) {
      const t = topRow(grid);
      [best.cx - 1, best.cx, best.cx + 1].forEach((xx, i) => {
        if (xx >= 0 && xx < gw && t >= 1) grid[t - 1][xx] = i === 1 ? "#ffd166" : "#f59e0b";
      });
    }
  }
  // 色違いのきらめき(白ドット)を頭上と足元に決定論的に散らす
  if (shiny) {
    grid = padGrid(grid, 1, 1);
    const t = topRow(grid), b2 = bottomRow(grid);
    const tb = rowBounds(grid[t]) || [0, grid[0].length - 1];
    put(grid, t - 1, tb[1] + 1, WHITE);
    put(grid, b2 - 1, (rowBounds(grid[b2]) || tb)[0] - 1, WHITE);
  }
  grid = trimGrid(grid);
  return { grid, w: grid[0].length, h: grid.length, speciesName: species.name };
}

/* 図鑑・詳細用: SVGでドットを描く(カクカク保持) */

function spriteCanvasFor(stock, sleeping) {
  const { grid, w, h } = buildPixels(stock, sleeping);
  const S = 9, W = Math.max(132, w * S + 12), labelH = 20;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = h * S + labelH;
  const ctx = cv.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  const ox = Math.floor((W - w * S) / 2);
  grid.forEach((row, y) => row.forEach((col, x) => {
    if (col) { ctx.fillStyle = col; ctx.fillRect(ox + x * S, y * S, S, S); }
  }));
  if (sleeping) { ctx.font = "15px sans-serif"; ctx.fillText("💤", ox + w * S - 8, 14); }
  const name = (stock.shiny ? "✨" : "") + (stock.name.length > 7 ? stock.name.slice(0, 6) + "…" : stock.name);
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
