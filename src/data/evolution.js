/* 進化パターン: タイプ(セクター)ごとの進化プール
   ステージアップの瞬間にプールから1つ抽選し、stock.evoPattern に永久保存する。
   (姿の決定論は「抽選結果を保存する」ことで維持——開くたびに変わることはない)
   保存がない古いデータは hashStr(コード) から決定論的にフォールバックする。 */

// 装飾の種類(描画ロジックは lib/sprites.js の applyEvoPattern)
export const EVO_KINDS = {
  horns:   { name: "ツノ" },
  antenna: { name: "アンテナ" },
  wings:   { name: "ツバサ" },
  tail:    { name: "シッポ" },
  aura:    { name: "オーラ" },
  spikes:  { name: "トゲ" },
  ears:    { name: "ミミ" },
  crest:   { name: "モヒカン" },
  flame:   { name: "ホノオ" },
  crystal: { name: "クリスタル" },
};

// タイプごと3種の進化プール(セクターの雰囲気に合わせた組み合わせ)
export const EVO_POOLS = {
  cosmo:  ["antenna", "aura", "crystal"],   // 宇宙: 電波・星のオーラ・鉱石
  metal:  ["horns", "spikes", "crest"],     // 重工: 角・鋲・タテガミ
  spark:  ["flame", "antenna", "spikes"],   // エネルギー: 炎・避雷針
  build:  ["horns", "crest", "spikes"],     // 建設: クレーン角・ヘルメット
  play:   ["ears", "crest", "aura"],        // エンタメ: ネコミミ・スター
  drive:  ["wings", "spikes", "horns"],     // 運輸: 翼・エアロパーツ
  life:   ["ears", "tail", "aura"],         // 生活: ミミ・シッポ・いやし
  tech:   ["antenna", "crystal", "aura"],   // IT: アンテナ・データ結晶
  money:  ["crystal", "aura", "tail"],      // 金融: 宝石・金運オーラ
  market: ["ears", "wings", "tail"],        // 小売・商社: 商いの機動力
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
