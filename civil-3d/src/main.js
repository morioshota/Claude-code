import './style.css';
import * as THREE from 'three';
import { createScene } from './viewer/scene.js';
import { makeAlignment } from './core/alignment.js';
import { loadCad } from './core/cad.js';
import { buildDrawing } from './viewer/drawing.js';
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
    const sz = drawing.worldBox.getSize(new THREE.Vector3());
    hud.innerHTML =
      `<b>${esc(drawing.source)}</b><br>` +
      `${drawing.layerNames.length}レイヤ ／ 図面範囲 ${sz.x.toFixed(1)}×${sz.y.toFixed(1)} m相当<br>` +
      `<span style="color:#7f8896">図面ビュー。左ドラッグ=回転 / 右=移動 / ホイール=ズーム</span>`;
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
  panel.innerHTML = `
    <h1>土木3Dビルダー <span class="badge">図面ビュー</span></h1>
    <div class="sub">読み込んだ図面をレイヤ別に表示。次段階で平面図から3D起こし(押し出し・断面)に対応します。</div>
    <div class="group">
      <div class="title">データ</div>
      <div class="row"><button class="filebtn">別の図面を読み込む…<input type="file" id="cad" accept=".dwg,.dxf"/></button></div>
      <div class="note" id="status"></div>
      <div class="row" style="margin-top:8px"><button id="demo">デモ現場に戻る</button></div>
    </div>
    <div class="group">
      <div class="title">レイヤ（表示/非表示）</div>
      <div class="row"><label><input type="checkbox" id="labels" ${labelsVisible ? 'checked' : ''}/>文字ラベル</label></div>
      <div class="row"><label><input type="checkbox" id="gridv" ${gridVisible ? 'checked' : ''}/>基準グリッド</label></div>
      <div style="border-top:1px solid #262d38;margin:6px 0 4px"></div>
      ${rows}
    </div>
  `;
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
