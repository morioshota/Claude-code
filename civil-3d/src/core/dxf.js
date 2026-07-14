import DxfParser from 'dxf-parser';

// DXFテキストを解析し、レイヤ別に「線オブジェクト(点列)」へ正規化する。
// 対応エンティティ: LINE / LWPOLYLINE / POLYLINE。
// 返り値: { layers: { [name]: { polylines: [[{x,y}]], count } }, raw }
export function parseDxf(text) {
  const parser = new DxfParser();
  const raw = parser.parseSync(text);
  const layers = {};
  const ensure = (name) => {
    const key = name || '0';
    if (!layers[key]) layers[key] = { polylines: [], count: 0 };
    return layers[key];
  };

  for (const e of raw.entities || []) {
    const L = ensure(e.layer);
    if (e.type === 'LINE' && e.vertices?.length >= 2) {
      L.polylines.push(e.vertices.map((v) => ({ x: v.x, y: v.y })));
      L.count++;
    } else if ((e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') && e.vertices?.length >= 2) {
      L.polylines.push(e.vertices.map((v) => ({ x: v.x, y: v.y })));
      L.count++;
    }
  }
  return { layers, raw };
}

// レイヤ内で最も頂点数の多いポリラインを線形候補として返す。
export function longestPolyline(layer) {
  let best = null;
  for (const pl of layer.polylines) {
    if (!best || pl.length > best.length) best = pl;
  }
  return best;
}
