/* 牧場モード: カイロソフト風2Dアイソメぼくじょう
   - 銘柄ごとに柵で区切られた「敷地」があり、クリーチャーは基本自分の敷地内で暮らす
   - 研究所は研究ステージで形が変わる: ST1テント→ST2小屋→ST3ラボ(別館+アンテナ)→ST4塔つき御殿
   - 含み損益(事実)で研究所と敷地の大きさが変わる: 含み損=すこし小さく、含み益=青天井で拡大
     ※大きさ・ようすは事実の写像であって売買推奨ではない(CLAUDE.md不変条件5の承認済み例外)
   - はたけの作物は調査記録の件数で育つ(かざりのみ)
   - クイックメモの日付(「決算は8/8」等)を拾って🗓リマインド(自分が書いた予定の事実のみ)
   - 吹き出しはオーナー自身のメモ(仮説・わざ・トリガー)の復習
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
  if (m >= 3 && m <= 5)  return { key: "spring", label: "🌸はる", g1: "#5aa860", g2: "#56a25c", wild: "#79b364", leaf: "#e58fb4", trunk: "#8a6242", particle: { kind: "petal" } };
  if (m >= 6 && m <= 8)  return { key: "summer", label: "🌻なつ", g1: "#4d9e55", g2: "#489850", wild: "#69a957", leaf: "#2e6e3c", trunk: "#7a5638", particle: null };
  if (m >= 9 && m <= 11) return { key: "autumn", label: "🍁あき", g1: "#8a944c", g2: "#859048", wild: "#a09549", leaf: "#c2622d", trunk: "#7a5638", particle: { kind: "leaf" } };
  return { key: "winter", label: "⛄ふゆ", g1: "#c2cfc9", g2: "#bcc9c3", wild: "#aebfb7", leaf: "#3d6e54", trunk: "#6b4e38", particle: { kind: "snow" } };
};
const isRainyToday = () => hashStr(today()) % 10 < 3; // 3割の日は雨(冬は雪が強まる)

/* ---- アイソメ座標系(アートピクセル単位)。タイル: 幅24×高さ12のひし形 ---- */
const TW = 24, TH = 12;
const isoX = (i, j) => (i - j) * (TW / 2);
const isoY = (i, j) => (i + j) * (TH / 2);

/* ひし形を1pxの横帯で塗る(パス塗りのにじみを避けてカクカクに保つ) */
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

const shadeHex = (hex, f) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
};

/* ---- 含み損益→大きさ(事実の写像。0.1刻みに量子化してシーンの作り直しを抑える) ----
   含み損: すこし小さくなる(下限0.75) / 含み益: +50%で2倍…と青天井で大きくなる */
const boostOf = (pnl) => {
  if (!pnl) return 1;
  if (pnl.pct <= -15) return 0.75;
  if (pnl.pct <= -3) return 0.85;
  if (pnl.pct < 3) return 1;
  return 1 + Math.round((pnl.pct / 50) * 10) / 10;
};

/* ---- 研究所の描画。ステージで形が変わり、boostで大きさが変わる ---- */

const BUILD_DIMS = [null,
  { hw: 9,  wall: 4,  roof: 8 },   // ST1 テント(壁なし・屋根が地面まで)
  { hw: 11, wall: 8,  roof: 7 },   // ST2 小屋
  { hw: 13, wall: 10, roof: 8 },   // ST3 ラボ(別館+アンテナ)
  { hw: 14, wall: 13, roof: 7 },   // ST4 御殿(塔つき)
];

const scaledDims = (stage, f) => {
  const b = BUILD_DIMS[stage];
  return {
    hw: Math.max(6, Math.round(b.hw * f)),
    wall: Math.max(3, Math.round(b.wall * f)),
    roof: Math.max(3, Math.round(b.roof * f)),
  };
};

/* 建物の敷地(タイル数)。boostで土地ごと広がる */
const plotSizeOf = (stage, f) => {
  const { hw } = scaledDims(stage, f);
  const footTiles = Math.max(2, Math.ceil((hw * 2) / TW) + 1);
  return { footTiles, size: footTiles + 5 };
};

function buildingCanvas(stock, phase, season, f) {
  const stage = stageOf(calcLevel(stock)).no;
  const { hw, wall, roof } = scaledDims(stage, f);
  const t = TYPES[stock.type] || TYPES.metal;
  const W = hw * 4 + 24;
  const H = wall * 2 + roof * 2 + hw * 2 + 40;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  const cx = Math.floor(W / 2), baseY = H - 2;
  const lit = phase !== "day";

  const wallR = stage === 1 ? "#d8c49a" : "#ead9b5";
  const wallL = shadeHex(wallR[0] === "#" ? wallR : "#ead9b5", 0.72);
  const roofR = t.color, roofL = shadeHex(t.color, 0.68);

  /* 部品: 壁ボックス(南角cx/baseYから左右へ) */
  const box = (bx, by, bhw, bwall, wr, wl) => {
    for (let x = 0; x <= bhw; x++) {
      const yBot = by - Math.round(x / 2);
      ctx.fillStyle = wr; ctx.fillRect(bx + x, yBot - bwall, 1, bwall);
      ctx.fillStyle = wl; ctx.fillRect(bx - x, yBot - bwall, 1, bwall);
    }
    ctx.fillStyle = shadeHex("#ead9b5", 0.55);
    ctx.fillRect(bx, by - bwall, 1, bwall);
  };
  /* 部品: ピラミッド屋根(底ひし形の中心yを基準に積み上げ) */
  const pyramid = (bx, centerY, bhw, broof, cl, cr, snow) => {
    for (let l = 0; l <= broof; l++) {
      const hwl = Math.max(2, Math.round(bhw * (1 - l / (broof + 1))));
      const top = Math.round(centerY - l - hwl / 2);
      const isSnow = snow && l >= Math.round(broof * 0.45);
      fillDia(ctx, bx, top, hwl, isSnow ? "#dfe9ee" : cl, isSnow ? "#f4f9fc" : cr);
    }
  };
  /* 部品: 平屋根(ひし形スラブ) */
  const slab = (bx, centerY, bhw, cl, cr) => {
    fillDia(ctx, bx, Math.round(centerY - bhw / 2 - 2), bhw, cl, cr);
    fillDia(ctx, bx, Math.round(centerY - bhw / 2), bhw, shadeHex("#ead9b5", 0.6), shadeHex("#ead9b5", 0.8));
  };
  const door = (bx, by, s) => {
    ctx.fillStyle = "#6b4a2b";
    const w2 = Math.max(3, Math.round(4 * s)), h2 = Math.max(5, Math.round(7 * s)), off = Math.max(2, Math.round(2 * s));
    for (let x = off; x <= off + w2; x++) ctx.fillRect(bx + x, by - Math.round(x / 2) - h2, 1, h2);
  };
  const win = (bx, by, fx, fy, mirror) => {
    const wc = lit ? "#ffd166" : "#9cc3de";
    ctx.fillStyle = wc;
    ctx.fillRect(bx + fx, by - Math.round(fx / 2) - fy - 3, 3, 3);
    ctx.fillStyle = lit ? "#fff2c2" : "#c8e2f2";
    ctx.fillRect(bx + fx, by - Math.round(fx / 2) - fy - 3, 1, 1);
    if (mirror) {
      ctx.fillStyle = shadeHex(lit ? "#ffd166" : "#9cc3de", 0.8);
      ctx.fillRect(bx - fx - 3, by - Math.round(fx / 2) - fy - 3, 3, 3);
    }
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
    ctx.fillStyle = "#8a6a3a"; ctx.fillRect(bx, topY - 9, 1, 10);
    ctx.fillStyle = t.color; ctx.fillRect(bx + 1, topY - 9, 6, 3);
  };

  if (stage === 1) {
    /* ST1: テント(屋根が地面まで)+立てふだ */
    pyramid(cx, baseY - hw / 2, hw, wall + roof, roofL, roofR, season.key === "winter");
    ctx.fillStyle = "#3a2f1c"; // 入口
    for (let k = 0; k < Math.max(4, Math.round(hw * 0.4)); k++) {
      const w2 = Math.max(1, Math.round((Math.max(4, hw * 0.4) - k) * 0.9));
      ctx.fillRect(cx - w2, baseY - hw / 2 - k - 2, w2 * 2, 1);
    }
    ctx.fillStyle = "#8a6a3a"; ctx.fillRect(cx - hw - 6, baseY - 8, 2, 8); // 立てふだ
    ctx.fillStyle = "#a8834c"; ctx.fillRect(cx - hw - 10, baseY - 13, 10, 6);
  } else if (stage === 2) {
    /* ST2: 小屋 */
    box(cx, baseY, hw, wall, wallR, wallL);
    door(cx, baseY, f);
    win(cx, baseY, Math.round(hw * 0.6), Math.round(wall * 0.45), false);
    pyramid(cx, baseY - wall - hw / 2, hw, roof, roofL, roofR, season.key === "winter");
  } else if (stage === 3) {
    /* ST3: ラボ = 別館(平屋根)を背中側に + 本館 + アンテナ */
    const hw2 = Math.max(5, Math.round(hw * 0.6)), wall2 = Math.max(3, Math.round(wall * 0.8));
    const ax = cx + Math.round(hw * 0.9), ay = baseY - Math.round(hw * 0.45);
    box(ax, ay, hw2, wall2, wallR, wallL);
    slab(ax, ay - wall2, hw2, shadeHex(t.color, 0.5), shadeHex(t.color, 0.62));
    win(ax, ay, Math.round(hw2 * 0.4), Math.round(wall2 * 0.4), false);
    box(cx, baseY, hw, wall, wallR, wallL);
    door(cx, baseY, f);
    win(cx, baseY, Math.round(hw * 0.5), Math.round(wall * 0.45), true);
    win(cx, baseY, Math.round(hw * 0.8), Math.round(wall * 0.45), true);
    pyramid(cx, baseY - wall - hw / 2, hw, roof, roofL, roofR, season.key === "winter");
    const apexY = baseY - wall - hw / 2 - roof - 2; // アンテナ
    ctx.fillStyle = "#8b93a8"; ctx.fillRect(cx, apexY - 6, 1, 7);
    ctx.fillStyle = t.color; ctx.fillRect(cx - 1, apexY - 8, 3, 3);
    ctx.fillStyle = "#ffffff"; ctx.fillRect(cx, apexY - 8, 1, 1);
  } else {
    /* ST4: 御殿 = 本館(平屋根)+塔+旗+金の帯 */
    box(cx, baseY, hw, wall, wallR, wallL);
    door(cx, baseY, f);
    win(cx, baseY, Math.round(hw * 0.45), Math.round(wall * 0.3), true);
    win(cx, baseY, Math.round(hw * 0.75), Math.round(wall * 0.3), true);
    win(cx, baseY, Math.round(hw * 0.45), Math.round(wall * 0.65), true);
    win(cx, baseY, Math.round(hw * 0.75), Math.round(wall * 0.65), true);
    goldTrim(cx, baseY, hw, wall);
    slab(cx, baseY - wall, hw, shadeHex(t.color, 0.5), shadeHex(t.color, 0.62));
    const hw2 = Math.max(6, Math.round(hw * 0.55)), wall2 = Math.max(4, Math.round(wall * 0.6));
    const towerBase = baseY - wall - Math.round(hw / 2) + Math.round(hw2 / 2);
    box(cx, towerBase, hw2, wall2, wallR, wallL);
    win(cx, towerBase, Math.round(hw2 * 0.4), Math.round(wall2 * 0.4), true);
    goldTrim(cx, towerBase, hw2, wall2);
    pyramid(cx, towerBase - wall2 - hw2 / 2, hw2, Math.max(4, Math.round(roof * 0.8)), roofL, roofR, season.key === "winter");
    flag(cx, towerBase - wall2 - hw2 / 2 - Math.max(4, Math.round(roof * 0.8)) - 2);
  }

  if (stock.shiny) { // 色違い持ちの研究所は✨つき
    ctx.fillStyle = "#ffffff"; ctx.fillRect(cx + Math.round(hw * 0.3), baseY - wall - hw - 2, 1, 1);
    ctx.fillStyle = "#ffd166"; ctx.fillRect(cx - Math.round(hw * 0.4), baseY - wall - Math.round(hw * 0.6), 1, 1);
  }
  // 屋根のてっぺん(実際に描かれた最上行)を測る: 🗓アイコンの位置決めに使う
  let topY = 0;
  const img = ctx.getImageData(0, 0, W, H).data;
  outer: for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (img[(y * W + x) * 4 + 3] > 0) { topY = y; break outer; }
    }
  }
  return { cv, anchorX: cx, anchorY: baseY, topY };
}

/* ---- 木 ---- */
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
    const hw = Math.max(1, Math.round((10 * s) * Math.sin(Math.PI * (0.15 + rel * 0.85))));
    const y = H - Math.round(9 * s) - l;
    ctx.fillStyle = leafL; ctx.fillRect(cx - hw, y, hw, 1);
    ctx.fillStyle = season.leaf; ctx.fillRect(cx, y, hw, 1);
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

/* クリーチャーのドット絵(1セル=1px)。ズームに合わせて整数倍で拡大 */
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

/* 吹き出しのセリフ候補: オーナー自身のメモが素材。🗓予定は2回入れて出やすく */
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
  const zoomRef = useRef(typeof window !== "undefined" && window.innerWidth >= 900 ? 3 : 2);
  const [, setZoomTick] = useState(0);
  const reduced = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const actives = stocks.filter((s) => s.status !== "sold");
  // シーンの作り直しが必要な変化だけをキーに(位置・吹き出しは保持)。
  // boost(含み損益の大きさ)とnoteCount(はたけの実り)は地形に効くため含める
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

    /* ---- 敷地レイアウト: 銘柄ごとの区画を3列で敷き詰める(大きさは損益boostで可変) ---- */
    const ordered = [...members].sort((a, b) => (a.no || 0) - (b.no || 0));
    const plots = new Map(); // stockId -> {i0, j0, size, footTiles, bi, bj, frontJ, field}
    let j0 = 2, maxI = 0;
    for (let r = 0; r * 3 < ordered.length; r++) {
      const row = ordered.slice(r * 3, r * 3 + 3);
      const infos = row.map((s) => {
        const f = boostOf(pnlOf(s, quotesRef.current[s.id]));
        return { s, f, ...plotSizeOf(stageOf(calcLevel(s)).no, f) };
      });
      const rowH = Math.max(...infos.map((p) => p.size));
      let i0 = 2;
      infos.forEach((p) => {
        const bi = i0 + Math.floor(p.footTiles / 2) + 0.5; // 研究所は敷地の北寄り
        const bj = j0 + Math.floor(p.footTiles / 2) + 0.5;
        plots.set(p.s.id, {
          i0, j0, size: p.size, footTiles: p.footTiles, boost: p.f, bi, bj,
          frontJ: j0 + rowH + 0.5, // 敷地の前のみち
          field: { i0: i0 + p.footTiles + 1, j0, w: Math.min(3, 2 + Math.floor((p.f - 1) * 2)), h: 2 },
        });
        i0 += p.size + 1;
      });
      maxI = Math.max(maxI, i0);
      j0 += rowH + 2; // +1=みち +1=すきま
    }
    const N = Math.max(20, maxI + 8, j0 + 6);

    // 池(敷地の東側)・木
    const pond = [];
    for (let i = N - 7; i <= N - 3; i++) {
      for (let j = 2; j <= 5; j++) {
        if (Math.hypot(i - (N - 5), j - 3.5) < 2.6) pond.push([i, j]);
      }
    }
    const inPlot = (i, j, margin = 0) =>
      [...plots.values()].some((p) => i >= p.i0 - margin && i < p.i0 + p.size + margin && j >= p.j0 - margin && j < p.j0 + p.size + margin);
    const rngMap = mulberry32(hashStr("kabu-ranch-map"));
    const trees = [];
    for (let k = 0; k < 14; k++) {
      const edge = Math.floor(rngMap() * 4);
      const p = 1 + Math.floor(rngMap() * (N - 2));
      const pos = edge === 0 ? [p, 0] : edge === 1 ? [0, p] : edge === 2 ? [p, N - 1] : [N - 1, p];
      if (!inPlot(pos[0], pos[1], 1)) trees.push({ i: pos[0], j: pos[1], big: rngMap() < 0.4 });
    }
    for (let k = 0; k < 8; k++) {
      for (let t2 = 0; t2 < 20; t2++) {
        const i = 2 + Math.floor(rngMap() * (N - 4)), j = 2 + Math.floor(rngMap() * (N - 4));
        if (inPlot(i, j, 1) || pond.some(([pi, pj]) => Math.hypot(pi - i, pj - j) < 2.4)) continue;
        trees.push({ i, j, big: rngMap() < 0.3 });
        break;
      }
    }

    // 通行不可(研究所の足元・池・木)
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

    const oy = 60;
    const ox = (N - 1) * (TW / 2) + TW;
    const worldW = (N - 1) * TW + TW * 2;
    const worldH = (N - 1) * TH + oy + 40;

    /* ---- 静的レイヤー: 野原(wild)→敷地の芝→みち→はたけ→池→柵 ---- */
    const ground = document.createElement("canvas");
    ground.width = worldW; ground.height = worldH;
    const g = ground.getContext("2d");
    const rngTuft = mulberry32(hashStr("kabu-ranch-tuft"));
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const inside = inPlot(i, j);
        // shadeHexは#hex専用なので、必ず元のhex色から一発で作る(rgb文字列を渡すと無効色=前の色が残る)
        const baseHex = inside ? ((i + j) % 2 === 0 ? season.g1 : season.g2) : season.wild;
        const dim = !inside && (i + j) % 2 === 1 ? 0.96 : 1;
        fillTile(g, i, j, ox, oy, shadeHex(baseHex, 0.97 * dim), dim === 1 ? baseHex : shadeHex(baseHex, dim));
        if (rngTuft() < 0.12) {
          g.fillStyle = shadeHex(baseHex, 0.82);
          g.fillRect(ox + isoX(i, j) - 2, oy + isoY(i, j) - 2, 2, 1);
          g.fillRect(ox + isoX(i, j) + 3, oy + isoY(i, j) + 1, 2, 1);
        }
      }
    }
    plots.forEach((p, id) => {
      const s = stocksRef.current.find((x) => x.id === id);
      // 敷地の前のみち(敷地の幅ぶん)
      for (let i = p.i0 - 1; i <= p.i0 + p.size; i++) fillTile(g, i, Math.floor(p.frontJ), ox, oy, "#d0ba8e", "#d8c49a");
      // 研究所の足元の石だたみ
      for (let di = -1; di <= p.footTiles; di++) for (let dj = -1; dj <= p.footTiles; dj++) {
        fillTile(g, p.i0 + di, p.j0 + dj, ox, oy, "#c1bba9", "#c8c2b0");
      }
      // はたけ(保有銘柄のみ)。作物は調査記録の件数で育つ(かざり)
      if (s && s.status === "hold") {
        const nc = Math.min(6, s.noteCount || 0);
        const lvl = nc >= 6 ? 3 : nc >= 3 ? 2 : nc >= 1 ? 1 : 0;
        for (let di = 0; di < p.field.w; di++) for (let dj = 0; dj < p.field.h; dj++) {
          const fi = p.field.i0 + di, fj = p.field.j0 + dj;
          if (fi >= p.i0 + p.size) continue;
          fillTile(g, fi, fj, ox, oy, "#6b4e2c", "#7a5a33");
          const px = ox + isoX(fi, fj), py = oy + isoY(fi, fj);
          const green = season.key === "winter" ? "#9fb3ac" : "#4d9e55";
          if (lvl >= 1) { g.fillStyle = green; g.fillRect(px - 4, py - 1, 2, 2); g.fillRect(px + 3, py + 1, 2, 2); }
          if (lvl >= 2) { g.fillStyle = green; g.fillRect(px - 4, py - 3, 2, 2); g.fillRect(px + 3, py - 1, 2, 2); g.fillRect(px - 1, py, 2, 3); g.fillStyle = shadeHex(green, 1.25); g.fillRect(px - 1, py - 2, 2, 2); }
          if (lvl >= 3) { g.fillStyle = "#e8524a"; g.fillRect(px - 4, py - 4, 2, 2); g.fillRect(px + 3, py - 2, 2, 2); g.fillStyle = "#ffd166"; g.fillRect(px - 1, py - 4, 2, 2); }
        }
      }
      // 敷地の柵(角と2タイルおき)
      g.fillStyle = "#8a6a3a";
      const post = (i, j) => {
        const px = ox + isoX(i, j), py = oy + isoY(i, j);
        g.fillRect(px - 1, py - 6, 2, 6);
        g.fillStyle = "#a8834c"; g.fillRect(px - 1, py - 6, 2, 1); g.fillStyle = "#8a6a3a";
      };
      for (let d = 0; d <= p.size; d += 2) {
        post(p.i0 - 0.5 + d, p.j0 - 0.5);
        if (d > 0) post(p.i0 - 0.5, p.j0 - 0.5 + d);
        post(p.i0 - 0.5 + d, p.j0 - 0.5 + p.size);
        post(p.i0 - 0.5 + p.size, p.j0 - 0.5 + d);
      }
    });
    pond.forEach(([i, j]) => fillTile(g, i, j, ox, oy, "#3d94c4", "#4aa8d8"));
    pond.forEach(([i, j], k) => {
      if (k % 3 === 0) { g.fillStyle = "#9fd8f0"; g.fillRect(ox + isoX(i, j) - 3, oy + isoY(i, j) - 1, 3, 1); }
    });
    if (unlocked >= 3) { // 花だん
      const cols2 = ["#ff8fb3", "#ffd166", "#c4b5fd", "#ff8f6b", "#ffffff", "#93c5fd"];
      for (let k = 0; k < 12; k++) {
        const i = N - 4 + (k % 3), j = N - 5 + Math.floor(k / 6);
        const px = ox + isoX(i, j) + ((k * 7) % 11) - 5, py = oy + isoY(i, j) + ((k * 5) % 5) - 2;
        g.fillStyle = "#2f7a3d"; g.fillRect(px, py + 1, 1, 2);
        g.fillStyle = cols2[k % 6]; g.fillRect(px - 1, py - 1, 2, 2);
      }
    }

    /* ---- そびえ物スプライト(奥行きソート用) ---- */
    const buildCache = new Map();
    const buildingFor = (s, phase) => {
      const p = plots.get(s.id);
      const key = `${s.id}:${stageOf(calcLevel(s)).no}:${phase}:${s.shiny ? "S" : ""}:${p ? p.boost : 1}`;
      if (!buildCache.has(key)) buildCache.set(key, buildingCanvas(s, phase, season, p ? p.boost : 1));
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

    /* ---- クリーチャー状態(基本は自分の敷地内で暮らす) ---- */
    const artCache = new Map();
    const artFor = (s, sleeping) => {
      const key = `${s.id}:${sleeping ? "z" : "a"}:${s.shiny ? "S" : ""}:${stageOf(calcLevel(s)).no}:${s.evoPattern || ""}`;
      if (!artCache.has(key)) artCache.set(key, creatureArt(s, sleeping));
      return artCache.get(key);
    };
    const eventsMap = new Map(); // stockId -> upcomingEvents
    members.forEach((s) => eventsMap.set(s.id, upcomingEvents(s)));
    const crit = new Map();
    members.forEach((s) => {
      const p = plots.get(s.id);
      const home = { i: p.bi, j: p.j0 + p.footTiles + 0.6 }; // 研究所の前
      const rng2 = mulberry32(hashStr(String(s.code || s.id)) ^ 0x9e3779b9);
      crit.set(s.id, {
        plot: p, home,
        field: { i: p.field.i0 + 0.8, j: p.field.j0 + 0.8 },
        i: home.i, j: home.j, ti: home.i, tj: home.j, legs: [],
        state: "idle", stateUntil: 0, bob: rng2() * 6.28, rng: rng2, workTickAt: 0,
      });
    });
    const randInPlot = (c) => {
      const p = c.plot;
      for (let tries = 0; tries < 20; tries++) {
        const i = p.i0 + 0.5 + c.rng() * (p.size - 1);
        const j = p.j0 + 0.5 + c.rng() * (p.size - 1);
        if (walkable(i, j)) return { i, j };
      }
      return { ...c.home };
    };

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
    const pan = { x: worldW / 2, y: oy + (Math.min(j0, N) * TH) / 2 };
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

    /* ---- 行動AI: 敷地内で仕事・さんぽ。ときどき前のみちへ ---- */
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
        const holding = s.status === "hold";
        let target = null;
        if (holding && r < 0.45) target = { i: c.field.i + (c.rng() - 0.5), j: c.field.j + (c.rng() - 0.5) * 0.8, then: "work" };
        else if (r < (holding ? 0.7 : 0.55)) target = { ...randInPlot(c), then: "idle" };
        else if (r < 0.85) { // 前のみちへおでかけ(ご近所さんに会える)
          const p = c.plot;
          target = { i: Math.max(1, Math.min(N - 2, c.home.i + (c.rng() - 0.5) * (p.size + 4))), j: p.frontJ, then: "idle" };
        } else { c.state = "idle"; c.stateUntil = now + 1500 + c.rng() * 2500; return; }
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
      if (!reduced) { // すれ違いあいさつ
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

      /* 移動更新＋ようす演出 */
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

      /* 吹き出し */
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

      /* そびえ物＋クリーチャーの奥行きソート描画 */
      const sprites = [];
      members.forEach((s) => {
        const p = plots.get(s.id);
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
          const hopAmp = tier === 0 ? 3 : tier === 1 ? 1.5 : 0;
          const bob = !reduced && walking && hopAmp ? Math.abs(Math.sin(now / 130 + c.bob)) * hopAmp * z : 0;
          const workBob = !reduced && c.state === "work" ? Math.abs(Math.sin(now / 200 + c.bob)) * 1.5 * z : 0;
          const squish = mood && mood.key === "tired" ? 0.94 : 1;
          const w = art.width * z * 0.9, h = art.height * z * 0.9 * squish;
          ctx.fillStyle = "rgba(0,0,0,.25)";
          ctx.beginPath();
          ctx.ellipse(scr.x, scr.y, w * 0.32, 1.6 * z, 0, 0, 6.29);
          ctx.fill();
          ctx.drawImage(art, Math.round(scr.x - w / 2), Math.round(scr.y - h + 2 - bob - workBob), Math.round(w), Math.round(h));
          if (sleeping) {
            ctx.font = `${Math.round(6 * z)}px sans-serif`;
            ctx.fillText("💤", scr.x + w * 0.3, scr.y - h);
          }
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
          c.scr = { x: scr.x, y: scr.y - h - bob - workBob };
        } else {
          const scr = toScreen(ox + isoX(sp.wi, sp.wj), oy + isoY(sp.wi, sp.wj));
          const dw = sp.cv.width * z, dh = sp.cv.height * z;
          ctx.drawImage(sp.cv, Math.round(scr.x - sp.ax * z), Math.round(scr.y - sp.ay * z), dw, dh);
          if (sp.kind === "bld") {
            hitRects.push({ x: scr.x - sp.ax * z, y: scr.y - sp.ay * z, w: dw, h: dh, id: sp.id, low: true });
            // 🗓 予定が近い研究所の屋根の上に浮かぶカレンダー
            const evs = eventsMap.get(sp.id);
            if (evs && evs.length > 0) {
              const bobY = reduced ? 0 : Math.sin(now / 400) * 2 * z;
              const roofTop = scr.y - (sp.ay - sp.topY) * z; // 実際の屋根てっぺんの画面y
              ctx.font = `${Math.round(7 * z)}px sans-serif`;
              ctx.textAlign = "center";
              ctx.fillText("🗓", scr.x, roofTop - 4 * z + bobY);
              ctx.textAlign = "start";
            }
          }
        }
      });

      torchPos.forEach((tp, k) => {
        const scr = toScreen(ox + isoX(tp.i, tp.j), oy + isoY(tp.i, tp.j));
        ctx.fillStyle = "#8a6a3a";
        ctx.fillRect(Math.round(scr.x - z / 2), Math.round(scr.y - 10 * z), z, 10 * z);
        ctx.fillStyle = Math.sin(now / 90 + k * 2) > 0 ? "#ffb54d" : "#ff8f3d";
        ctx.fillRect(Math.round(scr.x - 1.5 * z), Math.round(scr.y - 13 * z), 3 * z, 3 * z);
        ctx.fillStyle = "#fff2c2";
        ctx.fillRect(Math.round(scr.x - 0.5 * z), Math.round(scr.y - 12.5 * z), z, z);
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
          const gr2 = ctx.createRadialGradient(scr.x, scr.y - 12 * z, 2, scr.x, scr.y - 12 * z, 26 * z);
          gr2.addColorStop(0, "rgba(255,180,80,.30)");
          gr2.addColorStop(1, "rgba(255,180,80,0)");
          ctx.fillStyle = gr2;
          ctx.fillRect(scr.x - 26 * z, scr.y - 38 * z, 52 * z, 52 * z);
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
            opacity: (dir === -1 && zoomRef.current === 1) || (dir === 1 && zoomRef.current === 4) ? 0.4 : 1,
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

/* ---- 牧場ビュー(バー・ティッカー・キャンバス・免責) ---- */

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

  /* 1日ダイジェスト: きょうの見どころ(事実のみ) */
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
        銘柄ごとに柵で囲まれた敷地があり、クリーチャーは自分の敷地でくらします。研究所は研究ステージで形が変わり
        （テント→小屋→ラボ→塔つき御殿）、含み損益の事実で敷地ごと大きさが変わります（含み益=大きく・含み損=小さめ）。
        はたけの作物は調査記録の件数で育ち、メモに書いた日付（決算日など）が近づくと🗓が浮かびます。
        <b style={{ color: "#8b93b8" }}>ドラッグで移動、＋−/ホイールでズーム、タップで詳細</b>。
        大きさ・ようす・数値はすべて事実の参考表示で、売買推奨ではありません。
      </div>
    </div>
  );
}

export { dayPhase, PHASE_INFO, seasonOf, isRainyToday, RanchView };
