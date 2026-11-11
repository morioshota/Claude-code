/* 進化パターン: タイプ(セクター)ごとの進化プール
   ステージアップの瞬間にプールから1つ抽選し、stock.evoPattern に永久保存する。
   (姿の決定論は「抽選結果を保存する」ことで維持——開くたびに変わることはない)
   保存がない古いデータは hashStr(コード) から決定論的にフォールバックする。 */

// かざりの種類(描画ロジックは lib/sprites.js の applyEvoPattern)
// 2026-11 見直し(オーナー指摘「角やキラキラは分かるが、よく分からないものが多い」):
//   分かりにくかった7つを「ひと目で何か分かる、身につける物」に入れ替えた。
//   ツノ・ツバサ・オーラ(キラキラ)はそのまま。マントも試したが、12pxでは「赤いひれ」にしか見えなかったので はっぱ にした。
export const EVO_KINDS = {
  horns:  { name: "ツノ" },
  wings:  { name: "ツバサ" },
  aura:   { name: "キラキラ" },
  halo:   { name: "てんしのわ" },
  hat:    { name: "まほうのぼうし" },
  ribbon: { name: "リボン" },
  flower: { name: "おはな" },
  leaf:   { name: "はっぱ" },
  scarf:  { name: "マフラー" },
  wand:   { name: "ほしのつえ" },
};
export const EVO_KIND_KEYS = Object.keys(EVO_KINDS);

// 保存済みの古いかざり → 新しいかざり(データは書き換えず、読むときに読み替える。同期でも食い違わない)
const EVO_RENAME = { antenna: "halo", crest: "hat", ears: "ribbon", crystal: "flower", spikes: "leaf", tail: "scarf", flame: "wand" };
export const normEvo = (kind) => (kind ? EVO_RENAME[kind] || kind : kind);

// タイプごと3種の進化プール(はじめて進化したときの抽選用。🔮転生では全10種類から出る)
// ⚠ 並びは変えないこと: 保存の無い古いデータは hashStr(コード) % 3 でここから選ぶ(順番が変わると姿が変わる)
export const EVO_POOLS = {
  cosmo:  ["halo", "aura", "flower"],
  metal:  ["horns", "leaf", "hat"],
  spark:  ["wand", "halo", "leaf"],
  build:  ["horns", "hat", "leaf"],
  play:   ["ribbon", "hat", "aura"],
  drive:  ["wings", "leaf", "horns"],
  life:   ["ribbon", "scarf", "aura"],
  tech:   ["halo", "flower", "aura"],
  money:  ["flower", "aura", "scarf"],
  market: ["ribbon", "wings", "scarf"],
};

export const evoPoolFor = (type) => EVO_POOLS[type] || EVO_POOLS.metal;

/* 進化演出ガチャの階級(進化の瞬間に抽選される。研究行動だけがトリガー) */
export const EVO_FX_TIERS = [
  { key: "ultra",  rate: 0.05, name: "超レア演出" },
  { key: "rare",   rate: 0.25, name: "レア演出" },
  { key: "normal", rate: 0.70, name: "通常演出" },
];

export const rollEvoFx = (rand = Math.random) => {
  const r = rand();
  if (r < EVO_FX_TIERS[0].rate) return "ultra";
  if (r < EVO_FX_TIERS[0].rate + EVO_FX_TIERS[1].rate) return "rare";
  return "normal";
};
