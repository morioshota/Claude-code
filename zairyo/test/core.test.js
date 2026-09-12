/**
 * 材料在庫管理表 — 計算コア 回帰テスト
 *
 *   使い方:  node test/core.test.js
 *
 * index.html 内の「計算コア」（DOM 非依存の純関数群）を抽出して検証する。
 * 計算ロジックを変更したら必ず実行すること。
 */
const fs = require('fs');
const path = require('path');
const HTML = path.join(__dirname, '..', 'index.html');

function loadCore(){
  const html = fs.readFileSync(HTML, 'utf8');
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const body = blocks[blocks.length - 1];
  const start = body.indexOf('function ymd(');
  const end = body.indexOf('ここから下は画面（DOM）側', start);
  if (start < 0 || end < 0) throw new Error('計算コアを抽出できなかった（index.html の構造が変わった可能性）');
  const core = body.slice(start, body.lastIndexOf('/* =====', end));
  const names = ['ymd','parseYmd','addDays','diffDays','monthKey','dateList','num','round','fmtQty','fmtYen',
    'signedQty','amountOf','movementsOf','stockAt','currentStock','lastMoveDate','usageStats','suggestRop',
    'ropOf','daysLeft','orderQtySuggest','typicalOrderQty','statusOf','unitCostOf','seriesStock','seriesUsage','movingAvg',
    'purchaseByMonth','purchaseByMaterial','csvCell','toCSV','parseCSV','uid','niceStep',
    'STATUS_ORDER','IDLE_DAYS','NEAR_RATIO'];
  const sandbox = {};
  new Function('exports', core + '\nObject.assign(exports,{' + names.join(',') + '});')(sandbox);
  return sandbox;
}
const C = loadCore();

let pass = 0, fail = 0;
function check(name, cond, detail){
  if (cond){ pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '  → ' + detail : '')); }
}
function eq(a, b, tol){ return Math.abs(a - b) <= (tol === undefined ? 1e-9 : tol); }
function section(t){ console.log('\n' + t); }

/* 共通のテストデータ ---------------------------------------------------- */
const M = { id:'m1', name:'単管パイプ', code:'TP-3000', category:'仮設材', unit:'本',
            opening:100, openingDate:'2026-09-01', leadDays:3, safetyDays:2, price:1000 };
const M2 = { id:'m2', name:'クランプ', category:'仮設材', unit:'個', opening:0, openingDate:'2026-09-01' };
const MV = [
  { id:'a', date:'2026-09-02', materialId:'m1', type:'out', qty:10 },
  { id:'b', date:'2026-09-03', materialId:'m1', type:'out', qty:20 },
  { id:'c', date:'2026-09-05', materialId:'m1', type:'in',  qty:50, unitPrice:1100 },
  { id:'d', date:'2026-09-08', materialId:'m1', type:'out', qty:10 },
  { id:'e', date:'2026-09-10', materialId:'m1', type:'adj', qty:-5 },
  { id:'f', date:'2026-09-06', materialId:'m2', type:'in',  qty:100, amount:26000 },
  { id:'g', date:'2026-08-20', materialId:'m1', type:'out', qty:999 },  // 初期在庫日より前 → 数えない
];

/* ====================================================================== */
section('1. 日付');
check('addDays 月またぎ', C.addDays('2026-09-30', 1) === '2026-10-01');
check('addDays 戻り',     C.addDays('2026-03-01', -1) === '2026-02-28');
check('diffDays',         C.diffDays('2026-09-01', '2026-09-12') === 11);
check('diffDays 逆向き',  C.diffDays('2026-09-12', '2026-09-01') === -11);
check('diffDays 年またぎ', C.diffDays('2025-12-31', '2026-01-01') === 1);
check('monthKey',         C.monthKey('2026-09-12') === '2026-09');
check('dateList 両端含む', C.dateList('2026-09-01','2026-09-05').length === 5);
check('parseYmd 不正',    C.parseYmd('abc') === null);

section('2. 数値・書式');
check('num 既定値',    C.num('', 7) === 7 && C.num(null, 7) === 7 && C.num('x', 7) === 7);
check('num 0 は 0',    C.num(0, 7) === 0);
check('round',         C.round(1.005, 2) === 1.01 && C.round(2.675, 2) === 2.68);
check('fmtQty 整数',   C.fmtQty(12.0) === '12');
check('fmtQty 小数',   C.fmtQty(12.345) === '12.35');
check('fmtYen 桁区切り', C.fmtYen(1234567) === '1,234,567');

section('3. 入出庫の符号と金額');
check('out は負',  C.signedQty({type:'out', qty:10}) === -10);
check('in は正',   C.signedQty({type:'in',  qty:10}) === 10);
check('out に負数を入れても負', C.signedQty({type:'out', qty:-10}) === -10);
check('adj は符号そのまま', C.signedQty({type:'adj', qty:-5}) === -5);
check('amount 優先',  C.amountOf({qty:10, unitPrice:100, amount:900}) === 900);
check('単価×数量',    C.amountOf({qty:10, unitPrice:100}) === 1000);
check('金額なしは0',  C.amountOf({qty:10}) === 0);

section('4. 在庫');
check('現在庫 = 100-10-20+50-10-5', C.currentStock(M, MV) === 105,
      '実際: ' + C.currentStock(M, MV));
check('初期在庫日より前の記録は数えない', C.currentStock(M, MV) === 105);
check('指定日まで（9/3時点）', C.stockAt(M, MV, '2026-09-03') === 70, '実際: ' + C.stockAt(M, MV, '2026-09-03'));
check('指定日まで（9/6時点）', C.stockAt(M, MV, '2026-09-06') === 120);
check('別品目は混ざらない',   C.currentStock(M2, MV) === 100);
check('最終入出庫日',        C.lastMoveDate(MV, 'm1') === '2026-09-10');
check('記録のない品目は null', C.lastMoveDate(MV, 'zzz') === null);

section('5. 使用量の統計');
{
  const u = C.usageStats(MV, 'm1', '2026-09-12', 14);
  check('期間中の出庫合計 40', u.total === 40, '実際: ' + u.total);
  check('使った日数 3',       u.activeDays === 3);
  check('暦日平均 40/14',     eq(u.perCalendarDay, 40/14, 1e-3), '実際: ' + u.perCalendarDay);
  check('使った日の平均 40/3', eq(u.perActiveDay, 40/3, 1e-3));
  check('1回あたり 40/3',      eq(u.perEvent, 40/3, 1e-3));
  check('最大/日 20',          u.maxPerDay === 20);
  const u7 = C.usageStats(MV, 'm1', '2026-09-12', 7);
  check('7日窓は 9/8 の10本だけ', u7.total === 10, '実際: ' + u7.total);
  const u0 = C.usageStats(MV, 'm2', '2026-09-12', 14);
  check('出庫が無ければ 0', u0.total === 0 && u0.perCalendarDay === 0 && u0.perActiveDay === 0);
  check('入庫は使用量に入らない', C.usageStats(MV, 'm2', '2026-09-12', 30).total === 0);
}

section('6. 発注点・残日数');
check('目安 = 平均×(リード+安全)', C.suggestRop(4, 3, 2) === 20);
check('平均0なら0',               C.suggestRop(0, 3, 2) === 0);
check('明示値が優先', C.ropOf({reorderPoint:80, leadDays:3, safetyDays:2}, 4).value === 80);
check('明示値ありは auto=false', C.ropOf({reorderPoint:80}, 4).auto === false);
check('未設定なら自動計算', C.ropOf({leadDays:3, safetyDays:2}, 4).value === 20);
check('未設定は auto=true', C.ropOf({leadDays:3, safetyDays:2}, 4).auto === true);
check('発注点0の明示も尊重', C.ropOf({reorderPoint:0, leadDays:3, safetyDays:2}, 4).value === 0);
check('残日数 = 在庫/平均', C.daysLeft(100, 4) === 25);
check('平均0なら残日数なし', C.daysLeft(100, 0) === null);
check('発注数量の目安 = 発注点×2−在庫', C.orderQtySuggest(30, 50) === 70);
check('足りている時は0',   C.orderQtySuggest(200, 50) === 0);
check('発注点0なら0',      C.orderQtySuggest(10, 0) === 0);
check('前回の入庫数を拾う', C.typicalOrderQty(MV, 'm1') === 50, '実際: ' + C.typicalOrderQty(MV, 'm1'));
check('入庫がなければ0',   C.typicalOrderQty(MV, 'zzz') === 0);

section('7. 状態判定');
{
  const T = '2026-09-12';
  check('在庫0は欠品',   C.statusOf({stock:0, rop:50, avgPerDay:4, coverDays:5, today:T}).level === 'crit');
  check('マイナスも欠品', C.statusOf({stock:-3, rop:50, avgPerDay:4, coverDays:5, today:T}).level === 'crit');
  check('発注点ちょうどは要発注', C.statusOf({stock:50, rop:50, avgPerDay:4, coverDays:5, today:T}).level === 'serious');
  check('発注点割れは要発注',     C.statusOf({stock:40, rop:50, avgPerDay:4, coverDays:5, today:T}).level === 'serious');
  check('1.3倍以内はまもなく',    C.statusOf({stock:60, rop:50, avgPerDay:4, coverDays:5, today:T}).level === 'warn');
  check('1.3倍超は問題なし',      C.statusOf({stock:100, rop:50, avgPerDay:0.1, coverDays:5, today:T, lastMove:'2026-09-10'}).level === 'ok');
  check('発注点0でも残日数で警告',
        C.statusOf({stock:10, rop:0, avgPerDay:2, coverDays:5, today:T, lastMove:'2026-09-10'}).level === 'warn');
  check('90日動きなしは idle',
        C.statusOf({stock:100, rop:0, avgPerDay:0, coverDays:0, today:T, lastMove:'2026-05-01'}).level === 'idle');
  check('動きなしでも欠品が優先',
        C.statusOf({stock:0, rop:0, avgPerDay:0, coverDays:0, today:T, lastMove:'2026-05-01'}).level === 'crit');
  check('重大度の並び', C.STATUS_ORDER.crit < C.STATUS_ORDER.serious &&
        C.STATUS_ORDER.serious < C.STATUS_ORDER.warn && C.STATUS_ORDER.warn < C.STATUS_ORDER.idle);
}

section('8. 在庫単価（移動平均）');
{
  const uc = C.unitCostOf(M, MV);
  check('入庫の加重平均 1100', uc.price === 1100, '実際: ' + uc.price);
  check('basis は avg', uc.basis === 'avg');
  const uc2 = C.unitCostOf({id:'zz', price:500}, MV);
  check('入庫がなければ標準単価', uc2.price === 500 && uc2.basis === 'std');
  const uc3 = C.unitCostOf({id:'zz'}, MV);
  check('どちらも無ければ0', uc3.price === 0 && uc3.basis === 'none');
  const uc4 = C.unitCostOf(M2, MV);
  check('金額だけでも単価が出る', uc4.price === 260, '実際: ' + uc4.price);
}

section('9. 時系列');
{
  const s = C.seriesStock(M, MV, '2026-09-01', '2026-09-12');
  check('日数ぶんの点', s.length === 12);
  check('9/1 は初期在庫', s[0].qty === 100);
  check('9/3 は 70',     s[2].qty === 70);
  check('9/5 は 120',    s[4].qty === 120);
  check('末日は現在庫と一致', s[11].qty === C.currentStock(M, MV));
  const s2 = C.seriesStock(M, MV, '2026-09-06', '2026-09-12');
  check('期間前は初期残高に畳み込む', s2[0].qty === 120, '実際: ' + s2[0].qty);

  const u = C.seriesUsage(MV, 'm1', '2026-09-01', '2026-09-12');
  check('出庫だけを日別に', u[1].qty === 10 && u[2].qty === 20 && u[4].qty === 0 && u[7].qty === 10);
  check('件数も返す', u[1].count === 1);
  const ua = C.seriesUsage(MV, null, '2026-09-01', '2026-09-12');
  check('全品目でも出庫だけ', ua.reduce((a,p) => a + p.count, 0) === 3);

  const ma = C.movingAvg([0,0,0,0,0,0,0,7], 7);
  check('移動平均 末尾', eq(ma[7], 1, 1e-9), '実際: ' + ma[7]);
  check('先頭は貯まった分だけ', C.movingAvg([4,8], 7)[0] === 4 && C.movingAvg([4,8], 7)[1] === 6);
}

section('10. 購入金額の集計');
{
  const agg = C.purchaseByMonth(MV, [M, M2]);
  check('月が1つ', agg.months.length === 1 && agg.months[0] === '2026-09');
  check('分類は仮設材のみ', agg.cats.length === 1 && agg.cats[0] === '仮設材');
  check('合計 = 55000+26000', agg.totals[0] === 81000, '実際: ' + agg.totals[0]);
  const top = C.purchaseByMaterial(MV, '2026-09-01', '2026-09-30');
  check('金額の大きい順', top[0].materialId === 'm1' && top[0].amount === 55000);
  check('2件', top.length === 2);
  const none = C.purchaseByMaterial(MV, '2026-10-01', '2026-10-31');
  check('期間外は空', none.length === 0);
}

section('11. CSV');
check('カンマを含む値は囲む', C.csvCell('a,b') === '"a,b"');
check('引用符は二重化',       C.csvCell('a"b') === '"a""b"');
check('素の値はそのまま',     C.csvCell('abc') === 'abc');
{
  const csv = C.toCSV(['a','b'], [[1,'x,y'],[2,'z']]);
  check('toCSV の行数', csv.split('\r\n').length === 3);
  const back = C.parseCSV(csv);
  check('往復で戻る', back[1][1] === 'x,y' && back[2][0] === '2');
  check('改行入りセル', C.parseCSV('a,b\r\n"1\n2",3')[1][0] === '1\n2');
  check('BOM を落とす', C.parseCSV('﻿a,b\r\n1,2')[0][0] === 'a');
  check('空行は捨てる', C.parseCSV('a,b\r\n\r\n1,2').length === 2);
}

section('12. その他');
check('uid は毎回ちがう', C.uid() !== C.uid());
check('niceStep 1,2,2.5,5,10 系', [1,2,2.5,5,10,20,25,50].indexOf(C.niceStep(100, 4)) >= 0,
      '実際: ' + C.niceStep(100, 4));
check('niceStep 0 でも落ちない', C.niceStep(0, 4) === 1);

/* ====================================================================== */
console.log('\n' + '='.repeat(46));
console.log('  合計 ' + (pass + fail) + ' 項目 /  ok ' + pass + '  FAIL ' + fail);
console.log('='.repeat(46));
process.exit(fail ? 1 : 0);
