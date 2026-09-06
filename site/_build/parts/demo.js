(function(){
  const svg=document.getElementById('demo-svg'); if(!svg) return;
  const layer=document.getElementById('demo-layer'), hint=document.getElementById('demo-hint'), msg=document.getElementById('demo-msg');
  const NS='http://www.w3.org/2000/svg'; let pts=[], busy=false;
  const el=(n,a,txt)=>{const e=document.createElementNS(NS,n);for(const k in a)e.setAttribute(k,a[k]);if(txt!=null)e.textContent=txt;return e;};
  const pt=(ev)=>{const p=svg.createSVGPoint();p.x=ev.clientX;p.y=ev.clientY;const m=svg.getScreenCTM().inverse();const q=p.matrixTransform(m);return{x:q.x,y:q.y}};
  function wrap(x,y,delay){const o=el('g',{transform:`translate(${x} ${y})`});const g=el('g',{class:'d-cone',style:`--d:${delay}ms`});o.appendChild(g);return [o,g];}
  function cone(x,y,delay){const [o,g]=wrap(x,y,delay);
    g.appendChild(el('path',{d:'M-7 6 L-3 -10 L3 -10 L7 6 Z',fill:'var(--d-cone,#FF6B1A)',stroke:'var(--d-ink,#1C1A17)','stroke-width':'1.5'}));
    g.appendChild(el('rect',{x:-4,y:-4,width:8,height:3,fill:'#fff'}));g.appendChild(el('rect',{x:-9,y:5,width:18,height:3,rx:1,fill:'var(--d-ink,#1C1A17)'}));return o;}
  function guard(x,y,delay){const [o,g]=wrap(x,y,delay);
    g.appendChild(el('circle',{cx:0,cy:-9,r:5,fill:'#FFE1BF',stroke:'var(--d-ink,#1C1A17)','stroke-width':'1.5'}));g.appendChild(el('path',{d:'M-5 -10 a5 5 0 0 1 10 0z',fill:'#fff',stroke:'var(--d-ink,#1C1A17)','stroke-width':'1.5'}));
    g.appendChild(el('rect',{x:-5,y:-4,width:10,height:12,rx:2,fill:'var(--d-cone,#FF6B1A)',stroke:'var(--d-ink,#1C1A17)','stroke-width':'1.5'}));g.appendChild(el('rect',{x:5,y:-16,width:2.5,height:13,fill:'#FF3B3B'}));return o;}
  function build(A,B,animate){
    layer.innerHTML=''; const dx=B.x-A.x, dy=B.y-A.y, L=Math.hypot(dx,dy)||1, ux=dx/L, uy=dy/L, nx=-uy, ny=ux, W=38;
    // 道路のどちら側に置くか: 中心線(y≈175)より上なら手前側へ
    const side=((A.y+B.y)/2<175)?1:-1; const ox=nx*W*side, oy=ny*W*side;
    const z=el('polygon',{class:'d-zone',points:`${A.x},${A.y} ${B.x},${B.y} ${B.x+ox},${B.y+oy} ${A.x+ox},${A.y+oy}`,fill:'url(#dz-hatch)',stroke:'var(--d-zone,#e0407a)','stroke-width':'2'});
    layer.appendChild(z); const zf=el('polygon',{class:'d-zone',points:z.getAttribute('points'),fill:'var(--d-zone,#e0407a)',opacity:'.18'}); layer.insertBefore(zf,z);
    const n=Math.max(2,Math.round(L/26)); let d=0;
    for(let i=0;i<=n;i++){const t=i/n; layer.appendChild(cone(A.x+dx*t,A.y+dy*t,d)); d+=animate?70:0;}
    // 小口
    for(const P of [A,B]){layer.appendChild(cone(P.x+ox*.5,P.y+oy*.5,d)); d+=animate?70:0;}
    layer.appendChild(guard(A.x-ux*16+ox*.5,A.y-uy*16+oy*.5,d)); layer.appendChild(guard(B.x+ux*16+ox*.5,B.y+uy*16+oy*.5,d+80));
    // 寸法
    const off=-18*side; const dg=el('g',{class:'d-dim',style:`--d:${d+200}ms`});
    dg.appendChild(el('line',{x1:A.x+nx*off,y1:A.y+ny*off,x2:B.x+nx*off,y2:B.y+ny*off,stroke:'var(--d-dim,#2563eb)','stroke-width':'1.5'}));
    dg.appendChild(el('line',{x1:A.x+nx*(off-5),y1:A.y+ny*(off-5),x2:A.x+nx*(off+5),y2:A.y+ny*(off+5),stroke:'var(--d-dim,#2563eb)','stroke-width':'1.5'}));
    dg.appendChild(el('line',{x1:B.x+nx*(off-5),y1:B.y+ny*(off-5),x2:B.x+nx*(off+5),y2:B.y+ny*(off+5),stroke:'var(--d-dim,#2563eb)','stroke-width':'1.5'}));
    const mx=(A.x+B.x)/2+nx*(off-10*side), my=(A.y+B.y)/2+ny*(off-10*side);
    dg.appendChild(el('text',{x:mx,y:my,'text-anchor':'middle','font-size':'13','font-weight':'700',fill:'var(--d-dim,#2563eb)','font-family':'inherit'},`L = ${(L*0.1).toFixed(1)} m`));
    layer.appendChild(dg);
    const lab=el('text',{class:'d-dim',style:`--d:${d+320}ms`,x:(A.x+B.x)/2+ox*.55,y:(A.y+B.y)/2+oy*.55+4,'text-anchor':'middle','font-size':'12','font-weight':'800',fill:'var(--d-zone,#e0407a)'},'作業帯');
    layer.appendChild(lab);
    if(!animate) layer.querySelectorAll('.d-cone,.d-dim').forEach(e=>e.style.animation='none');
  }
  function reset(){pts=[];layer.innerHTML='';hint.style.display='';msg.textContent='起点をタップ → 終点をタップ';}
  svg.addEventListener('pointerdown',(ev)=>{ev.preventDefault(); if(busy) return; const p=pt(ev);
    if(pts.length===0||pts.length>=2){pts=[p]; layer.innerHTML=''; hint.style.display='none';
      const m=el('circle',{cx:p.x,cy:p.y,r:6,fill:'var(--d-dim,#2563eb)',class:'d-cone'}); layer.appendChild(m); msg.textContent='終点をタップ'; return;}
    pts.push(p); const A=pts[0],B=p; if(Math.hypot(B.x-A.x,B.y-A.y)<30){msg.textContent='もう少し離してタップしてください'; pts=[A]; return;}
    build(A,B,true); msg.textContent='できた！ 本物のツールでは記号・凡例まで自動です'; busy=true; setTimeout(()=>busy=false,600);
  });
  document.getElementById('demo-reset').addEventListener('click',reset);
  // 初期状態はサンプルを置いておく（ページを開いた瞬間に「何が起きるか」が見える）
  build({x:160,y:128},{x:440,y:130},false); hint.style.display='';
})();
