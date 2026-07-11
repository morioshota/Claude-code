/* 研究活動の草カレンダー(ヘッダー下に常設)
   活動 = 調査記録・クイックメモ・銘柄登録・トリガー点検などの研究行動の回数。
   株価とは無関係に「研究の習慣」を可視化する。 */

import { streaks } from "../lib/activity.js";

const WEEKS = 13; // 直近13週(約3ヶ月)

const cellColor = (n) => {
  if (!n) return "#181d36";
  if (n === 1) return "#1f4c33";
  if (n === 2) return "#2c7a48";
  if (n <= 4) return "#3aa85e";
  return "#4ade80";
};

export function Heatmap({ activity }) {
  const days = (activity && activity.days) || {};
  const { current, max } = streaks(days);

  // 今日を含む週の土曜まで並べ、WEEKS週ぶん遡る(列=週, 行=日〜土)
  const now = new Date();
  const todayIdx = now.getUTCDay();
  const end = Date.parse(now.toISOString().slice(0, 10)) + (6 - todayIdx) * 86400000;
  const start = end - (WEEKS * 7 - 1) * 86400000;
  const cols = [];
  for (let wk = 0; wk < WEEKS; wk++) {
    const col = [];
    for (let d = 0; d < 7; d++) {
      const t = start + (wk * 7 + d) * 86400000;
      if (t > Date.now()) { col.push(null); continue; }
      const key = new Date(t).toISOString().slice(0, 10);
      col.push({ key, n: days[key] || 0 });
    }
    cols.push(col);
  }
  const total90 = cols.flat().reduce((a, c) => a + (c ? c.n : 0), 0);

  return (
    <div style={{ background: "#0e1122", border: "1.5px solid #252b48", borderRadius: 14, padding: "10px 14px", marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        <span style={{ fontFamily: "'DotGothic16', monospace", fontSize: 11, color: "#8b93b8", letterSpacing: 2 }}>🌱 けんきゅうのあしあと</span>
        <span style={{ fontFamily: "'DotGothic16', monospace", fontSize: 11, color: "#5b6284" }}>
          {current > 0 && <span style={{ color: "#4ade80" }}>🔥 {current}日連続　</span>}
          最長 {max}日｜90日で {total90}回
        </span>
      </div>
      <div style={{ display: "flex", gap: 3, overflowX: "auto", paddingBottom: 2 }}>
        {cols.map((col, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {col.map((c, j) => (
              <div key={j} title={c ? `${c.key}: ${c.n}回` : ""} style={{
                width: 11, height: 11, borderRadius: 3, flexShrink: 0,
                background: c ? cellColor(c.n) : "transparent",
                boxShadow: c && c.n >= 5 ? "0 0 6px rgba(74,222,128,.6)" : "none",
              }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
