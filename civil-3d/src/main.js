import './style.css';
import * as THREE from 'three';
import { createScene } from './viewer/scene.js';
import { makeAlignment } from './core/alignment.js';
import { loadCad } from './core/cad.js';
import { buildDrawing } from './viewer/drawing.js';
import { buildShaft, buildTraceLine, buildTraceDots, buildPitColumn, buildStructureBox } from './viewer/extrude.js';
import { georefSection } from './core/georef.js';
import { buildGroundSurface } from './viewer/ground.js';
import {
  buildCorridor,
  buildAlignmentLine,
  buildSectionLines,
  buildTestPits,
  buildBoxes,
} from './viewer/objects.js';
import {
  demoAlignmentPoints,
  demoSections,
  demoTestPits,
  demoStructures,
  demoTempWorks,
} from './data/demo.js';

const canvas = document.getElementById('view');
const panel = document.getElementById('panel');
const hud = document.getElementById('hud');
const S = createScene(canvas);

const DATUM = 95; // 縦倍率の基準標高(デモ用)
let mode = 'demo'; // 'demo' | 'drawing'
let model = null; // デモ現場
let drawing = null; // 読み込んだ図面(buildDrawingの返り値)
let exag = 1;

function resetShaftState() {
  shaftGroup = null;
  pitsGroup = null;
  pitCount = 0;
  placingPit = false;
  structGroup = null;
  structCount = 0;
  placingStruct = false;
  dview = 'sheet';
  glElev = 0;
}

function resetGeoState() {
  cancelGeo();
  geoSections = [];
  geoGroup = null;
  groundMeanElev = 0;
}

function clearWorld() {
  while (S.world.children.length) {
    const c = S.world.children.pop();
    c.traverse?.((o) => {
      o.geometry?.dispose?.();
      o.material?.dispose?.();
      o.material?.map?.dispose?.();
    });
    S.world.remove(c);
  }
}

// ================= デモ現場(コリドー3D) =================
function rebuildDemo() {
  clearWorld();
  const { alignment, sections, pits, structures, temp } = model;
  S.world.add(buildCorridor(alignment, sections));
  S.world.add(buildAlignmentLine(alignment, sections));
  S.world.add(buildSectionLines(alignment, sections));
  S.world.add(buildTestPits(alignment, sections, pits));
  S.world.add(buildBoxes(alignment, sections, structures, 'structures'));
  S.world.add(buildBoxes(alignment, sections, temp, 'temp'));
  applyDemoToggles();
  applyExaggeration(exag);
  const box = new THREE.Box3().setFromObject(S.world);
  if (!box.isEmpty()) S.frame(box);
  updateHud();
}

function loadDemo() {
  mode = 'demo';
  drawing = null;
  resetShaftState();
  resetGeoState();
  const alignment = makeAlignment(demoAlignmentPoints());
  model = {
    alignment,
    sections: demoSections(alignment),
    pits: demoTestPits(),
    structures: demoStructures(),
    temp: demoTempWorks(),
    source: 'デモ現場',
  };
  buildPanel();
  rebuildDemo();
}

const demoToggles = {
  corridor: true, wire: false, alignment: true, sections: true,
  pits: true, structures: true, temp: true, grid: true,
};
function applyDemoToggles() {
  const find = (n) => S.world.getObjectByName(n);
  const corr = find('corridor');
  if (corr) {
    corr.getObjectByName('surface').visible = demoToggles.corridor;
    corr.getObjectByName('wire').visible = demoToggles.wire;
  }
  ['alignment', 'sections', 'pits', 'structures', 'temp'].forEach((n) => {
    const o = find(n);
    if (o) o.visible = demoToggles[n];
  });
  S.grid.visible = demoToggles.grid;
}

function applyExaggeration(k) {
  S.world.scale.y = k;
  S.world.position.y = mode === 'demo' ? DATUM * (1 - k) : 0;
}

// ================= 図面(DWG/DXF) =================
async function onFile(file) {
  setStatus(`${file.name} を読み込み中…`);
  try {
    const buf = await file.arrayBuffer();
    const cad = await loadCad(buf, file.name);
    const layerCount = Object.keys(cad.layers).length;
    if (!layerCount) {
      setStatus('線オブジェクトが見つかりませんでした。');
      return;
    }
    mode = 'drawing';
    model = null;
    resetShaftState();
    resetGeoState();
    clearWorld();
    drawing = buildDrawing(cad);
    drawing.source = file.name;
    S.world.scale.y = 1;
    S.world.position.y = 0;
    S.world.add(drawing.group);
    buildPanel();
    S.frame(drawing.worldBox, { front: true });
    updateHud();
    setStatus(`${layerCount}レイヤ / テキスト${cad.texts.length}件 を表示中`);
  } catch (e) {
    console.error(e);
    setStatus(`読み込みに失敗しました: ${e.message}`);
  }
}

const drawingVis = {}; // レイヤ名→表示
let labelsVisible = true;
function applyDrawingToggles() {
  if (!drawing) return;
  for (const name of drawing.layerNames) {
    const o = drawing.group.getObjectByName(`lyr:${name}`);
    if (o) o.visible = drawingVis[name] !== false;
  }
  const labels = drawing.group.getObjectByName('labels');
  if (labels) {
    labels.visible = labelsVisible;
    labels.children.forEach((s) => (s.visible = drawingVis[s.userData.layer] !== false));
  }
  S.grid.visible = gridVisible;
}
let gridVisible = true;

// ================= 3D起こし(平面図トレース→押し出し) =================
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const zPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0); // 図面シート面
const yPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // 地表(GL)面
let tracing = false;
let tracePts = [];
let traceOverlay = null;
let shaftGroup = null;
let depthValue = 3.5;
// 試験掘り
let placingPit = false;
let pitsGroup = null;
let pitCount = 0;
let pitLayersText = '埋土,1.2\n砂質土As,2.6\n粘性土Ac,3.0\n礫G,2.0';
// 構造物
let placingStruct = false;
let structGroup = null;
let structCount = 0;
let structSpec = { w: 2, l: 2, h: 2, sink: 0.5, name: 'MH' };
// 断面ジオリファレンス
let geoStep = null; // null|'planStart'|'planEnd'|'vref1'|'vref2'|'trace'
let geoData = { planStart: null, planEnd: null, vRef: [], trace: [] };
let geoSections = [];
let geoGroup = null; // 3D成果(地盤サーフェス/断面線)
let geoOverlay = null; // シート上の入力プレビュー
let el1Value = 100;
let el2Value = 95;
let groundMeanElev = 0;
// 図面サブビュー: 'sheet'(図面) | 'shaft'(立坑) | 'ground'(地盤) | 'both'(統合)
let dview = 'sheet';
let glElev = 0; // GL(地表)の実標高。立坑/試験掘り/構造物の基準面。

const hasShaft = () => !!shaftGroup;
const hasGround = () => !!geoGroup && geoSections.length >= 1;

// GL面(試験掘り/構造物の配置クリック用)。glElev に追従。
function glPlane() {
  return new THREE.Plane(new THREE.Vector3(0, 1, 0), -glElev);
}

// dview に応じて各グループの表示と立坑のGL標高を反映
function applyDview() {
  if (!drawing) return;
  drawing.group.visible = dview === 'sheet';
  if (shaftGroup) {
    shaftGroup.visible = dview === 'shaft' || dview === 'both';
    shaftGroup.position.y = glElev; // GL基準を実標高へ
  }
  if (geoGroup) geoGroup.visible = dview === 'ground' || dview === 'both';
  S.grid.visible = gridVisible;
}

function frameForView() {
  if (dview === 'sheet') {
    S.frame(drawing.worldBox, { front: true });
  } else if (dview === 'shaft' && shaftGroup) {
    S.frame(new THREE.Box3().setFromObject(shaftGroup));
  } else if (dview === 'ground' && geoGroup) {
    S.frame(new THREE.Box3().setFromObject(geoGroup));
  } else if (dview === 'both') {
    const box = new THREE.Box3();
    if (shaftGroup) box.expandByObject(shaftGroup);
    if (geoGroup) box.expandByObject(geoGroup);
    if (!box.isEmpty()) S.frame(box);
  }
}

function switchView(v) {
  dview = v;
  if (v === 'sheet') cancelGeo();
  applyDview();
  frameForView();
  buildPanel();
  updateHud();
}

function viewNavHtml() {
  const btn = (v, label, cls = '') => `<button data-view="${v}" class="${cls}" style="width:auto;padding:6px 12px">${label}</button>`;
  const btns = [];
  if (dview !== 'sheet') btns.push(btn('sheet', '図面'));
  if (hasShaft() && dview !== 'shaft') btns.push(btn('shaft', '立坑'));
  if (hasGround() && dview !== 'ground') btns.push(btn('ground', '地盤'));
  if (hasShaft() && hasGround() && dview !== 'both') btns.push(btn('both', '統合', 'primary'));
  if (!btns.length) return '';
  return `<div class="group"><div class="title">ビュー切替</div><div class="row" style="gap:6px;flex-wrap:wrap;justify-content:flex-start">${btns.join('')}</div></div>`;
}

function planeHit(ev, plane = zPlane) {
  const r = canvas.getBoundingClientRect();
  ndc.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
  ndc.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
  raycaster.setFromCamera(ndc, S.camera);
  const hit = new THREE.Vector3();
  return raycaster.ray.intersectPlane(plane, hit) ? hit : null;
}

function parsePitLayers(text) {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [name, th] = l.split(/[,、\t]/);
      return { name: (name || '').trim(), thickness: parseFloat(th) || 1 };
    })
    .filter((x) => x.name);
}

function startPlacePit() {
  if (!shaftGroup) return;
  if (!parsePitLayers(pitLayersText).length) {
    setStatus('土層を「名前,層厚」で入力してください。');
    return;
  }
  placingPit = true;
  S.controls.enabled = false;
  setStatus('地表(GL)面をクリックして試験掘りの位置を指定してください。');
}

function placePitAt(x, z) {
  placingPit = false;
  S.controls.enabled = true;
  const layers = parsePitLayers(pitLayersText);
  if (!pitsGroup) {
    pitsGroup = new THREE.Group();
    pitsGroup.name = 'pits';
    shaftGroup.add(pitsGroup);
  }
  pitCount++;
  pitsGroup.add(buildPitColumn(x, z, 0, layers, `TP-${pitCount}`));
  buildPanel();
  const depth = layers.reduce((s, l) => s + l.thickness, 0);
  setStatus(`TP-${pitCount} を配置しました（総深 ${depth.toFixed(1)}m）。`);
}

function removePit(id) {
  if (!pitsGroup) return;
  const col = pitsGroup.children.find((c) => c.userData?.id === id);
  if (col) {
    pitsGroup.remove(col);
    col.traverse((o) => {
      o.geometry?.dispose?.();
      o.material?.dispose?.();
    });
    buildPanel();
  }
}

function startPlaceStruct() {
  if (!shaftGroup) return;
  placingStruct = true;
  S.controls.enabled = false;
  setStatus('地表(GL)面をクリックして構造物の中心位置を指定してください。');
}

function placeStructAt(x, z) {
  placingStruct = false;
  S.controls.enabled = true;
  if (!structGroup) {
    structGroup = new THREE.Group();
    structGroup.name = 'structs';
    shaftGroup.add(structGroup);
  }
  structCount++;
  const id = `${structSpec.name || '構造物'}-${structCount}`;
  const box = buildStructureBox(x, z, structSpec.w, structSpec.l, structSpec.h, structSpec.sink, {
    meta: { id },
  });
  structGroup.add(box);
  buildPanel();
  const bottom = structSpec.sink + structSpec.h;
  setStatus(`${id} を配置（天端-${structSpec.sink}m / 底-${bottom.toFixed(1)}m）。`);
}

function removeStruct(id) {
  if (!structGroup) return;
  const s = structGroup.children.find((c) => c.userData?.id === id);
  if (s) {
    structGroup.remove(s);
    s.traverse((o) => {
      o.geometry?.dispose?.();
      o.material?.dispose?.();
    });
    buildPanel();
  }
}

// ---- 断面ジオリファレンス ----
function clearGeoOverlay() {
  if (geoOverlay) {
    S.world.remove(geoOverlay);
    geoOverlay.traverse((o) => {
      o.geometry?.dispose?.();
      o.material?.dispose?.();
    });
    geoOverlay = null;
  }
}

function refreshGeoOverlay() {
  clearGeoOverlay();
  geoOverlay = new THREE.Group();
  geoOverlay.name = 'geo-overlay';
  const dot = (x, y, c) => {
    const d = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), new THREE.MeshBasicMaterial({ color: c }));
    d.position.set(x, y, 0.03);
    geoOverlay.add(d);
  };
  const line = (a, b, c) =>
    geoOverlay.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a.x, a.y, 0.02), new THREE.Vector3(b.x, b.y, 0.02)]),
      new THREE.LineBasicMaterial({ color: c })
    ));
  if (geoData.planStart) dot(geoData.planStart.x, geoData.planStart.y, 0xffd166);
  if (geoData.planStart && geoData.planEnd) {
    dot(geoData.planEnd.x, geoData.planEnd.y, 0xffd166);
    line(geoData.planStart, geoData.planEnd, 0xffd166);
  }
  geoData.vRef.forEach((v) => dot(v.cx, v.sy, 0xff7ad9));
  if (geoData.trace.length) {
    const pts = geoData.trace.map((p) => new THREE.Vector3(p.x, p.y, 0.02));
    geoOverlay.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x6ec6ff })));
    geoData.trace.forEach((p) => dot(p.x, p.y, 0x6ec6ff));
  }
  S.world.add(geoOverlay);
}

function cancelGeo() {
  geoStep = null;
  geoData = { planStart: null, planEnd: null, vRef: [], trace: [] };
  clearGeoOverlay();
  S.controls.enabled = true;
}

function startGeoSection() {
  if (tracing) stopTrace();
  cancelGeo();
  dview = 'sheet';
  applyDview();
  S.frame(drawing.worldBox, { front: true });
  geoStep = 'planStart';
  S.controls.enabled = false;
  setStatus('①平面図で断面線の始点をクリック');
  buildPanel();
}

const GEO_PROMPT = {
  planStart: '①平面図で断面線の始点をクリック',
  planEnd: '②平面図で断面線の終点をクリック',
  vref1: '③横断図で標高基準点1をクリック（右のEL1を先に入力）',
  vref2: '④横断図で標高基準点2をクリック（EL2）',
  trace: '⑤横断図の地盤ラインを順にクリック→「断面を確定」',
};

function handleGeoClick(x, y) {
  let tracePoint = false;
  switch (geoStep) {
    case 'planStart':
      geoData.planStart = { x, y };
      geoStep = 'planEnd';
      break;
    case 'planEnd':
      geoData.planEnd = { x, y };
      geoStep = 'vref1';
      break;
    case 'vref1':
      geoData.vRef = [{ sy: y, el: el1Value, cx: x }];
      geoStep = 'vref2';
      break;
    case 'vref2':
      geoData.vRef.push({ sy: y, el: el2Value, cx: x });
      geoStep = 'trace';
      break;
    case 'trace':
      geoData.trace.push({ x, y });
      tracePoint = true;
      break;
    default:
      return;
  }
  refreshGeoOverlay();
  buildPanel(); // 確定ボタンの活性状態を更新するため毎回再描画
  setStatus(tracePoint ? `地盤トレース: ${geoData.trace.length}点（2点以上で確定）` : GEO_PROMPT[geoStep]);
}

function commitGeoSection() {
  if (geoStep !== 'trace' || geoData.trace.length < 2 || geoData.vRef.length < 2 || !geoData.planEnd) return;
  const sec = georefSection(geoData.trace, geoData.vRef, geoData.planStart, geoData.planEnd);
  geoSections.push({ world: sec, name: `断面${geoSections.length + 1}` });
  cancelGeo();
  showGround();
  buildPanel();
  setStatus(`断面を確定（計${geoSections.length}本）。「断面を追加」で本数を増やせます。`);
}

function showGround() {
  if (geoGroup) {
    S.world.remove(geoGroup);
    geoGroup.traverse((o) => {
      o.geometry?.dispose?.();
      o.material?.dispose?.();
    });
  }
  geoGroup = buildGroundSurface(geoSections.map((s) => s.world), { grid: 24 });
  S.world.add(geoGroup);
  // GL標高の既定値を地盤の平均標高に合わせる(立坑を実標高へ載せるため)
  const all = geoSections.flatMap((s) => s.world.map((p) => p.elev));
  groundMeanElev = all.length ? all.reduce((a, b) => a + b, 0) / all.length : 0;
  glElev = groundMeanElev;
  dview = 'ground';
  applyDview();
  frameForView();
  updateHud();
}

function exitGround() {
  switchView('sheet');
}

function removeGeoSection(idx) {
  geoSections.splice(idx, 1);
  if (geoSections.length) showGround();
  else exitGround();
  buildPanel();
}

function refreshTrace() {
  if (traceOverlay) {
    S.world.remove(traceOverlay);
    traceOverlay.traverse((o) => {
      o.geometry?.dispose?.();
      o.material?.dispose?.();
    });
  }
  traceOverlay = new THREE.Group();
  traceOverlay.name = 'trace-overlay';
  if (tracePts.length >= 2) traceOverlay.add(buildTraceLine(tracePts, tracePts.length >= 3));
  traceOverlay.add(buildTraceDots(tracePts));
  S.world.add(traceOverlay);
}

function clearTrace() {
  tracePts = [];
  if (traceOverlay) {
    S.world.remove(traceOverlay);
    traceOverlay = null;
  }
}

function startTrace() {
  if (shaftGroup) backToDrawing();
  tracing = true;
  clearTrace();
  S.controls.enabled = false; // トレース中はカメラ操作を止める
  drawing.group.visible = true;
  setStatus('平面図の輪郭を順にクリック。3点以上で「3Dを生成」できます。');
  updateTraceButtons();
}

function stopTrace() {
  tracing = false;
  S.controls.enabled = true;
  updateTraceButtons();
}

function generate3D() {
  if (tracePts.length < 3) return;
  const pts = tracePts.slice();
  stopTrace();
  clearTrace();
  if (shaftGroup) {
    S.world.remove(shaftGroup);
    shaftGroup.traverse((o) => {
      o.geometry?.dispose?.();
      o.material?.dispose?.();
    });
  }
  pitsGroup = null;
  pitCount = 0;
  placingPit = false;
  structGroup = null;
  structCount = 0;
  placingStruct = false;
  // 地盤があればGLを地盤の平均標高に載せる。無ければGL=0(相対)。
  glElev = hasGround() ? groundMeanElev : 0;
  shaftGroup = new THREE.Group();
  shaftGroup.name = 'shaft-model';
  const shaft = buildShaft(pts, depthValue, { topY: 0, color: 0x4aa3ff });
  shaftGroup.add(shaft);
  // 地表(GL)参照の枠(GL=0のローカル。shaftGroupごと実標高へ持ち上げる)
  const b = new THREE.Box3().setFromObject(shaft);
  const glPts = [
    new THREE.Vector3(b.min.x, 0, b.min.z), new THREE.Vector3(b.max.x, 0, b.min.z),
    new THREE.Vector3(b.max.x, 0, b.max.z), new THREE.Vector3(b.min.x, 0, b.max.z),
    new THREE.Vector3(b.min.x, 0, b.min.z),
  ];
  shaftGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(glPts),
    new THREE.LineBasicMaterial({ color: 0x9be89b })));
  S.world.add(shaftGroup);
  dview = 'shaft';
  applyDview();
  frameForView();
  buildPanel();
  const area = polygonArea(pts);
  setStatus(`3Dを生成: 深さ ${depthValue}m ／ 底面積 約${area.toFixed(1)}㎡ ／ 掘削体積 約${(area * depthValue).toFixed(1)}㎥`);
  updateHud();
}

// 「図面に戻る」= 立坑を保持したまま図面ビューへ(統合のため破棄しない)
function backToDrawing() {
  switchView('sheet');
}

function pitListHtml() {
  if (!pitsGroup || !pitsGroup.children.length) return '';
  return (
    '<div style="margin-top:8px">' +
    pitsGroup.children
      .map((c) => {
        const u = c.userData || {};
        return `<div class="row" style="margin:3px 0"><span>${esc(u.id)} <span style="color:#7f8896">深${(u.depth || 0).toFixed(1)}m</span></span>` +
          `<button data-rmpit="${esc(u.id)}" style="width:auto;padding:2px 8px;font-size:11px">削除</button></div>`;
      })
      .join('') +
    '</div>'
  );
}

function structListHtml() {
  if (!structGroup || !structGroup.children.length) return '';
  return (
    '<div style="margin-top:8px">' +
    structGroup.children
      .map((c) => {
        const u = c.userData || {};
        return `<div class="row" style="margin:3px 0"><span>${esc(u.id)} <span style="color:#7f8896">${u.w}×${u.l}×${u.h}m</span></span>` +
          `<button data-rmstr="${esc(u.id)}" style="width:auto;padding:2px 8px;font-size:11px">削除</button></div>`;
      })
      .join('') +
    '</div>'
  );
}

function geoListHtml() {
  if (!geoSections.length) return '';
  return (
    '<div style="margin-top:8px">' +
    geoSections
      .map(
        (s, i) =>
          `<div class="row" style="margin:3px 0"><span>${esc(s.name)} <span style="color:#7f8896">${s.world.length}点</span></span>` +
          `<button data-rmgeo="${i}" style="width:auto;padding:2px 8px;font-size:11px">削除</button></div>`
      )
      .join('') +
    '</div>'
  );
}

function buildGroundPanel() {
  panel.innerHTML = `
    <h1>土木3Dビルダー <span class="badge">地盤サーフェス</span></h1>
    <div class="sub">横断図から起こした現況地盤サーフェス。断面を追加すると精度が上がります。</div>
    <div class="group">
      <div class="title">データ</div>
      <div class="row"><button class="filebtn">別の図面を読み込む…<input type="file" id="cad" accept=".dwg,.dxf"/></button></div>
      <div class="note" id="status"></div>
      <div class="row" style="margin-top:8px"><button id="demo">デモ現場に戻る</button></div>
    </div>
    ${viewNavHtml()}
    <div class="group">
      <div class="title">断面（${geoSections.length}本）</div>
      <div id="geoList">${geoListHtml()}</div>
      <div class="row" style="margin-top:8px"><button id="geoAdd" class="primary">＋ 断面を追加</button></div>
      <div class="row" style="margin-top:6px"><button id="backSheet">◀ 図面ビューに戻る</button></div>
    </div>
    <div class="group">
      <div class="title">レイヤ（表示/非表示）</div>
      <div class="row"><label><input type="checkbox" id="gridv" ${gridVisible ? 'checked' : ''}/>基準グリッド</label></div>
    </div>
  `;
  panel.querySelector('#geoAdd').addEventListener('click', startGeoSection);
  panel.querySelector('#backSheet').addEventListener('click', exitGround);
  panel.querySelector('#gridv').addEventListener('change', (e) => {
    gridVisible = e.target.checked;
    S.grid.visible = gridVisible;
  });
  panel.querySelectorAll('button[data-rmgeo]').forEach((b) =>
    b.addEventListener('click', () => removeGeoSection(+b.dataset.rmgeo))
  );
  wireCommon();
  wireNav();
}

function buildIntegratedPanel() {
  panel.innerHTML = `
    <h1>土木3Dビルダー <span class="badge">統合ビュー</span></h1>
    <div class="sub">現況地盤・立坑・試験掘り・構造物を実標高で重ね合わせて総合検討します。</div>
    <div class="group">
      <div class="title">データ</div>
      <div class="row"><button class="filebtn">別の図面を読み込む…<input type="file" id="cad" accept=".dwg,.dxf"/></button></div>
      <div class="note" id="status"></div>
      <div class="row" style="margin-top:8px"><button id="demo">デモ現場に戻る</button></div>
    </div>
    ${viewNavHtml()}
    <div class="group">
      <div class="title">GL基準</div>
      <div class="row"><label>GL標高(m)</label><input id="glElev" type="number" value="${glElev.toFixed(1)}" step="0.1" style="width:70px;${inpStyle}"/></div>
      <div class="note">立坑・試験掘り・構造物の天端基準。地盤に合わせて調整できます。</div>
    </div>
    <div class="group">
      <div class="title">表示</div>
      <div class="row"><label><input type="checkbox" id="vGround" checked/><span class="swatch" style="background:#6f7f5a"></span>現況地盤</label></div>
      <div class="row"><label><input type="checkbox" id="vShaft" checked/><span class="swatch" style="background:#4aa3ff"></span>立坑</label></div>
      <div class="row"><label><input type="checkbox" id="vPits" checked/><span class="swatch" style="background:#d8c37a"></span>試験掘り</label></div>
      <div class="row"><label><input type="checkbox" id="vStr" checked/><span class="swatch" style="background:#9fb2c9"></span>構造物</label></div>
      <div class="row"><label><input type="checkbox" id="gridv" ${gridVisible ? 'checked' : ''}/>基準グリッド</label></div>
    </div>
  `;
  wireCommon();
  wireNav();
  panel.querySelector('#glElev').addEventListener('input', (e) => setGlElev(parseFloat(e.target.value) || 0));
  const setVis = (sel, fn) => panel.querySelector(sel).addEventListener('change', (e) => fn(e.target.checked));
  setVis('#vGround', (v) => geoGroup && (geoGroup.visible = v));
  setVis('#vShaft', (v) => {
    const s = shaftGroup?.getObjectByName('shaft');
    if (s) s.visible = v;
  });
  setVis('#vPits', (v) => pitsGroup && (pitsGroup.visible = v));
  setVis('#vStr', (v) => structGroup && (structGroup.visible = v));
  setVis('#gridv', (v) => {
    gridVisible = v;
    S.grid.visible = v;
  });
}

function setGlElev(v) {
  glElev = v;
  if (shaftGroup) shaftGroup.position.y = glElev;
  updateHud();
}

function wireNav() {
  panel.querySelectorAll('button[data-view]').forEach((b) =>
    b.addEventListener('click', () => switchView(b.dataset.view))
  );
}

function polygonArea(ring) {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

function updateTraceButtons() {
  const b = document.getElementById('traceBtn');
  if (b) b.textContent = tracing ? '⏸ トレース中（クリックで点追加）' : '▶ 範囲トレース開始';
  const g = document.getElementById('genBtn');
  if (g) g.disabled = tracePts.length < 3;
}

canvas.addEventListener('click', (ev) => {
  if (mode !== 'drawing') return;
  if (geoStep) {
    const h = planeHit(ev, zPlane);
    if (h) handleGeoClick(h.x, h.y);
    return;
  }
  if (placingPit) {
    const h = planeHit(ev, glPlane());
    if (h) placePitAt(h.x, h.z);
    return;
  }
  if (placingStruct) {
    const h = planeHit(ev, glPlane());
    if (h) placeStructAt(h.x, h.z);
    return;
  }
  if (tracing) {
    const h = planeHit(ev, zPlane);
    if (!h) return;
    tracePts.push({ x: h.x, y: h.y });
    refreshTrace();
    updateTraceButtons();
    setStatus(`トレース点: ${tracePts.length}（3点以上で生成可）`);
  }
});

// ================= HUD / ステータス =================
function updateHud() {
  if (mode === 'demo' && model) {
    const a = model.alignment;
    hud.innerHTML =
      `<b>${esc(model.source)}</b><br>` +
      `延長 ${a.length.toFixed(1)} m ／ 断面 ${model.sections.length} ／ ` +
      `試験掘り ${model.pits.length} ／ 構造物 ${model.structures.length}<br>` +
      `<span style="color:#7f8896">左ドラッグ=回転 / 右ドラッグ=移動 / ホイール=ズーム</span>`;
  } else if (mode === 'drawing' && drawing) {
    const nav = '<br><span style="color:#7f8896">左ドラッグ=回転 / 右=移動 / ホイール=ズーム</span>';
    if (dview === 'both') {
      const s = shaftGroup?.getObjectByName('shaft');
      const area = s?.userData?.ring ? polygonArea(s.userData.ring) : 0;
      hud.innerHTML =
        `<b>${esc(drawing.source)} — 統合ビュー</b><br>` +
        `GL標高 ${glElev.toFixed(1)} m ／ 立坑深 ${depthValue} m(底 EL${(glElev - depthValue).toFixed(1)}) ／ 掘削 約${(area * depthValue).toFixed(1)} ㎥ ／ 断面 ${geoSections.length} 本` + nav;
    } else if (dview === 'ground' && geoGroup) {
      const box = new THREE.Box3().setFromObject(geoGroup);
      const sz = box.getSize(new THREE.Vector3());
      hud.innerHTML =
        `<b>${esc(drawing.source)} — 現況地盤</b><br>` +
        `断面 ${geoSections.length} 本 ／ 標高 ${box.min.y.toFixed(1)}〜${box.max.y.toFixed(1)} m ／ 幅 ${sz.x.toFixed(1)} m` + nav;
    } else if (dview === 'shaft' && shaftGroup) {
      const s = shaftGroup.getObjectByName('shaft');
      const area = s?.userData?.ring ? polygonArea(s.userData.ring) : 0;
      const glTxt = hasGround() ? `／ GL EL${glElev.toFixed(1)}m ` : '';
      hud.innerHTML =
        `<b>${esc(drawing.source)} — 3D立坑</b><br>` +
        `深さ ${depthValue} m ／ 底面積 約${area.toFixed(1)} ㎡ ／ 掘削体積 約${(area * depthValue).toFixed(1)} ㎥ ${glTxt}` + nav;
    } else {
      const sz = drawing.worldBox.getSize(new THREE.Vector3());
      hud.innerHTML =
        `<b>${esc(drawing.source)}</b><br>` +
        `${drawing.layerNames.length}レイヤ ／ 図面範囲 ${sz.x.toFixed(1)}×${sz.y.toFixed(1)} m相当` + nav;
    }
  }
}
function setStatus(t) {
  const el = document.getElementById('status');
  if (el) el.textContent = t;
}
function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// ================= パネル UI =================
function buildPanel() {
  if (mode === 'drawing') buildDrawingPanel();
  else buildDemoPanel();
}

function buildDemoPanel() {
  const tog = (key, label, sw) =>
    `<div class="row"><label><input type="checkbox" data-t="${key}" ${demoToggles[key] ? 'checked' : ''}/>` +
    (sw ? `<span class="swatch" style="background:${sw}"></span>` : '') + `${label}</label></div>`;

  panel.innerHTML = `
    <h1>土木3Dビルダー <span class="badge">プロト</span></h1>
    <div class="sub">平面線形に横断図をロフトして検討用3Dを生成。試験掘り・仮設・構造物の当たり確認用。</div>
    <div class="group">
      <div class="title">データ</div>
      <div class="row"><button class="filebtn">図面を読み込む（DWG / DXF）…<input type="file" id="cad" accept=".dwg,.dxf"/></button></div>
      <div class="note" id="status">デモ現場を表示中。DWG/DXFを読み込むと図面ビューへ切り替わります。</div>
      <div class="row" style="margin-top:8px"><button id="demo" class="primary">デモ現場を読み込む</button></div>
    </div>
    <div class="group">
      <div class="title">表示レイヤ（デモ）</div>
      ${tog('corridor', '地表サーフェス', '#6f7f5a')}
      ${tog('wire', '断面グリッド(線)', '#33507a')}
      ${tog('sections', '横断線', '#6ec6ff')}
      ${tog('alignment', '線形(中心線)', '#ffd166')}
      ${tog('pits', '試験掘り', '#d8c37a')}
      ${tog('structures', '構造物', '#9fb2c9')}
      ${tog('temp', '仮設(掘削)', '#e0a54a')}
      ${tog('grid', '基準グリッド', '#2c3542')}
    </div>
    <div class="group">
      <div class="title">縦倍率(高低差の強調)</div>
      <div class="row"><input type="range" id="exag" min="1" max="8" step="0.5" value="${exag}"/><span class="val" id="exagv">×${exag.toFixed(1)}</span></div>
    </div>
  `;
  panel.querySelectorAll('input[data-t]').forEach((cb) =>
    cb.addEventListener('change', () => {
      demoToggles[cb.dataset.t] = cb.checked;
      applyDemoToggles();
    })
  );
  wireCommon();
  const exagEl = panel.querySelector('#exag');
  exagEl.addEventListener('input', () => {
    exag = parseFloat(exagEl.value);
    panel.querySelector('#exagv').textContent = `×${exag.toFixed(1)}`;
    applyExaggeration(exag);
  });
}

const inpStyle = 'background:#1a1f27;color:#e6e9ef;border:1px solid #333c48;border-radius:6px;padding:3px 6px';

function buildDrawingPanel() {
  const rows = drawing.layerNames
    .map((name) => {
      const c = '#' + (drawing.colors[name] || 0xdddddd).toString(16).padStart(6, '0');
      const on = drawingVis[name] !== false;
      return `<div class="row"><label><input type="checkbox" data-lyr="${esc(name)}" ${on ? 'checked' : ''}/>` +
        `<span class="swatch" style="background:${c}"></span>${esc(name)} ` +
        `<span style="color:#7f8896">(${drawing.group.getObjectByName(`lyr:${name}`)?.geometry?.attributes?.position?.count / 2 || 0})</span></label></div>`;
    })
    .join('');
  if (dview === 'ground') {
    buildGroundPanel();
    return;
  }
  if (dview === 'both') {
    buildIntegratedPanel();
    return;
  }
  const inShaft = dview === 'shaft';
  const geoBlock = inShaft ? '' : `
    <div class="group">
      <div class="title">断面ジオリファレンス（地盤）</div>
      <div class="row"><label>EL基準1(m)</label><input id="el1" type="number" value="${el1Value}" step="0.1" style="width:70px;${inpStyle}"/></div>
      <div class="row"><label>EL基準2(m)</label><input id="el2" type="number" value="${el2Value}" step="0.1" style="width:70px;${inpStyle}"/></div>
      ${geoStep
        ? `<div class="note" style="color:#ffd166;margin-top:6px">${GEO_PROMPT[geoStep]}${geoStep === 'trace' ? `（${geoData.trace.length}点）` : ''}</div>
           <div class="row" style="margin-top:6px"><button id="geoCommit" class="primary" ${geoData.trace.length < 2 ? 'disabled' : ''}>断面を確定</button></div>
           <div class="row" style="margin-top:6px"><button id="geoCancel">キャンセル</button></div>`
        : `<div class="row" style="margin-top:6px"><button id="geoAdd">＋ 断面を追加</button></div>`}
      <div id="geoList">${geoListHtml()}</div>
      ${geoSections.length >= 2 && !geoStep ? `<div class="row" style="margin-top:6px"><button id="geoSurface" class="primary">地盤サーフェスを生成</button></div>` : ''}
      <div class="note">平面の断面線2点→横断のEL基準2点→地盤ラインをトレース。2本以上でサーフェス化。</div>
    </div>`;
  panel.innerHTML = `
    <h1>土木3Dビルダー <span class="badge">${inShaft ? '3Dモデル' : '図面ビュー'}</span></h1>
    <div class="sub">平面図の輪郭をトレースして深さ方向に押し出し、立坑(土留め/掘削)の3Dを起こします。</div>
    <div class="group">
      <div class="title">データ</div>
      <div class="row"><button class="filebtn">別の図面を読み込む…<input type="file" id="cad" accept=".dwg,.dxf"/></button></div>
      <div class="note" id="status"></div>
      <div class="row" style="margin-top:8px"><button id="demo">デモ現場に戻る</button></div>
    </div>
    ${viewNavHtml()}
    <div class="group">
      <div class="title">3D起こし（押し出し）</div>
      ${inShaft
        ? `<div class="note">深さ ${depthValue}m で生成済み。輪郭をやり直す場合は図面に戻ってください。</div>
           ${hasGround() ? `<div class="row" style="margin-top:6px"><label>GL標高(m)</label><input id="glElev" type="number" value="${glElev.toFixed(1)}" step="0.1" style="width:70px;${inpStyle}"/></div>` : ''}
           <div class="row" style="margin-top:8px"><button id="backBtn" class="primary">◀ 図面に戻る</button></div>`
        : `<div class="row"><label>深さ(m)</label><input type="number" id="depth" value="${depthValue}" min="0.1" step="0.1" style="width:70px;background:#1a1f27;color:#e6e9ef;border:1px solid #333c48;border-radius:6px;padding:3px 6px"/></div>
           <div class="row" style="margin-top:6px"><button id="traceBtn">▶ 範囲トレース開始</button></div>
           <div class="row" style="margin-top:6px"><button id="undoBtn">1点戻す</button></div>
           <div class="row" style="margin-top:6px"><button id="genBtn" class="primary" disabled>3Dを生成</button></div>
           <div class="note">平面図の土留め/掘削の輪郭を順にクリック。矢板長 L=3500 等を深さに入力します。</div>`}
    </div>
    ${inShaft ? `
    <div class="group">
      <div class="title">試験掘り（柱状図）</div>
      <div class="note" style="margin-bottom:6px">土層を「名前,層厚(m)」で改行区切り入力し、配置ボタン→GL面をクリック。</div>
      <textarea id="pitLayers" rows="4" style="width:100%;background:#1a1f27;color:#e6e9ef;border:1px solid #333c48;border-radius:6px;padding:6px;font:12px monospace;resize:vertical">${esc(pitLayersText)}</textarea>
      <div class="row" style="margin-top:6px"><button id="placePit">＋ 試験掘りを配置（GLをクリック）</button></div>
      <div id="pitList">${pitListHtml()}</div>
    </div>
    <div class="group">
      <div class="title">構造物（当たり確認）</div>
      <div class="note" style="margin-bottom:6px">MH・カルバート等をボックスで配置し、立坑との干渉を確認します。</div>
      <div class="row"><label>名称</label><input id="stName" value="${esc(structSpec.name)}" style="width:110px;${inpStyle}"/></div>
      <div class="row"><label>幅W×奥行L(m)</label><span><input id="stW" type="number" value="${structSpec.w}" step="0.1" style="width:52px;${inpStyle}"/>×<input id="stL" type="number" value="${structSpec.l}" step="0.1" style="width:52px;${inpStyle}"/></span></div>
      <div class="row"><label>高さH(m)</label><input id="stH" type="number" value="${structSpec.h}" step="0.1" style="width:60px;${inpStyle}"/></div>
      <div class="row"><label>天端下がり(m)</label><input id="stSink" type="number" value="${structSpec.sink}" step="0.1" style="width:60px;${inpStyle}"/></div>
      <div class="row" style="margin-top:6px"><button id="placeStruct">＋ 構造物を配置（GLをクリック）</button></div>
      <div id="structList">${structListHtml()}</div>
    </div>` : ''}
    ${geoBlock}
    <div class="group">
      <div class="title">レイヤ（表示/非表示）</div>
      <div class="row"><label><input type="checkbox" id="labels" ${labelsVisible ? 'checked' : ''}/>文字ラベル</label></div>
      <div class="row"><label><input type="checkbox" id="gridv" ${gridVisible ? 'checked' : ''}/>基準グリッド</label></div>
      <div style="border-top:1px solid #262d38;margin:6px 0 4px"></div>
      ${rows}
    </div>
  `;
  wireNav();
  if (inShaft) {
    panel.querySelector('#backBtn').addEventListener('click', backToDrawing);
    panel.querySelector('#glElev')?.addEventListener('input', (e) => setGlElev(parseFloat(e.target.value) || 0));
    const ta = panel.querySelector('#pitLayers');
    ta.addEventListener('input', (e) => (pitLayersText = e.target.value));
    panel.querySelector('#placePit').addEventListener('click', startPlacePit);
    panel.querySelectorAll('button[data-rmpit]').forEach((b) =>
      b.addEventListener('click', () => removePit(b.dataset.rmpit))
    );
    const bind = (sel, key, num) =>
      panel.querySelector(sel).addEventListener('input', (e) => {
        structSpec[key] = num ? Math.max(0, parseFloat(e.target.value) || 0) : e.target.value;
      });
    bind('#stName', 'name', false);
    bind('#stW', 'w', true);
    bind('#stL', 'l', true);
    bind('#stH', 'h', true);
    bind('#stSink', 'sink', true);
    panel.querySelector('#placeStruct').addEventListener('click', startPlaceStruct);
    panel.querySelectorAll('button[data-rmstr]').forEach((b) =>
      b.addEventListener('click', () => removeStruct(b.dataset.rmstr))
    );
  } else {
    panel.querySelector('#depth').addEventListener('change', (e) => {
      depthValue = Math.max(0.1, parseFloat(e.target.value) || 3.5);
    });
    panel.querySelector('#traceBtn').addEventListener('click', () => {
      if (tracing) stopTrace();
      else startTrace();
    });
    panel.querySelector('#undoBtn').addEventListener('click', () => {
      tracePts.pop();
      refreshTrace();
      updateTraceButtons();
    });
    panel.querySelector('#genBtn').addEventListener('click', generate3D);
    updateTraceButtons();
    // 断面ジオリファレンスの配線
    panel.querySelector('#el1')?.addEventListener('input', (e) => (el1Value = parseFloat(e.target.value) || 0));
    panel.querySelector('#el2')?.addEventListener('input', (e) => (el2Value = parseFloat(e.target.value) || 0));
    panel.querySelector('#geoAdd')?.addEventListener('click', startGeoSection);
    panel.querySelector('#geoCommit')?.addEventListener('click', commitGeoSection);
    panel.querySelector('#geoCancel')?.addEventListener('click', () => {
      cancelGeo();
      setStatus('ジオリファレンスをキャンセルしました。');
      buildPanel();
    });
    panel.querySelector('#geoSurface')?.addEventListener('click', showGround);
    panel.querySelectorAll('button[data-rmgeo]').forEach((b) =>
      b.addEventListener('click', () => removeGeoSection(+b.dataset.rmgeo))
    );
  }
  panel.querySelectorAll('input[data-lyr]').forEach((cb) =>
    cb.addEventListener('change', () => {
      drawingVis[cb.dataset.lyr] = cb.checked;
      applyDrawingToggles();
    })
  );
  panel.querySelector('#labels').addEventListener('change', (e) => {
    labelsVisible = e.target.checked;
    applyDrawingToggles();
  });
  panel.querySelector('#gridv').addEventListener('change', (e) => {
    gridVisible = e.target.checked;
    applyDrawingToggles();
  });
  wireCommon();
}

function wireCommon() {
  panel.querySelector('#demo').addEventListener('click', loadDemo);
  panel.querySelector('#cad').addEventListener('change', (e) => {
    if (e.target.files[0]) onFile(e.target.files[0]);
  });
}

// ================= 起動 =================
loadDemo();
S.loop();
