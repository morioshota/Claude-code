/* 牧場モード: カイロソフト風2Dアイソメぼくじょう
   - 斜め見下ろしのタイル世界をcanvas 2Dで自前描画(WebGL不要・全端末で動く)
   - 銘柄ごとに「研究小屋」が建ち、研究ステージが上がるほど建物が育つ
   - クリーチャーは日課をこなす: 保有=はたけ仕事、ウォッチ=見学さんぽ、鮮度切れ=おひるね
   - 吹き出しでオーナー自身のメモ(仮説・わざ・トリガー・学び)を喋る
   - 保有の含み損益(事実)は「ようす」= 動きの元気さ・✨/💧に映る(推奨表示はしない)
   - 季節(月)・天気(日付ハッシュ)・昼夜(端末時計)の実時間演出。株価は演出に絡めない */

import { useState, useEffect, useRef } from "react";
import { buildPixels } from "../lib/sprites.js";
import { calcLevel, stageOf, moveTierOf, evalAchievements } from "../lib/stock.js";
import { ACHIEVEMENTS, TYPES } from "../data/constants.js";
import { hashStr, mulberry32, today } from "../lib/util.js";
import { pnlOf, moodOf, fmtMoney, fetchHeldQuotes } from "../lib/holdings.js";
import { streaks } from "../lib/activity.js";

/* ---- 実時間の演出パラメータ(旧3D牧場から継承) ---- */

const dayPhase = () => {
  const h = new Date().getHours() + new Date().getMinutes() / 60;
  if (h >= 7 && h < 16.5) return "day";
  if ((h >= 5 && h < 7) || (h >= 16.5 && h < 19)) return "dusk";
  return "night";
};

const PHASE_INFO = {
  day:   { label: "☀️ ひる",    sky: ["#8ecfef", "#c8ecf8"], tint: null,                 stars: 0 },
  dusk:  { label: "🌆 ゆうがた", sky: ["#e08a54", "#f4c98a"], tint: "rgba(90,45,80,.22)",  stars: 0.25 },
  night: { label: "🌙 よる",    sky: ["#0c1130", "#1c2a58"], tint: "rgba(10,16,60,.44)",  stars: 1 },
};

const seasonOf = (m) => {
  if (m >= 3 && m <= 5)  return { key: "spring", label: "🌸はる", g1: "#5aa860", g2: "#56a25c", wild: "#7cbf6e", leaf: "#e58fb4", trunk: "#8a6242", particle: { kind: "petal", color: "#ffc2d8" } };
  if (m >= 6 && m <= 8)  return { key: "summer", label: "🌻なつ", g1: "#4d9e55", g2: "#489850", wild: "#61a851", leaf: "#2e6e3c", trunk: "#7a5638", particle: null };
  if (m >= 9 && m <= 11) return { key: "autumn", label: "🍁あき", g1: "#8a944c", g2: "#859048", wild: "#a89a50", leaf: "#c2622d", trunk: "#7a5638", particle: { kind: "leaf", color: "#d9873a" } };
  return { key: "winter", label: "⛄ふゆ", g1: "#c2cfc9", g2: "#bcc9c3", wild: "#a8bab2", leaf: "#3d6e54", trunk: "#6b4e38", particle: { kind: "snow", color: "#ffffff" } };
};
const isRainyToday = () => hashStr(today()) % 10 < 3; // 3割の日は雨(冬は雪が強まる)

/* ---- アイソメ座標系(アートピクセル単位) ----
   タイル: 幅TW=24px・高さTH=12px のひし形。screen = iso(i, j) */
const TW = 24, TH = 12;
const isoX = (i, j) => (i - j) * (TW / 2);
const isoY = (i, j) => (i + j) * (TH / 2);

/* ひし形タイルを1pxの横帯で塗る(パス塗りのにじみを避けてカクカクに保つ) */
const fillDia = (ctx, cx, topY, hw, colL, colR) => {
  const h = hw; // 高さ=半幅(2:1タイル)
  for (let r = 0; r < h; r++) {
    const k = r < h / 2 ? r : h - 1 - r;
    const w = Math.max(1, Math.round((k + 1) * 2 * (hw / h)));
    ctx.fillStyle = colL;
    ctx.fillRect(cx - w, topY + r, w, 1);
    ctx.fillStyle = colR;
    ctx.fillRect(cx, topY + r, w, 1);
  }
};
const fillTile = (ctx, i, j, ox, oy, colL, colR) => {
  fillDia(ctx, ox + isoX(i, j), oy + isoY(i, j) - TH / 2, TH, colL, colR);
};

const shadeHex = (hex, f) => { // f<1で暗く f>1で明るく
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return `rgb(${c(r)},${c(g)},${c(b)})`;
};

/* ---- 建物(研究小屋)の描画。ステージが上がるほど立派に育つ ---- */

const BUILD_DIMS = [null,
  { hw: 9,  wall: 5,  roof: 5 },   // ST1 ちいさな小屋
  { hw: 11, wall: 8,  roof: 7 },   // ST2 小屋
  { hw: 13, wall: 11, roof: 8 },   // ST3 いえ
  { hw: 15, wall: 16, roof: 10 },  // ST4 ごてん(2階建て+旗)
];

function buildingCanvas(stock, phase, season) {
  const stage = stageOf(calcLevel(stock)).no;
  const d = BUILD_DIMS[stage];
  const t = TYPES[stock.type] || TYPES.metal;
  const W = d.hw * 2 + 10, H = d.wall + d.hw + d.roof + 14;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  const cx = Math.floor(W / 2), baseY = H - 2;

  const wallR = stage === 1 ? "#d8c49a" : "#ead9b5";
  const wallL = shadeHex(stage === 1 ? "#d8c49a" : "#ead9b5", 0.72);
  const roofR = t.color;
  const roofL = shadeHex(t.color, 0.68);

  // 壁: 南角からE/Wへ伸びる2面(1px列で斜めに追従)
  for (let x = 0; x <= d.hw; x++) {
    const yBot = baseY - Math.round(x / 2);
    ctx.fillStyle = wallR;
    ctx.fillRect(cx + x, yBot - d.wall, 1, d.wall);
    ctx.fillStyle = wallL;
    ctx.fillRect(cx - x, yBot - d.wall, 1, d.wall);
  }
  // 南角の稜線
  ctx.fillStyle = shadeHex("#ead9b5", 0.55);
  ctx.fillRect(cx, baseY - d.wall, 1, d.wall);

  // とびら(右面の南寄り)
  ctx.fillStyle = "#6b4a2b";
  for (let x = 2; x <= 5; x++) ctx.fillRect(cx + x, baseY - Math.round(x / 2) - 7, 1, 7);
  // まど(右面)。夜・夕方はあかりが灯る
  const lit = phase !== "day";
  const winCol = lit ? "#ffd166" : "#9cc3de";
  const wins = stage >= 4 ? [[8, 8], [12, 8], [8, 14], [12, 14]] : stage === 3 ? [[8, 7], [11, 7]] : stage === 2 ? [[7, 5]] : [];
  wins.forEach(([fx, fy]) => {
    if (fx > d.hw - 2) return;
    ctx.fillStyle = winCol;
    ctx.fillRect(cx + fx, baseY - Math.round(fx / 2) - fy - 3, 3, 3);
    ctx.fillStyle = lit ? "#fff2c2" : "#c8e2f2";
    ctx.fillRect(cx + fx, baseY - Math.round(fx / 2) - fy - 3, 1, 1);
    // 左面にも対称のまど
    ctx.fillStyle = shadeHex(lit ? "#ffd166" : "#9cc3de", 0.8);
    ctx.fillRect(cx - fx - 3, baseY - Math.round(fx / 2) - fy - 3, 3, 3);
  });
  // ST4は金の帯(軒下)
  if (stage >= 4) {
    for (let x = 0; x <= d.hw; x++) {
      const yBot = baseY - Math.round(x / 2);
      ctx.fillStyle = "#ffd166";
      ctx.fillRect(cx + x, yBot - d.wall, 1, 1);
      ctx.fillRect(cx - x, yBot - d.wall, 1, 1);
    }
  }

  // 屋根: 縮むひし形を1pxずつ積んでピラミッドに(輪郭がカクカクに残る)
  const roofTopCorner = baseY - d.wall - d.hw; // 屋根の底ひし形の上角y
  for (let l = 0; l <= d.roof; l++) {
    const hwl = Math.max(2, Math.round(d.hw * (1 - l / (d.roof + 1))));
    const cyTop = roofTopCorner - l + (d.hw - hwl) / 2;
    fillDia(ctx, cx, Math.round(cyTop), hwl, roofL, roofR);
  }
  // 冬は屋根に雪
  if (season.key === "winter") {
    for (let l = Math.round(d.roof * 0.45); l <= d.roof; l++) {
      const hwl = Math.max(2, Math.round(d.hw * (1 - l / (d.roof + 1))));
      const cyTop = roofTopCorner - l + (d.hw - hwl) / 2;
      fillDia(ctx, cx, Math.round(cyTop), hwl, "#dfe9ee", "#f4f9fc");
    }
  }
  // ST4は旗(タイプ色)
  if (stage >= 4) {
    const apexY = Math.round(roofTopCorner - d.roof + d.hw / 2) - 2;
    ctx.fillStyle = "#8a6a3a";
    ctx.fillRect(cx, apexY - 8, 1, 9);
    ctx.fillStyle = t.color;
    ctx.fillRect(cx + 1, apexY - 8, 5, 3);
  }
  // 色違い持ちの家は屋根に✨
  if (stock.shiny) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(cx + 3, roofTopCorner - 2, 1, 1);
    ctx.fillStyle = "#ffd166";
    ctx.fillRect(cx - 4, roofTopCorner + 2, 1, 1);
  }
  return { cv, anchorX: cx, anchorY: baseY }; // anchor=敷地ひし形の南角
}

/* ---- 木(そびえるので建物と同じく奥行きソートで描く) ---- */
function treeCanvas(season, big) {
  const s = big ? 1.4 : 1;
  const W = Math.round(22 * s), H = Math.round(30 * s);
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  const cx = Math.floor(W / 2);
  ctx.fillStyle = season.trunk;
  ctx.fillRect(cx - 1, H - Math.round(9 * s), 3, Math.round(9 * s));
  const leafL = shadeHex(season.leaf, 0.75);
  for (let l = 0; l < Math.round(16 * s); l++) {
    const rel = l / (16 * s);
    const hw = Math.max(1, Math.round((10 * s) * Math.sin(Math.PI * (0.15 + rel * 0.85)) ));
    const y = H - Math.round(9 * s) - l;
    ctx.fillStyle = leafL;
    ctx.fillRect(cx - hw, y, hw, 1);
    ctx.fillStyle = season.leaf;
    ctx.fillRect(cx, y, hw, 1);
  }
  if (season.key === "winter") {
    ctx.fillStyle = "#eef4f8";
    for (let l = Math.round(10 * s); l < Math.round(16 * s); l++) {
      const rel = l / (16 * s);
      const hw = Math.max(1, Math.round((10 * s) * Math.sin(Math.PI * (0.15 + rel * 0.85))));
      ctx.fillRect(cx - hw, H - Math.round(9 * s) - l, hw * 2, 1);
    }
  }
  return { cv, anchorX: cx, anchorY: H - 1 };
}

/* クリーチャーのドット絵(1セル=1px)。牧場ではズームに合わせて整数倍で拡大する */
function creatureArt(stock, sleeping) {
  const { grid, w, h } = buildPixels(stock, sleeping);
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d");
  grid.forEach((row, y) => row.forEach((col, x) => {
    if (col) { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); }
  }));
  return cv;
}

const clip = (t, n = 16) => {
  const s = String(t || "").replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
};

/* 吹き出しのセリフ候補: オーナー自身のメモが素材(復習をかねた遊び) */
function bubblePool(stock, mood, phase) {
  const arr = [];
  if (stock.hypothesis) arr.push(clip(stock.hypothesis));
  (stock.bullets || []).forEach((b) => arr.push("🔥" + clip(b, 14)));
  (stock.triggers || []).forEach((b) => arr.push("🚪" + clip(b, 14)));
  const lastLog = (stock.logs || []).slice(-1)[0];
  if (lastLog && lastLog.text) arr.push("📝" + clip(lastLog.text, 14));
  const greet = phase === "night" ? "こんばんは〜" : phase === "dusk" ? "ゆうやけだ〜" : "こんにちは！";
  arr.push(greet, "♪");
  if (mood) {
    if (mood.key === "peak") arr.push("ぜっこうちょう！");
    if (mood.key === "good") arr.push("げんき！");
    if (mood.key === "low" || mood.key === "tired") arr.push("きょうはのんびり…");
  }
  return arr;
}

/* ================= メインの牧場キャンバス ================= */

function RanchKairo({ stocks, quotes, onSelect }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const stocksRef = useRef(stocks); stocksRef.current = stocks;
  const quotesRef = useRef(quotes); quotesRef.current = quotes;
  const onSelectRef = useRef(onSelect); onSelectRef.current = onSelect;
  const zoomRef = useRef(typeof window !== "undefined" && window.innerWidth >= 900 ? 3 : 2);
  const [, setZoomTick] = useState(0); // ズームボタンの表示更新用
  const reduced = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const actives = stocks.filter((s) => s.status !== "sold");
  // シーンの作り直しが必要な変化だけをキーにする(位置や吹き出しは作り直さない)
  const sceneKey = actives
    .map((s) => `${s.id}:${s.status}:${stageOf(calcLevel(s)).no}:${moveTierOf(s)}:${s.shiny ? "S" : ""}:${s.evoPattern || ""}`)
    .join("|") + `|s:${seasonOf(new Date().getMonth() + 1).key}|r:${isRainyToday() ? 1 : 0}|a:${evalAchievements(stocks).size}`;

  useEffect(() => {
    const wrap = wrapRef.current, canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext("2d");
    let raf = 0;

    const season = seasonOf(new Date().getMonth() + 1);
    const rainy = isRainyToday();
    const unlocked = evalAchievements(stocksRef.current).size;
    const members = stocksRef.current.filter((s) => s.status !== "sold");

    /* ---- レイアウト: 建物スロットは登録順で安定配置 ---- */
    const cols = 3;
    const rows = Math.max(1, Math.ceil(members.length / cols));
    const N = Math.max(20, 6 + rows * 7 + 4); // グリッド一辺(タイル数)
    const ordered = [...members].sort((a, b) => (a.no || 0) - (b.no || 0));
    const slotOf = new Map(); // stockId -> {si, sj}
    ordered.forEach((s, k) => {
      slotOf.set(s.id, { si: 3 + (k % cols) * 7, sj: 3 + Math.floor(k / cols) * 7 });
    });

    // 池(右手前)・木の配置
    const pond = [];
    for (let i = N - 7; i <= N - 3; i++) {
      for (let j = 2; j <= 5; j++) {
        if (Math.hypot(i - (N - 5), j - 3.5) < 2.6) pond.push([i, j]);
      }
    }
    const rngMap = mulberry32(hashStr("kabu-ranch-map"));
    const trees = [];
    for (let k = 0; k < 14; k++) {
      const edge = Math.floor(rngMap() * 4);
      const p = 1 + Math.floor(rngMap() * (N - 2));
      const pos = edge === 0 ? [p, 0] : edge === 1 ? [0, p] : edge === 2 ? [p, N - 1] : [N - 1, p];
      trees.push({ i: pos[0], j: pos[1], big: rngMap() < 0.4 });
    }
    // 内側にもぽつぽつ木を植える(建物のまわりと池は避ける)
    const nearSlot = (i, j) => [...slotOf.values()].some(({ si, sj }) => i >= si - 2 && i <= si + 5 && j >= sj - 2 && j <= sj + 3);
    for (let k = 0; k < 6; k++) {
      for (let t2 = 0; t2 < 20; t2++) {
        const i = 2 + Math.floor(rngMap() * (N - 4)), j = 2 + Math.floor(rngMap() * (N - 4));
        if (nearSlot(i, j) || pond.some(([pi, pj]) => Math.hypot(pi - i, pj - j) < 2.4)) continue;
        trees.push({ i, j, big: rngMap() < 0.3 });
        break;
      }
    }

    // 通行不可タイル(建物・池・木)
    const blocked = new Set();
    const bkey = (i, j) => i * 1000 + j;
    slotOf.forEach(({ si, sj }) => {
      for (let di = -1; di <= 2; di++) for (let dj = -1; dj <= 2; dj++) blocked.add(bkey(si + di, sj + dj));
    });
    pond.forEach(([i, j]) => blocked.add(bkey(i, j)));
    trees.forEach((tr) => blocked.add(bkey(tr.i, tr.j)));
    const walkable = (i, j) => i >= 1 && j >= 1 && i <= N - 2 && j <= N - 2 && !blocked.has(bkey(Math.round(i), Math.round(j)));
    const pathClear = (a, b) => {
      const steps = Math.ceil(Math.hypot(b.i - a.i, b.j - a.j) * 2);
      for (let s = 1; s <= steps; s++) {
        const i = a.i + ((b.i - a.i) * s) / steps, j = a.j + ((b.j - a.j) * s) / steps;
        if (!walkable(i, j)) return false;
      }
      return true;
    };
    const randWalkable = (rng2) => {
      for (let tries = 0; tries < 30; tries++) {
        const i = 1 + rng2() * (N - 2), j = 1 + rng2() * (N - 2);
        if (walkable(i, j)) return { i, j };
      }
      return { i: N / 2, j: N - 3 };
    };

    // ワールドの大きさ(アートpx)とオフセット
    const oy = 46; // 空とそびえる建物のための上マージン
    const ox = (N - 1) * (TW / 2) + TW;
    const worldW = (N - 1) * TW + TW * 2;
    const worldH = (N - 1) * TH + oy + 40;

    /* ---- 静的レイヤー(地面・はたけ・みち・池・花) ---- */
    const ground = document.createElement("canvas");
    ground.width = worldW; ground.height = worldH;
    const g = ground.getContext("2d");
    const rngTuft = mulberry32(hashStr("kabu-ranch-tuft"));
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const base = (i + j) % 2 === 0 ? season.g1 : season.g2;
        fillTile(g, i, j, ox, oy, shadeHex(base, 0.97), base);
        if (rngTuft() < 0.12) { // 草むらのアクセント
          g.fillStyle = shadeHex(base, 0.8);
          g.fillRect(ox + isoX(i, j) - 2, oy + isoY(i, j) - 2, 2, 1);
          g.fillRect(ox + isoX(i, j) + 3, oy + isoY(i, j) + 1, 2, 1);
        }
      }
    }
    // 建物の前のみち(横方向)と、敷地の石だたみ・はたけ
    slotOf.forEach(({ si, sj }, id) => {
      for (let i = 1; i <= N - 2; i++) fillTile(g, i, sj + 2, ox, oy, "#d0ba8e", "#d8c49a"); // みち
      for (let di = -1; di <= 2; di++) for (let dj = -1; dj <= 1; dj++) {
        fillTile(g, si + di, sj + dj, ox, oy, "#c1bba9", "#c8c2b0"); // 石だたみ
      }
      const st = stocksRef.current.find((s) => s.id === id);
      if (st && st.status === "hold") { // 保有銘柄の家にははたけ
        for (let di = 3; di <= 4; di++) for (let dj = 0; dj <= 1; dj++) {
          fillTile(g, si + di, sj + dj, ox, oy, "#6b4e2c", "#7a5a33");
          const px = ox + isoX(si + di, sj + dj), py = oy + isoY(si + di, sj + dj);
          g.fillStyle = season.key === "winter" ? "#9fb3ac" : "#4d9e55";
          g.fillRect(px - 4, py - 2, 2, 2);
          g.fillRect(px + 2, py, 2, 2);
        }
      }
    });
    // 池
    pond.forEach(([i, j]) => fillTile(g, i, j, ox, oy, "#3d94c4", "#4aa8d8"));
    pond.forEach(([i, j], k) => {
      if (k % 3 === 0) {
        g.fillStyle = "#9fd8f0";
        g.fillRect(ox + isoX(i, j) - 3, oy + isoY(i, j) - 1, 3, 1);
      }
    });
    // 実績デコ: 花だん(3+) / かんばん(6+)は下のスプライト列 / かがり火(9+) / 金の像(全部)
    if (unlocked >= 3) {
      const cols2 = ["#ff8fb3", "#ffd166", "#c4b5fd", "#ff8f6b", "#ffffff", "#93c5fd"];
      for (let k = 0; k < 12; k++) {
        const i = N - 4 + (k % 3), j = N - 5 + Math.floor(k / 6);
        const px = ox + isoX(i, j) + ((k * 7) % 11) - 5, py = oy + isoY(i, j) + ((k * 5) % 5) - 2;
        g.fillStyle = "#2f7a3d"; g.fillRect(px, py + 1, 1, 2);
        g.fillStyle = cols2[k % 6]; g.fillRect(px - 1, py - 1, 2, 2);
      }
    }

    /* ---- そびえるスプライト(建物・木・かんばん等)を奥行きソート用に用意 ---- */
    const buildCache = new Map();
    const buildingFor = (s, phase) => {
      const key = `${s.id}:${stageOf(calcLevel(s)).no}:${phase}:${s.shiny ? "S" : ""}`;
      if (!buildCache.has(key)) buildCache.set(key, buildingCanvas(s, phase, season));
      return buildCache.get(key);
    };
    const treeSprites = trees.map((tr) => ({ ...treeCanvas(season, tr.big), i: tr.i, j: tr.j }));
    let signSprite = null;
    if (unlocked >= 6) {
      const cv = document.createElement("canvas");
      cv.width = 46; cv.height = 26;
      const c2 = cv.getContext("2d");
      c2.fillStyle = "#8a6a3a"; c2.fillRect(10, 12, 3, 14); c2.fillRect(33, 12, 3, 14);
      c2.fillStyle = "#a8834c"; c2.fillRect(2, 2, 42, 12);
      c2.fillStyle = "#5c4526"; c2.fillRect(3, 3, 40, 10);
      c2.fillStyle = "#ffe9c9"; c2.font = "bold 7px sans-serif"; c2.textAlign = "center";
      c2.fillText("KABU牧場", 23, 11);
      signSprite = { cv, anchorX: 23, anchorY: 25, i: Math.floor(N / 2), j: N - 2.2 };
    }
    let statueSprite = null;
    if (unlocked >= ACHIEVEMENTS.length) {
      const cv = document.createElement("canvas");
      cv.width = 18; cv.height = 22;
      const c2 = cv.getContext("2d");
      c2.fillStyle = "#9ca3af"; c2.fillRect(3, 17, 12, 5);
      c2.fillStyle = "#7c8391"; c2.fillRect(3, 17, 12, 1);
      c2.fillStyle = "#ffd166"; c2.fillRect(6, 7, 6, 10); c2.fillRect(5, 3, 8, 6);
      c2.fillStyle = "#fff2c2"; c2.fillRect(6, 4, 2, 2);
      statueSprite = { cv, anchorX: 9, anchorY: 21, i: 2.2, j: N - 3 };
    }
    const torchPos = unlocked >= 9 ? [{ i: Math.floor(N / 2) - 3, j: N - 3 }, { i: Math.floor(N / 2) + 3, j: N - 3 }] : [];

    /* ---- クリーチャーの状態 ---- */
    const artCache = new Map();
    const artFor = (s, sleeping) => {
      const key = `${s.id}:${sleeping ? "z" : "a"}:${s.shiny ? "S" : ""}:${stageOf(calcLevel(s)).no}:${s.evoPattern || ""}`;
      if (!artCache.has(key)) artCache.set(key, creatureArt(s, sleeping));
      return artCache.get(key);
    };
    const crit = new Map(); // stockId -> 状態
    members.forEach((s) => {
      const { si, sj } = slotOf.get(s.id);
      const home = { i: si + 0.5, j: sj + 2.6 }; // 家の前(建物より手前=南)
      const rng2 = mulberry32(hashStr(String(s.code || s.id)) ^ 0x9e3779b9);
      crit.set(s.id, {
        home, field: { i: si + 3.5, j: sj + 0.8 },
        i: home.i, j: home.j, ti: home.i, tj: home.j, legs: [],
        state: "idle", stateUntil: 0, bob: rng2() * 6.28, rng: rng2,
        workTickAt: 0,
      });
    });

    /* ---- 演出キュー(吹き出し・エモート・パーティクル) ---- */
    const bubbles = []; // {id, text, until}
    const emotes = [];  // {i, j, txt, born, life}
    let nextBubbleAt = performance.now() + 3000;
    const lastGreet = new Map();
    const NPART = rainy ? 110 : 60;
    const parts = [];
    const pKind = rainy ? (season.key === "winter" ? "snowstorm" : "rain") : (season.particle ? season.particle.kind : null);
    if (pKind && !reduced) {
      for (let k = 0; k < NPART; k++) {
        parts.push({ x: Math.random(), y: Math.random(), v: 0.6 + Math.random() * 0.8, ph: Math.random() * 6.28 });
      }
    }
    // 星(夜)。画面座標に固定
    const starRng = mulberry32(hashStr("kabu-stars"));
    const starPts = Array.from({ length: 60 }, () => ({ x: starRng(), y: starRng() * 0.5, tw: starRng() * 6.28 }));

    /* ---- ビューポート(パン・ズーム) ---- */
    let cw = 0, chh = 0, dpr = 1;
    const pan = { x: worldW / 2, y: oy + (N * TH) / 2 - 20 }; // 画面中心が指すワールド座標
    const clampPan = () => {
      const z = zoomRef.current;
      pan.x = Math.max(cw / (2 * z) - 30, Math.min(worldW - cw / (2 * z) + 30, pan.x));
      pan.y = Math.max(chh / (2 * z) - 20, Math.min(worldH - chh / (2 * z) + 20, pan.y));
    };
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      cw = Math.max(1, wrap.clientWidth);
      chh = Math.max(1, wrap.clientHeight);
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(chh * dpr);
      canvas.style.width = cw + "px";
      canvas.style.height = chh + "px";
      clampPan();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const toScreen = (wx, wy) => {
      const z = zoomRef.current;
      return { x: (wx - pan.x) * z + cw / 2, y: (wy - pan.y) * z + chh / 2 };
    };

    /* ---- 行動AI(ゆっくりtick) ---- */
    const think = () => {
      const now = performance.now();
      crit.forEach((c, id) => {
        const s = stocksRef.current.find((x) => x.id === id);
        if (!s) return;
        const tier = moveTierOf(s);
        if (tier === 3) {
          if (c.state !== "sleep") { c.state = "sleep"; c.legs = []; c.i = c.home.i; c.j = c.home.j; }
          return;
        }
        if (c.state === "sleep") c.state = "idle";
        if (c.state === "walk" || now < c.stateUntil) return;
        // 次の行動を選ぶ: 保有=はたけ仕事多め / ウォッチ=さんぽ
        const r = c.rng();
        let target = null, nextState = "walk";
        const holding = s.status === "hold";
        if (holding && r < 0.45) target = { i: c.field.i + (c.rng() - 0.5), j: c.field.j + (c.rng() - 0.5) * 0.8, then: "work" };
        else if (r < (holding ? 0.6 : 0.35)) target = { i: c.home.i + (c.rng() - 0.5) * 2, j: c.home.j + c.rng() * 1.5, then: "idle" };
        else if (r < 0.8) target = { ...randWalkable(c.rng), then: "idle" };
        else { c.state = "idle"; c.stateUntil = now + 1500 + c.rng() * 2500; return; }
        // 経路: 直線が塞がっていたら中継点を試す
        const from = { i: c.i, j: c.j };
        if (pathClear(from, target)) c.legs = [target];
        else {
          const mids = [{ i: from.i, j: target.j }, { i: target.i, j: from.j }];
          let done = false;
          for (const m of mids) {
            if (walkable(m.i, m.j) && pathClear(from, m) && pathClear(m, target)) { c.legs = [m, target]; done = true; break; }
          }
          if (!done) { c.state = "idle"; c.stateUntil = now + 1200; return; }
        }
        c.state = nextState;
        c.pending = target.then;
        const leg = c.legs.shift();
        c.ti = leg.i; c.tj = leg.j;
      });
      // すれ違いあいさつ(眠っている子は除く)
      if (!reduced) {
        const arr = [...crit.entries()];
        const now2 = Date.now();
        for (let a = 0; a < arr.length; a++) {
          for (let b = a + 1; b < arr.length; b++) {
            const [ida, ca] = arr[a], [idb, cb] = arr[b];
            if (ca.state === "sleep" || cb.state === "sleep") continue;
            if (Math.hypot(ca.i - cb.i, ca.j - cb.j) < 1.6) {
              const key = ida < idb ? ida + idb : idb + ida;
              if (!lastGreet.has(key) || now2 - lastGreet.get(key) > 20000) {
                lastGreet.set(key, now2);
                emotes.push({ i: (ca.i + cb.i) / 2, j: (ca.j + cb.j) / 2, txt: "♪", born: performance.now(), life: 1300 });
              }
            }
          }
        }
      }
    };
    const thinkIv = setInterval(think, 700);
    think();

    /* ---- 描画ループ ---- */
    let last = performance.now();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const z = zoomRef.current;
      const phase = dayPhase();
      const P = PHASE_INFO[phase];

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;

      // 空
      const grd = ctx.createLinearGradient(0, 0, 0, chh);
      let s0 = P.sky[0], s1 = P.sky[1];
      grd.addColorStop(0, s0); grd.addColorStop(1, s1);
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, cw, chh);
      if (rainy) { ctx.fillStyle = "rgba(90,100,115,.5)"; ctx.fillRect(0, 0, cw, chh); }
      // 星
      if (P.stars > 0 && !rainy) {
        ctx.fillStyle = "#ffffff";
        starPts.forEach((st, k) => {
          const a = P.stars * (0.4 + 0.6 * Math.abs(Math.sin(now / 900 + st.tw)));
          ctx.globalAlpha = a;
          ctx.fillRect(Math.round(st.x * cw), Math.round(st.y * chh), k % 5 === 0 ? 2 : 1, k % 5 === 0 ? 2 : 1);
        });
        ctx.globalAlpha = 1;
      }

      // 地面レイヤー
      const org = toScreen(0, 0);
      ctx.drawImage(ground, Math.round(org.x), Math.round(org.y), worldW * z, worldH * z);

      /* クリーチャーの移動更新 */
      const moods = {};
      crit.forEach((c, id) => {
        const s = stocksRef.current.find((x) => x.id === id);
        if (!s) return;
        const tier = moveTierOf(s);
        const mood = moodOf(pnlOf(s, quotesRef.current[id]));
        moods[id] = mood;
        if (c.state === "walk" && !reduced) {
          const spdBase = [1.7, 1.1, 0.55, 0][tier];
          const spd = spdBase * (mood ? { peak: 1.2, good: 1.1, flat: 1, low: 0.8, tired: 0.65 }[mood.key] : 1);
          const dx = c.ti - c.i, dy = c.tj - c.j, d = Math.hypot(dx, dy);
          if (d < 0.08) {
            if (c.legs.length > 0) { const leg = c.legs.shift(); c.ti = leg.i; c.tj = leg.j; }
            else {
              c.state = c.pending || "idle";
              const dur = c.state === "work" ? 3500 + c.rng() * 3500 : 1500 + c.rng() * 2500;
              c.stateUntil = now + dur;
            }
          } else {
            const step = Math.min(spd * dt, d);
            c.i += (dx / d) * step; c.j += (dy / d) * step;
          }
        }
        // はたけ仕事の途中経過(装飾のみ)。ようす=事実により✨/💧が混ざる
        if (c.state === "work" && !reduced && now > c.workTickAt) {
          c.workTickAt = now + 1400 + c.rng() * 900;
          const txt = mood && mood.key === "peak" ? "✨" : mood && (mood.key === "low" || mood.key === "tired") && c.rng() < 0.5 ? "💧" : "🌱";
          emotes.push({ i: c.i, j: c.j, txt, born: now, life: 1100 });
        }
        if (c.state === "sleep" && !reduced && c.rng() < 0.004) {
          emotes.push({ i: c.i, j: c.j, txt: "💤", born: now, life: 1800 });
        }
      });

      /* 吹き出しの発生 */
      if (!reduced && now > nextBubbleAt) {
        nextBubbleAt = now + 4500 + Math.random() * 4500;
        const awake = [...crit.entries()].filter(([, c]) => c.state !== "sleep");
        if (awake.length > 0 && bubbles.length < 2) {
          const [id] = awake[Math.floor(Math.random() * awake.length)];
          const s = stocksRef.current.find((x) => x.id === id);
          if (s) {
            const pool = bubblePool(s, moods[id], phase);
            bubbles.push({ id, text: pool[Math.floor(Math.random() * pool.length)], until: now + 3400 });
          }
        }
      }
      for (let k = bubbles.length - 1; k >= 0; k--) if (now > bubbles[k].until) bubbles.splice(k, 1);

      /* そびえ物＋クリーチャーを奥行き(i+j)ソートで描画 */
      const sprites = [];
      members.forEach((s) => {
        const { si, sj } = slotOf.get(s.id);
        const b = buildingFor(s, phase);
        sprites.push({ depth: si + 1.3 + sj + 1.3, cv: b.cv, ax: b.anchorX, ay: b.anchorY, wi: si + 1.3, wj: sj + 1.3, kind: "bld", id: s.id });
      });
      treeSprites.forEach((tr) => sprites.push({ depth: tr.i + tr.j, cv: tr.cv, ax: tr.anchorX, ay: tr.anchorY, wi: tr.i, wj: tr.j, kind: "tree" }));
      if (signSprite) sprites.push({ depth: signSprite.i + signSprite.j, cv: signSprite.cv, ax: signSprite.anchorX, ay: signSprite.anchorY, wi: signSprite.i, wj: signSprite.j, kind: "sign" });
      if (statueSprite) sprites.push({ depth: statueSprite.i + statueSprite.j, cv: statueSprite.cv, ax: statueSprite.anchorX, ay: statueSprite.anchorY, wi: statueSprite.i, wj: statueSprite.j, kind: "statue" });
      crit.forEach((c, id) => {
        const s = stocksRef.current.find((x) => x.id === id);
        if (!s) return;
        sprites.push({ depth: c.i + c.j + 0.01, kind: "crit", id, c, s });
      });
      sprites.sort((a, b) => a.depth - b.depth);

      const hitRects = []; // タップ判定(描画順=手前優先で後勝ち)
      sprites.forEach((sp) => {
        if (sp.kind === "crit") {
          const { c, s, id } = sp;
          const tier = moveTierOf(s);
          const sleeping = tier === 3;
          const art = artFor(s, sleeping);
          const wx = ox + isoX(c.i, c.j), wy = oy + isoY(c.i, c.j);
          const scr = toScreen(wx, wy);
          const mood = moods[id];
          const walking = c.state === "walk";
          const hopAmp = tier === 0 ? 3 : tier === 1 ? 1.5 : 0;
          const bob = !reduced && walking && hopAmp ? Math.abs(Math.sin(now / 130 + c.bob)) * hopAmp * z : 0;
          const workBob = !reduced && c.state === "work" ? Math.abs(Math.sin(now / 200 + c.bob)) * 1.5 * z : 0;
          const squish = mood && mood.key === "tired" ? 0.94 : 1;
          const w = art.width * z * 0.9, h = art.height * z * 0.9 * squish;
          // 影
          ctx.fillStyle = "rgba(0,0,0,.25)";
          ctx.beginPath();
          ctx.ellipse(scr.x, scr.y, w * 0.32, 3.2 * z * 0.5, 0, 0, 6.29);
          ctx.fill();
          ctx.drawImage(art, Math.round(scr.x - w / 2), Math.round(scr.y - h + 2 - bob - workBob), Math.round(w), Math.round(h));
          if (sleeping) {
            ctx.font = `${Math.round(6 * z)}px sans-serif`;
            ctx.fillText("💤", scr.x + w * 0.3, scr.y - h);
          }
          // なまえ
          const nm = (s.shiny ? "✨" : "") + clip(s.name, 8);
          ctx.font = "bold 10px sans-serif";
          const tw2 = ctx.measureText(nm).width + 8;
          ctx.fillStyle = "rgba(14,17,34,.72)";
          ctx.fillRect(Math.round(scr.x - tw2 / 2), Math.round(scr.y + 3), Math.round(tw2), 13);
          ctx.fillStyle = "#fff";
          ctx.textAlign = "center";
          ctx.fillText(nm, Math.round(scr.x), Math.round(scr.y + 13));
          ctx.textAlign = "start";
          hitRects.push({ x: scr.x - Math.max(w, tw2) / 2, y: scr.y - h - 4, w: Math.max(w, tw2), h: h + 20, id });
          c.scr = { x: scr.x, y: scr.y - h - bob - workBob }; // 吹き出しのアンカー
        } else {
          const wx = ox + isoX(sp.wi, sp.wj), wy = oy + isoY(sp.wi, sp.wj);
          const scr = toScreen(wx, wy);
          const dw = sp.cv.width * z, dh = sp.cv.height * z;
          ctx.drawImage(sp.cv, Math.round(scr.x - sp.ax * z), Math.round(scr.y - sp.ay * z), dw, dh);
          if (sp.kind === "bld") hitRects.push({ x: scr.x - sp.ax * z, y: scr.y - sp.ay * z, w: dw, h: dh, id: sp.id, low: true });
        }
      });

      // かがり火(実績9+): ちらつく炎と夜のあかり
      torchPos.forEach((tp, k) => {
        const scr = toScreen(ox + isoX(tp.i, tp.j), oy + isoY(tp.i, tp.j));
        ctx.fillStyle = "#8a6a3a";
        ctx.fillRect(Math.round(scr.x - z / 2), Math.round(scr.y - 10 * z), z, 10 * z);
        const fl = Math.sin(now / 90 + k * 2) > 0;
        ctx.fillStyle = fl ? "#ffb54d" : "#ff8f3d";
        ctx.fillRect(Math.round(scr.x - 1.5 * z), Math.round(scr.y - 13 * z), 3 * z, 3 * z);
        ctx.fillStyle = "#fff2c2";
        ctx.fillRect(Math.round(scr.x - 0.5 * z), Math.round(scr.y - 12.5 * z), z, z);
      });

      /* 昼夜のトーン(multiplyで世界ごと染める) */
      if (P.tint) {
        ctx.globalCompositeOperation = "multiply";
        ctx.fillStyle = P.tint;
        ctx.fillRect(0, 0, cw, chh);
        ctx.globalCompositeOperation = "source-over";
      }
      // 夜のあかり(まど・かがり火のグロー)
      if (phase !== "day") {
        ctx.globalCompositeOperation = "lighter";
        torchPos.forEach((tp) => {
          const scr = toScreen(ox + isoX(tp.i, tp.j), oy + isoY(tp.i, tp.j));
          const gr2 = ctx.createRadialGradient(scr.x, scr.y - 12 * z, 2, scr.x, scr.y - 12 * z, 26 * z);
          gr2.addColorStop(0, "rgba(255,180,80,.30)");
          gr2.addColorStop(1, "rgba(255,180,80,0)");
          ctx.fillStyle = gr2;
          ctx.fillRect(scr.x - 26 * z, scr.y - 38 * z, 52 * z, 52 * z);
        });
        ctx.globalCompositeOperation = "source-over";
      }

      /* 天気パーティクル(画面座標) */
      if (parts.length > 0) {
        parts.forEach((p) => {
          if (pKind === "rain") {
            p.y += p.v * dt * 1.6; p.x += dt * 0.06;
          } else {
            p.y += p.v * dt * (pKind === "snowstorm" ? 0.28 : 0.12);
            p.x += Math.sin(now / 900 + p.ph) * dt * 0.05;
          }
          if (p.y > 1) { p.y = -0.02; p.x = Math.random(); }
          if (p.x > 1) p.x = 0;
          const sx = p.x * cw, sy = p.y * chh;
          if (pKind === "rain") {
            ctx.strokeStyle = "rgba(190,210,240,.55)";
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx - 2, sy + 9); ctx.stroke();
          } else {
            ctx.fillStyle = pKind === "petal" ? "#ffc2d8" : pKind === "leaf" ? "#d9873a" : "#ffffff";
            ctx.fillRect(Math.round(sx), Math.round(sy), 2, 2);
          }
        });
      }

      /* エモート(♪✨💧💤)と吹き出し */
      for (let k = emotes.length - 1; k >= 0; k--) {
        const e = emotes[k];
        const age = (now - e.born) / e.life;
        if (age >= 1) { emotes.splice(k, 1); continue; }
        const scr = toScreen(ox + isoX(e.i, e.j), oy + isoY(e.i, e.j));
        ctx.globalAlpha = 1 - age * age;
        ctx.font = `${Math.round(6.5 * z)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(e.txt, scr.x, scr.y - (14 + age * 10) * z * 0.55 - 20);
        ctx.textAlign = "start";
        ctx.globalAlpha = 1;
      }
      bubbles.forEach((bb) => {
        const c = crit.get(bb.id);
        if (!c || !c.scr) return;
        ctx.font = "bold 11px 'Hiragino Kaku Gothic ProN', sans-serif";
        const tw2 = Math.min(170, ctx.measureText(bb.text).width) + 14;
        const bx = Math.round(c.scr.x - tw2 / 2), by = Math.round(c.scr.y - 30);
        ctx.fillStyle = "#fffef2";
        ctx.strokeStyle = "#6b5a36";
        ctx.lineWidth = 1.5;
        const r = 7;
        ctx.beginPath();
        ctx.moveTo(bx + r, by);
        ctx.arcTo(bx + tw2, by, bx + tw2, by + 22, r);
        ctx.arcTo(bx + tw2, by + 22, bx, by + 22, r);
        ctx.lineTo(c.scr.x + 5, by + 22);
        ctx.lineTo(c.scr.x, by + 29);
        ctx.lineTo(c.scr.x - 5, by + 22);
        ctx.arcTo(bx, by + 22, bx, by, r);
        ctx.arcTo(bx, by, bx + tw2, by, r);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#2b2416";
        ctx.textAlign = "center";
        ctx.fillText(bb.text, c.scr.x, by + 15, 168);
        ctx.textAlign = "start";
      });

      canvas._hitRects = hitRects; // タップ判定用
    };
    loop();

    /* ---- 操作: ドラッグ=パン / タップ=選択 / ホイール・ボタン=ズーム ---- */
    let down = null, moved = 0, multi = false;
    const onDown = (e) => {
      if (down) { multi = true; return; }
      down = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
      moved = 0; multi = false;
      canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e) => {
      if (!down || multi) return;
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      moved = Math.max(moved, Math.hypot(dx, dy));
      if (moved >= 4) {
        const zz = zoomRef.current;
        pan.x = down.px - dx / zz;
        pan.y = down.py - dy / zz;
        clampPan();
      }
    };
    const onUp = (e) => {
      const wasMulti = multi, wasMoved = moved;
      const start = down;
      down = null; multi = false;
      if (!start || wasMulti || wasMoved >= 7) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      const hits = (canvas._hitRects || []).filter((h) => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h);
      if (hits.length > 0) {
        const top = hits.find((h) => !h.low) || hits[hits.length - 1]; // クリーチャー優先
        onSelectRef.current(top.id);
      }
    };
    const onWheel = (e) => {
      e.preventDefault();
      const zs = [1, 2, 3, 4];
      const cur = zs.indexOf(zoomRef.current);
      const next = zs[Math.max(0, Math.min(zs.length - 1, cur + (e.deltaY < 0 ? 1 : -1)))];
      if (next !== zoomRef.current) { zoomRef.current = next; clampPan(); setZoomTick((n) => n + 1); }
    };
    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", () => { down = null; multi = false; });
    canvas.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(thinkIv);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("wheel", onWheel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneKey]);

  const zoomBtn = (dir) => {
    const zs = [1, 2, 3, 4];
    const cur = zs.indexOf(zoomRef.current);
    const next = zs[Math.max(0, Math.min(zs.length - 1, cur + dir))];
    zoomRef.current = next;
    setZoomTick((n) => n + 1);
  };

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%", height: "min(66vh, 560px)", borderRadius: 18, overflow: "hidden", border: "2px solid #8a6a3a", background: "#0d1230" }}>
      <canvas ref={canvasRef} style={{ display: "block", imageRendering: "pixelated" }} />
      {/* ズーム(カイロ風ボタン) */}
      <div style={{ position: "absolute", right: 10, bottom: 10, display: "flex", gap: 6 }}>
        {[["−", -1], ["＋", 1]].map(([lbl, dir]) => (
          <button key={lbl} onClick={() => zoomBtn(dir)} style={{
            all: "unset", cursor: "pointer", width: 34, height: 34, textAlign: "center", lineHeight: "34px",
            background: "#f4e7c8", color: "#4a3a1a", fontWeight: 800, fontSize: 17,
            border: "2px solid #8a6a3a", borderRadius: 8, boxShadow: "0 2px 0 #6b5228",
            opacity: (dir === -1 && zoomRef.current === 1) || (dir === 1 && zoomRef.current === 4) ? 0.4 : 1,
          }}>{lbl}</button>
        ))}
      </div>
    </div>
  );
}

/* ---- ようすバー(カイロ風の下部パネル)＋牧場ビュー ---- */

function RanchView({ stocks, activity, onSelect }) {
  const [quotes, setQuotes] = useState({});
  const phase = PHASE_INFO[dayPhase()];
  const season = seasonOf(new Date().getMonth() + 1);
  const rainy = isRainyToday();
  const actives = stocks.filter((s) => s.status !== "sold");

  // 保有情報つき銘柄の参考株価(キャッシュに乗る)。失敗しても牧場は動く
  useEffect(() => {
    let alive = true;
    fetchHeldQuotes(stocks).then((m) => { if (alive) setQuotes(m); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stocks.map((s) => `${s.id}:${s.shares}:${s.avgPrice}:${s.status}`).join("|")]);

  // 通貨ごとの時価合計・含み損益合計(事実のみ・為替換算なし)
  const totals = {};
  stocks.forEach((s) => {
    const pnl = pnlOf(s, quotes[s.id]);
    if (!pnl) return;
    if (!totals[pnl.currency]) totals[pnl.currency] = { value: 0, pnl: 0 };
    totals[pnl.currency].value += pnl.value;
    totals[pnl.currency].pnl += pnl.pnl;
  });
  const days = activity ? activity.days : {};
  const todayN = days[today()] || 0;
  const { current } = streaks(days);
  const d = new Date();

  const panel = {
    background: "#f4e7c8", border: "2px solid #8a6a3a", borderRadius: 10,
    color: "#4a3a1a", fontFamily: "'DotGothic16', monospace", fontSize: 12,
    padding: "6px 12px", boxShadow: "0 2px 0 #6b5228",
  };

  return (
    <div>
      {/* 上部バー: 日付・季節・時間帯(カイロ風) */}
      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
        <div style={panel}>{d.getMonth() + 1}月{d.getDate()}日・{season.label}・{phase.label}{rainy ? "・☔" : ""}</div>
        <div style={panel}>なかま {actives.length}匹</div>
        <div style={{ ...panel, marginLeft: "auto" }}>🌱きょうの研究 {todayN}件{current > 0 ? `・🔥${current}日` : ""}</div>
      </div>

      {actives.length === 0 ? (
        <div style={{ textAlign: "center", padding: "50px 20px", color: "#5b6284", border: "2px dashed #2a3050", borderRadius: 16, fontSize: 13 }}>
          <div style={{ fontSize: 34, marginBottom: 8 }}>🏞</div>
          まだなかまがいません。図鑑で銘柄をゲットすると牧場に小屋が建ちます
        </div>
      ) : (
        <RanchKairo stocks={stocks} quotes={quotes} onSelect={onSelect} />
      )}

      {/* ようすバー: 保有の時価・含み損益(事実のみ・通貨ごと) */}
      {Object.keys(totals).length > 0 && (
        <div style={{ ...panel, marginTop: 8, display: "flex", gap: 14, flexWrap: "wrap" }}>
          <span>💼 ほゆう</span>
          {Object.entries(totals).map(([cur, t]) => (
            <span key={cur}>
              時価 {fmtMoney(t.value, cur)}（含み損益 {fmtMoney(t.pnl, cur, true)}）
            </span>
          ))}
        </div>
      )}

      <div style={{ fontSize: 10.5, color: "#5b6284", marginTop: 8, lineHeight: 1.7 }}>
        銘柄ごとに研究小屋が建ち、研究ステージが上がるほど立派に育ちます。保有銘柄ははたけ仕事、ウォッチ中はさんぽ、
        🥀90日超は家の前でおひるね。<b style={{ color: "#8b93b8" }}>ドラッグで移動、＋−/ホイールでズーム、タップで詳細</b>。
        吹き出しはあなたが書いた仮説・メモの復習です。
        クリーチャーの「ようす」(✨/💧・足どり)は記録の鮮度と含み損益の事実を映した遊び演出で、
        数値はすべて参考表示。売買推奨ではありません。
      </div>
    </div>
  );
}

export { dayPhase, PHASE_INFO, seasonOf, isRainyToday, RanchView };
