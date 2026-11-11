/* ドット絵生成: 姿は hashStr(証券コード) をシードに決定論的に抽選(CLAUDE.md不変条件1)
   2026-09末: 3D部品モデル方式を撤回し、この手描きドット(12px格子→Scale2x→陰影→輪郭)に戻した
   進化装飾(evoPattern)と色違い(shiny)は「抽選結果をstockに永久保存」する方式で
   決定論を維持しつつ上乗せされる。 */

import { CREATURE_LOOK, SPECIES_POOL } from "../data/species.js";
import { findSpecial, specialsVersion } from "./specials.js";
import { evoPoolFor, normEvo } from "../data/evolution.js";
import { calcLevel, stageOf } from "./stock.js";
import { hashStr, mulberry32, shade, hueShift } from "./util.js";

const GOLD = "#ffd166", WHITE = "#ffffff";
const EYE = "#111827"; // 目の色(この色のマスを「目」として、閉じた絵を作る)

/* 目を閉じる: 2倍に拡大したあとの目(2×2)の上半分をまわりの色で埋めて、横一本の線にする */
const closeEyes = (g) => {
  const out = g.map((r) => [...r]);
  for (let y = 0; y < g.length - 1; y++) {
    for (let x = 0; x < g[0].length; x++) {
      if (g[y][x] !== EYE || g[y + 1][x] !== EYE || (y > 0 && g[y - 1][x] === EYE)) continue;
      // 上・左・右のうち、目でない色でふたをする(白目に囲まれた目は白くならないよう、上を優先)
      const lid = [g[y - 1] && g[y - 1][x], g[y][x - 1], g[y][x + 1]].find((c) => c && c !== EYE && c !== WHITE)
        || [g[y - 1] && g[y - 1][x], g[y][x - 1], g[y][x + 1]].find((c) => c && c !== EYE);
      if (lid) out[y][x] = lid;
    }
  }
  return out;
};

/* ---- GBA風仕上げ(すべて決定論的な画像処理なので不変条件1は維持される) ----
   1) EPX/Scale2x で2倍拡大: 斜め線がなめらかにつながり24ドット相当の密度になる
   2) 3トーン陰影: 左上光源。上面・左面はハイライト、下面・右面と下半身は影
   3) アウトライン: シルエット外周に暗い縁取り(GBAスプライトの定番) */

const parseCol = (c) => {
  if (c[0] === "#") {
    const n = parseInt(c.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = c.match(/rgb\((\d+),(\d+),(\d+)\)/);
  return m ? [+m[1], +m[2], +m[3]] : [128, 128, 128];
};
const mixCol = (c, target, f) => {
  const a = parseCol(c);
  const v = a.map((x, i) => Math.round(x + (target[i] - x) * f));
  return `rgb(${v[0]},${v[1]},${v[2]})`;
};
const lum = (c) => { const [r, g, b] = parseCol(c); return (r * 3 + g * 6 + b) / 2550; };

const epx2 = (g) => {
  const h = g.length, w = g[0].length;
  const out = Array.from({ length: h * 2 }, () => new Array(w * 2).fill(null));
  const at = (y, x) => (y >= 0 && y < h && x >= 0 && x < w ? g[y][x] : null);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const P = g[y][x], A = at(y - 1, x), B = at(y, x + 1), C = at(y, x - 1), D = at(y + 1, x);
      out[y * 2][x * 2]         = C === A && C !== D && A !== B ? A : P;
      out[y * 2][x * 2 + 1]     = A === B && A !== C && B !== D ? B : P;
      out[y * 2 + 1][x * 2]     = D === C && D !== B && C !== A ? C : P;
      out[y * 2 + 1][x * 2 + 1] = B === D && B !== A && D !== C ? D : P;
    }
  }
  return out;
};

const shadeGrid = (g) => {
  const h = g.length, w = g[0].length;
  const at = (y, x) => (y >= 0 && y < h && x >= 0 && x < w ? g[y][x] : null);
  let top = h, bot = -1;
  g.forEach((row, y) => { if (row.some(Boolean)) { if (y < top) top = y; if (y > bot) bot = y; } });
  const span = Math.max(1, bot - top);
  const out = g.map((row) => [...row]);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = g[y][x];
      if (!c || lum(c) < 0.16) continue; // 目などの暗色はいじらない(潰れ防止)
      const openU = !at(y - 1, x), openL = !at(y, x - 1), openD = !at(y + 1, x), openR = !at(y, x + 1);
      let f = 0;
      if (openU) f += 0.42;
      if (openL) f += 0.18;
      if (openU && openL) f += 0.16; // 左上角のスペキュラ
      if (f > 0) { out[y][x] = mixCol(c, [255, 255, 255], Math.min(f, 0.62)); continue; }
      let d = 0;
      if (openD) d += 0.38;
      if (openR) d += 0.16;
      const rel = (y - top) / span;
      if (rel > 0.55) d += 0.28 * ((rel - 0.55) / 0.45); // 下半身は暗めにして丸みを出す
      if (d > 0) out[y][x] = mixCol(c, [10, 12, 24], Math.min(d, 0.55));
    }
  }
  return out;
};

const OUTLINE = "#10131f";
const outlineGrid = (grid) => {
  const g = padGrid(grid, 1, 1);
  const h = g.length, w = g[0].length;
  const src = g.map((r) => [...r]);
  const at = (y, x) => (y >= 0 && y < h && x >= 0 && x < w ? src[y][x] : null);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (src[y][x]) continue;
      if (at(y - 1, x) || at(y + 1, x) || at(y, x - 1) || at(y, x + 1)) g[y][x] = OUTLINE;
    }
  }
  return g;
};

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

/* 進化装飾をグリッドに描く。level: 1(ステージ2) / 2(ステージ3) / 3(ステージ4以上)
   ステージが上がるほど同じ系統の装飾が育って大きくなる。
   2026-11 描き直し(オーナー指摘「ツノがよく分からない棒にしか見えない」):
   - 1マス幅の線は2倍拡大しても「棒」にしか見えない → 根元が太く先が細い「形」で描く
   - 以前は絵のいちばん上の行に生やしていたので、カメは甲羅からツノが出ていた。
     目の位置(eyes)から頭を割り出して、頭の上に生やす
   - ツノは象牙色、つばさは白い羽…と、体色に溶けない「それらしい色」にする */
const IVORY = "#f1e7cf", IVORY_D = "#cdbf9c", FEATHER = "#f4f7fb", FEATHER_D = "#c3cddb";
const HAT = "#6d4fc4", HAT_D = "#4a3391", RIBBON = "#fb5a7a", RIBBON_L = "#ffa3b5", PETAL = "#ffd9e6", PETAL_L = "#ffffff", LEAF = "#4ade80", LEAF_D = "#1f9d55", LEAF_V = "#b6f5c9";
const SCARF = "#e5484d", SCARF_L = "#ffe9a8", WOOD = "#a0703f";
function applyEvoPattern(grid, kind, level, accent, body, eyes) {
  const padT = 3 + level, padS = 2 + level;
  const g = padGrid(grid, padT, padS);
  const H = g.length, W = g[0].length;
  const filled = (y, x) => y >= 0 && y < H && x >= 0 && x < W && !!g[y][x];
  const t = topRow(g), b = bottomRow(g);
  const tb = rowBounds(g[t]) || [0, W - 1];
  const bb = rowBounds(g[b]) || tb;
  const midY = Math.round((t + b) / 2);
  const midL = rowBounds(g[midY]) ? rowBounds(g[midY])[0] : tb[0];
  const midR = rowBounds(g[midY]) ? rowBounds(g[midY])[1] : tb[1];
  // 列 x でいちばん上にあるマスの行(無ければ null)
  const colTop = (x) => { for (let y = 0; y < H; y++) if (filled(y, x)) return y; return null; };
  // 頭: 目の位置から。目が無い種族は絵の上辺の中央
  const ex = (eyes || []).map(([x]) => x + padS);
  const xl = ex.length ? Math.min(...ex) : Math.round((tb[0] + tb[1]) / 2) - 1;
  const xr = ex.length ? Math.max(...ex) : Math.round((tb[0] + tb[1]) / 2) + 1;
  const hx = Math.round((xl + xr) / 2);
  const headTop = (x0, x1) => { let m = null; for (let x = x0; x <= x1; x++) { const y = colTop(x); if (y !== null && (m === null || y < m)) m = y; } return m === null ? t : m; };
  const hy = headTop(xl - 1, xr + 1); // 頭のてっぺんの行(耳やツノの先も含む)
  const yc = colTop(hx) ?? hy;        // 頭の中央のてっぺん(炎・結晶など真ん中に載せるもの用。耳の間に浮かないように)
  // 左右の生えぎわ(目が1つ=横向きの種族でも左右に開くように、最低1マスは離す)
  const L = xl === xr ? xl - 1 : xl, R = xl === xr ? xr + 1 : xr;
  const yL = (colTop(L) ?? hy), yR = (colTop(R) ?? hy);
  // 体の向き: 目が中心より右なら頭は右 → しっぽは左
  const cxBody = (midL + midR) / 2;
  const tailDir = ex.length && hx > cxBody + 0.5 ? -1 : 1;
  const both = (fn) => { fn(L, yL, -1); fn(R, yR, 1); };

  switch (kind) {
    case "horns": // 根元2マス→外へ反って細くなる牛のツノ
      both((x, y, d) => {
        put(g, y - 1, x, IVORY_D); put(g, y - 1, x + d, IVORY);
        put(g, y - 2, x + d, IVORY);
        if (level >= 2) { put(g, y - 2, x + 2 * d, IVORY); put(g, y - 3, x + 2 * d, IVORY); }
        if (level >= 3) { put(g, y - 4, x + 2 * d, IVORY); put(g, y - 5, x + d, GOLD); put(g, y - 4, x + d, IVORY_D); }
      });
      break;
    case "wings": { // 上へ広がる白い羽(下のふちが羽先)
      const n = level + 1;
      [[midL, -1], [midR, 1]].forEach(([x0, d]) => {
        for (let i = 1; i <= n; i++) {
          for (let j = i - 1; j <= level; j++) {
            const tip = j === i - 1; // 斜めの下ふち=羽先
            put(g, midY - j, x0 + i * d, tip ? (i === n ? GOLD : FEATHER_D) : FEATHER);
          }
        }
      });
      break;
    }
    case "aura": // (ここには来ない: キラキラは仕上げのあとに✦で描く)
      break;
    case "halo": { // 頭の上に浮かぶ金の輪(奥のふち＋左右。手前は頭にかくれる)
      const y = yc - 2;
      for (let dx = -1; dx <= 1; dx++) put(g, y - 1, hx + dx, dx === 0 && level >= 2 ? WHITE : GOLD);
      put(g, y, hx - 2, GOLD); put(g, y, hx + 2, GOLD);
      if (level >= 3) { put(g, y - 3, hx + 2, WHITE); put(g, y - 2, hx - 3, WHITE); put(g, y - 3, hx - 1, GOLD); } // きらめき
      break;
    }
    case "hat": { // まほうつかいのとんがり帽子(つば→金の帯→先が曲がる)
      const y = yc - 1, bw = level === 1 ? 1 : 2;
      for (let dx = -bw; dx <= bw; dx++) put(g, y, hx + dx, HAT_D);                       // つば
      const cone = level === 1 ? [1, 1] : level === 2 ? [3, 1, 1] : [3, 3, 1];
      cone.forEach((wd, i) => { for (let k = 0; k < wd; k++) put(g, y - 1 - i, hx - Math.floor(wd / 2) + k, i === 0 && wd === 3 ? GOLD : HAT); });
      if (level === 1) put(g, y - 1, hx, GOLD);
      if (level >= 3) { put(g, y - 4, hx + 1, HAT); put(g, y - 5, hx + 2, GOLD); }        // 曲がった先に星
      break;
    }
    case "ribbon": { // 頭のてっぺんのちょうむすび(まん中の結び目から左右に羽が広がる)
      const y = yc - 1;
      put(g, y, hx, GOLD);
      [-1, 1].forEach((d) => {
        put(g, y, hx + d, RIBBON);
        if (level >= 2) { put(g, y, hx + 2 * d, RIBBON); put(g, y - 1, hx + 2 * d, RIBBON_L); }
        if (level >= 3) { put(g, y, hx + 3 * d, RIBBON); put(g, y - 1, hx + 3 * d, RIBBON); put(g, y - 2, hx + 3 * d, RIBBON_L); put(g, y - 1, hx + d, RIBBON); }
      });
      break;
    }
    case "flower": { // 頭に咲く花(まん中が金・花びらは白〜桃)
      const y = yc - 2;
      put(g, y, hx, GOLD);
      [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([dy, dx]) => put(g, y + dy, hx + dx, PETAL));
      if (level >= 2) [[-1, -1], [-1, 1]].forEach(([dy, dx]) => put(g, y + dy, hx + dx, PETAL_L));
      if (level >= 3) { put(g, y + 1, hx - 2, LEAF); put(g, y + 1, hx + 2, LEAF); put(g, y - 2, hx, PETAL_L); put(g, y, hx - 2, PETAL_L); put(g, y, hx + 2, PETAL_L); }
      break;
    }
    case "leaf": { // 頭にのせた大きなはっぱ(ななめに伸びる。まん中に葉脈)
      const y = yc - 1;
      put(g, y, hx, LEAF_D);                                                              // くき
      put(g, y - 1, hx, LEAF); put(g, y - 1, hx + 1, LEAF_V); put(g, y - 2, hx + 1, LEAF);
      if (level >= 2) { put(g, y - 2, hx, LEAF); put(g, y - 2, hx + 2, LEAF_V); put(g, y - 3, hx + 1, LEAF); put(g, y - 3, hx + 2, LEAF); put(g, y - 1, hx + 2, LEAF_D); }
      if (level >= 3) { put(g, y - 4, hx + 2, LEAF); put(g, y - 3, hx + 3, LEAF_V); put(g, y - 4, hx + 3, GOLD); put(g, y - 2, hx + 3, LEAF_D); put(g, y - 1, hx - 1, LEAF); put(g, y - 2, hx - 1, LEAF_D); }
      break;
    }
    case "scarf": { // 首に巻いたマフラー(体の上に帯を描き、はしが後ろへなびく)
      // 正面向きは顔の下いっぱいに、横向きは頭のまわりだけ(体じゅうに巻くと腹巻きに見えた)
      const frontal = ex.length >= 2 && Math.abs(hx - cxBody) <= 0.5;
      const eyeY = (eyes || []).length ? Math.max(...eyes.map(([, y]) => y)) + padT : t + 1;
      const y = Math.min(b - 1, eyeY + (frontal ? 2 : 1));
      const rb = rowBounds(g[y]);
      if (!rb) break;
      const x0b = frontal ? rb[0] : Math.max(rb[0], hx - 2), x1b = frontal ? rb[1] : Math.min(rb[1], hx + 2);
      for (let x = x0b; x <= x1b; x++) if (g[y][x]) g[y][x] = (x - x0b) % 3 === 2 && level >= 2 ? SCARF_L : SCARF;
      const dd = tailDir;                                   // なびく向き=おしりがわ
      if (frontal) { // 正面向き: 顔の横から下へたれる
        const sx = dd > 0 ? rb[1] : rb[0];
        put(g, y, sx + dd, SCARF); put(g, y + 1, sx + dd, SCARF);
        if (level >= 2) { put(g, y + 1, sx + 2 * dd, SCARF_L); put(g, y + 2, sx + 2 * dd, SCARF); }
        if (level >= 3) { put(g, y + 2, sx + 3 * dd, SCARF); put(g, y + 3, sx + 3 * dd, GOLD); }
      } else {       // 横向き: 首のうしろから、背中の上へなびく
        const bx = dd > 0 ? x1b : x0b;
        put(g, y - 1, bx + dd, SCARF);
        if (level >= 2) { put(g, y - 2, bx + 2 * dd, SCARF_L); put(g, y - 2, bx + dd, SCARF); }
        if (level >= 3) { put(g, y - 3, bx + 3 * dd, SCARF); put(g, y - 4, bx + 3 * dd, GOLD); }
      }
      break;
    }
    case "wand": { // 手に持った星のつえ(持つのは顔がわ)
      const d = -tailDir, x0 = d > 0 ? midR : midL, y0 = Math.min(b - 1, midY + 1);
      put(g, y0, x0 + d, WOOD); put(g, y0 - 1, x0 + 2 * d, WOOD);
      if (level >= 2) put(g, y0 - 2, x0 + 2 * d, WOOD);
      const sy = y0 - (level >= 2 ? 4 : 3), sx = x0 + 2 * d; // 星のまん中
      put(g, sy, sx, WHITE); put(g, sy - 1, sx, GOLD); put(g, sy + 1, sx, GOLD); put(g, sy, sx - 1, GOLD); put(g, sy, sx + 1, GOLD);
      if (level >= 3) { put(g, sy - 2, sx + d, WHITE); put(g, sy + 1, sx + 2 * d, WHITE); put(g, sy - 1, sx - d, GOLD); put(g, sy - 1, sx + d, GOLD); put(g, sy - 2, sx, GOLD); }
      break;
    }
    default:
      break;
  }
  return g; // トリミングは呼び出し側で最後に1回(王冠・きらめきの余白を残すため)
}

/* 明るさだけ動かす(k>0で白へ、k<0で黒へ寄せる) */
const tone = (hex, k) => {
  const n = parseInt(hex.slice(1), 16), to = k > 0 ? 255 : 0, a = Math.abs(k);
  const ch = (v) => Math.round(v + (to - v) * a).toString(16).padStart(2, "0");
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
};
const pickOf = (r, arr) => arr[Math.floor(r() * arr.length)];

/* 個体差(色だけ): 同じ種族が並んでも見分けられるように、体とアクセントの色あい・明るさを散らす。
   シードは「証券コード+:ind」の別系統なので、種族・模様・左右反転の抽選結果は変わらない */
function individualOf(seedSrc) {
  const r = mulberry32(hashStr(seedSrc + ":ind"));
  return {
    bodyHue: pickOf(r, [-42, -24, 0, 0, 24, 42]),
    bodyTone: pickOf(r, [-0.22, -0.1, 0, 0.12]),
    accentHue: pickOf(r, [-110, -60, 0, 0, 60, 110, 170]),
    accentTone: pickOf(r, [-0.25, -0.12, 0, 0.15]),
  };
}

/* 同じ個体・同じ段階なら描き直さない。姿に効く値だけをキーにする
   (opts.lowres は3D方式の名残で、いまはどちらでも同じ絵) */
const PIX_CACHE = new Map();
function buildPixels(stock, sleeping, opts = {}) {
  // opts.closed: 目を閉じた絵(まばたき用。眠っているときはいつも閉じる)
  const closed = !!opts.closed || !!sleeping;
  const key = [stock.code, stock.name, stock.type, calcLevel(stock), !!stock.shiny, stock.evoPattern || "", stock.special || "", specialsVersion(), !!sleeping, closed].join("|");
  const hit = PIX_CACHE.get(key);
  if (hit) return hit;
  const res = buildPixelsRaw(stock, sleeping, { closed });
  if (PIX_CACHE.size > 600) PIX_CACHE.clear();
  PIX_CACHE.set(key, res);
  return res;
}

function buildPixelsRaw(stock, sleeping, opts = {}) {
  const look = CREATURE_LOOK[stock.type] || CREATURE_LOOK.metal;
  const pool = SPECIES_POOL[stock.type] || SPECIES_POOL.metal;
  // opts.force: 種族図鑑・見本用に、抽選を使わず「この種族・この段階・この装飾」を素の配色で描く
  const force = opts.force || null;
  // シードは証券コード(なければ銘柄名)。内部IDは使わない:
  // IDはデータ初期化のたびに再発行されるが、コードなら「1721=同じ姿」が永久に保証される
  const seedSrc = String(stock.code || stock.name || "??").toUpperCase().trim();
  const rng = mulberry32(hashStr(seedSrc));
  const drawn = pool[Math.floor(rng() * pool.length)];
  const species = force ? pool[force.index] : drawn;
  let body = look.bodies[Math.floor(rng() * look.bodies.length)];
  let belly = look.belly, accent = look.accent;
  const ind = individualOf(seedSrc);
  if (force) body = look.bodies[0];
  else {
    body = tone(hueShift(body, ind.bodyHue), ind.bodyTone);
    accent = tone(hueShift(accent, ind.accentHue), ind.accentTone);
  }
  // 色違い(シャイニー): 当選時にstock.shinyへ永久保存される。配色を150度回した特別カラー
  const shiny = !force && !!stock.shiny;
  if (shiny) { body = hueShift(body, 150); belly = hueShift(belly, 150); accent = hueShift(accent, 150); }
  const pattern = force ? (rng(), 0) : Math.floor(rng() * 3);   // 0なし 1ぶち 2しま
  const flip = force ? (rng(), false) : rng() < 0.35;          // 左右反転の個体
  const darker = shade(body, 0.72);
  const striped = shade(body, 0.84);
  const colors = {
    b: body, s: belly, a: accent, o: "#1f2430",
    w: "#ffffff", y: "#ffd166", e: EYE,
    n: "#a0703f", c: "#f3dfb8", g: "#c8962e", r: "#b8553a", // 固定色(たぬき等、自然な色で分かる動物用)
  };
  // 特別キャラ(当選してstock.specialに保存済み)は種族の代わりにその姿で描く。
  // 固有の配色のまま(色違いのときだけ色相を回す)、左右反転・進化装飾はしない
  const special = force ? null : findSpecial(stock.special); // パックが無い端末では通常の種族で描く
  const w = Math.max(...(special || species).px.map((r) => r.length));
  let grid = special ? special.px.map((row) => [...row.padEnd(w, ".")].map((ch) => {
    if (ch === ".") return null;
    const c = special.pal[ch] || "#888888";
    return shiny ? hueShift(c, 150) : c;
  })) : species.px.map((row, y) => {
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
  if (flip && !special) grid = grid.map((row) => [...row].reverse());

  // 進化装飾: ステージ2以上で成長。パターンは進化時に抽選されstockに保存済み。
  // 保存がない(旧データ・インポート)場合はコードから決定論的にフォールバック
  const stageNo = force ? (force.stageNo || 1) : stageOf(calcLevel(stock)).no;
  let evoKind = null;
  if (stageNo >= 2 && !special) {
    const evoPool = evoPoolFor(stock.type);
    evoKind = normEvo((force && force.evoKind) || stock.evoPattern || evoPool[hashStr(seedSrc + ":evo") % evoPool.length]);
    // オーラ系はここでは描かない: 光の粒はGBA仕上げの後に✦で描く(下記)
    if (evoKind !== "aura") {
      const lv = Math.min(stageNo - 1, 3);
      // 頭の位置(目)を元のドットから拾う。左右反転した個体は座標も反転
      const eyes = [];
      species.px.forEach((row, y) => [...row.padEnd(w, ".")].forEach((ch, x) => { if (ch === "e") eyes.push([flip ? w - 1 - x : x, y]); }));
      grid = applyEvoPattern(grid, evoKind, lv, accent, body, eyes);
    }
  }
  // ステージ4は王冠を頭上に(体の中心=最も幅の広い行の中央に載せる)
  // 王冠はクリーチャーの絵には描き足さない(図鑑カード上部に小さく出す: DexCard の PixelCrown)
  grid = trimGrid(grid);
  // GBA風仕上げ: 2倍拡大 → 陰影 → アウトライン(順序重要: 輪郭は陰影の後)
  if (special && special.raw) grid = padGrid(grid, 1, 1); // 元のドット絵のまま(輪郭も描き込み済み)
  else {
    let big = special && special.native ? grid : epx2(grid);
    if (opts.closed && !special) big = closeEyes(big);
    grid = outlineGrid(shadeGrid(big));
  }

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
  return { grid, w: grid[0].length, h: grid.length, speciesName: special ? special.name : species.name, special: !!special, sparkles: marks };
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

/* 種族そのものの見本(種族図鑑・開発用の見本シート)。個体差・模様・反転なしの素の姿 */
const SPECIES_CACHE = new Map();
function buildSpeciesPixels(type, index, { stageNo = 1, evoKind = null } = {}) {
  const key = `${type}|${index}|${stageNo}|${evoKind || ""}`;
  if (!SPECIES_CACHE.has(key)) SPECIES_CACHE.set(key, buildPixelsRaw({ type, code: `${type}:${index}`, name: "" }, false, { force: { index, stageNo, evoKind } }));
  return SPECIES_CACHE.get(key);
}
export { buildPixels, spriteCanvasFor, buildSpeciesPixels };
