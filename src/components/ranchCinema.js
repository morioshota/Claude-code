/* 牧場のHD-2D風「シネマ」仕上げ(2026-09 試作)。
   ドット絵はそのままに、写真のような空気感を後から重ねる:
     1) 被写界深度(ティルトシフト) … 画面の上下だけをぼかして「模型を撮った」ように見せる
     2) ブルーム … 明るい所(窓のあかり・炎・空)がにじんで光る
     3) 光の筋・遠景のもや・周辺減光・浮遊する光の粒(夜はホタル)
   そのうえに 4) 注釈ラベル(細い線でつないだガラス調の札)を、ぼかさずにくっきり描く。

   ⚠ ぼかし・ブルームは「縮小→拡大」の画像処理で作る。ctx.filter("blur") は
     iOS Safari で効かない端末があるので使わないこと。
   ⚠ 株価・市場は演出に一切絡めない(季節・時間帯・天気だけ。不変条件5) */

export const CINEMA_KEY = "kabu-ranch-cinema";
export const cinemaSaved = () => { try { return localStorage.getItem(CINEMA_KEY) !== "0"; } catch (e) { return true; } };
export const saveCinema = (on) => { try { localStorage.setItem(CINEMA_KEY, on ? "1" : "0"); } catch (e) { /* 保存不可でも動く */ } };

const mk = () => { const c = document.createElement("canvas"); return { c, x: c.getContext("2d") }; };
const fit = (b, w, h) => { if (b.c.width !== w || b.c.height !== h) { b.c.width = w; b.c.height = h; } };

export function createCinema() {
  const b1 = mk(), b2 = mk(), glow = mk(), dof = mk();
  // 浮遊する光の粒。手前(大きくぼけた玉)と奥(小さな粒)の2層
  const motes = Array.from({ length: 18 }, (_, k) => ({
    x: Math.random(), y: Math.random(), r: k < 5 ? 10 + Math.random() * 14 : 1.2 + Math.random() * 2.2,
    near: k < 5, v: 0.004 + Math.random() * 0.01, ph: Math.random() * 6.28,
  }));

  /* 世界を描き終えたあとに呼ぶ。canvasは実ピクセル(dpr込み)で扱う */
  const apply = (ctx, canvas, { cw, chh, dpr, phase, rainy, now, reduced, skyHex }) => {
    const W = canvas.width, H = canvas.height;
    const w1 = Math.max(2, Math.round(W / 4)), h1 = Math.max(2, Math.round(H / 4));
    const w2 = Math.max(2, Math.round(W / 10)), h2 = Math.max(2, Math.round(H / 10));
    fit(b1, w1, h1); fit(b2, w2, h2); fit(glow, w2, h2); fit(dof, w1, h1);

    // 縮小2段 = 安くてなめらかなぼかし
    b1.x.imageSmoothingEnabled = true; b1.x.clearRect(0, 0, w1, h1); b1.x.drawImage(canvas, 0, 0, w1, h1);
    b2.x.imageSmoothingEnabled = true; b2.x.clearRect(0, 0, w2, h2); b2.x.drawImage(b1.c, 0, 0, w2, h2);

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;

    // 1) 被写界深度: ぼかした絵を、上下ほど濃くなるマスクで重ねる(中央の帯だけピントが合う)
    dof.x.globalCompositeOperation = "source-over";
    dof.x.clearRect(0, 0, w1, h1);
    dof.x.imageSmoothingEnabled = true;
    dof.x.drawImage(b2.c, 0, 0, w1, h1);
    dof.x.globalCompositeOperation = "destination-in";
    const m = dof.x.createLinearGradient(0, 0, 0, h1);
    m.addColorStop(0, "rgba(0,0,0,.95)"); m.addColorStop(0.3, "rgba(0,0,0,0)");
    m.addColorStop(0.7, "rgba(0,0,0,0)"); m.addColorStop(1, "rgba(0,0,0,.9)");
    dof.x.fillStyle = m; dof.x.fillRect(0, 0, w1, h1);
    dof.x.globalCompositeOperation = "source-over";
    ctx.drawImage(dof.c, 0, 0, W, H);

    // 2a) 夜・夕方は世界を一段沈める(HD-2Dの夜)。明かりは次のブルームで戻る
    if (phase !== "day") {
      ctx.globalCompositeOperation = "multiply";
      ctx.fillStyle = phase === "night" ? "rgb(92,104,160)" : "rgb(210,170,165)";
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "source-over";
    }

    // 2b) ブルーム: 明るさを何度も掛け合わせて暗部を消し(=明るい所だけ残し)、スクリーン合成。
    //     ⚠ 掛け合わせが足りないと画面全体が白っぽく持ち上がる(試作1回目で踏んだ)
    glow.x.globalCompositeOperation = "source-over";
    glow.x.clearRect(0, 0, w2, h2);
    glow.x.drawImage(b2.c, 0, 0);
    glow.x.globalCompositeOperation = "multiply";
    const passes = phase === "day" ? 4 : 3;
    for (let k = 0; k < passes; k++) glow.x.drawImage(b2.c, 0, 0);
    glow.x.globalCompositeOperation = "source-over";
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = phase === "night" ? 1 : phase === "dusk" ? 0.8 : 0.2;
    ctx.drawImage(glow.c, 0, 0, W, H);
    if (phase === "night") ctx.drawImage(glow.c, 0, 0, W, H); // 夜の明かりはもう一段にじませる
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.restore();

    // ここからはCSSピクセル座標
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 3a) 遠景のもや(空気遠近法): 奥=画面上ほど空の色に溶ける
    const haze = ctx.createLinearGradient(0, 0, 0, chh * 0.45);
    haze.addColorStop(0, hexA(skyHex, rainy ? 0.4 : phase === "night" ? 0.18 : 0.26));
    haze.addColorStop(1, hexA(skyHex, 0));
    ctx.fillStyle = haze; ctx.fillRect(0, 0, cw, chh * 0.45);

    // 3b) 光の筋(ひる・ゆうがた・晴れのときだけ)
    if (phase !== "night" && !rainy) {
      ctx.globalCompositeOperation = "screen";
      const warm = phase === "dusk" ? "255,190,120" : "255,248,220";
      for (let k = 0; k < 4; k++) {
        const sway = reduced ? 0 : Math.sin(now / 5200 + k * 1.7);
        const a = (0.13 + 0.06 * sway) * (phase === "dusk" ? 1.3 : 1);
        ctx.save();
        ctx.translate(cw * (0.08 + k * 0.17) + sway * 12, -40);
        ctx.rotate(0.52);
        const bw = 26 + k * 14;
        const g = ctx.createLinearGradient(-bw, 0, bw, 0);
        g.addColorStop(0, `rgba(${warm},0)`); g.addColorStop(0.5, `rgba(${warm},${a.toFixed(3)})`); g.addColorStop(1, `rgba(${warm},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(-bw, 0, bw * 2, chh * 1.6);
        ctx.restore();
      }
      ctx.globalCompositeOperation = "source-over";
    }

    // 3c) 浮遊する光の粒(夜はホタル色)。手前の大きな玉はぼけた光として淡く
    ctx.globalCompositeOperation = "screen";
    const col = phase === "night" ? "200,255,150" : phase === "dusk" ? "255,200,140" : "255,250,225";
    motes.forEach((p) => {
      if (!reduced) { p.y -= p.v * 0.016; p.x += Math.sin(now / 2400 + p.ph) * 0.0006; if (p.y < -0.05) { p.y = 1.05; p.x = Math.random(); } }
      const px = p.x * cw, py = p.y * chh;
      const tw = phase === "night" ? 0.35 + 0.65 * Math.abs(Math.sin(now / 700 + p.ph)) : 1;
      const a = (p.near ? 0.10 : phase === "night" ? 0.9 : 0.45) * tw;
      const g = ctx.createRadialGradient(px, py, 0, px, py, p.r * (p.near ? 1 : 2.4));
      g.addColorStop(0, `rgba(${col},${a.toFixed(3)})`);
      g.addColorStop(p.near ? 0.7 : 0.35, `rgba(${col},${(a * (p.near ? 0.6 : 0.35)).toFixed(3)})`);
      g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g;
      const rr = p.r * (p.near ? 1 : 2.4);
      ctx.fillRect(px - rr, py - rr, rr * 2, rr * 2);
    });
    ctx.globalCompositeOperation = "source-over";

    // 3d) 周辺減光
    const vg = ctx.createRadialGradient(cw / 2, chh * 0.52, Math.min(cw, chh) * 0.35, cw / 2, chh * 0.52, Math.max(cw, chh) * 0.78);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, `rgba(4,6,18,${phase === "night" ? 0.6 : 0.42})`);
    ctx.fillStyle = vg; ctx.fillRect(0, 0, cw, chh);
    ctx.restore();
  };

  return { apply };
}

const hexA = (hex, a) => {
  const h = String(hex).replace("#", "");
  if (h.length !== 6) return `rgba(200,220,240,${a})`;
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
};

/* ---- 注釈ラベル(細い線でつないだガラス調の札) ----
   items: [{ x, y, title, sub, accent }] … x,y は指し示す点(CSSピクセル)。
   札どうしが重なるときは上へ逃がす。ぼかしの後に描くので常にくっきり */
export function drawCallouts(ctx, items, cw, chh) {
  const placed = [];
  const sorted = [...items].sort((a, b) => b.y - a.y); // 手前(下)から置く
  sorted.forEach((it) => {
    ctx.font = "bold 11px 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', sans-serif";
    const tw = ctx.measureText(it.title).width;
    ctx.font = "10px 'DotGothic16', ui-monospace, monospace";
    const sw = it.sub ? ctx.measureText(it.sub).width : 0;
    const w = Math.ceil(16 + tw + (it.sub ? 8 + sw : 0) + 8), h = 20;
    let lx = Math.max(4, Math.min(cw - w - 4, it.x - w / 2));
    let ly = it.y - 30 - h;
    for (let k = 0; k < 6; k++) {
      const hit = placed.find((p) => lx < p.x + p.w + 4 && lx + w + 4 > p.x && ly < p.y + p.h + 3 && ly + h + 3 > p.y);
      if (!hit) break;
      ly = hit.y - h - 5;
    }
    if (it.y < 0 || it.y > chh + 40 || it.x < -40 || it.x > cw + 40) return; // 指す点が画面外なら出さない
    if (ly < 4) ly = it.y + 14; // 上に場所がなければ点の下に出す(画面の上端で消えないように)
    placed.push({ x: lx, y: ly, w, h });

    // 指し示す点と細い線
    ctx.strokeStyle = "rgba(235,242,255,.75)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(it.x + 0.5, it.y); ctx.lineTo(it.x + 0.5, ly > it.y ? ly : ly + h); ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.arc(it.x + 0.5, it.y, 2.2, 0, 6.29); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.25)";
    ctx.beginPath(); ctx.arc(it.x + 0.5, it.y, 5, 0, 6.29); ctx.fill();

    // ガラス調の札
    const r = 6;
    ctx.fillStyle = "rgba(10,14,30,.66)";
    ctx.strokeStyle = "rgba(255,255,255,.28)";
    ctx.beginPath();
    ctx.moveTo(lx + r, ly); ctx.arcTo(lx + w, ly, lx + w, ly + h, r); ctx.arcTo(lx + w, ly + h, lx, ly + h, r);
    ctx.arcTo(lx, ly + h, lx, ly, r); ctx.arcTo(lx, ly, lx + w, ly, r); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.10)"; ctx.fillRect(lx + r, ly + 1, w - r * 2, 1); // 上辺のハイライト
    ctx.fillStyle = it.accent || "#7dd3fc";
    ctx.beginPath(); ctx.arc(lx + 9, ly + h / 2, 2.4, 0, 6.29); ctx.fill();
    ctx.fillStyle = "#f2f6ff";
    ctx.font = "bold 11px 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText(it.title, lx + 16, ly + h / 2 + 0.5);
    if (it.sub) {
      ctx.fillStyle = "rgba(190,205,235,.85)";
      ctx.font = "10px 'DotGothic16', ui-monospace, monospace";
      ctx.fillText(it.sub, lx + 16 + tw + 8, ly + h / 2 + 0.5);
    }
    ctx.textBaseline = "alphabetic";
  });
}
