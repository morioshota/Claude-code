/* 演出レイヤー: 紙吹雪・星バースト・画面フラッシュ・シェイクと、
   進化セレモニー(通常/レア/超レアのガチャ演出)・色違いセレモニー。
   演出はすべて「研究行動」の結果にだけ反応する(株価・市場とは無関係)。
   prefers-reduced-motion の端末ではパーティクルを出さず静かなフェードに落とす。 */

import { useEffect, useRef, useState } from "react";
import { Creature } from "./ui.jsx";
import { TYPES, STAGES } from "../data/constants.js";
import { EVO_KINDS, normEvo, EVO_FX } from "../data/evolution.js";
import { sfx } from "../lib/sound.js";

const reduced = () =>
  typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const CONFETTI_COLORS = ["#ffd166", "#f0abfc", "#4ade80", "#60a5fa", "#f87171", "#fde047", "#ffffff"];

/* 紙吹雪をn枚、画面上部から降らせる(Web Animations APIで自動掃除) */
export const burstConfetti = (n = 60) => {
  if (reduced()) return;
  const layer = document.getElementById("kz-fx-layer");
  if (!layer) return;
  for (let i = 0; i < n; i++) {
    const el = document.createElement("div");
    const size = 5 + Math.random() * 6;
    el.style.cssText = `position:absolute;top:-20px;left:${Math.random() * 100}%;width:${size}px;height:${size * 0.6}px;background:${CONFETTI_COLORS[i % CONFETTI_COLORS.length]};pointer-events:none;`;
    layer.appendChild(el);
    const drift = (Math.random() - 0.5) * 240;
    const fall = window.innerHeight * (0.5 + Math.random() * 0.6);
    const anim = el.animate(
      [
        { transform: "translate(0,0) rotate(0deg)", opacity: 1 },
        { transform: `translate(${drift}px, ${fall}px) rotate(${360 + Math.random() * 720}deg)`, opacity: 0 },
      ],
      { duration: 1600 + Math.random() * 1800, easing: "cubic-bezier(.2,.6,.4,1)", delay: Math.random() * 400 }
    );
    anim.onfinish = () => el.remove();
  }
};

/* 星のきらめきを画面中央付近に放射 */
export const burstStars = (n = 14) => {
  if (reduced()) return;
  const layer = document.getElementById("kz-fx-layer");
  if (!layer) return;
  for (let i = 0; i < n; i++) {
    const el = document.createElement("div");
    el.textContent = i % 3 === 0 ? "✦" : "✨";
    el.style.cssText = `position:absolute;top:45%;left:50%;font-size:${12 + Math.random() * 16}px;color:#ffd166;pointer-events:none;`;
    layer.appendChild(el);
    const ang = Math.random() * Math.PI * 2;
    const dist = 60 + Math.random() * 180;
    const anim = el.animate(
      [
        { transform: "translate(-50%,-50%) scale(.4)", opacity: 1 },
        { transform: `translate(${Math.cos(ang) * dist - 50}px, ${Math.sin(ang) * dist - 50}px) scale(1.3)`, opacity: 0 },
      ],
      { duration: 800 + Math.random() * 700, easing: "ease-out", delay: Math.random() * 250 }
    );
    anim.onfinish = () => el.remove();
  }
};

/* 一瞬の画面フラッシュ */
export const flashScreen = (color = "rgba(255,255,255,.55)") => {
  if (reduced()) return;
  const layer = document.getElementById("kz-fx-layer");
  if (!layer) return;
  const el = document.createElement("div");
  el.style.cssText = `position:absolute;inset:0;background:${color};pointer-events:none;`;
  layer.appendChild(el);
  const anim = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 450, easing: "ease-out" });
  anim.onfinish = () => el.remove();
};

/* 画面シェイク(bodyにクラスを付けて外す) */
export const shakeScreen = () => {
  if (reduced()) return;
  document.body.classList.remove("kz-shake");
  void document.body.offsetWidth; // アニメ再トリガー
  document.body.classList.add("kz-shake");
  setTimeout(() => document.body.classList.remove("kz-shake"), 600);
};

/* 演出の種類ごとの粒(2026-11)。mode: fall=上から舞い落ちる / rise=下からのぼる / streak=斜めに流れる / pop=中央からはじける */
export const burstParticles = (n, { chars, colors = ["#ffffff"], mode = "fall", size = [12, 22], dur = [1600, 2600] }) => {
  if (reduced()) return;
  const layer = document.getElementById("kz-fx-layer");
  if (!layer) return;
  const W = window.innerWidth, H = window.innerHeight;
  for (let i = 0; i < n; i++) {
    const el = document.createElement("div");
    el.textContent = chars[i % chars.length];
    const fs = size[0] + Math.random() * (size[1] - size[0]);
    el.style.cssText = `position:absolute;left:0;top:0;font-size:${fs}px;color:${colors[i % colors.length]};pointer-events:none;text-shadow:0 0 8px ${colors[i % colors.length]};`;
    layer.appendChild(el);
    let from, to;
    if (mode === "rise") {
      const x = Math.random() * W; from = `translate(${x}px,${H + 20}px) scale(.6)`; to = `translate(${x + (Math.random() - 0.5) * 120}px,${H * (0.1 + Math.random() * 0.4)}px) scale(1.2)`;
    } else if (mode === "streak") {
      const x = Math.random() * W * 0.9 + W * 0.2, y = Math.random() * H * 0.4 - 40; from = `translate(${x}px,${y}px) rotate(-35deg)`; to = `translate(${x - W * 0.6}px,${y + H * 0.45}px) rotate(-35deg)`;
    } else if (mode === "pop") {
      const a = Math.random() * Math.PI * 2, d = 80 + Math.random() * 220; from = `translate(${W / 2}px,${H * 0.45}px) scale(.3)`; to = `translate(${W / 2 + Math.cos(a) * d}px,${H * 0.45 + Math.sin(a) * d}px) scale(1.2)`;
    } else {
      const x = Math.random() * W; from = `translate(${x}px,-30px) rotate(0deg)`; to = `translate(${x + (Math.random() - 0.5) * 220}px,${H * (0.6 + Math.random() * 0.5)}px) rotate(${(Math.random() - 0.5) * 540}deg)`;
    }
    const anim = el.animate([{ transform: from, opacity: 0 }, { opacity: 1, offset: 0.12 }, { transform: to, opacity: 0 }],
      { duration: dur[0] + Math.random() * (dur[1] - dur[0]), easing: mode === "streak" ? "cubic-bezier(.3,0,.8,.6)" : "ease-out", delay: Math.random() * 700 });
    anim.onfinish = () => el.remove();
  }
};

/* 種類ごとの演出(セレモニーの「新しい姿」が出た瞬間に呼ぶ) */
const KIND_FX = {
  kirari: () => burstStars(8),
  ryusei: () => { burstParticles(14, { chars: ["✦", "★"], colors: ["#fde68a", "#ffffff", "#bae6fd"], mode: "streak", size: [14, 24], dur: [900, 1500] }); setTimeout(() => burstParticles(10, { chars: ["✦"], colors: ["#ffffff", "#fde68a"], mode: "streak", dur: [900, 1400] }), 900); },
  sakura: () => { burstParticles(46, { chars: ["❀", "✿", "•"], colors: ["#fbcfe8", "#f9a8d4", "#fff1f2"], mode: "fall", size: [12, 22], dur: [2400, 3800] }); },
  inazuma: () => { flashScreen("rgba(253,224,71,.55)"); shakeScreen(); setTimeout(() => flashScreen("rgba(255,255,255,.6)"), 260); burstParticles(10, { chars: ["⚡"], colors: ["#fde047"], mode: "pop", size: [20, 34], dur: [600, 1000] }); },
  shabon: () => { burstParticles(30, { chars: ["○", "◯", "°"], colors: ["#a5f3fc", "#e9d5ff", "#bfdbfe", "#ffffff"], mode: "rise", size: [14, 30], dur: [2400, 3800] }); },
  niji: () => { shakeScreen(); burstConfetti(140); burstStars(20); setTimeout(() => { burstConfetti(80); burstStars(14); }, 1200); },
  ougon: () => { shakeScreen(); flashScreen("rgba(255,209,102,.7)"); burstParticles(60, { chars: ["✦", "◆", "★"], colors: ["#ffd166", "#fde68a", "#f59e0b", "#fff7d6"], mode: "fall", size: [10, 20], dur: [1800, 3200] }); burstParticles(16, { chars: ["✦"], colors: ["#ffd166"], mode: "pop", dur: [800, 1300] }); },
};

/* パーティクルの受け皿(KabuDex直下に1つだけ置く) */
export function FxLayer() {
  return <div id="kz-fx-layer" style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 200, overflow: "hidden" }} />;
}

/* ============ 進化セレモニー(演出ガチャ: 通常70% / レア25% / 超レア5%) ============ */

const PRE_MS = 1300; // 進化まえの「ため」の長さ
const TIER_STYLE = {
  normal: { dur: 2600, label: "", border: "linear-gradient(120deg,#f0abfc,#ffd166,#4ade80,#60a5fa,#f0abfc)" },
  rare:   { dur: 3600, label: "★ レア演出 ★", border: "linear-gradient(120deg,#ffd166,#fff7d6,#ffd166,#f59e0b,#ffd166)" },
  ultra:  { dur: 5200, label: "🌈 超レア演出!! 🌈", border: "linear-gradient(120deg,#f87171,#ffd166,#4ade80,#60a5fa,#c084fc,#f87171)" },
};

export function EvoCeremony({ evo, onDone }) {
  // evo: { stock, stage, tier }
  const doneRef = useRef(false);
  const style = TIER_STYLE[evo.tier] || TIER_STYLE.normal;
  // 演出の種類(2026-11)。古い呼び出し(種類なし)は階級の代表で
  const kind = EVO_FX[evo.kind] ? evo.kind : evo.tier === "ultra" ? "niji" : evo.tier === "rare" ? "ryusei" : "kirari";
  const fx = EVO_FX[kind];
  const label = evo.tier === "ultra" ? `${fx.icon} 超レア演出「${fx.name}」!! ${fx.icon}` : evo.tier === "rare" ? `★ レア演出「${fx.name}」 ★` : "";
  // 2段構え(2026-11): ①進化まえの姿がふるえて光をためる「おや…？」→ ②白く光って新しい姿が現れる
  const [phase, setPhase] = useState("before");
  // 進化まえの姿: ひとつ前のステージのレベルにした仮の銘柄で描く(保存データは触らない)
  const prevStage = STAGES[Math.max(0, evo.stage.no - 2)];
  const beforeStock = { ...evo.stock, noteCount: 0, logs: new Array(Math.max(0, prevStage.min - 1)).fill({ date: "", text: "" }) };

  useEffect(() => {
    sfx("charge");
    const timers = [];
    timers.push(setTimeout(() => {
      setPhase("after");
      sfx(evo.tier === "ultra" ? "evoUltra" : evo.tier === "rare" ? "evoRare" : "evo");
      flashScreen(evo.tier === "ultra" ? "rgba(255,209,102,.6)" : "rgba(255,255,255,.55)");
      (KIND_FX[kind] || KIND_FX.kirari)();
    }, PRE_MS));
    return () => timers.forEach(clearTimeout);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = setTimeout(() => { if (!doneRef.current) { doneRef.current = true; onDone(); } }, PRE_MS + style.dur);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const t = TYPES[evo.stock.type] || TYPES.metal;
  const kindName = (EVO_KINDS[normEvo(evo.stock.evoPattern)] || {}).name || null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 150, display: "flex", justifyContent: "center", alignItems: "center", background: evo.tier === "ultra" ? "rgba(5,7,18,.7)" : "transparent", pointerEvents: "none" }}>
      {evo.tier === "ultra" && (
        <div style={{
          position: "absolute", width: 560, height: 560, borderRadius: "50%",
          background: kind === "ougon" ? "conic-gradient(#ffd16666,#fff7d633,#f59e0b66,#fff7d633,#ffd16666)" : "conic-gradient(#f8717155,#ffd16655,#4ade8055,#60a5fa55,#c084fc55,#f8717155)",
          animation: "kzSpin 3s linear infinite", filter: "blur(24px)",
        }} />
      )}
      <div style={{
        position: "relative", background: "#0e1122", borderRadius: 16, padding: 2,
        backgroundImage: `linear-gradient(#0e1122,#0e1122), ${style.border}`,
        backgroundOrigin: "border-box", backgroundClip: "padding-box, border-box",
        border: "2px solid transparent",
        boxShadow: evo.tier === "ultra" ? "0 0 90px rgba(255,209,102,.7)" : evo.tier === "rare" ? "0 0 60px rgba(255,209,102,.5)" : "0 0 50px rgba(240,171,252,.4)",
        // ⚠ kzPop は「left/top 50%に置いた要素」用(translate(-50%,-50%)入り)。flexで中央に置いたこの箱に使うと左上へずれる
        animation: `kzEvoBox ${(PRE_MS + style.dur) / 1000}s ease forwards`,
      }}>
        {phase === "before" ? (
          <div style={{ padding: "20px 30px", textAlign: "center", minWidth: 190 }}>
            <div style={{ fontFamily: "'DotGothic16', monospace", fontSize: 14, color: "#dfe4ff", marginBottom: 8 }}>おや…？ {evo.stock.name} のようすが…</div>
            <div className="kzEvoCharge" style={{ display: "flex", justifyContent: "center" }}>
              <Creature stock={beforeStock} size={84} />
            </div>
          </div>
        ) : (
        <div className="kzEvoReveal" style={{ padding: "20px 30px", textAlign: "center" }}>
          {label && (
            <div style={{ fontFamily: "'DotGothic16', monospace", fontSize: evo.tier === "ultra" ? 16 : 13, color: evo.tier === "ultra" ? "#ffd166" : "#fcd34d", marginBottom: 6, animation: "kzAura 1s ease-in-out infinite" }}>
              {label}
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "center", filter: `drop-shadow(0 0 18px ${t.color})`, animation: evo.tier !== "normal" ? "kzHop 0.7s ease-in-out infinite" : "none" }}>
            <Creature stock={evo.stock} size={evo.tier === "ultra" ? 110 : 84} live />
          </div>
          <div style={{ fontSize: 30, marginTop: 4 }}>✨</div>
          <div style={{ fontFamily: "'DotGothic16', monospace", color: "#f0abfc", fontSize: 16 }}>
            シンカ！ {evo.stock.name} は<br />STAGE {evo.stage.no}「{evo.stage.name}」になった！
          </div>
          {fx.trace && (
            <div style={{ fontFamily: "'DotGothic16', monospace", color: "#dfe4ff", fontSize: 11.5, marginTop: 8, lineHeight: 1.6 }}>
              {fx.icon} なごり: {fx.trace}
            </div>
          )}
          {kindName && (
            <div style={{ fontFamily: "'DotGothic16', monospace", color: "#8b93b8", fontSize: 12, marginTop: 6 }}>
              かざり: <span style={{ color: t.color }}>{kindName}</span>
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  );
}

/* ============ 色違いセレモニー(調査記録の保存で低確率当選) ============ */

export function ShinyCeremony({ stock, onDone }) {
  useEffect(() => {
    sfx("shiny");
    flashScreen("rgba(240,171,252,.5)");
    burstStars(26);
    const t1 = setTimeout(() => { burstStars(18); sfx("sparkle"); }, 900);
    const t2 = setTimeout(onDone, 4200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 150, display: "flex", justifyContent: "center", alignItems: "center", background: "rgba(5,7,18,.65)", pointerEvents: "none" }}>
      <div style={{
        background: "#0e1122", borderRadius: 16, padding: 2,
        backgroundImage: "linear-gradient(#0e1122,#0e1122), linear-gradient(120deg,#f0abfc,#ffffff,#c4b5fd,#f0abfc)",
        backgroundOrigin: "border-box", backgroundClip: "padding-box, border-box",
        border: "2px solid transparent", boxShadow: "0 0 80px rgba(240,171,252,.6)",
        animation: "kzEvoBox 4.2s ease forwards",
      }}>
        <div style={{ padding: "22px 34px", textAlign: "center" }}>
          <div style={{ fontFamily: "'DotGothic16', monospace", fontSize: 15, color: "#f0abfc", animation: "kzAura 1s ease-in-out infinite" }}>
            ✨ いろちがい だ！！ ✨
          </div>
          <div style={{ display: "flex", justifyContent: "center", marginTop: 8, filter: "drop-shadow(0 0 20px #f0abfc)" }}>
            <Creature stock={{ ...stock, shiny: true }} size={100} />
          </div>
          <div style={{ fontFamily: "'DotGothic16', monospace", color: "#dfe4ff", fontSize: 13, marginTop: 8 }}>
            {stock.name} が とくべつな色になった！<br />
            <span style={{ fontSize: 10.5, color: "#8b93b8" }}>（確率5%・この色は永久に残ります）</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============ 特別キャラのセレモニー(調査記録の保存で超低確率当選。種族と無関係) ============ */

export function SpecialCeremony({ stock, onDone }) {
  useEffect(() => {
    sfx("shiny");
    flashScreen("rgba(255,209,102,.55)");
    burstStars(34);
    const t1 = setTimeout(() => { burstStars(24); sfx("sparkle"); }, 900);
    const t2 = setTimeout(() => { burstStars(18); sfx("sparkle"); }, 1900);
    const t3 = setTimeout(onDone, 5600);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 150, display: "flex", justifyContent: "center", alignItems: "center", background: "rgba(5,7,18,.7)", pointerEvents: "none" }}>
      <div style={{
        background: "#0e1122", borderRadius: 16, padding: 2,
        backgroundImage: "linear-gradient(#0e1122,#0e1122), linear-gradient(120deg,#ffd166,#ffffff,#f0abfc,#7dd3fc,#ffd166)",
        backgroundOrigin: "border-box", backgroundClip: "padding-box, border-box",
        border: "2px solid transparent", boxShadow: "0 0 90px rgba(255,209,102,.6)",
        animation: "kzEvoBox 5.6s ease forwards",
      }}>
        <div style={{ padding: "22px 34px", textAlign: "center" }}>
          <div style={{ fontFamily: "'DotGothic16', monospace", fontSize: 15, color: "#ffd166", animation: "kzAura 1s ease-in-out infinite" }}>
            🌟 とくべつなキャラ が あらわれた！！ 🌟
          </div>
          <div style={{ display: "flex", justifyContent: "center", marginTop: 8, filter: "drop-shadow(0 0 22px #ffd166)" }}>
            <Creature stock={stock} size={110} />
          </div>
          <div style={{ fontFamily: "'DotGothic16', monospace", color: "#dfe4ff", fontSize: 13, marginTop: 8 }}>
            {stock.name} に とくべつなキャラ が やってきた！<br />
            <span style={{ fontSize: 10.5, color: "#8b93b8" }}>（登録したときだけの低確率・この姿は永久に残ります）</span>
          </div>
        </div>
      </div>
    </div>
  );
}
