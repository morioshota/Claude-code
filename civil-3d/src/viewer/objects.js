import * as THREE from 'three';
import { toWorld } from './coords.js';
import { buildCorridorGeometry } from '../core/corridor.js';

// 断面と線形から各3Dオブジェクトを組み立て、名前付きグループで返す。
// レイヤ表示切替は group.visible で行う。

export function buildCorridor(alignment, sections) {
  const g = new THREE.Group();
  g.name = 'corridor';
  const geo = buildCorridorGeometry(alignment, sections, { offsetStep: 0.5 });
  if (!geo) return g;

  const surf = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      color: 0x6f7f5a,
      roughness: 0.95,
      metalness: 0,
      side: THREE.DoubleSide,
      flatShading: false,
    })
  );
  surf.name = 'surface';
  g.add(surf);

  const wire = new THREE.LineSegments(
    new THREE.WireframeGeometry(geo),
    new THREE.LineBasicMaterial({ color: 0x33507a, transparent: true, opacity: 0.35 })
  );
  wire.name = 'wire';
  wire.visible = false;
  g.add(wire);
  return g;
}

export function buildAlignmentLine(alignment, sections) {
  const g = new THREE.Group();
  g.name = 'alignment';
  // 中心線を計画高付近(各断面の中心z)に沿わせる
  const zAt = (st) => {
    let best = sections[0];
    for (const s of sections) if (Math.abs(s.station - st) < Math.abs(best.station - st)) best = s;
    const mid = best.profile.reduce((a, p) => (Math.abs(p.offset) < Math.abs(a.offset) ? p : a));
    return mid.z + 0.05;
  };
  const pts = [];
  for (let st = 0; st <= alignment.length; st += 2) {
    const l = alignment.locate(st);
    pts.push(toWorld(l.x, l.y, zAt(st)));
  }
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: 0xffd166 })
  );
  g.add(line);
  return g;
}

export function buildSectionLines(alignment, sections) {
  const g = new THREE.Group();
  g.name = 'sections';
  const mat = new THREE.LineBasicMaterial({ color: 0x6ec6ff, transparent: true, opacity: 0.65 });
  for (const s of sections) {
    const loc = alignment.locate(s.station);
    const pts = s.profile
      .slice()
      .sort((a, b) => a.offset - b.offset)
      .map((p) => toWorld(loc.x + loc.nx * p.offset, loc.y + loc.ny * p.offset, p.z + 0.02));
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
  }
  return g;
}

// 試験掘り: 土層を色分けした縦の柱として立てる。地表面から下に伸ばす。
export function buildTestPits(alignment, sections, pits) {
  const g = new THREE.Group();
  g.name = 'pits';
  const groundZ = groundSampler(alignment, sections);

  for (const pit of pits) {
    const loc = alignment.locate(pit.station);
    const ex = loc.x + loc.nx * (pit.offset || 0);
    const ny = loc.y + loc.ny * (pit.offset || 0);
    let top = groundZ(pit.station, pit.offset || 0);
    const col = new THREE.Group();
    col.name = pit.id;
    const w = 0.7;
    for (const ly of pit.layers) {
      const geo = new THREE.BoxGeometry(w, ly.thickness, w);
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({ color: ly.color, roughness: 1 })
      );
      const cz = top - ly.thickness / 2;
      const p = toWorld(ex, ny, cz);
      mesh.position.copy(p);
      mesh.userData = { pit: pit.id, layer: ly.name, thickness: ly.thickness };
      col.add(mesh);
      top -= ly.thickness;
    }
    // 天端マーカー
    const head = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 3, 8),
      new THREE.MeshBasicMaterial({ color: 0xff5d5d })
    );
    const hp = toWorld(ex, ny, groundZ(pit.station, pit.offset || 0) + 1.5);
    head.position.copy(hp);
    col.add(head);
    g.add(col);
  }
  return g;
}

// 構造物/仮設: 直方体で当たりを確認する半透明ボックス。
export function buildBoxes(alignment, sections, items, kind) {
  const g = new THREE.Group();
  g.name = kind; // 'structures' | 'temp'
  const groundZ = groundSampler(alignment, sections);
  for (const it of items) {
    const loc = alignment.locate(it.station);
    const cx = loc.x + loc.nx * (it.offset || 0);
    const cy = loc.y + loc.ny * (it.offset || 0);
    const gz = groundZ(it.station, it.offset || 0);

    let h;
    let centerZ;
    if (it.type === 'excavation') {
      h = it.depth;
      centerZ = gz - it.depth / 2;
    } else {
      h = it.height;
      centerZ = gz - (it.sink || 0) - it.height / 2;
    }
    const geo = new THREE.BoxGeometry(it.width, h, it.run);
    const mat = new THREE.MeshStandardMaterial({
      color: it.color,
      transparent: true,
      opacity: it.type === 'excavation' ? 0.28 : 0.55,
      roughness: 0.7,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(toWorld(cx, cy, centerZ));
    // 進行方向(run)に向けて回転: 接線角
    mesh.rotation.y = Math.atan2(loc.tx, loc.ty);
    mesh.userData = { label: it.label, id: it.id };
    g.add(mesh);

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({ color: it.type === 'excavation' ? 0xffb84d : 0xcfe0f5 })
    );
    edges.position.copy(mesh.position);
    edges.rotation.copy(mesh.rotation);
    g.add(edges);
  }
  return g;
}

// 断面群から任意(station, offset)の地表標高を近似取得する関数を作る。
function groundSampler(alignment, sections) {
  const secs = sections.slice().sort((a, b) => a.station - b.station);
  const zOnProfile = (profile, off) => {
    const p = profile.slice().sort((a, b) => a.offset - b.offset);
    if (off <= p[0].offset) return p[0].z;
    if (off >= p[p.length - 1].offset) return p[p.length - 1].z;
    for (let i = 1; i < p.length; i++) {
      if (off <= p[i].offset) {
        const a = p[i - 1];
        const b = p[i];
        const t = (off - a.offset) / ((b.offset - a.offset) || 1);
        return a.z + (b.z - a.z) * t;
      }
    }
    return p[p.length - 1].z;
  };
  return (station, offset) => {
    // 近傍2断面を線形補間
    let i = 0;
    while (i < secs.length - 1 && secs[i + 1].station < station) i++;
    const a = secs[Math.max(0, i)];
    const b = secs[Math.min(secs.length - 1, i + 1)];
    const za = zOnProfile(a.profile, offset);
    const zb = zOnProfile(b.profile, offset);
    const span = b.station - a.station || 1;
    const t = Math.max(0, Math.min(1, (station - a.station) / span));
    return za + (zb - za) * t;
  };
}
