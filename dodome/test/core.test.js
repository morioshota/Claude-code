/* =====================================================================
   土留め検討ツール — 計算コアの回帰テスト
     node test/core.test.js            隣の index.html を検証
     node test/core.test.js path.html  明示指定も可
   index.html の「① 計算コア ここから 〜 ここまで」に挟まれた区間だけを取り出し、
   DOM に触れずに純関数として検証する。
   ⚠ 区切りコメントを消すとこのテストが動かなくなる。
   ===================================================================== */
const fs = require('fs');
const path = require('path');

const file = process.argv[2] || path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(file, 'utf8');

const BEGIN = '/* ==================== ① 計算コア ここから';
const END   = '/* ==================== ① 計算コア ここまで ==================== */';
const a = html.indexOf(BEGIN), b = html.indexOf(END);
if (a < 0 || b < 0) { console.error('✗ 計算コアの区切りコメントが見つかりません'); process.exit(1); }
eval(html.slice(a, b));

let pass = 0, fail = 0;
function ok(name, cond, extra){
  if (cond) { pass++; }
  else { fail++; console.error('  ✗ ' + name + (extra != null ? '  → ' + extra : '')); }
}
function near(name, got, want, tol){
  const t = tol == null ? 1e-6 : tol;
  ok(name, Math.abs(got - want) <= t, 'got ' + got + ' / want ' + want);
}

/* ---------- 掘削形状 ---------- */
const trench = excavationGeometry({ type:'trench', L:30, B:2, H:3, n:0, sloped:false });
near('トレンチ 矩形の体積', trench.vBank, 180);
near('トレンチ 壁の総延長は両側', trench.wallLen, 60);
near('トレンチ 床付け面積', trench.bottomArea, 60);

const trenchS = excavationGeometry({ type:'trench', L:30, B:2, H:3, n:0.5, sloped:true });
near('トレンチ 台形断面の体積 (B+nH)H·L', trenchS.vBank, (2 + 0.5*3) * 3 * 30);
near('トレンチ 上端幅 B+2nH', trenchS.topW, 2 + 2*0.5*3);

const shaft = excavationGeometry({ type:'shaft', X:4, Y:3, H:3, n:0, sloped:false });
near('立坑 直壁の体積', shaft.vBank, 36);
near('立坑 壁は四周', shaft.wallLen, 14);

const shaftS = excavationGeometry({ type:'shaft', X:4, Y:3, H:3, n:0.5, sloped:true });
// 角錐台: H/6 (A下 + 4A中 + A上) = 3/6 (12 + 4×(5.5×4.5) + 7×6)
near('立坑 角錐台の体積（プリズマトイド）', shaftS.vBank, 3/6 * (12 + 4*(5.5*4.5) + 7*6), 1e-9);

/* ---------- 変化率 ---------- */
near('ほぐし換算', toLoose(100, 1.2), 120);
near('締固め換算', toCompact(100, 0.9), 90);
near('締固め→地山', compactToBank(90, 0.9), 100);
ok('C=0 でも落ちない', compactToBank(90, 0) === 0);

/* ---------- 土量収支 ---------- */
const bal = earthBalance(trench, { C:0.9, L:1.2, dens:1.8, vStruct:20, tBed:0.1, reuse:true, reuseRate:1 });
near('掘削（地山）', bal.vExcBank, 180);
near('基礎材（締固め後）= 床付け面積×厚', bal.vBedComp, 6);
near('埋戻し（締固め後）= 掘削−構造物−基礎材', bal.vBackComp, 154);
near('埋戻しに要る地山量 = 締固め÷C', bal.vBackBank, 154/0.9, 1e-9);
near('流用は「必要量」と「掘削量」の小さい方', bal.vReuseBank, 154/0.9, 1e-9);
near('残土 = 掘削 − 流用', bal.vSurBank, 180 - 154/0.9, 1e-9);
near('足りているので購入土は0', bal.vImpBank, 0);
near('掘削土の重量 = 地山×密度', bal.massExc, 324);

// 構造物が無いと埋戻しに要る地山量(200)が掘削量(180)を上回り、不足分が購入土になる
const balShort = earthBalance(trench, { C:0.9, L:1.2, dens:1.8, vStruct:0, tBed:0, reuse:true, reuseRate:1 });
near('埋戻しが掘削量を上回るときは全量流用', balShort.vReuseBank, 180);
near('不足分が購入土になる', balShort.vImpBank, 180/0.9 - 180, 1e-9);
near('全量流用なら残土は0', balShort.vSurBank, 0);
near('流用率50%なら流用は掘削量の半分まで', 
     earthBalance(trench, { C:0.9, L:1.2, dens:1.8, vStruct:0, tBed:0, reuse:true, reuseRate:0.5 }).vReuseBank, 90);

const bal2 = earthBalance(trench, { C:0.9, L:1.2, dens:1.8, vStruct:0, tBed:0, reuse:false, reuseRate:1 });
near('流用しない設定なら全量が残土', bal2.vSurBank, 180);
near('流用しない設定なら埋戻しは全量購入土', bal2.vImpBank, 180/0.9, 1e-9);

/* ---------- ダンプ ---------- */
near('ほぐし密度 = 地山密度 ÷ L', looseDensity(1.8, 1.2), 1.5);
const tl = truckLoad({ w:10, v:6 }, 1.5, false);
near('積載は容積で頭打ち（6 < 10/1.5=6.67）', tl.per, 6);
ok('頭打ちの理由が容積', tl.limit === '容積');
const tl2 = truckLoad({ w:4, v:6 }, 1.5, false);
near('積載は重量で頭打ち（4/1.5=2.67 < 6）', tl2.per, 4/1.5, 1e-9);
ok('頭打ちの理由が重量', tl2.limit === '重量');
near('山積みは容積1.2倍', truckLoad({ w:99, v:5 }, 1.5, true).per, 6, 1e-9);

const hp = haulPlan(100, 1.5, { w:10, v:6 }, { heap:false, trucks:2, workH:7, tripMin:20, loadMin:15 });
ok('延べ台数は切上げ', hp.loads === Math.ceil(100/6));
near('1サイクル = 片道×2＋積込荷卸', hp.cycleMin, 55);
ok('1日の回転数は切捨て', hp.tripsPerDay === Math.floor(420/55));
ok('日数 = 切上げ(延べ台数 ÷ (回転数×台数))', hp.days === Math.ceil(hp.loads / (hp.tripsPerDay*2)));
ok('運搬量0なら台数も日数も0', haulPlan(0, 1.5, { w:10, v:6 }, { heap:false, trucks:2, workH:7, tripMin:20, loadMin:15 }).days === 0);

/* ---------- 土圧 ---------- */
near('Ka = tan²(45−φ/2)  φ=30 → 1/3', rankineKa(30), 1/3, 1e-9);
near('Kp = tan²(45+φ/2)  φ=30 → 3', rankineKp(30), 3, 1e-9);
near('Ka·Kp = 1', rankineKa(28) * rankineKp(28), 1, 1e-9);

const soil = { gam:18, phi:30, coh:0, gwLevel:99, q:10 };
near('背面側圧 = Ka(γz+q)', backPressure(3, soil).total, (18*3 + 10)/3, 1e-9);
ok('水位が深ければ水圧なし', backPressure(3, soil).u === 0);

const wet = { gam:18, phi:30, coh:0, gwLevel:1, q:0 };
const w3 = backPressure(3, wet);
near('水位以深は有効重量 γ′ を使う', w3.pa, ((18*1) + (18-GW_UNIT)*2) / 3, 1e-9);
near('残留水圧 u = γw(z−hw)', w3.u, GW_UNIT*2, 1e-9);

const cohesive = { gam:18, phi:0, coh:60, gwLevel:99, q:0 };
ok('粘着力で主働が負になる範囲は0に丸める', backPressure(1, cohesive).total === 0);

/* ---------- 必要根入れ長 ---------- */
// 自立式・φ30・c=0・q=10・Fs=1.2 の手計算: 7.5D³ = (3+D)³ + 1.667(3+D)²  → D ≈ 3.68
const e = requiredEmbedment({ gam:18, phi:30, coh:0, gwLevel:99, q:10 }, 3, 1.2, D => 3 + D, -1);
ok('自立式の根入れが手計算と一致（±0.05m）', Math.abs(e.D - 3.68) < 0.05, 'D=' + e.D);
ok('自立式の根入れは収束する', e.converged === true);
const eFs = requiredEmbedment({ gam:18, phi:30, coh:0, gwLevel:99, q:10 }, 3, 2.0, D => 3 + D, -1);
ok('安全率を上げると根入れは深くなる', eFs.D > e.D, eFs.D + ' > ' + e.D);

// 切梁式：主働は「最下段切梁より下」だけを積分する（上は上段の切梁が受け持つ）。
// 手計算 H=5・段[1,3]・φ30・γ18・q10・Fs1.2:
//   15D³+45D² = 2(2+D)³ + 10.667(2+D)²   → D ≈ 2.0
const eS5 = requiredEmbedment({ gam:18, phi:30, coh:0, gwLevel:99, q:10 }, 5, 1.2, () => 3, +1, 3);
ok('切梁式の根入れが手計算と一致（H=5, ±0.05m）', Math.abs(eS5.D - 2.0) < 0.05, 'D=' + eS5.D);
// 手計算 H=8・段[1,3,5,7]: 22.5D²+15D³ = 2(1+D)³ + 22.667(1+D)²  → D ≈ 2.4
const eS8 = requiredEmbedment({ gam:18, phi:30, coh:0, gwLevel:99, q:10 }, 8, 1.2, () => 7, +1, 7);
ok('切梁式の根入れが手計算と一致（H=8, ±0.05m）', Math.abs(eS8.D - 2.43) < 0.05, 'D=' + eS8.D);
// ⚠ ここを 0 から積分すると、切梁より上の土圧が逆向きのモーメントになって打ち消し、
//   根入れがほぼ 0 で返る。zFrom を渡し忘れていないかの見張り。
const eBug = requiredEmbedment({ gam:18, phi:30, coh:0, gwLevel:99, q:10 }, 8, 1.2, () => 7, +1, 0);
ok('主働を壁頭から積分すると根入れが潰れる（zFrom の渡し忘れ検知）', eBug.D < 0.1, 'D=' + eBug.D);

near('最小根入れが計算値より大きければ最小値を採る', adoptEmbedment(0.02, 1.5), 1.5);
near('計算値のほうが大きければ計算値を採る', adoptEmbedment(3.2, 1.5), 3.2);
ok('計算値なし＋最小値0 なら null', adoptEmbedment(null, 0) === null);

/* ---------- 切梁の段位置 ---------- */
const lv = strutLevels(5, 1.0, 2.0, 1.0);
ok('段位置は 1.0 / 3.0（最下段は床付けから1m以上上）', JSON.stringify(lv) === '[1,3]', JSON.stringify(lv));
ok('浅い掘削では段が立たないことがある', strutLevels(1.5, 1.0, 2.0, 1.0).length <= 1);

/* ---------- 梁の解析 ---------- */
// 等分布 w=10 を 支点 [0, 4] で受ける単純梁：Mmax = wl²/8 = 20、反力は各 20
const sb = simpleBeamAnalysis(() => 10, [0, 4], 4, { dz:0.005 });
near('単純梁の反力（左）', sb.R[0], 20, 0.05);
near('単純梁の反力（右）', sb.R[1], 20, 0.05);
near('単純梁の最大曲げ wl²/8', Math.abs(sb.Mmax), 20, 0.05);
near('支間中央で最大', sb.zMmax, 2, 0.02);

// 反力の総和は荷重の総和に一致する（慣用法の単純梁法でも力は釣り合う）
const load = z => backPressure(z, soil).total;
const sb2 = simpleBeamAnalysis(load, [1, 3, 5.8], 5.8, { dz:0.005 });
const sumR = sb2.R.reduce((x, y) => x + y, 0);
near('反力の総和＝荷重の総和', sumR, integrate(load, 0, 5.8, 4000).area, 0.02);

// 片持ち：等分布 w=10、長さ4 → 先端固定側で M = wl²/2 = 80
const cb = cantileverMoments(() => 10, 4, { dz:0.005 });
near('片持ちの最大曲げ wl²/2', Math.abs(cb.Mmax), 80, 0.2);

/* ---------- 断面照査 ---------- */
const sc = sectionCheck(50, 1340, 180);
near('σ = M×1000 ÷ Z', sc.sigma, 50*1000/1340, 1e-9);
ok('許容内なら OK', sc.ok === true);
ok('許容超なら NG', sectionCheck(500, 1340, 180).ok === false);
ok('断面係数が未入力なら判定しない', sectionCheck(50, null, 180).ok === null);
near('腹起し M = R·l²/10', walerMoment(30, 3), 30*9/10, 1e-9);

/* ---------- 員数 ---------- */
const mat = materialCount(trench, { cat:'sheet', wid:400, wm:120 }, { H:3, D:1.5, head:0.3, pitch:1.5 });
near('矢板1枚の長さ = 掘削+根入れ+頭出し', mat.len, 4.8);
ok('枚数 = 壁総延長 ÷ 有効幅', mat.count === Math.ceil(60/0.4));
near('重量 = 壁面積 × 単位質量', mat.massT, 60*4.8*120/1000, 1e-9);
const matS = materialCount(shaft, { cat:'sheet', wid:400, wm:120 }, { H:3, D:1.5, head:0.3, pitch:1.5 });
ok('立坑は隅角部4枚を足す', matS.count === Math.ceil(14/0.4) + 4);
const matH = materialCount(trench, { cat:'hpile', wid:null, wm:71.8 }, { H:3, D:1.5, head:0.3, pitch:1.5 });
ok('親杭は本数で拾う', matH.unit === '本' && matH.count === Math.ceil(60/1.5) + 2);
near('親杭の重量 = 本数 × 長さ × kg/m', matH.massT, matH.count * 4.8 * 71.8 / 1000, 1e-9);
ok('規格値が無ければ重量は出さない', materialCount(trench, { cat:'sheet', wid:400, wm:null }, { H:3, D:1, head:0.3, pitch:1.5 }).massT === null);

/* ---------- 構造検討のまとめ ---------- */
const spar = { gam:18, phi:30, coh:0, gwLevel:99, q:10, Fs:1.2, sigmaA:180, Z:1340 };
const opt  = { method:'sheet_strut', strutFirst:1.0, strutPitch:2.0, strutSpan:3.0, virtualSupport:0.8, Dmin:0 };
const t5 = excavationGeometry({ type:'trench', L:30, B:2, H:5, n:0, sloped:false });
const r1 = structuralCheck(t5, spar, opt);
ok('切梁式と判定される', r1.mode === 'strut');
ok('段位置が入る', r1.levels.length === 2);
ok('切梁の本数ぶん反力が出る', r1.struts.length === 2);
near('軸力 = 反力 × 水平間隔', r1.struts[0].N, r1.struts[0].R * 3, 1e-9);
ok('断面照査まで到達する', r1.check.sigma > 0);

const r2 = structuralCheck(t5, spar, Object.assign({}, opt, { Dmin:1.5 }));
ok('最小根入れが効くと採用値が下限になる', r2.D >= 1.5);
ok('どちらで決まったかを返す', typeof r2.DgovernedByMin === 'boolean');
ok('計算値も残している', r2.Dcalc != null);

const r3 = structuralCheck(t5, spar, Object.assign({}, opt, { method:'sheet_self' }));
ok('自立式と判定される', r3.mode === 'cantilever');
ok('自立式に切梁は無い', r3.struts.length === 0);
ok('自立式の根入れは切梁式より深い', r3.D > r1.D, r3.D + ' > ' + r1.D);

// 掘削が深くなれば根入れも深くなる（単調性）。切梁式で潰れていないことの担保も兼ねる。
const dep = [3, 5, 8, 12].map(H => structuralCheck(
  excavationGeometry({ type:'trench', L:30, B:2, H:H, n:0, sloped:false }), spar, opt).Dcalc);
ok('切梁式の根入れは掘削深さに対して単調に増える', dep.every((d, i) => i === 0 || d > dep[i-1]), JSON.stringify(dep));
ok('切梁式でも実質のある根入れが出る（最小値に頼らない）', dep.every(d => d > 0.5), JSON.stringify(dep));

const r4 = structuralCheck(t5, spar, Object.assign({}, opt, { method:'open' }));
ok('オープンカットは構造検討しない', r4.mode === 'none');

/* ---------- 施工ステップ ---------- */
const steps = buildSteps('sheet_strut', [1, 3], 5);
ok('段数ぶんステップが増える', steps.length === 8, steps.length);
ok('最初は現況（掘削0）', steps[0].dig === 0 && steps[0].walls === false);
ok('最後は床付けまで掘る', steps[steps.length-1].dig === 5);
ok('掘削深さは単調に増える', steps.every((s, i) => i === 0 || s.dig >= steps[i-1].dig));
ok('オープンカットは土留めを立てない', buildSteps('open', [], 3).every(s => s.walls === false));

/* ---------- まとめ ---------- */
console.log((fail === 0 ? '✓ ' : '✗ ') + pass + ' / ' + (pass + fail) + ' 項目パス');
process.exit(fail === 0 ? 0 : 1);
