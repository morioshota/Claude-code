/* 📅 きょう(その日の損益)  2026-09末・オーナー要望
   保有銘柄ごとの「前の取引日の終値 → 最新値」の損益(lib/daily.js)と、保有全体のその日の損益。
   開いたとき・🔄・表示中は3分ごとに取り直す(株価は遅延データ)。
   方針(CLAUDE.md): 事実の表示のみ。＋と−は赤/緑にせず空色/薄紫(資産の推移と同じ)。矢印・評価の言葉は使わない */
import { useState, useEffect, useRef } from "react";
import { Creature } from "./ui.jsx";
import { fetchHeldQuotes, holdingOf, fmtMoney, fmtPct } from "../lib/holdings.js";
import { dayPnlOf, daySummary, fmtDayPct } from "../lib/daily.js";

const PLUS = "#7dd3fc", MINUS = "#c4b5fd";
const mono = "'DotGothic16', ui-monospace, monospace";
// 既定は％(資産の推移と同じ考え方: 金額だと保有数の多い銘柄ほど大きくなり、値動きの比較にならない=オーナー要望で統一)
const SORTS = [["pct", "きょうの％が大きい順"], ["pctLo", "きょうの％が小さい順"], ["pnlHi", "きょうの損益額が大きい順"], ["pnlLo", "きょうの損益額が小さい順"], ["no", "図鑑No.順"]];
const md = (d) => { if (!d) return ""; const [, m, dd] = d.split("-"); return `${Number(m)}/${Number(dd)}`; };
const todayStr = () => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; };

export function DailyView({ stocks, onSelect, onQuotes }) {
  const [quotes, setQuotes] = useState({});
  const [loading, setLoading] = useState(true);
  const [at, setAt] = useState(null);
  const [sort, setSort] = useState(() => { try { return localStorage.getItem("kabu-daily-sort2") || "pct"; } catch (e) { return "pct"; } });
  const [barBy, setBarBy] = useState(() => { try { return localStorage.getItem("kabu-daily-bar") || "pct"; } catch (e) { return "pct"; } });
  const metric = (d) => (barBy === "pct" ? d.pct : d.pnl);
  const held = stocks.filter((s) => holdingOf(s));
  const sig = held.map((s) => `${s.id}:${s.shares}:${s.avgPrice}:${(s.trades || []).length}`).join("|");
  const busy = useRef(false);

  const load = async () => {
    if (busy.current) return;
    busy.current = true; setLoading(true);
    const m = await fetchHeldQuotes(stocks, { force: true });
    setQuotes(m); setAt(new Date()); setLoading(false); busy.current = false;
    if (onQuotes) onQuotes(m); // ヘッダー・図鑑カードも新しい値に
  };
  useEffect(() => {
    load();
    const id = setInterval(() => { if (document.visibilityState === "visible") load(); }, 3 * 60e3);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  const sums = daySummary(held, quotes);
  const rows = held.map((s) => ({ s, d: dayPnlOf(s, quotes[s.id]) }));
  const cmp = {
    pnlHi: (a, b) => (b.d ? b.d.pnl : -Infinity) - (a.d ? a.d.pnl : -Infinity),
    pnlLo: (a, b) => (a.d ? a.d.pnl : Infinity) - (b.d ? b.d.pnl : Infinity),
    pct: (a, b) => (b.d ? b.d.pct : -Infinity) - (a.d ? a.d.pct : -Infinity),
    pctLo: (a, b) => (a.d ? a.d.pct : Infinity) - (b.d ? b.d.pct : Infinity),
    no: (a, b) => (a.s.no || 0) - (b.s.no || 0),
  }[sort];
  // 円とドルは混ぜずに並べる(円の銘柄→ドルの銘柄)
  const groups = ["JPY", "USD"].map((c) => ({ c, rows: rows.filter((r) => (r.d ? r.d.currency : /^[0-9]/.test(String(r.s.code)) ? "JPY" : "USD") === c).sort(cmp) })).filter((g) => g.rows.length);

  const box = { border: "1px solid #262d4d", borderRadius: 14, background: "linear-gradient(180deg,#121731,#0e1226)", padding: "14px 14px 12px", marginBottom: 12 };

  if (held.length === 0) {
    return (
      <div style={{ ...box, fontSize: 12.5, color: "#8b93b8", lineHeight: 1.8 }}>
        📅 保有中の銘柄に「株数」と「平均取得単価」を入れると、ここで銘柄ごとのきょうの損益が見られます。
      </div>
    );
  }

  return (
    <div>
      {/* 保有全体のきょう */}
      <div style={box}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: mono, fontSize: 14, color: "#f2f4ff", letterSpacing: 1 }}>📅 きょうの損益</span>
          <button onClick={load} disabled={loading} style={{ all: "unset", cursor: "pointer", fontSize: 11, color: "#ffd166", border: "1px solid #ffd16666", borderRadius: 8, padding: "4px 10px", opacity: loading ? 0.5 : 1 }}>
            {loading ? "取得中…" : "🔄 更新"}
          </button>
        </div>
        {sums.length === 0 && <div style={{ fontSize: 12, color: "#5b6284", marginTop: 8 }}>{loading ? "株価を取得中…" : "株価を取得できませんでした"}</div>}
        {sums.map((c) => {
          const tug = c.up - c.down || 1;
          return (
            <div key={c.currency} style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, color: "#8b93b8" }}>
                {md(c.date)} {c.time} 時点{c.date && c.date !== todayStr() ? `（最新の取引日 ${md(c.date)} の値動き）` : ""}・{c.n}銘柄
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "0 12px" }}>
                <span style={{ fontFamily: mono, fontSize: 26, color: "#f2f4ff", fontVariantNumeric: "tabular-nums" }}>{fmtMoney(c.pnl, c.currency, true)}</span>
                <span style={{ fontSize: 13, color: "#c7cdec" }}>（{fmtDayPct(c.pct)}）</span>
              </div>
              <div style={{ fontSize: 11.5, color: "#8b93b8", marginTop: 2 }}>
                時価 {fmtMoney(c.value, c.currency)}・含み損益（買ってから） {fmtMoney(c.total, c.currency, true)}
              </div>
              <div style={{ display: "flex", height: 9, borderRadius: 5, overflow: "hidden", marginTop: 8, background: "#1b2140" }}>
                <div style={{ width: `${(c.up / tug) * 100}%`, background: PLUS }} />
                <div style={{ width: `${(-c.down / tug) * 100}%`, background: MINUS }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", fontSize: 11.5, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
                <span style={{ color: PLUS }}>＋ {fmtMoney(c.up, c.currency)}<span style={{ color: "#8b93b8" }}>（{c.upN}銘柄）</span></span>
                {c.evenN > 0 && <span style={{ color: "#8b93b8" }}>±0 {c.evenN}銘柄</span>}
                <span style={{ color: MINUS }}>− {fmtMoney(Math.abs(c.down), c.currency)}<span style={{ color: "#8b93b8" }}>（{c.downN}銘柄）</span></span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 銘柄ごと */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <span style={{ fontSize: 10.5, color: "#6b7394" }}>棒</span>
          {[["pct", "％"], ["amt", "金額"]].map(([k, l]) => (
            <button key={k} onClick={() => { setBarBy(k); try { localStorage.setItem("kabu-daily-bar", k); } catch (er) { /* 表示だけ */ } }}
              style={{ all: "unset", cursor: "pointer", padding: "3px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700,
                border: `1px solid ${barBy === k ? "#dfe4ff" : "#2a3050"}`, background: barBy === k ? "#dfe4ff1f" : "transparent", color: barBy === k ? "#dfe4ff" : "#6b7394" }}>{l}</button>
          ))}
        </span>
        <select value={sort} onChange={(e) => { setSort(e.target.value); try { localStorage.setItem("kabu-daily-sort2", e.target.value); } catch (er) { /* 表示だけ */ } }}
          style={{ background: "#12152a", color: "#eef1ff", border: "1px solid #2a3050", borderRadius: 9, padding: "5px 8px", fontSize: 16, outline: "none" }}>
          {SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      {groups.map((g) => {
        const maxAbs = Math.max(barBy === "pct" ? 0.01 : 1, ...g.rows.map((r) => (r.d ? Math.abs(metric(r.d)) : 0)));
        return (
          <div key={g.c} style={{ display: "grid", gap: 8, marginBottom: 12 }}>
            {groups.length > 1 && <div style={{ fontSize: 11, color: "#8b93b8" }}>{g.c === "JPY" ? "日本株（円）" : "米国株（ドル）"}</div>}
            {g.rows.map(({ s, d }) => {
              const w = d ? (Math.abs(metric(d)) / maxAbs) * 50 : 0;
              return (
                <div key={s.id} onClick={() => onSelect(s.id)} style={{ cursor: "pointer", border: "1px solid #232a4a", borderRadius: 12, background: "#10142a", padding: "10px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Creature stock={s} size={34} shadow={false} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#f2f4ff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</div>
                      <div style={{ fontSize: 10.5, color: "#6b7394" }}>
                        {s.code}・{Number(s.shares).toLocaleString()}株
                        {d && <>・{fmtMoney(d.prev, d.currency)} → {fmtMoney(d.close, d.currency)}（{fmtDayPct(d.changePct)}）</>}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      {/* 棒と同じもの(既定は％)を上に大きく、もう片方を下に小さく */}
                      <div style={{ fontFamily: mono, fontSize: 16, color: "#f2f4ff", fontVariantNumeric: "tabular-nums" }}>{d ? (barBy === "pct" ? fmtDayPct(d.pct) : fmtMoney(d.pnl, d.currency, true)) : "—"}</div>
                      <div style={{ fontSize: 10.5, color: "#8b93b8", fontVariantNumeric: "tabular-nums" }}>{d ? (barBy === "pct" ? fmtMoney(d.pnl, d.currency, true) : `きょう ${fmtDayPct(d.pct)}`) : loading ? "取得中" : "株価なし"}</div>
                    </div>
                  </div>
                  {d && (
                    <>
                      <div style={{ position: "relative", height: 7, marginTop: 8 }}>
                        <div style={{ position: "absolute", left: "50%", top: -2, bottom: -2, width: 1, background: "#3b4470" }} />
                        <div style={{ position: "absolute", top: 0, bottom: 0, borderRadius: 4, background: d.pnl >= 0 ? PLUS : MINUS,
                          left: d.pnl >= 0 ? "50%" : `${50 - w}%`, width: `${Math.max(w, 0.6)}%` }} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "#8b93b8", marginTop: 5, fontVariantNumeric: "tabular-nums" }}>
                        <span>時価 {fmtMoney(d.value, d.currency)}</span>
                        {d.total && <span>含み損益（買ってから） {fmtMoney(d.total.pnl, d.currency, true)}（{fmtPct(d.total.pct)}）</span>}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
      <div style={{ fontSize: 10, color: "#5b6284", lineHeight: 1.7 }}>
        きょうの損益＝（最新値 − 前の取引日の終値）× 株数。その日に買い増し・一部売却した株は約定単価から数えます（📒売買の記録）。
        株価はYahoo Financeの遅延データです{at ? `（最終取得 ${at.getHours()}:${String(at.getMinutes()).padStart(2, "0")}・表示中は3分ごとに更新）` : ""}。為替換算はしていません。
        事実の表示で、良し悪しの判定や売買の推奨ではありません。
      </div>
    </div>
  );
}
