/* 👀 ねらいめライン(2026-11・オーナー要望)
   ウォッチ中の銘柄で、🧭つぎの一手に控えた「指値」(stock.plan.entries・最大3段)に
   参考株価が近づいた/届いたことを知らせる。にげるライン(損切り)の逆向き版。
   方針(CLAUDE.md): 伝えるのは「あなたが決めた指値までの距離・到達」という事実だけ。
   「買い時」「チャンス」など売買を勧める言葉は使わない。株価は遅延データである旨を必ず添える */

import { fmtMoney } from "./holdings.js";

export const AIM_NEAR_PCT = 5; // 指値まであと5%以内で「まもなく」(オーナー指定)

/* ねらいめラインを持つ銘柄か(ウォッチ中で、指値が1つ以上ある) */
export const hasAim = (stock) =>
  !!stock && stock.status === "watch" && ((stock.plan && stock.plan.entries) || []).some((e) => Number(e.price) > 0);

/* 状態。null(対象外/株価なし) か
   { state: "hit"|"near"|"far", entry:{label,price}, dist, next?:{entry, dist}, close }
   - 指値は高いほうから順に届く(株価が下がって届く)ので、高い順に見る
   - hit: 1つ以上届いた。entry=届いたうちいちばん深い段、next=まだ届いていない次の段とその距離
   - near/far: まだどれも届いていない。entry=いちばん近い(高い)段、dist=あと何%下がれば届くか */
export function aimStateOf(stock, quote) {
  if (!hasAim(stock)) return null;
  const close = quote && typeof quote.close === "number" && quote.close > 0 ? quote.close : null;
  if (!close) return null;
  const entries = stock.plan.entries.filter((e) => Number(e.price) > 0)
    .map((e) => ({ label: e.label || "指値", price: Number(e.price) }))
    .sort((a, b) => b.price - a.price);
  const distTo = (e) => (close / e.price - 1) * 100; // 正 = まだ上にいる(あと何%下で届く)
  const reached = entries.filter((e) => close <= e.price);
  if (reached.length) {
    const entry = reached[reached.length - 1];
    const rest = entries.filter((e) => close > e.price);
    return { state: "hit", entry, dist: 0, close, next: rest.length ? { entry: rest[0], dist: distTo(rest[0]) } : null };
  }
  const entry = entries[0];
  const dist = distTo(entry);
  return { state: dist <= AIM_NEAR_PCT ? "near" : "far", entry, dist, close };
}

/* 表示用のひとこと(事実のみ) */
export const aimTextOf = (a, currency) => {
  if (!a) return "";
  const line = `${a.entry.label} ${fmtMoney(a.entry.price, currency)}`;
  if (a.state === "hit") return `ねらいめライン（${line}）に到達`;
  return `ねらいめライン（${line}）まであと${a.dist.toFixed(1)}%`;
};

export const AIM_COLOR = "#5eead4"; // 損切り(赤・黄)や＋/−(空色・薄紫)と重ならない色
