/* 研究活動の草カレンダー(ヘッダー下に常設)
   活動 = 調査記録・クイックメモ・銘柄登録・トリガー点検などの研究行動の回数。
   株価とは無関係に「研究の習慣」を可視化する。
   2026-11 見直し(オーナー指摘「どういう状態の表示か分からない」):
     月と曜日の目盛り・きょうの枠・色の見本・マスをタップしてその日の回数、を足した。
     マスは横幅いっぱいに広げる(以前は左に小さく寄っていた) */

import { useState } from "react";
import { streaks } from "../lib/activity.js";
import { today } from "../lib/util.js";

const WEEKS = 13; // 直近13週(約3ヶ月)
const DAY = 86400000;
const WD = ["日", "月", "火", "水", "木", "金", "土"];
const mono = "'DotGothic16', monospace";

const cellColor = (n) => {
  if (!n) return "#181d36";
  if (n === 1) return "#1f4c33";
  if (n === 2) return "#2c7a48";
  if (n <= 4) return "#3aa85e";
  return "#4ade80";
};
const LEGEND = [0, 1, 2, 3, 5];
const label = (key) => { const [, m, d] = key.split("-"); return `${Number(m)}/${Number(d)}（${WD[new Date(Date.parse(key)).getUTCDay()]}）`; };

export function Heatmap({ activity }) {
  const days = (activity && activity.days) || {};
  const { current, max } = streaks(days);
  const [picked, setPicked] = useState(null);

  // 今日を含む週の土曜まで並べ、WEEKS週ぶん遡る(列=週, 行=日〜土)。日付の計算は文字列→UTCで統一
  const now = today();
  const t0 = Date.parse(now);
  const end = t0 + (6 - new Date(t0).getUTCDay()) * DAY;
  const start = end - (WEEKS * 7 - 1) * DAY;
  const cols = [];
  for (let wk = 0; wk < WEEKS; wk++) {
    const col = [];
    for (let d = 0; d < 7; d++) {
      const t = start + (wk * 7 + d) * DAY;
      if (t > t0) { col.push(null); continue; }
      const key = new Date(t).toISOString().slice(0, 10);
      col.push({ key, n: days[key] || 0 });
    }
    cols.push(col);
  }
  const total90 = cols.flat().reduce((a, c) => a + (c ? c.n : 0), 0);
  // 月の目盛り: その週の日曜の月が、前の週と変わった列にだけ出す
  const months = cols.map((_, i) => {
    const m = new Date(start + i * 7 * DAY).getUTCMonth() + 1;
    const prev = i > 0 ? new Date(start + (i - 1) * 7 * DAY).getUTCMonth() + 1 : null;
    return m !== prev ? `${m}月` : "";
  });
  const sel = picked || now;
  const selN = days[sel] || 0;

  return (
    <div style={{ background: "#0e1122", border: "1.5px solid #252b48", borderRadius: 14, padding: "10px 14px", marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6, marginBottom: 4 }}>
        <span style={{ fontFamily: mono, fontSize: 11, color: "#8b93b8", letterSpacing: 2 }}>🌱 けんきゅうのあしあと</span>
        <span style={{ fontFamily: mono, fontSize: 11, color: "#5b6284" }}>
          {current > 0 && <span style={{ color: "#4ade80" }}>🔥 {current}日連続　</span>}
          最長 {max}日｜この13週で {total90}回
        </span>
      </div>
      <div style={{ fontSize: 10.5, color: "#8b93b8", lineHeight: 1.6, marginBottom: 8 }}>
        1マス＝1日。調査記録・メモ・銘柄の登録・点検をした日に色がつき、回数が多いほど明るくなります。
      </div>

      {/* 曜日の目盛り＋マス(列＝1週間・右端が今週) */}
      <div style={{ display: "grid", gridTemplateColumns: `14px repeat(${WEEKS}, 1fr)`, columnGap: 3, rowGap: 3, alignItems: "center" }}>
        <span />
        {months.map((m, i) => <span key={`m${i}`} style={{ fontFamily: mono, fontSize: 9.5, color: "#8b93b8", whiteSpace: "nowrap", overflow: "visible", height: 12 }}>{m}</span>)}
        {WD.map((w, d) => [
          <span key={`w${d}`} style={{ fontFamily: mono, fontSize: 9.5, color: d === 0 || d === 6 ? "#5b6284" : "#8b93b8", textAlign: "center" }}>{w}</span>,
          ...cols.map((col, i) => {
            const c = col[d];
            if (!c) return <span key={`${i}-${d}`} />;
            const isToday = c.key === now, isSel = c.key === sel;
            return (
              <button key={`${i}-${d}`} onClick={() => setPicked(c.key === picked ? null : c.key)} aria-label={`${label(c.key)} ${c.n}回`}
                style={{
                  all: "unset", cursor: "pointer", boxSizing: "border-box", width: "100%", aspectRatio: "1 / 1", maxHeight: 22, borderRadius: 4,
                  background: cellColor(c.n),
                  outline: isSel ? "2px solid #ffd166" : isToday ? "1.5px solid #8b93b8" : "none", outlineOffset: -1,
                  boxShadow: c.n >= 5 ? "0 0 6px rgba(74,222,128,.6)" : "none",
                }} />
            );
          }),
        ])}
      </div>

      {/* 読み取り欄: きょう(またはタップした日)の回数と、色の見本 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 9 }}>
        <span style={{ fontFamily: mono, fontSize: 12, color: "#dfe4ff" }}>
          <span style={{ color: "#ffd166" }}>▢</span> {sel === now ? "きょう " : ""}{label(sel)}：
          <b style={{ color: selN ? "#4ade80" : "#8b93b8" }}>{selN ? `研究 ${selN}回` : "まだなし"}</b>
          {picked && picked !== now && <button onClick={() => setPicked(null)} style={{ all: "unset", cursor: "pointer", marginLeft: 8, fontSize: 10.5, color: "#8b93b8", textDecoration: "underline" }}>きょうに戻す</button>}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontFamily: mono, fontSize: 10, color: "#8b93b8" }}>
          0回
          {LEGEND.map((n) => <span key={n} style={{ width: 10, height: 10, borderRadius: 3, background: cellColor(n), display: "inline-block" }} />)}
          5回〜
        </span>
      </div>
      <div style={{ fontSize: 10, color: "#5b6284", marginTop: 5, lineHeight: 1.5 }}>
        たて＝曜日（上が日曜）・よこ＝週（右はしが今週）。マスをタップすると、その日の回数が出ます。研究の習慣の記録で、株価とは関係ありません。
      </div>
    </div>
  );
}
