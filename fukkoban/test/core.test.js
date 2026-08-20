/**
 * 覆工板 最適勾配 検討ツール — 計算コア 回帰テスト
 *
 *   使い方:  node test/core.test.js
 *
 * index.html 内の計算コア（DOM非依存の純関数群）を抽出して検証する。
 * 計算ロジックを変更したら必ず実行すること。
 */
const fs = require('fs');
const path = require('path');

const HTML = path.join(__dirname, '..', 'index.html');

// ---- index.html から計算コアを抽出 ----
function loadCore() {
  const html = fs.readFileSync(HTML, 'utf8');
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const body = blocks[blocks.length - 1];
  const start = body.indexOf('function solve3x3');
  const end = body.indexOf('/* ====', start); // 計算コアの直後のセクション区切り
  if (start < 0 || end < 0) throw new Error('計算コアを抽出できませんでした（index.html の構造が変わった可能性）');
  const core = body.slice(start, end);
  const sandbox = {};
  new Function('exports', core + '\nObject.assign(exports,{solve3x3,buildPoints,olsFit,evalForSlopes,optimizePlane,computeResults});')(sandbox);
  return sandbox;
}

const C = loadCore();

// ---- 簡易テストランナー ----
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '  → ' + detail : '')); }
}
function near(a, b, tol) { return Math.abs(a - b) <= tol; }
function section(t) { console.log('\n' + t); }

// 等間隔の位置配列を作るヘルパ
const linspace = (n, d) => Array.from({ length: n }, (_, i) => i * d);

/* =========================================================
   1. 既知平面の完全復元（等間隔）
========================================================= */
section('1. 既知平面の復元（等間隔）');
{
  const Spos = linspace(6, 5), Tpos = linspace(5, 1.5);
  const A = 100, GS = 0.005, GT = -0.02;
  const grid = Spos.map(S => Tpos.map(T => A + GS * S + GT * T));
  const p = C.optimizePlane(C.buildPoints(grid, Spos, Tpos), 'balance', {});
  check('縦断勾配 gS を復元', near(p.gS, GS, 1e-9), 'got ' + p.gS);
  check('横断勾配 gT を復元', near(p.gT, GT, 1e-9), 'got ' + p.gT);
  check('切片 a を復元', near(p.a, A, 1e-9), 'got ' + p.a);
  const r = C.computeResults(grid, Spos, Tpos, p);
  check('完全平面なので RMS ≈ 0', r.rms < 1e-9, 'RMS=' + r.rms);
}

/* =========================================================
   2. 既知平面の完全復元（非等間隔）
========================================================= */
section('2. 既知平面の復元（非等間隔）');
{
  const Spos = [0, 3, 3.5, 9, 10];   // 不等間隔
  const Tpos = [0, 1, 4, 4.5];       // 不等間隔
  const A = 80, GS = 0.006, GT = -0.018;
  const grid = Spos.map(S => Tpos.map(T => A + GS * S + GT * T));
  const p = C.optimizePlane(C.buildPoints(grid, Spos, Tpos), 'balance', {});
  check('非等間隔でも gS を復元', near(p.gS, GS, 1e-9), 'got ' + p.gS);
  check('非等間隔でも gT を復元', near(p.gT, GT, 1e-9), 'got ' + p.gT);
  const r = C.computeResults(grid, Spos, Tpos, p);
  check('非等間隔 完全平面 RMS ≈ 0', r.rms < 1e-9, 'RMS=' + r.rms);
}

/* =========================================================
   3. 3モードの挙動
========================================================= */
section('3. 最適化モードの挙動（ノイズあり）');
{
  const Spos = linspace(6, 5), Tpos = linspace(5, 1.5);
  // 再現性のある擬似乱数
  let seed = 42;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 - 0.5; };
  const grid = Spos.map(S => Tpos.map(T => 100 + 0.004 * S - 0.02 * T + rnd() * 0.02));
  const pts = C.buildPoints(grid, Spos, Tpos);

  const bal = C.optimizePlane(pts, 'balance', {});
  const abv = C.optimizePlane(pts, 'above', {});
  const abs = C.optimizePlane(pts, 'absmin', {});
  const rBal = C.computeResults(grid, Spos, Tpos, bal);
  const rAbv = C.computeResults(grid, Spos, Tpos, abv);
  const rAbs = C.computeResults(grid, Spos, Tpos, abs);

  check('above: 全点で覆工面が既設以上（最小Δ ≧ 0）', rAbv.dmin >= -1e-9, 'dmin=' + rAbv.dmin);
  check('balance: RMS が3モード中で最小', rBal.rms <= rAbv.rms + 1e-9 && rBal.rms <= rAbs.rms + 1e-9,
    `bal=${rBal.rms} abv=${rAbv.rms} abs=${rAbs.rms}`);
  const maxAbs = r => Math.max(Math.abs(r.dmax), Math.abs(r.dmin));
  check('absmin: 最大|Δ| が3モード中で最小', maxAbs(rAbs) <= maxAbs(rBal) + 1e-9 && maxAbs(rAbs) <= maxAbs(rAbv) + 1e-9,
    `abs=${maxAbs(rAbs)} bal=${maxAbs(rBal)} abv=${maxAbs(rAbv)}`);
  check('absmin: Δ が ± 対称', near(rAbs.dmax, -rAbs.dmin, 1e-6), `dmax=${rAbs.dmax} dmin=${rAbs.dmin}`);
}

/* =========================================================
   4. 欠損セル（null）の扱い
========================================================= */
section('4. 欠損セルの扱い');
{
  const Spos = linspace(5, 4), Tpos = linspace(4, 2);
  const grid = Spos.map(S => Tpos.map(T => 50 + 0.003 * S - 0.015 * T));
  grid[2][1] = null; // 欠損させる
  const pts = C.buildPoints(grid, Spos, Tpos);
  check('null セルが点群から除外される', pts.length === 5 * 4 - 1, 'count=' + pts.length);
  const p = C.optimizePlane(pts, 'balance', {});
  check('欠損があっても勾配を復元', near(p.gS, 0.003, 1e-9) && near(p.gT, -0.015, 1e-9));
  const r = C.computeResults(grid, Spos, Tpos, p);
  check('deltas の欠損位置が null のまま', r.deltas[2][1] === null);
  check('有効点数 n が欠損を除いた数', r.n === 19, 'n=' + r.n);
}

/* =========================================================
   5. 勾配のクランプと丸め
========================================================= */
section('5. クランプ・丸め');
{
  const Spos = linspace(6, 5), Tpos = linspace(5, 1.5);
  const grid = Spos.map(S => Tpos.map(T => 100 + 0.02 * S - 0.05 * T)); // 急勾配
  const pts = C.buildPoints(grid, Spos, Tpos);

  const cl = C.optimizePlane(pts, 'balance', { clampT: true, gTmin: -0.01, gTmax: 0 });
  check('横断勾配が下限 −1% でクランプされる', near(cl.gT, -0.01, 1e-9), 'gT=' + cl.gT);

  const cs = C.optimizePlane(pts, 'balance', { clampS: true, gSmin: 0, gSmax: 0.005 });
  check('縦断勾配が上限 +0.5% でクランプされる', near(cs.gS, 0.005, 1e-9), 'gS=' + cs.gS);

  const rd = C.optimizePlane(pts, 'balance', { round: true, roundUnit: 0.001 }); // 0.1%単位
  check('勾配が 0.1% 単位に丸められる',
    near(rd.gS * 1000 - Math.round(rd.gS * 1000), 0, 1e-9) && near(rd.gT * 1000 - Math.round(rd.gT * 1000), 0, 1e-9),
    `gS=${rd.gS} gT=${rd.gT}`);
}

/* =========================================================
   6. 数値的な頑健性
========================================================= */
section('6. 頑健性');
{
  // 全点が同一高さ（フラット）→ 勾配 0 になるべき
  const Spos = linspace(4, 3), Tpos = linspace(4, 3);
  const flat = Spos.map(() => Tpos.map(() => 12.345));
  const p = C.optimizePlane(C.buildPoints(flat, Spos, Tpos), 'balance', {});
  check('フラットな面 → 勾配 ≈ 0', near(p.gS, 0, 1e-9) && near(p.gT, 0, 1e-9));
  check('フラットな面 → 切片 = その高さ', near(p.a, 12.345, 1e-9));

  // solve3x3 が特異行列で null を返す
  check('solve3x3 が特異行列を検出', C.solve3x3([[1, 2, 3], [2, 4, 6], [3, 6, 9]], [1, 2, 3]) === null);
}

/* =========================================================
   結果
========================================================= */
console.log('\n' + '='.repeat(46));
console.log(`  PASS ${pass} / FAIL ${fail}`);
console.log('='.repeat(46));
process.exit(fail === 0 ? 0 : 1);
