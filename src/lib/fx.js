/* 💱 円とドルの合計(2026-11・オーナー要望)
   参考の為替レート(Yahoo Finance の JPY=X ＝ 1ドルあたりの円・遅延)で、ドルの銘柄を円に直して足す。
   ⚠ 取得額・確定した損益も「今のレート」で換算するので、取得したときのレートとは違う＝あくまで参考の目安。画面にそう書くこと。
   レートが取れなければ合計は出さない(通貨ごとの表示はそのまま) */
import { useEffect, useState } from "react";
import { fetchSymbol } from "./quotes.js";

export const fetchUsdJpy = async (opts) => {
  const q = await fetchSymbol("JPY=X", opts);
  return q && q.close > 50 && q.close < 500 ? { rate: q.close, date: q.date, time: q.time } : null; // おかしな値は使わない
};

/* 画面で使う: { rate, date, time } か null */
export function useUsdJpy(enabled = true) {
  const [fx, setFx] = useState(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    fetchUsdJpy().then((r) => { if (alive) setFx(r); }).catch(() => {});
    return () => { alive = false; };
  }, [enabled]);
  return fx;
}

/* 通貨ごとの値 {JPY: x, USD: y} を円にそろえて足す */
export const sumJpy = (byCur, rate) => Object.entries(byCur).reduce((a, [c, v]) => a + (c === "USD" ? v * rate : c === "JPY" ? v : 0), 0);
