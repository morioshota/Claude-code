from build import page, M
HEAD='''<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Dela+Gothic+One&family=Zen+Maru+Gothic:wght@500;700;900&display=swap">'''
GATE='''<div class="gate" id="gate" role="dialog" aria-label="読み込み中">
  <div class="gate-in"><div class="gate-logo">{{M:cone}}</div><div class="gate-title">作業帯図作成ツール</div><div class="gate-load">NOW LOADING…</div>
  <div class="gate-bar"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="gate-skip">タップでスキップ</div></div>
  <div class="gate-bari">{{M:barricade}}{{M:barricade}}{{M:barricade}}{{M:barricade}}{{M:barricade}}{{M:barricade}}</div>
</div>'''
HERO='''<header class="top"><div class="wrap top-in"><span class="brand">GENBA TOOLS</span><a class="btn primary sm" href="../../sagyotaizu/" target="_blank" rel="noopener">▶ ツールを開く</a></div></header>
<section class="hero">
  <div class="wrap hero-in">
    <div class="hero-text">
      <span class="sticker">無料・登録不要</span>
      <h1>2クリックで、<br>作業帯図。</h1>
      <p class="lead">地形図を読み込んで、縮尺を合わせて、起点と終点をポチポチ。<br>コーンも看板も凡例も、勝手に並びます。</p>
      <div class="cta"><a class="btn primary lg" href="../../sagyotaizu/" target="_blank" rel="noopener">▶ 使ってみる</a><a class="btn lg" href="#try">まず体験</a></div>
    </div>
    <div class="scene" aria-hidden="true">
      <svg viewBox="0 0 600 300" class="scene-svg">
        <circle cx="500" cy="60" r="34" fill="#FFC400" stroke="#1C1A17" stroke-width="3"/>
        <g class="cloud c1"><ellipse cx="120" cy="60" rx="46" ry="20" fill="#fff" stroke="#1C1A17" stroke-width="3"/></g>
        <g class="cloud c2"><ellipse cx="330" cy="40" rx="36" ry="16" fill="#fff" stroke="#1C1A17" stroke-width="3"/></g>
        <rect x="0" y="150" width="600" height="150" fill="#8FD3F4"/>
        <path d="M0 200 h600 v100 h-600z" fill="#5A5F66" stroke="#1C1A17" stroke-width="3"/>
        <path class="dash" d="M0 250 h600" stroke="#fff" stroke-width="5" stroke-dasharray="40 30"/>
        <path d="M0 140 h600 v60 h-600z" fill="#B9E8A5" stroke="#1C1A17" stroke-width="3"/>
        <g class="row"><path d="M120 205 l5 -14 h8 l5 14z M180 205 l5 -14 h8 l5 14z M240 205 l5 -14 h8 l5 14z M300 205 l5 -14 h8 l5 14z M360 205 l5 -14 h8 l5 14z M420 205 l5 -14 h8 l5 14z" fill="#FF6B1A" stroke="#1C1A17" stroke-width="2.5"/></g>
        <path d="M120 175 h300 v26 h-300z" fill="#FF8FA3" opacity=".75" stroke="#e0407a" stroke-width="2"/>
      </svg>
      <div class="smk sm-cone">{{M:cone}}</div>
      <div class="smk sm-guard">{{M:guard}}</div>
      <div class="smk sm-dump">{{M:dump}}</div>
    </div>
  </div>
</section>
<div class="tape" aria-hidden="true"></div>'''
CSS='''
:root{--cream:#FFF4D6;--yel:#FFC400;--ora:#FF6B1A;--sky:#35A7E8;--ink:#1C1A17;--white:#fff;--pink:#FF8FA3;
 --ico-ink:var(--ink);--ico-fill:#fff;--ico-accent:var(--ora);--card-fill:#fff;
 --d-ground:#EAF6FF;--d-edge:#1C1A17;--d-center:#8C8A84;--d-cone:#FF6B1A;--d-zone:#e0407a;--dz-hatch:#e0407a;--d-dim:#1C1A17;--d-bar:#1C1A17;--d-hint-bg:#1C1A17}
body{background:var(--cream);color:var(--ink);font-family:"Zen Maru Gothic","Hiragino Maru Gothic ProN","Hiragino Sans",sans-serif;font-weight:500;line-height:1.7}
h1,h2,.h2,.gate-title,.gate-load,.brand,.stamp,.sticker{font-family:"Dela Gothic One","Zen Maru Gothic",sans-serif;font-weight:400}
.h2{font-size:clamp(1.5rem,5.4vw,2.4rem);letter-spacing:.01em}.eyebrow{display:inline-block;background:var(--ink);color:var(--yel);padding:4px 12px;border-radius:999px;font-weight:900;font-size:.8rem;margin-bottom:10px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:12px 20px;border-radius:14px;border:3px solid var(--ink);background:#fff;color:var(--ink);font-weight:900;box-shadow:4px 4px 0 var(--ink);transition:transform .12s,box-shadow .12s}
.btn:active{transform:translate(3px,3px);box-shadow:1px 1px 0 var(--ink)}.btn.primary{background:var(--yel)}.btn.lg{padding:15px 24px;font-size:1.05rem}.btn.sm{padding:8px 12px;font-size:.85rem;box-shadow:3px 3px 0 var(--ink)}.btn.ghost{background:transparent}
.tape{height:14px;background:repeating-linear-gradient(-45deg,var(--yel) 0 18px,var(--ink) 18px 36px);border-top:3px solid var(--ink);border-bottom:3px solid var(--ink)}
/* gate */
.gate{background:var(--cream);border-top:14px solid transparent;border-bottom:0;background-image:repeating-linear-gradient(-45deg,var(--yel) 0 18px,var(--ink) 18px 36px);background-size:100% 14px;background-repeat:no-repeat;overflow:hidden}
.gate-in{text-align:center;display:grid;justify-items:center;gap:6px}.gate-logo{width:120px}.gate-title{font-size:1.4rem}.gate-load{font-size:.9rem;letter-spacing:.2em;animation:blink 1s steps(2) infinite}
.gate-bar{display:flex;gap:4px;margin-top:6px}.gate-bar i{width:14px;height:20px;background:var(--ora);clip-path:polygon(35% 0,65% 0,100% 100%,0 100%);opacity:.2;animation:fill 2s steps(1) forwards}
.gate-bar i:nth-child(1){animation-delay:.1s}.gate-bar i:nth-child(2){animation-delay:.3s}.gate-bar i:nth-child(3){animation-delay:.5s}.gate-bar i:nth-child(4){animation-delay:.7s}.gate-bar i:nth-child(5){animation-delay:.9s}.gate-bar i:nth-child(6){animation-delay:1.1s}.gate-bar i:nth-child(7){animation-delay:1.3s}.gate-bar i:nth-child(8){animation-delay:1.5s}
@keyframes fill{to{opacity:1}}@keyframes blink{50%{opacity:.3}}.gate-skip{font-size:.72rem;opacity:.6;margin-top:10px}
.gate-bari{position:absolute;left:0;right:0;bottom:-10px;display:flex;justify-content:space-around}.gate-bari .m{width:90px}
/* header + hero */
.top{position:sticky;top:0;z-index:50;background:var(--cream);border-bottom:3px solid var(--ink)}.top-in{display:flex;align-items:center;justify-content:space-between;height:58px}.brand{letter-spacing:.06em}
.hero{padding:34px 0 0;overflow:hidden}.hero-in{display:grid;gap:22px}@media(min-width:860px){.hero-in{grid-template-columns:1fr 1fr;align-items:center;padding-bottom:20px}}
.sticker{display:inline-block;background:var(--pink);border:3px solid var(--ink);padding:4px 12px;border-radius:999px;transform:rotate(-4deg);box-shadow:3px 3px 0 var(--ink);font-size:.8rem;margin-bottom:12px;animation:wiggle 3s ease-in-out infinite}
@keyframes wiggle{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(2deg)}}
h1{font-size:clamp(2.4rem,10vw,4.4rem);line-height:1.1;text-shadow:4px 4px 0 var(--yel)}
.lead{margin:16px 0 20px;font-weight:700}.cta{display:flex;gap:12px;flex-wrap:wrap}
.scene{position:relative;border:3px solid var(--ink);border-radius:22px;overflow:hidden;box-shadow:6px 6px 0 var(--ink);background:#8FD3F4;margin-bottom:24px}
.scene-svg{display:block;width:100%}.dash{animation:dash 1s linear infinite}@keyframes dash{to{stroke-dashoffset:-70}}
.cloud{animation:cloud 14s linear infinite}.cloud.c2{animation-duration:20s;animation-delay:-8s}@keyframes cloud{from{transform:translateX(-120px)}to{transform:translateX(620px)}}
.smk{position:absolute}.sm-cone{width:24%;left:4%;bottom:14%}.sm-guard{width:18%;right:10%;bottom:16%}.sm-dump{width:24%;bottom:2%;animation:drive 9s linear infinite}
@keyframes drive{from{left:-30%}to{left:110%}}
/* sections */
.kw{padding:56px 0}.kw-item{background:#fff;border:3px solid var(--ink);border-radius:20px;padding:20px;box-shadow:5px 5px 0 var(--ink);text-align:center}.kw-item h3{font-family:"Dela Gothic One";font-size:1.5rem;margin-bottom:4px}
.can{background:var(--yel);border-top:3px solid var(--ink);border-bottom:3px solid var(--ink);padding:56px 0 46px}
.can-card{background:#fff;border:3px solid var(--ink);border-radius:20px;padding:14px;box-shadow:5px 5px 0 var(--ink);transition:transform .2s}.can-card:hover{transform:rotate(-1.5deg) scale(1.02)}
.can-vis{background:var(--cream);border-radius:12px;border:2px dashed var(--ink)}.can-card h3{font-family:"Dela Gothic One";font-size:1.1rem}.can-card p{font-size:.9rem}
.try{padding:56px 0}.demo{border:3px solid var(--ink);box-shadow:6px 6px 0 var(--ink)}
.spec{padding:10px 0 40px}.stamp{display:inline-block;border:3px solid var(--ink);border-radius:999px;padding:8px 16px;background:#fff;box-shadow:3px 3px 0 var(--ink);transform:rotate(-2deg)}.stamp:nth-child(even){transform:rotate(2deg);background:var(--pink)}
.parade{background:#fff;border-top:3px solid var(--ink);padding-top:18px}
.sticky{background:var(--yel);border-top:3px solid var(--ink)}.totop{background:var(--ink);color:var(--yel);border:3px solid var(--yel)}
'''
open(__import__('os').path.dirname(__file__)+'/out/a-pop.html','w').write(page('作業帯図作成ツール ポップ案','A案：ポップな現場。クリーム地にハザードイエロー、極太見出し、マスコットが跳ねる。',HEAD,GATE,HERO,CSS,'',2000))
print('A ok')
