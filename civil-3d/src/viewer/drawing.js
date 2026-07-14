import * as THREE from 'three';

// 正規化済みCADデータ(loadCadの返り値)から、図面の3Dグループを組み立てる。
// 図面はmm単位・大きな座標なので、m換算(÷1000)して原点中心へ移動し、
// 立てた「シート」として配置する(X=右, Y=上, Z=0)。ユーザーは自由に回転できる。

const PALETTE = [
  0x8fd0ff, 0xffd166, 0x9be89b, 0xff9e9e, 0xc4a6ff, 0xffc08a, 0x7fe3d4, 0xf7a8e0,
  0xb0b8c4, 0xd7e34f, 0x6ec6ff, 0xffb3c1,
];

// レイヤ名→色(決定論的)。特徴的なレイヤは固定色。
function layerColor(name, idx) {
  if (/土留/.test(name)) return 0xff6b6b;
  if (/薬注|薬液/.test(name)) return 0x8ad35a;
  if (/MH|マンホール/.test(name)) return 0x4a9eff;
  if (/寸法/.test(name)) return 0x7f8896;
  if (/文字|補助/.test(name)) return 0xc9b487;
  return PALETTE[idx % PALETTE.length];
}

function textSprite(text, colorHex) {
  const pad = 6;
  const font = 42;
  const cvs = document.createElement('canvas');
  const ctx = cvs.getContext('2d');
  ctx.font = `${font}px system-ui, sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width) + pad * 2;
  const h = font + pad * 2;
  cvs.width = w;
  cvs.height = h;
  ctx.font = `${font}px system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(10,13,18,0.7)';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#' + colorHex.toString(16).padStart(6, '0');
  ctx.textBaseline = 'middle';
  ctx.fillText(text, pad, h / 2);
  const tex = new THREE.CanvasTexture(cvs);
  tex.minFilter = THREE.LinearFilter;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  spr.scale.set((w / h) * 1.2, 1.2, 1);
  return spr;
}

export function buildDrawing(cad) {
  const g = new THREE.Group();
  g.name = 'drawing';
  const b = cad.bbox;
  const cx = (b.minx + b.maxx) / 2;
  const cy = (b.miny + b.maxy) / 2;
  const s = 0.001; // mm → m
  const tf = (p) => new THREE.Vector3((p.x - cx) * s, (p.y - cy) * s, 0);

  const names = Object.keys(cad.layers).sort();
  const colors = {};
  names.forEach((name, i) => {
    const color = layerColor(name, i);
    colors[name] = color;
    const positions = [];
    for (const pl of cad.layers[name].polylines) {
      for (let k = 0; k < pl.length - 1; k++) {
        const a = tf(pl[k]);
        const c = tf(pl[k + 1]);
        positions.push(a.x, a.y, a.z, c.x, c.y, c.z);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const seg = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color }));
    seg.name = `lyr:${name}`;
    g.add(seg);
  });

  // ラベル(テキスト)
  const labels = new THREE.Group();
  labels.name = 'labels';
  for (const t of cad.texts) {
    const spr = textSprite(t.text, colors[t.layer] || 0xdddddd);
    spr.position.copy(tf(t));
    spr.userData = { layer: t.layer };
    labels.add(spr);
  }
  g.add(labels);

  // ワールド系のバウンディング
  const wb = new THREE.Box3(
    new THREE.Vector3((b.minx - cx) * s, (b.miny - cy) * s, -0.5),
    new THREE.Vector3((b.maxx - cx) * s, (b.maxy - cy) * s, 0.5)
  );

  return { group: g, layerNames: names, colors, worldBox: wb };
}
