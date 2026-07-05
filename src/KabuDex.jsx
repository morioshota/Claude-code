import { useState, useEffect, useRef } from "react";
import * as THREE from "three";
import { storage } from "./lib/storage.js";

/* ============================================================
   銘柄図鑑 — KABU DEX v2
   ・生態調査記録: kabu-researchの投資メモ全文を銘柄ごとに蓄積
   ・レベルで進化するカードビジュアル(ステージ1〜4)
   ・鮮度ゲージ / パーティ編成分析 / 実績バッジ / AI下書き
   保存: window.storage
     - 図鑑本体: kabu-zukan-v1 (既存データを引き継ぐ)
     - 調査記録: kabu-notes:{銘柄id} (銘柄ごとに独立保存)
   ============================================================ */

const STORAGE_KEY = "kabu-zukan-v1";
const noteKey = (id) => `kabu-notes:${id}`;

const TYPES = {
  cosmo:  { label: "コスモ",   sub: "宇宙・防衛",       icon: "🚀", color: "#8b5cf6", dark: "#2a1b52" },
  metal:  { label: "メタル",   sub: "重工・素材",       icon: "⚙️", color: "#94a3b8", dark: "#2b3442" },
  spark:  { label: "スパーク", sub: "電機・電力",       icon: "⚡", color: "#facc15", dark: "#3d3410" },
  build:  { label: "ビルド",   sub: "建設・インフラ",   icon: "🏗️", color: "#fb923c", dark: "#42260e" },
  play:   { label: "プレイ",   sub: "ゲーム・エンタメ", icon: "🎮", color: "#f472b6", dark: "#421a30" },
  drive:  { label: "ドライブ", sub: "自動車・輸送",     icon: "🚗", color: "#38bdf8", dark: "#0e3042" },
  life:   { label: "ライフ",   sub: "生活・ヘルスケア", icon: "🍼", color: "#4ade80", dark: "#123a22" },
  tech:   { label: "テック",   sub: "IT・半導体",       icon: "💻", color: "#22d3ee", dark: "#0d3540" },
  money:  { label: "マネー",   sub: "金融",             icon: "💹", color: "#a3e635", dark: "#293a0e" },
  market: { label: "マーケット", sub: "小売・サービス", icon: "🛒", color: "#e879f9", dark: "#3c1444" },
};

const RARITIES = [
  { key: 1, label: "N",   name: "ノーマル",         color: "#9ca3af", glow: "none" },
  { key: 2, label: "R",   name: "レア",             color: "#60a5fa", glow: "0 0 12px rgba(96,165,250,.45)" },
  { key: 3, label: "SR",  name: "スーパーレア",     color: "#c084fc", glow: "0 0 14px rgba(192,132,252,.5)" },
  { key: 4, label: "SSR", name: "ダブルスーパーレア", color: "#fbbf24", glow: "0 0 16px rgba(251,191,36,.55)" },
  { key: 5, label: "UR",  name: "ウルトラレア",     color: "#f0abfc", glow: "0 0 18px rgba(240,171,252,.6)" },
];

const STATUSES = {
  watch: { label: "ウォッチ中", icon: "👀", color: "#60a5fa" },
  hold:  { label: "ホカク済み", icon: "⭐", color: "#4ade80" },
  sold:  { label: "リリース",   icon: "🕊️", color: "#9ca3af" },
};

/* ---- レベル・進化ステージ ----
   クイックメモ = +1Lv / 生態調査記録(投資メモ全文) = +3Lv */
const calcLevel = (s) => 1 + (s.logs?.length || 0) + (s.noteCount || 0) * 3;
const calcCP = (s) =>
  s.rarity * 120 + calcLevel(s) * 35 + (s.bullets?.length || 0) * 20 + (s.risks?.length || 0) * 5;

const STAGES = [
  { min: 1,  no: 1, name: "ハッケン",  desc: "見つけたばかり",       iconSize: 32 },
  { min: 4,  no: 2, name: "カンサツ",  desc: "観察がすすんでいる",   iconSize: 40 },
  { min: 8,  no: 3, name: "カイメイ",  desc: "生態がかなり判明",     iconSize: 47 },
  { min: 15, no: 4, name: "マスター",  desc: "生態を知り尽くした",   iconSize: 54 },
];
const stageOf = (lv) => {
  let st = STAGES[0];
  for (const s of STAGES) if (lv >= s.min) st = s;
  return st;
};

/* ---- 鮮度(最終調査日からの経過) ---- */
const daysSince = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
};
const freshInfo = (stock) => {
  if (stock.status === "sold") return null;
  const days = daysSince(stock.lastResearch);
  if (days === null) return { icon: "❔", label: "記録なし", color: "#5b6284", pct: 0, days: null };
  if (days <= 14) return { icon: "🌱", label: "みずみずしい", color: "#4ade80", pct: 100, days };
  if (days <= 45) return { icon: "🍃", label: "まだ新しい", color: "#a3e635", pct: 70, days };
  if (days <= 90) return { icon: "🍂", label: "風化しつつある", color: "#fbbf24", pct: 40, days };
  return { icon: "🥀", label: "要再調査", color: "#f87171", pct: 12, days };
};

/* ---- 実績バッジ(データから毎回導出。保存不要) ---- */
const ACHIEVEMENTS = [
  { id: "first",   icon: "🎉", name: "はじめてのゲット",   desc: "銘柄を1件登録する" },
  { id: "col10",   icon: "📚", name: "コレクター",         desc: "10銘柄を登録する" },
  { id: "type5",   icon: "🧭", name: "タイプハンター",     desc: "5タイプの銘柄を発見" },
  { id: "typeAll", icon: "🌈", name: "タイプコンプリート", desc: "全10タイプを発見" },
  { id: "note1",   icon: "🔬", name: "フィールドワーカー", desc: "生態調査記録を1件保存" },
  { id: "note10",  icon: "🎓", name: "カブ博士",           desc: "生態調査記録を合計10件" },
  { id: "stage4",  icon: "👑", name: "マスター調査員",     desc: "1銘柄をステージ4まで育成" },
  { id: "risk",    icon: "🛡️", name: "リスクマネージャー", desc: "保有全銘柄に「にげるタイミング」を設定" },
  { id: "fresh",   icon: "🌿", name: "鮮度キーパー",       desc: "保有全銘柄を45日以内に調査済みに保つ" },
];
const evalAchievements = (stocks) => {
  const holds = stocks.filter((s) => s.status === "hold");
  const notesTotal = stocks.reduce((a, s) => a + (s.noteCount || 0), 0);
  const types = new Set(stocks.map((s) => s.type)).size;
  const unlocked = new Set();
  if (stocks.length >= 1) unlocked.add("first");
  if (stocks.length >= 10) unlocked.add("col10");
  if (types >= 5) unlocked.add("type5");
  if (types >= 10) unlocked.add("typeAll");
  if (notesTotal >= 1) unlocked.add("note1");
  if (notesTotal >= 10) unlocked.add("note10");
  if (stocks.some((s) => stageOf(calcLevel(s)).no === 4)) unlocked.add("stage4");
  if (holds.length > 0 && holds.every((s) => (s.triggers || []).length > 0)) unlocked.add("risk");
  if (holds.length > 0 && holds.every((s) => { const d = daysSince(s.lastResearch); return d !== null && d <= 45; })) unlocked.add("fresh");
  return unlocked;
};

const SEED = [
  { name: "コムシスHD", code: "1721", market: "東証プライム", type: "build", rarity: 4, status: "hold",
    hypothesis: "通信インフラ・データセンター投資の拡大が中長期の受注を支える",
    bullets: ["通信キャリア設備投資", "データセンター関連需要"], risks: ["公共投資の減速"], triggers: [],
    logs: [{ date: "", text: "主力銘柄として保有中（633株 / 平均3,952円）" }] },
  { name: "IHI", code: "7013", market: "東証プライム", type: "metal", rarity: 3, status: "hold",
    hypothesis: "防衛予算拡大と航空エンジン回復の恩恵を受ける",
    bullets: ["防衛関連の受注拡大", "民間航空エンジンの回復"], risks: ["過去の品質問題の再発リスク"], triggers: [],
    logs: [{ date: "", text: "保有中（100株 / 平均2,922円）" }] },
  { name: "アストロスケールHD", code: "186A", market: "東証グロース", type: "cosmo", rarity: 3, status: "hold",
    hypothesis: "宇宙産業は政府支出拡大で中長期成長。デブリ除去の先行者",
    bullets: ["政府系宇宙予算の拡大"], risks: ["赤字継続・希薄化リスク", "高ボラティリティ"], triggers: [],
    logs: [{ date: "", text: "保有中（100株 / 平均2,110円）※グロース枠：損切り-20%基準" }] },
  { name: "ピジョン", code: "7956", market: "東証プライム", type: "life", rarity: 2, status: "hold",
    hypothesis: "海外（中国以外）育児市場の開拓で安定成長へ回帰",
    bullets: ["ブランド力・高シェア"], risks: ["中国市場の出生数減少"], triggers: [],
    logs: [{ date: "", text: "保有中（300株 / 平均1,724円）" }] },
  { name: "新日本電工", code: "5563", market: "東証プライム", type: "metal", rarity: 2, status: "hold",
    hypothesis: "合金鉄・電池材料の需要と市況回復",
    bullets: ["電池材料の将来性"], risks: ["市況（合金鉄価格）依存"], triggers: [],
    logs: [{ date: "", text: "保有中（400株 / 平均391.74円）" }] },
  { name: "ロケットラボ", code: "RKLB", market: "米国 Nasdaq", type: "cosmo", rarity: 4, status: "hold",
    hypothesis: "小型ロケット＋衛星部品の垂直統合で宇宙経済の成長を取り込む",
    bullets: ["打上げ実績の積み上がり", "Neutron開発"], risks: ["高ボラティリティ", "為替（ドル建て）"], triggers: [],
    logs: [{ date: "", text: "保有中（26株 / 平均$99.56）※米小型株枠：損切り-20%基準" }] },
  { name: "明電舎", code: "6508", market: "東証プライム", type: "spark", rarity: 3, status: "watch",
    hypothesis: "電力インフラ更新・データセンター向け変電設備の需要拡大",
    bullets: [], risks: [], triggers: [], logs: [] },
  { name: "任天堂", code: "7974", market: "東証プライム", type: "play", rarity: 5, status: "watch",
    hypothesis: "IP資産の多面展開（ゲーム・映像・テーマパーク）で収益基盤が拡大",
    bullets: [], risks: [], triggers: [], logs: [] },
  { name: "トヨタ", code: "7203", market: "東証プライム", type: "drive", rarity: 4, status: "watch",
    hypothesis: "全方位戦略（HEV中心）が電動化過渡期に優位",
    bullets: [], risks: [], triggers: [], logs: [] },
];

const today = () => new Date().toISOString().slice(0, 10);
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const MEMO_TEMPLATE = `# 投資メモ: [銘柄名]([コード])
作成日: ${today()} / 株価: XXX円(時点)

## マクロ仮説

## 事業概要(3行以内)

## 直近決算サマリー
| 項目 | 実績 | 前年同期比 | 通期進捗率 |
|---|---|---|---|
| 売上高 |  |  |  |
| 営業利益 |  |  |  |
(出典: )

## 仮説を支持する材料
1.

## 仮説に反する材料・リスク
1.

## 前提が崩れる条件(見直しトリガー)
-

## 未確認事項
-

## 次に調べること
-`;

/* ============ 簡易マークダウン表示(見出し・表・リスト・太字) ============ */

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

/* ============ 銘柄クリーチャー(ドット絵・種族×個体差で決定論的生成) ============ */

const hashStr = (str) => {
  let h = 2166136261;
  const s = String(str);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};
const mulberry32 = (a) => () => {
  a |= 0; a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const shade = (hex, f) => {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * f), g = Math.round(((n >> 8) & 255) * f), b = Math.round((n & 255) * f);
  return `rgb(${r},${g},${b})`;
};

/* タイプごとの配色(体色3種＋腹＋アクセント) */
const CREATURE_LOOK = {
  cosmo:  { bodies: ["#a78bfa", "#8b5cf6", "#c4b5fd"], belly: "#ede9fe", accent: "#f0abfc" },
  metal:  { bodies: ["#94a3b8", "#7d8aa0", "#b3bfce"], belly: "#e2e8f0", accent: "#64748b" },
  spark:  { bodies: ["#facc15", "#fbbf24", "#fde047"], belly: "#fef9c3", accent: "#f97316" },
  build:  { bodies: ["#fb923c", "#f59e0b", "#fdba74"], belly: "#ffedd5", accent: "#eab308" },
  play:   { bodies: ["#f472b6", "#ec4899", "#f9a8d4"], belly: "#fce7f3", accent: "#a855f7" },
  drive:  { bodies: ["#38bdf8", "#0ea5e9", "#7dd3fc"], belly: "#e0f2fe", accent: "#334155" },
  life:   { bodies: ["#4ade80", "#34d399", "#86efac"], belly: "#dcfce7", accent: "#16a34a" },
  tech:   { bodies: ["#22d3ee", "#06b6d4", "#67e8f9"], belly: "#cffafe", accent: "#0e7490" },
  money:  { bodies: ["#a3e635", "#84cc16", "#bef264"], belly: "#f7fee7", accent: "#ca8a04" },
  market: { bodies: ["#e879f9", "#d946ef", "#f0abfc"], belly: "#fae8ff", accent: "#f472b6" },
};

/*
 ドット絵の記号:
 . 透明 / b 体色 / s 腹・サブ / a アクセント / o 輪郭・こげ茶
 w 白 / e 目(眠ると閉じる) / y 金色
 タイプごとに3種族=計30種族。シルエットが全員違う。
*/
const SPECIES_POOL = {
  cosmo: [
    { name: "ユーフォん", px: [ // UFO型
      "............",
      "....ssss....",
      "...sweews...",
      "...ssssss...",
      ".aaaaaaaaaa.",
      "bbbbbbbbbbbb",
      ".b.y.yy.y.b.",
      "............",
      "...y....y...",
      "..y......y..",
    ]},
    { name: "そらくらげ", px: [ // 宇宙クラゲ
      "............",
      "....bbbb....",
      "..bbbbbbbb..",
      ".bbbbbbbbbb.",
      ".bbebbbbebb.",
      ".bssssssssb.",
      "..b.b..b.b..",
      "..b.b..b.b..",
      "...b.b..b...",
      "............",
    ]},
    { name: "ほしのこ", px: [ // 星の精
      "............",
      ".....bb.....",
      "....bbbb....",
      "....bbbb....",
      "bbbbebbebbbb",
      ".bbbbwwbbbb.",
      "..bbbbbbbb..",
      "..bb.bb.bb..",
      ".bb..bb..bb.",
      "............",
    ]},
  ],
  metal: [
    { name: "いわゴレム", px: [ // 岩ゴーレム
      "............",
      "..oooooooo..",
      "..obbbbbbo..",
      "..obebbebo..",
      "..obbbbbbo..",
      ".oobssssboo.",
      ".obbbbbbbbo.",
      "..obbbbbbo..",
      "..obb..bbo..",
      "..oo....oo..",
    ]},
    { name: "ネジロボ", px: [ // ロボ
      "....y.......",
      "....o.......",
      "..ssssssss..",
      "..seessees..",
      "..ssssssss..",
      "...bbbbbb...",
      "..babbbbab..",
      "...bbbbbb...",
      "...bb..bb...",
      "...oo..oo...",
    ]},
    { name: "ハグルマガニ", px: [ // 歯車ヤドカリ
      ".....aa.....",
      "....aaaa....",
      "..a.abba.a..",
      ".bbbbbbbbbb.",
      "bbbebbbbebbb",
      ".bbbbbbbbbb.",
      "ob..bbbb..bo",
      "oo..b..b..oo",
    ]},
  ],
  spark: [
    { name: "らいじゅう", px: [ // 雷獣(妖怪)
      "..b......b..",
      "..bb....bb..",
      "..bbbbbbbb..",
      ".bbebbbbebb.",
      ".bbbbwwbbbb.",
      "..bbbbbbbb..",
      "...bbbbbb..y",
      "...b..b...yy",
      "...o..o..yy.",
    ]},
    { name: "でんきゅん", px: [ // 電球ゴースト
      "....ssss....",
      "...swwwws...",
      "..sweewews..",
      "..swwwwws...",
      "...ssssss...",
      "....oooo....",
      "....oooo....",
      "....a..a....",
      "............",
    ]},
    { name: "ごろつも", px: [ // 雷雲の子
      "............",
      "..bbb.bbb...",
      ".bbbbbbbbbb.",
      "bbbebbbbebbb",
      ".bbbbbbbbbb.",
      "..bbbbbbbb..",
      "....y..y....",
      "...yy.yy....",
      "...y...y....",
    ]},
  ],
  build: [
    { name: "メットもぐ", px: [ // ヘルメットモグラ
      "....aaaa....",
      "..aaaaaaaa..",
      "..abbbbbba..",
      ".bbebbbbebb.",
      ".bbbooobbbb.",
      ".bbbbbbbbbb.",
      "..bbssssbb..",
      "..obb..bbo..",
      "............",
    ]},
    { name: "クレーンび", px: [ // クレーン首長
      "..bb........",
      ".bebb.......",
      "..bb........",
      "...b........",
      "...b........",
      "...bbbbbbb..",
      "..bbbbbbbbb.",
      "..bbbsssbbb.",
      "...bb...bb..",
      "...oo...oo..",
    ]},
    { name: "レンガメ", px: [ // レンガガメ
      "............",
      "...aaaaaa...",
      "..abababab..",
      "..babababa..",
      "..abababab..",
      "...bbbbbb.ss",
      "....o..o..se",
      "..........s.",
    ]},
  ],
  play: [
    { name: "ぷにすら", px: [ // スライム
      "............",
      "............",
      "....bbbb....",
      "..bbbbbbbb..",
      ".bbbbbbbbbb.",
      ".bbebbbbebb.",
      ".bbbbwwbbbb.",
      ".bbbbbbbbbb.",
      "............",
    ]},
    { name: "からくりん", px: [ // からくり人形
      "....oooo....",
      "...oaaaao...",
      "....ssss....",
      "...sweews...",
      "...ssssss...",
      "..abbbbbba..",
      "...bbbbbb...",
      "...b.bb.b...",
      "...o....o...",
    ]},
    { name: "マスにゃ", px: [ // マスコット猫
      "..b......b..",
      ".bb......bb.",
      ".bbbbbbbbbb.",
      ".bbebbbbebb.",
      ".bbbbwwbbbb.",
      ".bbbbbbbbbb.",
      "..bbssssbb..",
      "..bb....bb..",
      "..oo....oo..",
    ]},
  ],
  drive: [
    { name: "タイヤつむり", px: [ // 車輪カタツムリ
      "..........be",
      "....aaaa..b.",
      "...aaaaaa.b.",
      "...aaooaa.b.",
      "...aaaaaa.b.",
      "....aaaa..b.",
      ".bbbbbbbbbb.",
      "............",
    ]},
    { name: "ブーカー", px: [ // ミニカー獣
      "............",
      "...bbbbbb...",
      "..bbbbbbbb..",
      ".bsseesssbb.",
      "ybbbbbbbbbby",
      ".oo......oo.",
      ".oo......oo.",
      "............",
    ]},
    { name: "コロどり", px: [ // 車輪の足の鳥
      ".....bb.....",
      "....bbbb....",
      "...bebbeb...",
      "...bbbbbb...",
      "....byyb....",
      "...bbbbbb...",
      "..bbbbbbbb..",
      "....o..o....",
      "...oo..oo...",
    ]},
  ],
  life: [
    { name: "はっぱみみ", px: [ // 葉っぱウサギ
      "...a....a...",
      "...ab..ba...",
      "...b....b...",
      "...bbbbbb...",
      "..bbebbebb..",
      "..bbbwwbbb..",
      "..bbbbbbbb..",
      "...bb..bb...",
      "............",
    ]},
    { name: "きのこびと", px: [ // キノコの子
      "............",
      "...aaaaaa...",
      "..aawaawaa..",
      ".aaaaaaaaaa.",
      "...ssssss...",
      "...sesses...",
      "...ssssss...",
      "....s..s....",
      "............",
    ]},
    { name: "めばえん", px: [ // 豆の芽
      "............",
      "..aa....aa..",
      ".aaaa..aaaa.",
      "..aaa..aaa..",
      ".....bb.....",
      "....bbbb....",
      "...bebbeb...",
      "...bbbbbb...",
      "....b..b....",
      "............",
    ]},
  ],
  tech: [
    { name: "ピクセロ", px: [ // ピクセルゴースト
      "............",
      "...bbbbbb...",
      "..bbbbbbbb..",
      ".bbebbbbebb.",
      ".bbbbbbbbbb.",
      ".bbbbbbbbbb.",
      ".bb.bb.bb.b.",
      "............",
    ]},
    { name: "チップむし", px: [ // チップ虫
      "..o......o..",
      "...o....o...",
      "..ssssssss..",
      ".sseesseess.",
      "..ssssssss..",
      ".b.bbbbbb.b.",
      "b..b....b..b",
      "............",
    ]},
    { name: "モニたん", px: [ // モニター頭
      "..oooooooo..",
      "..obbbbbbo..",
      "..obebbebo..",
      "..obbwwbbo..",
      "..oooooooo..",
      "....o..o....",
      "...ssssss...",
      "...o....o...",
      "............",
    ]},
  ],
  money: [
    { name: "まねきち", px: [ // 招き猫風
      "..b......bb.",
      ".bb......bb.",
      ".bbbbbbbbbb.",
      ".bbebbbbebb.",
      ".bbbboobbbb.",
      ".bbbbbbbbbb.",
      "..bbyyyybb..",
      "..bb.yy.bb..",
      "..oo....oo..",
    ]},
    { name: "コバンがめ", px: [ // 小判ガメ
      "............",
      "...yyyyyy...",
      "..yyyyyyyy..",
      "..yyooooyy..",
      "..yyyyyyyy..",
      "...yyyyyy.ss",
      "....o..o..se",
      "..........s.",
    ]},
    { name: "がまぐっち", px: [ // がま口モンスター
      "....o..o....",
      "...oyyyyo...",
      "..bbbbbbbb..",
      ".bbbbbbbbbb.",
      ".bbebbbbebb.",
      ".bbbbbbbbbb.",
      ".bbwwwwwwbb.",
      "..bbbbbbbb..",
      "...oo..oo...",
    ]},
  ],
  market: [
    { name: "ちょうちん", px: [ // 提灯お化け
      ".....oo.....",
      "....o..o....",
      "...bbbbbb...",
      ".obbbbbbbbo.",
      ".obbebbebbo.",
      ".obbbwwbbbo.",
      ".obbbbbbbbo.",
      "..bbbbbbbb..",
      "....oooo....",
      "............",
    ]},
    { name: "はたペン", px: [ // 旗持ちペンギン
      ".........ayy",
      "....bbbb..y.",
      "...bbbbbb.y.",
      "...bebbeb.y.",
      "...bsyysb.y.",
      "..bbssssbb..",
      "..bbssssbb..",
      "...bssssb...",
      "....y..y....",
    ]},
    { name: "カゴかに", px: [ // 買い物かごガニ
      "............",
      "...aaaaaa...",
      "..aoaoaoaa..",
      "..aaaaaaaa..",
      ".bbbbbbbbbb.",
      "bbebbbbbebbb",
      "ob..b..b..bo",
      "oo........oo",
    ]},
  ],
};

/* 銘柄→ドット絵グリッド(色配列)。姿はIDシードで固定 */
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
function Creature({ stock, size = 64, sleeping = false }) {
  const { grid, w, h } = buildPixels(stock, sleeping);
  return (
    <svg width={size} height={Math.round(size * (h / w))} viewBox={`0 0 ${w} ${h}`}
      shapeRendering="crispEdges" style={{ display: "block", imageRendering: "pixelated" }}>
      {grid.map((row, y) => row.map((c, x) => (
        c ? <rect key={`${x}-${y}`} x={x} y={y} width="1.02" height="1.02" fill={c} /> : null
      )))}
    </svg>
  );
}

/* 3D用: canvasテクスチャ(名前ラベル・💤入り)を生成 */
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

/* ============ 小物 ============ */

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

function Overlay({ onClose, children, z = 50 }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(5,7,18,.82)", backdropFilter: "blur(4px)", zIndex: z, display: "flex", justifyContent: "center", alignItems: "flex-start", overflowY: "auto", padding: "24px 12px" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(580px, 100%)" }}>{children}</div>
    </div>
  );
}

/* ============ 図鑑カード(ステージで見た目が進化) ============ */

function DexCard({ stock, onClick }) {
  const t = TYPES[stock.type] || TYPES.metal;
  const r = RARITIES.find((x) => x.key === stock.rarity) || RARITIES[0];
  const lv = calcLevel(stock);
  const stage = stageOf(lv);
  const fresh = freshInfo(stock);
  const sold = stock.status === "sold";

  const inner = (
    <div style={{
      background: stage.no >= 3
        ? `radial-gradient(120% 90% at 50% 0%, ${t.dark} 0%, #12152a 65%)`
        : `linear-gradient(160deg, ${t.dark} 0%, #12152a 70%)`,
      border: stage.no >= 4 ? "none" : `${stage.no >= 2 ? 2 : 1.5}px solid ${sold ? "#374151" : t.color}${stage.no >= 3 ? "aa" : "66"}`,
      borderRadius: 13, padding: 12, position: "relative", height: "100%", boxSizing: "border-box",
      boxShadow: !sold && (stage.no >= 3 || stock.rarity >= 4) ? r.glow : "none",
    }}>
      {stage.no >= 3 && !sold && (
        <>
          <span style={{ position: "absolute", top: 6, left: 8, color: t.color, fontSize: 10, opacity: .8 }}>✦</span>
          <span style={{ position: "absolute", bottom: 8, right: 8, color: t.color, fontSize: 10, opacity: .8 }}>✦</span>
        </>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={{ fontFamily: "'DotGothic16', monospace", fontSize: 11, color: "#6b7394" }}>No.{String(stock.no).padStart(3, "0")}</span>
        <RarityBadge rarity={stock.rarity} size={13} />
      </div>
      <div style={{
        display: "flex", justifyContent: "center", margin: "2px 0 4px",
        filter: sold ? "none" : `drop-shadow(0 0 ${6 + stage.no * 3}px ${t.color}${stage.no >= 3 ? "aa" : "66"})`,
        animation: stage.no >= 4 && !sold ? "kzAura 2.4s ease-in-out infinite" : "none",
      }}>
        <Creature stock={stock} size={stage.iconSize + 28} sleeping={!!(fresh && fresh.days !== null && fresh.days > 90)} />
      </div>
      <div style={{ textAlign: "center", marginBottom: 4 }}>
        <span style={{
          fontFamily: "'DotGothic16', monospace", fontSize: 9.5, letterSpacing: 1,
          color: stage.no >= 4 ? "#ffd166" : stage.no >= 3 ? t.color : "#5b6284",
          border: `1px solid ${stage.no >= 4 ? "#ffd166" : stage.no >= 3 ? t.color : "#333a5c"}55`,
          borderRadius: 999, padding: "1px 8px",
        }}>
          {stage.no >= 4 ? "👑 " : ""}S{stage.no} {stage.name}
        </span>
      </div>
      <div style={{ textAlign: "center", fontWeight: 800, fontSize: 14, color: "#eef1ff", lineHeight: 1.3, minHeight: 36 }}>
        {stock.name}
        <div style={{ fontFamily: "'DotGothic16', monospace", fontSize: 10, color: "#8b93b8", fontWeight: 400 }}>{stock.code}</div>
      </div>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
        <TypeChip typeKey={stock.type} small />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <StatusBadge status={stock.status} />
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          {fresh && <span title={fresh.label} style={{ fontSize: 12 }}>{fresh.icon}</span>}
          <span style={{ fontFamily: "'DotGothic16', monospace", fontSize: 12, color: "#ffd166" }}>Lv.{lv}</span>
        </span>
      </div>
    </div>
  );

  return (
    <button onClick={onClick} style={{
      all: "unset", cursor: "pointer", display: "block",
      borderRadius: 15, position: "relative",
      padding: stage.no >= 4 && !sold ? 2 : 0,
      background: stage.no >= 4 && !sold
        ? "linear-gradient(120deg, #f0abfc, #ffd166, #4ade80, #60a5fa, #f0abfc)" : "transparent",
      backgroundSize: "300% 300%",
      animation: stage.no >= 4 && !sold ? "kzHolo 6s linear infinite" : "none",
      opacity: sold ? 0.55 : 1, filter: sold ? "grayscale(.7)" : "none",
      transition: "transform .15s ease",
    }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-3px)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
    >
      {inner}
    </button>
  );
}

/* ============ 生態調査記録(フィールドノート) ============ */

function NoteEditor({ stock, hasPrev, onSave, onCancel }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [diff, setDiff] = useState("");
  const [saving, setSaving] = useState(false);
  const input = { width: "100%", boxSizing: "border-box", background: "#0b0e1d", border: "1px solid #2a3050", borderRadius: 8, color: "#eef1ff", padding: "9px 10px", fontSize: 13, outline: "none" };
  const label = { fontFamily: "'DotGothic16', monospace", fontSize: 11, color: "#8b93b8", letterSpacing: 1.5, display: "block", marginBottom: 4, marginTop: 12 };

  const save = async () => {
    if (!body.trim() || saving) return;
    setSaving(true);
    const ok = await onSave({ id: uid(), date: today(), title: title.trim(), body: body.trim(), diff: diff.trim(), ai: false });
    if (!ok) setSaving(false); // 失敗時は再試行できる状態に戻す(入力は保持される)
  };

  return (
    <Overlay onClose={onCancel} z={70}>
      <div style={{ background: "#0e1122", border: "2px solid #3b4470", borderRadius: 18, padding: 18 }}>
        <div style={{ fontFamily: "'DotGothic16', monospace", fontSize: 15, color: "#4ade80" }}>🔬 生態調査記録を追加</div>
        <div style={{ fontSize: 11.5, color: "#8b93b8", marginTop: 2 }}>
          {stock.name}（{stock.code}）｜チャットで作った投資メモをそのまま貼り付けできます（＋3Lv）
        </div>

        <label style={label}>タイトル（任意）</label>
        <input style={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例: 3Q決算レビュー / 初回リサーチ" />

        <label style={label}>投資メモ本文 *（マークダウン対応：見出し・表・リスト）</label>
        <textarea style={{ ...input, minHeight: 220, resize: "vertical", fontFamily: "inherit", lineHeight: 1.6 }}
          value={body} onChange={(e) => setBody(e.target.value)}
          placeholder="# 投資メモ: 〇〇(コード) …をここに貼り付け" />
        <button onClick={() => setBody((b) => (b ? b : MEMO_TEMPLATE))} disabled={!!body}
          style={{ ...btnStyle("#8b93b8"), padding: "5px 10px", fontSize: 11, marginTop: 6, opacity: body ? .4 : 1 }}>
          📋 kabu-researchテンプレを挿入
        </button>

        {hasPrev && (
          <>
            <label style={label}>前回調査との差分（再調査時の推奨項目）</label>
            <textarea style={{ ...input, minHeight: 70, resize: "vertical" }}
              value={diff} onChange={(e) => setDiff(e.target.value)}
              placeholder="例: 通期ガイダンス上方修正。仮説は維持、進捗率が前回58%→72%" />
          </>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button onClick={save} disabled={!body.trim() || saving} style={{
            all: "unset", cursor: body.trim() && !saving ? "pointer" : "default", flex: 1, textAlign: "center",
            background: body.trim() && !saving ? "#4ade80" : "#3a3f5c",
            color: body.trim() && !saving ? "#03210f" : "#6b7394",
            fontWeight: 800, borderRadius: 10, padding: "11px 0", fontSize: 14,
          }}>{saving ? "保存中…" : "記録を保存（＋3Lv）"}</button>
          <button onClick={onCancel} style={{ ...btnStyle("#8b93b8"), padding: "11px 18px" }}>やめる</button>
        </div>
      </div>
    </Overlay>
  );
}

function NoteItem({ note, index, total, onDelete }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(note.body);
      setCopied(true); setTimeout(() => setCopied(false), 1500);
    } catch (e) { /* クリップボード不可の環境では何もしない */ }
  };

  return (
    <div style={{ border: "1px solid #262d4d", borderRadius: 10, marginBottom: 8, overflow: "hidden", background: "#10142a" }}>
      <button onClick={() => setOpen(!open)} style={{ all: "unset", cursor: "pointer", display: "flex", width: "100%", boxSizing: "border-box", justifyContent: "space-between", alignItems: "center", padding: "9px 12px" }}>
        <span style={{ fontSize: 12.5, color: "#dfe4ff", fontWeight: 700, display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{ fontFamily: "'DotGothic16', monospace", color: "#6b7394", flexShrink: 0 }}>📖 調査{total - index}</span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{note.title || "（無題の記録）"}</span>
          {note.ai && <span style={{ fontSize: 9.5, color: "#c084fc", border: "1px solid #c084fc66", borderRadius: 999, padding: "0 6px", flexShrink: 0 }}>🤖下書き・要検証</span>}
        </span>
        <span style={{ fontFamily: "'DotGothic16', monospace", fontSize: 11, color: "#6b7394", flexShrink: 0, marginLeft: 8 }}>{note.date} {open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ padding: "4px 12px 12px", borderTop: "1px dashed #262d4d" }}>
          {note.diff && (
            <div style={{ background: "#1a1f0e", border: "1px solid #a3e63544", borderRadius: 8, padding: "8px 10px", margin: "8px 0" }}>
              <div style={{ fontFamily: "'DotGothic16', monospace", fontSize: 10, color: "#a3e635", marginBottom: 3 }}>Δ 前回調査との差分</div>
              <div style={{ fontSize: 12.5, color: "#dfe4ff", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{note.diff}</div>
            </div>
          )}
          <div style={{ marginTop: 6 }}><MdView text={note.body} /></div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={copy} style={{ ...btnStyle("#8b93b8"), padding: "5px 10px", fontSize: 11 }}>{copied ? "✓ コピーした" : "📋 本文をコピー"}</button>
            {!confirm
              ? <button onClick={() => setConfirm(true)} style={{ ...btnStyle("#f87171"), padding: "5px 10px", fontSize: 11 }}>🗑 この記録を削除</button>
              : <button onClick={() => onDelete(note.id)} style={{ ...btnStyle("#f87171"), padding: "5px 10px", fontSize: 11, background: "#f87171", color: "#2a0505" }}>本当に削除する？（-3Lv）</button>}
          </div>
        </div>
      )}
    </div>
  );
}

/* ============ AI調査アシスタント(下書き生成) ============ */

function AiAssistant({ stock, onSaveAsNote, onClose }) {
  const [state, setState] = useState("idle"); // idle|loading|done|error
  const [draft, setDraft] = useState("");
  const [errMsg, setErrMsg] = useState("");
  const runningRef = useRef(false);

  const run = async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setState("loading");
    const prompt = `あなたは日本株・米国株のリサーチアシスタントです。以下の銘柄について、web検索で最新情報を確認し、投資メモの「下書き」を作成してください。

銘柄: ${stock.name}（${stock.code}）市場: ${stock.market || "不明"}
背景のマクロ仮説: ${stock.hypothesis || "未設定（ボトムアップ調査として扱う）"}

厳守ルール:
- 数値には必ず出典（媒体名と日付）を添える。検索で確認できない数値は書かない
- 確認できない情報は「未確認」と明記する。推測と事実を混ぜない
- 売買の推奨は一切しない。判断材料の提示のみ
- 出力はマークダウンの投資メモ本文のみ。前置き・後書き不要
- 分量制限があるため簡潔に。見出し: マクロ仮説との関係 / 直近の業績・ニュース / 強気材料 / リスク / 未確認事項`;
    try {
      // ローカル版: claude.aiアーティファクト内と違いAPIキーが自動付与されないため、
      // 環境変数(VITE_ANTHROPIC_PROXY)で自前のプロキシURLを指定する方式。詳細はCLAUDE.md参照。
      const endpoint = import.meta.env?.VITE_ANTHROPIC_PROXY || "";
      if (!endpoint) {
        setErrMsg("ローカル版ではAI下書きは初期状態で未接続です。CLAUDE.mdの「AIアシスタントの接続」手順（プロキシ設定）で有効化できます。それまではチャットのkabu-researchで作成したメモの貼り付けをご利用ください。");
        setState("error");
        runningRef.current = false;
        return;
      }
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }],
          tools: [{ type: "web_search_20250305", name: "web_search" }],
        }),
      });
      const data = await res.json();
      const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
      if (!text) throw new Error("empty response");
      setDraft(text);
      setState("done");
    } catch (e) {
      setErrMsg("下書きの生成に失敗しました。プロキシの設定・通信状況を確認してください。");
      setState("error");
    }
    runningRef.current = false;
  };

  return (
    <Overlay onClose={onClose} z={70}>
      <div style={{ background: "#0e1122", border: "2px solid #c084fc66", borderRadius: 18, padding: 18 }}>
        <div style={{ fontFamily: "'DotGothic16', monospace", fontSize: 15, color: "#c084fc" }}>🤖 AI調査アシスタント</div>
        <div style={{ fontSize: 11.5, color: "#8b93b8", marginTop: 4, lineHeight: 1.7 }}>
          {stock.name}（{stock.code}）についてweb検索し、投資メモの下書きを生成します。<br />
          <span style={{ color: "#fbbf24" }}>⚠ あくまで下書きです。数値・出典は必ずご自身かチャットのkabu-researchで検証してください。</span>
        </div>

        {state === "idle" && (
          <button onClick={run} style={{ ...btnStyle("#c084fc"), marginTop: 14, display: "block", textAlign: "center", padding: "11px 0", width: "100%", boxSizing: "border-box" }}>
            🔍 検索して下書きを生成する
          </button>
        )}
        {state === "loading" && (
          <div style={{ textAlign: "center", padding: "26px 0", fontFamily: "'DotGothic16', monospace", color: "#c084fc", fontSize: 13 }}>
            <span style={{ display: "inline-block", animation: "kzAura 1.2s ease-in-out infinite" }}>🔮</span> 生態を調査中…（30秒ほどかかることがあります）
          </div>
        )}
        {state === "error" && (
          <div style={{ marginTop: 14, background: "#2a0e12", border: "1px solid #f8717166", borderRadius: 10, padding: 12, fontSize: 12.5, color: "#fca5a5", lineHeight: 1.7 }}>
            {errMsg || "生成に失敗しました。通信環境を確認してください。"}<br />
            代替として、チャットで「{stock.name}を調べて」と依頼して結果を貼り付ける方法が確実です。
            <button onClick={run} style={{ ...btnStyle("#c084fc"), display: "block", marginTop: 10, padding: "7px 12px" }}>もう一度試す</button>
          </div>
        )}
        {state === "done" && (
          <>
            <div style={{ marginTop: 12, maxHeight: 320, overflowY: "auto", background: "#10142a", border: "1px solid #262d4d", borderRadius: 10, padding: 12 }}>
              <MdView text={draft} />
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button onClick={() => onSaveAsNote(draft)} style={{ all: "unset", cursor: "pointer", flex: 1, textAlign: "center", background: "#c084fc", color: "#1e0b2e", fontWeight: 800, borderRadius: 10, padding: "10px 0", fontSize: 13 }}>
                調査記録として保存（🤖印つき）
              </button>
              <button onClick={onClose} style={{ ...btnStyle("#8b93b8"), padding: "10px 16px" }}>破棄</button>
            </div>
          </>
        )}
      </div>
    </Overlay>
  );
}

/* ============ 詳細モーダル ============ */

function DetailModal({ stock, notes, notesLoading, onClose, onUpdate, onDelete, onLog, onOpenNoteEditor, onOpenAi, onDeleteNote }) {
  const t = TYPES[stock.type] || TYPES.metal;
  const r = RARITIES.find((x) => x.key === stock.rarity) || RARITIES[0];
  const lv = calcLevel(stock);
  const stage = stageOf(lv);
  const cp = calcCP(stock);
  const fresh = freshInfo(stock);
  const [logText, setLogText] = useState("");
  const [flash, setFlash] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const addLog = () => {
    if (!logText.trim()) return;
    onLog(stock.id, logText.trim());
    setLogText("");
    setFlash(true);
    setTimeout(() => setFlash(false), 1200);
  };

  const section = { background: "#141830", border: "1px solid #262d4d", borderRadius: 12, padding: 14, marginBottom: 12 };
  const h = { fontFamily: "'DotGothic16', monospace", fontSize: 12, color: "#8b93b8", letterSpacing: 2, marginBottom: 8 };

  return (
    <Overlay onClose={onClose}>
      <div style={{
        background: "#0e1122", borderRadius: 18, overflow: "hidden",
        border: stage.no >= 4 ? "2px solid transparent" : `2px solid ${t.color}77`,
        backgroundImage: stage.no >= 4
          ? "linear-gradient(#0e1122,#0e1122), linear-gradient(120deg,#f0abfc,#ffd166,#4ade80,#60a5fa,#f0abfc)"
          : "none",
        backgroundOrigin: "border-box", backgroundClip: stage.no >= 4 ? "padding-box, border-box" : "border-box",
        boxShadow: stock.rarity >= 4 || stage.no >= 3 ? r.glow : "0 8px 40px rgba(0,0,0,.6)",
      }}>
        {/* ヘッダー */}
        <div style={{ background: `linear-gradient(135deg, ${t.dark}, #0e1122 80%)`, padding: "18px 18px 14px", position: "relative" }}>
          <button onClick={onClose} style={{ position: "absolute", top: 10, right: 12, all: "unset", cursor: "pointer", color: "#8b93b8", fontSize: 20, lineHeight: 1, padding: 6 }}>✕</button>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <div style={{
              filter: `drop-shadow(0 0 ${8 + stage.no * 4}px ${t.color}99)`,
              animation: flash ? "kzBounce .6s ease" : stage.no >= 4 ? "kzAura 2.4s ease-in-out infinite" : "none",
            }}>
              <Creature stock={stock} size={56 + stage.no * 6} sleeping={!!(fresh && fresh.days !== null && fresh.days > 90)} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "'DotGothic16', monospace", fontSize: 11, color: "#6b7394" }}>
                No.{String(stock.no).padStart(3, "0")}　<RarityBadge rarity={stock.rarity} size={12} />（{r.name}）
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#f2f4ff" }}>{stock.name}</div>
              <div style={{ fontSize: 12, color: "#8b93b8" }}>{stock.code}・{stock.market || "市場未設定"}</div>
              <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <TypeChip typeKey={stock.type} small />
                <StatusBadge status={stock.status} />
                <span style={{ fontFamily: "'DotGothic16', monospace", fontSize: 10.5, color: stage.no >= 4 ? "#ffd166" : t.color }}>
                  {stage.no >= 4 ? "👑 " : ""}STAGE {stage.no}「{stage.name}」
                </span>
              </div>
            </div>
          </div>
          {flash && (
            <div style={{ position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)", fontFamily: "'DotGothic16', monospace", color: "#ffd166", fontSize: 14, textShadow: "0 0 10px rgba(255,209,102,.8)", animation: "kzRise 1.2s ease forwards" }}>
              ★ レベルアップ！ Lv.{lv} ★
            </div>
          )}
        </div>

        <div style={{ padding: 16 }}>
          {/* ステータス */}
          <div style={section}>
            <div style={h}>STATUS ─ {stage.desc}</div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontFamily: "'DotGothic16', monospace", color: "#ffd166", fontSize: 16 }}>Lv.{lv}</span>
              <span style={{ fontFamily: "'DotGothic16', monospace", color: t.color, fontSize: 16 }}>CP {cp}</span>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#aab2d5", marginBottom: 3 }}>
                  <span>研究度（調査記録{stock.noteCount || 0}件×3 ＋ メモ{stock.logs.length}件）</span>
                  <span>{stage.no < 4 ? `次のステージまで あとLv.${STAGES[stage.no].min - lv}` : "最終ステージ"}</span>
                </div>
                <Gauge value={lv} max={stage.no < 4 ? STAGES[stage.no].min : lv} color="#ffd166" />
              </div>
              {fresh && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#aab2d5", marginBottom: 3 }}>
                    <span>{fresh.icon} 記録の鮮度: {fresh.label}</span>
                    <span>{fresh.days === null ? "調査記録なし" : `最終調査から${fresh.days}日`}</span>
                  </div>
                  <Gauge value={fresh.pct} max={100} color={fresh.color} />
                </div>
              )}
              <div>
                <div style={{ fontSize: 11, color: "#aab2d5", marginBottom: 3 }}>こうげき（強気材料 {stock.bullets.length}）</div>
                <Gauge value={stock.bullets.length} max={6} color="#f87171" />
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#aab2d5", marginBottom: 3 }}>けいかい（リスク把握 {stock.risks.length}）</div>
                <Gauge value={stock.risks.length} max={6} color="#60a5fa" />
              </div>
            </div>
            <div style={{ fontSize: 10, color: "#5b6284", marginTop: 8 }}>
              ※ Lv・CP・鮮度は研究の蓄積量と経過日数を表す指標です。投資判断の根拠にはなりません。
            </div>
          </div>

          {/* 生態調査記録 */}
          <div style={{ ...section, border: "1px solid #2d5a3d" }}>
            <div style={{ ...h, color: "#4ade80" }}>🔬 生態調査記録（投資メモの保管庫）</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              <button onClick={onOpenNoteEditor} style={{ ...btnStyle("#4ade80"), padding: "7px 12px", fontSize: 12 }}>＋ 記録を追加（＋3Lv）</button>
              <button onClick={onOpenAi} style={{ ...btnStyle("#c084fc"), padding: "7px 12px", fontSize: 12 }}>🤖 AIに下書きを頼む</button>
            </div>
            {notesLoading
              ? <div style={{ fontSize: 12, color: "#5b6284" }}>記録を読み込み中…</div>
              : notes.length === 0
                ? <div style={{ fontSize: 12, color: "#5b6284", lineHeight: 1.7 }}>まだ調査記録がありません。チャットで作った投資メモを貼り付けて、この銘柄の「生態」を記録しよう。</div>
                : [...notes].reverse().map((n, i) => (
                  <NoteItem key={n.id} note={n} index={i} total={notes.length} onDelete={onDeleteNote} />
                ))}
          </div>

          {/* マクロ仮説 */}
          <div style={section}>
            <div style={h}>マクロ仮説（とくせい）</div>
            <div style={{ fontSize: 13, color: "#dfe4ff", lineHeight: 1.7 }}>
              {stock.hypothesis || <span style={{ color: "#5b6284" }}>未設定（編集から追加できます）</span>}
            </div>
          </div>

          {/* わざ・よわてん */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12, marginBottom: 12 }}>
            <div style={{ ...section, marginBottom: 0 }}>
              <div style={h}>わざ（強気材料）</div>
              {stock.bullets.length === 0
                ? <div style={{ fontSize: 12, color: "#5b6284" }}>まだ覚えていない。リサーチで習得しよう</div>
                : stock.bullets.map((b, i) => (
                  <div key={i} style={{ fontSize: 13, color: "#fca5a5", padding: "4px 0", borderBottom: i < stock.bullets.length - 1 ? "1px dashed #262d4d" : "none" }}>🔥 {b}</div>
                ))}
            </div>
            <div style={{ ...section, marginBottom: 0 }}>
              <div style={h}>よわてん（リスク）</div>
              {stock.risks.length === 0
                ? <div style={{ fontSize: 12, color: "#5b6284" }}>未把握。弱点を知らないのは危険…</div>
                : stock.risks.map((b, i) => (
                  <div key={i} style={{ fontSize: 13, color: "#93c5fd", padding: "4px 0", borderBottom: i < stock.risks.length - 1 ? "1px dashed #262d4d" : "none" }}>⚠️ {b}</div>
                ))}
            </div>
          </div>

          {/* 見直しトリガー */}
          <div style={section}>
            <div style={h}>にげるタイミング（前提が崩れる条件）</div>
            {(!stock.triggers || stock.triggers.length === 0)
              ? <div style={{ fontSize: 12, color: "#5b6284" }}>未設定。「何が起きたら見直すか」を決めておくと安心</div>
              : stock.triggers.map((b, i) => (
                <div key={i} style={{ fontSize: 13, color: "#fcd34d", padding: "4px 0" }}>🚪 {b}</div>
              ))}
          </div>

          {/* クイックメモ */}
          <div style={section}>
            <div style={h}>クイックメモ（ひとこと記録・＋1Lv）</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <input
                value={logText}
                onChange={(e) => setLogText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addLog(); }}
                placeholder="例: 決算発表は8/8。進捗率をチェック予定"
                style={{ flex: 1, background: "#0b0e1d", border: "1px solid #2a3050", borderRadius: 8, color: "#eef1ff", padding: "8px 10px", fontSize: 13, outline: "none" }}
              />
              <button onClick={addLog} style={{ all: "unset", cursor: "pointer", background: "#ffd166", color: "#221a00", fontWeight: 800, fontSize: 12, borderRadius: 8, padding: "8px 12px", whiteSpace: "nowrap" }}>＋記録</button>
            </div>
            {stock.logs.length === 0
              ? <div style={{ fontSize: 12, color: "#5b6284" }}>記録なし</div>
              : [...stock.logs].reverse().map((l, i) => (
                <div key={i} style={{ fontSize: 12.5, color: "#c7cdec", padding: "6px 0", borderBottom: "1px dashed #262d4d", lineHeight: 1.6 }}>
                  <span style={{ fontFamily: "'DotGothic16', monospace", color: "#6b7394", marginRight: 8 }}>{l.date || "----"}</span>
                  {l.text}
                </div>
              ))}
          </div>

          {/* 操作 */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {stock.status === "watch" && <button onClick={() => onUpdate({ ...stock, status: "hold" })} style={btnStyle("#4ade80")}>⭐ ホカクした（保有へ）</button>}
            {stock.status === "hold" && <button onClick={() => onUpdate({ ...stock, status: "sold" })} style={btnStyle("#9ca3af")}>🕊️ リリース（売却済みへ）</button>}
            {stock.status === "sold" && <button onClick={() => onUpdate({ ...stock, status: "watch" })} style={btnStyle("#60a5fa")}>👀 再ウォッチする</button>}
            <button onClick={() => onUpdate(stock, true)} style={btnStyle("#c084fc")}>✏️ 編集</button>
            {!confirmDelete
              ? <button onClick={() => setConfirmDelete(true)} style={btnStyle("#f87171")}>🗑️ 図鑑から削除</button>
              : <button onClick={() => onDelete(stock.id)} style={{ ...btnStyle("#f87171"), background: "#f87171", color: "#2a0505" }}>本当に削除する？（調査記録も消えます）</button>}
          </div>
        </div>
      </div>
    </Overlay>
  );
}

/* ============ 追加・編集フォーム ============ */

function StockForm({ initial, onSave, onCancel }) {
  const [f, setF] = useState(initial || {
    name: "", code: "", market: "", type: "tech", rarity: 2, status: "watch",
    hypothesis: "", bullets: [], risks: [], triggers: [], logs: [],
  });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const listToText = (a) => (a || []).join("\n");
  const textToList = (s) => s.split("\n").map((x) => x.trim()).filter(Boolean);

  const label = { fontFamily: "'DotGothic16', monospace", fontSize: 11, color: "#8b93b8", letterSpacing: 1.5, display: "block", marginBottom: 4, marginTop: 12 };
  const input = { width: "100%", boxSizing: "border-box", background: "#0b0e1d", border: "1px solid #2a3050", borderRadius: 8, color: "#eef1ff", padding: "9px 10px", fontSize: 13.5, outline: "none" };

  return (
    <Overlay onClose={onCancel} z={60}>
      <div style={{ background: "#0e1122", border: "2px solid #3b4470", borderRadius: 18, padding: 18 }}>
        <div style={{ fontFamily: "'DotGothic16', monospace", fontSize: 15, color: "#ffd166", marginBottom: 4 }}>
          {initial ? "▶ カードを編集" : "▶ あたらしい銘柄をゲット！"}
        </div>
        <div style={{ fontSize: 11.5, color: "#8b93b8" }}>リサーチした銘柄を図鑑に登録します</div>

        <label style={label}>銘柄名 *</label>
        <input style={input} value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="例: 明電舎" />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={label}>コード *</label>
            <input style={input} value={f.code} onChange={(e) => set("code", e.target.value)} placeholder="例: 6508" />
          </div>
          <div>
            <label style={label}>市場</label>
            <input style={input} value={f.market} onChange={(e) => set("market", e.target.value)} placeholder="例: 東証プライム" />
          </div>
        </div>

        <label style={label}>タイプ（セクター属性）</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {Object.entries(TYPES).map(([k, t]) => (
            <button key={k} onClick={() => set("type", k)} style={{
              all: "unset", cursor: "pointer", padding: "5px 10px", borderRadius: 999,
              border: `1.5px solid ${f.type === k ? t.color : "#2a3050"}`,
              background: f.type === k ? t.dark : "transparent",
              color: f.type === k ? t.color : "#8b93b8", fontSize: 11.5, fontWeight: 700,
            }}>
              {t.icon} {t.label}<span style={{ fontSize: 9, opacity: .7 }}>（{t.sub}）</span>
            </button>
          ))}
        </div>

        <label style={label}>レアリティ（自分の確信度・注目度でOK）</label>
        <div style={{ display: "flex", gap: 6 }}>
          {RARITIES.map((r) => (
            <button key={r.key} onClick={() => set("rarity", r.key)} style={{
              all: "unset", cursor: "pointer", padding: "6px 12px", borderRadius: 8,
              border: `1.5px solid ${f.rarity === r.key ? r.color : "#2a3050"}`,
              color: f.rarity === r.key ? r.color : "#5b6284",
              fontFamily: "'DotGothic16', monospace", fontWeight: 700, fontSize: 13,
              boxShadow: f.rarity === r.key ? r.glow : "none",
            }}>{r.label}</button>
          ))}
        </div>

        <label style={label}>ステータス</label>
        <div style={{ display: "flex", gap: 6 }}>
          {Object.entries(STATUSES).map(([k, s]) => (
            <button key={k} onClick={() => set("status", k)} style={{
              all: "unset", cursor: "pointer", padding: "6px 12px", borderRadius: 8,
              border: `1.5px solid ${f.status === k ? s.color : "#2a3050"}`,
              color: f.status === k ? s.color : "#5b6284", fontSize: 12, fontWeight: 700,
            }}>{s.icon} {s.label}</button>
          ))}
        </div>

        <label style={label}>マクロ仮説（この銘柄を調べる背景）</label>
        <textarea style={{ ...input, minHeight: 54, resize: "vertical" }} value={f.hypothesis}
          onChange={(e) => set("hypothesis", e.target.value)} placeholder="例: 宇宙産業は政府支出拡大で中長期成長" />

        <label style={label}>わざ ＝ 強気材料（1行に1つ）</label>
        <textarea style={{ ...input, minHeight: 60, resize: "vertical" }} defaultValue={listToText(f.bullets)}
          onChange={(e) => set("bullets", textToList(e.target.value))} placeholder={"防衛予算の拡大\nデータセンター需要"} />

        <label style={label}>よわてん ＝ リスク（1行に1つ）</label>
        <textarea style={{ ...input, minHeight: 60, resize: "vertical" }} defaultValue={listToText(f.risks)}
          onChange={(e) => set("risks", textToList(e.target.value))} placeholder={"市況依存\n為替リスク"} />

        <label style={label}>にげるタイミング ＝ 前提が崩れる条件（1行に1つ）</label>
        <textarea style={{ ...input, minHeight: 50, resize: "vertical" }} defaultValue={listToText(f.triggers)}
          onChange={(e) => set("triggers", textToList(e.target.value))} placeholder="例: 2四半期連続で受注が前年割れ" />

        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button
            onClick={() => { if (f.name.trim() && f.code.trim()) onSave(f); }}
            style={{
              all: "unset", cursor: "pointer", flex: 1, textAlign: "center",
              background: f.name.trim() && f.code.trim() ? "#ffd166" : "#3a3f5c",
              color: f.name.trim() && f.code.trim() ? "#221a00" : "#6b7394",
              fontWeight: 800, borderRadius: 10, padding: "11px 0", fontSize: 14,
            }}>
            {initial ? "保存する" : "ゲットする！"}
          </button>
          <button onClick={onCancel} style={{ ...btnStyle("#8b93b8"), padding: "11px 18px" }}>やめる</button>
        </div>
      </div>
    </Overlay>
  );
}

/* ============ パーティ編成分析 ============ */

function PartyModal({ stocks, onClose }) {
  const holds = stocks.filter((s) => s.status === "hold");
  const byType = {};
  holds.forEach((s) => { byType[s.type] = (byType[s.type] || 0) + 1; });
  const rows = Object.entries(byType).sort((a, b) => b[1] - a[1]);
  const maxPct = holds.length > 0 ? Math.round((rows[0]?.[1] || 0) / holds.length * 100) : 0;

  return (
    <Overlay onClose={onClose} z={60}>
      <div style={{ background: "#0e1122", border: "2px solid #3b4470", borderRadius: 18, padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontFamily: "'DotGothic16', monospace", fontSize: 15, color: "#60a5fa" }}>📊 パーティ編成分析</div>
          <button onClick={onClose} style={{ all: "unset", cursor: "pointer", color: "#8b93b8", fontSize: 18, padding: 4 }}>✕</button>
        </div>
        <div style={{ fontSize: 11.5, color: "#8b93b8", marginTop: 2, marginBottom: 14 }}>
          ホカク済み（保有）{holds.length}銘柄のタイプ構成。実質はセクター集中の可視化です
        </div>
        {holds.length === 0 ? (
          <div style={{ fontSize: 12.5, color: "#5b6284", textAlign: "center", padding: "20px 0" }}>保有銘柄がまだいません</div>
        ) : (
          <>
            {rows.map(([k, count]) => {
              const t = TYPES[k] || TYPES.metal;
              const pct = Math.round((count / holds.length) * 100);
              return (
                <div key={k} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                    <span style={{ color: t.color, fontWeight: 700 }}>{t.icon} {t.label}<span style={{ color: "#5b6284", fontWeight: 400, fontSize: 10 }}>（{t.sub}）</span></span>
                    <span style={{ fontFamily: "'DotGothic16', monospace", color: "#dfe4ff" }}>{count}銘柄 / {pct}%</span>
                  </div>
                  <Gauge value={count} max={holds.length} color={t.color} />
                </div>
              );
            })}
            <div style={{
              marginTop: 14, borderRadius: 10, padding: "10px 12px", fontSize: 12, lineHeight: 1.7,
              background: maxPct >= 40 ? "#2e230e" : "#0e2418",
              border: `1px solid ${maxPct >= 40 ? "#fbbf2466" : "#4ade8044"}`,
              color: maxPct >= 40 ? "#fcd34d" : "#86efac",
            }}>
              {maxPct >= 40
                ? `⚠ ${TYPES[rows[0][0]].label}タイプに銘柄数の${maxPct}%が集中しています。同じセクター要因で同時に動きやすい編成です`
                : "✓ タイプの偏りは大きくありません（銘柄数ベース）"}
            </div>
            <div style={{ fontSize: 10, color: "#5b6284", marginTop: 8, lineHeight: 1.6 }}>
              ※ 銘柄数ベースの構成比です。金額ベースの偏りとは異なる場合があります（このアプリは株価・評価額を扱いません）。
            </div>
          </>
        )}
      </div>
    </Overlay>
  );
}

/* ============ 実績バッジ ============ */

function BadgeModal({ stocks, onClose }) {
  const unlocked = evalAchievements(stocks);
  return (
    <Overlay onClose={onClose} z={60}>
      <div style={{ background: "#0e1122", border: "2px solid #3b4470", borderRadius: 18, padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontFamily: "'DotGothic16', monospace", fontSize: 15, color: "#ffd166" }}>
            🎖 実績バッジ <span style={{ fontSize: 12, color: "#8b93b8" }}>{unlocked.size}/{ACHIEVEMENTS.length}</span>
          </div>
          <button onClick={onClose} style={{ all: "unset", cursor: "pointer", color: "#8b93b8", fontSize: 18, padding: 4 }}>✕</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10, marginTop: 14 }}>
          {ACHIEVEMENTS.map((a) => {
            const got = unlocked.has(a.id);
            return (
              <div key={a.id} style={{
                border: `1.5px solid ${got ? "#ffd16688" : "#252b48"}`, borderRadius: 12, padding: "12px 10px",
                textAlign: "center", background: got ? "#1c160a" : "#10142a",
                filter: got ? "none" : "grayscale(1)", opacity: got ? 1 : 0.45,
              }}>
                <div style={{ fontSize: 26 }}>{a.icon}</div>
                <div style={{ fontSize: 12, fontWeight: 800, color: got ? "#ffd166" : "#8b93b8", marginTop: 4 }}>{a.name}</div>
                <div style={{ fontSize: 10, color: "#8b93b8", marginTop: 3, lineHeight: 1.5 }}>{a.desc}</div>
              </div>
            );
          })}
        </div>
      </div>
    </Overlay>
  );
}

/* ============ 牧場モード ============ */

// 動きの元気さ: 0=げんき(はねる) 1=ふつう 2=のんびり 3=すいみん(90日超)
const moveTierOf = (stock) => {
  const f = freshInfo(stock);
  if (!f || f.days === null) return 2;
  if (f.days <= 14) return 0;
  if (f.days <= 45) return 1;
  if (f.days <= 90) return 2;
  return 3;
};

// 実時間→時間帯(端末の時計を使用)
const dayPhase = () => {
  const h = new Date().getHours() + new Date().getMinutes() / 60;
  if (h >= 7 && h < 16.5) return "day";
  if ((h >= 5 && h < 7) || (h >= 16.5 && h < 19)) return "dusk";
  return "night";
};
const PHASE_INFO = {
  day:   { label: "☀️ ひる",   sky: 0x87c5eb, amb: 0.9,  sun: 0.95, stars: 0 },
  dusk:  { label: "🌆 ゆうがた", sky: 0xd97a52, amb: 0.62, sun: 0.5,  stars: 0.2 },
  night: { label: "🌙 よる",   sky: 0x0d1230, amb: 0.34, sun: 0.1,  stars: 0.9 },
};

/* ---- 3D牧場(2.5D: ドット絵スプライト×3D地形) ---- */
function Ranch3D({ stocks, onSelect, onFallback }) {
  const mountRef = useRef(null);
  const stocksRef = useRef(stocks); stocksRef.current = stocks;
  const onSelectRef = useRef(onSelect); onSelectRef.current = onSelect;
  const reduced = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // メンバー・ステータス・睡眠・ステージが変わったときだけシーンを作り直す
  const sceneKey = stocks
    .filter((s) => s.status !== "sold")
    .map((s) => `${s.id}:${s.status}:${moveTierOf(s) === 3 ? "z" : "a"}:${stageOf(calcLevel(s)).no}`)
    .join("|");

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let renderer, raf = 0;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false });
      if (!renderer.getContext()) throw new Error("no webgl");
    } catch (e) { onFallback(); return; }

    const W = () => Math.max(1, mount.clientWidth);
    const H = () => Math.max(1, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(W(), H());
    mount.appendChild(renderer.domElement);
    const el = renderer.domElement;
    el.style.touchAction = "none";

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, W() / H(), 0.1, 400);
    const orbit = { az: 0.5, pol: 1.02, r: 27 }; // 自作オービット(この環境ではOrbitControls不使用)
    const applyCam = () => {
      camera.position.set(
        orbit.r * Math.sin(orbit.pol) * Math.sin(orbit.az),
        orbit.r * Math.cos(orbit.pol) + 1.5,
        orbit.r * Math.sin(orbit.pol) * Math.cos(orbit.az)
      );
      camera.lookAt(0, 1, 0);
    };

    // ライト(時間帯で変化)
    const amb = new THREE.AmbientLight(0xffffff, 0.7);
    const sun = new THREE.DirectionalLight(0xfff4e0, 0.8);
    sun.position.set(12, 22, 8);
    scene.add(amb, sun);

    // 地形: 柵(x=4)の左=ぼくじょう、右=やせい
    const gPast = new THREE.Mesh(new THREE.PlaneGeometry(20, 24), new THREE.MeshLambertMaterial({ color: 0x3d8a4e }));
    gPast.rotation.x = -Math.PI / 2; gPast.position.set(-6, 0, 0);
    const gWild = new THREE.Mesh(new THREE.PlaneGeometry(13, 24), new THREE.MeshLambertMaterial({ color: 0x3a6b35 }));
    gWild.rotation.x = -Math.PI / 2; gWild.position.set(10.5, 0, 0);
    scene.add(gPast, gWild);

    // 柵
    const fenceMat = new THREE.MeshLambertMaterial({ color: 0x8a6a3a });
    for (let z = -12; z <= 12; z += 3) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.32, 1.7, 0.32), fenceMat);
      post.position.set(4, 0.85, z);
      scene.add(post);
    }
    [0.6, 1.25].forEach((y) => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.13, 24.4), fenceMat);
      rail.position.set(4, y, 0);
      scene.add(rail);
    });

    // 木・池・岩
    const mkTree = (x, z, s = 1) => {
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * s, 0.34 * s, 1.2 * s, 6), new THREE.MeshLambertMaterial({ color: 0x6b4a2b }));
      trunk.position.y = 0.6 * s;
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(1.3 * s, 2.5 * s, 7), new THREE.MeshLambertMaterial({ color: 0x1f5c33 }));
      leaf.position.y = 2.3 * s;
      g.add(trunk, leaf);
      g.position.set(x, 0, z);
      scene.add(g);
    };
    mkTree(9, -9); mkTree(13.5, -3.5, 1.25); mkTree(11, 7.5, 0.9); mkTree(-14.5, -10, 1.15); mkTree(-13, 9, 0.85);
    const pond = new THREE.Mesh(new THREE.CircleGeometry(2.5, 22), new THREE.MeshLambertMaterial({ color: 0x3aa0c9 }));
    pond.rotation.x = -Math.PI / 2; pond.position.set(-11, 0.02, 5.5);
    scene.add(pond);
    [[-3, -10], [12, 3], [-15, 0]].forEach(([x, z]) => {
      const rock = new THREE.Mesh(new THREE.SphereGeometry(0.55, 5, 4), new THREE.MeshLambertMaterial({ color: 0x6b7280 }));
      rock.position.set(x, 0.3, z);
      scene.add(rock);
    });

    // 星(夜だけ見える)
    const starPos = [];
    for (let i = 0; i < 140; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.random() * Math.PI * 0.45, R = 150;
      starPos.push(R * Math.sin(ph) * Math.cos(th), R * Math.cos(ph) + 5, R * Math.sin(ph) * Math.sin(th));
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.Float32BufferAttribute(starPos, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.8, transparent: true, opacity: 0 }));
    scene.add(stars);

    // 実時間の昼夜(1分ごとに再判定)
    const applyTime = () => {
      const p = PHASE_INFO[dayPhase()];
      scene.background = new THREE.Color(p.sky);
      amb.intensity = p.amb;
      sun.intensity = p.sun;
      stars.material.opacity = p.stars;
    };
    applyTime();
    const timeIv = setInterval(applyTime, 60000);

    // クリーチャー(ビルボードスプライト)
    const zoneOf = (s) => (s.status === "hold"
      ? { x0: -15, x1: 2.6, z0: -10.5, z1: 10.5 }
      : { x0: 5.4, x1: 15.5, z0: -10.5, z1: 10.5 });
    const members = new Map();
    stocksRef.current.filter((s) => s.status !== "sold").forEach((s) => {
      const tier = moveTierOf(s);
      const cv = spriteCanvasFor(s, tier === 3);
      const tex = new THREE.CanvasTexture(cv);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
      const hgt = 3.2, aspect = cv.width / cv.height;
      sp.scale.set(hgt * aspect, hgt, 1);
      sp.userData.stockId = s.id;
      const z = zoneOf(s);
      const st = { x: z.x0 + Math.random() * (z.x1 - z.x0), z: z.z0 + Math.random() * (z.z1 - z.z0) };
      st.tx = st.x; st.tz = st.z; st.hop = Math.random() * 6;
      sp.position.set(st.x, hgt / 2, st.z);
      scene.add(sp);
      members.set(s.id, { sp, st, tex, hgt, tier });
    });

    // 徘徊(鮮度で速さ・頻度が変化)
    const moveIv = setInterval(() => {
      if (reduced) return;
      members.forEach((o, id) => {
        const s = stocksRef.current.find((x) => x.id === id);
        if (!s) return;
        const tier = moveTierOf(s);
        o.tier = tier;
        if (tier === 3) return;
        const speed = [0.6, 0.32, 0.14][tier];
        const restart = [0.3, 0.14, 0.05][tier];
        const dx = o.st.tx - o.st.x, dz = o.st.tz - o.st.z, d = Math.hypot(dx, dz);
        if (d < 0.25) {
          if (Math.random() < restart) {
            const z = zoneOf(s);
            o.st.tx = z.x0 + Math.random() * (z.x1 - z.x0);
            o.st.tz = z.z0 + Math.random() * (z.z1 - z.z0);
          }
        } else {
          o.st.x += (dx / d) * Math.min(speed, d);
          o.st.z += (dz / d) * Math.min(speed, d);
        }
      });
    }, 480);

    // 描画ループ(位置補間＋ぴょんぴょん)
    const clock = new THREE.Clock();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const t = clock.getElapsedTime();
      members.forEach((o) => {
        const p = o.sp.position;
        p.x += (o.st.x - p.x) * 0.08;
        p.z += (o.st.z - p.z) * 0.08;
        const moving = Math.hypot(o.st.tx - p.x, o.st.tz - p.z) > 0.35;
        const hopY = o.tier === 0 && moving && !reduced ? Math.abs(Math.sin(t * 6 + o.st.hop)) * 0.5 : 0;
        p.y = o.hgt / 2 + hopY;
      });
      applyCam();
      renderer.render(scene, camera);
    };
    applyCam();
    loop();

    // 自作コントロール: 1本指ドラッグ=回転 / 2本指ピンチ・ホイール=ズーム / タップ=選択
    const pointers = new Map();
    let moved = 0, lastPinch = null;
    const onDown = (e) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) moved = 0;
      el.setPointerCapture && el.setPointerCapture(e.pointerId);
    };
    const onMove = (e) => {
      if (!pointers.has(e.pointerId)) return;
      const prev = pointers.get(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
        moved += Math.abs(dx) + Math.abs(dy);
        orbit.az -= dx * 0.006;
        orbit.pol = Math.min(1.35, Math.max(0.28, orbit.pol - dy * 0.005));
      } else if (pointers.size === 2) {
        const pts = [...pointers.values()];
        const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (lastPinch != null && d > 0) {
          orbit.r = Math.min(55, Math.max(11, orbit.r * (lastPinch / d)));
        }
        lastPinch = d;
        moved = 99; // ピンチはタップ扱いにしない
      }
    };
    const onUp = (e) => {
      if (pointers.size === 1 && moved < 7) {
        const rect = el.getBoundingClientRect();
        const m = new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1
        );
        const rc = new THREE.Raycaster();
        rc.setFromCamera(m, camera);
        const hits = rc.intersectObjects([...members.values()].map((o) => o.sp));
        if (hits.length > 0) onSelectRef.current(hits[0].object.userData.stockId);
      }
      pointers.delete(e.pointerId);
      if (pointers.size < 2) lastPinch = null;
    };
    const onWheel = (e) => {
      e.preventDefault();
      orbit.r = Math.min(55, Math.max(11, orbit.r + e.deltaY * 0.03));
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("wheel", onWheel, { passive: false });

    // リサイズ追従
    const ro = new ResizeObserver(() => {
      camera.aspect = W() / H();
      camera.updateProjectionMatrix();
      renderer.setSize(W(), H());
    });
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(moveIv);
      clearInterval(timeIv);
      ro.disconnect();
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("wheel", onWheel);
      members.forEach((o) => { o.tex.dispose(); o.sp.material.dispose(); });
      starGeo.dispose();
      renderer.dispose();
      if (el.parentNode === mount) mount.removeChild(el);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneKey]);

  return (
    <div ref={mountRef} style={{
      width: "100%", height: "min(64vh, 540px)", borderRadius: 18,
      overflow: "hidden", border: "2px solid #3b4470", background: "#0d1230",
    }} />
  );
}

/* ---- 2Dフォールバック(WebGL不可の端末用) ---- */
function Ranch2D({ stocks, onSelect }) {
  const actives = stocks.filter((s) => s.status !== "sold");
  const holds = actives.filter((s) => s.status === "hold");
  const posRef = useRef({});
  const [, force] = useState(0);
  const reduced = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const zoneOf = (s) => (s.status === "hold"
    ? { x0: 5, x1: 52, y0: 32, y1: 80 }
    : { x0: 66, x1: 91, y0: 32, y1: 80 });

  useEffect(() => {
    const p = posRef.current;
    actives.forEach((s) => {
      const z = zoneOf(s);
      const cur = p[s.id];
      const inZone = cur && cur.x >= z.x0 - 2 && cur.x <= z.x1 + 2;
      if (!cur || !inZone) {
        const x = z.x0 + Math.random() * (z.x1 - z.x0);
        const y = z.y0 + Math.random() * (z.y1 - z.y0);
        p[s.id] = { x, y, tx: x, ty: y };
      }
    });
    Object.keys(p).forEach((id) => { if (!actives.some((s) => s.id === id)) delete p[id]; });
    force((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stocks]);

  useEffect(() => {
    if (reduced) return;
    const iv = setInterval(() => {
      const p = posRef.current;
      actives.forEach((s) => {
        const c = p[s.id]; if (!c) return;
        const tier = moveTierOf(s);
        if (tier === 3) return;
        const speed = [3.0, 1.6, 0.7][tier];
        const restart = [0.3, 0.14, 0.05][tier];
        const dx = c.tx - c.x, dy = c.ty - c.y, d = Math.hypot(dx, dy);
        if (d < 1) {
          if (Math.random() < restart) {
            const z = zoneOf(s);
            c.tx = z.x0 + Math.random() * (z.x1 - z.x0);
            c.ty = z.y0 + Math.random() * (z.y1 - z.y0);
          }
        } else {
          const step = Math.min(speed, d);
          c.x += (dx / d) * step; c.y += (dy / d) * step;
        }
      });
      force((n) => n + 1);
    }, 480);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stocks, reduced]);

  const sorted = [...actives].sort((a, b) => (posRef.current[a.id]?.y || 0) - (posRef.current[b.id]?.y || 0));
  return (
    <div style={{
      position: "relative", width: "100%", height: "min(64vh, 540px)", borderRadius: 18,
      overflow: "hidden", border: "2px solid #3b4470",
      background: "linear-gradient(180deg, #16204a 0%, #1b2f63 22%, #1d4d33 26%, #17402b 60%, #123322 100%)",
    }}>
      <div style={{ position: "absolute", left: "59%", top: "27%", bottom: 0, width: 0, borderLeft: "3px dashed #8a6a3a" }} />
      <div style={{ position: "absolute", left: "3%", top: "20%", fontFamily: "'DotGothic16', monospace", fontSize: 11, color: "#ffd166", background: "#0e1122cc", border: "1px solid #ffd16655", borderRadius: 8, padding: "3px 9px" }}>
        ⭐ ぼくじょう（{holds.length}）
      </div>
      <div style={{ position: "absolute", right: "3%", top: "20%", fontFamily: "'DotGothic16', monospace", fontSize: 11, color: "#60a5fa", background: "#0e1122cc", border: "1px solid #60a5fa55", borderRadius: 8, padding: "3px 9px" }}>
        👀 やせい（{actives.length - holds.length}）
      </div>
      {sorted.map((s) => {
        const c = posRef.current[s.id];
        if (!c) return null;
        const tier = moveTierOf(s);
        const moving = tier < 3 && Math.hypot(c.tx - c.x, c.ty - c.y) >= 1;
        return (
          <button key={s.id} onClick={() => onSelect(s.id)} style={{
            all: "unset", cursor: "pointer", position: "absolute",
            left: `${c.x}%`, top: `${c.y}%`, transform: "translate(-50%,-70%)",
            transition: reduced ? "none" : "left .48s linear, top .48s linear",
            textAlign: "center", zIndex: Math.round(c.y),
          }}>
            <div style={{ position: "relative", display: "inline-block", animation: !reduced && moving && tier === 0 ? "kzHop .48s ease-in-out infinite" : "none" }}>
              <Creature stock={s} size={44} sleeping={tier === 3} />
              {tier === 3 && <span style={{ position: "absolute", top: -8, right: -14, fontSize: 12 }}>💤</span>}
            </div>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: "#eef1ff", background: "#0e1122bb", borderRadius: 999, padding: "1px 7px", marginTop: 2, whiteSpace: "nowrap" }}>
              {s.name}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ---- 牧場ビュー(WebGL判定つき) ---- */
function RanchView({ stocks, onSelect }) {
  const [mode, setMode] = useState(() => {
    try {
      const c = document.createElement("canvas");
      return (c.getContext("webgl") || c.getContext("experimental-webgl")) ? "3d" : "2d";
    } catch (e) { return "2d"; }
  });
  const phase = PHASE_INFO[dayPhase()];
  return (
    <div>
      {mode === "3d"
        ? <Ranch3D stocks={stocks} onSelect={onSelect} onFallback={() => setMode("2d")} />
        : <Ranch2D stocks={stocks} onSelect={onSelect} />}
      <div style={{ fontSize: 10.5, color: "#5b6284", marginTop: 8, lineHeight: 1.7 }}>
        {mode === "3d"
          ? <>いまは{phase.label}（端末の時計と連動して昼・夕方・夜に変化）。<b style={{ color: "#8b93b8" }}>ドラッグで回転、ピンチ/ホイールでズーム、タップで詳細</b>が開きます。柵の左がぼくじょう（保有）、右がやせい（ウォッチ中）。</>
          : <>この端末では3D表示が使えないため2D表示です。タップで詳細が開きます。柵の左がぼくじょう（保有）、右がやせい（ウォッチ中）。</>}
        🌱新鮮な銘柄ほど元気に跳ね、🍂古いとのんびり、🥀90日超は眠ります（動き＝記録の鮮度で、株価とは無関係です）。リリースした銘柄は野生に帰るため現れません。
      </div>
    </div>
  );
}

/* ============ メイン ============ */


export default function KabuDex() {
  const [stocks, setStocks] = useState(null);
  const [notesCache, setNotesCache] = useState({});
  const [notesLoading, setNotesLoading] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [formMode, setFormMode] = useState(null); // null|'add'|'edit'
  const [panel, setPanel] = useState(null); // null|'noteEditor'|'ai'|'party'|'badges'
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [saveState, setSaveState] = useState("");
  const [getFlash, setGetFlash] = useState(null);
  const [evoFlash, setEvoFlash] = useState(null); // {name, stage}
  const [view, setView] = useState("dex"); // 'dex'|'ranch'

  /* 読み込み(初回のみ。1回リトライ。失敗時は既存データを守るため上書きしない) */
  useEffect(() => {
    (async () => {
      let data = null;
      let readOk = false;
      for (let attempt = 0; attempt < 2 && !readOk; attempt++) {
        try {
          const res = await storage.get(STORAGE_KEY);
          if (res && res.value) data = JSON.parse(res.value);
          readOk = true; // 取得処理自体は成功(キー未作成で例外の場合はリトライへ)
        } catch (e) {
          await new Promise((r) => setTimeout(r, 400)); // 一時的な失敗に備えて再試行
        }
      }
      if (!data || !Array.isArray(data.stocks)) {
        data = { stocks: SEED.map((s, i) => ({ ...s, id: uid(), no: i + 1, noteCount: 0, lastResearch: "" })) };
        // 読み込みが2回とも例外だった場合は、既存データが生きている可能性があるため上書きしない
        if (readOk) {
          try { await storage.set(STORAGE_KEY, JSON.stringify(data)); } catch (e) { /* 後続保存で再試行 */ }
        } else {
          setSaveState("⚠ 保存データを読み込めませんでした（上書きは行っていません。開き直してみてください）");
          setTimeout(() => setSaveState(""), 6000);
        }
      }
      // v1→v2移行: 不足フィールドを補完(既存データは壊さない)
      const migrated = data.stocks.map((s) => ({
        noteCount: 0, lastResearch: "", triggers: [], logs: [], bullets: [], risks: [], ...s,
      }));
      setStocks(migrated);
    })();
  }, []);

  const persist = async (next) => {
    setStocks(next);
    try {
      setSaveState("保存中…");
      const ok = await storage.set(STORAGE_KEY, JSON.stringify({ stocks: next }));
      setSaveState(ok ? "✓ 保存済み" : "⚠ 保存に失敗");
    } catch (e) {
      setSaveState("⚠ 保存に失敗（再操作で再試行）");
    }
    setTimeout(() => setSaveState(""), 2000);
  };

  /* ステージ跨ぎ検知つきの銘柄更新 */
  const persistWithEvoCheck = (next, id) => {
    const before = stocks.find((s) => s.id === id);
    const after = next.find((s) => s.id === id);
    if (before && after) {
      const s1 = stageOf(calcLevel(before)).no;
      const s2 = stageOf(calcLevel(after)).no;
      if (s2 > s1) {
        setEvoFlash({ name: after.name, stage: stageOf(calcLevel(after)) });
        setTimeout(() => setEvoFlash(null), 2600);
      }
    }
    persist(next);
  };

  const addStock = (f) => {
    const maxNo = stocks.reduce((m, s) => Math.max(m, s.no || 0), 0);
    const ns = { ...f, id: uid(), no: maxNo + 1, logs: f.logs || [], noteCount: 0, lastResearch: "" };
    persist([...stocks, ns]);
    setFormMode(null);
    setGetFlash(ns.name);
    setTimeout(() => setGetFlash(null), 2000);
  };

  const updateStock = (updated, openEdit) => {
    if (openEdit) { setFormMode("edit"); return; }
    persist(stocks.map((s) => (s.id === updated.id ? updated : s)));
  };

  const saveEdit = (f) => {
    persist(stocks.map((s) => (s.id === selectedId ? { ...s, ...f, id: s.id, no: s.no, logs: s.logs, noteCount: s.noteCount, lastResearch: s.lastResearch } : s)));
    setFormMode(null);
  };

  const deleteStock = async (id) => {
    persist(stocks.filter((s) => s.id !== id));
    setSelectedId(null);
    try { await storage.delete(noteKey(id)); } catch (e) { /* 記録なしならOK */ }
    setNotesCache((c) => { const n = { ...c }; delete n[id]; return n; });
  };

  const addLogEntry = (id, text) => {
    const next = stocks.map((s) => (s.id === id ? { ...s, logs: [...s.logs, { date: today(), text }], lastResearch: today() } : s));
    persistWithEvoCheck(next, id);
  };

  /* ---- 生態調査記録の読み書き ---- */
  const loadNotes = async (stockId) => {
    if (notesCache[stockId]) return;
    setNotesLoading(true);
    let notes = [];
    try {
      const res = await storage.get(noteKey(stockId));
      if (res && res.value) notes = JSON.parse(res.value);
      if (!Array.isArray(notes)) notes = [];
    } catch (e) { notes = []; }
    setNotesCache((c) => ({ ...c, [stockId]: notes }));
    setNotesLoading(false);
  };

  const saveNotes = async (stockId, notes, touch) => {
    const prev = notesCache[stockId] || [];
    setNotesCache((c) => ({ ...c, [stockId]: notes }));
    try {
      await storage.set(noteKey(stockId), JSON.stringify(notes));
    } catch (e) {
      // 保存できなかったらキャッシュを巻き戻す(見た目と保存内容のズレを防ぐ)
      setNotesCache((c) => ({ ...c, [stockId]: prev }));
      setSaveState("⚠ 記録の保存に失敗しました。もう一度お試しください");
      setTimeout(() => setSaveState(""), 3000);
      return false;
    }
    // touch=true(記録の追加)のときだけ鮮度(最終調査日)を更新。削除では更新しない
    const next = stocks.map((s) => (s.id === stockId
      ? { ...s, noteCount: notes.length, lastResearch: touch ? today() : s.lastResearch }
      : s));
    persistWithEvoCheck(next, stockId);
    return true;
  };

  const addNote = async (note) => {
    const cur = notesCache[selectedId] || [];
    const ok = await saveNotes(selectedId, [...cur, note], true);
    if (ok) setPanel(null); // 失敗時はエディタを開いたままにして入力を守る
    return ok;
  };

  const deleteNote = async (noteId) => {
    const cur = notesCache[selectedId] || [];
    await saveNotes(selectedId, cur.filter((n) => n.id !== noteId), false);
  };

  const saveAiDraft = async (text) => {
    const cur = notesCache[selectedId] || [];
    const ok = await saveNotes(selectedId, [...cur, { id: uid(), date: today(), title: "AI下書き（要検証）", body: text, diff: "", ai: true }], true);
    if (ok) setPanel(null);
    return ok;
  };

  const openDetail = (id) => { setSelectedId(id); loadNotes(id); };

  if (stocks === null) {
    return (
      <div style={{ ...pageStyle, display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <div style={{ fontFamily: "'DotGothic16', monospace", color: "#8b93b8", fontSize: 14 }}>図鑑を起動中…</div>
      </div>
    );
  }

  const selected = stocks.find((s) => s.id === selectedId) || null;
  const filtered = stocks.filter((s) =>
    (filterType === "all" || s.type === filterType) &&
    (filterStatus === "all" || s.status === filterStatus) &&
    (search === "" || s.name.includes(search) || String(s.code).toUpperCase().includes(search.toUpperCase()))
  );

  const holdCount = stocks.filter((s) => s.status === "hold").length;
  const watchCount = stocks.filter((s) => s.status === "watch").length;
  const totalLv = stocks.reduce((a, s) => a + calcLevel(s), 0);
  const trainerLv = 1 + Math.floor(totalLv / 5);
  const typesSeen = new Set(stocks.map((s) => s.type)).size;
  const unlockedCount = evalAchievements(stocks).size;
  const staleCount = stocks.filter((s) => { const f = freshInfo(s); return f && f.days !== null && f.days > 90; }).length;

  return (
    <div style={pageStyle}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DotGothic16&display=swap');
        @keyframes kzBounce { 0%{transform:scale(1)} 30%{transform:scale(1.35) rotate(-8deg)} 60%{transform:scale(.95)} 100%{transform:scale(1)} }
        @keyframes kzRise { 0%{opacity:0; transform:translate(-50%,10px)} 20%{opacity:1} 80%{opacity:1} 100%{opacity:0; transform:translate(-50%,-14px)} }
        @keyframes kzPop { 0%{opacity:0; transform:translate(-50%,-50%) scale(.6)} 40%{opacity:1; transform:translate(-50%,-50%) scale(1.08)} 70%{transform:translate(-50%,-50%) scale(1)} 100%{opacity:0; transform:translate(-50%,-50%) scale(1)} }
        @keyframes kzHolo { 0%{background-position:0% 50%} 100%{background-position:300% 50%} }
        @keyframes kzAura { 0%,100%{transform:scale(1)} 50%{transform:scale(1.07)} }
        @keyframes kzHop { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-7px)} }
        @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
        ::placeholder { color: #4a5170; }
      `}</style>

      {/* ゲット演出 */}
      {getFlash && (
        <div style={{ position: "fixed", top: "40%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 100, background: "#0e1122", border: "2px solid #ffd166", borderRadius: 16, padding: "18px 28px", textAlign: "center", boxShadow: "0 0 40px rgba(255,209,102,.4)", animation: "kzPop 2s ease forwards", pointerEvents: "none" }}>
          <div style={{ fontSize: 34 }}>🎉</div>
          <div style={{ fontFamily: "'DotGothic16', monospace", color: "#ffd166", fontSize: 16, marginTop: 4 }}>{getFlash} を図鑑に登録した！</div>
        </div>
      )}

      {/* 進化演出 */}
      {evoFlash && (
        <div style={{ position: "fixed", top: "40%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 100, background: "#0e1122", borderRadius: 16, padding: 2, backgroundImage: "linear-gradient(#0e1122,#0e1122), linear-gradient(120deg,#f0abfc,#ffd166,#4ade80,#60a5fa,#f0abfc)", backgroundOrigin: "border-box", backgroundClip: "padding-box, border-box", border: "2px solid transparent", boxShadow: "0 0 50px rgba(240,171,252,.4)", animation: "kzPop 2.6s ease forwards", pointerEvents: "none" }}>
          <div style={{ padding: "18px 28px", textAlign: "center" }}>
            <div style={{ fontSize: 34 }}>✨</div>
            <div style={{ fontFamily: "'DotGothic16', monospace", color: "#f0abfc", fontSize: 16, marginTop: 4 }}>
              シンカ！ {evoFlash.name} は<br />STAGE {evoFlash.stage.no}「{evoFlash.stage.name}」になった！
            </div>
          </div>
        </div>
      )}

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "20px 14px 60px" }}>
        {/* ヘッダー */}
        <div style={{ background: "linear-gradient(135deg, #1a1040 0%, #0e1122 60%)", border: "2px solid #3b4470", borderRadius: 18, padding: "18px 18px 14px", marginBottom: 16, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: 12, right: 16, display: "flex", gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#f87171", boxShadow: "0 0 8px #f87171" }} />
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ffd166", boxShadow: "0 0 8px #ffd166" }} />
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 8px #4ade80" }} />
          </div>
          <div style={{ fontFamily: "'DotGothic16', monospace", fontSize: 24, color: "#f2f4ff", letterSpacing: 3 }}>
            📕 銘柄図鑑 <span style={{ color: "#ffd166" }}>KABU DEX</span>
          </div>
          <div style={{ fontSize: 12, color: "#8b93b8", marginTop: 2 }}>集めて、調べて、育てる。生態調査記録つき図鑑</div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 12 }}>
            {[
              ["トレーナーLv", trainerLv, "#ffd166"],
              ["登録", `${stocks.length}銘柄`, "#f2f4ff"],
              ["ホカク済み", `${holdCount}`, "#4ade80"],
              ["ウォッチ中", `${watchCount}`, "#60a5fa"],
              ["発見タイプ", `${typesSeen}/${Object.keys(TYPES).length}`, "#c084fc"],
            ].map(([k, v, c]) => (
              <div key={k} style={{ fontFamily: "'DotGothic16', monospace", fontSize: 12 }}>
                <span style={{ color: "#5b6284" }}>{k} </span>
                <span style={{ color: c, fontSize: 15 }}>{v}</span>
              </div>
            ))}
            {saveState && <span style={{ fontSize: 11, color: "#8b93b8", alignSelf: "center" }}>{saveState}</span>}
          </div>
          {staleCount > 0 && (
            <div style={{ marginTop: 10, fontSize: 11.5, color: "#fca5a5" }}>
              🥀 90日以上調査していない銘柄が{staleCount}件あります（記録が風化中）
            </div>
          )}
        </div>

        {/* ビュー切り替え */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {[["dex", "📕 図鑑"], ["ranch", "🏞 ぼくじょう"]].map(([k, label]) => (
            <button key={k} onClick={() => setView(k)} style={{
              all: "unset", cursor: "pointer", padding: "8px 18px", borderRadius: 10,
              fontFamily: "'DotGothic16', monospace", fontSize: 13, letterSpacing: 1,
              border: `1.5px solid ${view === k ? "#ffd166" : "#252b48"}`,
              background: view === k ? "#ffd16618" : "transparent",
              color: view === k ? "#ffd166" : "#5b6284",
            }}>{label}</button>
          ))}
        </div>

        {view === "ranch" && <RanchView stocks={stocks} onSelect={openDetail} />}

        {view === "dex" && (<>
        {/* 操作列 */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
          <button onClick={() => { setSelectedId(null); setFormMode("add"); }} style={{ all: "unset", cursor: "pointer", background: "#ffd166", color: "#221a00", fontWeight: 800, fontSize: 13, borderRadius: 10, padding: "9px 16px", boxShadow: "0 0 14px rgba(255,209,102,.25)" }}>
            ＋ あたらしくゲット
          </button>
          <button onClick={() => setPanel("party")} style={{ ...btnStyle("#60a5fa"), padding: "8px 13px" }}>📊 パーティ分析</button>
          <button onClick={() => setPanel("badges")} style={{ ...btnStyle("#ffd166"), padding: "8px 13px" }}>🎖 実績 {unlockedCount}/{ACHIEVEMENTS.length}</button>
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 名前・コードで検索"
            style={{ flex: 1, minWidth: 150, background: "#12152a", border: "1px solid #2a3050", borderRadius: 10, color: "#eef1ff", padding: "9px 12px", fontSize: 13, outline: "none" }}
          />
        </div>

        {/* フィルタ */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
          <FilterChip active={filterStatus === "all"} onClick={() => setFilterStatus("all")} color="#8b93b8">すべて</FilterChip>
          {Object.entries(STATUSES).map(([k, s]) => (
            <FilterChip key={k} active={filterStatus === k} onClick={() => setFilterStatus(filterStatus === k ? "all" : k)} color={s.color}>{s.icon} {s.label}</FilterChip>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
          <FilterChip active={filterType === "all"} onClick={() => setFilterType("all")} color="#8b93b8">全タイプ</FilterChip>
          {Object.entries(TYPES).map(([k, t]) => (
            <FilterChip key={k} active={filterType === k} onClick={() => setFilterType(filterType === k ? "all" : k)} color={t.color}>{t.icon} {t.label}</FilterChip>
          ))}
        </div>

        {/* 図鑑グリッド */}
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "50px 20px", color: "#5b6284", border: "2px dashed #2a3050", borderRadius: 16, fontSize: 13 }}>
            <div style={{ fontSize: 34, marginBottom: 8 }}>🌿</div>
            条件に合う銘柄がいません。<br />「＋あたらしくゲット」でリサーチ済みの銘柄を登録しよう
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))" }}>
            {filtered.map((s) => (
              <DexCard key={s.id} stock={s} onClick={() => openDetail(s.id)} />
            ))}
          </div>
        )}
        </>)}

        <div style={{ textAlign: "center", fontSize: 10.5, color: "#3f4666", marginTop: 30, lineHeight: 1.8 }}>
          データと調査記録はこのアカウント専用に保存され、次回も引き継がれます（テキストのみ・画像不可）。<br />
          Lv・CP・レアリティ・鮮度は研究の蓄積を表す遊びの指標で、売買推奨ではありません。AI下書きの数値は必ず検証してください。
        </div>
      </div>

      {/* モーダル群 */}
      {selected && formMode !== "edit" && panel !== "noteEditor" && panel !== "ai" && (
        <DetailModal
          stock={selected}
          notes={notesCache[selected.id] || []}
          notesLoading={notesLoading && !notesCache[selected.id]}
          onClose={() => setSelectedId(null)}
          onUpdate={updateStock}
          onDelete={deleteStock}
          onLog={addLogEntry}
          onOpenNoteEditor={() => setPanel("noteEditor")}
          onOpenAi={() => setPanel("ai")}
          onDeleteNote={deleteNote}
        />
      )}
      {formMode === "add" && <StockForm onSave={addStock} onCancel={() => setFormMode(null)} />}
      {formMode === "edit" && selected && <StockForm initial={selected} onSave={saveEdit} onCancel={() => setFormMode(null)} />}
      {panel === "noteEditor" && selected && (
        <NoteEditor stock={selected} hasPrev={(notesCache[selected.id] || []).length > 0} onSave={addNote} onCancel={() => setPanel(null)} />
      )}
      {panel === "ai" && selected && (
        <AiAssistant stock={selected} onSaveAsNote={saveAiDraft} onClose={() => setPanel(null)} />
      )}
      {panel === "party" && <PartyModal stocks={stocks} onClose={() => setPanel(null)} />}
      {panel === "badges" && <BadgeModal stocks={stocks} onClose={() => setPanel(null)} />}
    </div>
  );
}

function FilterChip({ active, onClick, color, children }) {
  return (
    <button onClick={onClick} style={{
      all: "unset", cursor: "pointer", padding: "4px 11px", borderRadius: 999,
      border: `1.5px solid ${active ? color : "#252b48"}`,
      background: active ? `${color}1a` : "transparent",
      color: active ? color : "#5b6284", fontSize: 11.5, fontWeight: 700,
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
