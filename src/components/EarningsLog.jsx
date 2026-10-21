/* 🗓 決算日の欄(銘柄詳細の研究タブ)  2026-10
   Yahooから取れた決算発表日を自動で書き足し、抜けている日は手で足せる・要らない日は消せる。
   ここに入っている日付が、分析タブの株価チャートの「決」の線になる(lib/earnings.js)。
   方針(CLAUDE.md): 日付の記録のみ。決算の良し悪しの判定はしない */
import { useState } from "react";
import { btnStyle } from "./ui.jsx";
import { earningsOf, mergeAutoEarnings, addEarning, removeEarning, fetchEarnings } from "../lib/earnings.js";
import { today } from "../lib/util.js";

const mono = "'DotGothic16', ui-monospace, monospace";
const FOLD = 4; // たたんだときに見せる件数(新しい順)
const fullDate = (d) => { const [y, m, dd] = String(d).split("-"); return `${y}/${Number(m)}/${Number(dd)}`; };
const daysTo = (d) => Math.round((Date.parse(d) - Date.parse(today())) / 864e5);

export function EarningsLog({ stock, onSave }) {
  const [state, setState] = useState("idle"); // idle|loading|done|none
  const [adding, setAdding] = useState(null);
  const [openAll, setOpenAll] = useState(false);

  // 🔄で取り直す(開いたときの自動取り込みは DetailModal 側で、どのタブでも行う)
  const pull = async (force) => {
    setState("loading");
    const api = await fetchEarnings(stock, { force });
    if (!api) { setState("none"); return; }
    const next = mergeAutoEarnings(stock, api);
    if (next) onSave(next);
    setState("done");
  };

  const list = earningsOf(stock);
  const now = today();
  const upcoming = list.filter((e) => e.date >= now);
  const past = list.filter((e) => e.date < now).reverse();
  const shown = openAll ? past : past.slice(0, FOLD);
  const next = upcoming[0];

  const submit = () => {
    if (!adding || !/^\d{4}-\d{2}-\d{2}$/.test(adding)) return;
    onSave(addEarning(stock, adding));
    setAdding(null);
  };
  const remove = (e) => {
    if (!window.confirm(`${fullDate(e.date)} の決算日を消します。よろしいですか？${e.auto ? "\n（自動で取り込んだ日なので、消したあとも自動では戻りません）" : ""}`)) return;
    onSave(removeEarning(stock, e.date));
  };

  const row = (e, future) => (
    <div key={e.date} style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: "1px dashed #262d4d", fontSize: 12.5 }}>
      <span style={{ color: "#dfe4ff" }}>
        <span style={{ fontFamily: mono, marginRight: 8 }}>{fullDate(e.date)}</span>
        {future && <span style={{ fontSize: 10.5, color: "#ffd166", marginRight: 6 }}>予定</span>}
        <span style={{ fontSize: 10, color: "#5b6284" }}>{e.auto ? "自動" : "手入力"}</span>
      </span>
      <button onClick={() => remove(e)} title="この決算日を消す" style={{ all: "unset", cursor: "pointer", color: "#5b6284", fontSize: 14, padding: "0 6px" }}>✕</button>
    </div>
  );

  return (
    <div style={{ background: "#141830", border: "1px solid #262d4d", borderRadius: 12, padding: 14, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontFamily: mono, fontSize: 12, color: "#8b93b8", letterSpacing: 2 }}>🗓 決算日</span>
        <button onClick={() => state !== "loading" && pull(true)} title="Yahoo Financeから取り直す"
          style={{ all: "unset", cursor: "pointer", fontSize: 11, color: "#8b93b8", opacity: state === "loading" ? 0.5 : 1 }}>
          {state === "loading" ? "🔄 取得中…" : "🔄 取り込み"}
        </button>
      </div>
      {next && (
        <div style={{ fontSize: 13, color: "#f2f4ff", marginBottom: 8 }}>
          次の決算 <b style={{ fontFamily: mono }}>{fullDate(next.date)}</b>
          <span style={{ color: "#8b93b8", fontSize: 11.5 }}>（{daysTo(next.date) === 0 ? "きょう" : `あと${daysTo(next.date)}日`}）</span>
        </div>
      )}
      {upcoming.slice(1).map((e) => row(e, true))}
      {next && row(next, true)}
      {past.length === 0 && upcoming.length === 0 && (
        <div style={{ fontSize: 12, color: "#5b6284", lineHeight: 1.7 }}>
          {state === "loading" ? "決算日を取り込んでいます…" : "決算日がまだありません。自動で取れなかったときは「＋ 決算日を追加」で入れてください。"}
        </div>
      )}
      {shown.map((e) => row(e, false))}
      {past.length > FOLD && (
        <button onClick={() => setOpenAll((v) => !v)} style={{ all: "unset", cursor: "pointer", display: "block", textAlign: "center", width: "100%", fontSize: 11.5, color: "#ffd166", padding: "7px 0 2px" }}>
          {openAll ? `▲ たたむ（新しい${FOLD}件だけ）` : `▼ すべて表示（ほか${past.length - FOLD}件・全${past.length}件）`}
        </button>
      )}
      {adding === null ? (
        <button onClick={() => setAdding(now)} style={{ ...btnStyle("#ffd166"), padding: "6px 12px", fontSize: 12, marginTop: 8 }}>＋ 決算日を追加</button>
      ) : (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
          <input type="date" value={adding} onChange={(e) => setAdding(e.target.value)}
            style={{ background: "#0b0e1d", border: "1px solid #2a3050", borderRadius: 8, color: "#eef1ff", padding: "6px 9px", fontSize: 16, outline: "none" }} />
          <button onClick={submit} style={{ all: "unset", cursor: "pointer", background: "#ffd166", color: "#221a00", fontWeight: 800, fontSize: 12, borderRadius: 8, padding: "7px 12px" }}>追加</button>
          <button onClick={() => setAdding(null)} style={{ ...btnStyle("#8b93b8"), padding: "6px 10px", fontSize: 12 }}>やめる</button>
        </div>
      )}
      <div style={{ fontSize: 10, color: "#5b6284", marginTop: 8, lineHeight: 1.6 }}>
        決算発表日は Yahoo Finance から自動で取り込みます（過去の日付は一部抜けることがあります。抜けていたら手で追加してください）。
        ここにある日付が、📊分析の株価チャートの「決」の線になります。
      </div>
    </div>
  );
}
