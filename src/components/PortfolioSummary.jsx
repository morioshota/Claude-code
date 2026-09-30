/* 💼 保有資産のまとめ(図鑑のヘッダー)  2026-09末
   参考株価(遅延)×保有情報の事実を通貨ごとに集計する。為替換算・良し悪しの判定・推奨はしない。
   ＋と−は資産の推移(AssetHistory)と同じ2色(空色/薄紫)。タップで分析タブの推移へ */
import { fmtMoney, fmtPct } from "../lib/holdings.js";
import { summarize } from "../lib/portfolio.js";
import { daySummary, fmtDayPct } from "../lib/daily.js";

const PLUS = "#7dd3fc", MINUS = "#c4b5fd";
const mono = "'DotGothic16', ui-monospace, monospace";

export function PortfolioSummary({ stocks, quotes, onOpen, onOpenToday }) {
  const { list, missing, held } = summarize(stocks, quotes);
  const days = Object.fromEntries(daySummary(stocks, quotes).map((d) => [d.currency, d]));
  if (held === 0) return null;
  return (
    <div onClick={onOpen} role="button" title="分析タブで資産の推移を見る"
      style={{ marginTop: 12, cursor: "pointer", borderRadius: 12, padding: "10px 12px", background: "rgba(255,255,255,.035)", border: "1px solid rgba(255,255,255,.08)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: "#8b93b8" }}>
        <span style={{ fontFamily: mono, letterSpacing: 1 }}>💼 保有資産</span>
        <span style={{ fontSize: 10 }}>推移を見る ›</span>
      </div>
      {list.length === 0 && <div style={{ fontSize: 11.5, color: "#5b6284", marginTop: 4 }}>参考株価を取得中…</div>}
      {list.map((c) => {
        const tug = c.gain - c.loss || 1;
        return (
          <div key={c.currency} style={{ marginTop: 6 }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "0 12px" }}>
              <span style={{ fontFamily: mono, fontSize: 20, color: "#f2f4ff", fontVariantNumeric: "tabular-nums" }}>{fmtMoney(c.value, c.currency)}</span>
              <span style={{ fontSize: 12.5, color: "#f2f4ff", fontVariantNumeric: "tabular-nums" }}>
                含み損益 <b>{fmtMoney(c.pnl, c.currency, true)}</b><span style={{ color: "#8b93b8" }}>（{fmtPct(c.pct)}）</span>
              </span>
              <span style={{ fontSize: 11, color: "#8b93b8" }}>投資額 {fmtMoney(c.cost, c.currency)}</span>
            </div>
            {days[c.currency] && (
              <div onClick={(e) => { if (onOpenToday) { e.stopPropagation(); onOpenToday(); } }}
                style={{ fontSize: 12, color: "#dfe4ff", marginTop: 3, fontVariantNumeric: "tabular-nums" }}>
                📅 きょう <b>{fmtMoney(days[c.currency].pnl, c.currency, true)}</b>
                <span style={{ color: "#8b93b8" }}>（{fmtDayPct(days[c.currency].pct)}）＋{days[c.currency].upN}・−{days[c.currency].downN}銘柄 ›</span>
              </div>
            )}
            <div style={{ display: "flex", height: 7, borderRadius: 4, overflow: "hidden", marginTop: 6, background: "#1b2140" }}>
              <div style={{ width: `${(c.gain / tug) * 100}%`, background: PLUS }} />
              <div style={{ width: `${(-c.loss / tug) * 100}%`, background: MINUS }} />
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 12px", fontSize: 11, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
              <span style={{ color: PLUS }}>含み益 {c.gainN}銘柄 <span style={{ color: "#8b93b8" }}>{fmtMoney(c.gain, c.currency, true)}</span></span>
              <span style={{ color: MINUS }}>含み損 {c.lossN}銘柄 <span style={{ color: "#8b93b8" }}>{fmtMoney(c.loss, c.currency, true)}</span></span>
              {c.evenN > 0 && <span style={{ color: "#8b93b8" }}>±0 {c.evenN}銘柄</span>}
            </div>
          </div>
        );
      })}
      <div style={{ fontSize: 9.5, color: "#5b6284", marginTop: 6 }}>
        参考株価（遅延）による集計・通貨ごと（為替換算なし）{missing > 0 ? `・株価未取得 ${missing}銘柄` : ""}
      </div>
    </div>
  );
}
