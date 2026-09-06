import sys, re, os
sys.path.insert(0, os.path.dirname(__file__)+'/parts')
from mascots import M, CSS as MCSS, NAMES
P = os.path.dirname(__file__)+'/parts/'
DEMO = open(P+'demo.html').read(); DEMO_CSS = open(P+'demo.css').read(); DEMO_JS = open(P+'demo.js').read()

# ---------- 共通セクション（キーワード / こんなこともできる / ミニ体験 / スペック / パレード / CTA） ----------
SHARED = '''
<section class="kw" id="kw">
  <div class="wrap">
    <p class="eyebrow">使い方は、これだけ</p>
    <h2 class="h2">読む。合わせる。<br>2クリック。</h2>
    <div class="kw-grid">
      <div class="kw-item reveal">
        <svg viewBox="0 0 120 120" class="kw-ico"><g class="kw-doc"><rect x="30" y="18" width="60" height="84" rx="6" fill="var(--ico-fill)" stroke="var(--ico-ink)" stroke-width="3"/><path d="M42 40h36M42 54h36M42 68h24" stroke="var(--ico-ink)" stroke-width="3" stroke-linecap="round"/><path class="kw-map" d="M42 84 c10 -12 20 6 36 -6" fill="none" stroke="var(--ico-accent)" stroke-width="4" stroke-linecap="round"/></g></svg>
        <h3>読む</h3><p>PDFや画像の地形図を、そのまま背景に。</p>
      </div>
      <div class="kw-item reveal d1">
        <svg viewBox="0 0 120 120" class="kw-ico"><g class="kw-ruler"><rect x="14" y="50" width="92" height="22" rx="4" fill="var(--ico-fill)" stroke="var(--ico-ink)" stroke-width="3"/><path d="M26 50v10M38 50v6M50 50v10M62 50v6M74 50v10M86 50v6M98 50v10" stroke="var(--ico-ink)" stroke-width="3"/></g><text x="60" y="40" text-anchor="middle" font-size="14" font-weight="800" fill="var(--ico-accent)" class="kw-scale">1/500</text></svg>
        <h3>合わせる</h3><p>2点＋実距離、または「1/500」で縮尺を設定。</p>
      </div>
      <div class="kw-item reveal d2">
        <svg viewBox="0 0 120 120" class="kw-ico"><circle class="kw-ripple" cx="40" cy="70" r="10" fill="none" stroke="var(--ico-accent)" stroke-width="3"/><circle class="kw-ripple r2" cx="86" cy="52" r="10" fill="none" stroke="var(--ico-accent)" stroke-width="3"/><path d="M40 70 L86 52" stroke="var(--ico-ink)" stroke-width="3" stroke-dasharray="6 6" class="kw-line"/><path class="kw-cursor" d="M52 84 l6 18 l4 -7 l8 5 l2 -3 l-8 -5 l6 -5 z" fill="var(--ico-fill)" stroke="var(--ico-ink)" stroke-width="2.5" stroke-linejoin="round"/></svg>
        <h3>2クリック</h3><p>起点と終点。作業帯・コーン・看板が一気に並ぶ。</p>
      </div>
    </div>
  </div>
</section>

<section class="can" id="can">
  <div class="wrap">
    <p class="eyebrow">こんなこともできる</p>
    <h2 class="h2">手で描いてた"あれ"、<br>だいたい勝手にやります。</h2>
  </div>
  <div class="can-scroll">
    <div class="can-card reveal">
      <div class="can-vis"><svg viewBox="0 0 200 120"><rect x="20" y="16" width="160" height="88" rx="6" fill="var(--card-fill)" stroke="var(--ico-ink)" stroke-width="2.5"/><text x="100" y="36" text-anchor="middle" font-size="12" font-weight="800" fill="var(--ico-ink)">凡 例</text><g class="legend-rows"><g class="lr"><path d="M36 52 l4 -10 h6 l4 10z" fill="var(--ico-accent)"/><text x="56" y="52" font-size="9" fill="var(--ico-ink)">カラーコーン</text></g><g class="lr"><rect x="36" y="60" width="14" height="8" fill="#e0407a" opacity=".5"/><text x="56" y="68" font-size="9" fill="var(--ico-ink)">作業帯</text></g><g class="lr"><circle cx="43" cy="82" r="5" fill="#FFE1BF" stroke="var(--ico-ink)"/><text x="56" y="86" font-size="9" fill="var(--ico-ink)">ガードマン</text></g><g class="lr"><rect x="110" y="44" width="14" height="10" fill="#2563eb"/><text x="130" y="52" font-size="9" fill="var(--ico-ink)">矢印板</text></g><g class="lr"><rect x="110" y="62" width="14" height="10" fill="var(--ico-fill)" stroke="var(--ico-ink)"/><text x="130" y="70" font-size="9" fill="var(--ico-ink)">工事中看板</text></g></g></svg></div>
      <h3>凡例が勝手にできる</h3><p>置いた記号だけが載る。直し忘れゼロ。</p>
    </div>
    <div class="can-card reveal d1">
      <div class="can-vis"><svg viewBox="0 0 200 120"><g class="sheets"><rect class="sh s3" x="50" y="30" width="120" height="76" rx="4" fill="var(--card-fill)" stroke="var(--ico-ink)" stroke-width="2"/><rect class="sh s2" x="38" y="22" width="120" height="76" rx="4" fill="var(--card-fill)" stroke="var(--ico-ink)" stroke-width="2"/><rect class="sh s1" x="26" y="14" width="120" height="76" rx="4" fill="var(--card-fill)" stroke="var(--ico-ink)" stroke-width="2.5"/><text x="34" y="30" font-size="10" font-weight="800" fill="var(--ico-accent)">パターン1</text><text x="34" y="46" font-size="8" fill="var(--ico-ink)">片側交互通行</text><path d="M40 62 h80" stroke="#e0407a" stroke-width="8" opacity=".5"/></g></svg></div>
      <h3>パターンを何枚でも</h3><p>同じ地図に別案。全部まとめて連番出力。</p>
    </div>
    <div class="can-card reveal d2">
      <div class="can-vis"><div class="can-m">{{M:dump}}</div></div>
      <h3>建設車両もいる</h3><p>ダンプ・バックホウ・ユニック・規制車。</p>
    </div>
    <div class="can-card reveal">
      <div class="can-vis"><svg viewBox="0 0 200 120"><g class="paper a3"><rect x="20" y="24" width="112" height="80" rx="3" fill="var(--card-fill)" stroke="var(--ico-ink)" stroke-width="2.5"/><text x="76" y="70" text-anchor="middle" font-size="22" font-weight="900" fill="var(--ico-ink)">A3</text></g><g class="paper a4"><rect x="118" y="44" width="62" height="60" rx="3" fill="var(--card-fill)" stroke="var(--ico-ink)" stroke-width="2.5"/><text x="149" y="80" text-anchor="middle" font-size="18" font-weight="900" fill="var(--ico-accent)">A4</text></g></svg></div>
      <h3>A4でもA3でも</h3><p>印刷もPNG出力も、そのままの見た目で。</p>
    </div>
    <div class="can-card reveal d1">
      <div class="can-vis"><svg viewBox="0 0 200 120"><path d="M30 80 L100 40 L170 70 L120 100 Z" fill="#e0407a" opacity=".3" stroke="#e0407a" stroke-width="2"/><g class="counter"><rect x="60" y="20" width="80" height="26" rx="13" fill="var(--ico-ink)"/><text x="100" y="38" text-anchor="middle" font-size="12" font-weight="800" fill="#fff" class="count-text">142.5 ㎡</text></g></svg></div>
      <h3>面積・延長を自動集計</h3><p>選んだ作業帯の㎡と規制延長が、その場で出る。</p>
    </div>
    <div class="can-card reveal d2">
      <div class="can-vis"><svg viewBox="0 0 200 120"><g class="usb"><rect x="70" y="30" width="60" height="70" rx="8" fill="var(--card-fill)" stroke="var(--ico-ink)" stroke-width="2.5"/><rect x="85" y="18" width="30" height="16" rx="3" fill="var(--ico-ink)"/><text x="100" y="72" text-anchor="middle" font-size="11" font-weight="800" fill="var(--ico-accent)">JSON</text></g><g class="fly"><path d="M40 60 h20" stroke="var(--ico-accent)" stroke-width="3" stroke-linecap="round"/><path d="M140 60 h20" stroke="var(--ico-accent)" stroke-width="3" stroke-linecap="round"/></g></svg></div>
      <h3>JSONで持ち運び</h3><p>地図ごと保存。別のPCでも続きから。</p>
    </div>
  </div>
</section>

<section class="try" id="try">
  <div class="wrap">
    <p class="eyebrow">ちょっとだけ体験</p>
    <h2 class="h2">道路を2回タップ。<br>それだけ。</h2>
    {{DEMO}}
    <p class="try-note">※ 本物のツールでは、パターン（片側交互通行／車線減少／通行止め）と幅・コーン間隔を選べます。</p>
  </div>
</section>

<section class="spec" id="spec">
  <div class="wrap spec-row">
    <span class="stamp">無料</span><span class="stamp">登録不要</span><span class="stamp">PCで動く</span><span class="stamp">オフラインOK</span><span class="stamp">データは端末内</span>
  </div>
</section>

<section class="parade" id="parade">
  <div class="parade-track">
    <div class="parade-inner">{{PARADE}}{{PARADE}}</div>
  </div>
  <div class="wrap parade-cap"><a class="btn ghost" href="#">💬 このツールへの要望・不具合を送る</a></div>
</section>

<div class="sticky" id="sticky"><a class="btn primary" href="../../sagyotaizu/" target="_blank" rel="noopener">▶ ツールを開く</a><a class="btn" href="#">要望</a></div>
<button class="totop" id="totop" aria-label="上へ">↑</button>
'''

PARADE = ''.join(f'<div class="pm">{M[k]}</div>' for k in ['cone','guard','dump','hoe','light','barricade'])

SHARED_CSS = '''
*{box-sizing:border-box}html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}body{margin:0;overflow-x:hidden}
img,svg{max-width:100%}a{color:inherit;text-decoration:none}h1,h2,h3{margin:0;line-height:1.2}p{margin:0}
.wrap{max-width:1080px;margin:0 auto;padding:0 clamp(18px,4vw,32px)}
.reveal{opacity:1;transform:none;transition:transform .7s cubic-bezier(.2,.7,.2,1),opacity .7s}
.reveal.pre{opacity:0;transform:translateY(18px)}.reveal.d1{transition-delay:.08s}.reveal.d2{transition-delay:.16s}
.kw-grid{display:grid;gap:18px;margin-top:26px}@media(min-width:760px){.kw-grid{grid-template-columns:repeat(3,1fr)}}
.kw-ico{width:120px;height:120px;display:block;margin:0 auto 6px}
.kw-map{stroke-dasharray:80;stroke-dashoffset:80;animation:kwDraw 2.4s ease-in-out infinite}
.kw-ruler{animation:kwRuler 2.4s ease-in-out infinite;transform-origin:14px 61px}.kw-scale{animation:kwBlink 2.4s ease-in-out infinite}
.kw-ripple{animation:kwRip 2s ease-out infinite;transform-origin:center;transform-box:fill-box}.kw-ripple.r2{animation-delay:1s}
.kw-cursor{animation:kwCur 2s ease-in-out infinite}.kw-line{stroke-dasharray:60;stroke-dashoffset:60;animation:kwDraw 2s ease-in-out infinite;animation-delay:1s}
@keyframes kwDraw{0%{stroke-dashoffset:80}50%{stroke-dashoffset:0}100%{stroke-dashoffset:0}}
@keyframes kwRuler{0%,100%{transform:scaleX(.6)}50%{transform:scaleX(1)}}@keyframes kwBlink{0%,40%{opacity:0}60%,100%{opacity:1}}
@keyframes kwRip{0%{transform:scale(.3);opacity:1}100%{transform:scale(1.8);opacity:0}}
@keyframes kwCur{0%,100%{transform:translate(0,0)}50%{transform:translate(34px,-32px)}}
.can-scroll{display:flex;gap:14px;overflow-x:auto;scroll-snap-type:x mandatory;padding:22px clamp(18px,4vw,32px) 10px;-webkit-overflow-scrolling:touch;scrollbar-width:none}
.can-scroll::-webkit-scrollbar{display:none}
@media(min-width:900px){.can-scroll{display:grid;grid-template-columns:repeat(3,1fr);max-width:1080px;margin:0 auto;overflow:visible}}
.can-card{flex:0 0 78%;max-width:340px;scroll-snap-align:center;display:grid;gap:8px}.can-card p{opacity:.85}
.can-vis{aspect-ratio:5/3;display:grid;place-items:center;overflow:hidden}.can-vis svg{width:100%;height:100%}.can-m{width:56%}
.legend-rows .lr{animation:lrIn .5s both}.legend-rows .lr:nth-child(2){animation-delay:.3s}.legend-rows .lr:nth-child(3){animation-delay:.6s}.legend-rows .lr:nth-child(4){animation-delay:.9s}.legend-rows .lr:nth-child(5){animation-delay:1.2s}
.legend-rows{animation:loop 4s infinite}@keyframes lrIn{from{opacity:0;transform:translateX(-6px)}to{opacity:1}}@keyframes loop{}
.sheets .sh{animation:shFan 3s ease-in-out infinite;transform-origin:26px 90px}.sheets .s2{animation-delay:.15s}.sheets .s3{animation-delay:.3s}
@keyframes shFan{0%,100%{transform:rotate(0)}50%{transform:rotate(-4deg) translateX(-4px)}}
.paper.a4{animation:paperSwap 3s ease-in-out infinite;transform-origin:149px 74px}@keyframes paperSwap{0%,100%{transform:scale(1)}50%{transform:scale(1.15)}}
.counter{animation:cnt 2.6s ease-in-out infinite;transform-origin:100px 33px}@keyframes cnt{0%,100%{transform:scale(1)}50%{transform:scale(1.12)}}
.usb{animation:usbBob 2.4s ease-in-out infinite}@keyframes usbBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
.fly path{animation:flyArr 1.2s linear infinite}@keyframes flyArr{0%{transform:translateX(-6px);opacity:0}50%{opacity:1}100%{transform:translateX(6px);opacity:0}}
.try-note{margin-top:12px;font-size:.82rem;opacity:.75}
.spec-row{display:flex;flex-wrap:wrap;gap:10px;justify-content:center}
.parade-track{overflow:hidden}.parade-inner{display:flex;width:max-content;animation:parade 22s linear infinite}
.pm{width:96px;flex:0 0 auto;margin:0 10px}@keyframes parade{to{transform:translateX(-50%)}}
.parade-cap{display:flex;justify-content:center;padding-top:18px;padding-bottom:110px}
.sticky{position:fixed;left:0;right:0;bottom:0;z-index:60;display:flex;gap:10px;padding:10px 14px calc(10px + env(safe-area-inset-bottom));transform:translateY(120%);transition:transform .35s cubic-bezier(.2,.7,.2,1)}
.sticky.on{transform:none}.sticky .btn{flex:1;text-align:center}.sticky .btn.primary{flex:2}
.totop{position:fixed;right:14px;bottom:86px;z-index:60;width:44px;height:44px;border-radius:50%;border:0;font-weight:800;cursor:pointer;opacity:0;pointer-events:none;transition:.3s}
.totop.on{opacity:1;pointer-events:auto}
.gate{position:fixed;inset:0;z-index:100;display:grid;place-items:center;transition:transform .6s cubic-bezier(.7,0,.3,1),opacity .4s}
.gate.out{transform:translateY(-100%);opacity:.6;pointer-events:none}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}.reveal.pre{opacity:1;transform:none}}
'''

SHARED_JS = '''
(function(){
  const gate=document.getElementById('gate');
  const seen=(()=>{try{return sessionStorage.getItem('gate-seen')}catch(e){return null}})();
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  function closeGate(){if(!gate||gate.classList.contains('out'))return;gate.classList.add('out');try{sessionStorage.setItem('gate-seen','1')}catch(e){}document.body.classList.add('ready');}
  if(gate){ if(seen||reduce){gate.remove();document.body.classList.add('ready');} else { gate.addEventListener('click',closeGate); setTimeout(closeGate, window.GATE_MS||2000);} }
  // 出現（下にあるものだけ）
  const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.remove('pre');io.unobserve(e.target)}}),{threshold:.1});
  document.querySelectorAll('.reveal').forEach(el=>{if(el.closest('.can-scroll'))return;const r=el.getBoundingClientRect();if(r.top>innerHeight*.9){el.classList.add('pre');io.observe(el)}});
  // 常駐CTA・上へ
  const sticky=document.getElementById('sticky'),totop=document.getElementById('totop'),hero=document.querySelector('.hero');
  function onScroll(){const y=scrollY;const h=hero?hero.offsetHeight:400;sticky.classList.toggle('on',y>h*.6);totop.classList.toggle('on',y>h);
    if(hero){const p=Math.min(1,Math.max(0,y/(h*1.2)));document.documentElement.style.setProperty('--sp',p.toFixed(3));}}
  addEventListener('scroll',onScroll,{passive:true});onScroll();
  totop.addEventListener('click',()=>scrollTo({top:0,behavior:'smooth'}));
})();
'''

def page(title, desc, head, gate, hero, css, js, gate_ms):
    html = f'''<title>{title}</title>
<meta name="description" content="{desc}">
{head}
<style>{SHARED_CSS}{MCSS}{DEMO_CSS}{css}</style>
{gate}
{hero}
{SHARED}
<script>window.GATE_MS={gate_ms};</script>
<script>{SHARED_JS}</script>
<script>{DEMO_JS}</script>
<script>{js}</script>
'''
    html = html.replace('{{DEMO}}', DEMO).replace('{{PARADE}}', PARADE)
    html = re.sub(r'\{\{M:(\w+)\}\}', lambda m: M[m.group(1)], html)
    return html
