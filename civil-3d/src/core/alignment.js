// 線形(平面センターライン)モデル。
// 入力: 平面座標の点列 [{x, y}]  (x=東 / y=北、単位m)
// 提供: 追加距離(chainage)による位置引き当てと、その点での接線/法線。
// オフセットの符号は「進行方向の左が正」。
export function makeAlignment(points) {
  const pts = points.map((p) => ({ x: p.x, y: p.y }));
  if (pts.length < 2) throw new Error('alignment needs >= 2 points');

  const chain = [0];
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x;
    const dy = pts[i].y - pts[i - 1].y;
    chain.push(chain[i - 1] + Math.hypot(dx, dy));
  }
  const length = chain[chain.length - 1];

  // 追加距離 station における中心点と方向ベクトル
  function locate(station) {
    const s = Math.max(0, Math.min(length, station));
    let i = 1;
    while (i < chain.length - 1 && chain[i] < s) i++;
    const i0 = i - 1;
    const i1 = i;
    const seg = chain[i1] - chain[i0] || 1;
    const t = (s - chain[i0]) / seg;
    const x = pts[i0].x + (pts[i1].x - pts[i0].x) * t;
    const y = pts[i0].y + (pts[i1].y - pts[i0].y) * t;
    let tx = pts[i1].x - pts[i0].x;
    let ty = pts[i1].y - pts[i0].y;
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    // 左法線 = 接線を+90度回転 (-ty, tx)
    return { x, y, tx, ty, nx: -ty, ny: tx, station: s };
  }

  // オフセット位置の平面座標
  function offsetPoint(station, offset) {
    const l = locate(station);
    return { x: l.x + l.nx * offset, y: l.y + l.ny * offset };
  }

  return { points: pts, chainage: chain, length, locate, offsetPoint };
}
