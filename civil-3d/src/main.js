import './style.css';
import * as THREE from 'three';
import { createScene } from './viewer/scene.js';
import { makeAlignment } from './core/alignment.js';
import { loadCad } from './core/cad.js';
import { buildDrawing } from './viewer/drawing.js';
import { buildShaft, buildTraceLine, buildTraceDots, buildPitColumn } from './viewer/extrude.js';
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
  drawing.group.visible = false;
  if (shaftGroup) S.world.remove(shaftGroup);
  pitsGroup = null;
  pitCount = 0;
  placingPit = false;
  shaftGroup = new THREE.Group();
  shaftGroup.name = 'shaft-model';
  const shaft = buildShaft(pts, depthValue, { topY: 0, color: 0x4aa3ff });
  shaftGroup.add(shaft);
  // 地表(GL)参照の枠
  const b = new THREE.Box3().setFromObject(shaft);
  const glPts = [
    new THREE.Vector3(b.min.x, 0, b.min.z), new THREE.Vector3(b.max.x, 0, b.min.z),
    new THREE.Vector3(b.max.x, 0, b.max.z), new THREE.Vector3(b.min.x, 0, b.max.z),
    new THREE.Vector3(b.min.x, 0, b.min.z),
  ];
  shaftGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(glPts),
    new THREE.LineBasicMaterial({ color: 0x9be89b })));
  S.world.add(shaftGroup);
  S.frame(new THREE.Box3().setFromObject(shaftGroup));
  buildPanel();
  const area = polygonArea(pts);
  setStatus(`3Dを生成: 深さ ${depthValue}m ／ 底面積 約${area.toFixed(1)}㎡ ／ 掘削体積 約${(area * depthValue).toFixed(1)}㎥`);
  updateHud();
}

function backToDrawing() {
  if (shaftGroup) {
    S.world.remove(shaftGroup);
    shaftGroup.traverse((o) => {
      o.geometry?.dispose?.();
      o.material?.dispose?.();
    });
    shaftGroup = null;
  }
  pitsGroup = null;
  pitCount = 0;
  placingPit = false;
  clearTrace();
  drawing.group.visible = true;
  S.frame(drawing.worldBox, { front: true });
  buildPanel();
  updateHud();
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
  if (placingPit) {
    const h = planeHit(ev, yPlane);
    if (h) placePitAt(h.x, h.z);
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
    if (shaftGroup) {
      const s = shaftGroup.getObjectByName('shaft');
      const area = s?.userData?.ring ? polygonArea(s.userData.ring) : 0;
      hud.innerHTML =
        `<b>${esc(drawing.source)} — 3D立坑</b><br>` +
        `深さ ${depthValue} m ／ 底面積 約${area.toFixed(1)} ㎡ ／ 掘削体積 約${(area * depthValue).toFixed(1)} ㎥<br>` +
        `<span style="color:#7f8896">左ドラッグ=回転 / 右=移動 / ホイール=ズーム</span>`;
    } else {
      const sz = drawing.worldBox.getSize(new THREE.Vector3());
      hud.innerHTML =
        `<b>${esc(drawing.source)}</b><br>` +
        `${drawing.layerNames.length}レイヤ ／ 図面範囲 ${sz.x.toFixed(1)}×${sz.y.toFixed(1)} m相当<br>` +
        `<span style="color:#7f8896">図面ビュー。左ドラッグ=回転 / 右=移動 / ホイール=ズーム</span>`;
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
  const inShaft = !!shaftGroup;
  panel.innerHTML = `
    <h1>土木3Dビルダー <span class="badge">${inShaft ? '3Dモデル' : '図面ビュー'}</span></h1>
    <div class="sub">平面図の輪郭をトレースして深さ方向に押し出し、立坑(土留め/掘削)の3Dを起こします。</div>
    <div class="group">
      <div class="title">データ</div>
      <div class="row"><button class="filebtn">別の図面を読み込む…<input type="file" id="cad" accept=".dwg,.dxf"/></button></div>
      <div class="note" id="status"></div>
      <div class="row" style="margin-top:8px"><button id="demo">デモ現場に戻る</button></div>
    </div>
    <div class="group">
      <div class="title">3D起こし（押し出し）</div>
      ${inShaft
        ? `<div class="note">深さ ${depthValue}m で生成済み。輪郭をやり直す場合は図面に戻ってください。</div>
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
    </div>` : ''}
    <div class="group">
      <div class="title">レイヤ（表示/非表示）</div>
      <div class="row"><label><input type="checkbox" id="labels" ${labelsVisible ? 'checked' : ''}/>文字ラベル</label></div>
      <div class="row"><label><input type="checkbox" id="gridv" ${gridVisible ? 'checked' : ''}/>基準グリッド</label></div>
      <div style="border-top:1px solid #262d38;margin:6px 0 4px"></div>
      ${rows}
    </div>
  `;
  if (inShaft) {
    panel.querySelector('#backBtn').addEventListener('click', backToDrawing);
    const ta = panel.querySelector('#pitLayers');
    ta.addEventListener('input', (e) => (pitLayersText = e.target.value));
    panel.querySelector('#placePit').addEventListener('click', startPlacePit);
    panel.querySelectorAll('button[data-rmpit]').forEach((b) =>
      b.addEventListener('click', () => removePit(b.dataset.rmpit))
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
