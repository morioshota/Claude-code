/* 🧭 つぎの一手 — チャットの株スキル(kabu-research / kabu-entry-plan / kabu-position-decision)で
   自分が決めた計画の控え。記録用サマリーを貼り付けるか、手で入力する。
   表示は事実(自分で決めた値・日付・今の参考株価との距離)だけ。色分け・推奨の文言は入れない(CLAUDE.md) */

import { useEffect, useState } from "react";
import { btnStyle } from "./ui.jsx";
import { fetchQuote } from "../lib/quotes.js";
import { fmtMoney } from "../lib/holdings.js";
import {
  PLAN_STEPS, PLAN_STEP_KEYS, ENTRY_LABELS, cleanPlan, mergePlan, parsePlanSummary,
  nextReviewOf, planExpiryOf,
} from "../lib/plan.js";

const ACCENT = "#7dd3fc"; // 中立の空色(＋/−や良し悪しを連想させない)

const box = { background: "#141830", border: "1px solid #24405a", borderRadius: 12, padding: 14, marginBottom: 12 };
const head = { fontFamily: "'DotGothic16', monospace", fontSize: 12, color: ACCENT, letterSpacing: 2, marginBottom: 8 };
const input = { background: "#0b0e1d", border: "1px solid #2a3050", borderRadius: 8, color: "#eef1ff", padding: "7px 9px", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
const label = { fontSize: 11, color: "#8b93b8", margin: "8px 0 3px" };
const row = { display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12.5, color: "#c7cdec", padding: "5px 0", borderBottom: "1px dashed #262d4d", lineHeight: 1.6 };

const fmtDate = (d) => (d ? `${+d.slice(5, 7)}/${+d.slice(8, 10)}` : "");
const whenText = (days) => (days === 0 ? "今日" : days > 0 ? `あと${days}日` : `${-days}日過ぎています`);
const distText = (price, close) => {
  if (!close) return "";
  const pct = (price / close - 1) * 100;
  return `今の参考株価から ${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;
};

/* 貼り付け→読み取り結果の確認 */
function PastePanel({ stock, onApply, onCancel }) {
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState(null);
  const cur = stock.market && /米|NASDAQ|NYSE/i.test(stock.market) ? "USD" : "JPY";
  const preview = parsed ? mergePlan(stock.plan, parsed.patch) : null;

  return (
    <div>
      <div style={{ fontSize: 11.5, color: "#8b93b8", lineHeight: 1.7, marginBottom: 6 }}>
        チャットの株スキルが最後に出す「記録用サマリー」や「次: ステータス…」の一行を、そのまま貼り付けてください。読み取れた項目だけを反映します。
      </div>
      <textarea value={text} onChange={(e) => { setText(e.target.value); setParsed(null); }} rows={6}
        placeholder={"- ステータス: エントリー設計済\n- 指値: 打診3,200円 / 追加①3,000円 / 追加②2,800円\n- 撤退ライン: 週足終値2,650円割れ\n- 目標: 第1 4,000円\n- 設計の有効期限: 2026-11-07\n- 次の答え合わせ日: 2026-11-07(2Q決算)"}
        style={{ ...input, fontSize: 12, lineHeight: 1.6, resize: "vertical" }} />
      {!parsed && (
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button onClick={() => setParsed(parsePlanSummary(text))} disabled={!text.trim()} style={btnStyle(ACCENT)}>🔎 読み取る</button>
          <button onClick={onCancel} style={btnStyle("#6b7394")}>やめる</button>
        </div>
      )}
      {parsed && (
        <div style={{ marginTop: 10 }}>
          {parsed.found.length === 0 ? (
            <div style={{ fontSize: 12, color: "#fcd34d", lineHeight: 1.7 }}>
              読み取れる項目がありませんでした。「指値:」「撤退ライン:」「次の答え合わせ日:」のような「項目名: 値」の形の行が必要です。
            </div>
          ) : (
            <>
              <div style={{ fontSize: 11.5, color: "#8b93b8", marginBottom: 4 }}>読み取れた項目: {parsed.found.join("・")}（これで上書きします）</div>
              <PlanView stock={{ ...stock, plan: preview }} plan={preview} cur={cur} quote={null} compact />
            </>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            {parsed.found.length > 0 && <button onClick={() => onApply(preview)} style={{ ...btnStyle(ACCENT), background: `${ACCENT}22` }}>✓ 反映する</button>}
            <button onClick={() => setParsed(null)} style={btnStyle("#6b7394")}>貼り直す</button>
            <button onClick={onCancel} style={btnStyle("#6b7394")}>やめる</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* 手で直すフォーム */
function EditPanel({ stock, onApply, onCancel }) {
  const p = stock.plan || {};
  const [f, setF] = useState(() => ({
    step: p.step || "",
    entries: ENTRY_LABELS.map((l, i) => ({ label: (p.entries && p.entries[i] && p.entries[i].label) || l, price: (p.entries && p.entries[i] && p.entries[i].price) || "" })),
    exitPrice: p.exitPrice || "", target: p.target || "",
    validUntil: p.validUntil || "", nextDate: p.nextDate || "", nextWhat: p.nextWhat || "",
  }));
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const setEntry = (i, v) => setF((x) => ({ ...x, entries: x.entries.map((e, j) => (j === i ? { ...e, price: v } : e)) }));
  const num = { inputMode: "decimal" };

  return (
    <div>
      {stock.status === "watch" && (<>
        <div style={label}>すすみぐあい</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {PLAN_STEP_KEYS.map((k) => (
            <button key={k} onClick={() => set("step", f.step === k ? "" : k)} style={{
              all: "unset", cursor: "pointer", padding: "5px 10px", borderRadius: 8, fontSize: 12,
              border: `1.5px solid ${f.step === k ? ACCENT : "#2a3050"}`, color: f.step === k ? ACCENT : "#6b7394",
              background: f.step === k ? `${ACCENT}1a` : "transparent",
            }}>{PLAN_STEPS[k].icon} {PLAN_STEPS[k].label}</button>
          ))}
        </div>
      </>)}
      <div style={label}>指値（打診・追加①・追加②）</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
        {f.entries.map((e, i) => (
          <input key={i} {...num} value={e.price} onChange={(ev) => setEntry(i, ev.target.value)} placeholder={e.label} style={input} />
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        <div><div style={label}>撤退ライン（週足終値）</div><input {...num} value={f.exitPrice} onChange={(e) => set("exitPrice", e.target.value)} placeholder="例: 2650" style={input} /></div>
        <div><div style={label}>目標（第1利確）</div><input {...num} value={f.target} onChange={(e) => set("target", e.target.value)} placeholder="例: 4000" style={input} /></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        <div><div style={label}>次に見る日</div><input type="date" value={f.nextDate} onChange={(e) => set("nextDate", e.target.value)} style={input} /></div>
        <div><div style={label}>設計の有効期限</div><input type="date" value={f.validUntil} onChange={(e) => set("validUntil", e.target.value)} style={input} /></div>
      </div>
      <div style={label}>その日に確認すること</div>
      <input value={f.nextWhat} onChange={(e) => set("nextWhat", e.target.value)} placeholder="例: 2Q決算で実力営業利益を照合" style={input} />
      <div style={{ fontSize: 10, color: "#5b6284", marginTop: 6, lineHeight: 1.6 }}>
        撤退ラインを入れると、この銘柄では にげるライン(%) の代わりにこの価格で到達を知らせます。
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button onClick={() => onApply(cleanPlan(f))} style={{ ...btnStyle(ACCENT), background: `${ACCENT}22` }}>✓ 保存</button>
        <button onClick={onCancel} style={btnStyle("#6b7394")}>やめる</button>
      </div>
    </div>
  );
}

/* 表示 */
function PlanView({ stock, plan, cur, quote, compact }) {
  if (!plan) return <div style={{ fontSize: 12, color: "#5b6284" }}>（空になります）</div>;
  const step = stock.status === "watch" && PLAN_STEPS[plan.step];
  const close = quote && typeof quote.close === "number" ? quote.close : null;
  const review = nextReviewOf(stock);
  const expiry = planExpiryOf(stock);
  return (
    <div>
      {step && <div style={row}><span>すすみぐあい</span><span style={{ color: "#dfe4ff" }}>{step.icon} {step.label}</span></div>}
      {(plan.entries || []).map((e, i) => (
        <div key={i} style={row}>
          <span>指値（{e.label}）</span>
          <span style={{ textAlign: "right" }}>
            <span style={{ color: "#dfe4ff" }}>{fmtMoney(e.price, cur)}</span>
            {close && !compact && <span style={{ display: "block", fontSize: 10.5, color: "#6b7394" }}>{distText(e.price, close)}</span>}
          </span>
        </div>
      ))}
      {plan.exitPrice && <div style={row}><span>撤退ライン（週足終値）</span><span style={{ color: "#dfe4ff" }}>{fmtMoney(plan.exitPrice, cur)}</span></div>}
      {plan.target && <div style={row}><span>目標（第1利確）</span><span style={{ color: "#dfe4ff" }}>{fmtMoney(plan.target, cur)}</span></div>}
      {plan.validUntil && (
        <div style={row}><span>設計の有効期限</span>
          <span style={{ color: "#dfe4ff" }}>{fmtDate(plan.validUntil)}{expiry && <span style={{ fontSize: 10.5, color: "#8b93b8" }}>（{whenText(expiry.days)}）</span>}</span>
        </div>
      )}
      {plan.nextDate && (
        <div style={{ ...row, borderBottom: "none" }}>
          <span>📌 次に見る日</span>
          <span style={{ textAlign: "right" }}>
            <span style={{ color: "#dfe4ff" }}>{fmtDate(plan.nextDate)}</span>
            {review && <span style={{ fontSize: 10.5, color: "#8b93b8" }}>（{whenText(review.days)}）</span>}
            {plan.nextWhat && <span style={{ display: "block", fontSize: 11, color: "#aab2d5" }}>{plan.nextWhat}</span>}
          </span>
        </div>
      )}
    </div>
  );
}

function PlanSection({ stock, onSave }) {
  const [mode, setMode] = useState("view"); // view | paste | edit
  const [confirmClear, setConfirmClear] = useState(false);
  const [quote, setQuote] = useState(null);
  const plan = stock.plan || null;

  useEffect(() => {
    let alive = true;
    if (plan && plan.entries && plan.entries.length) fetchQuote(stock).then((q) => { if (alive) setQuote(q); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stock.id, stock.code, !!(plan && plan.entries)]);

  const cur = (quote && quote.currency) || (/米|NASDAQ|NYSE/i.test(stock.market || "") ? "USD" : "JPY");
  const apply = (p) => { onSave(p); setMode("view"); setConfirmClear(false); };

  return (
    <div style={box}>
      <div style={head}>🧭 つぎの一手<span style={{ fontFamily: "inherit", fontSize: 10, color: "#5b6284", letterSpacing: 0, marginLeft: 8 }}>自分で決めた計画の控え</span></div>
      {mode === "paste" && <PastePanel stock={stock} onApply={apply} onCancel={() => setMode("view")} />}
      {mode === "edit" && <EditPanel stock={stock} onApply={apply} onCancel={() => setMode("view")} />}
      {mode === "view" && (<>
        {plan
          ? <PlanView stock={stock} plan={plan} cur={cur} quote={quote} />
          : <div style={{ fontSize: 12, color: "#5b6284", lineHeight: 1.7 }}>
              まだありません。チャットの株スキルが出す「記録用サマリー」を貼ると、指値・撤退ライン・次に見る日をここに控えられます。
            </div>}
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <button onClick={() => setMode("paste")} style={{ ...btnStyle(ACCENT), padding: "7px 12px", fontSize: 12 }}>📋 サマリーを貼る</button>
          <button onClick={() => setMode("edit")} style={{ ...btnStyle("#8b93b8"), padding: "7px 12px", fontSize: 12 }}>✏️ 手で直す</button>
          {plan && (!confirmClear
            ? <button onClick={() => setConfirmClear(true)} style={{ ...btnStyle("#6b7394"), padding: "7px 12px", fontSize: 12 }}>消す</button>
            : <button onClick={() => apply(null)} style={{ ...btnStyle("#f87171"), padding: "7px 12px", fontSize: 12 }}>本当に消す？</button>)}
        </div>
        {plan && plan.updatedAt && (
          <div style={{ fontSize: 10, color: "#5b6284", marginTop: 8, lineHeight: 1.6 }}>
            {fmtDate(plan.updatedAt)} 更新。あなた自身が事前に決めた条件の控えで、この図鑑からの売買推奨ではありません。株価は遅延データです。
          </div>
        )}
      </>)}
    </div>
  );
}

export { PlanSection };
