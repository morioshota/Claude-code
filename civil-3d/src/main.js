import './style.css';
import * as THREE from 'three';
import { createScene } from './viewer/scene.js';
import { makeAlignment } from './core/alignment.js';
import { parseDxf, longestPolyline } from './core/dxf.js';
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

const DATUM = 95; // 縦倍率の基準標高(これを中心に上下を強調)
let model = null; // { alignment, sections, pits, structures, temp }

function clearWorld() {
  while (S.world.children.length) {
    const c = S.world.children.pop();
    c.traverse?.((o) => {
      o.geometry?.dispose?.();
      o.material?.dispose?.();
    });
    S.world.remove(c);
  }
}

function rebuild() {
  clearWorld();
  const { alignment, sections, pits, structures, temp } = model;
  S.world.add(buildCorridor(alignment, sections));
  S.world.add(buildAlignmentLine(alignment, sections));
  S.world.add(buildSectionLines(alignment, sections));
  S.world.add(buildTestPits(alignment, sections, pits));
  S.world.add(buildBoxes(alignment, sections, structures, 'structures'));
  S.world.add(buildBoxes(alignment, sections, temp, 'temp'));
  applyToggles();
  applyExaggeration(exag);

  const box = new THREE.Box3().setFromObject(S.world);
  if (!box.isEmpty()) S.frame(box);
  updateHud();
}

function loadDemo() {
  const alignment = makeAlignment(demoAlignmentPoints());
  model = {
    alignment,
    sections: demoSections(alignment),
    pits: demoTestPits(),
    structures: demoStructures(),
    temp: demoTempWorks(),
    source: 'デモ現場',
  };
  rebuild();
}

// ---- レイヤ表示切替 ----
const toggles = {
  corridor: true,
  wire: false,
  alignment: true,
  sections: true,
  pits: true,
  structures: true,
  temp: true,
  grid: true,
};
function applyToggles() {
  const find = (n) => S.world.getObjectByName(n);
  find('corridor') && (find('corridor').getObjectByName('surface').visible = toggles.corridor);
  find('corridor') && (find('corridor').getObjectByName('wire').visible = toggles.wire);
  find('alignment') && (find('alignment').visible = toggles.alignment);
  find('sections') && (find('sections').visible = toggles.sections);
  find('pits') && (find('pits').visible = toggles.pits);
  find('structures') && (find('structures').visible = toggles.structures);
  find('temp') && (find('temp').visible = toggles.temp);
  S.grid.visible = toggles.grid;
}

// ---- 縦倍率(高低差の強調) ----
let exag = 1;
function applyExaggeration(k) {
  S.world.scale.y = k;
  S.world.position.y = DATUM * (1 - k);
}

// ---- DXF読み込み ----
async function onDxf(file) {
  const text = await file.text();
  let parsed;
  try {
    parsed = parseDxf(text);
  } catch (e) {
    renderLayers(null, `解析に失敗しました: ${e.message}`);
    return;
  }
  renderLayers(parsed, null, file.name);
}

function renderLayers(parsed, err, fname) {
  const host = document.getElementById('layers');
  if (err) {
    host.innerHTML = `<div class="note" style="color:#e88">${err}</div>`;
    return;
  }
  const names = Object.keys(parsed.layers).sort();
  if (!names.length) {
    host.innerHTML = `<div class="note">線オブジェクトが見つかりませんでした。</div>`;
    return;
  }
  host.innerHTML =
    `<div class="note">${fname}: ${names.length}レイヤ。線形にするレイヤを選んでください。</div>` +
    names
      .map(
        (n) =>
          `<div class="lyr"><span>${escapeHtml(n)} <span style="color:#7f8896">(${parsed.layers[n].count})</span></span>` +
          `<button data-lyr="${escapeHtml(n)}" style="width:auto;padding:3px 8px;font-size:11px">線形に採用</button></div>`
      )
      .join('');
  host.querySelectorAll('button[data-lyr]').forEach((b) => {
    b.addEventListener('click', () => {
      const layer = parsed.layers[b.dataset.lyr];
      const pl = longestPolyline(layer);
      if (!pl || pl.length < 2) {
        alert('このレイヤに線形にできるポリラインがありません。');
        return;
      }
      // DXFの線形を採用し、断面はデモ断面を流用(横断のジオリファレンスは今後対応)
      const alignment = makeAlignment(pl);
      model = {
        alignment,
        sections: demoSections(alignment),
        pits: [],
        structures: [],
        temp: [],
        source: `DXF: ${fname} / ${b.dataset.lyr}`,
      };
      rebuild();
    });
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// ---- HUD ----
function updateHud() {
  if (!model) return;
  const a = model.alignment;
  hud.innerHTML =
    `<b>${escapeHtml(model.source)}</b><br>` +
    `延長 ${a.length.toFixed(1)} m ／ 断面 ${model.sections.length} ／ ` +
    `試験掘り ${model.pits.length} ／ 構造物 ${model.structures.length}<br>` +
    `<span style="color:#7f8896">左ドラッグ=回転 / 右ドラッグ=移動 / ホイール=ズーム。オブジェクトをクリックで情報表示</span>`;
}

// ---- クリックで情報表示 ----
const ray = new THREE.Raycaster();
const mouse = new THREE.Vector2();
canvas.addEventListener('click', (e) => {
  const r = canvas.getBoundingClientRect();
  mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  ray.setFromCamera(mouse, S.camera);
  const hits = ray.intersectObjects(S.world.children, true);
  const hit = hits.find((h) => h.object.userData && (h.object.userData.label || h.object.userData.pit));
  const info = document.getElementById('pickinfo');
  if (hit) {
    const u = hit.object.userData;
    info.textContent = u.pit
      ? `${u.pit} / ${u.layer} 層厚 ${u.thickness}m`
      : `${u.label || u.id}`;
  } else if (info) {
    info.textContent = '—';
  }
});

// ---- パネル UI ----
function buildPanel() {
  const tog = (key, label, sw) =>
    `<div class="row"><label><input type="checkbox" data-t="${key}" ${toggles[key] ? 'checked' : ''}/>` +
    (sw ? `<span class="swatch" style="background:${sw}"></span>` : '') +
    `${label}</label></div>`;

  panel.innerHTML = `
    <h1>土木3Dビルダー <span class="badge">プロト</span></h1>
    <div class="sub">平面図の線形に横断図をロフトして検討用の3Dを生成します。試験掘り・仮設・構造物の当たり確認用。</div>

    <div class="group">
      <div class="title">表示レイヤ</div>
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
      <div class="row"><input type="range" id="exag" min="1" max="8" step="0.5" value="1"/><span class="val" id="exagv">×1.0</span></div>
    </div>

    <div class="group">
      <div class="title">データ</div>
      <div class="row"><button class="filebtn">DXFを読み込む…<input type="file" id="dxf" accept=".dxf"/></button></div>
      <div id="layers"></div>
      <div class="row" style="margin-top:8px"><button id="demo" class="primary">デモ現場を読み込む</button></div>
      <div class="note">DXFは平面図の線形(ポリライン)を採用します。横断図のジオリファレンス取り込みは次段階の実装予定。</div>
    </div>

    <div class="group">
      <div class="title">選択情報</div>
      <div class="note" id="pickinfo">—</div>
    </div>
  `;

  panel.querySelectorAll('input[data-t]').forEach((cb) => {
    cb.addEventListener('change', () => {
      toggles[cb.dataset.t] = cb.checked;
      applyToggles();
    });
  });
  const exagEl = panel.querySelector('#exag');
  exagEl.addEventListener('input', () => {
    exag = parseFloat(exagEl.value);
    panel.querySelector('#exagv').textContent = `×${exag.toFixed(1)}`;
    applyExaggeration(exag);
  });
  panel.querySelector('#demo').addEventListener('click', loadDemo);
  panel.querySelector('#dxf').addEventListener('change', (e) => {
    if (e.target.files[0]) onDxf(e.target.files[0]);
  });
}

buildPanel();
loadDemo();
S.loop();
