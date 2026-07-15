import * as THREE from 'three';
import { toWorld } from '../viewer/coords.js';

// 横断面を線形に沿ってロフトし、回廊状のサーフェスを生成する。
// sections: [{ station, profile: [{ offset, z }] }]
//   station = 追加距離(m) / offset = 中心からの水平距離(m, 左が正) / z = 標高(m)
// 各断面をオフセット共通グリッドに再サンプリングして格子メッシュを張る。
export function buildCorridorGeometry(alignment, sections, opts = {}) {
  const secs = sections
    .filter((s) => s.profile && s.profile.length >= 2)
    .slice()
    .sort((a, b) => a.station - b.station);
  if (secs.length < 2) return null;

  let minO = Infinity;
  let maxO = -Infinity;
  for (const s of secs) {
    for (const p of s.profile) {
      if (p.offset < minO) minO = p.offset;
      if (p.offset > maxO) maxO = p.offset;
    }
  }
  const step = opts.offsetStep || 0.5;
  const offsets = [];
  for (let o = minO; o <= maxO + 1e-6; o += step) offsets.push(o);
  const nO = offsets.length;
  const nS = secs.length;

  const sampleZ = (profile, off) => {
    if (off <= profile[0].offset) return profile[0].z;
    const last = profile[profile.length - 1];
    if (off >= last.offset) return last.z;
    for (let i = 1; i < profile.length; i++) {
      if (off <= profile[i].offset) {
        const a = profile[i - 1];
        const b = profile[i];
        const t = (off - a.offset) / ((b.offset - a.offset) || 1);
        return a.z + (b.z - a.z) * t;
      }
    }
    return last.z;
  };

  const positions = new Float32Array(nS * nO * 3);
  for (let i = 0; i < nS; i++) {
    const loc = alignment.locate(secs[i].station);
    const prof = secs[i].profile.slice().sort((a, b) => a.offset - b.offset);
    for (let j = 0; j < nO; j++) {
      const off = offsets[j];
      const z = sampleZ(prof, off);
      const wx = loc.x + loc.nx * off;
      const wy = loc.y + loc.ny * off;
      const v = toWorld(wx, wy, z);
      const k = (i * nO + j) * 3;
      positions[k] = v.x;
      positions[k + 1] = v.y;
      positions[k + 2] = v.z;
    }
  }

  const index = [];
  for (let i = 0; i < nS - 1; i++) {
    for (let j = 0; j < nO - 1; j++) {
      const a = i * nO + j;
      const b = a + 1;
      const c = a + nO;
      const d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  geo.userData = { nS, nO };
  return geo;
}
