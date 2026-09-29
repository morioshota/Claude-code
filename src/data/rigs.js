/* クリーチャーの「骨組み」(2026-09)。
   けもの(四つ足)・竜・人型(騎士/魔王/忍者/海賊)・鳥・魚 を部品の組み合わせで作る。
   種族ごとに寸法・耳・しっぽ・角・武器などを変えて描き分ける。

   なぜ骨組みを作ったか:
     丸い体に目を付けただけだと、どれも「得体の知れない丸いもの」に見えた。
     けものは四つ足・鼻先(マズル)・耳・しっぽ、竜は長い首・角・翼・しっぽ、
     というシルエットがあって初めて「何の生きものか」が分かる。
   向き: 頭が +y(手前)。仕上げに turn() で斜め(3/4)に向けて横顔の輪郭を見せる。
   座標: x=右, y=手前, z=上。地面 z=0。 */

import { E, S, chain, mirror, onHead, turn } from "../lib/creature3d.js";

export const R = (deg) => (deg * Math.PI) / 180;

/* ---------- 四つ足のけもの ---------- */
export function quad(o = {}) {
  const {
    body = "body", belly = "belly", len = 9, girth = 3.4, legH = 3.2, legR = 1.15, paws = "dark",
    headR = 3.3, neck = 1, snout = 2.1, snoutLen = 0.9, snoutMat = "belly", noseMat = "dark",
    ears = "pointy", earLen = 2.8, earMat = null, earInner = "pink",
    tail = "thin", tailMat = null, tailLen = 4,
    mane = null, horn = null, antlers = null, stripes = null,
    eyeStyle = "almond", iris = "#f59e0b", mouth = "cat", eyeDx = 0.42, eyeDz = 0.28,
    heading = R(40), sit = false, extra = [], lowHead = 0, eyePatch = null,
  } = o;
  const bz = legH + girth * 0.78;
  const P = [];
  if (sit) { // おすわり: 胴を立てる
    P.push(E(0, -0.5, legH + girth, girth * 1.05, girth * 0.95, girth * 1.25, body));
    P.push(E(0, girth * 0.55, legH + girth * 0.9, girth * 0.72, girth * 0.4, girth * 0.9, belly));
    P.push(...mirror([E(girth * 0.7, -1, legH * 0.55, girth * 0.55, girth * 0.8, legH * 0.55, body), E(girth * 0.55, 2.2, 0.6, legR * 1.1, legR * 1.4, 0.7, paws)]));
    P.push(...mirror([E(girth * 0.45, girth * 0.4, legH * 0.9, legR, legR, legH * 0.8, body)]));
  } else {
    P.push(E(0, 0, bz, girth, len / 2, girth * 0.82, body));
    P.push(E(0, 0.6, bz - girth * 0.38, girth * 0.72, len * 0.36, girth * 0.45, belly));
    [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(([sx, sy]) => {
      const x = sx * girth * 0.56, y = sy * len * 0.33;
      P.push(E(x, y, legH * 0.55 + 0.35, legR, legR, legH * 0.62, body));
      P.push(E(x, y + 0.3, 0.6, legR * 1.1, legR * 1.35, 0.7, paws));
    });
  }
  if (stripes) [-2, 0, 2].forEach((y) => P.push(E(0, y, bz + girth * 0.55, girth * 0.9, 0.45, 0.6, stripes)));
  const hy = sit ? girth * 0.5 : len / 2 + headR * 0.25;
  const hz = sit ? legH + girth * 2.1 + headR * 0.6 : bz + girth * 0.55 + neck + headR * 0.35 - lowHead;
  if (!sit) P.push(...chain([0, len * 0.36, bz + girth * 0.35], [0, hy - headR * 0.35, hz - headR * 0.35], girth * 0.58, headR * 0.62, 3, body));
  const h = S(0, hy, hz, headR, body);
  P.push(h);
  // 鼻先(マズル)と鼻
  const sy = hy + headR * 0.72, sz = hz - headR * 0.32;
  let noseP = onHead(h, 0, -0.05, 1.02);
  if (snout > 0) {
    P.push(E(0, sy + snoutLen * 0.45, sz, snout * 0.82, snout * 0.62 + snoutLen * 0.45, snout * 0.62, snoutMat));
    noseP = [0, sy + snoutLen * 0.9 + snout * 0.55, sz + snout * 0.28];
    P.push(S(noseP[0], noseP[1] - 0.2, noseP[2], Math.max(0.55, snout * 0.28), noseMat));
  }
  // 耳
  const em = earMat || body;
  const ex = headR * 0.62, ez = hz + headR * 0.62, ey = hy - headR * 0.1;
  if (ears === "pointy") P.push(...mirror([...chain([ex, ey, ez], [ex + 0.8, ey - 0.4, ez + earLen], 1.4, 0.35, 4, em), E(ex + 0.2, ey + 0.55, ez + earLen * 0.35, 0.5, 0.25, earLen * 0.3, earInner)]));
  if (ears === "round") P.push(...mirror([S(ex, ey - 0.2, ez + 0.4, 1.35, em), S(ex + 0.1, ey + 0.55, ez + 0.4, 0.7, earInner)]));
  if (ears === "long") P.push(...mirror([...chain([ex * 0.6, ey, ez], [ex * 0.9, ey - 1, ez + earLen], 1.2, 0.9, 6, em), E(ex * 0.75, ey + 0.35, ez + earLen * 0.5, 0.45, 0.3, earLen * 0.35, earInner)]));
  if (ears === "droop") P.push(...mirror(chain([ex * 1.05, ey, ez - 0.4], [ex * 1.4, ey + 0.4, ez - earLen], 1.2, 0.9, 4, em)));
  if (ears === "flap") P.push(...mirror([E(headR * 1.05, hy - 0.6, hz - 0.2, 0.5, headR * 0.9, headR * 1.05, em)]));
  // たてがみ
  if (mane) {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      P.push(S(Math.cos(a) * headR * 1.05, hy - headR * 0.35, hz + Math.sin(a) * headR * 1.05, headR * 0.55, mane));
    }
  }
  // 角(1本=サイ・ユニコーン)
  if (horn) P.push(...chain(horn.from || [0, sy + 0.4, sz + snout * 0.5], horn.to || [0, sy + 1.6, sz + snout * 0.5 + 3.4], horn.r0 || 0.9, 0.2, 5, horn.mat || "white"));
  // 枝角(シカ)
  if (antlers) {
    const am = antlers.mat || "wood", L = antlers.len || 4;
    P.push(...mirror([...chain([ex * 0.6, ey - 0.2, ez], [ex + 2.4, ey - 1, ez + L], 0.55, 0.35, 6, am),
      ...chain([ex + 0.9, ey - 0.5, ez + L * 0.45], [ex + 0.2, ey + 0.8, ez + L * 0.9], 0.4, 0.3, 4, am),
      ...chain([ex + 1.8, ey - 0.8, ez + L * 0.75], [ex + 3.4, ey - 0.4, ez + L * 1.1], 0.4, 0.3, 4, am)]));
  }
  // しっぽ
  const tm = tailMat || body;
  const tb = sit ? [0, -girth * 0.9, legH * 0.7] : [0, -len / 2 + 0.3, bz + girth * 0.2];
  if (tail === "thin") P.push(...chain(tb, [0, tb[1] - tailLen * 0.6, tb[2] + tailLen * 0.8], 0.6, 0.35, 5, tm, [0, tb[1] - tailLen * 0.7, tb[2] + 0.2]));
  if (tail === "bushy") P.push(...chain(tb, [0, tb[1] - tailLen * 0.7, tb[2] + tailLen * 0.7], 1.2, 1.7, 5, tm, [0, tb[1] - tailLen, tb[2]]), S(0, tb[1] - tailLen * 0.75, tb[2] + tailLen * 0.85, 1.2, "white"));
  if (tail === "puff") P.push(S(0, tb[1] - 0.6, tb[2] + 0.4, 1.4, tm));
  if (tail === "tuft") P.push(...chain(tb, [0, tb[1] - tailLen * 0.8, tb[2] - tailLen * 0.3], 0.45, 0.4, 5, tm), S(0, tb[1] - tailLen * 0.85, tb[2] - tailLen * 0.35, 1.1, "dark"));
  if (tail === "flat") P.push(E(0, tb[1] - 2, 0.9, 2, 2.6, 0.6, tm));
  // 目のまわりの模様(パンダ・たぬき)。目の位置に合わせて頭の表面に貼る
  if (eyePatch) [-1, 1].forEach((sx) => { const q = onHead(h, sx * eyeDx, eyeDz - 0.05, 0.9); P.push(E(q[0], q[1], q[2], headR * 0.3, headR * 0.22, headR * 0.34, eyePatch)); });
  P.push(...extra);
  const faces = [
    { kind: "eye", style: eyeStyle, p: onHead(h, -eyeDx, eyeDz), iris },
    { kind: "eye", style: eyeStyle, p: onHead(h, eyeDx, eyeDz), iris, mirror: true },
  ];
  if (snout > 0 && mouth) faces.push({ kind: "mouth", style: mouth, p: [0, noseP[1] - 0.3, noseP[2] - snout * 0.5] });
  else if (mouth) faces.push({ kind: "mouth", style: mouth, p: onHead(h, 0, -0.3) });
  return turn(P, faces, heading);
}

/* ---------- 竜(ドラゴン) ----------
   2026-09 改訂(オーナー提示の参考画像の作風): 直立したずんぐり体型、
   しま模様の大きなおなか、振り上げた爪の腕、大きく開いた口とキバ、頭のとさか、
   コウモリの翼、トゲの並んだ太いしっぽ。ST3からは口から炎を吐く。
   ※特定のキャラクターの模写ではなく「王道の竜」の作りをなぞったオリジナル */
export function dragon(o = {}) {
  const {
    body = "body", belly = "amber", stripe = "stripe", wing = "accent", bone = "dark", hornMat = "white", spikeMat = "red",
    t = 0, wingType = "bat", hornType = "crest", iris = "#fde047", eyeStyle = "dragon",
    heading = R(34), extra = [], whiskers = null, plates = false, fire = false,
  } = o;
  const P = [];
  // 足(太い足首+爪)
  P.push(...mirror([E(2.7, 0.4, 3.2, 2.1, 2.3, 2.8, body), E(2.8, 1.4, 0.8, 1.8, 2.5, 0.9, body)]));
  P.push(...mirror([0, 1, 2].map((i) => E(1.8 + i * 0.9, 3.8, 0.55, 0.32, 0.55, 0.4, "white"))));
  // ずんぐりしたおなか+しま模様の腹板
  P.push(E(0, 0.2, 7.6, 4.6, 4, 5.3, body));
  P.push(E(0, 2.2, 7.3, 3.3, 2.1, 4.7, belly));
  [4.2, 5.8, 7.4, 9, 10.5].forEach((z, i) => P.push(E(0, 2.4 + (i === 2 ? 0.25 : 0), z, 3.1 - Math.abs(i - 2) * 0.35, 1.95, 0.28, stripe)));
  if (plates) [5.5, 8].forEach((z) => P.push(...mirror([E(4.4, 0.2, z, 0.7, 2, 1.1, "metal")])));
  // 振り上げた腕と爪
  P.push(...mirror([...chain([3.6, 1.4, 10.4], [4.4, 4.2, 11.6], 1.1, 0.85, 4, body, [4.8, 2.4, 10]),
    ...[0, 1, 2].map((i) => E(3.9 + i * 0.55, 5, 12 + (i === 1 ? 0.5 : 0), 0.25, 0.3, 0.7, "white"))]));
  // 首と頭(長い鼻づら・大きく開いた口)
  P.push(...chain([0, 1.2, 11.8], [0, 3.2, 15.2], 2.1, 1.8, 4, body, [0, 0.8, 14.6]));
  P.push(E(0, 4.2, 16.6, 2.3, 2.7, 2.2, body));                 // 頭
  P.push(E(0, 7.3, 17.2, 1.55, 2.9, 1.05, body));               // 上あご(上向き)
  P.push(E(0, 6.8, 14.9, 1.35, 2.5, 0.65, body));               // 下あご
  P.push(E(0, 7, 16, 1.2, 2.3, 0.75, "mouth"));                 // 口の中
  P.push(...mirror([0, 1, 2].map((i) => S(0.9, 6.4 + i * 1.3, 16.35, 0.3, "white"))));   // 上のキバ
  P.push(...mirror([0, 1].map((i) => S(0.8, 6.8 + i * 1.3, 15.5, 0.28, "white"))));       // 下のキバ
  P.push(...mirror([E(1.3, 5.4, 18.2, 0.8, 1.1, 0.4, "dark")]));                            // 眉の張り出し
  P.push(...mirror([S(0.55, 10, 17.4, 0.3, "dark")]));                                      // 鼻の穴
  // 角・とさか
  const hl = 2.6 + t * 1.3;
  if (hornType === "crest") P.push(...chain([0, 3.4, 18.4], [0, 0.6, 19 + hl], 1, 0.25, 6, hornMat, [0, 2.4, 20.6 + t * 0.4]), E(0, 9.4, 17.9, 0.35, 0.5, 0.9, hornMat));
  if (hornType === "back") P.push(...mirror(chain([1.4, 3.6, 18.4], [2.2, 0.8 - t * 0.4, 19.2 + hl], 0.8, 0.22, 5, hornMat, [2.1, 3, 20.6])));
  if (hornType === "up") P.push(...mirror(chain([1.3, 4.2, 18.4], [2, 3.6, 18.8 + hl + 0.6], 0.8, 0.2, 5, hornMat)));
  if (hornType === "antler") P.push(...mirror([...chain([1.2, 3.8, 18.3], [3.2, 2, 18.6 + hl], 0.55, 0.3, 5, hornMat), ...chain([2.1, 3, 19.8], [1.7, 4.4, 20.9 + t], 0.4, 0.25, 3, hornMat)]));
  if (whiskers) P.push(...mirror(chain([1.2, 9.4, 16.8], [4.2, 11, 15 + t * 0.5], 0.3, 0.2, 5, whiskers, [3.4, 10.6, 17.6])));
  // 太いしっぽ(背中側から回り込む)+トゲ
  const tail = chain([0, -3, 5], [-3.5, -7.5, 11.5 + t], 2.5, 0.8, 9, body, [-1, -9.5, 3.5]);
  P.push(...tail);
  tail.forEach((sp, i) => { if (i % 2 === 1 && i < tail.length - 1) P.push(E(sp.c[0] - 0.3, sp.c[1] - 0.4, sp.c[2] + sp.r[0] * 0.9, 0.35, 0.6, 0.8 + (1 - i / tail.length) * 0.6, spikeMat)); });
  P.push(E(-3.7, -7.8, 12.4 + t, 0.5, 0.9, 1.2, spikeMat));
  // 背中のトゲ
  [[0, 1.6, 15.2], [0, 0.4, 13.4], [0, -2.4, 11.5], [0, -3.8, 9.2]].forEach(([x, y, z]) => P.push(E(x, y, z, 0.4, 0.7, 0.8 + t * 0.12, spikeMat)));
  // 翼(付け根は肩の後ろ)
  const ws = 1 + t * 0.3;
  const sh = [2.6, -2.2, 11.6];
  if (wingType === "bat") {
    P.push(...mirror([
      ...chain(sh, [sh[0] + 5 * ws, -3, sh[2] + 4.4 * ws], 0.55, 0.35, 6, bone, [sh[0] + 2.4 * ws, -2.6, sh[2] + 4.6 * ws]),
      ...chain([sh[0] + 5 * ws, -3, sh[2] + 4.4 * ws], [sh[0] + 5.6 * ws, -3, sh[2] - 1.4 * ws], 0.3, 0.25, 5, bone),
      E(sh[0] + 1.9 * ws, -2.7, sh[2] + 0.9 * ws, 2.2 * ws, 0.3, 2.9 * ws, wing),
      E(sh[0] + 3.6 * ws, -2.9, sh[2] + 1.3 * ws, 1.8 * ws, 0.3, 3.1 * ws, wing),
      E(sh[0] + 5 * ws, -3, sh[2] + 1.1 * ws, 0.9 * ws, 0.28, 2.7 * ws, wing),
    ]));
  }
  if (wingType === "feather") {
    P.push(...mirror(Array.from({ length: 5 }, (_, i) => E(sh[0] + 0.8 + i * 1.05 * ws, -2.8, sh[2] + 0.6 + i * 0.75 * ws - (i > 2 ? (i - 2) * 1.1 : 0), 1.1, 0.35, 2.4 + i * 0.3 * ws, i % 2 ? wing : "white"))));
  }
  if (wingType === "mech") {
    P.push(...mirror([E(sh[0] + 2 * ws, -2.8, sh[2] + 1.8, 2.3 * ws, 0.4, 1.1, "metal"), E(sh[0] + 2.4 * ws, -3, sh[2] - 0.2, 2.1 * ws, 0.4, 0.8, "metal"), S(sh[0] + 4.3 * ws, -3, sh[2] + 2.2, 0.9, "glowpart"), S(sh[0] + 4.5 * ws, -3, sh[2] - 0.1, 0.8, "glowpart")]));
  }
  // 炎の息(ST3から)。口の先から斜め上へ広がる
  if (fire && t >= 1) {
    // 口もとは細く、顔から離れるほど太く(顔に炎の塊がかぶらないように)
    const f = chain([0, 11.2, 16.1], [0.4, 17.6 + t, 17.8 + t * 0.6], 0.45, 1.5 + t * 0.35, 7, "fire", [0, 14.6, 16.2]);
    P.push(...f, S(0.4, 18.2 + t, 18 + t * 0.6, 0.8 + t * 0.25, "yellow"));
  }
  P.push(...extra);
  const faces = [
    { kind: "eye", style: eyeStyle, p: [-1.35, 6.3, 17.7], iris },
    { kind: "eye", style: eyeStyle, p: [1.35, 6.3, 17.7], iris, mirror: true },
  ];
  return turn(P, faces, heading);
}

/* ---------- 人型(騎士・魔王・忍者・海賊) ---------- */
export function hero(o = {}) {
  const {
    armor = "metal", cloth = "accent", skin = "body", bulk = 1,
    helmet = "knight", plume = null, cape = null, collar = false,
    weapon = "sword", bladeMat = "white", shield = null, wings = null, horns = null,
    eyeStyle = "visor", iris = "#7dd3fc", mouth = null, heading = R(18), t = 0, extra = [], crown = false,
  } = o;
  const P = [];
  const B = bulk;
  P.push(...mirror([E(1.7 * B, 0.5, 1, 1.35, 1.9, 1.1, "dark"), E(1.55 * B, 0, 3.5, 1.25, 1.25, 2.3, armor)]));
  P.push(E(0, 0, 8, 3.3 * B, 2.3 * B, 3.4, armor));
  P.push(E(0, 0, 5.5, 3.1 * B, 2.2 * B, 0.6, "wood"), S(0, 2.1 * B, 5.5, 0.55, "gold"));
  P.push(S(0, 2.3 * B, 8.9, 0.85, "gold"));
  P.push(...mirror([S(3.3 * B, 0, 10.2, 1.75 * B, armor)]));
  if (t >= 2) P.push(...mirror([E(3.3 * B, 0, 11.3, 1.4 * B, 1.4 * B, 0.5, "gold")]));
  P.push(...mirror([...chain([3.7 * B, 0.2, 9.4], [4.2 * B, 1.3, 5.9], 1.05, 0.95, 3, armor), S(4.3 * B, 1.5, 5.4, 0.95, "dark")]));
  const hz = 13.4;
  const head = S(0, 0.3, hz, 2.8, helmet === "none" || helmet === "horned" || helmet === "hat" ? skin : armor);
  P.push(head);
  if (helmet === "knight") {
    P.push(E(0, 2.55, hz, 2.1, 0.5, 0.65, "dark"), E(0, 2.4, hz - 1.3, 1.6, 0.6, 0.9, armor), E(0, 0.3, hz + 2.3, 0.45, 2.6, 0.7, t >= 2 ? "gold" : armor));
  }
  if (helmet === "hood") P.push(E(0, -0.3, hz + 0.4, 3.2, 3, 3.1, cloth), E(0, 2.5, hz, 2, 0.4, 1.2, "dark"));
  if (helmet === "ninja") P.push(E(0, 2.55, hz - 0.8, 2.2, 0.5, 1.1, cloth), E(0, 0.3, hz + 0.7, 2.95, 2.95, 0.7, cloth), ...chain([-1, -2.6, hz + 0.6], [-3.4, -5, hz - 1.2], 0.5, 0.4, 4, cloth));
  if (helmet === "hat") { // 海賊の三角帽
    P.push(E(0, 0.2, hz + 2.1, 4.2, 3.4, 0.6, "dark"), E(0, 0, hz + 2.9, 2.6, 2.4, 1.5, "dark"), S(0, 2.8, hz + 2.6, 0.7, "white"));
  }
  if (horns || helmet === "horned") P.push(...mirror(chain([2, 0.2, hz + 1.8], [4.2 + t, -0.4, hz + 4.6 + t * 1.2], 0.8, 0.22, 5, horns || "white", [4.2, 0.4, hz + 2.4])));
  if (plume) P.push(...chain([0, 0.2, hz + 2.8], [0, -4, hz + 1], 1.1, 0.6, 6, plume, [0, -1.6, hz + 4.4]));
  if (crown) P.push(E(0, 0.3, hz + 2.6, 2, 2, 0.6, "gold"), ...[-1, 0, 1].map((k) => S(k * 1.4, 0.3, hz + 3.4, 0.5, "gold")), S(0, 1.9, hz + 2.8, 0.5, "gem"));
  if (cape) P.push(E(0, -2.5, 7.4, 3.9 * B, 0.55, 5.8, cape), E(0, -2.6, 2.4, 4.3 * B, 0.6, 1.6, cape));
  if (collar) P.push(...mirror([E(2.2, -1, 12.1, 1.3, 1, 2.2, cape || cloth)]));
  // 武器
  const hx = 4.3 * B, hy = 1.6;
  if (weapon === "sword") P.push(E(hx, hy, 11.6, 0.35, 0.6, 5.2, bladeMat), E(hx, hy, 6.3, 1.7, 0.45, 0.4, "gold"), E(hx, hy, 5, 0.4, 0.4, 0.9, "wood"));
  if (weapon === "katana") P.push(...chain([hx, hy, 6.2], [hx - 1.2, hy + 0.2, 17], 0.35, 0.3, 8, bladeMat, [hx + 0.6, hy, 12]), E(hx, hy, 6.1, 1, 0.4, 0.3, "dark"));
  if (weapon === "hammer") P.push(E(hx, hy, 9.4, 0.4, 0.4, 5, "wood"), E(hx, hy, 14.4, 2.2, 1.5, 1.5, "metal"), E(hx, hy, 14.4, 2.3, 1.6, 0.4, "gold"));
  if (weapon === "staff") P.push(E(hx, hy, 10.4, 0.35, 0.35, 6.4, "dark"), S(hx, hy, 17.4, 1.5, "glowpart"), ...mirror([E(0.9, 0, 17.4, 0.3, 0.3, 1.6, "gold")]).map((p) => ({ ...p, c: [p.c[0] + hx, hy, p.c[2]] })));
  if (weapon === "cutlass") P.push(...chain([hx, hy, 6.2], [hx + 1.4, hy + 0.6, 12.4], 0.45, 0.3, 6, bladeMat, [hx + 1.6, hy, 9]), E(hx, hy, 5.9, 1.1, 0.8, 0.6, "gold"));
  if (shield) P.push(E(-4.4 * B, 2.1, 7.2, 2.2, 0.5, 2.9, shield), S(-4.4 * B, 2.6, 7.4, 0.8, "gold"), E(-4.4 * B, 2.25, 7.2, 2.3, 0.45, 0.4, "gold"));
  if (wings) P.push(...mirror([...chain([2, -2.2, 11], [7 + t, -3.2, 15.4 + t], 0.45, 0.35, 5, "dark"), E(4.6 + t * 0.5, -2.9, 12.4 + t * 0.4, 2.3 + t * 0.4, 0.3, 3 + t * 0.4, wings), E(6.6 + t * 0.7, -3.1, 12 + t * 0.4, 1.4, 0.3, 3 + t * 0.4, wings)]));
  P.push(...extra);
  const faces = [];
  if (eyeStyle === "visor") faces.push({ kind: "eye", style: "visor", p: [-0.6, 3.05, hz + 0.05], iris }, { kind: "eye", style: "visor", p: [1.4, 3.05, hz + 0.05], iris, mirror: true });
  else {
    faces.push({ kind: "eye", style: eyeStyle, p: onHead(head, -0.4, 0.12), iris }, { kind: "eye", style: eyeStyle, p: onHead(head, 0.4, 0.12), iris, mirror: true });
    if (mouth) faces.push({ kind: "mouth", style: mouth, p: onHead(head, 0, -0.42) });
  }
  return turn(P, faces, heading);
}

/* ---------- 鳥 ---------- */
export function bird(o = {}) {
  const {
    body = "body", belly = "belly", wing = null, beak = "orange", legs = "orange", crest = null,
    hooked = false, spread = 0, tailLen = 3, iris = "#fde047", eyeStyle = "round", heading = R(34), extra = [], big = 1,
  } = o;
  const P = [];
  const wm = wing || body;
  P.push(E(0, -0.4, 7, 3.4 * big, 4.3 * big, 3.6 * big, body), E(0, 1.8 * big, 6.4, 2.5 * big, 2.2 * big, 2.9 * big, belly));
  const h = S(0, 3.1 * big, 7 + 4.2 * big, 2.8 * big, body);
  P.push(h);
  const bz = h.c[2] - 0.2, by = h.c[1] + 2.4 * big;
  if (hooked) P.push(...chain([0, by - 0.4, bz + 0.3], [0, by + 2.2, bz - 1.2], 1.05, 0.3, 5, beak, [0, by + 2, bz + 0.4]));
  else P.push(...chain([0, by - 0.4, bz], [0, by + 2.4, bz - 0.4], 0.95, 0.25, 4, beak));
  // 広げた翼は肩(x≈3)から生やす。中心を外へ出しすぎると体から離れて浮いて見えた
  if (spread > 0) {
    const w1 = 2.4 + spread * 0.9, w2 = 1.6 + spread * 0.6;
    P.push(...mirror([E(2.6 * big + w1 * 0.8, -0.8, 8.8 + spread * 0.5, w1, 0.5, 2.2 + spread * 0.25, wm), E(2.6 * big + w1 * 1.55 + w2 * 0.5, -1, 9.6 + spread * 0.8, w2, 0.45, 1.5, wm)]));
  }
  else P.push(...mirror([E(3.2 * big, -0.9, 7.4, 1.1, 3.6 * big, 2.5 * big, wm)]));
  P.push(E(0, -4.6 * big - tailLen * 0.3, 6.6, 1.8, tailLen * 0.7, 0.6, wm));
  P.push(...mirror([...chain([1.3, 0.2, 3.6], [1.4, 0.8, 0.4], 0.5, 0.5, 3, legs), E(1.4, 1.3, 0.3, 0.7, 1.1, 0.3, legs)]));
  if (crest) P.push(...chain([0, h.c[1] - 0.4, h.c[2] + 2.4 * big], [0, h.c[1] - 2.6, h.c[2] + 4.4 * big], 0.8, 0.3, 5, crest, [0, h.c[1] - 0.2, h.c[2] + 4.6 * big]));
  P.push(...extra);
  const faces = [
    { kind: "eye", style: eyeStyle, p: onHead(h, -0.55, 0.18), iris },
    { kind: "eye", style: eyeStyle, p: onHead(h, 0.55, 0.18), iris, mirror: true },
  ];
  return turn(P, faces, heading);
}

/* ---------- 魚・海のいきもの(宙に浮いて泳ぐ) ---------- */
export function fish(o = {}) {
  const {
    body = "body", belly = "belly", fin = "accent", len = 11, girth = 3.4, z = 6.5, shark = false,
    iris = "#e2e8f0", eyeStyle = "beady", mouth = null, heading = R(52), extra = [], t = 0,
  } = o;
  const P = [];
  P.push(E(0, 0, z, girth, len / 2, girth * 0.95, body), E(0, 0.8, z - girth * 0.42, girth * 0.72, len * 0.4, girth * 0.5, belly));
  P.push(E(0, -len / 2 - 1.4, z + 0.4, 0.5, 1.6, 2.8 + t * 0.4, fin), E(0, -len / 2 - 2.4, z + 2, 0.45, 1.2, 1.8, fin));
  P.push(E(0, -0.6, z + girth + (shark ? 1.4 : 0.8), 0.45, shark ? 1.6 : 1.8, shark ? 2.2 + t * 0.4 : 1.2, fin));
  P.push(...mirror([E(girth * 0.95, 1.4, z - girth * 0.4, 1.8, 1.2, 0.4, fin)]));
  const h = E(0, len / 2 - 1.4, z + 0.2, girth * 0.9, 2.6, girth * 0.85, body);
  P.push(...extra);
  const faces = [
    { kind: "eye", style: eyeStyle, p: [-girth * 0.62, len / 2 - 0.3, z + girth * 0.35], iris },
    { kind: "eye", style: eyeStyle, p: [girth * 0.62, len / 2 - 0.3, z + girth * 0.35], iris, mirror: true },
  ];
  if (mouth) faces.push({ kind: "mouth", style: mouth, p: [0, len / 2 + 0.2, z - girth * 0.3] });
  void h;
  return turn(P, faces, heading);
}
