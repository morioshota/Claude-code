import { Dwg_File_Type, LibreDwg } from '@mlightcad/libredwg-web';
import DxfParser from 'dxf-parser';

// DWG/DXF を読み込み、レイヤ別の線分列とテキストへ正規化する。
// 円・円弧・楕円はポリラインへテッセレーションし、描画をLineSegmentsに統一する。
// 返り値: { layers: {name:{polylines:[[{x,y}]], count}}, texts:[{x,y,text,height}], bbox }

let _libre = null;
async function libre() {
  if (!_libre) {
    const base = (import.meta.env && import.meta.env.BASE_URL) || '/';
    _libre = await LibreDwg.create(`${base}wasm`);
  }
  return _libre;
}

const ARC_SEG = 48; // 円弧の分割数(1周あたり)

function tessArc(cx, cy, r, a0, a1) {
  let span = a1 - a0;
  while (span < 0) span += Math.PI * 2;
  const n = Math.max(2, Math.ceil((span / (Math.PI * 2)) * ARC_SEG));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (span * i) / n;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
}

function tessEllipse(e) {
  const cx = e.center.x;
  const cy = e.center.y;
  const mx = e.majorAxisEndPoint.x;
  const my = e.majorAxisEndPoint.y;
  const ratio = e.axisRatio ?? 1;
  let a0 = e.startAngle ?? 0;
  let a1 = e.endAngle ?? Math.PI * 2;
  let span = a1 - a0;
  if (Math.abs(span) < 1e-6) span = Math.PI * 2;
  const n = ARC_SEG;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = a0 + (span * i) / n;
    const ct = Math.cos(t);
    const st = Math.sin(t);
    // 長軸ベクトル(mx,my), 短軸 = 長軸を90度回転 × ratio
    pts.push({
      x: cx + ct * mx - st * my * ratio,
      y: cy + ct * my + st * mx * ratio,
    });
  }
  return pts;
}

// bulge(ふくらみ)付きポリライン頂点を線分列に展開
function expandPolyline(verts, closed) {
  const pts = [];
  const push = (p) => pts.push({ x: p.x, y: p.y });
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i];
    push(a);
    const isLast = i === verts.length - 1;
    const b = isLast ? verts[0] : verts[i + 1];
    if (isLast && !closed) break;
    const bulge = a.bulge || 0;
    if (Math.abs(bulge) > 1e-6 && b) {
      // bulge = tan(θ/4)。円弧をテッセレーション
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const chord = Math.hypot(dx, dy) || 1;
      const theta = 4 * Math.atan(bulge);
      const r = chord / (2 * Math.sin(theta / 2));
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const dist = r * Math.cos(theta / 2);
      const nx = -dy / chord;
      const ny = dx / chord;
      const cx = mx + nx * dist * Math.sign(bulge);
      const cy = my + ny * dist * Math.sign(bulge);
      const a0 = Math.atan2(a.y - cy, a.x - cx);
      const seg = Math.max(2, Math.ceil((Math.abs(theta) / (Math.PI * 2)) * ARC_SEG));
      for (let k = 1; k < seg; k++) {
        const ang = a0 + (theta * k) / seg;
        push({ x: cx + Math.abs(r) * Math.cos(ang), y: cy + Math.abs(r) * Math.sin(ang) });
      }
    }
  }
  if (closed && pts.length) push(pts[0]);
  return pts;
}

function normalize(entities) {
  const layers = {};
  const texts = [];
  const bbox = { minx: Infinity, miny: Infinity, maxx: -Infinity, maxy: -Infinity };
  const grow = (x, y) => {
    if (x < bbox.minx) bbox.minx = x;
    if (x > bbox.maxx) bbox.maxx = x;
    if (y < bbox.miny) bbox.miny = y;
    if (y > bbox.maxy) bbox.maxy = y;
  };
  const ensure = (name) => {
    const key = name || '0';
    if (!layers[key]) layers[key] = { polylines: [], count: 0 };
    return layers[key];
  };
  const add = (name, pts) => {
    if (pts.length < 2) return;
    ensure(name).polylines.push(pts);
    ensure(name).count++;
    for (const p of pts) grow(p.x, p.y);
  };

  for (const e of entities) {
    switch (e.type) {
      case 'LINE':
        if (e.startPoint && e.endPoint) add(e.layer, [e.startPoint, e.endPoint]);
        break;
      case 'LWPOLYLINE':
      case 'POLYLINE':
        if (e.vertices?.length >= 2) add(e.layer, expandPolyline(e.vertices, (e.flag & 1) === 1));
        break;
      case 'ARC':
        add(e.layer, tessArc(e.center.x, e.center.y, e.radius, e.startAngle, e.endAngle));
        break;
      case 'CIRCLE':
        add(e.layer, tessArc(e.center.x, e.center.y, e.radius, 0, Math.PI * 2));
        break;
      case 'ELLIPSE':
        add(e.layer, tessEllipse(e));
        break;
      case 'TEXT':
      case 'MTEXT': {
        const p = e.insertionPoint || e.startPoint || { x: 0, y: 0 };
        const raw = e.text || '';
        const clean = raw.replace(/\\[A-Za-z0-9.;|]+/g, '').replace(/[{}]/g, '').trim();
        if (clean) {
          texts.push({ x: p.x, y: p.y, text: clean, height: e.textHeight || 80, layer: e.layer });
          grow(p.x, p.y);
        }
        break;
      }
      default:
        break;
    }
  }
  return { layers, texts, bbox };
}

// dxf-parser の出力を正規化用エンティティ配列へ変換。
// (libredwg-web の wasm は DXF読み込みが無効化されているため、DXFはこちらで処理)
function dxfToEntities(text) {
  const parsed = new DxfParser().parseSync(text);
  const out = [];
  for (const e of parsed.entities || []) {
    switch (e.type) {
      case 'LINE':
        if (e.vertices?.length >= 2)
          out.push({ type: 'LINE', layer: e.layer, startPoint: e.vertices[0], endPoint: e.vertices[1] });
        break;
      case 'LWPOLYLINE':
      case 'POLYLINE':
        out.push({ type: 'POLYLINE', layer: e.layer, vertices: e.vertices, flag: e.shape ? 1 : 0 });
        break;
      case 'ARC':
        // dxf-parser は角度をラジアンで返す
        out.push({ type: 'ARC', layer: e.layer, center: e.center, radius: e.radius, startAngle: e.startAngle, endAngle: e.endAngle });
        break;
      case 'CIRCLE':
        out.push({ type: 'CIRCLE', layer: e.layer, center: e.center, radius: e.radius });
        break;
      case 'ELLIPSE':
        out.push({ type: 'ELLIPSE', layer: e.layer, center: e.center, majorAxisEndPoint: e.majorAxisEndPoint, axisRatio: e.axisRatio, startAngle: e.startAngle, endAngle: e.endAngle });
        break;
      case 'TEXT':
      case 'MTEXT':
        out.push({ type: e.type, layer: e.layer, text: e.text, startPoint: e.startPoint, insertionPoint: e.position, textHeight: e.textHeight || e.height });
        break;
      default:
        break;
    }
  }
  return out;
}

// ファイル(ArrayBuffer)を読み込む。拡張子で DWG/DXF を判定。
export async function loadCad(arrayBuffer, filename = '') {
  if (/\.dxf$/i.test(filename)) {
    const text = new TextDecoder().decode(new Uint8Array(arrayBuffer));
    return normalize(dxfToEntities(text));
  }
  const lib = await libre();
  const dwg = lib.dwg_read_data(arrayBuffer, Dwg_File_Type.DWG);
  const db = lib.convert(dwg);
  const result = normalize(db.entities || []);
  lib.dwg_free(dwg);
  return result;
}
