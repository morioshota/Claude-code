/* 卒業アルバム(殿堂):
   リリース(売却)した銘柄を「売買の記録＋学んだこと」つきで保存する投資日記。
   実現損益・保有期間・保有中の値幅・売却後の値動きは**事実として**並べる(2026-09オーナー依頼)。
   ただし良し悪しの判定・色分け・「売らなければ良かった」等の評価文言は出さない——
   学びを言葉にするのはオーナー自身(lesson)。 */

import { useState, useEffect, useRef } from "react";
import { Creature, TypeChip, btnStyle, Overlay } from "./ui.jsx";
import { TYPES } from "../data/constants.js";
import { calcLevel, stageOf } from "../lib/stock.js";
import { fmtMoney, fmtPct } from "../lib/holdings.js";
import { fetchChart } from "../lib/fundamentals.js";
import { SELL_REASONS, tradeOf, reviewRangeOf, reviewFactsOf, daysBetween } from "../lib/trade.js";
import { today } from "../lib/util.js";
import { niceTicks } from "./Analysis.jsx";

const mono = "'DotGothic16', monospace";
const labelStyle = { fontFamily: mono, fontSize: 11, color: "#8b93b8", letterSpacing: 1.5, display: "block", marginTop: 12, marginBottom: 4 };
const inputStyle = { width: "100%", boxSizing: "border-box", background: "#0b0e1d", border: "1px solid #2a3050", borderRadius: 8, color: "#eef1ff", padding: "9px 10px", fontSize: 13.5, outline: "none" };
const numOrNull = (s) => { const v = parseFloat(String(s).replace(/,/g, "")); return Number.isFinite(v) && v > 0 ? v : null; };
const fmtDays = (d) => (d === null ? "—" : d >= 365 ? `${Math.floor(d / 365)}年${Math.round((d % 365) / 30.4)}ヶ月（${d}日）` : `${d}日`);

/* 売却の記録の入力欄(卒業式モーダルと、カード編集フォームで共用) */
export function SaleFields({ f, set, jp }) {
  const unit = jp ? "円" : "ドル";
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label style={labelStyle}>購入日</label>
          <input type="date" style={inputStyle} value={f.buyDate || ""} onChange={(e) => set("buyDate", e.target.value || "")} />
        </div>
        <div>
          <label style={labelStyle}>売却日</label>
          <input type="date" style={inputStyle} value={f.soldAt || ""} onChange={(e) => set("soldAt", e.target.value || "")} />
        </div>
        <div>
          <label style={labelStyle}>平均取得単価</label>
          <input style={inputStyle} inputMode="decimal" placeholder={`${unit}`} value={f.avgPrice ?? ""}
            onChange={(e) => set("avgPrice", numOrNull(e.target.value))} />
        </div>
        <div>
          <label style={labelStyle}>売却単価</label>
          <input style={inputStyle} inputMode="decimal" placeholder={`${unit}`} value={f.sellPrice ?? ""}
            onChange={(e) => set("sellPrice", numOrNull(e.target.value))} />
        </div>
        <div>
          <label style={labelStyle}>売却株数</label>
          <input style={inputStyle} inputMode="decimal" placeholder={f.shares ? String(f.shares) : "例: 100"} value={f.sellShares ?? ""}
            onChange={(e) => set("sellShares", numOrNull(e.target.value))} />
        </div>
      </div>
      <label style={labelStyle}>売却した理由（そのときの自分の判断）</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {SELL_REASONS.map((r) => {
          const on = f.sellReason === r.key;
          return (
            <button key={r.key} type="button" onClick={() => set("sellReason", on ? "" : r.key)}
              className={`kzBtn kzChip${on ? " kzBtnOn" : ""}`}
              style={{ padding: "5px 11px", borderRadius: 999, fontSize: 11.5, fontWeight: 700,
                border: `1.5px solid ${on ? "#c7cdec" : "#2a3050"}`, background: on ? "#c7cdec22" : "transparent",
                color: on ? "#eef1ff" : "#8b93b8", "--kzBtnShadow": "#00000066" }}>
              {r.icon} {r.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* 実現損益などの事実のまとめ(アルバム・詳細画面で共用) */
export function TradeSummary({ stock, compact = false }) {
  const t = tradeOf(stock);
  const cur = t.currency;
  const row = (k, v, sub) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, padding: "3px 0" }}>
      <span style={{ color: "#8b93b8", whiteSpace: "nowrap" }}>{k}</span>
      <span style={{ color: "#dfe4ff", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{v}{sub && <span style={{ color: "#6b7394" }}> {sub}</span>}</span>
    </div>
  );
  return (
    <div className="kzGlassPanel" style={{ padding: compact ? "10px 12px" : "12px 14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontFamily: mono, fontSize: 10.5, color: "#8b93b8", letterSpacing: 1.5 }}>💴 実現損益</span>
        {t.pct !== null ? (
          <span style={{ fontFamily: mono, fontSize: 20, color: "#f2f4ff", fontVariantNumeric: "tabular-nums" }}>
            {t.pnl !== null ? fmtMoney(t.pnl, cur, true) : ""}
            <span style={{ fontSize: 13, color: "#c7cdec", marginLeft: 6 }}>（{fmtPct(t.pct)}）</span>
          </span>
        ) : (
          <span style={{ fontSize: 11, color: "#5b6284" }}>平均取得単価と売却単価を入れると表示されます</span>
        )}
      </div>
      <div style={{ marginTop: 6, borderTop: "1px solid rgba(255,255,255,.06)", paddingTop: 4 }}>
        {row("購入日 → 売却日", `${t.buyDate || "—"} → ${t.soldAt || "—"}`)}
        {row("保有期間", fmtDays(t.days))}
        {row("平均取得単価 → 売却単価", `${t.avg ? fmtMoney(t.avg, cur) : "—"} → ${t.sell ? fmtMoney(t.sell, cur) : "—"}`, t.shares ? `× ${t.shares.toLocaleString()}株` : "")}
        {t.reason && row("売却の理由", `${t.reason.icon} ${t.reason.label}`)}
        {t.stop && t.sell && row(
          `にげるライン（${t.stop.pct}%）`,
          fmtMoney(t.stop.line, cur),
          t.stop.sellBelow ? "／売却単価はラインより下" : "／売却単価はラインより上",
        )}
      </div>
    </div>
  );
}

/* 振り返りチャート: 保有していた期間を帯で示し、買い・売りの位置に印をつける。
   あわせて「保有中の値幅」「売却後の値動き」を事実として添える */
function ReviewChart({ stock, color }) {
  const [data, setData] = useState(null);
  const [state, setState] = useState("loading");
  const [w, setW] = useState(300);
  const boxRef = useRef(null);
  const range = reviewRangeOf(stock);

  useEffect(() => {
    let alive = true;
    setState("loading");
    fetchChart(stock, range).then((d) => { if (alive) { setData(d); setState(d ? "ok" : "none"); } });
    return () => { alive = false; };
  }, [stock.id, stock.code, range]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const m = () => setW(Math.floor(el.clientWidth));
    m();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(m); ro.observe(el);
    return () => ro.disconnect();
  }, [state]);

  if (state !== "ok") {
    return <div style={{ fontSize: 11, color: "#5b6284", padding: "8px 0" }}>{state === "loading" ? "チャートを読み込み中…" : "この銘柄の株価データは取得できませんでした"}</div>;
  }
  const t = tradeOf(stock);
  const cur = t.currency;
  const pts = data.points;
  const facts = reviewFactsOf(stock, pts);
  const W = Math.max(240, w), H = 170, PL = 6, PR = 54, PT = 14, PB = 22;
  const vals = pts.map((p) => p[1]).concat([t.avg, t.sell].filter(Boolean));
  const { ticks, lo, hi } = niceTicks(Math.min(...vals), Math.max(...vals), 4);
  const R = W - PR, B = H - PB;
  const x = (i) => PL + (i / Math.max(1, pts.length - 1)) * (R - PL);
  const y = (v) => PT + (1 - (v - lo) / (hi - lo || 1)) * (B - PT);
  const idxOf = (d) => { if (!d) return -1; let k = pts.findIndex((p) => p[0] >= d); return k < 0 ? pts.length - 1 : k; };
  const iBuy = idxOf(stock.buyDate), iSell = idxOf(stock.soldAt);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ");
  const fmtAx = (v) => (cur === "JPY" ? Math.round(v).toLocaleString("ja-JP") : v.toLocaleString("en-US", { maximumFractionDigits: 1 }));
  const md = (d) => { const [yy, mm] = String(d).split("-"); return `${yy.slice(2)}/${Number(mm)}`; };
  const halo = { stroke: "#0e1122", strokeWidth: 3.5, strokeLinejoin: "round", paintOrder: "stroke" };
  const mark = (i, v, lb) => (i < 0 || v == null) ? null : (
    <g>
      <line x1={x(i)} y1={PT} x2={x(i)} y2={B} stroke="#dfe4ff" strokeOpacity="0.35" strokeDasharray="2 3" />
      <circle cx={x(i)} cy={y(v)} r="4.5" fill="#0e1122" stroke="#f2f4ff" strokeWidth="1.6" />
      <text x={Math.max(PL + 14, Math.min(R - 14, x(i)))} y={PT - 2 + 10} textAnchor="middle" fontSize="10.5" fill="#f2f4ff" style={halo}>{lb}</text>
    </g>
  );
  return (
    <div>
      <div ref={boxRef} className="kzChartGlass" style={{ "--kzChartCol": color }}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block", maxWidth: "100%" }}>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={PL} y1={y(v)} x2={R} y2={y(v)} stroke="#fff" strokeOpacity="0.07" />
              <text x={R + 7} y={y(v) + 4} fontSize="10.5" fill="#7c84a8">{fmtAx(v)}</text>
            </g>
          ))}
          {/* 保有していた期間 */}
          {iSell >= 0 && (
            <rect x={x(Math.max(0, iBuy))} y={PT} width={Math.max(2, x(iSell) - x(Math.max(0, iBuy)))} height={B - PT}
              fill={color} fillOpacity="0.10" />
          )}
          {t.avg && <line x1={PL} y1={y(t.avg)} x2={R} y2={y(t.avg)} stroke="#c7cdec" strokeOpacity="0.5" strokeDasharray="5 4" />}
          <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
          {mark(iBuy, stock.buyDate ? (t.avg ?? pts[iBuy]?.[1]) : null, "買")}
          {mark(iSell, t.sell ?? pts[iSell]?.[1], "売")}
          {t.avg && <text x={PL + 4} y={y(t.avg) - 5} fontSize="10" fill="#c7cdec" style={halo}>平均取得 {fmtAx(t.avg)}</text>}
          <text x={PL} y={H - 6} fontSize="10.5" fill="#7c84a8">{md(pts[0][0])}</text>
          <text x={R} y={H - 6} fontSize="10.5" fill="#7c84a8" textAnchor="end">{md(pts[pts.length - 1][0])}</text>
        </svg>
      </div>
      {facts && (facts.held || facts.after) && (
        <div style={{ display: "grid", gap: 6, gridTemplateColumns: "1fr 1fr", marginTop: 8 }}>
          {facts.held && (
            <div className="kzGlassPanel" style={{ padding: "8px 10px" }}>
              <div style={{ fontSize: 10, color: "#8b93b8" }}>{facts.held.fromBuy ? "保有していた期間の値幅" : "売却までの値幅（購入日未入力）"}</div>
              <div style={{ fontSize: 11.5, color: "#dfe4ff", lineHeight: 1.7, fontVariantNumeric: "tabular-nums" }}>
                最高 {fmtMoney(facts.held.hi[1], cur)}<span style={{ color: "#8b93b8" }}>（取得単価比 {fmtPct(facts.held.hiPct)}）</span><br />
                最安 {fmtMoney(facts.held.lo[1], cur)}<span style={{ color: "#8b93b8" }}>（取得単価比 {fmtPct(facts.held.loPct)}）</span>
              </div>
            </div>
          )}
          {facts.after && (
            <div className="kzGlassPanel" style={{ padding: "8px 10px" }}>
              <div style={{ fontSize: 10, color: "#8b93b8" }}>売却後の株価（{daysBetween(stock.soldAt, facts.after.last[0]) ?? "—"}日後）</div>
              <div style={{ fontSize: 11.5, color: "#dfe4ff", lineHeight: 1.7, fontVariantNumeric: "tabular-nums" }}>
                {fmtMoney(facts.after.last[1], cur)}<br />
                <span style={{ color: "#8b93b8" }}>売却単価比 {fmtPct(facts.after.pct)}</span>
              </div>
            </div>
          )}
        </div>
      )}
      <div style={{ fontSize: 9.5, color: "#5b6284", marginTop: 5, lineHeight: 1.6 }}>
        {data.source}・終値ベース（間引いたデータのため高値・安値は概算）。事実の記録で、売買の良し悪しの判定ではありません
      </div>
    </div>
  );
}

/* リリース確定前の卒業式モーダル: 売却の記録と「学んだこと」を書く */
export function GraduationModal({ stock, quote, onConfirm, onCancel }) {
  const jp = /^[0-9]/.test(String(stock.code || ""));
  const [f, setF] = useState(() => ({
    buyDate: stock.buyDate || "",
    soldAt: today(),
    avgPrice: stock.avgPrice ?? null,
    shares: stock.shares ?? null,
    sellShares: stock.sellShares ?? stock.shares ?? null,
    // 参考株価があれば初期値に(遅延データなので実際の約定単価に直してもらう)
    sellPrice: stock.sellPrice ?? (quote && typeof quote.close === "number" ? Math.round(quote.close * 100) / 100 : null),
    sellReason: stock.sellReason || "",
  }));
  const [lesson, setLesson] = useState(stock.lesson || "");
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const preview = { ...stock, ...f, status: "sold" };
  return (
    <Overlay onClose={onCancel} z={80}>
      <div style={{ background: "#0e1122", border: "2px solid #3b4470", borderRadius: 18, padding: 18 }}>
        <div style={{ fontFamily: mono, fontSize: 15, color: "#9ca3af" }}>🕊️ 卒業式</div>
        <div style={{ fontSize: 12, color: "#8b93b8", marginTop: 2, lineHeight: 1.7 }}>
          {stock.name} を野生にかえします。売買の記録と学びはアルバムに残ります
        </div>
        <div style={{ display: "flex", justifyContent: "center", margin: "12px 0 4px" }}>
          <Creature stock={stock} size={76} />
        </div>
        <div style={{ textAlign: "center", fontFamily: mono, fontSize: 13, color: "#dfe4ff" }}>
          {stock.name}（Lv.{calcLevel(stock)}・調査記録{stock.noteCount || 0}件）
        </div>

        <div style={{ fontFamily: mono, fontSize: 12, color: "#c7cdec", marginTop: 16 }}>📒 売却の記録（任意・あとから編集できます）</div>
        <SaleFields f={f} set={set} jp={jp} />
        {quote && stock.sellPrice == null && (
          <div style={{ fontSize: 10, color: "#5b6284", marginTop: 4 }}>
            売却単価の初期値は参考株価（遅延）です。実際の約定単価に直してください
          </div>
        )}
        <div style={{ marginTop: 10 }}><TradeSummary stock={preview} compact /></div>

        <label style={labelStyle}>この銘柄から学んだこと（任意・あとから書けます）</label>
        <textarea
          value={lesson} onChange={(e) => setLesson(e.target.value)}
          placeholder="例: 仮説どおり受注は伸びたが、買値が高すぎた。次はバリュエーションも仮説に入れる"
          style={{ ...inputStyle, minHeight: 80, resize: "vertical", lineHeight: 1.6, fontSize: 13 }}
        />
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <button onClick={() => onConfirm({ ...f, lesson: lesson.trim() })} style={{ all: "unset", cursor: "pointer", flex: 1, textAlign: "center", background: "#9ca3af", color: "#111827", fontWeight: 800, borderRadius: 10, padding: "11px 0", fontSize: 14 }}>
            🕊️ 卒業させる
          </button>
          <button onClick={onCancel} style={{ ...btnStyle("#8b93b8"), padding: "11px 18px" }}>やめる</button>
        </div>
      </div>
    </Overlay>
  );
}

/* 卒業生ひとりぶんのカード */
function AlbumCard({ stock, onSelect, onSaveLesson, onSaveTrade }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(stock.lesson || "");
  const [tradeEdit, setTradeEdit] = useState(null);
  const [showChart, setShowChart] = useState(false);
  const t = TYPES[stock.type] || TYPES.metal;
  const lv = calcLevel(stock);
  const stage = stageOf(lv);
  const jp = /^[0-9]/.test(String(stock.code || ""));

  return (
    <div style={{ background: "linear-gradient(160deg, #141830 0%, #0e1122 70%)", border: "1.5px solid #2a3050", borderRadius: 14, padding: 14 }}>
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <button onClick={() => onSelect(stock.id)} style={{ all: "unset", cursor: "pointer", filter: `drop-shadow(0 0 8px ${t.color}66)` }} title="詳細を開く">
          <Creature stock={stock} size={62} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#f2f4ff" }}>
            {stock.shiny ? "✨" : ""}{stock.name} <span style={{ fontSize: 11, color: "#6b7394", fontWeight: 400 }}>{stock.code}</span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
            <TypeChip typeKey={stock.type} small />
            <span style={{ fontFamily: mono, fontSize: 10.5, color: t.color }}>Lv.{lv}「{stage.name}」まで到達</span>
          </div>
          <div style={{ fontSize: 10.5, color: "#5b6284", marginTop: 4 }}>
            🔬 調査記録 {stock.noteCount || 0}件
          </div>
        </div>
      </div>

      {/* 売買の記録(事実) */}
      <div style={{ marginTop: 10 }}>
        {tradeEdit ? (
          <div className="kzGlassPanel" style={{ padding: "4px 12px 12px" }}>
            <SaleFields f={tradeEdit} set={(k, v) => setTradeEdit((p) => ({ ...p, [k]: v }))} jp={jp} />
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button onClick={() => { onSaveTrade(stock.id, tradeEdit); setTradeEdit(null); }} style={{ ...btnStyle("#4ade80"), padding: "5px 14px", fontSize: 11.5 }}>保存</button>
              <button onClick={() => setTradeEdit(null)} style={{ ...btnStyle("#8b93b8"), padding: "5px 12px", fontSize: 11.5 }}>やめる</button>
            </div>
          </div>
        ) : (
          <TradeSummary stock={stock} compact />
        )}
        {!tradeEdit && (
          <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
            <button onClick={() => setShowChart((v) => !v)} style={{ all: "unset", cursor: "pointer", fontSize: 11, color: "#c7cdec" }}>
              📈 {showChart ? "振り返りチャートを閉じる" : "振り返りチャート"}
            </button>
            <button onClick={() => setTradeEdit({
              buyDate: stock.buyDate || "", soldAt: stock.soldAt || "", avgPrice: stock.avgPrice ?? null, shares: stock.shares ?? null,
              sellShares: stock.sellShares ?? null, sellPrice: stock.sellPrice ?? null, sellReason: stock.sellReason || "",
            })} style={{ all: "unset", cursor: "pointer", fontSize: 11, color: "#8b93b8" }}>✏️ 売買の記録を編集</button>
          </div>
        )}
        {showChart && !tradeEdit && <div style={{ marginTop: 8 }}><ReviewChart stock={stock} color={t.color} /></div>}
      </div>

      <div style={{ marginTop: 10, background: "#10142a", border: "1px solid #262d4d", borderRadius: 10, padding: "10px 12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <span style={{ fontFamily: mono, fontSize: 10.5, color: "#fbbf24", letterSpacing: 1.5 }}>📖 学んだこと</span>
          {!editing && (
            <button onClick={() => { setDraft(stock.lesson || ""); setEditing(true); }} style={{ all: "unset", cursor: "pointer", fontSize: 10.5, color: "#8b93b8" }}>✏️ 編集</button>
          )}
        </div>
        {stock.hypothesis && (
          <div style={{ fontSize: 11, color: "#8b93b8", lineHeight: 1.6, marginBottom: 6 }}>
            <span style={{ color: "#6b7394" }}>買ったときの仮説：</span>{stock.hypothesis}
          </div>
        )}
        {editing ? (
          <div>
            <textarea
              value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus
              style={{ ...inputStyle, minHeight: 60, resize: "vertical", lineHeight: 1.6, fontSize: 12.5 }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <button onClick={() => { onSaveLesson(stock.id, draft.trim()); setEditing(false); }} style={{ ...btnStyle("#4ade80"), padding: "5px 14px", fontSize: 11.5 }}>保存</button>
              <button onClick={() => setEditing(false)} style={{ ...btnStyle("#8b93b8"), padding: "5px 12px", fontSize: 11.5 }}>やめる</button>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: stock.lesson ? "#dfe4ff" : "#5b6284", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
            {stock.lesson || "まだ書かれていません。振り返って一言残しておくと、次の研究に効きます"}
          </div>
        )}
      </div>
    </div>
  );
}

/* 卒業生全体のまとめ(通貨ごと・事実のみ) */
function AlbumTotals({ grads }) {
  const by = {};
  const days = [];
  grads.forEach((s) => {
    const t = tradeOf(s);
    if (t.days !== null) days.push(t.days);
    if (t.pnl === null) return;
    (by[t.currency] ||= { pnl: 0, n: 0 });
    by[t.currency].pnl += t.pnl; by[t.currency].n += 1;
  });
  const curs = Object.keys(by);
  if (curs.length === 0 && days.length === 0) return null;
  const avgDays = days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : null;
  return (
    <div className="kzGlassPanel" style={{ padding: "10px 14px", marginBottom: 12, display: "flex", flexWrap: "wrap", gap: "6px 22px", alignItems: "baseline" }}>
      {curs.map((c) => (
        <div key={c}>
          <div style={{ fontSize: 10, color: "#8b93b8" }}>実現損益の合計（{c === "JPY" ? "円" : "ドル"}・{by[c].n}銘柄）</div>
          <div style={{ fontFamily: mono, fontSize: 18, color: "#f2f4ff", fontVariantNumeric: "tabular-nums" }}>{fmtMoney(by[c].pnl, c, true)}</div>
        </div>
      ))}
      {avgDays !== null && (
        <div>
          <div style={{ fontSize: 10, color: "#8b93b8" }}>平均保有期間（{days.length}銘柄）</div>
          <div style={{ fontFamily: mono, fontSize: 18, color: "#f2f4ff" }}>{fmtDays(avgDays)}</div>
        </div>
      )}
    </div>
  );
}

export function AlbumView({ stocks, onSelect, onSaveLesson, onSaveTrade }) {
  const grads = stocks
    .filter((s) => s.status === "sold")
    .sort((a, b) => String(b.soldAt || "").localeCompare(String(a.soldAt || "")));

  if (grads.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "50px 20px", color: "#5b6284", border: "2px dashed #2a3050", borderRadius: 16, fontSize: 13, lineHeight: 2 }}>
        <div style={{ fontSize: 34, marginBottom: 8 }}>🎓</div>
        まだ卒業生はいません。<br />
        銘柄をリリース（売却）すると、売買の記録と学んだことがここへ残ります
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 11.5, color: "#8b93b8", marginBottom: 10, lineHeight: 1.7 }}>
        🎓 卒業生 {grads.length}名 — 手放した銘柄の売買の記録と学びのアルバム。数字は事実の記録で、良し悪しの判定はしていません
      </div>
      <AlbumTotals grads={grads} />
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
        {grads.map((s) => (
          <AlbumCard key={s.id} stock={s} onSelect={onSelect} onSaveLesson={onSaveLesson} onSaveTrade={onSaveTrade} />
        ))}
      </div>
    </div>
  );
}
