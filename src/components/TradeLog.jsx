/* 📒 売買の記録(銘柄詳細)  2026-09末
   買い増し・一部売却を1件ずつ記録する。株数・平均取得単価(移動平均)・購入日は記録から自動で決まる(lib/lots.js)。
   全部売るときは従来どおり「🕊️ リリース」(卒業式で売却単価などを記録)。
   方針(CLAUDE.md): 記録と計算は事実のみ。売買の良し悪しの判定・推奨はしない */
import { useState, useEffect } from "react";
import { btnStyle } from "./ui.jsx";
import { fetchQuote } from "../lib/quotes.js";
import { fmtMoney } from "../lib/holdings.js";
import { currencyOf } from "../lib/trade.js";
import { replayTrades, initialTradesOf, hasTrades } from "../lib/lots.js";
import { today, uid } from "../lib/util.js";

const mono = "'DotGothic16', ui-monospace, monospace";
const numOr = (v) => { const n = parseFloat(String(v).replace(/,/g, "")); return Number.isFinite(n) && n > 0 ? n : null; };

export function TradeLog({ stock, onSave }) {
  const [form, setForm] = useState(null); // {kind, date, shares, price}
  const [quote, setQuote] = useState(null);
  const [err, setErr] = useState("");
  const cur = currencyOf(stock);
  useEffect(() => { let alive = true; fetchQuote(stock).then((q) => alive && setQuote(q)).catch(() => {}); return () => { alive = false; }; }, [stock.id, stock.code]);

  const readOnly = stock.status !== "hold";
  const base = hasTrades(stock) ? stock.trades : initialTradesOf(stock);
  const { timeline, shares: nowShares, avg: nowAvg, realized } = replayTrades(base);
  if (readOnly && !hasTrades(stock)) return null;

  const open = (kind) => {
    setErr("");
    setForm({ kind, date: today(), shares: "", price: quote && typeof quote.close === "number" ? String(quote.close) : "" });
  };
  // ✏️ 記録を直す(はじめの保有も含む)。直した結果で株数・平均取得単価が計算し直される
  const edit = (t) => {
    setErr("");
    setForm({ kind: t.kind, date: t.date || "", shares: String(t.shares), price: String(t.price), editId: t.id, initial: !!t.initial });
  };
  const others = form && form.editId ? base.filter((t) => t.id !== form.editId) : base;
  const q = form ? numOr(form.shares) : null, p = form ? numOr(form.price) : null;
  const entryOf = () => ({ id: form.editId || uid(), date: form.date, kind: form.kind, shares: q, price: p, ...(form.initial ? { initial: true } : {}) });
  // 入力中の取引を足したらどうなるか(事実の計算)
  let preview = null;
  if (form && q && p) {
    const e = { ...entryOf(), id: "_" };
    const after = replayTrades([...others, e]);
    const st = after.timeline.find((t) => t.trade.id === "_");
    preview = { after, st };
  }
  const submit = () => {
    if (!q || !p || (!form.date && !form.initial)) { setErr("日付・株数・単価を入れてください"); return; }
    if (form.kind === "sell") {
      const held = replayTrades(others.filter((t) => (t.date || "") <= form.date)).shares;
      if (q > held + 1e-9) { setErr(`その日の保有は${held.toLocaleString()}株です。それより多くは売れません`); return; }
      if (replayTrades([...others, entryOf()]).shares < 1e-9) { setErr("全部売るときは、下の「🕊️ リリース（売却済みへ）」から記録してください（卒業アルバムに残ります）"); return; }
    }
    onSave([...others, entryOf()]);
    setForm(null);
  };
  const remove = (t) => {
    const label = t.initial ? "はじめの保有" : t.kind === "buy" ? "買い増し" : "一部売却";
    if (!window.confirm(`${t.date || "日付なし"} の「${label}」の記録を消します。株数・平均取得単価は記録から計算し直されます。よろしいですか？`)) return;
    const next = base.filter((x) => x.id !== t.id);
    if (replayTrades(next).timeline.some((s) => s.shares < 0)) return;
    onSave(next);
  };

  const input = { boxSizing: "border-box", width: "100%", background: "#0b0e1d", border: "1px solid #2a3050", borderRadius: 8, color: "#eef1ff", padding: "7px 9px", fontSize: 16, outline: "none" };
  const lab = { fontSize: 10.5, color: "#8b93b8", marginBottom: 3, display: "block" };
  const kindTxt = (t) => (t.initial ? "🌱 はじめの保有" : t.kind === "buy" ? "📥 買い増し" : "📤 一部売却");

  return (
    <div style={{ background: "#141830", border: "1px solid #3a3320", borderRadius: 12, padding: 14, marginBottom: 12 }}>
      <div style={{ fontFamily: mono, fontSize: 12, color: "#ffd166", letterSpacing: 2, marginBottom: 6 }}>📒 売買の記録（買い増し・一部売却）</div>
      <div style={{ fontSize: 12, color: "#c7cdec", marginBottom: 8 }}>
        いま {nowShares.toLocaleString()}株・平均取得単価 {nowShares > 0 ? fmtMoney(nowAvg, cur) : "—"}
        {Math.abs(realized) > 0 && <span style={{ color: "#8b93b8" }}>・一部売却の実現損益 {fmtMoney(realized, cur, true)}</span>}
      </div>

      {!readOnly && !form && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <button onClick={() => open("buy")} style={{ ...btnStyle("#ffd166"), padding: "7px 12px", fontSize: 12 }}>📥 {timeline.length ? "買い増しを記録" : "購入を記録"}</button>
          {nowShares > 0 && <button onClick={() => open("sell")} style={{ ...btnStyle("#c7cdec"), padding: "7px 12px", fontSize: 12 }}>📤 一部売却を記録</button>}
        </div>
      )}

      {form && (
        <div style={{ background: "#0e1226", border: "1px solid #2a3050", borderRadius: 10, padding: 10, marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: form.kind === "buy" ? "#ffd166" : "#c7cdec", fontWeight: 700, marginBottom: 8 }}>
            {form.editId ? "✏️ 記録を直す：" : ""}{form.initial ? "🌱 はじめの保有" : form.kind === "buy" ? (timeline.length && !form.editId ? "📥 買い増し" : "📥 購入・買い増し") : "📤 一部売却"}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div style={{ gridColumn: "1 / -1" }}><label style={lab}>{form.initial ? "日付（購入日。空欄なら「ずっと前から」）" : "日付"}</label><input style={input} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
            <div><label style={lab}>株数</label><input style={input} inputMode="decimal" placeholder="例: 100" value={form.shares} onChange={(e) => setForm({ ...form, shares: e.target.value })} /></div>
            <div><label style={lab}>単価（{cur === "JPY" ? "円" : "ドル"}）</label><input style={input} inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
          </div>
          {!form.editId && <div style={{ fontSize: 10, color: "#5b6284", marginTop: 4 }}>単価の初期値は参考株価（遅延）です。実際の約定単価に直してください</div>}
          {preview && preview.st && (
            <div style={{ fontSize: 11.5, color: "#dfe4ff", marginTop: 8, lineHeight: 1.7 }}>
              記録すると → <b>{preview.after.shares.toLocaleString()}株</b>・平均取得単価 <b>{preview.after.shares > 0 ? fmtMoney(preview.after.avg, cur) : "—"}</b>
              {form.kind === "sell" && preview.st.realized !== null && <>（この売却の実現損益 <b>{fmtMoney(preview.st.realized, cur, true)}</b>）</>}
              <div style={{ fontSize: 10, color: "#5b6284" }}>平均取得単価は移動平均（買うたびに平均し直し、売っても変わりません）</div>
            </div>
          )}
          {err && <div style={{ fontSize: 11.5, color: "#fca5a5", marginTop: 6 }}>⚠ {err}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={submit} style={{ all: "unset", cursor: "pointer", background: "#ffd166", color: "#221a00", fontWeight: 800, fontSize: 12, borderRadius: 8, padding: "8px 14px" }}>{form.editId ? "直す" : "記録する"}</button>
            <button onClick={() => setForm(null)} style={{ ...btnStyle("#8b93b8"), padding: "7px 12px", fontSize: 12 }}>やめる</button>
          </div>
        </div>
      )}

      {timeline.length === 0 ? (
        <div style={{ fontSize: 12, color: "#5b6284", lineHeight: 1.7 }}>
          まだ保有情報がありません。「購入を記録」か「✏️ 編集」で株数と平均取得単価を入れてください。
        </div>
      ) : (
        <div style={{ display: "grid", gap: 2 }}>
          {[...timeline].reverse().map((st) => {
            const t = st.trade;
            return (
              <div key={t.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: "1px dashed #262d4d", fontSize: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: "#dfe4ff" }}>
                    <span style={{ fontFamily: mono, color: "#6b7394", marginRight: 6 }}>{t.date || "日付なし"}</span>
                    {kindTxt(t)} {Number(t.shares).toLocaleString()}株 × {fmtMoney(t.price, cur)}
                  </div>
                  <div style={{ fontSize: 10.5, color: "#8b93b8" }}>
                    → {st.shares.toLocaleString()}株・平均 {st.shares > 0 ? fmtMoney(st.avg, cur) : "—"}
                    {st.realized !== null && <>・実現損益 {fmtMoney(st.realized, cur, true)}</>}
                  </div>
                </div>
                {!readOnly && (
                  <span style={{ display: "flex", gap: 2 }}>
                    <button onClick={() => edit(t)} title="この記録を直す" style={{ all: "unset", cursor: "pointer", color: "#8b93b8", fontSize: 13, padding: "2px 6px" }}>✏️</button>
                    {!(t.initial && !hasTrades(stock)) && (
                      <button onClick={() => remove(t)} title="この記録を消す" style={{ all: "unset", cursor: "pointer", color: "#5b6284", fontSize: 14, padding: "2px 6px" }}>✕</button>
                    )}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div style={{ fontSize: 10, color: "#5b6284", marginTop: 8, lineHeight: 1.6 }}>
        株数・平均取得単価・購入日はこの記録から自動で計算され、💼資産の推移のグラフにも反映されます。
        {!hasTrades(stock) && timeline.length > 0 && " 最初の記録をすると、いまの保有が「はじめの保有」として残ります。"}
        全部売るときは「🕊️ リリース」から。
      </div>
    </div>
  );
}
