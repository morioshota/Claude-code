/* 牧場の地面を1pxずつ描く(2026-09末)。
   以前は「タイルのひし形を市松に塗る＋草の点を散らす」だけで、建物・木・柵(3D方式)に比べて
   地面だけが素朴すぎた(オーナー指摘)。いまは画素ごとに「どのタイルの上か」を逆算し、
   地面の種類ごとに質感を描く:
     草地   … 大小2段のまだら模様＋4段の色＋ディザ、ところどころ草の穂(春は花)
     森     … 暗めの土と苔、落ち葉
     みち   … 土の色むら＋小石(上に光)
     床     … 研究所の石畳(ずらした石積み・目地・石ごとの色の揺らぎ)
     畑     … 畝(うね)の筋
     池     … 水面の揺らぎ＋岸の明るい縁、まわりは砂浜
   境目はタイルの判定位置をノイズで少し揺らして、自然な「きわ」にする(畑・床は揺らさない)。
   さらに地面の手前2辺に土の断面(草のふち・土・石の層)を付け、ジオラマのような厚みを出す。
   ⚠ すべて決定論的(位置のハッシュ)なので、開くたびに模様が変わることはない。株価は一切絡めない */

const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
const mul = (a, f) => [a[0] * f, a[1] * f, a[2] * f];

/* 格子点の擬似乱数と、なめらかな値ノイズ */
const h2 = (x, y, s = 0) => { let n = (x * 374761393 + y * 668265263 + s * 982451653) | 0; n = (n ^ (n >>> 13)) * 1274126177; n ^= n >>> 16; return (n >>> 0) / 4294967296; };
const smooth = (t) => t * t * (3 - 2 * t);
const vnoise = (x, y, s) => {
  const xi = Math.floor(x), yi = Math.floor(y), xf = smooth(x - xi), yf = smooth(y - yi);
  const a = h2(xi, yi, s), b = h2(xi + 1, yi, s), c = h2(xi, yi + 1, s), d = h2(xi + 1, yi + 1, s);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
};
const BAYER4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]].map((r) => r.map((v) => v / 16 - 0.47));

/**
 * @param g        地面キャンバスの2Dコンテキスト(描画先)
 * @param opts     { N, ox, oy, TW, TH, W, H, season, typeAt(i,j)->{type, base?} }
 *   type: "grass" | "wild" | "forest" | "path" | "floor" | "field" | "pond"
 */
export function paintGround(g, opts) {
  const { N, ox, oy, TW, TH, W, H, season, typeAt } = opts;
  const img = g.createImageData(W, H);
  const d = img.data;
  const hw = TW / 2, hh = TH / 2;
  const winter = season.key === "winter";
  const soilTop = winter ? hex("#e8eef0") : hex("#6a4a2c");
  const DEPTH = 16; // 地面の厚み(ジオラマの断面)
  const put = (x, y, c) => { const k = (y * W + x) * 4; d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = 255; };
  const typeCache = new Map();
  const tAt = (i, j) => {
    const key = i * 4096 + j;
    let v = typeCache.get(key);
    if (!v) { v = (i < 0 || j < 0 || i >= N || j >= N) ? null : typeAt(i, j); typeCache.set(key, v); }
    return v;
  };
  const grassPal = (baseHex) => { const b = hex(baseHex); return [mul(b, 0.78), mul(b, 0.9), b, mix(b, [255, 250, 210], 0.14)]; };
  const palCache = new Map();
  const palOf = (baseHex) => { let p = palCache.get(baseHex); if (!p) { p = grassPal(baseHex); palCache.set(baseHex, p); } return p; };
  const DIRT = [hex("#b8966a"), hex("#c9a878"), hex("#d6b88a"), hex("#e2c89c")];
  const PEBBLE = hex("#8c7a64"), PEBBLE_HI = hex("#efe2c6");
  const STONE = [hex("#a9a392"), hex("#b8b2a0"), hex("#c6c0ad"), hex("#d2ccb8")];
  const MORTAR = hex("#857f70");
  const SOIL = [hex("#5a3f22"), hex("#6b4e2c"), hex("#7a5a33")];
  const WATER = [hex("#2f7fb0"), hex("#3d94c4"), hex("#4aa8d8")];
  const SAND = [hex("#c9b98c"), hex("#d4c498"), hex("#e0d2a8")];
  const leafC = hex(season.leaf), leafHi = hex(season.leafHi);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x - ox, dy = y - oy;
      const fi = (dx / hw + dy / hh) / 2, fj = (dy / hh - dx / hw) / 2; // 地面上の座標(タイル単位)
      const ti0 = Math.round(fi), tj0 = Math.round(fj);
      const inside = fi > -0.5 && fj > -0.5 && fi < N - 0.5 && fj < N - 0.5;
      if (!inside) {
        // ---- 手前2辺の土の断面 ----
        // 手前2辺(下の頂点の左右)の真下なら断面。ふちの高さは式で求める(1pxずつ探すと遅い)
        const adx = Math.abs(dx) / hw;
        if (adx > 2 * N - 1) continue;
        const yb = oy + hh * (2 * N - 1 - adx);
        const top = y - yb <= 0 || y - yb > DEPTH ? -1 : Math.ceil(y - yb);
        if (top < 0) continue;
        const right = dx > 0; // 下の頂点より右=右手前の面(明るい)、左=左手前の面(暗い)
        const face = right ? 1.0 : 0.82;
        let c;
        if (top <= 2) c = winter ? hex("#f4f8fa") : mul(hex(season.wild), 0.85);          // 草のふち
        else if (top <= 9) c = mix(soilTop, mul(soilTop, 0.8), vnoise(x / 3, y / 2, 7));   // 土
        else c = mix(hex("#6e675c"), hex("#8d8577"), vnoise(x / 4, y / 3, 8));              // 石の層
        if (top > 3 && h2(x >> 1, y >> 1, 9) < 0.06) c = mix(c, [40, 30, 20], 0.35);        // 小石の影
        if (top === DEPTH) c = mul(c, 0.7);
        put(x, y, mul(c, face));
        continue;
      }
      // タイルの判定を少し揺らして、境目を自然に(畑・床・池は揺らさない)
      const nb = tAt(ti0, tj0);
      let t = nb;
      // ゆらしはタイルのふち付近だけ(真ん中は判定が変わらないので計算しない)
      if (nb && nb.type !== "field" && nb.type !== "floor" && nb.type !== "pond" && Math.max(Math.abs(fi - ti0), Math.abs(fj - tj0)) > 0.26) {
        const jx = (vnoise(fi * 3.1, fj * 3.1, 11) - 0.5) * 0.5, jy = (vnoise(fi * 3.1 + 17, fj * 3.1, 12) - 0.5) * 0.5;
        const alt = tAt(Math.round(fi + jx), Math.round(fj + jy));
        if (alt && alt.type !== "field" && alt.type !== "floor" && alt.type !== "pond") t = alt;
      }
      if (!t) continue;
      const u = fi * 16, v = fj * 16; // 地面上の細かい座標(1タイル=16)
      const dith = BAYER4[y & 3][x & 3];
      let c;
      switch (t.type) {
        case "path": {
          const n = vnoise(u / 5, v / 5, 21) * 0.7 + vnoise(u / 1.6, v / 1.6, 22) * 0.3 + dith * 0.18;
          c = DIRT[Math.max(0, Math.min(3, Math.floor(n * 4)))];
          const pc = h2(Math.floor(u / 2.2), Math.floor(v / 2.2), 23);
          if (pc < 0.05) c = PEBBLE; else if (pc < 0.058) c = PEBBLE_HI;
          // わだち(みちの中央を通る2本の筋)
          const fr = fj - Math.round(fj);
          if (Math.abs(Math.abs(fr) - 0.22) < 0.035) c = mul(c, 0.9);
          break;
        }
        case "floor": {
          // ずらした石積み: 行ごとに半分ずらす
          const su = u / 5.2, sv = v / 4;
          const row = Math.floor(sv), off = row % 2 ? 0.5 : 0;
          const col = Math.floor(su + off);
          const fu = su + off - col, fv = sv - row;
          const edge = Math.min(fu, 1 - fu, fv, 1 - fv);
          const tone = h2(col, row, 31);
          c = STONE[Math.min(3, Math.floor(tone * 4))];
          if (edge < 0.09) c = MORTAR;
          else if (fu < 0.2 || fv < 0.2) c = mix(c, [255, 255, 240], 0.12); // 石の左上に光
          else if (fu > 0.84 || fv > 0.82) c = mul(c, 0.9);
          if (winter && vnoise(u / 3, v / 3, 32) > 0.62) c = mix(c, [245, 250, 252], 0.7);
          break;
        }
        case "field": {
          const fr = (fj * 4) % 1;
          c = fr < 0.3 ? SOIL[0] : fr < 0.55 ? SOIL[2] : SOIL[1]; // 畝の谷・峰・斜面
          if (h2(Math.floor(u), Math.floor(v), 41) < 0.08) c = mul(c, 1.12);
          if (winter && vnoise(u / 3, v / 3, 42) > 0.5) c = mix(c, [240, 246, 248], 0.75);
          break;
        }
        case "pond": {
          // 岸からの距離: 隣のタイルが池でない方向の近さ
          const fi0 = fi - ti0, fj0 = fj - tj0;
          const nearEdge = Math.min(
            tAt(ti0 + 1, tj0) && tAt(ti0 + 1, tj0).type === "pond" ? 1 : 0.5 - fi0,
            tAt(ti0 - 1, tj0) && tAt(ti0 - 1, tj0).type === "pond" ? 1 : 0.5 + fi0,
            tAt(ti0, tj0 + 1) && tAt(ti0, tj0 + 1).type === "pond" ? 1 : 0.5 - fj0,
            tAt(ti0, tj0 - 1) && tAt(ti0, tj0 - 1).type === "pond" ? 1 : 0.5 + fj0);
          if (nearEdge < 0.12) { c = SAND[1 + (h2(x, y, 51) < 0.3 ? 1 : 0)]; break; }
          const depth = Math.min(1, nearEdge * 1.6);
          c = mix(WATER[2], WATER[0], depth);
          if (nearEdge < 0.18) c = mix(c, [230, 245, 255], 0.35); // 岸の白い縁
          const rip = Math.sin(u * 0.9 + vnoise(u / 6, v / 6, 52) * 6) * Math.sin(v * 0.35);
          if (rip > 0.93) c = mix(c, [200, 235, 250], 0.6);
          if (winter) c = mix(c, [210, 230, 240], 0.55); // 冬は薄氷
          break;
        }
        default: { // grass / wild / forest
          const pal = palOf(t.base);
          const big = vnoise(u / 14, v / 14, t.type === "forest" ? 61 : 62);
          const small = vnoise(u / 4, v / 4, 63);
          const n = big * 0.62 + small * 0.38 + dith * 0.2;
          c = pal[Math.max(0, Math.min(3, Math.floor(n * 4.2 - 0.4)))];
          const hb = h2(Math.floor(u / 1.6), Math.floor(v / 1.6), 64);
          if (t.type === "forest") {
            if (hb < 0.07) c = mix(c, leafC, 0.55);                 // 落ち葉
            else if (hb < 0.1) c = mix(c, leafHi, 0.45);
            else if (vnoise(u / 3, v / 3, 65) > 0.72) c = mul(c, 0.86); // 苔の陰
          } else if (!winter) {
            // 草の穂: 画面の縦方向に2〜3pxの濃い筋＋明るい先
            const bx = x % 5, by = y % 6, cell = h2(Math.floor(x / 5), Math.floor(y / 6), 66);
            if (cell < 0.22 && bx === 2 && by >= 2 && by <= 4) c = by === 2 ? pal[3] : pal[0];
            if (season.key === "spring" && t.type !== "grass" && cell > 0.985 && bx === 2 && by === 3) c = [255, 209, 102];
            if (season.key === "spring" && t.type !== "grass" && cell > 0.975 && cell <= 0.985 && bx === 2 && by === 3) c = [255, 143, 179];
          } else if (hb < 0.05) c = mix(c, [150, 170, 165], 0.4);  // 雪から出た草
        }
      }
      put(x, y, c);
    }
  }
  g.putImageData(img, 0, 0);
}
