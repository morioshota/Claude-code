// 横断図の半自動ジオリファレンス。
//
// 考え方（スケール不要の最小構成）:
//  - 平面図で断面線の2端点をクリック → 断面の「平面上の位置と向き」を実寸で確定
//  - 横断図で標高既知の2点をクリック＋EL入力 → 図面のy座標→標高(m) の1次写像を確定
//  - 横断図の地盤ラインをトレース → 各点の水平位置は、トレースの左右範囲を
//    平面の断面線に線形割付（断面線＝実際の水平範囲そのもの）、標高は上記写像で決定
//
// これで横断図の縦横スケールが未知でも、平面の断面線と2つのEL基準だけで
// 断面を正しい平面位置・標高スケールへ載せられる。

// 2サンプル (x0→y0, x1→y1) から1次アフィン写像を作る
export function affine1d(x0, y0, x1, y1) {
  const s = (y1 - y0) / ((x1 - x0) || 1);
  return (x) => y0 + (x - x0) * s;
}

// 断面(トレース)を「平面位置(east,north)＋標高(elev)」の3D点列へ変換する。
// trace:  [{x:sx, y:sy}]     図面座標のトレース点列
// vRef:   [{sy, el}, {sy, el}] 標高基準(図面y→標高m)
// planStart/planEnd: {x, y}  平面図の断面線端点(ワールドm)
export function georefSection(trace, vRef, planStart, planEnd) {
  const vMap = affine1d(vRef[0].sy, vRef[0].el, vRef[1].sy, vRef[1].el);
  const sxs = trace.map((p) => p.x);
  const sxMin = Math.min(...sxs);
  const sxMax = Math.max(...sxs);
  const span = sxMax - sxMin || 1;
  const dx = planEnd.x - planStart.x;
  const dy = planEnd.y - planStart.y;
  return trace.map((p) => {
    const f = (p.x - sxMin) / span; // 0(左端)..1(右端)
    return {
      east: planStart.x + dx * f,
      north: planStart.y + dy * f,
      elev: vMap(p.y),
      f,
    };
  });
}

// ジオリファレンス済み断面を共通の f グリッド(0..1)で再サンプルする。
export function resampleByF(section, grid) {
  const s = section.slice().sort((a, b) => a.f - b.f);
  const at = (f) => {
    if (f <= s[0].f) return s[0];
    const last = s[s.length - 1];
    if (f >= last.f) return last;
    for (let i = 1; i < s.length; i++) {
      if (f <= s[i].f) {
        const a = s[i - 1];
        const b = s[i];
        const t = (f - a.f) / ((b.f - a.f) || 1);
        return {
          east: a.east + (b.east - a.east) * t,
          north: a.north + (b.north - a.north) * t,
          elev: a.elev + (b.elev - a.elev) * t,
          f,
        };
      }
    }
    return last;
  };
  return grid.map(at);
}
