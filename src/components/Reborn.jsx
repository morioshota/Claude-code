/* 🔮 転生(銘柄詳細の④その他)  2026-11
   ゲージ(転生ポイント)と「転生する」ボタン、引いたあとの「このまま / 転生先にする」の選択。
   しくみと決まりは lib/reborn.js。研究の積み重ねで遊ぶ機能で、銘柄の良し悪し・株価とは無関係 */
import { useEffect, useState } from "react";
import { Creature, Gauge, Overlay, btnStyle } from "./ui.jsx";
import { REBORN_COST, rebornPointsOf, rebornStateOf, rollReborn, startReborn, previewReborn, settleReborn, currentEvoOf } from "../lib/reborn.js";
import { EVO_KINDS } from "../data/evolution.js";
import { getSpecials } from "../lib/specials.js";
import { sfx } from "../lib/sound.js";

const mono = "'DotGothic16', ui-monospace, monospace";
const COL = "#c084fc";

/* いまの姿のひとこと */
const lookText = (stock) => (stock.special ? "🌟 ユニークキャラ" : `かざり：${(EVO_KINDS[currentEvoOf(stock)] || {}).name || "—"}`);

export function RebornSection({ stock, onPatch }) {
  const pt = rebornPointsOf(stock);
  const state = rebornStateOf(stock);
  const hasPack = getSpecials().length > 0;
  const [charging, setCharging] = useState(false);

  const start = () => {
    if (!state.ok || charging) return;
    setCharging(true);
    sfx("charge");
    // ため(0.9秒)のあとに引く。引いた時点でポイントを使い、転生先を銘柄に持たせる(えらぶまで残る)
    setTimeout(() => {
      onPatch(stock.id, startReborn(stock, rollReborn(stock, getSpecials())));
      setCharging(false);
    }, 900);
  };

  return (
    <div style={{ background: "#141830", border: "1px solid #3a2a55", borderRadius: 12, padding: 14, marginBottom: 12 }}>
      <div style={{ fontFamily: mono, fontSize: 12, color: "#8b93b8", letterSpacing: 2, marginBottom: 8 }}>
        🔮 転生<span style={{ fontFamily: "inherit", fontSize: 10, color: "#5b6284", letterSpacing: 0, marginLeft: 8 }}>調査でためたポイントで姿を引き直す</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#aab2d5", marginBottom: 3 }}>
        <span>転生ポイント（メモ+1・調査記録+3）</span>
        <span style={{ fontFamily: mono, color: pt >= REBORN_COST ? COL : "#aab2d5" }}>{pt} / {REBORN_COST}</span>
      </div>
      <Gauge value={Math.min(pt, REBORN_COST)} max={REBORN_COST} color={COL} />
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
        <button onClick={start} disabled={!state.ok || charging}
          style={{ ...btnStyle(COL), padding: "8px 14px", fontSize: 12.5, opacity: state.ok && !charging ? 1 : 0.4, cursor: state.ok ? "pointer" : "default" }}>
          {charging ? "🔮 ……" : `🔮 転生する（${REBORN_COST}ポイント）`}
        </button>
        <span style={{ fontSize: 11, color: "#8b93b8" }}>{state.ok ? `いま：${lookText(stock)}` : state.reason}</span>
      </div>
      <div style={{ fontSize: 10, color: "#5b6284", marginTop: 8, lineHeight: 1.7 }}>
        種族はそのままで、進化のかざりが別の種類に変わります{hasPack ? "（25%でユニークキャラが候補に出ます）" : ""}。
        引いたあと「このまま」か「転生先」かを選べます。どちらを選んでもポイントは使います。
        研究の積み重ねで遊ぶ機能で、銘柄の良し悪しや株価とは関係ありません。
        {(stock.rebornCount || 0) > 0 && ` これまでの転生：${stock.rebornCount}回`}
      </div>
    </div>
  );
}

/* 転生先をえらぶ(引いたあと必ず出る。外側タップでは閉じない=えらぶまで残る) */
export function RebornChoice({ stock, onPatch }) {
  const offer = stock.rebornOffer;
  const [done, setDone] = useState(null); // "keep" | "go"
  useEffect(() => { if (offer) sfx(offer.special ? "shiny" : "evo"); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!offer) return null;
  const next = previewReborn(stock, offer);
  const choose = (accept) => {
    setDone(accept ? "go" : "keep");
    sfx(accept ? "evoRare" : "close");
    setTimeout(() => onPatch(stock.id, settleReborn(stock, accept), true), accept ? 900 : 250);
  };
  const side = (label, s, hi) => (
    <div style={{ flex: 1, textAlign: "center", border: `1.5px solid ${hi ? COL : "#2a3050"}`, borderRadius: 12, padding: "12px 6px", background: hi ? "#1d1430" : "#10142a", opacity: done && ((done === "go") !== hi) ? 0.35 : 1, transition: "opacity .3s" }}>
      <div style={{ fontSize: 11, color: hi ? COL : "#8b93b8", fontWeight: 700, marginBottom: 8 }}>{label}</div>
      <div className={hi ? "kzEvoReveal" : undefined} style={{ display: "flex", justifyContent: "center", alignItems: "flex-end", minHeight: 96 }}>
        <Creature stock={s} size={84} live />
      </div>
      <div style={{ fontFamily: mono, fontSize: 11.5, color: "#f2f4ff", marginTop: 8 }}>{lookText(s)}</div>
    </div>
  );
  return (
    <Overlay onClose={() => {}} z={80}>
      <div style={{ background: "#0e1122", border: `2px solid ${COL}88`, borderRadius: 18, padding: 18, marginTop: 40 }}>
        <div style={{ fontFamily: mono, fontSize: 15, color: COL, textAlign: "center" }}>
          🔮 {offer.special ? "ユニークキャラ が あらわれた！" : "あたらしい すがた が あらわれた！"}
        </div>
        <div style={{ fontSize: 11.5, color: "#8b93b8", textAlign: "center", marginTop: 4 }}>{stock.name} を どちらの姿にしますか？</div>
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          {side("いまの姿", { ...stock, rebornOffer: undefined }, false)}
          {side("転生先", next, true)}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <button onClick={() => !done && choose(false)} style={{ ...btnStyle("#8b93b8"), flex: 1, textAlign: "center", padding: "10px 0" }}>このままにする</button>
          <button onClick={() => !done && choose(true)} style={{ all: "unset", cursor: "pointer", flex: 1, textAlign: "center", padding: "11px 0", borderRadius: 10, background: COL, color: "#1b0b2e", fontWeight: 800, fontSize: 13 }}>転生先にする</button>
        </div>
        <div style={{ fontSize: 10, color: "#5b6284", marginTop: 10, lineHeight: 1.6, textAlign: "center" }}>
          どちらを選んでも、ポイントはもう使っています。{offer.special ? "ユニークキャラの姿は、とくべつパックを読み込んだ端末でだけ見られます。" : ""}
        </div>
      </div>
    </Overlay>
  );
}
