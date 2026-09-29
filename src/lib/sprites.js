/* ドット絵生成: 姿は hashStr(証券コード) をシードに決定論的に抽選(CLAUDE.md不変条件1)
   2026-09: 種族は3Dの部品モデル(data/species.js)→ lib/creature3d.js で24ドット前後に描く方式へ刷新。
   研究ステージで姿そのものが進化する(ST1〜2 / ST3〜4 / ST5)。
   進化装飾(evoPattern)と色違い(shiny)は「抽選結果をstockに永久保存」する方式で
   決定論を維持しつつ上乗せされる。 */

import { CREATURE_LOOK, SPECIES_POOL } from "../data/species.js";
import { evoPoolFor } from "../data/evolution.js";
import { calcLevel, stageOf } from "./stock.js";
import { hashStr, mulberry32, hueShift } from "./util.js";
import { renderCreature, chain, mirror, S, E } from "./creature3d.js";

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
/* トリミングして、ついでに「左と上を何マス削ったか」も返す。
   きらめき(✦)の座標をトリミング後のグリッドに合わせ続けるために使う */
const trimGridInfo = (grid) => {
  let g = grid, dy = 0;
  while (g.length > 1 && !g[0].some(Boolean)) { g = g.slice(1); dy++; }
  while (g.length > 1 && !g[g.length - 1].some(Boolean)) g = g.slice(0, -1);
  const used = g[0].map((_, x) => g.some((row) => row[x]));
  let l = used.indexOf(true), r = used.lastIndexOf(true);
  if (l < 0) { l = 0; r = g[0].length - 1; }
  return { grid: g.map((row) => row.slice(l, r + 1)), dx: l, dy };
};
const trimGrid = (grid) => trimGridInfo(grid).grid;
const topRow = (g) => g.findIndex((r) => r.some(Boolean));
const bottomRow = (g) => g.length - 1 - [...g].reverse().findIndex((r) => r.some(Boolean));
const rowBounds = (row) => {
  const xs = row.map((c, i) => (c ? i : -1)).filter((i) => i >= 0);
  return xs.length ? [xs[0], xs[xs.length - 1]] : null;
};

/* 進化装飾(evoPattern)を3Dの小物として足す。体のいちばん上(頭)と横・後ろに付ける。
   段階 t が上がるほど大きく育つ。オーラは仕上げの後に✦で描く(下記) */
function evoAccessory(kind, parts, t) {
  let top = null;
  parts.forEach((p) => { const z = p.c[2] + p.r[2]; if (!top || z > top.z) top = { z, x: p.c[0], y: p.c[1], r: p.r[0] }; });
  if (!top) return [];
  const k = 1 + t * 0.35, z = top.z - 0.6, y = top.y, r = Math.max(2, top.r * 0.6);
  const mids = parts.reduce((m, p) => Math.max(m, Math.abs(p.c[0]) + p.r[0]), 0);
  const midZ = parts.reduce((a, p) => a + p.c[2], 0) / parts.length;
  switch (kind) {
    case "horns": return mirror(chain([r, y, z], [r + 2 * k, y - 0.5, z + 3.2 * k], 0.9, 0.3, 4, "white"));
    case "antenna": return [...chain([0, y, z], [0.6, y - 0.5, z + 3.4 * k], 0.35, 0.35, 4, "dark"), S(0.6, y - 0.5, z + 3.8 * k, 0.9, "gold")];
    case "crest": return Array.from({ length: 3 }, (_, i) => S(0, y - 1 + i * 1.2, z + 0.8 + (i === 1 ? 0.8 : 0) * k, 1 * k, i === 1 ? "gold" : "accent"));
    case "ears": return mirror(chain([r * 0.9, y - 0.5, z - 0.5], [r * 0.9 + 1.2, y - 1, z + 2.6 * k], 1.1, 0.4, 3, "body"));
    case "spikes": return [-1, 0, 1].map((i) => E(i * 1.8, y - 2, z - 0.4, 0.6, 0.6, 1.4 * k, "accent"));
    case "flame": return [S(0, y - 0.5, z + 0.8, 1.3 * k, "glowpart"), S(0.6, y - 0.8, z + 2.2 * k, 0.8 * k, "glowpart")];
    case "crystal": return [E(0, y + 0.4, z + 0.6, 0.9 * k, 0.9 * k, 1.8 * k, "gem")];
    case "wings": return mirror([E(mids + 1.2, -1.5, midZ + 2, 1.6 * k, 0.6, 2.6 * k, "white")]);
    case "tail": { const back = parts.reduce((m, p) => Math.min(m, p.c[1] - p.r[1]), 0); return chain([0, back + 0.8, midZ - 2], [0, back - 3 * k, midZ + 1.5 * k], 0.9, 0.4, 4, "accent"); }
    default: return [];
  }
}

const TIER_SCALE = [1.9, 2.15, 2.4]; // ST1〜2で約28〜30ドット幅(顔を描き分ける余白)
const PAL_FIXED = {
  dark: "#3b3f5c", white: "#f3f5fa", gold: "#ffd166", metal: "#b6c0cf", glass: "#8fd3f0", gem: "#5eead4",
  pink: "#ffa3bd", red: "#ef5b5b", orange: "#fb923c", leaf: "#4caf50", wood: "#a0703f", yellow: "#fde047",
};

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
  const shiny = !!stock.shiny; // 色違い: 当選時にstock.shinyへ永久保存。配色を150度回した特別カラー
  const pattern = Math.floor(rng() * 3); // 0なし 1ぶち 2しま
  const flip = rng() < 0.35;             // 左右反転の個体

  // 進化: 研究ステージで姿そのものが変わる(ST1〜2 / ST3〜4 / ST5)
  const stageNo = stageOf(calcLevel(stock)).no;
  const t = stageNo >= 5 ? 2 : stageNo >= 3 ? 1 : 0;
  const built = species.build(t);
  let parts = built.parts.filter(Boolean);
  let glow = built.glow || "#fef08a";

  // 進化装飾(ステージ2から)。パターンは進化時に抽選されstockに保存済み。
  // 保存がない(旧データ・インポート)場合はコードから決定論的にフォールバック
  let evoKind = null;
  if (stageNo >= 2) {
    const evoPool = evoPoolFor(stock.type);
    evoKind = stock.evoPattern || evoPool[hashStr(seedSrc + ":evo") % evoPool.length];
    if (evoKind !== "aura") parts = [...parts, ...evoAccessory(evoKind, parts, Math.min(stageNo - 2, 2))];
  }

  if (shiny) {
    body = hueShift(body, 150); belly = hueShift(belly, 150); accent = hueShift(accent, 150); glow = hueShift(glow, 150);
  }
  const pal = { ...PAL_FIXED, body, belly, accent, glowpart: glow };

  // 大きさ(段階が上がるほど大きい)+左右反転
  const G = TIER_SCALE[t];
  const fx = flip ? -1 : 1;
  parts = parts.map((p) => ({ ...p, c: [p.c[0] * G * fx, p.c[1] * G, p.c[2] * G], r: p.r.map((v) => v * G), a: p.a ? p.a * fx : 0 }));
  const faces = (built.faces || []).map((f) => ({ ...f, p: [f.p[0] * G * fx, f.p[1] * G, f.p[2] * G], mirror: flip ? !f.mirror : !!f.mirror }));

  let grid = renderCreature({ parts, faces, pal, pattern, glow, sleeping, blush: !!built.blush });
  grid = trimGrid(grid);

  // ---- 光の粒(オーラ・色違い)は仕上げの後に✦(ダイヤ型)で描く:
  //      輪郭処理を通さないことで「浮いた四角」ではなく「光」に見える ----
  // ✦を打った位置を覚えておく。UI側(Creature)がここに動く光を重ねて「模様」ではなく
  // 「きらめき」に見せる。padGrid/trimGridでずれるので、その都度まとめて補正する
  const marks = [];
  const shiftMarks = (dx, dy) => marks.forEach((m) => { m.x += dx; m.y += dy; });
  const sparkle = (g, y, x, core, arm) => {
    put(g, y, x, core);
    [[y - 1, x], [y + 1, x], [y, x - 1], [y, x + 1]].forEach(([yy, xx]) => put(g, yy, xx, arm));
  };
  if (evoKind === "aura") {
    grid = padGrid(grid, 4, 4); shiftMarks(4, 4);
    const t = topRow(grid), b2 = bottomRow(grid);
    const tb = rowBounds(grid[t]) || [0, grid[0].length - 1];
    const bb = rowBounds(grid[b2]) || tb;
    const midY = Math.round((t + b2) / 2);
    const cx = Math.round((tb[0] + tb[1]) / 2);
    const level = Math.min(stageNo - 1, 3);
    const spots = [
      [t - 1, tb[1] + 3], [b2 - 1, bb[0] - 2], [midY - 2, bb[0] - 3], [t - 2, tb[0] - 1],
      [midY, tb[1] + 4], [b2 + 1, bb[1] + 2], [t - 3, cx],
      [midY + 2, bb[0] - 4], [t, tb[0] - 3], [b2 - 3, bb[1] + 3],
    ];
    const n = level === 1 ? 4 : level === 2 ? 7 : 10;
    spots.slice(0, n).forEach(([y, x], i) => {
      sparkle(grid, y, x, i % 2 ? WHITE : GOLD, i % 2 ? "#e9d5ff" : "#fde68a");
      marks.push({ x, y, kind: "aura" });
    });
    const ta = trimGridInfo(grid); grid = ta.grid; shiftMarks(-ta.dx, -ta.dy);
  }
  if (shiny) {
    grid = padGrid(grid, 2, 2); shiftMarks(2, 2);
    const t = topRow(grid), b2 = bottomRow(grid);
    const tb = rowBounds(grid[t]) || [0, grid[0].length - 1];
    const bb = rowBounds(grid[b2]) || tb;
    sparkle(grid, t + 1, tb[1] + 2, WHITE, "#e9d5ff");
    marks.push({ x: tb[1] + 2, y: t + 1, kind: "shiny" });
    sparkle(grid, b2 - 2, bb[0] - 1, WHITE, "#e9d5ff");
    marks.push({ x: bb[0] - 1, y: b2 - 2, kind: "shiny" });
    const ts = trimGridInfo(grid); grid = ts.grid; shiftMarks(-ts.dx, -ts.dy);
  }
  return { grid, w: grid[0].length, h: grid.length, speciesName: species.name, sparkles: marks };
}

/* 図鑑・詳細用: SVGでドットを描く(カクカク保持) */

function spriteCanvasFor(stock, sleeping) {
  const { grid, w, h } = buildPixels(stock, sleeping);
  const S = 5, W = Math.max(132, w * S + 12), labelH = 20; // 2倍密度グリッドに合わせてセルを縮小(見かけの大きさは維持)
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
