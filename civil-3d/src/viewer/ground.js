import * as THREE from 'three';
import { toWorld } from './coords.js';
import { resampleByF } from '../core/georef.js';

// ジオリファレンス済み断面(1本)を3Dの折れ線として生成。
export function buildSectionLine(sectionWorld, color = 0x6ec6ff) {
  const pts = sectionWorld.map((p) => toWorld(p.east, p.north, p.elev));
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color })
  );
  line.name = 'section-line';
  return line;
}

// 複数の断面から現況地盤サーフェスを生成(共通fグリッドで再サンプルしてロフト)。
// sections: [[{east,north,elev,f}], ...]  平面上の並び順で渡す
export function buildGroundSurface(sections, opts = {}) {
  const g = new THREE.Group();
  g.name = 'ground';
  const valid = sections.filter((s) => s && s.length >= 2);
  if (valid.length < 2) {
    // 1本のときは断面線だけ
    if (valid.length === 1) g.add(buildSectionLine(valid[0]));
    return g;
  }
  const N = opts.grid || 24;
  const grid = Array.from({ length: N + 1 }, (_, i) => i / N);
  const rows = valid.map((s) => resampleByF(s, grid));
  const nS = rows.length;
  const nG = grid.length;

  const pos = [];
  for (const row of rows) {
    for (const p of row) {
      const v = toWorld(p.east, p.north, p.elev);
      pos.push(v.x, v.y, v.z);
    }
  }
  const idx = [];
  for (let i = 0; i < nS - 1; i++) {
    for (let j = 0; j < nG - 1; j++) {
      const a = i * nG + j;
      const b = a + 1;
      const c = a + nG;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  g.add(
    new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        color: 0x6f7f5a,
        roughness: 0.95,
        side: THREE.DoubleSide,
      })
    )
  );
  // 各断面線も重ねて表示
  for (const s of valid) g.add(buildSectionLine(s, 0x9fd0ff));
  return g;
}
