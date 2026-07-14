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
