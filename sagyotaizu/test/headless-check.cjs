/*
 * 作業帯図作成ツール — ヘッドレス回帰チェック (開発用・単一HTML成果物には含めない)
 *
 *   node test/headless-check.cjs            # 隣の 作業帯図作成ツール.html を検証
 *   node test/headless-check.cjs path.html  # 明示指定も可
 *
 * 最小限の DOM / Canvas2D シムで <script> を評価し、縮尺換算・描画経路・保存往復・
 * 選択/複数パターン/一括出力/整列/集計などのロジックを assert する。ブラウザ無しで
 * 回帰を素早く検知するのが目的（見た目の最終確認はブラウザで実施すること）。
 */
const calls = [];
function makeCtx(){
  return new Proxy({}, {
    get(t,p){ if(p in t) return t[p];
      if(p==='measureText') return (txt)=>({width:(''+(txt||'')).length*8});
      return (...a)=>{ calls.push(p+':'+a.join(',')); }; },
    set(t,p,v){ t[p]=v; return true; }
  });
}
const els = {};
function makeEl(id){
  const e = { id, style:{}, dataset:{}, value:'', textContent:'', innerHTML:'', checked:false, onclick:null, ondblclick:null, disabled:false, title:'',
    classList:{ _s:new Set(), add(x){this._s.add(x)}, remove(x){this._s.delete(x)},
      toggle(x,f){ if(f===undefined) f=!this._s.has(x); f?this._s.add(x):this._s.delete(x); return f; }, contains(x){return this._s.has(x)} },
    addEventListener(){}, removeEventListener(){}, appendChild(){}, querySelector(){return makeEl('q')},
    querySelectorAll(){return []}, getContext(){return makeCtx()},
    getBoundingClientRect(){return {width:800,height:600,left:0,top:0}},
    focus(){}, select(){}, click(){ if(this.onclick) this.onclick(); },
    toDataURL(){return 'data:,'}, toBlob(cb){cb({});} };
  e.contentWindow = { document:{ open(){}, write(){}, close(){}, querySelector(){return null}, querySelectorAll(){return []} }, focus(){}, print(){} };
  e.parentElement = e; return e;
}
global.document = {
  getElementById(id){ return els[id] || (els[id]=makeEl(id)); },
  querySelector(){ return makeEl('sel'); }, querySelectorAll(){ return []; },
  createElement(){ return makeEl('new'); }, head:{ appendChild(){} },
};
global.window = global; global.devicePixelRatio = 1; global.addEventListener = ()=>{};
global.localStorage = { getItem:()=>null, setItem:()=>{}, removeItem:()=>{} };
global.alert = ()=>{}; global.Blob = class{}; global.Image = class{ set src(v){} };
global.setTimeout = (fn)=>{ if(typeof fn==='function') fn(); return 0; }; global.clearTimeout = ()=>{};
global.URL = { createObjectURL:()=>'blob:x', revokeObjectURL:()=>{} };

const fs = require('fs');
const htmlPath = process.argv[2] || require('path').join(__dirname, '..', '作業帯図作成ツール.html');
const html = fs.readFileSync(htmlPath,'utf8');
let src = html.slice(html.indexOf('<script>')+8, html.lastIndexOf('</script>'));
src = src.replace(/\ninit\(\);\s*$/, '\n/*init skipped*/\n');

const tests = `
;globalThis.__run = (async function(){
  let fails=0; const ok=(c,m)=>{ if(!c){console.log('FAIL: '+m);fails++;} else console.log('ok: '+m); };

  // ---- R1 ----
  ok(Math.abs(mPerPxFromDenom(500) - 0.42*500/PAPER.w) < 1e-9, 'mPerPxFromDenom(500)');
  ok(Math.abs((PAPER.w*mPerPxFromDenom(500)) - 210) < 0.5, 'A3 1/500 covers ~210m');
  ok(Math.abs(denomFromMPerPx(mPerPxFromDenom(500)) - 500) < 1e-6, 'denom round-trip');
  ok(niceDenom(188.9) === 200, 'niceDenom(188.9)='+niceDenom(188.9));
  state.settings.mPerPx = mPerPxFromDenom(500);
  state.settings.calibrated = true; state.settings.showScaleBar = true;
  ok(niceBarMeters(state.settings.mPerPx) > 0, 'niceBarMeters='+niceBarMeters(state.settings.mPerPx));
  calls.length=0; drawScaleBar(makeCtx(), state.settings.mPerPx);
  ok(calls.some(c=>c.startsWith('fillText:') && / m/.test(c)), 'scale bar drew "N m" label');
  // effective scale: a 1/1000 crop should double bar meters vs 1/500 (roughly)
  var b500=niceBarMeters(mPerPxFromDenom(500)), b1000=niceBarMeters(mPerPxFromDenom(1000));
  ok(b1000 >= b500, 'coarser effective scale => >= bar meters ('+b500+' -> '+b1000+')');
  state.objects = [ { id:'a', type:'symbol', kind:'cone', x:400, y:300, rot:0, scl:1 },
    { id:'b', type:'zone', pts:[{x:100,y:100},{x:300,y:100},{x:300,y:200},{x:100,y:200}] } ];
  let threw=null; try{ drawSheet(makeCtx(), {screen:false}); }catch(e){ threw=e; }
  ok(!threw, 'drawSheet(identity) no-throw'+(threw?': '+threw.message:''));
  // drawSheet with a crop view + effective mPerPx
  let threwV=null; try{ drawSheet(makeCtx(), {screen:false, view:{scale:2,ox:-100,oy:-50}, mPerPx:state.settings.mPerPx*0.5}); }catch(e){ threwV=e; }
  ok(!threwV, 'drawSheet(crop view) no-throw'+(threwV?': '+threwV.message:''));
  state.settings.scaleDenominator = 500; updateScaleBadge();
  ok(els.scaleBadge.textContent.includes('1/500'), 'badge 1/500 ("'+els.scaleBadge.textContent+'")');
  state.settings.scaleDenominator = null; updateScaleBadge();
  ok(/\\u22481\\//.test(els.scaleBadge.textContent), 'badge approx ("'+els.scaleBadge.textContent+'")');

  // ---- R2 ----
  var sym = { id:'s1', type:'symbol', kind:'board_kenmei', x:400, y:300, rot:30, scl:1, label:'○○管路工事', labelAngle:-40, labelDist:46 };
  var g = symbolLabelGeom(sym);
  ok(g && g.box && g.box.w>0, 'symbolLabelGeom returns box');
  ok(symbolLabelGeom({id:'s2',type:'symbol',kind:'cone',x:0,y:0})===null, 'no label => null geom');
  calls.length=0; drawSymbolLabel(makeCtx(), sym);
  ok(calls.some(c=>c.indexOf('fillText:')===0), 'drawSymbolLabel draws text');
  ok(objBBox(sym).w > (KINDS.board_kenmei.size*pxPerM()), 'objBBox includes label');
  state.objects=[sym]; state.sel='s1';
  ok(hitTest({x:g.box.x+g.box.w/2, y:g.box.y+g.box.h/2}) && hitTest({x:g.box.x+g.box.w/2, y:g.box.y+g.box.h/2}).id==='s1', 'clicking label selects symbol');

  // ---- R3 ----
  var requestedPage=0;
  var fakePage={getViewport:()=>({width:1000,height:700}), render:()=>({promise:Promise.resolve()})};
  window.pdfjsLib={ getDocument:()=>({promise:Promise.resolve({numPages:3, getPage:(n)=>{requestedPage=n; return Promise.resolve(fakePage);}})}), GlobalWorkerOptions:{} };
  askInput=async()=>'2'; setBgFromDataURL=async(u)=>{ state.bg={img:{},dataURL:u,x:0,y:0,w:10,h:10}; };
  var pdfFile={type:'application/pdf',name:'a.pdf',arrayBuffer:async()=>new ArrayBuffer(8)};
  var threw3=null; try{ await loadBackground(pdfFile); }catch(e){ threw3=e; }
  ok(!threw3 && requestedPage===2, 'multi-page PDF renders selected page 2');

  // ---- R4 ----
  ok(typeof makeSaveURL({width:100,height:80})==='string', 'makeSaveURL returns string');

  // ---- MULTI-PATTERN ----
  // start fresh with one pattern
  state.patterns=[]; state.activePattern=0; state.bg=null;
  var p0=makePattern(); state.patterns=[p0]; loadActivePattern();
  ok(state.patterns.length===1 && p0.name==='パターン1', 'initial pattern created');
  // edit pattern 0
  state.objects.push({id:'oA',type:'text',x:1,y:1,text:'A'}); syncActivePattern();
  // add a new pattern
  addPattern(false);
  ok(state.patterns.length===2 && state.activePattern===1, 'addPattern switches to new pattern');
  ok(state.objects.length===0, 'new pattern starts empty');
  state.objects.push({id:'oB',type:'text',x:2,y:2,text:'B'}); syncActivePattern();
  // switch back to pattern 0
  activatePattern(0);
  ok(state.objects.length===1 && state.objects[0].id==='oA', 'pattern 0 retains its own objects');
  activatePattern(1);
  ok(state.objects.length===1 && state.objects[0].id==='oB', 'pattern 1 retains its own objects');
  // duplicate
  addPattern(true);
  ok(state.patterns.length===3 && state.objects.length===1 && state.objects[0].id==='oB', 'duplicate copies objects');
  ok(state.objects !== state.patterns[1].objects, 'duplicate is a deep copy (diff ref)');
  // frame + aspect lock
  var fr=frameFromDrag({x:100,y:100},{x:400,y:999});
  ok(Math.abs(fr.h - fr.w*PAPER.h/PAPER.w) < 1e-6, 'frameFromDrag locks paper aspect');
  var fv=frameView(fr);
  ok(Math.abs(fv.scale - PAPER.w/fr.w) < 1e-9 && Math.abs(fv.ox + fr.x*fv.scale) < 1e-6, 'frameView maps frame to paper');
  activePat().frame=fr;
  var threwF=null; try{ renderExportCanvas(2); }catch(e){ threwF=e; }
  ok(!threwF, 'renderExportCanvas(with frame) no-throw'+(threwF?': '+threwF.message:''));
  // delete guard
  while(state.patterns.length>1) deletePattern();
  deletePattern(); // should refuse at 1
  ok(state.patterns.length===1, 'cannot delete last pattern');

  // persistence round-trip (v2)
  state.patterns=[]; var q0=makePattern(); q0.objects=[{id:'x',type:'text',x:0,y:0,text:'hi'}]; q0.frame={x:5,y:6,w:100,h:70.7};
  var q1=makePattern(); q1.objects=[]; state.patterns=[q0,q1]; state.activePattern=1; loadActivePattern();
  syncActivePattern();
  var saved=JSON.parse(JSON.stringify({app:'sagyotaizu',version:2,settings:state.settings,patterns:state.patterns,activePattern:state.activePattern,bg:null}));
  // simulate load
  state.patterns=saved.patterns.map(normalizePattern); state.activePattern=Math.min(saved.activePattern,state.patterns.length-1); loadActivePattern();
  ok(state.patterns.length===2 && state.patterns[0].objects.length===1 && state.patterns[0].frame && state.patterns[0].frame.w===100, 'v2 round-trip preserves patterns+frame');

  // v1 backward-compat
  var wrapped=wrapAsPattern([{id:'y',type:'text',x:0,y:0,text:'old'}], {title:'旧図面'});
  ok(wrapped.objects.length===1 && wrapped.name==='パターン1' && wrapped.title==='旧図面', 'v1 objects wrap into pattern1');


  // ---- MULTI-SELECT (drag marquee + group move) ----
  state.patterns=[]; state.activePattern=0; state.bg=null; state.settings.showLegend=false;
  state.view={z:1,ox:0,oy:0}; state.tool='select'; state.selIds=[]; state.sel=null;
  state.objects=[
    {id:'A',type:'symbol',kind:'cone',x:100,y:100,rot:0,scl:1},
    {id:'C',type:'symbol',kind:'cone',x:150,y:120,rot:0,scl:1},
    {id:'B',type:'text',x:700,y:700,text:'B',size:18,rot:0},
  ];
  // primitives
  setSel(['A','A','zzz']); ok(state.selIds.length===1 && state.selIds[0]==='A' && state.sel==='A', 'setSel dedupes+filters+single sel');
  setSel(['A','C']); ok(state.selIds.length===2 && state.sel===null, 'multi sel => sel null');
  toggleSel('A'); ok(state.selIds.join(',')==='C', 'toggleSel removes');
  toggleSel('A'); ok(state.selIds.length===2, 'toggleSel adds');
  clearSel(); ok(state.selIds.length===0 && state.sel===null, 'clearSel');
  var inR = objsInRect({x:0,y:0,w:300,h:300}).sort().join(',');
  ok(inR==='A,C', 'objsInRect selects near objects only ('+inR+')');
  // marquee flow via pointer functions
  clearSel();
  pointerDown({button:0, clientX:0, clientY:0});
  pointerMove({clientX:300, clientY:300, cancelable:false});
  pointerUp();
  ok(state.selIds.slice().sort().join(',')==='A,C', 'marquee selected A,C (got '+state.selIds+')');
  // group move: drag one selected -> all move
  var ax=state.objects[0].x, cx=state.objects[1].x, cy=state.objects[1].y;
  pointerDown({button:0, clientX:100, clientY:100});   // hits A (selected)
  pointerMove({clientX:130, clientY:110, cancelable:false}); // dx30 dy10
  pointerUp();
  ok(state.objects[0].x===ax+30 && state.objects[1].x===cx+30 && state.objects[1].y===cy+10, 'group move shifts all selected');
  ok(state.selIds.length===2, 'selection kept after group move');
  // click empty (no drag) clears selection
  pointerDown({button:0, clientX:500, clientY:500});
  pointerUp();
  ok(state.selIds.length===0, 'click empty clears selection');
  // shift-click adds without clearing
  pointerDown({button:0, clientX:100+30, clientY:100+10}); pointerUp(); // select A (moved to 130,110)
  ok(state.selIds.length===1 && state.selIds[0]==='A', 'plain click selects single A');
  pointerDown({button:0, clientX:150+30, clientY:120+10, shiftKey:true}); pointerUp(); // shift add C
  ok(state.selIds.slice().sort().join(',')==='A,C', 'shift-click adds to selection');
  // shiftObj / moveObjBy
  var dimo={type:'dim',a:{x:0,y:0},b:{x:10,y:0}}; shiftObj(dimo,5); ok(dimo.a.x===5&&dimo.b.x===15,'shiftObj dim');
  var poly={type:'zone',pts:[{x:0,y:0},{x:2,y:0}]}; moveObjBy(poly,JSON.parse(JSON.stringify(poly)),3,4); ok(poly.pts[1].x===5&&poly.pts[0].y===4,'moveObjBy pts');
  // drawOverlays no-throw with multi-sel + active marquee
  setSel(['A','C']); drag={kind:'marquee', w0:{x:0,y:0}, cur:{x:50,y:50}};
  var threwO=null; try{ drawOverlays(makeCtx()); }catch(e){ threwO=e; } drag=null;
  ok(!threwO, 'drawOverlays(multi+marquee) no-throw'+(threwO?': '+threwO.message:''));

  // ---- BARRICADE ROW (conerow.kind) ----
  state.patterns=[]; state.activePattern=0; state.settings.symScale=1;
  // conePositions returns tangent angle
  var cr={type:'conerow',kind:'abarricade',pts:[{x:0,y:0},{x:100,y:0}],interval:20,bar:false};
  var pos=conePositions(cr);
  ok(pos.length>=2 && Math.abs(pos[0].ang-0)<1e-9, 'conePositions gives ang along +x');
  var cr2={type:'conerow',kind:'abarricade',pts:[{x:0,y:0},{x:0,y:100}],interval:20};
  ok(Math.abs(conePositions(cr2)[0].ang-Math.PI/2)<1e-9, 'ang follows vertical segment');
  // drawObj barricade row: draws abarricade (no cone bar)
  calls.length=0; drawObj(makeCtx(), cr);
  ok(calls.length>0, 'drawObj(barricade row) executed');
  // legend: barricade row -> abarricade, no _bar
  state.objects=[cr];
  var items=usedLegendItems().map(it=>it.kind);
  ok(items.indexOf('abarricade')>=0 && items.indexOf('_bar')<0, 'legend shows A-barricade, no cone-bar');
  // cone row still shows _bar
  state.objects=[{type:'conerow',kind:'cone',pts:[{x:0,y:0},{x:50,y:0}],interval:2,bar:true}];
  var it2=usedLegendItems().map(it=>it.kind);
  ok(it2.indexOf('cone')>=0 && it2.indexOf('_bar')>=0, 'cone row keeps cone + bar in legend');
  // finishDraft creates a barricade row from the tool
  state.objects=[]; state.draft={mode:'poly:barricaderow', pts:[{x:0,y:0},{x:80,y:0}]};
  finishDraft();
  var last=state.objects[state.objects.length-1];
  ok(last && last.type==='conerow' && last.kind==='abarricade' && last.bar===false, 'finishDraft builds abarricade conerow (bar off)');
  // legacy conerow without kind defaults to cone (no throw)
  var legacy={type:'conerow',pts:[{x:0,y:0},{x:40,y:0}],interval:2,bar:true};
  var threwL=null; try{ drawObj(makeCtx(), legacy); }catch(e){ threwL=e; }
  ok(!threwL, 'legacy conerow (no kind) still draws'+(threwL?': '+threwL.message:''));

  // ---- BATCH OUTPUT (all patterns) ----
  state.patterns=[]; state.activePattern=0;
  var pa=makePattern(); pa.name='区間A'; pa.title='図A'; pa.objects=[{id:'pa1',type:'text',x:1,y:1,text:'a'}];
  var pb=makePattern(); pb.name='区間B'; pb.title='図B'; pb.objects=[]; pb.frame={x:10,y:10,w:200,h:141.4};
  state.patterns=[pa,pb]; state.activePattern=0; loadActivePattern();
  // renderPatternCanvas restores editing state
  var before={o:state.objects,t:state.settings.title,a:state.activePattern};
  var oc=renderPatternCanvas(pb,2);
  ok(oc && oc.width===PAPER.w*2 && oc.height===PAPER.h*2, 'export canvas has A3*2 dims');
  ok(state.objects===before.o && state.settings.title===before.t && state.activePattern===before.a, 'renderPatternCanvas restores active state');
  // exportPng(true) writes one numbered file per pattern
  var names=[]; var bakDownload=download; download=(name)=>{ names.push(name); };
  exportPng(true);
  download=bakDownload;
  ok(names.length===2, 'exportPng(all) writes one file per pattern (got '+names.length+')');
  ok(/_01_/.test(names[0]) && /_02_/.test(names[1]) && names.join(' ').includes('区間A') && names.join(' ').includes('区間B'), 'batch PNG names are numbered+named ('+names.join(', ')+')');
  // doPrint all-patterns: builds pages, no throw
  var threwP=null; try{ doPrint('A4', true); }catch(e){ threwP=e; }
  ok(!threwP, 'doPrint(all) no-throw'+(threwP?': '+threwP.message:''));
  var threwP1=null; try{ doPrint('A3', false); }catch(e){ threwP1=e; }
  ok(!threwP1, 'doPrint(one) no-throw'+(threwP1?': '+threwP1.message:''));

  // ---- SNAP + ALIGN/DISTRIBUTE ----
  state.settings.snap=true; state.view={z:1,ox:0,oy:0};
  state.objects=[
    {id:'v1',type:'symbol',kind:'cone',x:100,y:100,rot:0,scl:1},
    {id:'v2',type:'text',x:300,y:180,text:'t',size:18,rot:0},
  ];
  // snapPoint: near a vertex -> snaps to it; far -> unchanged
  var sn=snapPoint({x:104,y:97}); ok(sn.hit && sn.x===100 && sn.y===100, 'snapPoint snaps to nearby vertex');
  var sn2=snapPoint({x:500,y:500}); ok(!sn2.hit && sn2.x===500, 'snapPoint leaves far point unchanged');
  state.settings.snap=false; var sn3=snapPoint({x:104,y:97}); ok(!sn3.hit && sn3.x===104, 'snap off => no snapping');
  state.settings.snap=true;
  // exclude set skips own object
  var sn4=snapPoint({x:101,y:101}, new Set(['v1'])); ok(!sn4.hit, 'exclude skips own vertex');
  // align left: all bbox.x equal to min
  state.objects=[
    {id:'a',type:'symbol',kind:'cone',x:100,y:50,rot:0,scl:1},
    {id:'b',type:'symbol',kind:'cone',x:140,y:120,rot:0,scl:1},
    {id:'c',type:'symbol',kind:'cone',x:180,y:200,rot:0,scl:1},
  ];
  setSel(['a','b','c']);
  var bxBefore=selectedObjs().map(o=>objBBox(o).x);
  alignSelected('left');
  var xs=selectedObjs().map(o=>objBBox(o).x);
  ok(Math.max(...xs)-Math.min(...xs) < 1e-6, 'align left: bbox.x all equal');
  // vcenter align: centers y equal
  alignSelected('vcenter');
  var cys=selectedObjs().map(o=>{var b=objBBox(o);return b.y+b.h/2;});
  ok(Math.max(...cys)-Math.min(...cys) < 1e-6, 'align vcenter: centers equal');
  // distribute horizontal: equal center spacing, ends fixed
  state.objects=[
    {id:'d1',type:'symbol',kind:'cone',x:0,y:0,rot:0,scl:1},
    {id:'d2',type:'symbol',kind:'cone',x:10,y:0,rot:0,scl:1},
    {id:'d3',type:'symbol',kind:'cone',x:100,y:0,rot:0,scl:1},
  ];
  setSel(['d1','d2','d3']);
  distributeSelected('h');
  var cxs=selectedObjs().map(o=>o.x).sort((p,q)=>p-q);
  ok(Math.abs((cxs[1]-cxs[0])-(cxs[2]-cxs[1]))<1e-6, 'distribute h: equal spacing');
  ok(cxs[0]===0 && cxs[2]===100, 'distribute h: endpoints fixed');
  // distribute <3 shows toast, no change
  setSel(['d1','d2']); var bx=state.objects[0].x; distributeSelected('h');
  ok(state.objects[0].x===bx, 'distribute needs >=3 (no-op for 2)');
  // snap marker draws without throwing
  state.snapHint={x:10,y:10}; var threwS=null; try{ drawOverlays(makeCtx()); }catch(e){ threwS=e; } state.snapHint=null;
  ok(!threwS, 'drawOverlays(snap marker) no-throw'+(threwS?': '+threwS.message:''));
  console.log(fails? ('\\n'+fails+' FAILURES') : '\\nALL PASS ('+(0)+')');
  return fails;
})();
`;
eval(src + tests);
globalThis.__run.then(f=>process.exit(f?1:0)).catch(e=>{ console.error(e); process.exit(2); });
