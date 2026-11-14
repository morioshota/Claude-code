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

/* 進化演出ガチャ(進化の瞬間に抽選される。研究行動だけがトリガー・株価は無関係=不変条件5)
   2026-11 オーナー要望で「種類」を増やした: 階級(通常70%/レア25%/超レア5%)は従来どおり、
   レアと超レアの中で演出の種類を引く。レア以上を引くと、その後のクリーチャーに
   さりげない「なごり」(ときどき花びらが舞う等)が残る。なごりは stock.evoFx に永久保存(不変条件6の考え方)。
   進化のたびに引くので、より上の階級を引いたときだけ なごり が入れ替わる(同じ階級なら最初のまま) */
export const EVO_FX_TIERS = [
  { key: "ultra",  rate: 0.05, name: "超レア演出" },
  { key: "rare",   rate: 0.25, name: "レア演出" },
  { key: "normal", rate: 0.70, name: "通常演出" },
];
export const EVO_FX_TIER_NAME = { normal: "ふつう", rare: "レア", ultra: "超レア" };
const TIER_RANK = { normal: 0, rare: 1, ultra: 2 };

// 演出の種類。trace=なごりの説明(カードのうら面・セレモニーに出す)
export const EVO_FX = {
  kirari:  { tier: "normal", name: "きらり",           icon: "✨", trace: null },
  ryusei:  { tier: "rare",   name: "ながれぼし",       icon: "🌠", trace: "ときどき頭の上を流れ星が横切る" },
  sakura:  { tier: "rare",   name: "はなふぶき",       icon: "🌸", trace: "ときどき花びらがひらりと舞う" },
  inazuma: { tier: "rare",   name: "いなずま",         icon: "⚡", trace: "ときどき体にパチッと電気が走る" },
  shabon:  { tier: "rare",   name: "しゃぼんだま",     icon: "🫧", trace: "ときどき足元からしゃぼん玉がのぼる" },
  niji:    { tier: "ultra",  name: "にじのかなた",     icon: "🌈", trace: "体のまわりに虹色の光がゆっくりめぐる" },
  ougon:   { tier: "ultra",  name: "おうごんのかがやき", icon: "👑", trace: "体のふちがうっすら金色に光り、ときどききらめく" },
};
const KINDS_OF = (tier) => Object.keys(EVO_FX).filter((k) => EVO_FX[k].tier === tier);

/* 抽選 → { tier, kind } */
export const rollEvoFx = (rand = Math.random) => {
  const r = rand();
  const tier = r < EVO_FX_TIERS[0].rate ? "ultra" : r < EVO_FX_TIERS[0].rate + EVO_FX_TIERS[1].rate ? "rare" : "normal";
  const kinds = KINDS_OF(tier);
  return { tier, kind: kinds[Math.floor(rand() * kinds.length) % kinds.length] };
};

/* なごりの種類(なければ null)。種類を保存する前の古いデータは、階級(evoFxBest)と証券コードから決定論的に決める */
export const evoFxOf = (stock) => {
  if (!stock) return null;
  if (stock.evoFx && EVO_FX[stock.evoFx]) return stock.evoFx;
  const tier = stock.evoFxBest;
  if (tier !== "rare" && tier !== "ultra") return null;
  const kinds = KINDS_OF(tier);
  const code = String(stock.code || stock.name || "");
  let h = 0;
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) >>> 0;
  return kinds[h % kinds.length];
};

/* 進化のときに引いた結果を銘柄に書き込む(演出の履歴・最高の階級・なごり) */
export const applyEvoFxRoll = (stock, roll, stageNo, date) => {
  const curTier = stock.evoFxBest;
  const better = TIER_RANK[roll.tier] > (TIER_RANK[curTier] ?? -1);
  const out = { ...stock, evoFxBest: better ? roll.tier : curTier, evoFxLog: [...(stock.evoFxLog || []), { stage: stageNo, kind: roll.kind, date }] };
  // なごりは「より上の階級」を引いたときだけ入れ替わる。古いデータ(種類なし)の子は、いまの なごり を先に確定させてから比べる
  const curKind = evoFxOf(stock);
  if (roll.tier !== "normal" && (better || !curKind)) out.evoFx = roll.kind;
  else if (curKind) out.evoFx = curKind;
  return out;
};
