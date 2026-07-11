/* トリガー点検モード: 各銘柄に登録した「前提が崩れる条件(triggers)」を
   定期的に読み返して答え合わせする。売買推奨とは真逆の「自分の仮説の点検」機能。
   ✓無事 → 点検日だけ更新(鮮度は触らない) / ⚠崩れたかも → メモを書いて記録(+1Lv) */

import { useState, useEffect } from "react";
import { Creature, TypeChip, btnStyle, Overlay } from "./ui.jsx";
import { daysSince } from "../lib/util.js";
import { sfx } from "../lib/sound.js";
import { burstConfetti } from "./fx.jsx";

const CHECK_INTERVAL_DAYS = 30;

/* 点検対象: 手放しておらず、triggersが登録済みで、30日以上点検していない銘柄 */
export const dueForCheck = (stocks) =>
  stocks.filter((s) =>
    s.status !== "sold" &&
    (s.triggers || []).length > 0 &&
    (daysSince(s.lastTriggerCheck) === null || daysSince(s.lastTriggerCheck) >= CHECK_INTERVAL_DAYS)
  );

export function TriggerCheckModal({ due, onAnswer, onClose }) {
  const [queue] = useState(due); // 開いた時点のリストで固定
  const [idx, setIdx] = useState(0);
  const [memo, setMemo] = useState("");
  const [warnMode, setWarnMode] = useState(false);
  const [results, setResults] = useState({ ok: 0, warn: 0, skip: 0 });
  const finished = idx >= queue.length;

  useEffect(() => {
    if (finished && queue.length > 0 && results.ok + results.warn > 0) {
      sfx("fanfare");
      burstConfetti(70);
    }
  }, [finished]); // eslint-disable-line react-hooks/exhaustive-deps

  const advance = (kind) => {
    setResults((r) => ({ ...r, [kind]: r[kind] + 1 }));
    setWarnMode(false);
    setMemo("");
    setIdx((i) => i + 1);
  };
  const answerOk = (s) => { sfx("ok"); onAnswer(s.id, "ok"); advance("ok"); };
  const answerWarn = (s) => {
    sfx("warn");
    onAnswer(s.id, "warn", memo.trim() || "⚠ トリガー点検: 前提が崩れたかも。要再調査");
    advance("warn");
  };

  const s = queue[idx];
  const box = { background: "#0e1122", border: "2px solid #3b4470", borderRadius: 18, padding: 18 };

  return (
    <Overlay onClose={onClose} z={70}>
      <div style={box}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontFamily: "'DotGothic16', monospace", fontSize: 15, color: "#fbbf24" }}>
            🔔 トリガー点検 {queue.length > 0 && !finished && <span style={{ fontSize: 12, color: "#8b93b8" }}>{idx + 1}/{queue.length}</span>}
          </div>
          <button onClick={onClose} style={{ all: "unset", cursor: "pointer", color: "#8b93b8", fontSize: 18, padding: 4 }}>✕</button>
        </div>
        <div style={{ fontSize: 11.5, color: "#8b93b8", marginTop: 2, marginBottom: 14, lineHeight: 1.7 }}>
          登録した「にげるタイミング＝前提が崩れる条件」を読み返して答え合わせしましょう（30日ごと）
        </div>

        {queue.length === 0 && (
          <div style={{ textAlign: "center", padding: "24px 0", color: "#5b6284", fontSize: 13, lineHeight: 1.8 }}>
            <div style={{ fontSize: 34 }}>✅</div>
            いま点検が必要な銘柄はありません。<br />
            <span style={{ fontSize: 11 }}>（トリガー未登録の銘柄は、カード編集で「にげるタイミング」を書くと点検対象になります）</span>
          </div>
        )}

        {!finished && s && (
          <div>
            <div style={{ display: "flex", gap: 14, alignItems: "center", background: "#141830", border: "1px solid #262d4d", borderRadius: 12, padding: 14 }}>
              <Creature stock={s} size={56} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#f2f4ff" }}>{s.name} <span style={{ fontSize: 11, color: "#8b93b8", fontWeight: 400 }}>{s.code}</span></div>
                <div style={{ marginTop: 4 }}><TypeChip typeKey={s.type} small /></div>
                {s.lastTriggerCheck && <div style={{ fontSize: 10.5, color: "#5b6284", marginTop: 4 }}>前回の点検: {s.lastTriggerCheck}</div>}
              </div>
            </div>

            {s.hypothesis && (
              <div style={{ marginTop: 10, fontSize: 12, color: "#8b93b8", lineHeight: 1.6 }}>
                <span style={{ fontFamily: "'DotGothic16', monospace", fontSize: 10.5, letterSpacing: 1 }}>仮説: </span>{s.hypothesis}
              </div>
            )}

            <div style={{ marginTop: 12, background: "#2e230e", border: "1px solid #fbbf2444", borderRadius: 10, padding: "10px 14px" }}>
              <div style={{ fontFamily: "'DotGothic16', monospace", fontSize: 11, color: "#fbbf24", letterSpacing: 1.5, marginBottom: 6 }}>にげるタイミング（前提が崩れる条件）</div>
              {(s.triggers || []).map((tr, i) => (
                <div key={i} style={{ fontSize: 13, color: "#fcd34d", lineHeight: 1.7 }}>・{tr}</div>
              ))}
            </div>

            {!warnMode ? (
              <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                <button onClick={() => answerOk(s)} style={{ all: "unset", cursor: "pointer", flex: 1, minWidth: 130, textAlign: "center", background: "#4ade80", color: "#03210f", fontWeight: 800, borderRadius: 10, padding: "11px 0", fontSize: 13 }}>
                  ✓ 前提はぶじ
                </button>
                <button onClick={() => setWarnMode(true)} style={{ all: "unset", cursor: "pointer", flex: 1, minWidth: 130, textAlign: "center", background: "#f8717122", border: "1.5px solid #f87171", color: "#fca5a5", fontWeight: 800, borderRadius: 10, padding: "10px 0", fontSize: 13 }}>
                  ⚠ 崩れたかも…
                </button>
                <button onClick={() => advance("skip")} style={{ ...btnStyle("#8b93b8"), padding: "10px 14px" }}>あとで</button>
              </div>
            ) : (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 11.5, color: "#fca5a5", marginBottom: 6 }}>何が崩れたか、ひとことメモに残しましょう（クイック記録として保存されます）</div>
                <textarea
                  value={memo} onChange={(e) => setMemo(e.target.value)} autoFocus
                  placeholder="例: 2Q連続で受注が前年割れ。仮説の再検証が必要"
                  style={{ width: "100%", boxSizing: "border-box", minHeight: 64, background: "#0b0e1d", border: "1px solid #f8717155", borderRadius: 8, color: "#eef1ff", padding: "9px 10px", fontSize: 13, outline: "none", resize: "vertical" }}
                />
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button onClick={() => answerWarn(s)} style={{ all: "unset", cursor: "pointer", flex: 1, textAlign: "center", background: "#f87171", color: "#2a0505", fontWeight: 800, borderRadius: 10, padding: "10px 0", fontSize: 13 }}>
                    記録して次へ
                  </button>
                  <button onClick={() => setWarnMode(false)} style={{ ...btnStyle("#8b93b8"), padding: "10px 14px" }}>もどる</button>
                </div>
              </div>
            )}
          </div>
        )}

        {finished && queue.length > 0 && (
          <div style={{ textAlign: "center", padding: "18px 0" }}>
            <div style={{ fontSize: 40 }}>🎉</div>
            <div style={{ fontFamily: "'DotGothic16', monospace", fontSize: 15, color: "#4ade80", marginTop: 6 }}>点検コンプリート！</div>
            <div style={{ fontSize: 12.5, color: "#8b93b8", marginTop: 8, lineHeight: 1.9 }}>
              ✓ ぶじ {results.ok}件　⚠ 要再調査 {results.warn}件{results.skip > 0 && `　⏭ あとで ${results.skip}件`}<br />
              {results.warn > 0
                ? <span style={{ color: "#fca5a5" }}>要再調査の銘柄は、チャットのkabu-researchで調べ直して記録を更新しましょう</span>
                : "前提は守られています。良い研究習慣です！"}
            </div>
            <button onClick={onClose} style={{ ...btnStyle("#4ade80"), marginTop: 14, padding: "10px 26px" }}>とじる</button>
          </div>
        )}
      </div>
    </Overlay>
  );
}
