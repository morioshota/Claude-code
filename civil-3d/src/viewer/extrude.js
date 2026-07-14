import * as THREE from 'three';

// 平面図でトレースした輪郭(シート座標の点列)を「水平な footprint」と解釈し、
// 深さ方向に押し出して3Dの立坑(土留め/掘削)ソリッドを生成する。
//
// シート座標(sx, sy) → 水平面へ: X=東=sx, Z=北=-sy, Y=標高。
// 天端 topY から depth だけ下方(−Y)へ押し出す。
//
// ring: [{x, y}] (m単位・シート座標) / depth: 深さ(m) / topY: 天端標高(m)
export function buildShaft(ring, depth, opts = {}) {
  const topY = opts.topY ?? 0;
  const color = opts.color ?? 0x4aa3ff;
  const g = new THREE.Group();
  g.name = 'shaft';

  const n = ring.length;
  if (n < 3 || depth <= 0) return g;

  const top = ring.map((p) => new THREE.Vector3(p.x, topY, -p.y));
  const bot = ring.map((p) => new THREE.Vector3(p.x, topY - depth, -p.y));

  // 側壁(各辺の四角形)
  const pos = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const a = top[i];
    const b = top[j];
    const c = bot[j];
    const d = bot[i];
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    pos.push(a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
  }
  // 底版(扇状に三角形分割。おおむね凸な輪郭を想定)
  for (let i = 1; i < n - 1; i++) {
    const a = bot[0];
    const b = bot[i];
    const c = bot[i + 1];
    pos.push(a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      color,
      transparent: true,
      opacity: 0.32,
      side: THREE.DoubleSide,
      roughness: 0.8,
    })
  );
  mesh.name = 'shaft-solid';
  g.add(mesh);

  // 稜線(天端リング・底リング・縦リブ)
  const edgePts = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    edgePts.push(top[i], top[j]); // 天端
    edgePts.push(bot[i], bot[j]); // 底
    edgePts.push(top[i], bot[i]); // 縦
  }
  const edges = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(edgePts),
    new THREE.LineBasicMaterial({ color })
  );
  g.add(edges);

  g.userData = { depth, topY, ring };
  return g;
}

// トレース中のプレビュー用ライン(シート面 z=0 上)
export function buildTraceLine(points, closed = false) {
  const pts = points.map((p) => new THREE.Vector3(p.x, p.y, 0.01));
  if (closed && pts.length > 2) pts.push(pts[0]);
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: 0xffd166 })
  );
  line.name = 'trace-line';
  return line;
}

// 試験掘り(ボーリング柱状図)を3Dの色分け柱として生成する。
// x,z: 平面位置(m, ワールド) / topY: 天端=GL標高(m) / layers:[{name,thickness}]
const SOIL_COLORS = [
  0xb98d4e, 0xd8c37a, 0x8a9a5b, 0x9aa0a6, 0xc9b487, 0x7d7f88, 0xa0785a, 0xcbb27a,
];
export function buildPitColumn(x, z, topY, layers, id = 'TP') {
  const g = new THREE.Group();
  g.name = 'pit';
  const w = 0.5;
  let cursor = topY;
  let total = 0;
  layers.forEach((ly, i) => {
    const th = Math.max(0.01, ly.thickness);
    total += th;
    const color = ly.color ?? SOIL_COLORS[i % SOIL_COLORS.length];
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, th, w),
      new THREE.MeshStandardMaterial({ color, roughness: 1 })
    );
    mesh.position.set(x, cursor - th / 2, z);
    mesh.userData = { pit: id, layer: ly.name, thickness: th };
    g.add(mesh);
    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry),
      new THREE.LineBasicMaterial({ color: 0x1a1e26 })
    );
    edge.position.copy(mesh.position);
    g.add(edge);
    cursor -= th;
  });
  // 天端のピン
  const pin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 1.6, 8),
    new THREE.MeshBasicMaterial({ color: 0xff5d5d })
  );
  pin.position.set(x, topY + 0.8, z);
  g.add(pin);
  g.userData = { id, x, z, depth: total, layers };
  return g;
}

// トレース点マーカー
export function buildTraceDots(points) {
  const g = new THREE.Group();
  g.name = 'trace-dots';
  for (const p of points) {
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffd166 })
    );
    dot.position.set(p.x, p.y, 0.02);
    g.add(dot);
  }
  return g;
}
