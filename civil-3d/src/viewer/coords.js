import * as THREE from 'three';

// 測量座標(x=東, y=北, z=標高) を three.js のワールド座標へ変換する。
// three は Y-up。ここでは Y=標高、東=+X、北=+Z(奥) とする。
// これ1か所に集約しておくことで、全オブジェクトの座標系が必ず一致する。
export function toWorld(east, north, elev = 0) {
  return new THREE.Vector3(east, elev, north);
}
