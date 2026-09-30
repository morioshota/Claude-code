/* きょうの損益(「きょう」タブ・ヘッダー)  2026-09末・オーナー要望
   各銘柄の「前の取引日の終値 → 最新値」の差に株数を掛けた、その日の含み損益の増減(事実)。
   その日に買い増し・一部売却した株は、約定単価から数える(📒売買の記録。lib/lots.js):
     前日から持っていた株 … (最新値 − 前日終値) × 株数
     その日に買った株     … (最新値 − 買った単価) × 株数
     その日に売った株     … (売った単価 − 前日終値) × 株数
   方針(CLAUDE.md): 事実の表示のみ。赤/緑・矢印・「好調」等の評価はしない。株価は遅延データ */
import { holdingOf, pnlOf } from "./holdings.js";
import { hasTrades } from "./lots.js";

export function dayPnlOf(stock, quote) {
  const h = holdingOf(stock);
  if (!h || !quote || typeof quote.close !== "number" || typeof quote.prevClose !== "number") return null;
  const day = quote.date || "";
  const close = quote.close, prev = quote.prevClose;
  let pnl = 0, base = 0, startShares = h.shares;
  if (hasTrades(stock)) {
    const sorted = [...stock.trades].sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
    let sh = 0;
    sorted.forEach((t) => {
      const q = Number(t.shares), p = Number(t.price);
      if (!(q > 0) || !(p > 0)) return;
      const today = t.date && t.date === day;
      if (t.date && t.date > day) return; // 最新値の日より後の記録(先日付)は数えない
      if (!today) { sh += t.kind === "sell" ? -Math.min(q, sh) : q; return; }
      if (t.kind === "buy") { pnl += (close - p) * q; base += p * q; }
      else { pnl += (p - prev) * q; }
    });
    startShares = Math.max(0, sh);
    // その日に売ったぶんは前日から持っていた株から出ていく
    const soldToday = sorted.filter((t) => t.date === day && t.kind === "sell").reduce((a, t) => a + Number(t.shares || 0), 0);
    const keep = Math.max(0, startShares - soldToday);
    pnl += (close - prev) * keep;
    base += prev * startShares;
  } else if (stock.buyDate && stock.buyDate === day) {
    pnl = (close - h.avg) * h.shares; base = h.avg * h.shares; startShares = 0; // きょう買った
  } else {
    pnl = (close - prev) * h.shares; base = prev * h.shares;
  }
  const total = pnlOf(stock, quote);
  return {
    currency: quote.currency || "JPY", pnl, base, pct: base ? (pnl / base) * 100 : 0,
    close, prev, change: close - prev, changePct: prev ? ((close - prev) / prev) * 100 : 0,
    shares: h.shares, value: close * h.shares, total, date: day, time: String(quote.time || "").slice(0, 5),
  };
}

/* きょうの％は小さい値が多いので、1%未満は小数2けたまで出す */
export const fmtDayPct = (pct) => `${pct > 0 ? "+" : ""}${pct.toFixed(Math.abs(pct) < 1 ? 2 : 1)}%`;

/* 通貨ごとのまとめ */
export function daySummary(stocks, quotes) {
  const by = {};
  stocks.forEach((s) => {
    const d = dayPnlOf(s, quotes[s.id]);
    if (!d) return;
    const c = (by[d.currency] ||= { currency: d.currency, pnl: 0, base: 0, value: 0, total: 0, up: 0, down: 0, upN: 0, downN: 0, evenN: 0, n: 0, date: "", time: "" });
    c.pnl += d.pnl; c.base += d.base;
    c.value += d.value; c.total += d.total ? d.total.pnl : 0; c.n++;
    if (d.pnl > 0) { c.up += d.pnl; c.upN++; } else if (d.pnl < 0) { c.down += d.pnl; c.downN++; } else c.evenN++;
    if (d.date > c.date || (d.date === c.date && d.time > c.time)) { c.date = d.date; c.time = d.time; }
  });
  const list = Object.values(by).sort((a, b) => (a.currency === "JPY" ? -1 : b.currency === "JPY" ? 1 : 0));
  // 割合の分母=前日終値で見た時価＋その日に買ったぶんの取得額(銘柄ごとの分母の合計)
  list.forEach((c) => { c.pct = c.base ? (c.pnl / c.base) * 100 : 0; });
  return list;
}
