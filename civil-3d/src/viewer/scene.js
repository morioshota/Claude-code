import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// three.js の基本シーン(レンダラ・カメラ・慣性つきOrbitControls・照明・グリッド)。
export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x0e1116, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0e1116, 220, 620);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 4000);
  camera.position.set(60, 90, 150);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(60, 95, 0);

  const hemi = new THREE.HemisphereLight(0xbfd3ff, 0x2a2a22, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff4e0, 1.1);
  sun.position.set(120, 200, 80);
  scene.add(sun);

  // 参照グリッド(50m/枚, 10m目盛) を標高0付近に敷く
  const grid = new THREE.GridHelper(600, 60, 0x2c3542, 0x1c2029);
  grid.position.y = 90;
  scene.add(grid);

  // 世界の器。すべての生成物はこの group にぶら下げ、まとめて縦倍率をかける。
  const world = new THREE.Group();
  scene.add(world);

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== w || canvas.height !== h) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }

  function frame(box) {
    // 対象バウンディングにカメラをフィットさせる
    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z) * 0.9 + 20;
    controls.target.copy(center);
    camera.position.set(center.x + radius * 0.7, center.y + radius * 0.8, center.z + radius);
    camera.near = Math.max(0.5, radius / 500);
    camera.far = radius * 20;
    camera.updateProjectionMatrix();
  }

  function loop(onFrame) {
    function tick() {
      resize();
      controls.update();
      if (onFrame) onFrame();
      renderer.render(scene, camera);
      requestAnimationFrame(tick);
    }
    tick();
  }

  return { renderer, scene, camera, controls, world, grid, loop, frame, resize };
}
