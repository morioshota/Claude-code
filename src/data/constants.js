/* 定数・マスタデータ: タイプ/レアリティ/ステージ/実績/シード銘柄/テンプレ */

import { today } from "../lib/util.js";

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

const STAGES = [
  { min: 1,  no: 1, name: "ハッケン",  desc: "見つけたばかり",       iconSize: 32 },
  { min: 4,  no: 2, name: "カンサツ",  desc: "観察がすすんでいる",   iconSize: 40 },
  { min: 8,  no: 3, name: "カイメイ",  desc: "生態がかなり判明",     iconSize: 47 },
  { min: 15, no: 4, name: "マスター",  desc: "生態を知り尽くした",   iconSize: 54 },
];

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

const BACKUP_FORMAT = 1;

export { STORAGE_KEY, noteKey, TYPES, RARITIES, STATUSES, STAGES, ACHIEVEMENTS, SEED, MEMO_TEMPLATE, BACKUP_FORMAT };
