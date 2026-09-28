/* 研究所のドット絵を「小さな3Dシーン」から描く(2026-09 ドラクエ7風の作り直し)。

   なぜ3Dから描くか:
     以前はピクセルを手で並べていたため、ステージが上がって形が複雑になると
     平屋根の角が飛び出す・金の帯が浮くなどの「型崩れ」が起きていた。
     いまは建物を 箱・切妻屋根・寄棟屋根・八角の塔・円すい屋根 などの立体(凸多面体)で組み、
     1ピクセルずつ視線を飛ばして(レイキャスト)描くので、壁と屋根は必ずぴったり合う。
     おまけに 面ごとの陰影・軒下や塔の落とす影・地面の影・輪郭線 が自動で付く。

   投影: 牧場と同じ 2:1 アイソメ。 画面x = x - y、 画面y = (x + y)/2 - z (1ワールド単位 ≒ 1px)
   見えるのは +x面(画面の右下向き=明るい)・+y面(左下向き=暗い)・上面。
   ⚠ 質感(板・レンガ・瓦)の間隔は「ワールド単位の絶対値」で決める。建物を大きくしても
     模様は細かいまま=大きい建物ほど描き込みが増える(ドラクエ7の町の家のような密度)
   ⚠ 描画はすべて決定論的(証券コードのハッシュだけで決まる)。見るたびに傷みの位置が変わらない */

import { hashStr, mulberry32 } from "../lib/util.js";

/* ---------- 小道具 ---------- */
const hex = (h) => { const n = parseInt(String(h).slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
const mul = (a, f) => [a[0] * f, a[1] * f, a[2] * f];
const h2 = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const LIGHT = norm([0.62, -0.32, 0.74]); // 右上奥から差す光(従来の「右面が明るい」に合わせた)
const VIEW = [1, 1, 1];                    // 視線(カメラは +x+y+z の彼方)

/* ---------- 立体(凸多面体 = 平面の集まり。n·p <= d が内側) ---------- */
const plane = (n, d) => ({ n, d });

const box = (x0, y0, z0, x1, y1, z1, mat, extra = {}) => ({
  planes: [plane([1, 0, 0], x1), plane([-1, 0, 0], -x0), plane([0, 1, 0], y1), plane([0, -1, 0], -y0), plane([0, 0, 1], z1), plane([0, 0, -1], -z0)],
  aabb: [x0, y0, z0, x1, y1, z1], mat, ...extra,
});

/* 切妻屋根。棟は axis 方向("x"|"y")。gable=妻側の三角(壁の素材) */
const gable = (x0, y0, x1, y1, z0, h, mat, axis = "x", extra = {}) => {
  const P = [];
  if (axis === "x") {
    const yc = (y0 + y1) / 2, k = h / ((y1 - y0) / 2);
    P.push(plane([1, 0, 0], x1), plane([-1, 0, 0], -x0), plane([0, 0, -1], -z0));
    P.push(plane([0, k, 1], z0 + k * y1), plane([0, -k, 1], z0 - k * y0));
    return { planes: P, aabb: [x0, y0, z0, x1, y1, z0 + h], mat, roof: { axis, ridge: yc, k }, ...extra };
  }
  const k = h / ((x1 - x0) / 2);
  P.push(plane([0, 1, 0], y1), plane([0, -1, 0], -y0), plane([0, 0, -1], -z0));
  P.push(plane([k, 0, 1], z0 + k * x1), plane([-k, 0, 1], z0 - k * x0));
  return { planes: P, aabb: [x0, y0, z0, x1, y1, z0 + h], mat, roof: { axis, k }, ...extra };
};

/* 寄棟屋根(四方に流れる)。勾配kが同じなので長い辺に棟ができる */
const hip = (x0, y0, x1, y1, z0, k, mat, extra = {}) => {
  const h = k * Math.min(x1 - x0, y1 - y0) / 2;
  return {
    planes: [plane([k, 0, 1], z0 + k * x1), plane([-k, 0, 1], z0 - k * x0), plane([0, k, 1], z0 + k * y1), plane([0, -k, 1], z0 - k * y0), plane([0, 0, -1], -z0)],
    aabb: [x0, y0, z0, x1, y1, z0 + h], mat, roof: { hip: true, k }, ...extra,
  };
};

/* 八角柱(塔)と八角すい(とんがり屋根) */
const octPlanes = (cx, cy, r) => Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
  const c = Math.cos(a), s = Math.sin(a);
  return plane([c, s, 0], r + c * cx + s * cy);
});
const octPrism = (cx, cy, r, z0, z1, mat, extra = {}) => ({
  planes: [...octPlanes(cx, cy, r), plane([0, 0, 1], z1), plane([0, 0, -1], -z0)],
  aabb: [cx - r, cy - r, z0, cx + r, cy + r, z1], mat, round: { cx, cy }, ...extra,
});
const octCone = (cx, cy, r, z0, h, mat, extra = {}) => {
  const k = h / r;
  const P = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const c = Math.cos(a), s = Math.sin(a);
    return plane([k * c, k * s, 1], z0 + k * (r + c * cx + s * cy));
  });
  P.push(plane([0, 0, -1], -z0));
  return { planes: P, aabb: [cx - r, cy - r, z0, cx + r, cy + r, z0 + h], mat, roof: { cone: true }, round: { cx, cy }, ...extra };
};

/* 視線と凸多面体の交差。戻り値 {t, n}(tが大きいほど手前) */
const hitConvex = (prim, p0, v, tMinLimit = -1e9) => {
  let tmin = -1e9, tmax = 1e9, nOut = null;
  for (const pl of prim.planes) {
    const den = dot(pl.n, v), num = pl.d - dot(pl.n, p0);
    if (Math.abs(den) < 1e-9) { if (num < 0) return null; continue; }
    const t = num / den;
    if (den > 0) { if (t < tmax) { tmax = t; nOut = pl.n; } }
    else if (t > tmin) tmin = t;
    if (tmin > tmax) return null;
  }
  if (tmax < tMinLimit || tmin > tmax) return null;
  return { t: tmax, n: nOut, tmin };
};

/* ---------- 質感 ---------- */
const WOOD = hex("#8a6038"), WOOD_D = hex("#5c3c22"), PLASTER = hex("#efe2c4"), PLANK = hex("#caa672");
const STONE = hex("#b9b1a2"), STONE_D = hex("#8d8577"), GOLD = hex("#f2c94c"), GLASS_DAY = hex("#8fc1dd"), GLASS_NIGHT = hex("#ffd98a");
const IRON = hex("#6b7280"), SNOW = hex("#f4f8fb");

/* 面の2次元座標(u=横, v=高さ)。窓・扉の位置決めと模様に使う */
const faceUV = (p, n, prim) => {
  if (prim.round) { // 塔は角度で横方向をとる
    const a = Math.atan2(p[1] - prim.round.cy, p[0] - prim.round.cx);
    return { u: a * 6, v: p[2], face: "r" };
  }
  if (Math.abs(n[0]) > 0.9) return { u: p[1], v: p[2], face: n[0] > 0 ? "x" : "-x" };
  if (Math.abs(n[1]) > 0.9) return { u: p[0], v: p[2], face: n[1] > 0 ? "y" : "-y" };
  return { u: p[0] + p[1], v: p[2], face: "top" };
};

/* 窓・扉などの「面に貼る部品」。decals: [{face, u0,u1, v0,v1, kind, arch}] */
const decalAt = (prim, face, u, v) => {
  if (!prim.decals) return null;
  for (const d of prim.decals) {
    if (d.face !== face) continue;
    const pad = d.kind === "window" ? 0.9 : 0; // 窓台・よろい戸のぶん少し広く判定
    if (u < d.u0 - (d.shutter ? d.sw : 0) - pad || u > d.u1 + (d.shutter ? d.sw : 0) + pad || v < d.v0 - 1 || v > d.v1 + 0.2) continue;
    return d;
  }
  return null;
};

function shadeDecal(d, u, v, env) {
  const w = d.u1 - d.u0, uc = (d.u0 + d.u1) / 2;
  const archR = w / 2;
  const inArch = (uu, vv, grow = 0) => {
    if (!d.arch || vv < d.v1 - archR) return uu >= d.u0 - grow && uu <= d.u1 + grow && vv <= d.v1 + grow;
    return (uu - uc) ** 2 + (vv - (d.v1 - archR)) ** 2 <= (archR + grow) ** 2;
  };
  if (d.kind === "window") {
    // 窓台
    if (v >= d.v0 - 1 && v < d.v0 - 0.1 && u >= d.u0 - 0.9 && u <= d.u1 + 0.9) return { c: hex("#ded6c6"), lit: false };
    // よろい戸(タイプ色の板)
    if (d.shutter && v >= d.v0 && v <= d.v1 && ((u >= d.u0 - d.sw && u < d.u0 - 0.1) || (u > d.u1 + 0.1 && u <= d.u1 + d.sw))) {
      const slat = Math.floor((v - d.v0) / 1.1) % 2 === 0;
      return { c: mul(env.accent, slat ? 0.78 : 0.62), lit: false };
    }
    if (v < d.v0 || !inArch(u, v)) return null;
    // 枠
    if (!inArch(u, v, -0.9) || v < d.v0 + 0.9) return { c: WOOD_D, lit: false };
    if (env.boarded && (Math.abs((u - d.u0) - (v - d.v0) * (w / (d.v1 - d.v0))) < 0.8 || Math.abs((d.u1 - u) - (v - d.v0) * (w / (d.v1 - d.v0))) < 0.8)) {
      return { c: hex("#7a5534"), lit: false }; // 打ちつけ板(×)
    }
    // 十字の桟
    if (Math.abs(u - uc) < 0.45 || Math.abs(v - (d.v0 + (d.v1 - d.v0) * 0.5)) < 0.45) return { c: mul(WOOD_D, 1.15), lit: false };
    if (env.lit && !env.boarded) {
      const g = 0.85 + 0.15 * ((v - d.v0) / (d.v1 - d.v0));
      return { c: mul(GLASS_NIGHT, g), lit: true, glow: true };
    }
    const hl = ((u - d.u0) + (v - d.v0)) % 5 < 1.1; // 斜めの映り込み
    return { c: env.boarded ? hex("#3a3228") : hl ? mix(GLASS_DAY, [255, 255, 255], 0.5) : mul(GLASS_DAY, 0.8 + 0.2 * ((v - d.v0) / (d.v1 - d.v0))), lit: false };
  }
  if (d.kind === "door") {
    if (v < d.v0 || !inArch(u, v)) return null;
    if (!inArch(u, v, -0.8)) return { c: mul(STONE, 0.85), lit: false }; // 石の縁取り
    if (Math.abs(u - (d.u1 - 1.3)) < 0.5 && Math.abs(v - (d.v0 + (d.v1 - d.v0) * 0.45)) < 0.5) return { c: GOLD, lit: false }; // 取っ手
    const plank = Math.floor((u - d.u0) / 1.25) % 2 === 0;
    return { c: mul(hex("#6e4526"), plank ? 1 : 0.86), lit: false };
  }
  if (d.kind === "sign") { // 看板(研究所の札)
    if (u < d.u0 || u > d.u1 || v < d.v0 || v > d.v1) return null;
    const edge = u < d.u0 + 0.6 || u > d.u1 - 0.6 || v < d.v0 + 0.6 || v > d.v1 - 0.6;
    if (edge) return { c: WOOD_D, lit: false };
    const txt = Math.floor(v - d.v0) % 2 === 1 && u > d.u0 + 1.5 && u < d.u1 - 1.5 && h2(Math.floor(u), d.v0) > 0.35;
    return { c: txt ? hex("#3b2a18") : hex("#e7cf9c"), lit: false };
  }
  return null;
}

/* 素材ごとの基本色(面の模様込み) */
function baseColor(prim, p, n, env) {
  const { u, v, face } = faceUV(p, n, prim);
  const m = prim.mat;
  // 屋根の妻側(三角の壁)は壁の素材で塗る
  if (prim.roof && prim.roof.axis && ((prim.roof.axis === "x" && Math.abs(n[0]) > 0.9) || (prim.roof.axis === "y" && Math.abs(n[1]) > 0.9))) {
    const gm = prim.gableMat || "plaster";
    const c = baseColor({ ...prim, roof: null, mat: gm, decals: null }, p, n, env);
    // 妻の小窓(丸い換気口)
    if (prim.vent) {
      const cu = prim.roof.axis === "x" ? (prim.aabb[1] + prim.aabb[4]) / 2 : (prim.aabb[0] + prim.aabb[3]) / 2;
      const cv = prim.aabb[2] + (prim.aabb[5] - prim.aabb[2]) * 0.38;
      const r = Math.hypot(u - cu, v - cv);
      if (r < 1.6) return env.lit ? GLASS_NIGHT : hex("#3a2c1c");
      if (r < 2.4) return WOOD_D;
    }
    return c;
  }
  const dec = decalAt(prim, face, u, v);
  if (dec) { const r = shadeDecal(dec, u, v, env); if (r) { env._lit = r.glow; return r.c; } }

  switch (m) {
    case "plank": { // 横板張り
      const row = Math.floor(v / 2.1);
      const seam = v - row * 2.1 < 0.55;
      const tint = 0.9 + 0.14 * h2(row, Math.floor((u + row * 3.7) / 9));
      return mul(env.wood, seam ? 0.72 : tint);
    }
    case "plaster": { // しっくい+木の骨組み(ハーフティンバー)
      const a = prim.aabb;
      const lo = u - (face === "x" || face === "-x" ? a[1] : a[0]), hi = (face === "x" || face === "-x" ? a[4] : a[3]) - u;
      const beamV = v - a[2] < 1.1 || a[5] - v < 1.1;
      const post = lo < 1.2 || hi < 1.2 || (prim.posts && Math.abs(((lo + 0.0) % prim.posts) - prim.posts / 2) < 0.6);
      if (beamV || post) return mul(WOOD_D, 1.05);
      const speck = h2(Math.floor(u * 1.7), Math.floor(v * 1.7)) > 0.93;
      return mul(env.plaster, speck ? 0.93 : 1);
    }
    case "stone": { // 石積み(段ごとにずらす)
      const rowH = 2.4, row = Math.floor(v / rowH);
      const bl = 4.6, off = (row % 2) * (bl / 2);
      const col = Math.floor((u + off) / bl);
      const mortar = v - row * rowH < 0.5 || (u + off) - col * bl < 0.5;
      if (mortar) return mul(env.stone, 0.7);
      return mul(env.stone, 0.88 + 0.2 * h2(row, col));
    }
    case "roof": return roofColor(prim, p, n, u, v, env);
    case "cloth": { // テント布の縞
      const s = Math.floor((p[0] + 40) / 3) % 2 === 0;
      if (prim.flap !== undefined && n[1] > 0.3) { // 入口(暗い三角)
        const w = (1 - (p[2] - prim.aabb[2]) / (prim.aabb[5] - prim.aabb[2])) * 4.2;
        if (Math.abs(p[0] - prim.flap) < w && p[2] < prim.aabb[2] + 11) return hex("#3a2a1a");
      }
      return s ? env.roof : hex("#f3ead6");
    }
    case "wood": return mul(WOOD, 0.9 + 0.12 * h2(Math.floor(v), Math.floor(u)));
    case "darkwood": return WOOD_D;
    case "gold": return mul(GOLD, 0.92 + 0.12 * h2(Math.floor(u * 2), Math.floor(v * 2)));
    case "iron": return IRON;
    case "white": return hex("#e9eef3");
    case "slab": { // 平屋根の石板
      const g = (Math.floor(p[0] / 4) + Math.floor(p[1] / 4)) % 2 === 0;
      return mul(env.stone, g ? 0.95 : 0.86);
    }
    case "flag": return env.accent;
    case "flowers": {
      if (n[2] > 0.5) { const r = h2(Math.floor(p[0] * 1.3), Math.floor(p[1] * 1.3)); return r > 0.6 ? hex("#ff6b8a") : r > 0.35 ? hex("#ffd166") : hex("#4c9a4a"); }
      return mul(WOOD, 0.8);
    }
    case "lamp": return env.lit ? GLASS_NIGHT : hex("#e8d9a8");
    default: return hex("#ff00ff");
  }
}

/* 瓦屋根: 列ごとに段差の影、瓦の継ぎ目を互い違いに。棟には冠瓦 */
function roofColor(prim, p, n, u, v, env) {
  let along, slope;
  if (prim.roof.cone) {
    const a = Math.atan2(p[1] - prim.round.cy, p[0] - prim.round.cx);
    along = a * 5; slope = p[2];
  } else if (prim.roof.hip) {
    along = Math.abs(n[0]) > Math.abs(n[1]) ? p[1] : p[0]; slope = p[2];
  } else {
    along = prim.roof.axis === "x" ? p[0] : p[1]; slope = p[2];
  }
  const rowH = 1.9;
  const row = Math.floor(slope / rowH);
  const fr = slope - row * rowH;
  const off = (row % 2) * 1.6;
  const seam = ((along + off) % 3.2 + 3.2) % 3.2 < 0.45;
  let c = env.roof;
  let f = fr < 0.55 ? 0.66 : 0.92 + 0.14 * h2(row, Math.floor((along + off) / 3.2));
  if (seam) f *= 0.8;
  c = mul(c, f);
  // 棟(いちばん上)の冠瓦
  if (!prim.roof.cone && prim.aabb[5] - p[2] < 1.1) c = mul(env.roof, 0.62);
  // いたみ: 穴と当て木(屋根の面の中だけ)
  if (env.damaged && prim.holes) {
    for (const hl of prim.holes) {
      const d = Math.hypot(along - hl.a, (slope - hl.s) * 1.3);
      if (d < hl.r) return hex("#2a2016");
      if (d < hl.r + 0.7) return hex("#4a3a26");
    }
    for (const pb of prim.patches) {
      if (Math.abs(along - pb.a) < pb.w && Math.abs(slope - pb.s) < 0.8) return mul(hex("#8a6238"), Math.abs(along - pb.a) % 2.2 < 0.4 ? 0.7 : 1);
    }
  }
  // 冬: 上向きの面に雪
  if (env.snow && n[2] > 0.45) {
    const drift = h2(Math.floor(along / 2), row) * 1.2;
    if (slope > prim.aabb[2] + 1.5 + drift) c = mix(c, SNOW, fr < 0.55 ? 0.7 : 0.84); // 瓦の段がうっすら透ける
  }
  return c;
}

/* ---------- 建物の設計図(ステージごと) ----------
   S = 大きさ(含み損益の事実で0.75〜青天井)。形の寸法はS倍、模様の細かさは据え置き */
function design(stage, S, rng) {
  const P = [];
  const s = (v) => v * S;
  const W = (face, u0, u1, v0, v1, extra = {}) => ({ face, u0, u1, v0, v1, kind: "window", ...extra });
  if (stage === 1) {
    // テント+看板+たき火の石
    P.push(gable(s(-9), s(-8), s(9), s(8), 0, s(15), "cloth", "x", { flap: 0, gableMat: "cloth" }));
    P.push(box(s(-9.6), s(-8.6), 0, s(9.6), s(-8), s(0.8), "wood"));
    P.push(box(s(10), s(5.6), 0, s(10.9), s(6.5), s(9), "wood"));
    P.push(box(s(10), s(1.2), s(5), s(10.8), s(10.5), s(10.2), "wood", { decals: [{ face: "x", u0: s(1.2), u1: s(10.5), v0: s(5), v1: s(10.2), kind: "sign" }] }));
    for (let k = 0; k < 5; k++) { const a = (k / 5) * 6.28; P.push(box(s(13 + Math.cos(a) * 2) - 0.6, s(-5 + Math.sin(a) * 2) - 0.6, 0, s(13 + Math.cos(a) * 2) + 0.6, s(-5 + Math.sin(a) * 2) + 0.6, 1.1, "stone")); }
    return { prims: P, top: s(15) };
  }
  if (stage === 2) {
    // 小屋: 石の土台+板張り+切妻の瓦屋根+えんとつ+花台
    P.push(box(s(-12), s(-10), 0, s(12), s(10), s(2.6), "stone"));
    P.push(box(s(-11), s(-9), s(2.6), s(11), s(9), s(15), "plank", {
      decals: [
        { face: "x", u0: s(-2.4), u1: s(2.4), v0: s(2.6), v1: s(11.5), kind: "door", arch: false },
        W("y", s(-7.5), s(-2.5), s(6.5), s(11.5), { shutter: true, sw: s(2) }),
        W("y", s(3), s(8), s(6.5), s(11.5), { shutter: true, sw: s(2) }),
      ],
    }));
    for (const [x, y] of [[-11, -9], [11, -9], [-11, 9], [11, 9]]) P.push(box(s(x) - s(0.9), s(y) - s(0.9), s(2.6), s(x) + s(0.9), s(y) + s(0.9), s(15), "wood"));
    P.push(gable(s(-13), s(-11.5), s(13), s(11.5), s(15), s(10), "roof", "x", { gableMat: "plank", vent: true }));
    P.push(box(s(4.5), s(-6), s(15), s(7.5), s(-3), s(28), "stone"));
    P.push(box(s(4), s(-6.5), s(27), s(8), s(-2.5), s(29), "stone"));
    P.push(box(s(-7.8), s(9), s(5.2), s(-2.2), s(10.4), s(6.4), "flowers"));
    P.push(box(s(2.7), s(9), s(5.2), s(8.3), s(10.4), s(6.4), "flowers"));
    P.push(box(s(11), s(-3.2), 0, s(13.4), s(3.2), s(1.3), "stone")); // 踏み石
    P.push(box(s(11.2), s(3.6), s(8.5), s(12.2), s(4.6), s(10.5), "lamp"));
    return { prims: P, top: s(29) };
  }
  if (stage === 3) {
    // ラボ: 2階建てハーフティンバー+石の別館(観測ドーム)
    P.push(box(s(-14), s(-11), 0, s(14), s(11), s(3), "stone"));
    P.push(box(s(-13), s(-10), s(3), s(13), s(10), s(13.5), "plaster", {
      posts: s(8.5),
      decals: [
        W("y", s(-9.5), s(-5), s(6), s(11), { shutter: true, sw: s(1.8) }),
        W("y", s(4), s(8.5), s(6), s(11), { shutter: true, sw: s(1.8) }),
        { face: "x", u0: s(2.6), u1: s(7.4), v0: s(3), v1: s(12), kind: "door", arch: true },
      ],
    }));
    P.push(box(s(-13.8), s(-10.8), s(13.5), s(13.8), s(10.8), s(14.6), "darkwood"));
    P.push(box(s(-13.6), s(-10.6), s(14.6), s(13.6), s(10.6), s(24), "plaster", {
      posts: s(6.5),
      decals: [
        W("y", s(-10), s(-6), s(17), s(21.5)), W("y", s(-2), s(2), s(17), s(21.5)), W("y", s(6), s(10), s(17), s(21.5)),
        W("x", s(-6.5), s(-2.5), s(17), s(21.5)), W("x", s(3), s(7), s(17), s(21.5)),
      ],
    }));
    P.push(gable(s(-15.5), s(-12.6), s(15.5), s(12.6), s(24), s(12), "roof", "x", { gableMat: "plaster", vent: true }));
    P.push(box(s(-9), s(-5), s(24), s(-6), s(-2), s(38), "stone"));
    P.push(box(s(-9.5), s(-5.5), s(37), s(-5.5), s(-1.5), s(39), "stone"));
    // 別館(右奥)+観測ドーム
    P.push(box(s(13), s(-10), 0, s(24), s(-1), s(11), "stone", { decals: [W("x", s(-8), s(-3.5), s(4.5), s(8.5)), W("y", s(15.5), s(21.5), s(4.5), s(8.5))] }));
    P.push(box(s(12.6), s(-10.4), s(11), s(24.4), s(-0.6), s(12), "slab"));
    P.push(octPrism(s(18.5), s(-5.5), s(3.6), s(12), s(15), "white"));
    P.push(octCone(s(18.5), s(-5.5), s(3.6), s(15), s(3.4), "white"));
    P.push(box(s(18.3), s(-5.7), s(18.2), s(18.8), s(-5.2), s(22), "iron"));
    return { prims: P, top: s(39) };
  }
  // ST4/ST5: 石造りの御殿(寄棟屋根+金の帯+塔)。ST5は塔がふえ、中央に金のドーム
  const big = stage >= 5;
  const X = big ? 18 : 15, Y = big ? 14 : 12, H = big ? 19 : 17;
  P.push(box(s(-X - 1), s(-Y - 1), 0, s(X + 1), s(Y + 1), s(2.6), "stone"));
  const winY = [], winX = [];
  const nY = big ? 4 : 3;
  for (let k = 0; k < nY; k++) { const c = -X + (2 * X) * ((k + 0.5) / nY); winY.push(W("y", s(c - 2), s(c + 2), s(7), s(14), { arch: true })); }
  winX.push(W("x", s(-Y + 2), s(-Y + 6), s(7), s(14), { arch: true }));
  winX.push(W("x", s(Y - 6), s(Y - 2), s(7), s(14), { arch: true }));
  P.push(box(s(-X), s(-Y), s(2.6), s(X), s(Y), s(H), "stone", {
    decals: [...winY, ...winX, { face: "x", u0: s(-3), u1: s(3), v0: s(2.6), v1: s(12.5), kind: "door", arch: true }],
  }));
  P.push(box(s(-X - 0.6), s(-Y - 0.6), s(H - 1), s(X + 0.6), s(Y + 0.6), s(H), "gold"));
  P.push(hip(s(-X - 1.8), s(-Y - 1.8), s(X + 1.8), s(Y + 1.8), s(H), 0.72, "roof"));
  // 玄関の階段と門柱(金の玉)
  P.push(box(s(X), s(-4.5), 0, s(X + 2.2), s(4.5), s(1.3), "stone"));
  P.push(box(s(X), s(-3.5), s(1.3), s(X + 1.1), s(3.5), s(2.6), "stone"));
  for (const yy of [-6, 6]) {
    P.push(box(s(X + 0.4), s(yy) - s(1), 0, s(X + 2.4), s(yy) + s(1), s(8), "stone"));
    P.push(octPrism(s(X + 1.4), s(yy), s(1.1), s(8), s(9.6), "gold"));
  }
  // 塔(右奥)。ST5は左手前にも
  const towers = big ? [[X - 1, -Y + 1], [-X + 1, Y - 1]] : [[X - 1, -Y + 1]];
  let top = 0;
  towers.forEach(([tx, ty], i) => {
    const th = (big ? 34 : 31) - i * 3, r = big ? 6 : 5.4;
    P.push(octPrism(s(tx), s(ty), s(r), 0, s(th), "stone", {
      decals: [W("r", -99, 99, s(th - 9), s(th - 4.5))], // 塔の窓はぐるりと(下で角度で間引く)
      towerWin: true,
    }));
    P.push(octPrism(s(tx), s(ty), s(r + 0.7), s(th), s(th + 1.2), "gold"));
    P.push(octCone(s(tx), s(ty), s(r + 1.1), s(th + 1.2), s(big ? 16 : 14), "roof"));
    P.push(box(s(tx) - 0.5, s(ty) - 0.5, s(th + 1.2 + (big ? 16 : 14)), s(tx) + 0.5, s(ty) + 0.5, s(th + 1.2 + (big ? 16 : 14)) + s(7), "iron"));
    P.push(box(s(tx) + 0.5, s(ty) - 0.3, s(th + 1.2 + (big ? 16 : 14)) + s(3.8), s(tx) + s(6), s(ty) + 0.3, s(th + 1.2 + (big ? 16 : 14)) + s(6.8), "flag"));
    top = Math.max(top, s(th + 1.2 + (big ? 16 : 14) + 7));
  });
  if (big) { // 中央の金のドーム
    const rz = s(H) + 0.72 * s(Y + 1.8);
    P.push(octPrism(0, 0, s(4), rz - s(2), rz + s(3), "stone", { decals: [W("r", -99, 99, rz - s(0.5), rz + s(2.4))], towerWin: true }));
    P.push(octCone(0, 0, s(4.8), rz + s(3), s(6), "gold"));
    top = Math.max(top, rz + s(9));
  }
  return { prims: P, top };
}

/* ---------- 描画 ---------- */
export function renderBuilding({ stage, accentHex, phase, season, f = 1, condition = "normal", code = "" }) {
  const S = 1.45 * f; // ⚠ 全体の大きさ。模様の細かさは据え置きなので大きいほど描き込みが増える
  const rng = mulberry32(hashStr(String(code) + ":bld"));
  const { prims, top } = design(stage, S, rng);
  const damaged = condition !== "normal";
  const lit = phase !== "day";
  const dmg = mulberry32(hashStr(String(code) + ":dmg"));

  // 屋根にいたみ(穴・当て木)を仕込む。位置は証券コードで決まる=見るたびに同じ
  if (damaged) {
    prims.filter((p) => p.mat === "roof" || p.mat === "cloth").forEach((p) => {
      const a = p.aabb;
      const spanA = (p.roof && p.roof.axis === "y") ? [a[1], a[4]] : [a[0], a[3]];
      const zs = [a[2] + (a[5] - a[2]) * 0.25, a[2] + (a[5] - a[2]) * 0.65];
      p.holes = Array.from({ length: stage >= 3 ? 2 : 1 }, () => ({
        a: spanA[0] + (spanA[1] - spanA[0]) * (0.2 + dmg() * 0.6), s: zs[0] + (zs[1] - zs[0]) * dmg(), r: 1.4 + dmg() * 1.2,
      }));
      p.patches = Array.from({ length: 2 }, () => ({ a: spanA[0] + (spanA[1] - spanA[0]) * (0.15 + dmg() * 0.7), s: zs[0] + (zs[1] - zs[0]) * dmg(), w: 2.2 + dmg() * 1.6 }));
    });
  }

  const faded = (h, f2) => (damaged ? mix(hex(h), hex("#6f6657"), f2) : hex(h));
  const env = {
    roof: faded(accentHex, 0.55), accent: faded(accentHex, 0.35), wood: faded("#caa672", 0.45), plaster: faded("#efe2c4", 0.5),
    stone: faded("#b9b1a2", 0.35), lit, boarded: damaged, damaged, snow: season && season.key === "winter",
  };

  // 画面上の範囲(各立体のAABBの角を投影)
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  prims.forEach((p) => {
    const [x0, y0, z0, x1, y1, z1] = p.aabb;
    for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) {
      const sx = x - y, sy = (x + y) / 2 - z;
      minX = Math.min(minX, sx); maxX = Math.max(maxX, sx); minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
    }
    p.sb = null;
  });
  // 影が地面に落ちる分の余白
  const pad = 6, shadowPad = Math.round(top * 0.5);
  const Wd = Math.ceil(maxX - minX) + pad * 2 + shadowPad, Hd = Math.ceil(maxY - minY) + pad * 2 + 4;
  const ox = -minX + pad + shadowPad, oy = -minY + pad; // 画面(0,0)=ワールド原点の位置
  prims.forEach((p) => {
    const [x0, y0, z0, x1, y1, z1] = p.aabb;
    let a = 1e9, b = -1e9, c = 1e9, d = -1e9;
    for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) {
      const sx = x - y + ox, sy = (x + y) / 2 - z + oy;
      a = Math.min(a, sx); b = Math.max(b, sx); c = Math.min(c, sy); d = Math.max(d, sy);
    }
    p.sb = [a - 1, b + 1, c - 1, d + 1];
  });

  const N = Wd * Hd;
  const col = new Float32Array(N * 3);
  const id = new Int16Array(N).fill(-1);
  const depth = new Float32Array(N).fill(-1e9);
  const glowMask = new Uint8Array(N);
  const shadowMask = new Float32Array(N);

  const shadowed = (pt, selfIdx) => {
    for (let i = 0; i < prims.length; i++) {
      const h = hitConvex(prims[i], pt, LIGHT, 0.05);
      if (h && h.t > 0.05) return true;
    }
    return false;
  };

  for (let py = 0; py < Hd; py++) {
    for (let px = 0; px < Wd; px++) {
      const sx = px + 0.5 - ox, sy = py + 0.5 - oy;
      const p0 = [sy + sx / 2, sy - sx / 2, 0];
      let best = null, bi = -1;
      for (let i = 0; i < prims.length; i++) {
        const sb = prims[i].sb;
        if (px < sb[0] || px > sb[1] || py < sb[2] || py > sb[3]) continue;
        const h = hitConvex(prims[i], p0, VIEW);
        if (h && (!best || h.t > best.t)) { best = h; bi = i; }
      }
      const k = py * Wd + px;
      if (!best) {
        // 地面(z=0)に落ちる影
        if (shadowed(p0, -1)) shadowMask[k] = 1;
        continue;
      }
      const pt = [p0[0] + best.t, p0[1] + best.t, best.t];
      const n = norm(best.n);
      const prim = prims[bi];
      env._lit = false;
      let c = baseColor(prim, pt, n, env);
      if (prim.towerWin && prim.decals) { // 塔の窓は見える向きに3つだけ
        env._lit = false;
        const a = Math.atan2(pt[1] - prim.round.cy, pt[0] - prim.round.cx);
        const d0 = prim.decals[0];
        const slots = [0.2, 0.95, 1.7];
        const hit = slots.find((sl) => Math.abs(a - sl) < 0.2);
        if (hit !== undefined && pt[2] >= d0.v0 && pt[2] <= d0.v1) {
          const top2 = d0.v1 - 0.8;
          const inner = Math.abs(a - hit) < 0.13 && pt[2] < top2 && pt[2] > d0.v0 + 0.7;
          c = inner ? (lit && !damaged ? GLASS_NIGHT : damaged ? hex("#3a3228") : GLASS_DAY) : WOOD_D;
          if (inner && lit && !damaged) env._lit = true;
        } else c = baseColor({ ...prim, decals: null, towerWin: false }, pt, n, env);
      }
      // 陰影: 環境光+光の向き。影の中は環境光だけ
      const lam = Math.max(0, dot(n, LIGHT));
      const inShadow = lam > 0 && shadowed([pt[0] + n[0] * 0.08, pt[1] + n[1] * 0.08, pt[2] + n[2] * 0.08], bi);
      let sh = 0.52 + (inShadow ? 0.06 : 0.62) * lam;
      if (pt[2] < 2.2 && Math.abs(n[2]) < 0.5) sh *= 0.8 + 0.2 * (pt[2] / 2.2); // 足もとの陰り(AO)
      if (env._lit) { sh = 1; glowMask[k] = 1; }
      col[k * 3] = c[0] * sh; col[k * 3 + 1] = c[1] * sh; col[k * 3 + 2] = c[2] * sh;
      id[k] = bi; depth[k] = best.t;
    }
  }

  // 夜: 窓のあかりが周りの壁をほんのり照らす
  if (lit && !damaged) {
    const add = new Float32Array(N);
    for (let py = 0; py < Hd; py++) for (let px = 0; px < Wd; px++) {
      if (!glowMask[py * Wd + px]) continue;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        const x = px + dx, y = py + dy;
        if (x < 0 || y < 0 || x >= Wd || y >= Hd) continue;
        const d = Math.hypot(dx, dy);
        if (d <= 3.2) add[y * Wd + x] = Math.max(add[y * Wd + x], 1 - d / 3.4);
      }
    }
    for (let k = 0; k < N; k++) if (id[k] >= 0 && !glowMask[k] && add[k] > 0) {
      col[k * 3] += 70 * add[k]; col[k * 3 + 1] += 48 * add[k]; col[k * 3 + 2] += 12 * add[k];
    }
  }

  // 書き出し: 少しだけ色数を落としてドット絵らしく+輪郭線
  const cv = document.createElement("canvas");
  cv.width = Wd; cv.height = Hd;
  const g = cv.getContext("2d");
  const img = g.createImageData(Wd, Hd);
  const q = (v) => Math.max(0, Math.min(255, Math.round(v / 6) * 6));
  const isEdge = (k, x, y) => {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= Wd || yy >= Hd) return 2;
      const kk = yy * Wd + xx;
      if (id[kk] < 0) return 2;
      if (id[kk] !== id[k] && depth[kk] > depth[k] + 2.5) return 1; // 手前の立体との境目
    }
    return 0;
  };
  for (let y = 0; y < Hd; y++) for (let x = 0; x < Wd; x++) {
    const k = y * Wd + x, o = k * 4;
    if (id[k] < 0) {
      if (shadowMask[k]) { img.data[o] = 12; img.data[o + 1] = 18; img.data[o + 2] = 30; img.data[o + 3] = 78; }
      continue;
    }
    let r = col[k * 3], gg = col[k * 3 + 1], b = col[k * 3 + 2];
    const e = isEdge(k, x, y);
    if (e === 2) { r = r * 0.32 + 8; gg = gg * 0.3 + 6; b = b * 0.3 + 12; }
    else if (e === 1) { r *= 0.62; gg *= 0.6; b *= 0.62; }
    img.data[o] = q(r); img.data[o + 1] = q(gg); img.data[o + 2] = q(b); img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);

  // 足もとの雑草(ボロ家)。2Dで足す
  if (damaged) {
    const foot = prims[0].aabb;
    for (let k = 0; k < 12; k++) {
      const wx = foot[0] + (foot[3] - foot[0]) * dmg(), wy = foot[4] + 0.5;
      const sx = Math.round(wx - wy + ox), sy = Math.round((wx + wy) / 2 + oy);
      g.fillStyle = k % 3 ? "#56663a" : "#6f7d44";
      g.fillRect(sx, sy - 3, 1, 3); g.fillRect(sx + 1, sy - 2, 1, 2); g.fillRect(sx - 1, sy - 1, 1, 1);
    }
  }

  // 上端(🗓・炎の位置決め用)
  let topY = 0;
  outer: for (let y = 0; y < Hd; y++) for (let x = 0; x < Wd; x++) if (id[y * Wd + x] >= 0) { topY = y; break outer; }
  // アンカー = 土台の手前の角(従来の建物と同じ置き方)
  const foot = prims[0].aabb;
  const ax = Math.round(foot[3] - foot[4] + ox), ay = Math.round((foot[3] + foot[4]) / 2 + oy);
  // 炎を載せる高さ = 本棟の屋根(最初の屋根/布)のてっぺん。塔の旗の高さではない
  const main = prims.find((p) => p.mat === "roof" || p.mat === "cloth");
  let fireY = topY;
  if (main) { const a = main.aabb; const cxw = (a[0] + a[3]) / 2, cyw = (a[1] + a[4]) / 2; fireY = Math.round((cxw + cyw) / 2 - a[5] + oy); }
  // 半幅(炎・あかりの広がり用)
  const hw = Math.round((maxX - minX) / 2 * 0.7);
  return { cv, anchorX: ax, anchorY: ay, topY, fireY, hw, g };
}
