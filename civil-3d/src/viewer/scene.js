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

  // 参照グリッド。内容の規模に合わせて frame() で張り替える。
  const grid = new THREE.Group();
  grid.name = 'grid';
  scene.add(grid);
  function fillGrid(cx, cz, y, span) {
    while (grid.children.length) {
      const c = grid.children.pop();
      c.geometry?.dispose?.();
      c.material?.dispose?.();
      grid.remove(c);
    }
    // 目盛は 1/10/50/100m のうち span に応じた値
    const cell = span > 400 ? 50 : span > 120 ? 10 : span > 40 ? 5 : 1;
    const size = Math.ceil(span / cell) * cell * 2;
    const gh = new THREE.GridHelper(size, size / cell, 0x2c3542, 0x1a1e26);
    gh.position.set(cx, y, cz);
    grid.add(gh);
  }
  fillGrid(60, 0, 90, 300);

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

  function frame(box, opts = {}) {
    // 対象バウンディングにカメラをフィットさせる
    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z) * 0.9 + Math.max(2, size.x * 0.05);
    controls.target.copy(center);
    if (opts.front) {
      // 図面シートを正面から見る(Z軸正面・あおりなし)
      camera.position.set(center.x, center.y, center.z + radius * 1.4);
    } else {
      camera.position.set(center.x + radius * 0.7, center.y + radius * 0.8, center.z + radius);
    }
    camera.near = Math.max(0.1, radius / 500);
    camera.far = radius * 30;
    camera.updateProjectionMatrix();
    // グリッドと霧を規模に追従
    fillGrid(center.x, center.z, box.min.y - size.y * 0.02, Math.max(size.x, size.z));
    scene.fog.near = radius * 3;
    scene.fog.far = radius * 12;
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
