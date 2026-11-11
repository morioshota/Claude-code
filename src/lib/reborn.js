/* 🔮 転生(2026-11・オーナー要望「調査のし甲斐が出るように」)
   調査でたまる「転生ポイント」を使って、クリーチャーの姿を引き直す。
   - 種族はそのまま、進化のかざりが別の種類に変わる(全10種類から。今のかざりは出ない)
   - とくべつパックを読み込んだ端末では 25% でユニークキャラ(とくべつキャラ)が候補に出る
   - 引いたあと「このままにする / 転生先にする」を必ず自分で選ぶ。どちらを選んでもポイントは使う
     (使わないと、気に入るまで何度でも引き直せて調査のし甲斐が薄れる=オーナーと相談して決定)
   ポイント: 研究Lvと同じたまり方(クイックメモ+1・生態調査記録+3)。使ってもLv・ステージは下がらない。
     持ち点 = (Lv − 1) − rebornSpent。機能を入れる前からいる銘柄は、これまでの研究の半分を最初から持つ
     (rebornSpent の初期値 = 研究ぶんの半分・切り上げ。オーナー指定の案B)。
   ⚠ 不変条件6「抽選結果は永久保存」の例外(オーナー承認): 姿が変わるのは、自分で転生先を選んだときだけ。
   ⚠ 運は研究行動にだけ紐づく(不変条件5): ポイントは調査・メモでしか増えない。株価は一切関係しない */

import { calcLevel, stageOf } from "./stock.js";
import { EVO_KIND_KEYS, evoPoolFor, normEvo } from "../data/evolution.js";
import { hashStr, today } from "./util.js";

export const REBORN_COST = 10;
export const REBORN_SPECIAL_RATE = 0.25;

const earnedOf = (stock) => Math.max(0, calcLevel(stock) - 1);

/* 機能を入れる前からいる銘柄に、最初の持ち点(研究ぶんの半分)を与える。済んでいれば何もしない */
export const withRebornInit = (stock) =>
  (typeof stock.rebornSpent === "number" ? stock : { ...stock, rebornSpent: Math.ceil(earnedOf(stock) / 2) });

export const rebornPointsOf = (stock) => Math.max(0, earnedOf(stock) - (stock.rebornSpent || 0));

/* いまのかざり(保存が無い古いデータは sprites.js と同じ決め方で読む) */
export const currentEvoOf = (stock) => {
  const pool = evoPoolFor(stock.type);
  const seed = String(stock.code || stock.name || "??").toUpperCase().trim();
  return normEvo(stock.evoPattern || pool[hashStr(seed + ":evo") % pool.length]);
};

/* 転生できるか。{ok, reason} */
export const rebornStateOf = (stock) => {
  if (stock.status === "sold") return { ok: false, reason: "卒業した銘柄は転生できません" };
  if (stock.rebornOffer) return { ok: false, reason: "えらんでいない転生先があります" };
  if (stageOf(calcLevel(stock)).no < 2) return { ok: false, reason: "ステージ2（進化のかざりが付く）から転生できます" };
  const pt = rebornPointsOf(stock);
  if (pt < REBORN_COST) return { ok: false, reason: `あと${REBORN_COST - pt}ポイント` };
  return { ok: true, reason: "" };
};

/* 転生先を引く。specials=読み込み済みのとくべつキャラ(無ければかざりだけ)。返り値は offer */
export function rollReborn(stock, specials = [], rand = Math.random) {
  const others = specials.filter((s) => s.key !== stock.special);
  if (others.length && rand() < REBORN_SPECIAL_RATE) return { special: others[Math.floor(rand() * others.length)].key };
  // かざり: ユニークキャラから戻るときは全10種類、ふつうは「今のかざり以外」から
  const kinds = stock.special ? EVO_KIND_KEYS : EVO_KIND_KEYS.filter((k) => k !== currentEvoOf(stock));
  return { evoPattern: kinds[Math.floor(rand() * kinds.length)] };
}

/* ポイントを使って転生先を引いた状態にする(えらぶまで offer を銘柄に持たせる=途中でアプリを閉じても消えない) */
export const startReborn = (stock, offer) => ({ ...stock, rebornSpent: (stock.rebornSpent || 0) + REBORN_COST, rebornOffer: offer });

/* 転生先の姿を見るための仮の銘柄(保存はしない) */
export function previewReborn(stock, offer = stock.rebornOffer) {
  if (!offer) return stock;
  const { rebornOffer: _o, ...rest } = stock;
  if (offer.special) return { ...rest, special: offer.special };
  const { special: _s, specialAt: _a, ...plain } = rest;
  return { ...plain, evoPattern: offer.evoPattern };
}

/* えらぶ: accept=true で転生先に、false でこのまま。どちらでも offer は消える */
export function settleReborn(stock, accept) {
  const { rebornOffer: offer, ...rest } = stock;
  if (!offer || !accept) return rest;
  const next = previewReborn(stock, offer);
  return { ...next, ...(offer.special ? { specialAt: today() } : {}), rebornCount: (stock.rebornCount || 0) + 1, rebornAt: today() };
}
