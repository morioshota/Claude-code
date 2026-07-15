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

// 構造物(MH・カルバート等)を半透明ボックスで生成し、当たり確認に使う。
// x,z: 平面中心(m) / w,l,h: 幅(東西)・奥行(南北)・高さ(m) / sink: GLから天端までの下がり(m)
export function buildStructureBox(x, z, w, l, h, sink, opts = {}) {
  const color = opts.color ?? 0x9fb2c9;
  const g = new THREE.Group();
  g.name = 'structure';
  const centerY = -sink - h / 2; // GL(0)から sink 下げた位置に天端
  const geo = new THREE.BoxGeometry(w, h, l);
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      color,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      roughness: 0.6,
    })
  );
  mesh.position.set(x, centerY, z);
  if (opts.rotation) mesh.rotation.y = opts.rotation;
  g.add(mesh);
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color: 0xcfe0f5 })
  );
  edges.position.copy(mesh.position);
  edges.rotation.copy(mesh.rotation);
  g.add(edges);
  g.userData = { ...opts.meta, x, z, w, l, h, sink };
  return g;
}

// 埋設管(ガス・水道・下水等の企業者管)。平面ルート(シート座標)と土被りDPから円管を生成。
// route: [{x,y}] シート座標(m) / dia: 管径(m) / dp1,dp2: 始点・終点の土被り(m, GL→管天端)
// 土被りは延長に沿って線形補間する(DP=1150〜970 のような勾配付きに対応)。
export function buildPipeRun(route, opts = {}) {
  const dia = opts.dia ?? 0.1;
  const r = dia / 2;
  const dp1 = opts.dp1 ?? 0.6;
  const dp2 = opts.dp2 ?? dp1;
  const color = opts.color ?? 0x35c04a;
  const g = new THREE.Group();
  g.name = 'pipe';
  if (route.length < 2) return g;

  const cum = [0];
  for (let i = 1; i < route.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(route[i].x - route[i - 1].x, route[i].y - route[i - 1].y));
  }
  const L = cum[cum.length - 1] || 1;
  const centers = route.map((p, i) => {
    const dp = dp1 + (dp2 - dp1) * (cum[i] / L);
    return new THREE.Vector3(p.x, -(dp + r), -p.y); // 管天端がGL-dp
  });

  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.1 });
  const up = new THREE.Vector3(0, 1, 0);
  const head = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 12), mat);
  head.position.copy(centers[0]);
  head.userData = opts.meta || {};
  g.add(head);
  for (let i = 0; i < centers.length - 1; i++) {
    const a = centers[i];
    const b = centers[i + 1];
    const len = a.distanceTo(b);
    if (len < 1e-6) continue;
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 16), mat);
    cyl.position.copy(a).add(b).multiplyScalar(0.5);
    cyl.quaternion.setFromUnitVectors(up, b.clone().sub(a).normalize());
    cyl.userData = opts.meta || {};
    g.add(cyl);
    const joint = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 12), mat);
    joint.position.copy(b);
    joint.userData = opts.meta || {};
    g.add(joint);
  }
  g.userData = { ...(opts.meta || {}), route, dia, dp1, dp2 };
  return g;
}

// 土留め壁(矢板等)。平面の開いたルートに沿って、GL(0)から深さ分の薄い壁を立てる。
// 立坑(閉じた輪郭)と違い、直線・L字などの開いた並びに使う。
export function buildWallRun(route, depth, opts = {}) {
  const color = opts.color ?? 0xff6b6b;
  const g = new THREE.Group();
  g.name = 'wall';
  if (route.length < 2 || depth <= 0) return g;
  const top = route.map((p) => new THREE.Vector3(p.x, 0, -p.y));
  const bot = route.map((p) => new THREE.Vector3(p.x, -depth, -p.y));
  const pos = [];
  for (let i = 0; i < route.length - 1; i++) {
    const a = top[i];
    const b = top[i + 1];
    const c = bot[i + 1];
    const d = bot[i];
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    pos.push(a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      color,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      roughness: 0.8,
    })
  );
  mesh.userData = opts.meta || {};
  g.add(mesh);
  const edgePts = [];
  for (let i = 0; i < route.length - 1; i++) {
    edgePts.push(top[i], top[i + 1], bot[i], bot[i + 1]);
  }
  for (let i = 0; i < route.length; i++) edgePts.push(top[i], bot[i]);
  g.add(
    new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(edgePts),
      new THREE.LineBasicMaterial({ color })
    )
  );
  g.userData = { ...(opts.meta || {}), route, depth };
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
