/* クリーチャーを「丸い部品の3Dモデル」から小さなドット絵にする(2026-09 全面刷新)。

   なぜ3Dから描くか:
     旧方式は12px幅の文字グリッドを手で打っていたため、同じ属性の種族どうしが似て、
     顔もほぼ同じになっていた。いまは体・頭・耳・角・翼・脚・しっぽを楕円体で組み、
     正面やや上から見た姿を24px前後の格子にレイキャストする(3段階のセル陰影+輪郭)。
     目と口は「手描きのドット判子(スタンプ)」を顔の位置に押す——
     ドラクエのモンスターの愛嬌は目と口の描き分けにあるので、ここは3Dにしない。

   ⚠ すべて決定論的(乱数は証券コードのハッシュだけ)。姿は永久に同じ(不変条件1)。
   ⚠ 部品はすべて楕円体。角・しっぽ・首は「だんだん細くなる球の列(chain)」で曲線を作る */

/* ---------- 部品 ---------- */
export const E = (cx, cy, cz, rx, ry, rz, mat) => ({ c: [cx, cy, cz], r: [rx, ry, rz], mat });
export const S = (cx, cy, cz, r, mat) => E(cx, cy, cz, r, r, r, mat);

/* p0→p1 を ctrl で曲げながら、半径 r0→r1 の球を n 個並べる(角・しっぽ・首・脚) */
export const chain = (p0, p1, r0, r1, n, mat, ctrl = null) => {
  const out = [];
  const c = ctrl || [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, d = t * t;
    out.push(S(a * p0[0] + b * c[0] + d * p1[0], a * p0[1] + b * c[1] + d * p1[1], a * p0[2] + b * c[2] + d * p1[2], r0 + (r1 - r0) * t, mat));
  }
  return out;
};

/* 左右対称の部品(xを反転して2つ) */
export const mirror = (parts) => parts.flatMap((p) => [p, { ...p, c: [-p.c[0], p.c[1], p.c[2]] }]);

/* 頭の表面の点(dx=左右, dz=上下の向き。正面は+y) */
export const onHead = (h, dx, dz, out = 0.92) => {
  const v = [dx, 1, dz];
  const l = Math.hypot(...v);
  return [h.c[0] + (v[0] / l) * h.r[0] * out, h.c[1] + (v[1] / l) * h.r[1] * out, h.c[2] + (v[2] / l) * h.r[2] * out];
};

/* ---------- カメラ(正面やや上・少し斜め) ---------- */
const YAW = 0.32, PITCH = 0.42;
const CAM = [Math.sin(YAW) * Math.cos(PITCH), Math.cos(YAW) * Math.cos(PITCH), Math.sin(PITCH)]; // 物体→カメラ
const RIGHT = [Math.cos(YAW), -Math.sin(YAW), 0];
const UP = [ // RIGHT × CAM
  RIGHT[1] * CAM[2] - RIGHT[2] * CAM[1],
  RIGHT[2] * CAM[0] - RIGHT[0] * CAM[2],
  RIGHT[0] * CAM[1] - RIGHT[1] * CAM[0],
];
const LIGHT = (() => { const v = [-0.55, 0.55, 0.85]; const l = Math.hypot(...v); return v.map((x) => x / l); })();
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const project = (p) => [dot(p, RIGHT), dot(p, UP), dot(p, CAM)]; // 画面x, 画面y(上が+), 奥行き(大=手前)

/* 楕円体と視線の交差(視線はカメラ方向の反対 -CAM)。手前側の点を返す */
const hitEllipsoid = (e, o) => {
  const d = [-CAM[0], -CAM[1], -CAM[2]];
  const oc = [(o[0] - e.c[0]) / e.r[0], (o[1] - e.c[1]) / e.r[1], (o[2] - e.c[2]) / e.r[2]];
  const dd = [d[0] / e.r[0], d[1] / e.r[1], d[2] / e.r[2]];
  const a = dot(dd, dd), b = 2 * dot(oc, dd), c = dot(oc, oc) - 1;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a); // 近いほう
  const p = [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
  const n = [(p[0] - e.c[0]) / (e.r[0] * e.r[0]), (p[1] - e.c[1]) / (e.r[1] * e.r[1]), (p[2] - e.c[2]) / (e.r[2] * e.r[2])];
  const l = Math.hypot(...n) || 1;
  return { t, p, n: [n[0] / l, n[1] / l, n[2] / l] };
};

/* ---------- 色 ---------- */
const hex = (h) => { const n = parseInt(String(h).slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const toHex = (c) => "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
const mixc = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
const h3 = (x, y, z) => { const s = Math.sin(x * 12.99 + y * 78.23 + z * 37.71) * 43758.5453; return s - Math.floor(s); };

export const OUTLINE = "#141626";

/* 3段のセル陰影(明・中・暗)。暗部は少し青へ寄せるとドット絵らしい */
const tone = (base, lam, shiny) => {
  if (lam > 0.62) return mixc(base, [255, 255, 250], shiny ? 0.38 : 0.2);
  if (lam > 0.2) return base;
  return mixc(mixc(base, [20, 24, 60], 0.36), base, 0.1);
};

/* ---------- ドットの判子(目・口) ----------
   k=濃い線 w=白 p=舌・口の中 g=光る目の色 y=金 r=ほほ(赤み) .=そのまま */
export const STAMPS = {
  eye: {
    dot:     ["wk", "kk"],
    big:     [".kk.", "kwwk", "kwkk", ".kk."],
    oval:    ["kk", "wk", "kk"],
    angry:   ["kk.", ".kk", "wkk"],
    slit:    ["gkg", "gkg"],
    glow:    ["gg", "gw"],
    happy:   [".k.", "k.k"],
    sleepyl: ["kkk", "wkk"],
    cyclops: [".kkk.", "kwwwk", "kwkkk", "kwkkk", ".kkk."],
    star:    [".y.", "yky", ".y."],
    closed:  ["kkk"],
  },
  mouth: {
    smile:  ["k...k", ".kkk."],
    grin:   ["kkkkk", "kwkwk", ".kkk."],
    fang:   ["kkkk", "w..w"],
    o:      [".k.", "kpk", ".k."],
    tongue: ["kkkk", ".pp."],
    zigzag: ["kkkkkk", "wkwkwk"],
    cat:    ["k.k.k", ".k.k."],
    line:   ["kkk"],
    mustache: ["kk.kk", ".kkk."],
    big:    [".kkkk.", "kwppwk", ".kkkk."],
  },
};

/* 部品の配列 → 色の格子。faces=[{p, kind:"eye"|"mouth", style, mirror}] */
export function renderCreature({ parts, faces = [], pal, pattern = 0, glow = "#ff5a5a", sleeping = false, blush = false }) {
  // 画面上の範囲
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  parts.forEach((e) => {
    const [sx, sy] = project(e.c);
    const rr = Math.max(...e.r);
    minX = Math.min(minX, sx - rr); maxX = Math.max(maxX, sx + rr);
    minY = Math.min(minY, sy - rr); maxY = Math.max(maxY, sy + rr);
  });
  const pad = 2;
  const W = Math.ceil(maxX - minX) + pad * 2, H = Math.ceil(maxY - minY) + pad * 2;
  const x0 = minX - pad, y1 = maxY + pad; // 画面の左端・上端
  const grid = Array.from({ length: H }, () => new Array(W).fill(null));
  const depth = Array.from({ length: H }, () => new Array(W).fill(-1e9));
  const pid = Array.from({ length: H }, () => new Array(W).fill(-1));

  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const sx = x0 + px + 0.5, sy = y1 - py - 0.5;
      const o = [RIGHT[0] * sx + UP[0] * sy + CAM[0] * 200, RIGHT[1] * sx + UP[1] * sy + CAM[1] * 200, RIGHT[2] * sx + UP[2] * sy + CAM[2] * 200];
      let best = null, bi = -1;
      for (let i = 0; i < parts.length; i++) {
        const h = hitEllipsoid(parts[i], o);
        if (h && (!best || h.t < best.t)) { best = h; bi = i; }
      }
      if (!best) continue;
      const part = parts[bi];
      const m = pal[part.mat] || pal.body;
      let base = hex(m);
      // 体の模様(ぶち・しま)。体の部品にだけ
      if (part.mat === "body" && pattern === 1 && h3(Math.floor(best.p[0] / 2.2), Math.floor(best.p[1] / 2.2), Math.floor(best.p[2] / 2.2)) > 0.8) base = mixc(base, [30, 30, 50], 0.28);
      if (part.mat === "body" && pattern === 2 && Math.floor((best.p[2] + 40) / 2.4) % 2 === 0 && best.n[1] > -0.2) base = mixc(base, [30, 30, 50], 0.18);
      const lam = Math.max(0, dot(best.n, LIGHT));
      const shiny = part.mat === "metal" || part.mat === "gold" || part.mat === "glass" || part.mat === "gem";
      let c = tone(base, lam, shiny);
      if (part.mat === "glowpart") c = hex(m); // 自ら光る部品は陰影なし
      grid[py][px] = toHex(c);
      depth[py][px] = -best.t;
      pid[py][px] = bi;
    }
  }

  // 輪郭: シルエットの外周+手前の部品との段差
  const src = grid.map((r) => [...r]);
  const out = Array.from({ length: H + 2 }, () => new Array(W + 2).fill(null));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) out[y + 1][x + 1] = src[y][x];
  for (let y = 0; y < H + 2; y++) for (let x = 0; x < W + 2; x++) {
    const sy = y - 1, sx = x - 1;
    const filled = sy >= 0 && sx >= 0 && sy < H && sx < W && src[sy][sx];
    if (!filled) {
      let nb = false;
      for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const yy = sy + dy, xx = sx + dx;
        if (yy >= 0 && xx >= 0 && yy < H && xx < W && src[yy][xx]) nb = true;
      }
      if (nb) out[y][x] = OUTLINE;
      continue;
    }
    // 部品の境目(奥の部品のほうに線を引く)
    for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const yy = sy + dy, xx = sx + dx;
      if (yy < 0 || xx < 0 || yy >= H || xx >= W || !src[yy][xx]) continue;
      if (pid[yy][xx] !== pid[sy][sx] && depth[yy][xx] > depth[sy][sx] + 1.6) { out[y][x] = toHex(mixc(hex(src[sy][sx]), [20, 22, 40], 0.55)); break; }
    }
  }

  // 目と口の判子。隠れている(より手前の部品に覆われた)顔は押さない
  const put = (y, x, col) => { if (y >= 0 && x >= 0 && y < H + 2 && x < W + 2 && out[y][x]) out[y][x] = col; };
  const COLS = { k: OUTLINE, w: "#ffffff", p: "#ff7b9c", g: glow, y: "#ffd166", r: "#ff9fb0" };
  faces.forEach((f) => {
    const [sx, sy, dz] = project(f.p);
    const px = Math.round(sx - x0) + 1 - 0.0, py = Math.round(y1 - sy) + 1;
    const gx = px - 1, gy = py - 1;
    if (gy < 0 || gx < 0 || gy >= H || gx >= W || depth[gy][gx] > dz + 1.2) return; // 見えない
    let style = f.style;
    if (f.kind === "eye" && sleeping && style !== "glow") style = "closed";
    const stamp = (STAMPS[f.kind] || {})[style];
    if (!stamp) return;
    const sh = stamp.length, sw = Math.max(...stamp.map((r) => r.length));
    stamp.forEach((row, yy) => [...row].forEach((ch, xx) => {
      if (ch === ".") return;
      const cx = f.mirror ? sw - 1 - xx : xx;
      put(py - Math.floor(sh / 2) + yy, px - Math.floor(sw / 2) + cx, COLS[ch]);
    }));
  });
  if (blush && !sleeping) {
    faces.filter((f) => f.kind === "eye").forEach((f) => {
      const [sx, sy] = project(f.p);
      const px = Math.round(sx - x0) + 1, py = Math.round(y1 - sy) + 1;
      put(py + 2, px + (f.mirror ? 1 : -1), COLS.r);
    });
  }
  return out;
}

/* 頭の左右に目を2つ(右目は判子を左右反転)。dx=目の間隔, dz=高さ */
export const eyes = (h, style, dx = 0.42, dz = 0.12) => [
  { kind: "eye", style, p: onHead(h, -dx, dz), mirror: false },
  { kind: "eye", style, p: onHead(h, dx, dz), mirror: true },
];
export const mouth = (h, style, dz = -0.32, dx = 0) => ({ kind: "mouth", style, p: onHead(h, dx, dz) });
