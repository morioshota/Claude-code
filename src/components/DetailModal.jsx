/* 銘柄詳細モーダル */

import { useState, useEffect } from "react";
import { NoteItem } from "./notes.jsx";
import { Creature, RarityBadge, TypeChip, StatusBadge, Gauge, btnStyle, Overlay } from "./ui.jsx";
import { TYPES, RARITIES, STAGES } from "../data/constants.js";
import { calcLevel, calcCP, stageOf, freshInfo } from "../lib/stock.js";
import { fetchQuote } from "../lib/quotes.js";
import { holdingOf, pnlOf, moodOf, fmtMoney, fmtPct } from "../lib/holdings.js";

/* 参考株価と保有情報(表示のみ・推奨なし)。取得できないときは株価行を出さない。
   色付けや前日比・矢印などの演出は意図的に入れない(事実の提示のみ) */
function QuoteRow({ stock }) {
  const [quote, setQuote] = useState(null);
  useEffect(() => {
    let alive = true;
    setQuote(null);
    fetchQuote(stock).then((q) => { if (alive) setQuote(q); });
    return () => { alive = false; };
  }, [stock.id, stock.code]);

  const holding = holdingOf(stock);
  const pnl = pnlOf(stock, quote);
  const mood = moodOf(pnl);
  if (!quote && !holding) return null;

  const d = (quote?.date || "").slice(5).replace("-", "/");
  const t = (quote?.time || "").slice(0, 5);
  const cur = quote?.currency || "JPY";
  return (
    <div style={{ fontSize: 11.5, color: "#8b93b8", marginTop: 3, lineHeight: 1.7 }}>
      {quote && (
        <div>
          参考株価 <span style={{ color: "#dfe4ff", fontWeight: 700 }}>{fmtMoney(quote.close, cur)}</span>
          <span style={{ fontSize: 10, color: "#5b6284" }}>（{d} {t}・{quote.source}・売買判断には使用しないでください）</span>
        </div>
      )}
      {holding && (
        <div>
          保有 <span style={{ color: "#dfe4ff" }}>{holding.shares.toLocaleString()}株</span>
          ・平均 <span style={{ color: "#dfe4ff" }}>{fmtMoney(holding.avg, cur)}</span>
        </div>
      )}
      {pnl && (
        <div>
          時価 <span style={{ color: "#dfe4ff", fontWeight: 700 }}>{fmtMoney(pnl.value, pnl.currency)}</span>
          ・含み損益 <span style={{ color: "#dfe4ff", fontWeight: 700 }}>{fmtMoney(pnl.pnl, pnl.currency, true)}（{fmtPct(pnl.pct)}）</span>
          {mood && <span style={{ fontSize: 10.5 }}>　ようす: {mood.icon}{mood.label}</span>}
        </div>
      )}
    </div>
  );
}

function DetailModal({ stock, notes, notesLoading, onClose, onUpdate, onDelete, onLog, onOpenNoteEditor, onOpenAi, onDeleteNote }) {
  const t = TYPES[stock.type] || TYPES.metal;
  const r = RARITIES.find((x) => x.key === stock.rarity) || RARITIES[0];
  const lv = calcLevel(stock);
  const stage = stageOf(lv);
  const cp = calcCP(stock);
  const fresh = freshInfo(stock);
  const [logText, setLogText] = useState("");
  const [flash, setFlash] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const addLog = () => {
    if (!logText.trim()) return;
    onLog(stock.id, logText.trim());
    setLogText("");
    setFlash(true);
    setTimeout(() => setFlash(false), 1200);
  };

  const section = { background: "#141830", border: "1px solid #262d4d", borderRadius: 12, padding: 14, marginBottom: 12 };
  const h = { fontFamily: "'DotGothic16', monospace", fontSize: 12, color: "#8b93b8", letterSpacing: 2, marginBottom: 8 };

  return (
    <Overlay onClose={onClose}>
      <div style={{
        background: "#0e1122", borderRadius: 18, overflow: "hidden",
        border: stage.no >= 4 ? "2px solid transparent" : `2px solid ${t.color}77`,
        backgroundImage: stage.no >= 4
          ? "linear-gradient(#0e1122,#0e1122), linear-gradient(120deg,#f0abfc,#ffd166,#4ade80,#60a5fa,#f0abfc)"
          : "none",
        backgroundOrigin: "border-box", backgroundClip: stage.no >= 4 ? "padding-box, border-box" : "border-box",
        boxShadow: stock.rarity >= 4 || stage.no >= 3 ? r.glow : "0 8px 40px rgba(0,0,0,.6)",
      }}>
        {/* ヘッダー */}
        <div style={{ background: `linear-gradient(135deg, ${t.dark}, #0e1122 80%)`, padding: "18px 18px 14px", position: "relative" }}>
          <button onClick={onClose} style={{ position: "absolute", top: 10, right: 12, all: "unset", cursor: "pointer", color: "#8b93b8", fontSize: 20, lineHeight: 1, padding: 6 }}>✕</button>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <div style={{
              filter: `drop-shadow(0 0 ${8 + stage.no * 4}px ${t.color}99)`,
              animation: flash ? "kzBounce .6s ease" : stage.no >= 4 ? "kzAura 2.4s ease-in-out infinite" : "none",
            }}>
              <Creature stock={stock} size={56 + stage.no * 6} sleeping={!!(fresh && fresh.days !== null && fresh.days > 90)} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "'DotGothic16', monospace", fontSize: 11, color: "#6b7394" }}>
                No.{String(stock.no).padStart(3, "0")}　<RarityBadge rarity={stock.rarity} size={12} />（{r.name}）
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#f2f4ff" }}>{stock.name}</div>
              <div style={{ fontSize: 12, color: "#8b93b8" }}>{stock.code}・{stock.market || "市場未設定"}</div>
              <QuoteRow stock={stock} />
              <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <TypeChip typeKey={stock.type} small />
                <StatusBadge status={stock.status} />
                <span style={{ fontFamily: "'DotGothic16', monospace", fontSize: 10.5, color: stage.no >= 4 ? "#ffd166" : t.color }}>
                  {stage.no >= 4 ? "👑 " : ""}STAGE {stage.no}「{stage.name}」
                </span>
              </div>
            </div>
          </div>
          {flash && (
            <div style={{ position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)", fontFamily: "'DotGothic16', monospace", color: "#ffd166", fontSize: 14, textShadow: "0 0 10px rgba(255,209,102,.8)", animation: "kzRise 1.2s ease forwards" }}>
              ★ レベルアップ！ Lv.{lv} ★
            </div>
          )}
        </div>

        <div style={{ padding: 16 }}>
          {/* ステータス */}
          <div style={section}>
            <div style={h}>STATUS ─ {stage.desc}</div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontFamily: "'DotGothic16', monospace", color: "#ffd166", fontSize: 16 }}>Lv.{lv}</span>
              <span style={{ fontFamily: "'DotGothic16', monospace", color: t.color, fontSize: 16 }}>CP {cp}</span>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#aab2d5", marginBottom: 3 }}>
                  <span>研究度（調査記録{stock.noteCount || 0}件×3 ＋ メモ{stock.logs.length}件）</span>
                  <span>{stage.no < 4 ? `次のステージまで あとLv.${STAGES[stage.no].min - lv}` : "最終ステージ"}</span>
                </div>
                <Gauge value={lv} max={stage.no < 4 ? STAGES[stage.no].min : lv} color="#ffd166" />
              </div>
              {fresh && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#aab2d5", marginBottom: 3 }}>
                    <span>{fresh.icon} 記録の鮮度: {fresh.label}</span>
                    <span>{fresh.days === null ? "調査記録なし" : `最終調査から${fresh.days}日`}</span>
                  </div>
                  <Gauge value={fresh.pct} max={100} color={fresh.color} />
                </div>
              )}
              <div>
                <div style={{ fontSize: 11, color: "#aab2d5", marginBottom: 3 }}>こうげき（強気材料 {stock.bullets.length}）</div>
                <Gauge value={stock.bullets.length} max={6} color="#f87171" />
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#aab2d5", marginBottom: 3 }}>けいかい（リスク把握 {stock.risks.length}）</div>
                <Gauge value={stock.risks.length} max={6} color="#60a5fa" />
              </div>
            </div>
            <div style={{ fontSize: 10, color: "#5b6284", marginTop: 8 }}>
              ※ Lv・CP・鮮度は研究の蓄積量と経過日数を表す指標です。投資判断の根拠にはなりません。
            </div>
          </div>

          {/* 生態調査記録 */}
          <div style={{ ...section, border: "1px solid #2d5a3d" }}>
            <div style={{ ...h, color: "#4ade80" }}>🔬 生態調査記録（投資メモの保管庫）</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              <button onClick={onOpenNoteEditor} style={{ ...btnStyle("#4ade80"), padding: "7px 12px", fontSize: 12 }}>＋ 記録を追加（＋3Lv）</button>
              <button onClick={onOpenAi} style={{ ...btnStyle("#c084fc"), padding: "7px 12px", fontSize: 12 }}>🤖 AIに下書きを頼む</button>
            </div>
            {notesLoading
              ? <div style={{ fontSize: 12, color: "#5b6284" }}>記録を読み込み中…</div>
              : notes.length === 0
                ? <div style={{ fontSize: 12, color: "#5b6284", lineHeight: 1.7 }}>まだ調査記録がありません。チャットで作った投資メモを貼り付けて、この銘柄の「生態」を記録しよう。</div>
                : [...notes].reverse().map((n, i) => (
                  <NoteItem key={n.id} note={n} index={i} total={notes.length} onDelete={onDeleteNote} />
                ))}
          </div>

          {/* マクロ仮説 */}
          <div style={section}>
            <div style={h}>マクロ仮説（とくせい）</div>
            <div style={{ fontSize: 13, color: "#dfe4ff", lineHeight: 1.7 }}>
              {stock.hypothesis || <span style={{ color: "#5b6284" }}>未設定（編集から追加できます）</span>}
            </div>
          </div>

          {/* わざ・よわてん */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12, marginBottom: 12 }}>
            <div style={{ ...section, marginBottom: 0 }}>
              <div style={h}>わざ（強気材料）</div>
              {stock.bullets.length === 0
                ? <div style={{ fontSize: 12, color: "#5b6284" }}>まだ覚えていない。リサーチで習得しよう</div>
                : stock.bullets.map((b, i) => (
                  <div key={i} style={{ fontSize: 13, color: "#fca5a5", padding: "4px 0", borderBottom: i < stock.bullets.length - 1 ? "1px dashed #262d4d" : "none" }}>🔥 {b}</div>
                ))}
            </div>
            <div style={{ ...section, marginBottom: 0 }}>
              <div style={h}>よわてん（リスク）</div>
              {stock.risks.length === 0
                ? <div style={{ fontSize: 12, color: "#5b6284" }}>未把握。弱点を知らないのは危険…</div>
                : stock.risks.map((b, i) => (
                  <div key={i} style={{ fontSize: 13, color: "#93c5fd", padding: "4px 0", borderBottom: i < stock.risks.length - 1 ? "1px dashed #262d4d" : "none" }}>⚠️ {b}</div>
                ))}
            </div>
          </div>

          {/* 見直しトリガー */}
          <div style={section}>
            <div style={h}>にげるタイミング（前提が崩れる条件）</div>
            {(!stock.triggers || stock.triggers.length === 0)
              ? <div style={{ fontSize: 12, color: "#5b6284" }}>未設定。「何が起きたら見直すか」を決めておくと安心</div>
              : stock.triggers.map((b, i) => (
                <div key={i} style={{ fontSize: 13, color: "#fcd34d", padding: "4px 0" }}>🚪 {b}</div>
              ))}
          </div>

          {/* クイックメモ */}
          <div style={section}>
            <div style={h}>クイックメモ（ひとこと記録・＋1Lv）</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <input
                value={logText}
                onChange={(e) => setLogText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addLog(); }}
                placeholder="例: 決算発表は8/8。進捗率をチェック予定"
                style={{ flex: 1, background: "#0b0e1d", border: "1px solid #2a3050", borderRadius: 8, color: "#eef1ff", padding: "8px 10px", fontSize: 13, outline: "none" }}
              />
              <button onClick={addLog} style={{ all: "unset", cursor: "pointer", background: "#ffd166", color: "#221a00", fontWeight: 800, fontSize: 12, borderRadius: 8, padding: "8px 12px", whiteSpace: "nowrap" }}>＋記録</button>
            </div>
            {stock.logs.length === 0
              ? <div style={{ fontSize: 12, color: "#5b6284" }}>記録なし</div>
              : [...stock.logs].reverse().map((l, i) => (
                <div key={i} style={{ fontSize: 12.5, color: "#c7cdec", padding: "6px 0", borderBottom: "1px dashed #262d4d", lineHeight: 1.6 }}>
                  <span style={{ fontFamily: "'DotGothic16', monospace", color: "#6b7394", marginRight: 8 }}>{l.date || "----"}</span>
                  {l.text}
                </div>
              ))}
          </div>

          {/* 操作 */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {stock.status === "watch" && <button onClick={() => onUpdate({ ...stock, status: "hold" })} style={btnStyle("#4ade80")}>⭐ ホカクした（保有へ）</button>}
            {stock.status === "hold" && <button onClick={() => onUpdate({ ...stock, status: "sold" })} style={btnStyle("#9ca3af")}>🕊️ リリース（売却済みへ）</button>}
            {stock.status === "sold" && <button onClick={() => onUpdate({ ...stock, status: "watch" })} style={btnStyle("#60a5fa")}>👀 再ウォッチする</button>}
            <button onClick={() => onUpdate(stock, true)} style={btnStyle("#c084fc")}>✏️ 編集</button>
            {!confirmDelete
              ? <button onClick={() => setConfirmDelete(true)} style={btnStyle("#f87171")}>🗑️ 図鑑から削除</button>
              : <button onClick={() => onDelete(stock.id)} style={{ ...btnStyle("#f87171"), background: "#f87171", color: "#2a0505" }}>本当に削除する？（調査記録も消えます）</button>}
          </div>
        </div>
      </div>
    </Overlay>
  );
}

export { DetailModal };
