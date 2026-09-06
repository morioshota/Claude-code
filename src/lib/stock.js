/* 銘柄の派生値: Lv/CP/ステージ/鮮度/実績判定/動きの元気さ
   いずれも「研究の蓄積量」の遊び指標であり売買推奨ではない */

import { STAGES } from "../data/constants.js";
import { daysSince, hashStr, mulberry32 } from "./util.js";

const calcLevel = (s) => 1 + (s.logs?.length || 0) + (s.noteCount || 0) * 3;

const calcCP = (s) =>
  rarityOf(s) * 120 + calcLevel(s) * 35 + (s.bullets?.length || 0) * 20 + (s.risks?.length || 0) * 5;

const stageOf = (lv) => {
  let st = STAGES[0];
  for (const s of STAGES) if (lv >= s.min) st = s;
  return st;
};

/* レアリティは研究レベルから自動で決まる(ステージ番号と同じ1〜5)。
   自分で選ぶ設定は廃止した——「研究の蓄積量の指標」という位置づけと合わせるため。
   旧データの s.rarity は参照しない */
const rarityOf = (s) => stageOf(calcLevel(s)).no;

/* デンセツ(ST5)のカードに付く特別演出。5種のうち1つ。
   ⚠ 抽選は「ランダムに見える」が、シードは証券コードなので**永久に変わらない**
   （不変条件1「姿の決定論」/6「抽選結果は永久保存」と同じ考え方。
     内部IDやDate.now()をシードにすると開くたびに変わってしまう）*/
const UR_FX = ["spangle", "ember", "aurora", "prism", "rays"];
const urFxOf = (s) => UR_FX[Math.floor(mulberry32(hashStr(String(s.code || s.id || "") + ":urfx"))() * UR_FX.length) % UR_FX.length];

/* ---- 鮮度(最終調査日からの経過) ---- */

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
  if (stocks.some((s) => stageOf(calcLevel(s)).no >= 4)) unlocked.add("stage4");
  if (stocks.some((s) => stageOf(calcLevel(s)).no >= 5)) unlocked.add("stage5");
  if (holds.length > 0 && holds.every((s) => (s.triggers || []).length > 0)) unlocked.add("risk");
  if (holds.length > 0 && holds.every((s) => { const d = daysSince(s.lastResearch); return d !== null && d <= 45; })) unlocked.add("fresh");
  if (stocks.some((s) => s.shiny)) unlocked.add("shiny1");
  if (stocks.some((s) => s.evoFxBest === "ultra")) unlocked.add("ultraEvo");
  if (stocks.some((s) => s.lastTriggerCheck)) unlocked.add("check1");
  return unlocked;
};

const moveTierOf = (stock) => {
  const f = freshInfo(stock);
  if (!f || f.days === null) return 2;
  if (f.days <= 14) return 0;
  if (f.days <= 45) return 1;
  if (f.days <= 90) return 2;
  return 3;
};

// 実時間→時間帯(端末の時計を使用)

export { calcLevel, calcCP, stageOf, rarityOf, urFxOf, UR_FX, freshInfo, evalAchievements, moveTierOf };
