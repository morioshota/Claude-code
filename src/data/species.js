/* 種族データ(2026-09 全面刷新): タイプごと5種族×10タイプ=50種族。
   各種族は「進化段階 t(0=ST1〜2 / 1=ST3〜4 / 2=ST5)を受け取り、3Dの部品と顔を返す関数」。
   描画は lib/creature3d.js。ドラクエのモンスターの“丸くて表情豊か”な作風を参考にした
   オリジナルデザイン(特定の既存モンスターの模写はしない)。

   座標: x=右, y=手前(顔の向き), z=上。地面が z=0。1単位 ≒ 1ドット(段階ごとに sprites.js で拡大)
   素材: body 体色 / belly 腹 / accent 差し色 / dark / white / gold / metal / glass / gem /
         pink / red / orange / leaf / wood / yellow / glowpart(陰影なしで光る) */

import { E, S, chain, mirror, onHead, eyes, mouth } from "../lib/creature3d.js";
import { R, quad, dragon, hero, bird, fish } from "./rigs.js";
import { turn } from "../lib/creature3d.js";

const CREATURE_LOOK = {
  cosmo:  { bodies: ["#a78bfa", "#8b5cf6", "#c4b5fd"], belly: "#ede9fe", accent: "#f0abfc" },
  metal:  { bodies: ["#94a3b8", "#7d8aa0", "#b3bfce"], belly: "#e2e8f0", accent: "#64748b" },
  spark:  { bodies: ["#facc15", "#fbbf24", "#fde047"], belly: "#fef9c3", accent: "#f97316" },
  build:  { bodies: ["#fb923c", "#f59e0b", "#fdba74"], belly: "#ffedd5", accent: "#b45309" },
  play:   { bodies: ["#f472b6", "#ec4899", "#f9a8d4"], belly: "#fce7f3", accent: "#a855f7" },
  drive:  { bodies: ["#38bdf8", "#0ea5e9", "#7dd3fc"], belly: "#e0f2fe", accent: "#334155" },
  life:   { bodies: ["#4ade80", "#34d399", "#86efac"], belly: "#dcfce7", accent: "#16a34a" },
  tech:   { bodies: ["#22d3ee", "#06b6d4", "#67e8f9"], belly: "#cffafe", accent: "#0e7490" },
  money:  { bodies: ["#a3e635", "#84cc16", "#bef264"], belly: "#f7fee7", accent: "#ca8a04" },
  market: { bodies: ["#e879f9", "#d946ef", "#f0abfc"], belly: "#fae8ff", accent: "#f472b6" },
};

/* よく使う形 */
const legs2 = (x, y, r = 2.2, h = 3) => mirror([E(x, y, h * 0.55, r, r, h * 0.6, "body")]);
const feet2 = (x, y, r = 2.4) => mirror([E(x, y + 0.6, 1.1, r, r * 1.3, 1.2, "dark")]);
const crown = (z, r = 2.6) => [E(0, 0, z, r, r, 0.9, "gold"), ...[-1, 0, 1].map((k) => S(k * r * 0.7, 0, z + 1.4, 0.8, "gold")), S(0, 0.2, z + 1.2, 0.7, "gem")];
const halo = (z, r = 3.6) => Array.from({ length: 10 }, (_, i) => { const a = (i / 10) * Math.PI * 2; return S(Math.cos(a) * r, Math.sin(a) * r * 0.6, z, 0.75, "gold"); });
const wingPair = (x, y, z, rx, rz, mat = "accent", tilt = 3) => mirror([E(x, y - 1, z, rx, 0.9, rz, mat), E(x + rx * 0.6, y - 1.2, z + tilt, rx * 0.55, 0.8, rz * 0.6, mat)]);
const earsPointy = (h, len = 4, mat = "body", spread = 0.55) => mirror(chain([h.c[0] + h.r[0] * spread, h.c[1], h.c[2] + h.r[2] * 0.6], [h.c[0] + h.r[0] * spread + 1, h.c[1] - 0.5, h.c[2] + h.r[2] * 0.6 + len], 1.6, 0.4, 4, mat));

/* 旧ロスターの種族(2026-09前半)。いくつかは新しいロスターでもそのまま使う */
const LEGACY = {
  /* ---------------- コスモ(宇宙・防衛) ---------------- */
  cosmo: [
    { name: "ほしぐも", build: (t) => { // ふわふわの雲に星のアンテナ
      const h = S(0, 0, 10, 6.4, "body");
      const P = [h, ...mirror([S(5.6, -0.5, 8, 3.6, "body")]), S(0, -2, 13.5, 4, "body"), S(0, 2.5, 6.5, 3.4, "belly")];
      P.push(...chain([0, 0, 15.5], [1.5, 0, 20 + t], 0.6, 0.5, 5, "accent"), S(1.5, 0, 21 + t, 1.5 + t * 0.3, "gold"));
      if (t >= 1) P.push(...chain([-3, 0, 15], [-5, 0, 19], 0.5, 0.4, 4, "accent"), S(-5, 0, 19.6, 1.2, "gold"));
      if (t >= 2) P.push(...halo(18, 6), ...wingPair(6.5, -2, 11, 3, 4, "white"));
      return { parts: P, faces: [...eyes(h, "big", 0.4, 0.05), mouth(h, "smile", -0.3)], blush: true };
    } },
    { name: "ロケットン", build: (t) => { // ロケットの体にひとつ目の窓
      const b = E(0, 0, 10, 4.6, 4.6, 8.5, "body");
      const P = [b, ...chain([0, 0, 17], [0, 0, 22 + t], 3.4, 0.8, 5, t >= 2 ? "gold" : "accent"),
        ...mirror([E(4.6, 0, 4, 1.1, 2.8, 3.8, "accent")]), E(0, -4.4, 4, 1.1, 1.1, 3.6, "accent"),
        S(0, 3.4, 11.5, 2.6, "glass")];
      if (t >= 1) P.push(...mirror([E(6.2, -1, 7, 1.6, 1.6, 4.5, "metal"), S(6.2, -1, 2.2, 1.3, "glowpart")]));
      if (t >= 2) P.push(S(0, 0, 0.4, 2.8, "glowpart"), ...mirror([E(6, 0, 3, 2.2, 3.8, 1, "gold")]));
      return { parts: P, faces: [{ kind: "eye", style: "cyclops", p: [0, 5.8, 11.8] }], glow: "#ffd166" };
    } },
    { name: "つきうさ", build: (t) => { // 長い耳のうさぎ+バイザー
      const h = S(0, 0.6, 13, 5, "body");
      const P = [S(0, 0, 6, 5.8, "body"), E(0, 3.2, 5.6, 3.6, 2.5, 3.6, "belly"), h,
        ...mirror(chain([2.2, 0, 17], [3.2, -1, 24 + t * 1.5], 1.5, 0.9, 6, "body")),
        E(0, 4.4, 13.6, 4.2, 1.3, 1.7, "glass"), ...feet2(2.8, 1.4)];
      if (t >= 1) P.push(...chain([0, -3, 15], [0, -5, 20], 0.4, 0.4, 4, "metal"), S(0, -5, 20.5, 1.1, "glowpart"), E(0, -5.2, 8, 3.6, 2.2, 4, "metal"));
      if (t >= 2) P.push(...chain([-5, -1, 16], [5, -1, 16], 0.9, 0.9, 9, "gold", [0, -1, 23]));
      return { parts: P, faces: [...eyes(h, "glow", 0.36, 0.18), mouth(h, "cat", -0.36)], glow: "#7dd3fc" };
    } },
    { name: "メテオガメ", build: (t) => { // 隕石の甲羅のかめ
      const sh = E(0, -1, 6, 7.8 + t, 7.8 + t, 5.4 + t * 0.5, "dark");
      const h = S(0, 7.5 + t, 5.4, 3.4, "body");
      const P = [sh, h, ...mirror([E(5, 3, 1.6, 2, 2, 1.8, "body"), E(5, -5, 1.6, 2, 2, 1.8, "body")]),
        S(2, 1, 10.5 + t * 0.5, 1.4, "accent"), S(-3, -2, 10.5 + t * 0.5, 1.1, "accent"), S(3.5, -4, 9, 1, "accent")];
      if (t >= 1) P.push(...[[-2, 0], [2, -3], [0, -6], [-4, -4]].map(([x, y]) => E(x, y, 11 + t * 0.6, 0.9, 0.9, 2.4, "gem")));
      if (t >= 2) P.push(S(0, -1, 13.5, 1.6, "glowpart"), E(0, -9, 3, 1.4, 3, 1.2, "body"));
      return { parts: P, faces: [...eyes(h, "angry", 0.45, 0.25), mouth(h, "line", -0.2)] };
    } },
    { name: "コメットン", build: (t) => { // ほうき星の子。光る尾を引く
      const h = S(0, 0, 9.5, 5.8, "body");
      const P = [h, ...chain([0, -3, 11], [0, -12, 17], 4.2, 0.8, 7, "glowpart", [0, -9, 9])];
      if (t >= 1) P.push(...mirror(chain([2.5, -3, 11], [6, -11, 16], 2.4, 0.6, 6, "glowpart", [5, -8, 9])));
      if (t >= 2) P.push(...crown(15.8, 2.4));
      return { parts: P, faces: [...eyes(h, "angry", 0.42, 0.12), mouth(h, "fang", -0.3)], glow: "#fef08a" };
    } },
  ],

  /* ---------------- メタル(重工・素材) ---------------- */
  metal: [
    { name: "ボルトン", build: (t) => { // 鉄のゴーレム
      const h = S(0, 1.5, 19.5, 3.4, "metal");
      const P = [E(0, 0, 11, 7, 5, 6.5, "metal"), h, ...mirror([S(8, 0, 14.5, 3.8, "metal"),
        ...chain([8.6, 0.5, 12], [9, 2, 6], 2.2, 2.4, 3, "metal"), S(9, 2.2, 4.4, 2.9, "dark"),
        E(3.4, 0, 3, 2.8, 2.8, 3.3, "dark")]), E(0, 4.6, 11, 3, 0.8, 3, "accent")];
      if (t >= 1) P.push(...mirror([S(8, 2.5, 17.2, 0.9, "gold"), S(10.6, 1, 15.5, 0.9, "gold")]));
      if (t >= 2) P.push(...mirror(chain([2.4, 1, 21.5], [4.5, 0, 26], 1.2, 0.4, 4, "gold")), S(0, 5, 12, 1.8, "gem"));
      return { parts: P, faces: [...eyes(h, "glow", 0.4, 0.05)], glow: "#ff5a5a" };
    } },
    { name: "はがねダンゴ", build: (t) => { // 丸まった鋼のダンゴムシ
      const b = S(0, 0, 7, 7 + t * 0.5, "metal");
      const h = S(0, 6.2 + t * 0.5, 4.4, 3.2, "body");
      const P = [b, h,
        ...[-4, 0, 4].map((x) => E(x, 0, 7, 0.9, 7.2 + t * 0.5, 7.2 + t * 0.5, "accent")),
        ...mirror(chain([1.4, 8.4, 6], [3.4, 11, 9], 0.45, 0.35, 4, "dark"))];
      if (t >= 1) P.push(...[-4, 0, 4].map((x) => E(x, -1, 14.3 + t * 0.5, 1, 1, 2, "metal")));
      if (t >= 2) P.push(...[-4, 0, 4].map((x) => S(x, -1, 16.6, 0.9, "gold")));
      return { parts: P, faces: [...eyes(h, "dot", 0.45, 0.2), mouth(h, "line", -0.35)] };
    } },
    { name: "クレーンどり", build: (t) => { // 首の長いクレーンの鳥
      const h = S(0, 6, 21 + t * 2, 3, "body");
      const P = [E(0, 0, 9, 5, 6, 4.6, "body"), ...chain([0, 2.5, 11], [0, 5.4, 19.5 + t * 2], 2.2, 1.6, 6, "body"),
        h, ...chain([0, 8.5, 21 + t * 2], [0, 12, 20 + t * 2], 1.1, 0.4, 4, "orange"),
        ...mirror(chain([2, 0, 5], [2.4, 1, 0.6], 0.7, 0.6, 4, "dark")), E(0, -5.5, 10, 2.5, 3, 1.4, "accent")];
      if (t >= 1) P.push(...chain([0, 5, 23.5 + t * 2], [0, 2, 27 + t * 2], 0.7, 0.3, 4, "accent"), ...wingPair(4.2, 0, 10, 2.6, 3.4, "metal", 2));
      if (t >= 2) P.push(...chain([0, 12, 20 + t * 2], [0, 12.4, 16.5 + t * 2], 0.5, 0.5, 3, "gold"));
      return { parts: P, faces: [...eyes(h, "dot", 0.55, 0.2)] };
    } },
    { name: "ギアモグラ", build: (t) => { // ドリルの鼻のもぐら
      const h = S(0, 4.6, 8.6, 5, "body");
      const P = [E(0, -1, 7, 7, 7, 6.4, "body"), h, E(0, 7, 6.2, 3.2, 1.6, 2.2, "belly"),
        ...chain([0, 9, 8], [0, 15 + t * 1.5, 8], 2.6 + t * 0.3, 0.6, 5, t >= 2 ? "gold" : "metal"),
        ...mirror([E(6, 4, 3, 2.4, 2.8, 1.4, "metal")]), ...feet2(3.6, -1)];
      if (t >= 1) P.push(...mirror([S(2.2, 7.6, 12.2, 1.6, "glass")]), E(0, 6.8, 12.3, 3.8, 0.6, 0.6, "dark"));
      if (t >= 2) P.push(...[-4, 0, 4].map((x) => E(x, -3, 13.5, 1, 1, 2.2, "metal")));
      return { parts: P, faces: [...eyes(h, "sleepyl", 0.42, 0.12), mouth(h, "tongue", -0.48)] };
    } },
    { name: "てつかぶと", build: (t) => { // 歩くかぶと。すき間から光る目
      const h = S(0, 0, 10, 7, "metal");
      const P = [h, E(0, 5.2, 10, 5, 2.2, 1.1, "dark"), E(0, 0, 4.2, 7.4, 7.4, 1.2, "accent"),
        ...feet2(3, 0, 2.2), ...chain([0, -1, 16.5], [0, -6, 17], 1.6, 1, 5, "accent", [0, -3, 19])];
      if (t >= 1) P.push(...mirror(chain([5.5, 0, 13], [9, 1, 18], 1.4, 0.4, 5, t >= 2 ? "gold" : "metal")));
      if (t >= 2) P.push(E(0, -7, 8, 6.6, 1, 6.6, "red"), S(0, 6.6, 13.2, 1.1, "gem"));
      return { parts: P, faces: [{ kind: "eye", style: "glow", p: [-2, 7.1, 10.3] }, { kind: "eye", style: "glow", p: [2, 7.1, 10.3], mirror: true }], glow: "#fbbf24" };
    } },
  ],

  /* ---------------- スパーク(電機・電力) ---------------- */
  spark: [
    { name: "ビリたま", build: (t) => { // ぎざぎざ放電の玉
      const h = S(0, 0, 9, 6.4, "body");
      const n = 5 + t * 2;
      const P = [h, ...Array.from({ length: n }, (_, i) => {
        const a = -Math.PI * 0.9 + (i / (n - 1)) * Math.PI * 0.8 - Math.PI / 10;
        const dx = Math.cos(a), dz = -Math.sin(a);
        return chain([dx * 5, -1, 9 + dz * 5], [dx * 9.5, -1.5, 9 + dz * 9.5], 1.3, 0.4, 3, "accent", [dx * 7 + 1.2, -1, 9 + dz * 7 + 0.5]);
      }).flat()];
      if (t >= 2) P.push(...halo(3, 7.5).map((p) => ({ ...p, mat: "glowpart" })), ...crown(16.4, 2.2));
      return { parts: P, faces: [...eyes(h, "big", 0.4, 0.1), mouth(h, "grin", -0.35)] };
    } },
    { name: "とぐろウナギ", build: (t) => { // とぐろを巻く電気うなぎ
      const h = S(0, 3, 14 + t, 4, "body");
      const P = [...chain([-6, -2, 2.5], [6, -2, 2.5], 2.8, 2.8, 9, "body", [0, 8, 2.5]), ...chain([6, -2, 2.5], [0, 3, 10 + t], 2.8, 3.2, 6, "body", [7, 2, 7]),
        h, E(0, 6.2, 12.8 + t, 2.4, 1.4, 1.4, "belly"), E(0, -1, 17.5 + t, 0.8, 3, 2.4, "accent")];
      if (t >= 1) P.push(...mirror(chain([2.4, 6.4, 13 + t], [6, 8, 12 + t], 0.4, 0.3, 4, "yellow")));
      if (t >= 2) P.push(...mirror([E(4.5, 2, 15.5 + t, 0.8, 2, 2.6, "gold")]), S(0, -1, 20.5 + t, 1.3, "glowpart"));
      return { parts: P, faces: [...eyes(h, "slit", 0.46, 0.22), mouth(h, "fang", -0.36)], glow: "#fef08a" };
    } },
    { name: "ホタルン", build: (t) => { // 光るおしりのほたる
      const h = S(0, 4.6, 10, 3.6, "dark");
      const P = [E(0, -3.6, 8.4, 4 + t * 0.5, 5 + t * 0.5, 4 + t * 0.5, "glowpart"), S(0, 1, 9.2, 3.8, "body"), h,
        ...mirror(chain([1.4, 5.4, 13], [3.6, 7, 17], 0.4, 0.4, 4, "dark")), ...mirror([S(3.6, 7, 17.3, 0.9, "body")]),
        ...mirror([E(4.4, -0.5, 12.5, 4, 0.6, 2, "glass")]), ...mirror(chain([2.4, 1, 6.5], [3.6, 2, 1], 0.5, 0.5, 3, "dark"))];
      if (t >= 1) P.push(...mirror([E(4.8, -2.2, 10.2, 3.6, 0.6, 1.6, "glass")]));
      if (t >= 2) P.push(...crown(13.4, 2));
      return { parts: P, faces: [...eyes(h, "big", 0.45, 0.1), mouth(h, "smile", -0.4)], glow: "#fef08a" };
    } },
    { name: "プラグン", build: (t) => { // コンセントの精
      const h = E(0, 0, 9, 6, 5, 7, "body");
      const P = [h, ...mirror([E(2.2, 0, 17, 0.9, 0.9, 3.2, t >= 2 ? "gold" : "metal")]),
        ...chain([0, -4.6, 5], [5, -9, 3], 1.1, 1, 7, "dark", [0, -10, 9]), ...feet2(2.6, 0.5, 2)];
      if (t >= 1) P.push(E(0, 0, 17.8, 0.9, 0.9, 3.8, t >= 2 ? "gold" : "metal"), S(5, -9, 3, 1.6, "metal"));
      if (t >= 2) P.push(...halo(14, 5).map((p) => ({ ...p, mat: "glowpart" })));
      return { parts: P, faces: [...eyes(h, "oval", 0.4, 0.2), mouth(h, "o", -0.25)] };
    } },
    { name: "イナズマどり", build: (t) => { // 稲妻のとさかの小鳥
      const h = S(0, 3.2, 13, 4.2, "body");
      const P = [S(0, 0, 8, 5.4, "body"), E(0, 3.2, 7, 3.4, 2.2, 3.6, "belly"), h,
        ...chain([0, 7, 13], [0, 10, 12.4], 1.2, 0.3, 3, "orange"),
        ...chain([0, 2, 17], [0, -2, 23 + t * 1.5], 1.2, 0.4, 6, "accent", [2.5, 1, 20]),
        ...wingPair(5, -1, 9, 2.4 + t * 0.8, 3 + t, "accent"), ...chain([0, -4.5, 6], [0, -10, 8], 1.4, 0.5, 5, "accent"),
        ...mirror(chain([1.8, 1, 3], [2, 1.5, 0.5], 0.5, 0.5, 3, "orange"))];
      if (t >= 2) P.push(...chain([0, -10, 8], [0, -14, 13], 1, 0.5, 5, "glowpart", [-3, -12, 10]), ...crown(17.5, 1.8));
      return { parts: P, faces: [...eyes(h, "angry", 0.5, 0.2)], glow: "#fde047" };
    } },
  ],

  /* ---------------- ビルド(建設・インフラ) ---------------- */
  build: [
    { name: "レンガーン", build: (t) => { // レンガの壁のかたまり
      const h = E(0, 0, 9, 8, 6, 8, "body");
      const P = [h, ...[[-4, 4.6, 12], [3, 4.8, 13], [-1, 5.2, 6], [5, 4.4, 7], [-5.5, 4, 5]].map(([x, y, z]) => E(x, y, z, 2.4, 1.2, 1.3, "accent")),
        ...mirror([E(8, 1, 7, 1.8, 1.8, 2.6, "body")]), ...feet2(3.6, 0, 2.6)];
      if (t >= 1) P.push(E(0, 0, 16.5, 6.2, 5.4, 2.6, "yellow"), E(0, 3.6, 15, 6.4, 3, 0.6, "yellow"));
      if (t >= 2) P.push(...crown(19.6, 2.8), ...mirror([S(9, 2, 10.5, 2, "metal")]));
      return { parts: P, faces: [...eyes(h, "dot", 0.36, 0.28), mouth(h, "zigzag", -0.2)] };
    } },
    { name: "ヘルモグ", build: (t) => { // ヘルメットのもぐら
      const h = S(0, 2, 11, 5.4, "body");
      const P = [E(0, 0, 6, 6, 5.4, 5.6, "body"), E(0, 3.6, 5.8, 3.8, 2.2, 3.6, "belly"), h,
        E(0, 2, 14.4, 5.8, 5.8, 3, "yellow"), E(0, 4.6, 13, 6, 3.4, 0.7, "yellow"), S(0, 7, 15.2, 1.3, "glowpart"),
        S(0, 7.2, 10, 1.4, "pink"), ...mirror([E(5.4, 3.5, 4.4, 2, 2.6, 1.4, "white")])];
      if (t >= 1) P.push(...mirror(chain([6, 1, 9], [9, 2, 13], 1.1, 1, 4, "body")), E(9, 2.4, 15, 0.7, 0.7, 4, "wood"));
      if (t >= 2) P.push(E(0, 2, 14.5, 6, 6, 3.1, "gold"), ...mirror([S(3, 0, 18, 1, "gem")]));
      return { parts: P, faces: [...eyes(h, "happy", 0.42, 0.18), mouth(h, "smile", -0.45)], blush: true, glow: "#fef08a" };
    } },
    { name: "ショベルガニ", build: (t) => { // 大きなショベルの手のかに
      const P = [E(0, 0, 6, 7, 5, 4, "body"), E(0, 3, 5, 5, 2.6, 2.6, "belly"),
        ...mirror(chain([2.4, 3, 9], [3, 4, 13], 0.6, 0.6, 3, "body")), ...mirror([S(3, 4, 13.6, 1.7, "white")]),
        ...chain([6, 2, 6], [11, 6, 8], 1.6, 1.4, 4, "body"), E(12.5 + t, 7, 8, 3.6 + t, 3.2 + t, 1, t >= 2 ? "gold" : "metal"),
        ...chain([-6, 2, 6], [-9, 5, 7], 1.3, 1, 3, "body"), S(-9.5, 5.6, 7.2, 1.8, "body"),
        ...mirror([...chain([5, -1, 4], [8, -2, 0.5], 0.7, 0.5, 3, "dark"), ...chain([4, -3, 4], [6.5, -5, 0.5], 0.7, 0.5, 3, "dark")])];
      if (t >= 1) P.push(...[-4, 0, 4].map((x) => E(x, -2, 9.8, 1, 1, 1.8, "accent")));
      return { parts: P, faces: [{ kind: "eye", style: "dot", p: [-3, 5.6, 14] }, { kind: "eye", style: "dot", p: [3, 5.6, 14], mirror: true }, { kind: "mouth", style: "line", p: [0, 5.6, 5.6] }] };
    } },
    { name: "ドカタンク", build: (t) => { // 重機のようなかぶと虫
      const h = S(0, 5.5, 6, 3.6, "dark");
      const P = [E(0, -1.5, 6.5, 6.2, 7.6, 4.8, "body"), E(0, -1.5, 6.6, 0.5, 7.6, 4.9, "dark"), h,
        ...chain([0, 8, 7], [0, 11 + t, 14 + t * 1.5], 1.6, 0.5, 6, t >= 2 ? "gold" : "accent", [0, 12, 8]),
        ...mirror([...chain([4, 2, 3], [6.5, 3, 0.5], 0.7, 0.6, 3, "dark"), ...chain([4.5, -3, 3], [7, -4, 0.5], 0.7, 0.6, 3, "dark")])];
      if (t >= 1) P.push(...mirror(chain([2, 7, 8.5], [4.5, 9, 11], 0.8, 0.3, 4, "accent")));
      if (t >= 2) P.push(...mirror([E(6.4, -2, 7.5, 0.8, 4, 2.2, "gold")]));
      return { parts: P, faces: [...eyes(h, "angry", 0.5, 0.2)] };
    } },
    { name: "つみきドラ", build: (t) => { // 小さなドラゴン
      const h = S(0, 2.5, 14, 4.8, "body");
      const P = [E(0, -0.5, 7.5, 5.4, 5, 6, "body"), E(0, 3.2, 7, 3.4, 2, 4.2, "belly"), h, E(0, 6.4, 12.8, 2.6, 2.2, 2, "body"),
        ...legs2(3, 1, 2, 3), ...chain([0, -4, 5], [0, -11, 4 + t], 2.4, 0.7, 6, "body", [0, -9, 1]),
        ...wingPair(4.2, -2, 12, 2 + t * 1.5, 2.6 + t * 1.4, "accent")];
      if (t >= 1) P.push(...mirror(chain([2, 1.5, 18], [3.4, -1, 21 + t], 1, 0.3, 4, t >= 2 ? "gold" : "belly")));
      if (t >= 2) P.push(...[-2, -5, -8].map((y) => E(0, y, 12 - (y + 2) * 0.35, 0.6, 1, 1.6, "accent")));
      return { parts: P, faces: [...eyes(h, "big", 0.42, 0.25), mouth(h, "fang", -0.35)] };
    } },
  ],

  /* ---------------- プレイ(ゲーム・エンタメ) ---------------- */
  play: [
    { name: "ピエロン", build: (t) => { // とんがり帽子のピエロ
      const h = S(0, 1, 13, 5, "belly");
      const P = [S(0, 0, 6, 5.8, "body"), h, S(0, 6, 12.4, 1.5, "red"),
        ...chain([0, 0, 17], [2.5, -1, 25 + t], 3.6, 0.6, 6, "accent", [0, 0, 22]), S(2.5, -1, 25.6 + t, 1.4, "gold"),
        ...feet2(3, 0.5, 2.4)];
      if (t >= 1) P.push(...Array.from({ length: 9 }, (_, i) => { const a = (i / 9) * Math.PI * 2; return S(Math.cos(a) * 5, Math.sin(a) * 5, 9.6, 1.6, "white"); }));
      if (t >= 2) P.push(S(-8, 2, 16, 1.4, "gold"), S(8, 2, 18, 1.4, "gem"), S(0, 3, 22, 1.2, "red"));
      return { parts: P, faces: [...eyes(h, "happy", 0.44, 0.22), mouth(h, "big", -0.42)], blush: true };
    } },
    { name: "パッドン", build: (t) => { // ゲームパッドの生きもの
      const h = E(0, 0, 8, 9, 4, 5.5, "body");
      const P = [h, ...mirror([E(6.4, 0, 5, 3.4, 3.6, 4.4, "body")]),
        ...[[5, 3.6, 9.6, "accent"], [7, 3.4, 8.2, "gold"], [5, 3.4, 6.8, "red"], [3, 3.6, 8.2, "white"]].map(([x, y, z, m]) => S(x, y, z, 1, t >= 2 ? "glowpart" : m)),
        E(-5, 3.8, 8.2, 2.4, 0.6, 0.8, "dark"), E(-5, 3.8, 8.2, 0.8, 0.6, 2.4, "dark"), ...feet2(5, 0, 2.2)];
      if (t >= 1) P.push(...chain([0, -3, 12], [0, -6, 18], 0.6, 0.6, 5, "dark", [0, -6, 13]), S(0, -6, 18.6, 1.3, "accent"));
      if (t >= 2) P.push(...crown(13.8, 2.4));
      return { parts: P, faces: [{ kind: "eye", style: "dot", p: [-1.6, 3.9, 10.2] }, { kind: "eye", style: "dot", p: [1.6, 3.9, 10.2], mirror: true }, { kind: "mouth", style: "smile", p: [0, 4, 7.4] }], glow: "#fde047" };
    } },
    { name: "おどりタケ", build: (t) => { // 踊るきのこ
      const st = E(0, 0, 7, 4, 4, 6, "belly");
      const cap = E(0, 0, 14.5, 8 + t, 8 + t, 4.4 + t * 0.4, "body");
      const P = [st, cap, ...[[-4, 3, 17], [3, 4, 17.5], [0, -1, 19], [5.5, -1, 15.6], [-6, 0, 15]].map(([x, y, z]) => S(x, y, z, 1.3, t >= 2 ? "glowpart" : "white")),
        ...mirror(chain([3.6, 0.5, 8], [7, 2, 11], 0.9, 0.8, 4, "belly")), ...feet2(2, 0.5, 2)];
      if (t >= 1) P.push(...mirror([S(7.4, 2, 11.2, 1.2, "belly")]));
      return { parts: P, faces: [...eyes(st, "big", 0.38, 0.3), mouth(st, "o", -0.1)], glow: "#fef9c3" };
    } },
    { name: "ハートおばけ", build: (t) => { // ハートの尾のおばけ
      const h = S(0, 0, 12, 6.2, "white");
      const P = [h, ...chain([0, -1, 8], [0, -7, 2.5], 5, 1.2, 6, "white", [0, -3, 3]),
        ...mirror([S(1.4, -8, 3.8, 1.8, "red")]), E(0, -8.4, 2.4, 1.6, 1.4, 1.8, "red"),
        ...mirror([E(6, 1.5, 10, 1.8, 1.6, 1.4, "white")])];
      if (t >= 1) P.push(...halo(20, 3.4));
      if (t >= 2) P.push(...wingPair(6.5, -2, 14, 3, 4, "accent"), ...mirror([S(1.2, 6, 10, 1.2, "red")]));
      return { parts: P, faces: [...eyes(h, "oval", 0.38, 0.12), mouth(h, "tongue", -0.3)], blush: true };
    } },
    { name: "ネコまじん", build: (t) => { // けむりの尾のねこの魔人
      const h = S(0, 1.5, 15, 5, "body");
      const P = [E(0, 0, 10, 5, 4.2, 4, "accent"), h, ...earsPointy(h, 4, "body", 0.6),
        ...chain([0, 0, 7], [3, -3, 1], 3.6, 1.2, 6, "white", [4, 1, 3]), ...mirror([S(5.2, 1.4, 12.5, 0.8, "gold")]),
        ...mirror(chain([4.4, 1, 11], [2, 4.4, 9.6], 1.2, 1.1, 4, "body"))];
      if (t >= 1) P.push(E(0, 1, 19.4, 4.4, 4.4, 2.2, "belly"), S(0, 5, 19.4, 1.1, "gem"));
      if (t >= 2) P.push(...chain([0, 0, 21], [0, -2, 25], 1, 0.4, 4, "gold"));
      return { parts: P, faces: [...eyes(h, "slit", 0.42, 0.2), mouth(h, "cat", -0.38)], glow: "#fde047" };
    } },
  ],

  /* ---------------- ドライブ(自動車・輸送) ---------------- */
  drive: [
    { name: "タイヤン", build: (t) => { // 一輪車の子
      const h = S(0, 0, 12.5, 5.4, "body");
      const P = [h, E(0, 0, 5, 2.4, 5, 5, "dark"), E(0, 0, 5, 2.6, 2.2, 2.2, t >= 2 ? "gold" : "metal"),
        ...mirror([E(4.8, 0, 11, 1.4, 1.4, 2, "body")])];
      if (t >= 1) P.push(E(0, 3.4, 16, 4.6, 1.8, 1.2, "dark"), ...mirror([S(2, 4.8, 16, 1.4, "glass")]));
      if (t >= 2) P.push(...chain([-3, -4, 13], [-5, -7, 17], 1, 1, 4, "metal"), S(-5, -7, 17.8, 1.4, "glowpart"));
      return { parts: P, faces: [...eyes(h, "big", 0.42, 0.1), mouth(h, "smile", -0.34)] };
    } },
    { name: "つばさウオ", build: (t) => { // 羽のある空飛ぶ魚
      const h = E(0, 0, 11, 4.4, 8, 4.6, "body");
      const P = [h, E(0, 2, 9.4, 3, 5, 2.6, "belly"), ...mirror([E(6 + t, -1, 12, 4.6 + t, 3.4, 0.8, t >= 2 ? "gold" : "accent")]),
        E(0, -9, 11, 0.8, 2.6, 4, "accent"), E(0, -1, 16, 0.7, 3.2, 2, "accent")];
      if (t >= 1) P.push(...mirror([E(4.6, 1, 8, 2.6, 2, 0.6, "accent")]));
      return { parts: P, faces: [...eyes({ c: [0, 4, 11.5], r: [4, 4, 4] }, "big", 0.55, 0.15), { kind: "mouth", style: "o", p: [0, 7.9, 10.6] }] };
    } },
    { name: "みちヘビ", build: (t) => { // 道路の白線もようのへび
      const h = S(0, 4, 11 + t, 3.8, "body");
      const P = [...chain([-7, -3, 2], [5, -4, 2], 2.4, 2.4, 8, "body", [-1, 6, 2]), ...chain([5, -4, 2], [0, 3, 8 + t], 2.4, 2.8, 5, "body", [7, 1, 3]),
        h, ...[[-4, 1.2], [0, 2.8], [3.6, 1]].map(([x, y]) => E(x, y, 4.1, 1.1, 0.6, 0.4, "white"))];
      if (t >= 1) P.push(...mirror(chain([1.8, 4, 14 + t], [3, 2, 17 + t], 0.8, 0.3, 3, "accent")));
      if (t >= 2) P.push(E(0, 1, 11 + t, 5.6, 1, 4.6, "gold"));
      return { parts: P, faces: [...eyes(h, "slit", 0.45, 0.25), mouth(h, "tongue", -0.4)], glow: "#fde047" };
    } },
    { name: "ペリカーゴ", build: (t) => { // 荷物を運ぶペリカン
      const h = S(0, 2.5, 15, 3.8, "white");
      const P = [E(0, -0.5, 8.5, 5, 6, 5, "white"), h, E(0, 7.5, 13.5, 1.6, 5, 1, "orange"), E(0, 7, 12, 1.8, 4, 1.6, "yellow"),
        ...wingPair(4.6, -1, 9, 2.2, 3.4, "body", 1), ...mirror(chain([2, 1, 4], [2.2, 2, 0.5], 0.7, 0.6, 3, "orange"))];
      if (t >= 1) P.push(E(0, -4, 14, 3.6, 3, 2.8, "wood"), E(0, -4, 14, 3.7, 0.5, 2.9, "dark"));
      if (t >= 2) P.push(E(0, 2.5, 18.6, 3.2, 3.2, 1.2, "accent"), E(0, 5, 18.3, 3, 2.4, 0.5, "accent"));
      return { parts: P, faces: [...eyes(h, "dot", 0.5, 0.25)] };
    } },
    { name: "ブーストガエル", build: (t) => { // マフラーのかえる
      const h = E(0, 0.5, 7, 7, 6, 5, "body");
      const P = [h, E(0, 3.2, 5.4, 5, 3, 3, "belly"), ...mirror([S(3.2, 2, 11.5, 2.4, "white")]),
        ...mirror(chain([4.5, -3, 6], [5, -8, 9 + t], 1.2, 1.2, 4, "metal")), ...mirror([E(6.2, 3, 1.4, 2.8, 2.6, 1.2, "body")])];
      if (t >= 1) P.push(...mirror([S(5, -8.5, 10 + t, 1.8, "glowpart")]));
      if (t >= 2) P.push(...crown(13.6, 2.2));
      return { parts: P, faces: [{ kind: "eye", style: "dot", p: [-3.2, 4.2, 12] }, { kind: "eye", style: "dot", p: [3.2, 4.2, 12], mirror: true }, mouth(h, "big", -0.12)], glow: "#ff8f3d" };
    } },
  ],

  /* ---------------- ライフ(生活・ヘルスケア) ---------------- */
  life: [
    { name: "はっぱっぱ", build: (t) => { // 葉っぱが生えた球根
      const h = E(0, 0, 6.5, 5.4, 5, 6.2, "belly");
      const P = [h, ...mirror(chain([0.5, 0, 12], [5, 0, 17 + t], 1.6, 0.6, 5, "leaf", [1, 0, 17])), ...feet2(2.4, 0.5, 1.8)];
      if (t >= 1) P.push(...chain([0, 0, 12], [0, 0, 18 + t], 0.6, 0.6, 4, "leaf"), S(0, 0, 19 + t, 1.6, "pink"));
      if (t >= 2) P.push(...Array.from({ length: 6 }, (_, i) => { const a = (i / 6) * Math.PI * 2; return S(Math.cos(a) * 2.2, Math.sin(a) * 2.2, 21, 1.6, "pink"); }), S(0, 0, 21.4, 1.3, "yellow"));
      return { parts: P, faces: [...eyes(h, "happy", 0.38, 0.12), mouth(h, "smile", -0.24)], blush: true };
    } },
    { name: "ミルクうし", build: (t) => { // ぶちの子うし
      const h = S(0, 5, 11, 4.2, "white");
      const P = [E(0, -1, 8, 5.6, 7, 5, "white"), ...[[-3, -3, 12], [4, 1, 11], [2, -5, 7]].map(([x, y, z]) => E(x, y, z, 2.4, 2.4, 1.6, "body")),
        h, E(0, 8.2, 9.6, 2.8, 1.4, 1.8, "pink"), ...mirror([E(4.8, 5, 12.2, 1.8, 0.8, 1, "white")]),
        ...mirror(chain([2.2, 5, 14.5], [3, 4.6, 16 + t], 0.7, 0.4, 3, "belly")),
        ...legs2(3.2, 3, 1.8, 3.4), ...legs2(3.2, -4.5, 1.8, 3.4), S(0, 6.2, 6.4, 1.2, "gold")];
      if (t >= 2) P.push(...crown(15.2, 2));
      return { parts: P, faces: [...eyes(h, "dot", 0.45, 0.28), mouth({ c: [0, 8.2, 9.6], r: [2.8, 1.4, 1.8] }, "line", -0.1)] };
    } },
    { name: "くすりクラゲ", build: (t) => { // 看護のくらげ
      const h = E(0, 0, 13, 7, 7, 5.2, "body");
      const P = [h, E(0, 0, 10.5, 6.4, 6.4, 1.4, "belly"), ...[-4.5, -1.5, 1.5, 4.5].flatMap((x) => chain([x, 1, 9.5], [x * 1.1, 2, 2], 0.9, 0.5, 5, "belly", [x + 1.5, 2.5, 6])),
        E(0, 5, 16.4, 1.8, 0.6, 0.6, "red"), E(0, 5, 16.4, 0.6, 0.6, 1.8, "red")];
      if (t >= 1) P.push(E(0, 0, 18, 4.4, 4.4, 1.6, "white"));
      if (t >= 2) P.push(...halo(21, 4));
      return { parts: P, faces: [...eyes(h, "happy", 0.4, -0.05), mouth(h, "smile", -0.32)], blush: true };
    } },
    { name: "こもりグマ", build: (t) => { // 子ぐま
      const h = S(0, 1.5, 13, 5.2, "body");
      const P = [E(0, 0, 6.5, 5.6, 5, 6, "body"), E(0, 3.4, 6, 3.6, 2, 4, "belly"), h, E(0, 6, 11.8, 2.4, 1.6, 1.8, "belly"),
        S(0, 7.4, 12.4, 0.8, "dark"), ...mirror([S(4, 0.6, 17.4, 2, "body")]),
        ...mirror(chain([5, 1.5, 9], [6, 3.5, 5.6], 1.6, 1.5, 3, "body")), ...feet2(3, 0.5, 2.4)];
      if (t >= 1) P.push(E(0, 1.2, 9, 5.4, 4.6, 1.1, "red"), E(3, 4.6, 7.6, 1, 1, 2.4, "red"));
      if (t >= 2) P.push(...Array.from({ length: 5 }, (_, i) => E(-4 + i * 2, 0, 18.6 - Math.abs(i - 2) * 0.4, 1.4, 1, 0.7, "leaf")));
      return { parts: P, faces: [...eyes(h, "dot", 0.4, 0.2), mouth({ c: [0, 6, 11.8], r: [2.4, 1.6, 1.8] }, "cat", -0.3)], blush: true };
    } },
    { name: "たまごドリ", build: (t) => { // 殻から顔を出したひな
      const h = S(0, 0.5, 11 + t * 1.5, 4.4, "yellow");
      const P = [h, E(0, 0, 6, 5.6, 5.6, 5.6 - t, "white"), ...[-4, -1.3, 1.3, 4].map((x, i) => E(x, 2.4, 10.2 - t * 0.8 + (i % 2) * 0.8, 1.2, 1.2, 1.4, "white")),
        E(0, 5, 10.4 + t * 1.5, 1.4, 1.4, 0.9, "orange")];
      if (t >= 1) P.push(...mirror([E(4.6, 0, 9 + t, 1, 2, 2.4, "yellow")]), ...mirror(chain([2, 0, 1.6], [2.4, 1.6, 0.4], 0.5, 0.5, 3, "orange")));
      if (t >= 2) P.push(...chain([0, 0, 15.5], [0, -2, 20], 1.1, 0.3, 5, "red", [0, 2, 18]), ...wingPair(5, -1, 11, 2.6, 3, "yellow"));
      return { parts: P, faces: [...eyes(h, "big", 0.42, 0.2)] };
    } },
  ],

  /* ---------------- テック(IT・半導体) ---------------- */
  tech: [
    { name: "チップガニ", build: (t) => { // ICチップの足のかに
      const h = E(0, 0, 5, 7, 6, 2.6, "dark");
      const P = [h, ...mirror([...[-3, 0, 3].map((y) => E(7.6, y, 3, 1.8, 0.5, 0.5, t >= 2 ? "gold" : "metal"))]),
        ...[-3.5, 0, 3.5].map((x) => E(x, 6.6, 3, 0.5, 1.6, 0.5, t >= 2 ? "gold" : "metal")), E(0, 0, 7.4, 3, 3, 0.6, "body")];
      if (t >= 1) P.push(...[-2.4, -0.8, 0.8, 2.4].map((x) => E(x, -1, 9.2, 0.5, 2.6, 1.8, "metal")));
      if (t >= 2) P.push(S(0, 2, 8.4, 1.4, "glowpart"));
      return { parts: P, faces: [{ kind: "eye", style: "glow", p: [-2.6, 4.6, 7] }, { kind: "eye", style: "glow", p: [2.6, 4.6, 7], mirror: true }], glow: "#22d3ee" };
    } },
    { name: "ドローンバチ", build: (t) => { // プロペラの蜂
      const h = S(0, 3.6, 10, 3.6, "body");
      const P = [E(0, -3, 9, 3.4, 4.2, 3.4, "yellow"), E(0, -3, 9, 3.5, 0.7, 3.5, "dark"), E(0, -5, 9, 3.2, 0.6, 3.2, "dark"), S(0, 0.8, 9.6, 3, "dark"), h,
        ...chain([0, -7, 8], [0, -9, 6.5], 0.8, 0.2, 3, "dark"),
        ...mirror([E(4.8, 2, 14.5, 3.4, 3.4, 0.4, "glass"), E(4.8, -3, 14.5, 3.4, 3.4, 0.4, "glass"), E(4.8, 2, 13, 0.4, 0.4, 1.6, "metal"), E(4.8, -3, 13, 0.4, 0.4, 1.6, "metal")])];
      if (t >= 1) P.push(S(0, 5.6, 6.6, 1.4, "glass"), E(0, 4.4, 6.6, 1.6, 1.4, 1.4, "metal"));
      if (t >= 2) P.push(...crown(13.8, 1.8));
      return { parts: P, faces: [...eyes(h, "big", 0.45, 0.12), mouth(h, "line", -0.4)] };
    } },
    { name: "ドットおばけ", build: (t) => { // カクカクのドットおばけ
      const P = [];
      const block = (x, z, m = "body") => P.push(E(x, 0, z, 1.6, 2.4, 1.6, m));
      for (let z = 0; z < 5; z++) for (let x = -2; x <= 2; x++) if (!(z === 4 && Math.abs(x) === 2)) block(x * 2.8, 5 + z * 2.8);
      [-2, 0, 2].forEach((x) => block(x * 2.8, 2.2));
      if (t >= 1) [[-3, 3], [3, 3]].forEach(([x, z]) => block(x * 2.8, 5 + z * 2.8, "accent"));
      if (t >= 2) [-1, 0, 1].forEach((x) => block(x * 2.8, 5 + 5 * 2.8, "gold"));
      return { parts: P, faces: [{ kind: "eye", style: "glow", p: [-2.8, 2.6, 13.4] }, { kind: "eye", style: "glow", p: [2.8, 2.6, 13.4], mirror: true }, { kind: "mouth", style: "zigzag", p: [0, 2.6, 8.4] }], glow: "#f0abfc" };
    } },
    { name: "ロボわん", build: (t) => { // ロボットの犬
      const h = E(0, 4.5, 11, 4, 3.6, 3.6, "metal");
      const P = [E(0, -1, 7.5, 4.2, 6.4, 3.6, "body"), h, E(0, 7.6, 10.2, 2.4, 1.6, 1.8, "metal"), S(0, 9.2, 10.8, 0.9, "dark"),
        E(0, 7.4, 12, 3.8, 0.6, 1, "glowpart"), ...mirror([E(3, 3.6, 15, 1, 1.6, 2.6, "body")]),
        ...legs2(2.6, 2.5, 1.4, 4), ...legs2(2.6, -4.5, 1.4, 4), ...chain([0, -7, 9], [0, -9, 14], 0.4, 0.4, 4, "metal"), S(0, -9, 14.6, 1.1, "glowpart")];
      if (t >= 1) P.push(...mirror([E(3.2, -3, 11.5, 1.4, 2.4, 2.6, "metal"), S(3.2, -5.4, 11, 1.1, "glowpart")]));
      if (t >= 2) P.push(E(0, -1, 10.4, 4.4, 5.6, 1.4, "gold"));
      return { parts: P, faces: [], glow: "#22d3ee" };
    } },
    { name: "データフクロウ", build: (t) => { // 大きな目のふくろう
      const h = S(0, 0.6, 13, 5.4, "body");
      const P = [E(0, 0, 7.5, 5.4, 5, 6.4, "body"), E(0, 3.4, 7, 3.6, 2, 4.4, "belly"), h,
        ...mirror([E(2.4, 5, 13.4, 2.4, 0.8, 2.4, "white")]), E(0, 5.8, 11.6, 0.9, 1, 1.4, "orange"),
        ...mirror(chain([3.4, 0, 17], [4.6, -0.5, 20 + t], 1.1, 0.3, 3, "body")), ...wingPair(5, -1, 8, 1.8, 4, "accent", 1), ...feet2(2, 1, 1.6)];
      if (t >= 1) P.push(E(0, 5.8, 14, 5.2, 0.5, 0.5, "dark"), ...mirror([E(2.4, 5.6, 13.4, 2.7, 0.3, 2.7, "glass")]));
      if (t >= 2) P.push(E(0, 0.6, 18.4, 4.6, 4.6, 0.8, "dark"), E(0, 0.6, 19.2, 3.6, 3.6, 0.4, "dark"), ...chain([3, 0.6, 19.2], [4.4, 2, 16], 0.3, 0.3, 4, "gold"), S(4.4, 2, 15.6, 0.8, "gold"));
      return { parts: P, faces: [{ kind: "eye", style: "big", p: [-2.4, 5.9, 13.4] }, { kind: "eye", style: "big", p: [2.4, 5.9, 13.4], mirror: true }] };
    } },
  ],

  /* ---------------- マネー(金融) ---------------- */
  money: [
    { name: "こばんネコ", build: (t) => { // 小判を抱いたまねきねこ風
      const h = S(0, 1, 13, 5.2, "white");
      const P = [E(0, 0, 6.5, 5.4, 4.6, 6, "white"), h, ...earsPointy(h, 3.2, "white", 0.6), ...mirror([E(3.6, 4, 16.6, 0.9, 0.3, 1.2, "pink")]),
        ...chain([-5, 1.5, 9], [-6, 3, 15], 1.5, 1.6, 4, "white"), E(0, 4.6, 7.4, 3.4 + t * 0.6, 0.8, 4.4 + t * 0.6, "gold"), E(0, 1, 9.6, 5.2, 4.4, 0.8, "red")];
      if (t >= 1) P.push(S(0, 5, 9.4, 1.2, "gold"));
      if (t >= 2) P.push(...crown(18.4, 2.2));
      return { parts: P, faces: [...eyes(h, "happy", 0.4, 0.15), mouth(h, "cat", -0.36)], blush: true };
    } },
    { name: "がまぐちガエル", build: (t) => { // がま口財布のかえる
      const h = E(0, 0, 8, 7.4, 5.6, 6.4, "body");
      const P = [h, E(0, 0, 13.8, 6.4, 1.2, 1, t >= 1 ? "gold" : "metal"), ...mirror([S(1.4, 0.4, 15.4, 1.2, "gold")]),
        ...mirror([S(3.6, 1.6, 15, 2.2, "white")]), ...mirror([E(6, 2.4, 1.4, 2.6, 2.6, 1.2, "body")])];
      if (t >= 1) P.push(...[-5, 5].map((x) => E(x, 4, 2, 1.8, 0.6, 1.8, "gold")));
      if (t >= 2) P.push(...crown(18.4, 2.4));
      return { parts: P, faces: [{ kind: "eye", style: "dot", p: [-3.6, 3.6, 15.4] }, { kind: "eye", style: "dot", p: [3.6, 3.6, 15.4], mirror: true }, mouth(h, "grin", -0.05)] };
    } },
    { name: "ツボまじん", build: (t) => { // つぼから出てくる魔人
      const h = S(0, 1.5, 15.5, 4.4, "body");
      const P = [E(0, 0, 5, 6, 6, 5, "wood"), E(0, 0, 9.6, 3.6, 3.6, 1.2, "wood"), E(0, 0, 4.6, 6.1, 6.1, 1, "accent"),
        ...chain([0, 0, 10], [0, 1, 13], 3, 3.4, 3, "body"), h, ...mirror(chain([3.4, 1, 13], [5.5, 3, 17 + t], 1.2, 1, 4, "body"))];
      if (t >= 1) P.push(E(0, 1.2, 19.2, 4.4, 4.2, 2.2, "white"), S(0, 5, 19.2, 1, "gem"));
      if (t >= 2) P.push(...chain([0, 1, 21], [0, 0, 25], 1.2, 0.3, 4, "gold"), E(0, 0, 4.6, 6.2, 6.2, 1.1, "gold"));
      return { parts: P, faces: [...eyes(h, "angry", 0.42, 0.2), mouth(h, "mustache", -0.3)] };
    } },
    { name: "ほうせきトカゲ", build: (t) => { // 背中に宝石のとかげ
      const h = S(0, 6.5, 6, 3.4, "body");
      const P = [E(0, 0, 4.4, 4.2, 7, 3.4, "body"), h, E(0, 9, 5.2, 2, 2, 1.6, "body"),
        ...chain([0, -6, 3.6], [3, -13, 2], 2.2, 0.5, 7, "body", [0, -11, 2.4]),
        ...legs2(3.6, 3, 1.3, 2.4), ...legs2(3.6, -3.5, 1.3, 2.4),
        ...[2, -1, -4].slice(0, 1 + t).map((y) => E(0, y, 8, 1.2, 1.2, 2, "gem"))];
      if (t >= 2) P.push(...crown(9.8, 1.8).map((p) => ({ ...p, c: [p.c[0], p.c[1] + 6.5, p.c[2]] })));
      return { parts: P, faces: [...eyes(h, "slit", 0.55, 0.3), mouth({ c: [0, 9, 5.2], r: [2, 2, 1.6] }, "line", -0.2)], glow: "#fde047" };
    } },
    { name: "ぶたちょきん", build: (t) => { // 貯金箱のぶた
      const h = E(0, 0, 7.5, 6.6, 7.6, 5.8, "pink");
      const P = [h, E(0, 7.4, 8, 2.4, 1.2, 2, "pink"), ...mirror([S(0.8, 8.4, 8, 0.5, "dark")]), E(0, -1, 13.2, 2.6, 0.5, 0.4, "dark"),
        ...mirror([E(3.6, 3.6, 12.8, 1.8, 1, 1.8, "pink")]), ...legs2(3.4, 3.5, 1.5, 2.6), ...legs2(3.4, -3.5, 1.5, 2.6)];
      if (t >= 1) P.push(E(0, -1, 15, 2.2, 0.5, 2.2, "gold"));
      if (t >= 2) P.push(...wingPair(6, -1, 10, 3, 3, "white"));
      return { parts: P, faces: [{ kind: "eye", style: "dot", p: [-2.4, 6.2, 10.6] }, { kind: "eye", style: "dot", p: [2.4, 6.2, 10.6], mirror: true }, { kind: "mouth", style: "smile", p: [0, 7.8, 6] }], blush: true };
    } },
  ],

  /* ---------------- マーケット(小売・サービス) ---------------- */
  market: [
    { name: "ちょうちんオバケ", build: (t) => { // ひとつ目のちょうちん
      const h = E(0, 0, 10, 5.6, 5.6, 7, "body");
      const P = [h, ...[7, 10, 13].map((z) => E(0, 0, z, 5.8, 5.8, 0.4, "accent")), E(0, 0, 3.4, 3.6, 3.6, 1, "dark"), E(0, 0, 16.8, 3.6, 3.6, 1, "dark"),
        ...chain([0, -1, 17.6], [0, -3, 21], 0.4, 0.4, 3, "dark")];
      if (t >= 1) P.push(...mirror(chain([5, 0, 9], [7.5, 2, 11], 1, 0.8, 3, "body")));
      if (t >= 2) P.push(S(0, 0, 0.4, 2.6, "glowpart"), ...crown(18.6, 2));
      return { parts: P, faces: [{ kind: "eye", style: "cyclops", p: [0, 5.7, 11.4] }, mouth(h, "tongue", -0.5)] };
    } },
    { name: "はたペンギン", build: (t) => { // 旗を持つペンギン
      const h = S(0, 0.8, 13, 4.2, "dark");
      const P = [E(0, 0, 7.5, 5, 4.6, 6.4, "dark"), E(0, 2.6, 7, 3.6, 2.4, 5.2, "white"), h, E(0, 4.6, 12.2, 1.4, 1.6, 0.8, "orange"),
        ...mirror([E(5, 0, 8, 1, 2, 3.6, "dark")]), ...feet2(2, 1.4, 1.8).map((p) => ({ ...p, mat: "orange" })),
        E(6.2, 1, 12, 0.4, 0.4, 7.5, "wood"), E(8.6, 1, 17.2, 2.4, 0.3, 1.8, "accent")];
      if (t >= 1) P.push(E(0, 0.8, 9.6, 4.8, 4.4, 1, "red"), E(-3, 3.4, 7.6, 1, 0.8, 2.6, "red"));
      if (t >= 2) P.push(...crown(16.8, 2));
      return { parts: P, faces: [...eyes(h, "dot", 0.4, 0.2)] };
    } },
    { name: "カゴヤドカリ", build: (t) => { // 買い物かごのやどかり
      const P = [E(0, -2, 8.5, 6.4, 5.4, 5, "wood"), E(0, -2, 13.2, 6.6, 5.6, 0.8, "wood"), ...[-3, 0, 3].map((x) => E(x, 3.4, 8.5, 0.5, 0.4, 4.6, "dark")),
        E(0, -2, 17, 5, 0.6, 0.6, "accent"), ...mirror([E(5, -2, 15, 0.6, 0.6, 2.4, "accent")]),
        ...[[-2, -2, 14.4, "red"], [2, -3, 14.6, "yellow"], [0, -1, 15, "leaf"]].map(([x, y, z, m]) => S(x, y, z, 1.6, m)),
        S(0, 4.6, 5, 3, "body"), ...mirror(chain([1.6, 5.6, 7], [2, 6.4, 10], 0.5, 0.5, 3, "body")), ...mirror([S(2, 6.4, 10.4, 1.3, "white")]),
        ...mirror(chain([3.4, 6, 4], [6, 8.5, 5], 1.2, 1.4, 3, "body")), ...mirror([...chain([4, 2, 3], [6.5, 3, 0.5], 0.6, 0.5, 3, "body")])];
      if (t >= 1) P.push(...mirror([S(6.4, 9, 5.4, 1.9, "body")]));
      if (t >= 2) P.push(S(0, -2, 17.2, 2, "gold"), S(-3.5, -3, 15.6, 1.4, "gem"));
      return { parts: P, faces: [{ kind: "eye", style: "dot", p: [-2, 7.6, 10.6] }, { kind: "eye", style: "dot", p: [2, 7.6, 10.6], mirror: true }, { kind: "mouth", style: "smile", p: [0, 7.4, 4.8] }] };
    } },
    { name: "ふうせんウサ", build: (t) => { // 風船を持ったうさぎ
      const h = S(0, 1, 11.5, 4.6, "belly");
      const P = [E(0, 0, 5.5, 4.6, 4.2, 5, "belly"), h, ...mirror(chain([1.8, 0, 15], [2.6, 0.5, 21], 1.3, 0.8, 5, "belly")), ...mirror([E(2.6, 1.2, 18, 0.5, 0.3, 2.4, "pink")]),
        ...chain([4.4, 2, 7], [7, 2, 18], 0.25, 0.25, 6, "dark"), S(7, 2, 20.5, 3, "body"), ...feet2(2.4, 1, 1.8)];
      if (t >= 1) P.push(...chain([5, 2, 7], [10, 0, 16], 0.25, 0.25, 5, "dark"), S(10.5, 0, 18.4, 2.6, "yellow"));
      if (t >= 2) P.push(...chain([4, 2, 7], [4, -2, 21], 0.25, 0.25, 6, "dark"), S(4, -2, 23.6, 2.8, "accent"), ...crown(16.2, 1.8));
      return { parts: P, faces: [...eyes(h, "dot", 0.4, 0.15), mouth(h, "cat", -0.36)], blush: true };
    } },
    { name: "レジまじん", build: (t) => { // レジの箱の魔人
      const h = E(0, 0, 8.5, 7, 6, 6.6, t >= 2 ? "gold" : "metal");
      const P = [h, E(0, -1, 16.5, 5, 3.6, 2.2, "accent"), E(0, 1.5, 17.6, 3.6, 0.6, 1, "dark"),
        ...[[-3, 5.6, 12], [0, 5.6, 12], [3, 5.6, 12]].map(([x, y, z]) => S(x, y, z, 0.9, "accent")), ...feet2(3.6, 0, 2.2)];
      if (t >= 1) P.push(...chain([0, 6.4, 5], [0, 9.5, 1], 1.2, 1, 4, "white"));
      if (t >= 2) P.push(...mirror(chain([6.6, 0, 11], [9, 2, 15], 1.4, 1, 4, "body")), ...crown(19, 2.4));
      return { parts: P, faces: [{ kind: "eye", style: "angry", p: [-2.6, 5.8, 9.6] }, { kind: "eye", style: "angry", p: [2.6, 5.8, 9.6], mirror: true }, { kind: "mouth", style: "zigzag", p: [0, 6, 5.6] }] };
    } },
  ],
};



/* ================================================================
   新ロスター(2026-09 後半): タイプごと6種族 = 60種族
   構成: おどけ者1 + カッコいい2(竜・魔王・騎士・大きな獣) + 動物3
   ⚠ 並び順と数を変えると全員の姿が変わる(CLAUDE.md 不変条件2)
   ================================================================ */
const L = (type, name) => LEGACY[type].find((x) => x.name === name);
const withGlow = (r, glow, extra = {}) => ({ ...r, glow, ...extra });
const crownAt = (x, y, z, r = 1.8) => [E(x, y, z, r, r, 0.6, "gold"), ...[-1, 0, 1].map((k) => S(x + k * r * 0.7, y, z + 0.9, 0.55, "gold")), S(x, y + r * 0.8, z + 0.3, 0.5, "gem")];

/* ---------- 魔王3種(2026-09 オーナー提示の参考画像の作風) ----------
   ※いずれも特定キャラクターの模写ではなく、王道の「魔王」の作り(よろいの武人・
     ローブの魔導王・翼の大蛇)をなぞったオリジナル */

/* はがねのまおう: 角の大きな、よろいの武人。両手に三日月の刀。背に後光のトゲ */
function steelDemon(t) {
  const P = [];
  P.push(...mirror([E(2.2, 0.6, 1, 1.7, 2.3, 1.1, "bronze"), E(2.1, 0, 3.8, 1.6, 1.6, 2.6, "bronze"), E(2.3, 1.4, 5.2, 0.9, 0.7, 0.8, "dark")]));
  P.push(E(0, 0, 9, 4.2, 2.8, 3.8, "bronze"));
  [7.2, 8.6, 10].forEach((z) => P.push(E(0, 2.6, z, 2.2, 0.35, 0.3, "stripe")));
  P.push(E(0, 2.7, 6.6, 1.2, 0.4, 1.4, "stripe"));
  P.push(...mirror([S(4.6, 0, 11.6, 2.2, "bronze"), ...[0, 1].map((i) => E(4.9 + i * 0.8, -0.4, 13.4 + i * 0.3, 0.35, 0.35, 1.1, "white"))]));
  // 腕を横に張って、両手に三日月刀
  P.push(...mirror([...chain([5.2, 0.6, 10.6], [8, 2, 9], 1.3, 1.1, 4, "bronze"), S(8.4, 2.3, 8.8, 1.1, "dark"),
    ...chain([8.4, 2.5, 8.2], [10.8, 3.4, 14.2 + t], 0.75, 0.25, 8, "white", [11.8, 2.8, 9.6])]));
  const head = S(0, 0.8, 14.4, 2.3, "bronze");
  P.push(head, E(0, 2.6, 13.4, 1.4, 0.7, 0.8, "dark"));
  P.push(...mirror(chain([1.6, 0.4, 15.8], [5 + t * 0.8, 1.4, 19 + t], 0.95, 0.25, 7, "white", [5, -0.2, 15.4])));
  P.push(E(0, 0.6, 16.6, 0.6, 0.6, 1.4 + t * 0.4, "bronze"));
  if (t >= 1) Array.from({ length: 7 }, (_, i) => { const a = Math.PI * (0.1 + (i / 6) * 0.8); P.push(...chain([Math.cos(a) * 3.2, -2.4, 13.4 + Math.sin(a) * 3.2], [Math.cos(a) * (6 + t), -2.6, 13.4 + Math.sin(a) * (6 + t)], 0.55, 0.15, 4, "gold")); });
  if (t >= 2) P.push(E(0, -2.6, 13.4, 3.6, 0.4, 3.6, "gold"), S(0, 2.9, 9.2, 0.8, "gem"));
  const faces = [
    { kind: "eye", style: "demon", p: onHead(head, -0.42, 0.18), iris: "#fbbf24" }, { kind: "eye", style: "demon", p: onHead(head, 0.42, 0.18), iris: "#fbbf24", mirror: true },
    { kind: "mouth", style: "snarl", p: [0, 3.1, 13.2] },
  ];
  return { ...turn(P, faces, R(12)), glow: "#ef4444", hd: true, mood: "boss" };
}

/* だいまどうおう: ローブの魔導王。高くとがった襟、青白い顔、赤い宝石の首飾り、曲がった杖 */
function sorcererDemon(t) {
  const P = [];
  P.push(E(0, 0, 4.6, 5, 4.4, 5, "accent"), E(0, 0.2, 1.2, 6, 5.2, 1.4, "accent"), E(0, 0.1, 0.9, 6.1, 5.3, 0.5, "gold"));
  P.push(E(0, 2.2, 5, 1.2, 2.4, 4.4, "red"));                      // 前合わせの裏地
  P.push(E(0, 0, 9.6, 4, 3.2, 2.8, "accent"));
  // 高くとがった襟(左右に2本の翼のような立ち襟)
  P.push(...mirror([...chain([2.2, -1.4, 10.6], [4.6 + t * 0.4, -2, 18 + t], 1.6, 0.35, 8, "dark", [4.6, -1.2, 13]), E(2.6, -0.8, 12.6, 1, 0.3, 2.4, "red")]));
  const head = S(0, 0.8, 13.4, 2.4, "skin");
  P.push(head, ...mirror(chain([2, 0.6, 13.8], [3.4, 0, 15.6], 0.6, 0.2, 4, "skin")));
  P.push(E(0, 0.6, 15.8, 2, 2, 0.9, "dark"), E(0, 0.8, 16.8, 1.2, 1.2, 1, "dark"));  // 頭巾
  // 首飾り+赤い宝石
  Array.from({ length: 7 }, (_, i) => { const a = Math.PI * (0.15 + (i / 6) * 0.7); P.push(S(Math.cos(a) * 2.6, 1.8 + Math.sin(a) * 1.2, 10.9 - Math.sin(a) * 1.4, 0.4, "gold")); });
  P.push(S(0, 3.4, 9.3, 1, "red"));
  // 前に差し出す右手
  P.push(...chain([3.4, 0.8, 10.2], [3.6, 5.4, 10.4], 1.2, 0.9, 5, "accent"), S(3.6, 6.2, 10.6, 1, "skin"), ...[0, 1, 2].map((i) => E(3.1 + i * 0.5, 7, 10.8 + (i === 1 ? 0.4 : 0), 0.22, 0.6, 0.22, "skin")));
  // 曲がった木の杖(左手)
  P.push(S(-4.2, 1.4, 8.6, 0.95, "skin"), ...chain([-4.4, 1.6, 0.6], [-4.4, 1.6, 16], 0.42, 0.42, 14, "wood"),
    ...chain([-4.4, 1.6, 16], [-3, 1.6, 16.4], 0.45, 0.35, 6, "wood", [-4.8, 1.6, 18.4]));
  if (t >= 1) P.push(S(-3.4, 1.6, 15.2, 0.8, "gem"));
  if (t >= 2) P.push(...[-1, 0, 1].map((k) => S(k * 1.1, 0.8, 17.9, 0.5, "gold")), ...Array.from({ length: 3 }, (_, i) => S(-6 + i * 6, -1, 20 + (i % 2), 0.9, "glowpart")));
  const faces = [
    { kind: "eye", style: "sharp", p: onHead(head, -0.42, 0.14), iris: "#fde047" }, { kind: "eye", style: "sharp", p: onHead(head, 0.42, 0.14), iris: "#fde047", mirror: true },
    { kind: "mouth", style: "grin", p: onHead(head, 0, -0.42) },
  ];
  return { ...turn(P, faces, R(16)), glow: "#c084fc", hd: true, mood: "boss" };
}

/* へんげのまおう: 翼をもつ大蛇の魔王。節のある長い下半身にトゲ、広げた爪の腕、
   左右に張り出す長い角と、額の第三の目 */
function serpentDemon(t) {
  const P = [];
  // 太い根元は胴の下、前へとぐろを巻いてから後ろへ細くなる(先端にトゲ)
  const seg = chain([0, 1, 5.4], [-5, -8.5, 3.2], 2.8, 0.7, 11, "body", [7.5, 3.5, 0.6]);
  seg.forEach((sp, i) => {
    P.push(sp);
    if (i % 2 === 0 && i < seg.length - 1) P.push(E(sp.c[0], sp.c[1], sp.c[2] + sp.r[0] * 0.95, 0.35, 0.35, 0.6 + sp.r[0] * 0.3 + t * 0.2, "dark"));
  });
  P.push(E(-5.6, -9.4, 3.3, 0.5, 1.4, 0.5, "dark"));                   // しっぽの先のトゲ
  P.push(E(0, 1.6, 8.6, 3.2, 2.4, 4, "body"));                         // 上半身
  [7, 8.4, 9.8].forEach((z) => P.push(E(0, 3.6, z, 2.4, 0.35, 0.3, "dark")));  // あばら
  P.push(...mirror([...chain([2.8, 1.8, 10.4], [7.4, 4.2, 11], 1, 0.7, 5, "body"), ...[0, 1, 2].map((i) => chain([7.4, 4.2, 11], [8.6 + i * 0.4, 5.6, 12.4 - i * 1.2], 0.3, 0.15, 3, "white")).flat()]));
  const head = S(0, 2.6, 13.8, 2.6, "body");
  P.push(head, E(0, 4.6, 12.6, 1.5, 0.9, 1, "mouth"));
  P.push(...mirror(chain([2, 2.2, 14.6], [7 + t, 1.2, 15.6 + t * 0.4], 0.7, 0.18, 8, "dark")));   // 横に張る長い角
  Array.from({ length: 5 }, (_, i) => { const a = Math.PI * (0.25 + (i / 4) * 0.5); P.push(...chain([Math.cos(a) * 1.8, 2, 14.8 + Math.sin(a) * 1.8], [Math.cos(a) * 3.8, 1.4, 14.8 + Math.sin(a) * (3.8 + t * 0.4)], 0.45, 0.12, 4, i === 2 ? "accent" : "dark")); });
  P.push(...mirror([...chain([2, -1, 12], [7 + t, -2.4, 17 + t], 0.45, 0.3, 6, "dark"), E(4.2 + t * 0.4, -1.8, 13.8 + t * 0.4, 2.4 + t * 0.3, 0.3, 3 + t * 0.3, "accent"), E(6 + t * 0.6, -2.2, 13.2 + t * 0.4, 1.3, 0.3, 2.8, "accent")]));
  if (t >= 2) P.push(S(0, 3.9, 8.8, 0.9, "gem"), ...crownAt(0, 2.4, 16.2, 1.4));
  const faces = [
    { kind: "eye", style: "demon", p: onHead(head, -0.42, 0.08), iris: "#fbbf24" }, { kind: "eye", style: "demon", p: onHead(head, 0.42, 0.08), iris: "#fbbf24", mirror: true },
    { kind: "eye", style: "glow", p: onHead(head, 0, 0.5) },
    { kind: "mouth", style: "fangs", p: [0, 5.1, 12.9] },
  ];
  return { ...turn(P, faces, R(20)), glow: "#ef4444", hd: true, mood: "boss" };
}

const SPECIES_POOL = {
  cosmo: [
    L("cosmo", "ほしぐも"),
    { name: "せいりゅう", build: (t) => withGlow(dragon({ // 星の竜
      t, wing: "amber", hornMat: "white", spikeMat: "red", iris: "#ef4444",
      extra: [S(0, 3.6, 9, 0.8, "glowpart"), ...(t >= 1 ? [S(-2.6, -2, 11, 0.6, "glowpart"), S(2.4, -3, 8.5, 0.5, "glowpart")] : []), ...(t >= 2 ? crownAt(0, 5.4, 19.6, 1.6) : [])],
    }), "#fef3c7") },
    { name: "ほしのきし", build: (t) => withGlow(hero({ // 星の騎士
      armor: "white", cloth: "accent", plume: "accent", cape: "body", weapon: "sword", bladeMat: "glass",
      shield: t >= 1 ? "body" : null, iris: "#7dd3fc", t, crown: t >= 2,
      extra: [S(0, 2.4, 8.9, 0.6, "glowpart")],
    }), "#7dd3fc") },
    { name: "つきうさぎ", build: (t) => quad({ // うさぎ(おすわり)
      sit: true, girth: 3.1, legH: 1.6, headR: 3.1, snout: 1.3, snoutLen: 0.2, ears: "long", earLen: 5 + t, earInner: "pink",
      tail: "puff", tailMat: "white", eyeStyle: "cute", iris: "#a78bfa", mouth: "cat",
      extra: t >= 2 ? [E(0, 0.4, 12.6, 2.6, 2.2, 0.5, "gold"), S(0, 0.4, 13.2, 1.3, "glowpart")] : t >= 1 ? [S(3, 1.6, 8, 1.2, "glowpart")] : [],
    }) },
    { name: "ほしオオカミ", build: (t) => withGlow(quad({ // 星のたてがみのおおかみ
      len: 9.5, girth: 3.2, legH: 3.8, headR: 3, snout: 2, snoutLen: 1.6, ears: "pointy", earLen: 3.2, tail: "bushy", tailLen: 5,
      eyeStyle: "sharp", iris: "#fde047", mouth: "fangs", mane: t >= 1 ? "accent" : null,
      extra: t >= 2 ? [...[-2, 0, 2].map((y) => S(0, y, 10.4, 0.6, "glowpart"))] : [],
    }), "#fef08a") },
    { name: "ほしワシ", build: (t) => bird({ // わし
      body: "body", belly: "white", beak: "yellow", hooked: true, spread: t * 1.8, crest: t >= 2 ? "gold" : null,
      eyeStyle: "fierce", iris: "#fbbf24", big: 1 + t * 0.08,
      extra: [S(0, 3.1, 11.6, 2.3, "white")],
    }) },
  ],
  metal: [
    L("metal", "てつかぶと"),
    { name: "はがねのまおう", build: steelDemon },
    { name: "こうてつりゅう", build: (t) => withGlow(dragon({ // 鋼鉄の竜
      t, body: "metal", belly: "dark", wing: "dark", hornMat: "white", spikeMat: "dark", plates: true, hornType: "up",
      iris: "#ef4444", eyeStyle: "demon", mouth: "snarl", extra: t >= 2 ? crownAt(0, 5.4, 19.6, 1.6) : [],
    }), "#ef4444") },
    { name: "よろいサイ", build: (t) => quad({ // さい
      len: 10, girth: 4, legH: 3, legR: 1.5, headR: 3.2, snout: 2.6, snoutLen: 1.6, snoutMat: "body", ears: "round",
      horn: { r0: 1.1 + t * 0.2, mat: t >= 2 ? "gold" : "white" }, tail: "tuft", eyeStyle: "angry", iris: "#1f2937", mouth: "line",
      extra: t >= 1 ? mirror([E(3.6, 0, 8.6, 1, 3.8, 0.8, "metal")]) : [],
    }) },
    { name: "アルマジロ", build: (t) => quad({ // よろいのアルマジロ
      len: 8.5, girth: 3.4, legH: 1.8, headR: 2.4, snout: 1.6, snoutLen: 1.6, ears: "round", tail: "thin", tailLen: 3,
      eyeStyle: "beady", mouth: null, stripes: "metal",
      extra: [E(0, 0, 5.5, 3.5, 4.4, 3.2, "metal"), ...[-2.6, -0.8, 1, 2.8].map((y) => E(0, y, 5.8, 3.6, 0.4, 3.3, "dark")), ...(t >= 2 ? [...[-2.6, 0, 2.6].map((y) => E(0, y, 9.2, 0.6, 0.6, 1, "gold"))] : [])],
    }) },
    { name: "クワガタン", build: (t) => { // 大あごのくわがた
      const r = quad({ len: 8, girth: 3.2, legH: 2.4, legR: 0.6, headR: 2.6, snout: 0, ears: "none", tail: "none", paws: "dark",
        body: "dark", belly: "dark", eyeStyle: "glow", iris: "#fbbf24", mouth: null, heading: R(36),
        extra: [E(0, -0.8, 5.8, 3.4, 4.2, 2.2, "metal"), E(0, -0.8, 5.9, 0.3, 4.2, 2.3, "dark"),
          ...mirror(chain([1.4, 7.2, 7], [0.8 + t * 0.4, 12 + t, 8.6 + t * 0.4], 0.7, 0.35, 6, t >= 2 ? "gold" : "metal", [3.6, 10, 8]))] });
      return withGlow(r, "#fbbf24");
    } },
  ],
  spark: [
    L("spark", "ホタルン"),
    { name: "らいりゅう", build: (t) => withGlow(dragon({ // 雷の竜
      t, wing: "accent", hornMat: "yellow", spikeMat: "glowpart", hornType: "antler", iris: "#fde047",
      extra: [...chain([0, -2.4, 4.4], [-1, -6, 7], 0.3, 0.3, 4, "glowpart"), ...(t >= 2 ? crownAt(0, 5.4, 19.6, 1.6) : [])],
    }), "#fef08a") },
    { name: "らいじゅう", build: (t) => withGlow(quad({ // 雷の獣(大きなたてがみ)
      len: 10, girth: 3.7, legH: 3.8, headR: 3.2, snout: 2, snoutLen: 1.2, ears: "pointy", earLen: 3, tail: "thin", tailLen: 6,
      mane: "accent", eyeStyle: "fierce", iris: "#fde047", mouth: "fangs", stripes: "dark",
      extra: [...chain([0, -5, 9], [0, -10, 12], 0.4, 0.3, 4, "glowpart"), ...(t >= 1 ? mirror(chain([1.6, 5, 13], [2.4, 3, 17 + t], 0.6, 0.2, 4, "yellow")) : [])],
    }), "#fde047") },
    { name: "ハリネズミ", build: (t) => quad({ // はりねずみ
      len: 7, girth: 3.3, legH: 1.4, legR: 0.8, headR: 2.5, snout: 1.4, snoutLen: 1.2, ears: "round", tail: "none",
      eyeStyle: "beady", mouth: "smile",
      extra: Array.from({ length: 14 }, (_, i) => { const a = (i / 14) * Math.PI; return E(Math.cos(a) * 2.8, -0.6 - Math.sin(a * 2) * 0.8, 3.6 + Math.sin(a) * 3.2, 0.7, 0.7, 1.6 + t * 0.3, i % 3 === 0 && t >= 1 ? "yellow" : "accent"); }),
    }) },
    L("spark", "とぐろウナギ"),
    L("spark", "イナズマどり"),
  ],
  build: [
    L("build", "レンガーン"),
    { name: "ハンマーナイト", build: (t) => withGlow(hero({ // つちの騎士
      armor: "metal", cloth: "body", plume: "body", weapon: "hammer", bulk: 1.1, iris: "#fb923c", t,
      cape: t >= 1 ? "body" : null, crown: t >= 2,
    }), "#fb923c") },
    { name: "ちていりゅう", build: (t) => withGlow(dragon({ // 大地の竜(翼なし・岩の背)
      t, wingType: "none", hornType: "up", hornMat: "white", spikeMat: "dark", body: "body", belly: "belly", iris: "#fde047", eyeStyle: "fierce", mouth: "snarl",
      extra: [...[-3, -1, 1].map((y, i) => E(0, y, 12 - i * 1.4, 1.6, 1.4, 1.4, "dark")), ...(t >= 2 ? crownAt(0, 5.4, 19.6, 1.6) : [])],
    }), "#fde047") },
    { name: "ビーバー", build: (t) => quad({ // びーばー
      sit: true, girth: 3.2, legH: 1.4, headR: 3, snout: 1.8, snoutLen: 0.4, ears: "round", tail: "flat", tailMat: "dark",
      eyeStyle: "beady", mouth: "fang",
      extra: [E(0, 5.6, 7.9, 0.9, 0.5, 0.8, "white"), ...(t >= 1 ? [E(0, 1.2, 12.2, 3.2, 3, 1.4, "yellow"), E(0, 3.4, 11.5, 3.4, 1.6, 0.5, "yellow")] : []), ...(t >= 2 ? [E(3.8, 3, 6, 0.3, 0.3, 3.6, "wood"), E(3.8, 3, 9.6, 1.4, 0.8, 0.8, "metal")] : [])],
    }) },
    { name: "ゾウさん", build: (t) => quad({ // ぞう
      len: 10, girth: 4.4, legH: 3.4, legR: 1.7, headR: 3.6, snout: 0, ears: "flap", earMat: "body", tail: "tuft", tailLen: 3,
      eyeStyle: "dot", mouth: null, paws: "belly",
      extra: [...chain([0, 8.9, 10], [0, 11.6, 3.6], 1.3, 0.8, 6, "body", [0, 12.4, 8.4]), ...(t >= 1 ? mirror(chain([1.2, 8.4, 9], [1.8, 10.6, 8.6], 0.55, 0.3, 4, "white")) : []), ...(t >= 2 ? [E(0, 0, 12.6, 3, 4, 0.6, "red"), E(0, 0, 13.4, 1.6, 1.6, 1, "gold")] : [])],
    }) },
    L("build", "ヘルモグ"),
  ],
  play: [
    L("play", "ピエロン"),
    { name: "だいまどうおう", build: sorcererDemon },
    { name: "きゅうび", build: (t) => withGlow(quad({ // 九尾のきつね(進化で尾がふえる)
      len: 8.5, girth: 3, legH: 3.4, headR: 2.9, snout: 1.7, snoutLen: 1.6, ears: "pointy", earLen: 3.4, eyeStyle: "sharp", iris: "#f59e0b", mouth: "cat",
      tail: "bushy", tailLen: 5, belly: "white", snoutMat: "white",
      extra: Array.from({ length: t * 2 }, (_, i) => { const a = (i % 2 ? 1 : -1) * (0.5 + Math.floor(i / 2) * 0.4); return chain([0, -4.2, 6.8], [Math.sin(a) * 5, -7.6, 10 + Math.cos(a) * 2], 1.1, 1.5, 4, "body"); }).flat().concat(t >= 2 ? [S(0, 5, 12, 0.9, "glowpart")] : []),
    }), "#fca5a5") },
    { name: "パンダ", build: (t) => quad({ // ぱんだ(おすわり)
      sit: true, girth: 3.7, legH: 1.8, headR: 3.3, body: "white", belly: "white", snout: 1.5, snoutLen: 0.2, snoutMat: "white", ears: "round", earMat: "dark", earInner: "dark",
      paws: "dark", tail: "none", eyeStyle: "big", iris: "#1f2937", mouth: "smile", eyePatch: "dark",
      extra: [...mirror([E(3, 1.4, 6.6, 1.3, 1.3, 2.4, "dark")]), E(0, 0, 8.4, 3.8, 3.4, 1, "dark"), ...(t >= 1 ? [E(3.6, 3.2, 6, 0.4, 0.4, 4, "leaf")] : []), ...(t >= 2 ? crownAt(0, 0.6, 15.4, 1.8) : [])],
    }) },
    { name: "ねこ", build: (t) => quad({ // ねこ
      len: 8, girth: 2.8, legH: 2.8, legR: 0.9, headR: 2.9, snout: 1.2, snoutLen: 0.3, ears: "pointy", earLen: 2.4, tail: "thin", tailLen: 6,
      eyeStyle: "slit", iris: "#84cc16", mouth: "cat", stripes: "accent",
      extra: t >= 1 ? [E(0, 3.6, 8.4, 2.4, 1.6, 0.6, "red"), S(0, 5, 8, 0.7, "gold")] : [],
    }) },
    { name: "おさる", build: (t) => quad({ // さる
      sit: true, girth: 3, legH: 1.8, headR: 3, snout: 2, snoutLen: 0.3, snoutMat: "pink", ears: "round", earMat: "pink", tail: "thin", tailLen: 6,
      eyeStyle: "big", iris: "#7c2d12", mouth: "grin",
      extra: [...(t >= 1 ? [E(0, 0.3, 14, 2.6, 2.6, 1.4, "red"), S(0, 0.3, 15.6, 0.6, "yellow")] : []), ...(t >= 2 ? [...chain([3.4, 2, 6], [5, 4, 10], 0.3, 0.3, 4, "gold"), S(5, 4, 10.6, 1.1, "gem")] : [])],
    }) },
  ],
  drive: [
    L("drive", "タイヤン"),
    { name: "そらりゅう", build: (t) => withGlow(dragon({ // 空の竜(羽根の翼)
      t, wingType: "feather", wing: "body", hornType: "back", hornMat: "white", spikeMat: "white", belly: "white", iris: "#fbbf24", whiskers: t >= 1 ? "white" : null,
      extra: t >= 2 ? crownAt(0, 5.4, 19.6, 1.6) : [],
    }), "#bae6fd") },
    { name: "チーター", build: (t) => quad({ // ちーたー
      len: 10, girth: 2.8, legH: 4.4, legR: 0.9, headR: 2.6, snout: 1.5, snoutLen: 0.8, ears: "round", tail: "thin", tailLen: 7,
      body: "yellow", belly: "white", snoutMat: "white", eyeStyle: "sharp", iris: "#f59e0b", mouth: "cat", heading: R(58),
      extra: [...[[-1.8, 2, 8.6], [1.6, -1, 9.2], [-1, -3, 8.8], [1.8, 3.4, 8.4], [0.2, 0.6, 9.5], [-2, -1.4, 8]].map(([x, y, z]) => S(x, y, z, 0.55, "dark")), ...(t >= 1 ? mirror([E(0.9, 8.3, 11.2, 0.25, 0.3, 1.3, "dark")]) : []), ...(t >= 2 ? [E(0, 0, 9.4, 1.2, 4.6, 0.4, "accent")] : [])],
    }) },
    { name: "ウマ", build: (t) => quad({ // うま
      len: 10.5, girth: 3.2, legH: 5, legR: 0.95, headR: 2.4, snout: 1.9, snoutLen: 2.4, snoutMat: "body", neck: 3.4, ears: "pointy", earLen: 1.8,
      tail: "thin", tailMat: "dark", tailLen: 5, mane: null, eyeStyle: "oval", iris: "#1f2937", mouth: "line", paws: "dark",
      extra: [...Array.from({ length: 6 }, (_, i) => E(0, 3.8 + i * 0.5, 10.8 + i * 1.2, 0.6, 0.9, 1.4, "dark")), ...(t >= 1 ? [E(0, 0.6, 11.3, 3.4, 2.4, 0.6, "red")] : []), ...(t >= 2 ? [...mirror([E(3.6, -1, 13, 2.6, 0.4, 3, "white")]), ...chain([0, 8.7, 18], [0, 9.8, 21], 0.5, 0.15, 4, "gold")] : [])],
    }) },
    { name: "イルカ", build: (t) => fish({ // いるか
      len: 12, girth: 3, fin: "body", body: "body", belly: "white", eyeStyle: "cute", iris: "#1f2937", mouth: "smile", t,
      extra: [E(0, 7, 6.2, 1.2, 1.8, 0.9, "body"), ...(t >= 2 ? [S(0, 0, 11.2, 1.2, "glowpart")] : [])],
    }) },
    { name: "ハヤブサ", build: (t) => bird({ // はやぶさ
      body: "dark", belly: "white", beak: "yellow", hooked: true, spread: 1 + t * 1.6, eyeStyle: "fierce", iris: "#fde047", tailLen: 4,
      extra: [S(0, 3.4, 11.4, 2.2, "white"), E(0, 3, 12.6, 2.9, 2.6, 1.2, "dark")],
    }) },
  ],
  life: [
    L("life", "はっぱっぱ"),
    { name: "ユニコーン", build: (t) => withGlow(quad({ // ゆにこーん
      len: 10, girth: 3.1, legH: 4.8, legR: 0.9, headR: 2.4, snout: 1.8, snoutLen: 2, snoutMat: "white", neck: 3.2, body: "white", belly: "white", ears: "pointy", earLen: 1.8,
      horn: { from: [0, 7.8, 17.8], to: [0, 9.4, 22 + t], r0: 0.7, mat: "gold" }, tail: "bushy", tailMat: "accent", tailLen: 5, eyeStyle: "cute", iris: "#a855f7", mouth: null, paws: "gold",
      extra: [...Array.from({ length: 6 }, (_, i) => E(0, 3.6 + i * 0.5, 10.6 + i * 1.2, 0.7, 0.9, 1.4, i % 2 ? "accent" : "pink")), ...(t >= 2 ? mirror([E(3.4, -1, 13, 2.6, 0.4, 3.2, "white"), E(5.4, -1.2, 14.6, 1.4, 0.4, 2.2, "white")]) : [])],
    }), "#f5d0fe") },
    { name: "もりのぬし", build: (t) => withGlow(quad({ // 森の主(大きな角のしか)
      len: 10, girth: 3.4, legH: 4.6, legR: 1, headR: 2.6, snout: 1.8, snoutLen: 1.4, ears: "pointy", earLen: 2, tail: "puff", tailMat: "white",
      antlers: { len: 4.5 + t * 1.2, mat: t >= 2 ? "gold" : "wood" }, eyeStyle: "sharp", iris: "#22c55e", mouth: null, belly: "belly",
      extra: [...(t >= 1 ? [...[-1.6, 1.6].map((x) => S(x, 5.6, 17.8, 0.8, "leaf")), S(0, 0, 11, 0.8, "pink")] : []), S(0, 7.9, 12.4, 1.8, "white")],
    }), "#86efac") },
    { name: "ひつじ", build: (t) => quad({ // ひつじ
      len: 8, girth: 3.6, legH: 2.4, legR: 0.7, headR: 2.4, body: "white", belly: "white", snout: 1.6, snoutLen: 0.6, snoutMat: "dark", noseMat: "dark", ears: "droop", earLen: 1.6, earMat: "dark",
      tail: "puff", tailMat: "white", eyeStyle: "sleepyl", iris: "#1f2937", mouth: null, paws: "dark",
      extra: [...Array.from({ length: 9 }, (_, i) => { const a = (i / 9) * Math.PI * 2; return S(Math.cos(a) * 3, Math.sin(a) * 3.4, 6.8 + (i % 2) * 0.8, 1.9, "white"); }), ...(t >= 1 ? mirror(chain([2, 5.2, 11], [3.2, 6.2, 9], 0.8, 0.6, 4, "gold", [3.6, 4.4, 11.6])) : []), ...(t >= 2 ? [E(0, 6.2, 8.8, 1.4, 0.6, 1.4, "gold")] : [])],
    }) },
    L("life", "こもりグマ"),
    L("life", "たまごドリ"),
  ],
  tech: [
    L("tech", "ドットおばけ"),
    { name: "メカドラゴン", build: (t) => withGlow(dragon({ // 機械の竜
      t, wingType: "mech", body: "metal", belly: "dark", hornMat: "metal", spikeMat: "glowpart", hornType: "up", plates: true, iris: "#22d3ee", eyeStyle: "visor", mouth: "zigzag",
      extra: [S(0, 3.5, 8.6, 1.2, "glowpart"), ...(t >= 2 ? crownAt(0, 5.4, 19.6, 1.6) : [])],
    }), "#22d3ee") },
    { name: "へんげのまおう", build: serpentDemon },
    L("tech", "ロボわん"),
    { name: "フクロウ", build: (t) => bird({ // ふくろう
      body: "body", belly: "belly", beak: "orange", eyeStyle: "cute", iris: "#fbbf24", tailLen: 2,
      extra: [...mirror([E(1.4, 5.5, 11.4, 1.6, 0.5, 1.6, "white"), ...chain([2, 2.4, 13.6], [2.8, 2, 15.4 + t * 0.6], 0.8, 0.3, 3, "body")]), ...(t >= 1 ? [E(0, 5.9, 12.1, 3.4, 0.3, 0.3, "dark"), ...mirror([E(1.4, 5.8, 11.4, 1.8, 0.2, 1.8, "glass")])] : []), ...(t >= 2 ? [E(0, 3, 14.2, 3, 3, 0.5, "dark"), E(0, 3, 15, 2, 2, 0.8, "dark")] : [])],
    }) },
    { name: "ヤモリ", build: (t) => quad({ // やもり
      len: 8, girth: 2.3, legH: 1.2, legR: 0.7, headR: 2.3, snout: 1.4, snoutLen: 0.5, snoutMat: "body", ears: "none", tail: "thin", tailLen: 6, tailMat: "body",
      eyeStyle: "big", iris: "#fbbf24", mouth: "smile", eyeDx: 0.55, eyeDz: 0.35, heading: R(60),
      extra: [...[-2, 0, 2].map((y) => S(0, y, 4.8, 0.6, t >= 1 ? "glowpart" : "accent")), ...(t >= 2 ? mirror([E(2.4, -1, 5.8, 2.4, 0.3, 1.6, "glass")]) : [])],
    }) },
  ],
  money: [
    L("money", "ツボまじん"),
    { name: "おうごんりゅう", build: (t) => withGlow(dragon({ // 黄金の竜
      t, body: "gold", belly: "yellow", wing: "red", hornMat: "white", spikeMat: "red", iris: "#ef4444", eyeStyle: "dragon",
      extra: [S(0, 3.6, 9, 0.9, "gem"), ...(t >= 1 ? mirror([S(3.6, 3.2, 6.2, 0.9, "gold")]) : []), ...(t >= 2 ? crownAt(0, 5.4, 19.6, 1.8) : [])],
    }), "#fde047") },
    { name: "しし", build: (t) => quad({ // らいおん
      len: 9.5, girth: 3.5, legH: 3.6, legR: 1.2, headR: 3, snout: 1.9, snoutLen: 0.9, snoutMat: "belly", ears: "round", tail: "tuft", tailLen: 5,
      body: "yellow", mane: "orange", eyeStyle: "fierce", iris: "#f59e0b", mouth: "fangs",
      extra: t >= 2 ? crownAt(0, 5.7, 14.6, 1.8) : t >= 1 ? [E(0, 5, 9.6, 2.4, 1, 0.8, "red")] : [],
    }) },
    L("money", "こばんネコ"),
    L("money", "ぶたちょきん"),
    L("money", "がまぐちガエル"),
  ],
  market: [
    L("market", "ちょうちんオバケ"),
    { name: "かいぞくせんちょう", build: (t) => withGlow(hero({ // 海賊の船長(かっこいい骸骨ではなく、ひげの船長)
      armor: "red", cloth: "dark", skin: "belly", helmet: "hat", weapon: "cutlass", cape: t >= 1 ? "dark" : null, eyeStyle: "fierce", iris: "#1f2937", mouth: "mustache", t,
      extra: [E(0, 2.4, 11.8, 1.8, 0.9, 1, "dark"), ...(t >= 2 ? [...chain([-3.4, 0, 11], [-3.6, 0.4, 13], 0.5, 0.5, 2, "dark"), S(-3.6, 0.5, 13.8, 1.3, "leaf"), S(-3.6, 1.6, 13.6, 0.5, "yellow")] : [])],
    }), "#fbbf24") },
    { name: "サメ", build: (t) => fish({ // さめ
      shark: true, len: 12, girth: 3.2, body: "metal", belly: "white", fin: "metal", // さめは灰色(属性色だと何の魚か分からない) eyeStyle: "fierce", iris: "#1f2937", mouth: "zigzag", t,
      extra: [...(t >= 1 ? mirror([E(1.4, 5, 5, 0.8, 0.5, 0.4, "white")]) : []), ...(t >= 2 ? [E(0, -0.6, 11.6, 1.6, 1.6, 0.5, "gold")] : [])],
    }) },
    { name: "たぬき", build: (t) => quad({ // たぬき(商人)
      sit: true, girth: 3.4, legH: 1.8, headR: 3.1, snout: 1.6, snoutLen: 0.5, snoutMat: "white", ears: "round", earMat: "dark", tail: "bushy", tailLen: 4,
      body: "wood", belly: "belly", tailMat: "wood", // たぬきらしい茶色は属性色より優先
      eyeStyle: "round", iris: "#7c2d12", mouth: "smile", eyePatch: "dark",
      extra: [ ...(t >= 1 ? [E(0, 0.6, 14.6, 3.4, 3, 0.5, "wood"), E(0, 0.6, 15.2, 2, 2, 0.8, "wood")] : []), ...(t >= 2 ? [E(3.6, 2.6, 6, 1.4, 0.8, 1.8, "gold"), E(3.6, 3.4, 6, 0.8, 0.2, 0.8, "dark")] : [])],
    }) },
    L("market", "はたペンギン"),
    L("market", "ふうせんウサ"),
  ],
};

/* 全種族を高精細モードで描く(2026-09)。竜・魔王は各build内で mood:"boss" を返す。
   悪役っぽい種族もボス顔にする(オーナー承認: かいぞくせんちょう・サメ) */
const BOSS_FACE = new Set(["かいぞくせんちょう", "サメ"]);
Object.values(SPECIES_POOL).forEach((pool) => pool.forEach((sp) => {
  const b = sp.build;
  sp.build = (t) => { const r = b(t); return { ...r, hd: true, mood: r.mood || (BOSS_FACE.has(sp.name) ? "boss" : null) }; };
}));

export { CREATURE_LOOK, SPECIES_POOL };
