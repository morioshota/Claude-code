/* 牧場モード: カイロソフト風2Dアイソメぼくじょう(GBA級の精細ドット)
   - タイルは48×24pxの高精細アイソメ。屋根の縞・壁の板張り・窓枠までドットで描き込む
   - 保有(ホカク済み)銘柄: 柵で囲まれた敷地+研究所+はたけ。クリーチャーは敷地内で暮らす
   - ウォッチ中の銘柄: 研究所なし。東側の「やせいの森」で木々のあいだを動き回る
   - 研究所は研究ステージで形が変わる: ST1テント→ST2小屋→ST3ラボ(別館+アンテナ)→ST4御殿(塔+旗)
   - 含み損益(事実)で研究所と敷地の大きさが変わる: 含み損=すこし小さく、含み益=青天井で拡大
     ※大きさ・ようすは事実の写像であって売買推奨ではない(CLAUDE.md不変条件5の承認済み例外)
   - はたけの作物は調査記録の件数で育つ(かざりのみ)
   - クイックメモの日付(「決算は8/8」等)を拾って🗓リマインド(自分が書いた予定の事実のみ)
   - 季節(月)・天気(日付ハッシュ)・昼夜(端末時計)の実時間演出。株価は抽選・ガチャに絡めない */

import { useState, useEffect, useMemo, useRef } from "react";
import { buildPixels } from "../lib/sprites.js";
import { calcLevel, stageOf, moveTierOf, freshInfo, evalAchievements } from "../lib/stock.js";
import { ACHIEVEMENTS, TYPES } from "../data/constants.js";
import { hashStr, mulberry32, today } from "../lib/util.js";
import { pnlOf, moodOf, fmtMoney, fmtPct, fetchHeldQuotes } from "../lib/holdings.js";
import { upcomingEvents } from "../lib/events.js";
import { streaks } from "../lib/activity.js";
import { dueForCheck } from "./TriggerCheck.jsx";

/* ---- 実時間の演出パラメータ ---- */

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
  if (m >= 3 && m <= 5)  return { key: "spring", label: "🌸はる", g1: "#5aa860", g2: "#56a25c", wild: "#79b364", forest: "#5d9a4e", leaf: "#e58fb4", leafHi: "#f5c3d8", trunk: "#8a6242", particle: { kind: "petal" } };
  if (m >= 6 && m <= 8)  return { key: "summer", label: "🌻なつ", g1: "#4d9e55", g2: "#489850", wild: "#69a957", forest: "#4a8f44", leaf: "#2e6e3c", leafHi: "#4d9455", trunk: "#7a5638", particle: null };
  if (m >= 9 && m <= 11) return { key: "autumn", label: "🍁あき", g1: "#8a944c", g2: "#859048", wild: "#a09549", forest: "#8f8442", leaf: "#c2622d", leafHi: "#e0854a", trunk: "#7a5638", particle: { kind: "leaf" } };
  return { key: "winter", label: "⛄ふゆ", g1: "#c2cfc9", g2: "#bcc9c3", wild: "#aebfb7", forest: "#9db4aa", leaf: "#3d6e54", leafHi: "#5d8a70", trunk: "#6b4e38", particle: { kind: "snow" } };
};
const isRainyToday = () => hashStr(today()) % 10 < 3; // 3割の日は雨(冬は雪が強まる)

/* ---- アイソメ座標系(アートピクセル)。タイル: 幅48×高さ24の高精細ひし形 ---- */
const TW = 48, TH = 24;
const isoX = (i, j) => (i - j) * (TW / 2);
const isoY = (i, j) => (i + j) * (TH / 2);

/* ひし形を1pxの横帯で塗る(にじみのないカクカク描画) */
const fillDia = (ctx, cx, topY, hw, colL, colR) => {
  for (let r = 0; r < hw; r++) {
    const k = r < hw / 2 ? r : hw - 1 - r;
    const w = Math.max(1, (k + 1) * 2);
    ctx.fillStyle = colL;
    ctx.fillRect(cx - w, topY + r, w, 1);
    ctx.fillStyle = colR;
    ctx.fillRect(cx, topY + r, w, 1);
  }
};
const fillTile = (ctx, i, j, ox, oy, colL, colR) => {
  fillDia(ctx, ox + isoX(i, j), oy + isoY(i, j) - TH / 2, TH, colL, colR);
};

const shadeHex = (hex, f) => { // ⚠ #hex専用(rgb文字列を渡すと無効色になる)
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
};

/* ---- 含み損益→大きさ(事実の写像。0.1刻みに量子化) ---- */
const boostOf = (pnl) => {
  if (!pnl) return 1;
  if (pnl.pct <= -15) return 0.75;
  if (pnl.pct <= -3) return 0.85;
  if (pnl.pct < 3) return 1;
  return 1 + Math.round((pnl.pct / 50) * 10) / 10;
};

/* ---- 研究所の描画(高精細)。ステージで形・boostで大きさが変わる ---- */

const BUILD_DIMS = [null,
  { hw: 18, wall: 8,  roof: 16 },  // ST1 テント
  { hw: 22, wall: 16, roof: 14 },  // ST2 小屋
  { hw: 26, wall: 20, roof: 16 },  // ST3 ラボ
  { hw: 28, wall: 26, roof: 14 },  // ST4 御殿
];

const scaledDims = (stage, f) => {
  const b = BUILD_DIMS[stage];
  return {
    hw: Math.max(12, Math.round(b.hw * f)),
    wall: Math.max(6, Math.round(b.wall * f)),
    roof: Math.max(6, Math.round(b.roof * f)),
  };
};

const plotSizeOf = (stage, f) => {
  const { hw } = scaledDims(stage, f);
  const footTiles = Math.max(2, Math.ceil((hw * 2) / TW) + 1);
  return { footTiles, size: footTiles + 5 };
};

function buildingCanvas(stock, phase, season, f) {
  const stage = stageOf(calcLevel(stock)).no;
  const { hw, wall, roof } = scaledDims(stage, f);
  const t = TYPES[stock.type] || TYPES.metal;
  const W = hw * 4 + 32;
  const H = wall * 2 + roof * 2 + hw * 2 + 56;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  const cx = Math.floor(W / 2), baseY = H - 2;
  const lit = phase !== "day";

  const wallHex = "#ead9b5";
  const roofR = t.color, roofL = shadeHex(t.color, 0.68);
  const roofR2 = shadeHex(t.color, 0.88), roofL2 = shadeHex(t.color, 0.58);

  /* 壁ボックス: 板張りの横線・角の柱つき */
  const box = (bx, by, bhw, bwall) => {
    for (let x = 0; x <= bhw; x++) {
      const yBot = by - Math.round(x / 2);
      for (let k = 0; k < bwall; k++) {
        const plank = k % 5 === 4;
        ctx.fillStyle = plank ? shadeHex(wallHex, 0.82) : wallHex;
        ctx.fillRect(bx + x, yBot - 1 - k, 1, 1);
        ctx.fillStyle = plank ? shadeHex(wallHex, 0.6) : shadeHex(wallHex, 0.72);
        ctx.fillRect(bx - x, yBot - 1 - k, 1, 1);
      }
    }
    ctx.fillStyle = shadeHex(wallHex, 0.5);
    ctx.fillRect(bx, by - bwall, 1, bwall);
    ctx.fillStyle = shadeHex(wallHex, 0.62);
    ctx.fillRect(bx + bhw, by - Math.round(bhw / 2) - bwall, 1, bwall);
    ctx.fillRect(bx - bhw, by - Math.round(bhw / 2) - bwall, 1, bwall);
    for (let x = 0; x <= bhw; x++) {
      const yBot = by - Math.round(x / 2);
      ctx.fillStyle = "#9a9284";
      ctx.fillRect(bx + x, yBot - 1, 1, 1);
      ctx.fillRect(bx - x, yBot - 1, 1, 1);
    }
  };
  /* ピラミッド屋根: 2段ごとの縞・軒の陰・てっぺんのハイライト */
  const pyramid = (bx, centerY, bhw, broof, snow, stripe) => {
    for (let l = 0; l <= broof; l++) {
      const hwl = Math.max(2, Math.round(bhw * (1 - l / (broof + 1))));
      const top = Math.round(centerY - l - hwl / 2);
      const band = stripe ? Math.floor(l / 3) % 2 === 0 : Math.floor(l / 2) % 2 === 0;
      let cl = band ? roofL : roofL2, cr = band ? roofR : roofR2;
      if (snow && l >= Math.round(broof * 0.45)) { cl = "#dfe9ee"; cr = "#f4f9fc"; }
      if (l === broof) { cl = shadeHex(t.color, 1.25); cr = shadeHex(t.color, 1.25); }
      fillDia(ctx, bx, top, hwl, cl, cr);
    }
  };
  const slab = (bx, centerY, bhw) => {
    fillDia(ctx, bx, Math.round(centerY - bhw / 2 - 3), bhw, shadeHex(t.color, 0.5), shadeHex(t.color, 0.62));
    fillDia(ctx, bx, Math.round(centerY - bhw / 2), bhw, shadeHex(wallHex, 0.6), shadeHex(wallHex, 0.8));
  };
  /* とびら: 枠+ノブつき */
  const door = (bx, by, s) => {
    const w2 = Math.max(5, Math.round(7 * s)), h2 = Math.max(9, Math.round(13 * s)), off = Math.max(3, Math.round(4 * s));
    for (let x = off - 1; x <= off + w2 + 1; x++) {
      const yb = by - Math.round(x / 2);
      ctx.fillStyle = "#8a6a3a";
      ctx.fillRect(bx + x, yb - h2 - 1, 1, 1);
    }
    for (let x = off; x <= off + w2; x++) {
      const yb = by - Math.round(x / 2);
      ctx.fillStyle = x === off || x === off + w2 ? "#8a6a3a" : "#6b4a2b";
      ctx.fillRect(bx + x, yb - h2, 1, h2);
    }
    ctx.fillStyle = "#ffd166";
    ctx.fillRect(bx + off + w2 - 1, by - Math.round((off + w2) / 2) - Math.round(h2 * 0.45), 1, 1);
  };
  /* まど: 木枠+十字の桟+あかり */
  const win = (bx, by, fx, fy, mirror) => {
    const glass = lit ? "#ffd166" : "#9cc3de";
    const draw = (px, py, dark) => {
      ctx.fillStyle = dark ? shadeHex("#8a6a3a", 0.85) : "#8a6a3a";
      ctx.fillRect(px - 1, py - 1, 7, 7);
      ctx.fillStyle = dark ? shadeHex(glass, 0.8) : glass;
      ctx.fillRect(px, py, 5, 5);
      ctx.fillStyle = dark ? shadeHex("#8a6a3a", 0.85) : "#8a6a3a";
      ctx.fillRect(px + 2, py, 1, 5);
      ctx.fillRect(px, py + 2, 5, 1);
      if (lit) { ctx.fillStyle = "#fff2c2"; ctx.fillRect(px, py, 1, 1); }
    };
    draw(bx + fx, by - Math.round(fx / 2) - fy - 6, false);
    if (mirror) draw(bx - fx - 5, by - Math.round(fx / 2) - fy - 6, true);
  };
  const goldTrim = (bx, by, bhw, bwall) => {
    ctx.fillStyle = "#ffd166";
    for (let x = 0; x <= bhw; x++) {
      const yBot = by - Math.round(x / 2);
      ctx.fillRect(bx + x, yBot - bwall, 1, 1);
      ctx.fillRect(bx - x, yBot - bwall, 1, 1);
    }
  };
  const flag = (bx, topY) => {
    ctx.fillStyle = "#8a6a3a"; ctx.fillRect(bx, topY - 14, 2, 15);
    ctx.fillStyle = "#a8834c"; ctx.fillRect(bx, topY - 14, 1, 15);
    ctx.fillStyle = t.color; ctx.fillRect(bx + 2, topY - 14, 9, 5);
    ctx.fillStyle = shadeHex(t.color, 1.3); ctx.fillRect(bx + 2, topY - 14, 9, 1);
  };

  if (stage === 1) {
    /* ST1: サーカス風の縞テント+立てふだ */
    pyramid(cx, baseY - hw / 2, hw, wall + roof, season.key === "winter", true);
    const doorH = Math.max(6, Math.round(hw * 0.4));
    ctx.fillStyle = "#3a2f1c";
    for (let k = 0; k < doorH; k++) {
      const w2 = Math.max(1, Math.round((doorH - k) * 0.8));
      ctx.fillRect(cx - w2, baseY - hw / 2 - k - 3, w2 * 2, 1);
    }
    ctx.fillStyle = "#8a6a3a"; ctx.fillRect(cx - hw - 10, baseY - 12, 3, 12);
    ctx.fillStyle = "#a8834c"; ctx.fillRect(cx - hw - 18, baseY - 21, 18, 10);
    ctx.fillStyle = "#5c4526"; ctx.fillRect(cx - hw - 16, baseY - 19, 14, 6);
  } else if (stage === 2) {
    /* ST2: 小屋 */
    box(cx, baseY, hw, wall);
    door(cx, baseY, f);
    win(cx, baseY, Math.round(hw * 0.62), Math.round(wall * 0.4), false);
    pyramid(cx, baseY - wall - hw / 2, hw, roof, season.key === "winter", false);
  } else if (stage === 3) {
    /* ST3: ラボ = 別館(平屋根)+本館+アンテナ */
    const hw2 = Math.max(10, Math.round(hw * 0.6)), wall2 = Math.max(6, Math.round(wall * 0.8));
    const ax = cx + Math.round(hw * 0.9), ay = baseY - Math.round(hw * 0.45);
    box(ax, ay, hw2, wall2);
    slab(ax, ay - wall2, hw2);
    win(ax, ay, Math.round(hw2 * 0.4), Math.round(wall2 * 0.35), false);
    box(cx, baseY, hw, wall);
    door(cx, baseY, f);
    win(cx, baseY, Math.round(hw * 0.5), Math.round(wall * 0.42), true);
    win(cx, baseY, Math.round(hw * 0.78), Math.round(wall * 0.42), true);
    pyramid(cx, baseY - wall - hw / 2, hw, roof, season.key === "winter", false);
    const apexY = baseY - wall - hw / 2 - roof - 3;
    ctx.fillStyle = "#8b93a8"; ctx.fillRect(cx, apexY - 10, 2, 11);
    ctx.fillStyle = "#b8c0d4"; ctx.fillRect(cx, apexY - 10, 1, 11);
    ctx.fillStyle = t.color; ctx.fillRect(cx - 2, apexY - 14, 6, 5);
    ctx.fillStyle = lit ? "#fff2c2" : "#ffffff"; ctx.fillRect(cx, apexY - 13, 2, 2);
  } else {
    /* ST4: 御殿 = 本館(平屋根)+塔+旗+金の帯 */
    box(cx, baseY, hw, wall);
    door(cx, baseY, f);
    win(cx, baseY, Math.round(hw * 0.42), Math.round(wall * 0.22), true);
    win(cx, baseY, Math.round(hw * 0.72), Math.round(wall * 0.22), true);
    win(cx, baseY, Math.round(hw * 0.42), Math.round(wall * 0.58), true);
    win(cx, baseY, Math.round(hw * 0.72), Math.round(wall * 0.58), true);
    goldTrim(cx, baseY, hw, wall);
    slab(cx, baseY - wall, hw);
    const hw2 = Math.max(12, Math.round(hw * 0.55)), wall2 = Math.max(8, Math.round(wall * 0.6));
    const towerBase = baseY - wall - Math.round(hw / 2) + Math.round(hw2 / 2);
    box(cx, towerBase, hw2, wall2);
    win(cx, towerBase, Math.round(hw2 * 0.4), Math.round(wall2 * 0.35), true);
    goldTrim(cx, towerBase, hw2, wall2);
    pyramid(cx, towerBase - wall2 - hw2 / 2, hw2, Math.max(7, Math.round(roof * 0.8)), season.key === "winter", false);
    flag(cx, towerBase - wall2 - hw2 / 2 - Math.max(7, Math.round(roof * 0.8)) - 3);
  }

  if (stock.shiny) { // 色違い持ちの研究所は✨つき
    const sp = (x, y) => {
      ctx.fillStyle = "#ffffff"; ctx.fillRect(x, y, 2, 2);
      ctx.fillStyle = "#ffd166";
      ctx.fillRect(x - 1, y, 1, 2); ctx.fillRect(x + 2, y, 1, 2);
      ctx.fillRect(x, y - 1, 2, 1); ctx.fillRect(x, y + 2, 2, 1);
    };
    sp(cx + Math.round(hw * 0.4), baseY - wall - hw - 4);
    sp(cx - Math.round(hw * 0.5), baseY - wall - Math.round(hw * 0.5));
  }
  // 実際に描かれた最上行を測る(🗓アイコンの位置決め用)
  let topY = 0;
  const img = ctx.getImageData(0, 0, W, H).data;
  outer: for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (img[(y * W + x) * 4 + 3] > 0) { topY = y; break outer; }
    }
  }
  return { cv, anchorX: cx, anchorY: baseY, topY };
}

/* ---- 木(多層カノピー+ハイライト) ---- */
function treeCanvas(season, big, rng) {
  const s = big ? 1.5 : 1;
  const W = Math.round(40 * s), H = Math.round(52 * s);
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  const cx = Math.floor(W / 2);
  const trunkH = Math.round(14 * s);
  ctx.fillStyle = shadeHex(season.trunk, 0.7);
  ctx.fillRect(cx - 2, H - trunkH, 5, trunkH);
  ctx.fillStyle = season.trunk;
  ctx.fillRect(cx - 2, H - trunkH, 2, trunkH);
  ctx.fillStyle = shadeHex(season.trunk, 0.55);
  ctx.fillRect(cx - 3, H - 3, 7, 2);
  const leafD = shadeHex(season.leaf, 0.72);
  const canopyH = H - trunkH + Math.round(2 * s);
  for (let l = 0; l < Math.round(30 * s); l++) {
    const rel = l / (30 * s);
    const hwRaw = (16 * s) * Math.sin(Math.PI * (0.12 + rel * 0.88));
    const hw = Math.max(1, Math.round(hwRaw * (0.92 + ((l * 7) % 5) * 0.03)));
    const y = canopyH - l;
    ctx.fillStyle = leafD;
    ctx.fillRect(cx - hw, y, hw, 1);
    ctx.fillStyle = season.leaf;
    ctx.fillRect(cx, y, hw, 1);
  }
  ctx.fillStyle = season.leafHi;
  for (let k = 0; k < Math.round(7 * s); k++) {
    const a = rng ? rng() : Math.abs(Math.sin(k * 37.7));
    const b = rng ? rng() : Math.abs(Math.sin(k * 91.3));
    ctx.fillRect(cx - 12 * s + Math.round(a * 22 * s), canopyH - Math.round(6 * s) - Math.round(b * 18 * s), 2, 2);
  }
  if (season.key === "winter") {
    ctx.fillStyle = "#eef4f8";
    for (let l = Math.round(18 * s); l < Math.round(30 * s); l++) {
      const rel = l / (30 * s);
      const hw = Math.max(1, Math.round((16 * s) * Math.sin(Math.PI * (0.12 + rel * 0.88))));
      ctx.fillRect(cx - hw, canopyH - l, hw * 2, 1);
    }
  }
  return { cv, anchorX: cx, anchorY: H - 1 };
}

/* クリーチャーのドット絵(1セル=1px)。牧場では整数倍で拡大 */
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

/* 吹き出しのセリフ候補(オーナー自身のメモが素材。🗓予定は2回入れて出やすく) */
function bubblePool(stock, mood, phase, events) {
  const arr = [];
  if (stock.hypothesis) arr.push(clip(stock.hypothesis));
  (stock.bullets || []).forEach((b) => arr.push("🔥" + clip(b, 14)));
  (stock.triggers || []).forEach((b) => arr.push("🚪" + clip(b, 14)));
  const lastLog = (stock.logs || []).slice(-1)[0];
  if (lastLog && lastLog.text) arr.push("📝" + clip(lastLog.text, 14));
  (events || []).forEach((ev) => {
    const line = `🗓${ev.m}/${ev.d} ${ev.days === 0 ? "きょう！" : `あと${ev.days}日`}`;
    arr.push(line, line);
  });
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
  const zoomRef = useRef(typeof window !== "undefined" && window.innerWidth >= 900 ? 2 : 1);
  const [, setZoomTick] = useState(0);
  const reduced = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const actives = stocks.filter((s) => s.status !== "sold");
  const sceneKey = actives
    .map((s) => `${s.id}:${s.status}:${stageOf(calcLevel(s)).no}:${moveTierOf(s)}:${s.shiny ? "S" : ""}:${s.evoPattern || ""}:${boostOf(pnlOf(s, quotes[s.id]))}:${Math.min(6, s.noteCount || 0)}`)
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
    const holds = members.filter((s) => s.status === "hold");
    const watchers = members.filter((s) => s.status !== "hold");

    /* ---- 敷地レイアウト: 保有銘柄のみ。ウォッチは東の森へ ---- */
    const ordered = [...holds].sort((a, b) => (a.no || 0) - (b.no || 0));
    const plots = new Map();
    let j0 = 2, maxI = 2;
    for (let r = 0; r * 3 < ordered.length; r++) {
      const row = ordered.slice(r * 3, r * 3 + 3);
      const infos = row.map((s) => {
        const f = boostOf(pnlOf(s, quotesRef.current[s.id]));
        return { s, f, ...plotSizeOf(stageOf(calcLevel(s)).no, f) };
      });
      const rowH = Math.max(...infos.map((p) => p.size));
      let i0 = 2;
      infos.forEach((p) => {
        const bi = i0 + Math.floor(p.footTiles / 2) + 0.5;
        const bj = j0 + Math.floor(p.footTiles / 2) + 0.5;
        plots.set(p.s.id, {
          i0, j0, size: p.size, footTiles: p.footTiles, boost: p.f, bi, bj,
          frontJ: j0 + rowH + 0.5,
          field: { i0: i0 + p.footTiles + 1, j0, w: Math.min(3, 2 + Math.floor((p.f - 1) * 2)), h: 2 },
        });
        i0 += p.size + 1;
      });
      maxI = Math.max(maxI, i0);
      j0 += rowH + 2;
    }

    /* やせいの森: 東側のひとかたまり。ウォッチ銘柄はここで暮らす */
    const FOREST_W = 11;
    const N = Math.max(22, maxI + FOREST_W + 4, j0 + 6);
    const forest = { i0: Math.max(maxI + 2, N - FOREST_W - 2), i1: N - 2, j0: 2, j1: Math.max(12, j0 - 1) };

    const pond = [];
    const pc = { i: forest.i1 - 2.5, j: forest.j1 - 2.5 };
    for (let i = Math.floor(pc.i) - 2; i <= Math.floor(pc.i) + 2; i++) {
      for (let j = Math.floor(pc.j) - 2; j <= Math.floor(pc.j) + 2; j++) {
        if (Math.hypot(i - pc.i, j - pc.j) < 2.4) pond.push([i, j]);
      }
    }
    const inPlot = (i, j, margin = 0) =>
      [...plots.values()].some((p) => i >= p.i0 - margin && i < p.i0 + p.size + margin && j >= p.j0 - margin && j < p.j0 + p.size + margin);
    const inForest = (i, j) => i >= forest.i0 && i <= forest.i1 && j >= forest.j0 && j <= forest.j1;

    const rngMap = mulberry32(hashStr("kabu-ranch-map"));
    const trees = [];
    for (let i = forest.i0; i <= forest.i1; i += 2) {
      for (let j = forest.j0; j <= forest.j1; j += 2) {
        if (rngMap() < 0.62) {
          const ti = i + Math.floor(rngMap() * 2), tj = j + Math.floor(rngMap() * 2);
          if (ti > N - 2 || tj > N - 2) continue;
          if (pond.some(([pi, pj]) => Math.hypot(pi - ti, pj - tj) < 2)) continue;
          trees.push({ i: ti, j: tj, big: rngMap() < 0.35 });
        }
      }
    }
    for (let k = 0; k < 12; k++) {
      const edge = Math.floor(rngMap() * 4);
      const p = 1 + Math.floor(rngMap() * (N - 2));
      const pos = edge === 0 ? [p, 0] : edge === 1 ? [0, p] : edge === 2 ? [p, N - 1] : [N - 1, p];
      if (!inPlot(pos[0], pos[1], 1) && !inForest(pos[0], pos[1])) trees.push({ i: pos[0], j: pos[1], big: rngMap() < 0.4 });
    }

    const blocked = new Set();
    const bkey = (i, j) => i * 1000 + j;
    plots.forEach((p) => {
      for (let di = 0; di < p.footTiles; di++) for (let dj = 0; dj < p.footTiles; dj++) blocked.add(bkey(p.i0 + di, p.j0 + dj));
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

    const oy = 90;
    const ox = (N - 1) * (TW / 2) + TW;
    const worldW = (N - 1) * TW + TW * 2;
    const worldH = (N - 1) * TH + oy + 60;

    /* ---- 静的レイヤー ---- */
    const ground = document.createElement("canvas");
    ground.width = worldW; ground.height = worldH;
    const g = ground.getContext("2d");
    const rngTuft = mulberry32(hashStr("kabu-ranch-tuft"));
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const inside = inPlot(i, j);
        const forestT = inForest(i, j);
        const baseHex = inside ? ((i + j) % 2 === 0 ? season.g1 : season.g2) : forestT ? season.forest : season.wild;
        const dim = !inside && (i + j) % 2 === 1 ? 0.95 : 1;
        fillTile(g, i, j, ox, oy, shadeHex(baseHex, 0.97 * dim), dim === 1 ? baseHex : shadeHex(baseHex, dim));
        const px = ox + isoX(i, j), py = oy + isoY(i, j);
        if (rngTuft() < 0.35) {
          const dark = shadeHex(baseHex, 0.78);
          const light = shadeHex(baseHex, 1.15);
          g.fillStyle = dark;
          g.fillRect(px - 8 + Math.floor(rngTuft() * 12), py - 4 + Math.floor(rngTuft() * 6), 1, 3);
          g.fillRect(px + 2 + Math.floor(rngTuft() * 8), py - 2 + Math.floor(rngTuft() * 5), 1, 3);
          g.fillStyle = light;
          g.fillRect(px - 3 + Math.floor(rngTuft() * 7), py - 3 + Math.floor(rngTuft() * 5), 1, 2);
          if (season.key === "spring" && rngTuft() < 0.12) {
            g.fillStyle = ["#ffd166", "#ff8fb3", "#ffffff"][Math.floor(rngTuft() * 3)];
            g.fillRect(px - 6 + Math.floor(rngTuft() * 12), py - 3 + Math.floor(rngTuft() * 5), 2, 2);
          }
        }
        if (forestT && rngTuft() < 0.3) {
          g.fillStyle = shadeHex(season.forest, 0.8);
          const bx = px - 10 + Math.floor(rngTuft() * 16), by = py - 3 + Math.floor(rngTuft() * 5);
          g.fillRect(bx, by, 5, 2);
          g.fillRect(bx + 1, by - 1, 3, 1);
        }
      }
    }
    plots.forEach((p, id) => {
      const s = stocksRef.current.find((x) => x.id === id);
      for (let i = p.i0 - 1; i <= p.i0 + p.size; i++) {
        fillTile(g, i, Math.floor(p.frontJ), ox, oy, "#d0ba8e", "#d8c49a");
        const px = ox + isoX(i, Math.floor(p.frontJ)), py = oy + isoY(i, Math.floor(p.frontJ));
        if ((i * 7) % 3 === 0) { g.fillStyle = "#b8a276"; g.fillRect(px - 5 + ((i * 5) % 9), py - 2 + ((i * 3) % 4), 2, 2); }
      }
      for (let di = -1; di <= p.footTiles; di++) for (let dj = -1; dj <= p.footTiles; dj++) {
        fillTile(g, p.i0 + di, p.j0 + dj, ox, oy, "#c1bba9", "#c8c2b0");
        const px = ox + isoX(p.i0 + di, p.j0 + dj), py = oy + isoY(p.i0 + di, p.j0 + dj);
        g.fillStyle = "#aaa494";
        g.fillRect(px - 1, py - 1, 2, 1);
      }
      if (s && s.status === "hold") {
        const nc = Math.min(6, s.noteCount || 0);
        const lvl = nc >= 6 ? 3 : nc >= 3 ? 2 : nc >= 1 ? 1 : 0;
        for (let di = 0; di < p.field.w; di++) for (let dj = 0; dj < p.field.h; dj++) {
          const fi = p.field.i0 + di, fj = p.field.j0 + dj;
          if (fi >= p.i0 + p.size) continue;
          fillTile(g, fi, fj, ox, oy, "#6b4e2c", "#7a5a33");
          const px = ox + isoX(fi, fj), py = oy + isoY(fi, fj);
          g.fillStyle = "#5a4023";
          g.fillRect(px - 14, py - 2, 12, 1);
          g.fillRect(px + 2, py + 3, 12, 1);
          const green = season.key === "winter" ? "#9fb3ac" : "#4d9e55";
          const glight = season.key === "winter" ? "#b8ccc4" : "#6dc272";
          const plant = (x, y) => {
            if (lvl === 0) return;
            if (lvl === 1) { g.fillStyle = green; g.fillRect(x, y, 2, 3); g.fillStyle = glight; g.fillRect(x, y, 1, 1); }
            else {
              g.fillStyle = green;
              g.fillRect(x + 1, y - 3, 1, 6);
              g.fillRect(x - 1, y - 1, 2, 1); g.fillRect(x + 2, y - 2, 2, 1);
              g.fillStyle = glight; g.fillRect(x + 1, y - 3, 1, 2);
              if (lvl >= 3) {
                g.fillStyle = ["#e8524a", "#ffd166"][((x + y) % 2)];
                g.fillRect(x - 1, y, 3, 3);
                g.fillStyle = "#fff2c2"; g.fillRect(x - 1, y, 1, 1);
              }
            }
          };
          plant(px - 8, py - 2); plant(px + 5, py + 1); plant(px - 2, py + 3);
        }
      }
      /* 柵: ポスト+2段レール。前のみち側の中央はゲート(すきま) */
      const drawRailEdge = (si, sj, diri, len, gateAtI) => {
        const x0 = ox + isoX(si, sj), y0 = oy + isoY(si, sj);
        const total = Math.round(len * (TW / 2));
        for (let q = 0; q <= total; q++) {
          const x = diri ? x0 + q : x0 - q;
          const y = y0 + q / 2;
          const tileOff = q / (TW / 2);
          const curI = diri ? si + tileOff : si;
          if (gateAtI !== null && Math.abs(curI - gateAtI) < 1.1) continue;
          g.fillStyle = "#a8834c"; g.fillRect(Math.round(x), Math.round(y - 10), 1, 2);
          g.fillStyle = "#8a6a3a"; g.fillRect(Math.round(x), Math.round(y - 5), 1, 2);
          if (q % TW === 0) {
            g.fillStyle = "#8a6a3a"; g.fillRect(Math.round(x) - 1, Math.round(y - 13), 3, 13);
            g.fillStyle = "#c9a86a"; g.fillRect(Math.round(x) - 1, Math.round(y - 13), 3, 2);
            g.fillStyle = shadeHex("#8a6a3a", 0.7); g.fillRect(Math.round(x) + 1, Math.round(y - 11), 1, 11);
          }
        }
      };
      const bI = p.i0 - 0.5, bJ = p.j0 - 0.5, sz = p.size;
      drawRailEdge(bI, bJ, true, sz, null);
      drawRailEdge(bI, bJ, false, sz, null);
      drawRailEdge(bI, bJ + sz, true, sz, p.bi);
      drawRailEdge(bI + sz, bJ, false, sz, null);
    });
    pond.forEach(([i, j]) => fillTile(g, i, j, ox, oy, "#c9b98c", "#d4c498"));
    pond.forEach(([i, j]) => {
      fillDia(g, ox + isoX(i, j), oy + isoY(i, j) - TH / 2 + 2, TH - 4, "#3d94c4", "#4aa8d8");
    });
    pond.forEach(([i, j], k) => {
      const px = ox + isoX(i, j), py = oy + isoY(i, j);
      if (k % 3 === 0) { g.fillStyle = "#9fd8f0"; g.fillRect(px - 6, py - 2, 5, 1); }
      if (k % 4 === 1) { g.fillStyle = "#ffffff"; g.fillRect(px + 3, py + 1, 2, 1); }
    });
    if (unlocked >= 3) {
      const cols2 = ["#ff8fb3", "#ffd166", "#c4b5fd", "#ff8f6b", "#ffffff", "#93c5fd"];
      for (let k = 0; k < 14; k++) {
        const i = 3 + (k % 4), j = N - 4 + Math.floor(k / 7);
        const px = ox + isoX(i, j) + ((k * 7) % 13) - 6, py = oy + isoY(i, j) + ((k * 5) % 6) - 3;
        g.fillStyle = "#2f7a3d"; g.fillRect(px, py + 2, 1, 3);
        g.fillStyle = cols2[k % 6]; g.fillRect(px - 1, py, 3, 3);
        g.fillStyle = "#fff2c2"; g.fillRect(px, py + 1, 1, 1);
      }
    }

    /* ---- そびえ物スプライト ---- */
    const buildCache = new Map();
    const buildingFor = (s, phase) => {
      const p = plots.get(s.id);
      const key = `${s.id}:${stageOf(calcLevel(s)).no}:${phase}:${s.shiny ? "S" : ""}:${p ? p.boost : 1}`;
      if (!buildCache.has(key)) buildCache.set(key, buildingCanvas(s, phase, season, p ? p.boost : 1));
      return buildCache.get(key);
    };
    const rngTree = mulberry32(hashStr("kabu-tree-detail"));
    const treeSprites = trees.map((tr) => ({ ...treeCanvas(season, tr.big, rngTree), i: tr.i, j: tr.j }));
    let signSprite = null;
    if (unlocked >= 6) {
      const cv = document.createElement("canvas");
      cv.width = 92; cv.height = 52;
      const c2 = cv.getContext("2d");
      c2.fillStyle = "#8a6a3a"; c2.fillRect(20, 24, 6, 28); c2.fillRect(66, 24, 6, 28);
      c2.fillStyle = "#a8834c"; c2.fillRect(4, 4, 84, 24);
      c2.fillStyle = "#5c4526"; c2.fillRect(6, 6, 80, 20);
      c2.fillStyle = "#ffe9c9"; c2.font = "bold 13px sans-serif"; c2.textAlign = "center";
      c2.fillText("KABU牧場", 46, 21);
      signSprite = { cv, anchorX: 46, anchorY: 51, i: Math.floor(N / 2), j: N - 2.2 };
    }
    let statueSprite = null;
    if (unlocked >= ACHIEVEMENTS.length) {
      const cv = document.createElement("canvas");
      cv.width = 36; cv.height = 44;
      const c2 = cv.getContext("2d");
      c2.fillStyle = "#9ca3af"; c2.fillRect(6, 34, 24, 10);
      c2.fillStyle = "#7c8391"; c2.fillRect(6, 34, 24, 2);
      c2.fillStyle = "#ffd166"; c2.fillRect(12, 14, 12, 20); c2.fillRect(10, 6, 16, 12);
      c2.fillStyle = "#fff2c2"; c2.fillRect(12, 8, 4, 4);
      statueSprite = { cv, anchorX: 18, anchorY: 43, i: 2.2, j: N - 3 };
    }
    const torchPos = unlocked >= 9 ? [{ i: Math.floor(N / 2) - 3, j: N - 3 }, { i: Math.floor(N / 2) + 3, j: N - 3 }] : [];

    /* ---- クリーチャー状態(保有=敷地 / ウォッチ=森) ---- */
    const artCache = new Map();
    const artFor = (s, sleeping) => {
      const key = `${s.id}:${sleeping ? "z" : "a"}:${s.shiny ? "S" : ""}:${stageOf(calcLevel(s)).no}:${s.evoPattern || ""}`;
      if (!artCache.has(key)) artCache.set(key, creatureArt(s, sleeping));
      return artCache.get(key);
    };
    const eventsMap = new Map();
    members.forEach((s) => eventsMap.set(s.id, upcomingEvents(s)));
    const crit = new Map();
    const randInRect = (rng2, r) => {
      for (let tries = 0; tries < 30; tries++) {
        const i = r.i0 + 0.5 + rng2() * (r.i1 - r.i0 - 1);
        const j = r.j0 + 0.5 + rng2() * (r.j1 - r.j0 - 1);
        if (walkable(i, j)) return { i, j };
      }
      return { i: (r.i0 + r.i1) / 2, j: (r.j0 + r.j1) / 2 };
    };
    members.forEach((s) => {
      const rng2 = mulberry32(hashStr(String(s.code || s.id)) ^ 0x9e3779b9);
      const p = plots.get(s.id);
      if (p) {
        const home = { i: p.bi, j: p.j0 + p.footTiles + 0.6 };
        crit.set(s.id, {
          kind: "plot", plot: p, home,
          field: { i: p.field.i0 + 0.8, j: p.field.j0 + 0.8 },
          i: home.i, j: home.j, ti: home.i, tj: home.j, legs: [],
          state: "idle", stateUntil: 0, bob: rng2() * 6.28, rng: rng2, workTickAt: 0,
        });
      } else {
        const home = randInRect(rng2, forest);
        crit.set(s.id, {
          kind: "forest", home,
          i: home.i, j: home.j, ti: home.i, tj: home.j, legs: [],
          state: "idle", stateUntil: 0, bob: rng2() * 6.28, rng: rng2, workTickAt: 0,
        });
      }
    });
    const randInPlot = (c) => randInRect(c.rng, { i0: c.plot.i0, i1: c.plot.i0 + c.plot.size, j0: c.plot.j0, j1: c.plot.j0 + c.plot.size });

    /* ---- 演出キュー ---- */
    const bubbles = [];
    const emotes = [];
    let nextBubbleAt = performance.now() + 3000;
    const lastGreet = new Map();
    const NPART = rainy ? 110 : 60;
    const parts = [];
    const pKind = rainy ? (season.key === "winter" ? "snowstorm" : "rain") : (season.particle ? season.particle.kind : null);
    if (pKind && !reduced) {
      for (let k = 0; k < NPART; k++) parts.push({ x: Math.random(), y: Math.random(), v: 0.6 + Math.random() * 0.8, ph: Math.random() * 6.28 });
    }
    const starRng = mulberry32(hashStr("kabu-stars"));
    const starPts = Array.from({ length: 60 }, () => ({ x: starRng(), y: starRng() * 0.5, tw: starRng() * 6.28 }));

    /* ---- ビューポート ---- */
    let cw = 0, chh = 0, dpr = 1;
    const pan = { x: worldW / 2 - TW * 2, y: oy + (Math.min(j0, N) * TH) / 2 };
    const clampPan = () => {
      const z = zoomRef.current;
      pan.x = Math.max(cw / (2 * z) - 60, Math.min(worldW - cw / (2 * z) + 60, pan.x));
      pan.y = Math.max(chh / (2 * z) - 40, Math.min(worldH - chh / (2 * z) + 40, pan.y));
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

    /* ---- 行動AI ---- */
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
        const r = c.rng();
        let target = null;
        if (c.kind === "plot") {
          const holding = s.status === "hold";
          if (holding && r < 0.45) target = { i: c.field.i + (c.rng() - 0.5), j: c.field.j + (c.rng() - 0.5) * 0.8, then: "work" };
          else if (r < 0.7) target = { ...randInPlot(c), then: "idle" };
          else if (r < 0.85) {
            const p = c.plot;
            target = { i: Math.max(1, Math.min(N - 2, c.home.i + (c.rng() - 0.5) * (p.size + 4))), j: p.frontJ, then: "idle" };
          } else { c.state = "idle"; c.stateUntil = now + 1500 + c.rng() * 2500; return; }
        } else {
          if (r < 0.7) target = { ...randInRect(c.rng, forest), then: "idle" };
          else { c.state = "idle"; c.stateUntil = now + 1800 + c.rng() * 3000; return; }
        }
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
        c.state = "walk";
        c.pending = target.then;
        const leg = c.legs.shift();
        c.ti = leg.i; c.tj = leg.j;
      });
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
    const CS = 1.6; // クリーチャーの表示倍率(高精細タイルに合わせる)
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

      const grd = ctx.createLinearGradient(0, 0, 0, chh);
      grd.addColorStop(0, P.sky[0]); grd.addColorStop(1, P.sky[1]);
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, cw, chh);
      if (rainy) { ctx.fillStyle = "rgba(90,100,115,.5)"; ctx.fillRect(0, 0, cw, chh); }
      if (P.stars > 0 && !rainy) {
        ctx.fillStyle = "#ffffff";
        starPts.forEach((st, k) => {
          ctx.globalAlpha = P.stars * (0.4 + 0.6 * Math.abs(Math.sin(now / 900 + st.tw)));
          ctx.fillRect(Math.round(st.x * cw), Math.round(st.y * chh), k % 5 === 0 ? 2 : 1, k % 5 === 0 ? 2 : 1);
        });
        ctx.globalAlpha = 1;
      }

      const org = toScreen(0, 0);
      ctx.drawImage(ground, Math.round(org.x), Math.round(org.y), worldW * z, worldH * z);

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
              c.stateUntil = now + (c.state === "work" ? 3500 + c.rng() * 3500 : 1500 + c.rng() * 2500);
            }
          } else {
            const step = Math.min(spd * dt, d);
            c.i += (dx / d) * step; c.j += (dy / d) * step;
          }
        }
        if (c.state === "work" && !reduced && now > c.workTickAt) {
          c.workTickAt = now + 1400 + c.rng() * 900;
          const txt = mood && mood.key === "peak" ? "✨" : mood && (mood.key === "low" || mood.key === "tired") && c.rng() < 0.5 ? "💧" : "🌱";
          emotes.push({ i: c.i, j: c.j, txt, born: now, life: 1100 });
        }
        if (c.state === "sleep" && !reduced && c.rng() < 0.004) {
          emotes.push({ i: c.i, j: c.j, txt: "💤", born: now, life: 1800 });
        }
      });

      if (!reduced && now > nextBubbleAt) {
        nextBubbleAt = now + 4500 + Math.random() * 4500;
        const awake = [...crit.entries()].filter(([, c]) => c.state !== "sleep");
        if (awake.length > 0 && bubbles.length < 2) {
          const [id] = awake[Math.floor(Math.random() * awake.length)];
          const s = stocksRef.current.find((x) => x.id === id);
          if (s) {
            const pool = bubblePool(s, moods[id], phase, eventsMap.get(id));
            bubbles.push({ id, text: pool[Math.floor(Math.random() * pool.length)], until: now + 3400 });
          }
        }
      }
      for (let k = bubbles.length - 1; k >= 0; k--) if (now > bubbles[k].until) bubbles.splice(k, 1);

      const sprites = [];
      holds.forEach((s) => {
        const p = plots.get(s.id);
        if (!p) return;
        const b = buildingFor(s, phase);
        const anchorI = p.i0 + p.footTiles / 2 + 0.3, anchorJ = p.j0 + p.footTiles / 2 + 0.3;
        sprites.push({ depth: anchorI + anchorJ, cv: b.cv, ax: b.anchorX, ay: b.anchorY, topY: b.topY, wi: anchorI, wj: anchorJ, kind: "bld", id: s.id });
      });
      treeSprites.forEach((tr) => sprites.push({ depth: tr.i + tr.j, cv: tr.cv, ax: tr.anchorX, ay: tr.anchorY, wi: tr.i, wj: tr.j, kind: "tree" }));
      if (signSprite) sprites.push({ depth: signSprite.i + signSprite.j, cv: signSprite.cv, ax: signSprite.anchorX, ay: signSprite.anchorY, wi: signSprite.i, wj: signSprite.j, kind: "sign" });
      if (statueSprite) sprites.push({ depth: statueSprite.i + statueSprite.j, cv: statueSprite.cv, ax: statueSprite.anchorX, ay: statueSprite.anchorY, wi: statueSprite.i, wj: statueSprite.j, kind: "statue" });
      crit.forEach((c, id) => {
        const s = stocksRef.current.find((x) => x.id === id);
        if (s) sprites.push({ depth: c.i + c.j + 0.01, kind: "crit", id, c, s });
      });
      sprites.sort((a, b) => a.depth - b.depth);

      const hitRects = [];
      sprites.forEach((sp) => {
        if (sp.kind === "crit") {
          const { c, s, id } = sp;
          const tier = moveTierOf(s);
          const sleeping = tier === 3;
          const art = artFor(s, sleeping);
          const scr = toScreen(ox + isoX(c.i, c.j), oy + isoY(c.i, c.j));
          const mood = moods[id];
          const walking = c.state === "walk";
          const hopAmp = tier === 0 ? 6 : tier === 1 ? 3 : 0;
          const bob = !reduced && walking && hopAmp ? Math.abs(Math.sin(now / 130 + c.bob)) * hopAmp * z : 0;
          const workBob = !reduced && c.state === "work" ? Math.abs(Math.sin(now / 200 + c.bob)) * 3 * z : 0;
          const squish = mood && mood.key === "tired" ? 0.94 : 1;
          const w = art.width * z * CS, h = art.height * z * CS * squish;
          ctx.fillStyle = "rgba(0,0,0,.25)";
          ctx.beginPath();
          ctx.ellipse(scr.x, scr.y, w * 0.32, 3.2 * z, 0, 0, 6.29);
          ctx.fill();
          ctx.drawImage(art, Math.round(scr.x - w / 2), Math.round(scr.y - h + 3 - bob - workBob), Math.round(w), Math.round(h));
          if (sleeping) {
            ctx.font = `${Math.round(11 * z)}px sans-serif`;
            ctx.fillText("💤", scr.x + w * 0.3, scr.y - h);
          }
          const nm = (s.shiny ? "✨" : "") + clip(s.name, 8);
          ctx.font = "bold 10px sans-serif";
          const tw2 = ctx.measureText(nm).width + 8;
          ctx.fillStyle = "rgba(14,17,34,.72)";
          ctx.fillRect(Math.round(scr.x - tw2 / 2), Math.round(scr.y + 4), Math.round(tw2), 13);
          ctx.fillStyle = "#fff";
          ctx.textAlign = "center";
          ctx.fillText(nm, Math.round(scr.x), Math.round(scr.y + 14));
          ctx.textAlign = "start";
          hitRects.push({ x: scr.x - Math.max(w, tw2) / 2, y: scr.y - h - 4, w: Math.max(w, tw2), h: h + 22, id });
          c.scr = { x: scr.x, y: scr.y - h - bob - workBob };
        } else {
          const scr = toScreen(ox + isoX(sp.wi, sp.wj), oy + isoY(sp.wi, sp.wj));
          const dw = sp.cv.width * z, dh = sp.cv.height * z;
          ctx.drawImage(sp.cv, Math.round(scr.x - sp.ax * z), Math.round(scr.y - sp.ay * z), dw, dh);
          if (sp.kind === "bld") {
            hitRects.push({ x: scr.x - sp.ax * z, y: scr.y - sp.ay * z, w: dw, h: dh, id: sp.id, low: true });
            const evs = eventsMap.get(sp.id);
            if (evs && evs.length > 0) {
              const bobY = reduced ? 0 : Math.sin(now / 400) * 3 * z;
              const roofTop = scr.y - (sp.ay - sp.topY) * z;
              ctx.font = `${Math.round(12 * z)}px sans-serif`;
              ctx.textAlign = "center";
              ctx.fillText("🗓", scr.x, roofTop - 6 * z + bobY);
              ctx.textAlign = "start";
            }
          }
        }
      });

      torchPos.forEach((tp, k) => {
        const scr = toScreen(ox + isoX(tp.i, tp.j), oy + isoY(tp.i, tp.j));
        ctx.fillStyle = "#8a6a3a";
        ctx.fillRect(Math.round(scr.x - z), Math.round(scr.y - 20 * z), 2 * z, 20 * z);
        ctx.fillStyle = Math.sin(now / 90 + k * 2) > 0 ? "#ffb54d" : "#ff8f3d";
        ctx.fillRect(Math.round(scr.x - 3 * z), Math.round(scr.y - 26 * z), 6 * z, 6 * z);
        ctx.fillStyle = "#fff2c2";
        ctx.fillRect(Math.round(scr.x - z), Math.round(scr.y - 25 * z), 2 * z, 2 * z);
      });

      if (P.tint) {
        ctx.globalCompositeOperation = "multiply";
        ctx.fillStyle = P.tint;
        ctx.fillRect(0, 0, cw, chh);
        ctx.globalCompositeOperation = "source-over";
      }
      if (phase !== "day") {
        ctx.globalCompositeOperation = "lighter";
        torchPos.forEach((tp) => {
          const scr = toScreen(ox + isoX(tp.i, tp.j), oy + isoY(tp.i, tp.j));
          const gr2 = ctx.createRadialGradient(scr.x, scr.y - 24 * z, 2, scr.x, scr.y - 24 * z, 52 * z);
          gr2.addColorStop(0, "rgba(255,180,80,.30)");
          gr2.addColorStop(1, "rgba(255,180,80,0)");
          ctx.fillStyle = gr2;
          ctx.fillRect(scr.x - 52 * z, scr.y - 76 * z, 104 * z, 104 * z);
        });
        ctx.globalCompositeOperation = "source-over";
      }

      if (parts.length > 0) {
        parts.forEach((p) => {
          if (pKind === "rain") { p.y += p.v * dt * 1.6; p.x += dt * 0.06; }
          else { p.y += p.v * dt * (pKind === "snowstorm" ? 0.28 : 0.12); p.x += Math.sin(now / 900 + p.ph) * dt * 0.05; }
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

      for (let k = emotes.length - 1; k >= 0; k--) {
        const e = emotes[k];
        const age = (now - e.born) / e.life;
        if (age >= 1) { emotes.splice(k, 1); continue; }
        const scr = toScreen(ox + isoX(e.i, e.j), oy + isoY(e.i, e.j));
        ctx.globalAlpha = 1 - age * age;
        ctx.font = `${Math.round(12 * z)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(e.txt, scr.x, scr.y - (30 + age * 14) * z * 0.55 - 20);
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

      canvas._hitRects = hitRects;
    };
    loop();

    /* ---- 操作 ---- */
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
      const wasMulti = multi, wasMoved = moved, start = down;
      down = null; multi = false;
      if (!start || wasMulti || wasMoved >= 7) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      const hits = (canvas._hitRects || []).filter((h) => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h);
      if (hits.length > 0) {
        const top = hits.find((h) => !h.low) || hits[hits.length - 1];
        onSelectRef.current(top.id);
      }
    };
    const onWheel = (e) => {
      e.preventDefault();
      const zs = [1, 2, 3];
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
    const zs = [1, 2, 3];
    const cur = zs.indexOf(zoomRef.current);
    zoomRef.current = zs[Math.max(0, Math.min(zs.length - 1, cur + dir))];
    setZoomTick((n) => n + 1);
  };

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%", height: "min(66vh, 560px)", borderRadius: 18, overflow: "hidden", border: "2px solid #8a6a3a", background: "#0d1230" }}>
      <canvas ref={canvasRef} style={{ display: "block", imageRendering: "pixelated" }} />
      <div style={{ position: "absolute", right: 10, bottom: 10, display: "flex", gap: 6 }}>
        {[["−", -1], ["＋", 1]].map(([lbl, dir]) => (
          <button key={lbl} onClick={() => zoomBtn(dir)} style={{
            all: "unset", cursor: "pointer", width: 34, height: 34, textAlign: "center", lineHeight: "34px",
            background: "#f4e7c8", color: "#4a3a1a", fontWeight: 800, fontSize: 17,
            border: "2px solid #8a6a3a", borderRadius: 8, boxShadow: "0 2px 0 #6b5228",
            opacity: (dir === -1 && zoomRef.current === 1) || (dir === 1 && zoomRef.current === 3) ? 0.4 : 1,
          }}>{lbl}</button>
        ))}
      </div>
    </div>
  );
}

/* ---- 1日ダイジェスト(カイロ風ニュースティッカー) ---- */

function DigestTicker({ items }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (items.length <= 1) return;
    const iv = setInterval(() => setIdx((i) => i + 1), 4500);
    return () => clearInterval(iv);
  }, [items.length]);
  if (items.length === 0) return null;
  const item = items[idx % items.length];
  return (
    <div style={{
      background: "#f4e7c8", border: "2px solid #8a6a3a", borderRadius: 10, boxShadow: "0 2px 0 #6b5228",
      color: "#4a3a1a", fontFamily: "'DotGothic16', monospace", fontSize: 12, padding: "6px 12px",
      marginBottom: 8, display: "flex", gap: 8, alignItems: "center", overflow: "hidden",
    }}>
      <span>📰</span>
      <span key={idx} style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", animation: "kzTickIn .5s ease" }}>
        {item}
      </span>
      {items.length > 1 && <span style={{ fontSize: 10, color: "#8a7448" }}>{(idx % items.length) + 1}/{items.length}</span>}
      <style>{`@keyframes kzTickIn { 0%{opacity:0; transform:translateY(5px)} 100%{opacity:1; transform:translateY(0)} }`}</style>
    </div>
  );
}

/* ---- 牧場ビュー ---- */

function RanchView({ stocks, activity, onSelect }) {
  const [quotes, setQuotes] = useState({});
  const phase = PHASE_INFO[dayPhase()];
  const season = seasonOf(new Date().getMonth() + 1);
  const rainy = isRainyToday();
  const actives = stocks.filter((s) => s.status !== "sold");

  useEffect(() => {
    let alive = true;
    fetchHeldQuotes(stocks).then((m) => { if (alive) setQuotes(m); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stocks.map((s) => `${s.id}:${s.shares}:${s.avgPrice}:${s.status}`).join("|")]);

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

  const digest = useMemo(() => {
    const items = [];
    actives.forEach((s) => {
      upcomingEvents(s).forEach((ev) => {
        items.push(`🗓 ${ev.m}/${ev.d}${ev.days === 0 ? "(きょう)" : `(あと${ev.days}日)`} ${s.name}: ${ev.text}`);
      });
    });
    dueForCheck(stocks).forEach((s) => items.push(`🔔 ${s.name}のトリガー点検が30日以上あいています`));
    actives.forEach((s) => {
      const f = freshInfo(s);
      if (f && f.days !== null && f.days > 90) items.push(`🥀 ${s.name}は${f.days}日調査していません(おひるね中)`);
    });
    actives.forEach((s) => {
      const mood = moodOf(pnlOf(s, quotes[s.id]));
      if (mood && mood.key === "peak") items.push(`✨ ${s.name}はぜっこうちょうです`);
      if (mood && mood.key === "tired") items.push(`💧 ${s.name}はおつかれぎみです`);
    });
    if (current > 0) items.push(`🔥 研究れんぞく${current}日目！`);
    if (items.length === 0) items.push("☀️ きょうもぼくじょうは平和です");
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stocks, quotes, current]);

  const panel = {
    background: "#f4e7c8", border: "2px solid #8a6a3a", borderRadius: 10,
    color: "#4a3a1a", fontFamily: "'DotGothic16', monospace", fontSize: 12,
    padding: "6px 12px", boxShadow: "0 2px 0 #6b5228",
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
        <div style={panel}>{d.getMonth() + 1}月{d.getDate()}日・{season.label}・{phase.label}{rainy ? "・☔" : ""}</div>
        <div style={panel}>なかま {actives.length}匹</div>
        <div style={{ ...panel, marginLeft: "auto" }}>🌱きょうの研究 {todayN}件{current > 0 ? `・🔥${current}日` : ""}</div>
      </div>

      <DigestTicker items={digest} />

      {actives.length === 0 ? (
        <div style={{ textAlign: "center", padding: "50px 20px", color: "#5b6284", border: "2px dashed #2a3050", borderRadius: 16, fontSize: 13 }}>
          <div style={{ fontSize: 34, marginBottom: 8 }}>🏞</div>
          まだなかまがいません。図鑑で銘柄をゲットすると牧場に研究所が建ちます
        </div>
      ) : (
        <RanchKairo stocks={stocks} quotes={quotes} onSelect={onSelect} />
      )}

      {Object.keys(totals).length > 0 && (
        <div style={{ ...panel, marginTop: 8, display: "flex", gap: 14, flexWrap: "wrap" }}>
          <span>💼 ほゆう</span>
          {Object.entries(totals).map(([cur, t]) => (
            <span key={cur}>
              時価 {fmtMoney(t.value, cur)}（含み損益 {fmtMoney(t.pnl, cur, true)}・{fmtPct((t.pnl / (t.value - t.pnl)) * 100)}）
            </span>
          ))}
        </div>
      )}

      <div style={{ fontSize: 10.5, color: "#5b6284", marginTop: 8, lineHeight: 1.7 }}>
        ホカク済みの銘柄は柵つきの敷地でくらし、ウォッチ中の銘柄は東側「やせいの森」の木々のあいだを歩いています。
        研究所は研究ステージで形が変わり（テント→小屋→ラボ→塔つき御殿）、含み損益の事実で敷地ごと大きさが変わります
        （含み益=大きく・含み損=小さめ）。はたけの作物は調査記録の件数で育ち、メモの日付（決算日など）が近づくと🗓が浮かびます。
        <b style={{ color: "#8b93b8" }}>ドラッグで移動、＋−/ホイールでズーム、タップで詳細</b>。
        大きさ・ようす・数値はすべて事実の参考表示で、売買推奨ではありません。
      </div>
    </div>
  );
}

export { dayPhase, PHASE_INFO, seasonOf, isRainyToday, RanchView };
