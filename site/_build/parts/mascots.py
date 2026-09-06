# マスコット6種（インラインSVG）。太い輪郭のフラット絵。色は CSS 変数で差し替え可能
OUT = 'stroke="var(--mk,#1C1A17)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"'
FACE = lambda x, y, s=1: f'''<g class="face" transform="translate({x} {y}) scale({s})">
  <circle class="eye" cx="-9" cy="0" r="3.4" fill="var(--mk,#1C1A17)"/><circle class="eye" cx="9" cy="0" r="3.4" fill="var(--mk,#1C1A17)"/>
  <path d="M-6 8 Q0 13 6 8" fill="none" {OUT}/>
  <circle cx="-15" cy="6" r="2.6" fill="var(--mcheek,#FF8FA3)" opacity=".8"/><circle cx="15" cy="6" r="2.6" fill="var(--mcheek,#FF8FA3)" opacity=".8"/>
</g>'''
SHADOW = '<ellipse class="shadow" cx="60" cy="110" rx="30" ry="5" fill="var(--mshadow,rgba(0,0,0,.14))"/>'

M = {}
M['cone'] = f'''<svg class="m m-cone" viewBox="0 0 120 120" aria-label="コーンくん">{SHADOW}
<g class="bounce">
 <path d="M40 100 L52 28 Q60 16 68 28 L80 100 Z" fill="var(--morange,#FF6B1A)" {OUT}/>
 <path d="M47.5 58 L72.5 58 L75 72 L45 72 Z" fill="#fff" {OUT}/>
 <rect x="28" y="98" width="64" height="11" rx="4" fill="var(--mk,#1C1A17)"/>
 {FACE(60,44,.95)}
</g></svg>'''

M['guard'] = f'''<svg class="m m-guard" viewBox="0 0 120 120" aria-label="ガードさん">{SHADOW}
<g class="bob">
 <rect x="47" y="86" width="9" height="20" rx="3" fill="var(--mk,#1C1A17)"/><rect x="64" y="86" width="9" height="20" rx="3" fill="var(--mk,#1C1A17)"/>
 <path d="M40 60 h40 v30 a6 6 0 0 1 -6 6 h-28 a6 6 0 0 1 -6 -6 z" fill="var(--morange,#FF6B1A)" {OUT}/>
 <rect x="40" y="70" width="40" height="5" fill="#E6E6E0"/><rect x="40" y="81" width="40" height="4" fill="#E6E6E0"/>
 <g class="arm"><rect x="76" y="38" width="9" height="30" rx="4.5" fill="var(--morange,#FF6B1A)" {OUT}/>
   <rect x="78" y="6" width="5" height="34" rx="2.5" fill="#FF3B3B" {OUT} stroke-width="2"/><circle cx="80.5" cy="8" r="4" fill="#FFD1D1" stroke="var(--mk,#1C1A17)" stroke-width="2"/>
   <circle cx="80.5" cy="39" r="5.5" fill="#FFE1BF" {OUT}/></g>
 <rect x="35" y="66" width="9" height="26" rx="4.5" fill="var(--morange,#FF6B1A)" {OUT}/>
 <circle cx="60" cy="42" r="19" fill="#FFE1BF" {OUT}/>
 <path d="M38 40 a22 22 0 0 1 44 0 z" fill="#fff" {OUT}/><rect x="36" y="38" width="48" height="6" rx="3" fill="var(--myellow,#FFC400)" {OUT}/>
 {FACE(60,47,.8)}
</g></svg>'''

M['dump'] = f'''<svg class="m m-dump" viewBox="0 0 120 120" aria-label="ダンちゃん">{SHADOW}
<g class="rumble">
 <g class="bed"><path d="M12 48 h60 v40 h-60 z" fill="var(--myellow,#FFC400)" {OUT}/><path d="M12 48 h60" stroke="#fff" stroke-width="3"/><rect x="18" y="56" width="48" height="4" fill="rgba(0,0,0,.12)"/></g>
 <path d="M72 58 h20 l12 16 v14 h-32 z" fill="var(--myellow,#FFC400)" {OUT}/>
 <path d="M76 62 h14 l8 11 h-22 z" fill="#BFE9FF" {OUT}/>
 <rect x="8" y="86" width="104" height="8" rx="3" fill="var(--mk,#1C1A17)"/>
 <g class="wheel"><circle cx="30" cy="96" r="10" fill="var(--mk,#1C1A17)"/><circle cx="30" cy="96" r="4" fill="#8C8A84"/></g>
 <g class="wheel"><circle cx="90" cy="96" r="10" fill="var(--mk,#1C1A17)"/><circle cx="90" cy="96" r="4" fill="#8C8A84"/></g>
 {FACE(87,68,.6)}
</g></svg>'''

M['hoe'] = f'''<svg class="m m-hoe" viewBox="0 0 120 120" aria-label="ホウくん">{SHADOW}
<rect x="20" y="88" width="70" height="16" rx="8" fill="var(--mk,#1C1A17)"/><rect x="26" y="92" width="58" height="8" rx="4" fill="#8C8A84"/>
<g class="body"><rect x="24" y="58" width="52" height="32" rx="6" fill="var(--myellow,#FFC400)" {OUT}/>
 <rect x="28" y="52" width="26" height="32" rx="5" fill="#BFE9FF" {OUT}/>
 {FACE(41,64,.55)}
 <g class="boom"><path d="M70 66 L104 30" stroke="var(--myellow,#FFC400)" stroke-width="10" stroke-linecap="round"/><path d="M70 66 L104 30" {OUT} fill="none" stroke-width="3" opacity=".9"/>
   <g class="arm"><path d="M104 30 L112 72" stroke="var(--myellow,#FFC400)" stroke-width="8" stroke-linecap="round"/><path d="M104 30 L112 72" fill="none" {OUT}/>
     <path d="M104 70 l18 -2 l-2 16 l-14 4 z" fill="#8C8A84" {OUT}/></g>
   <circle cx="104" cy="30" r="4" fill="var(--mk,#1C1A17)"/></g>
 <circle cx="70" cy="66" r="5" fill="var(--mk,#1C1A17)"/>
</g></svg>'''

M['light'] = f'''<svg class="m m-light" viewBox="0 0 120 120" aria-label="パトくん">{SHADOW}
<g class="glow"><circle cx="60" cy="52" r="40" fill="var(--myellow,#FFC400)" opacity=".18"/></g>
<rect x="34" y="88" width="52" height="18" rx="5" fill="var(--mk,#1C1A17)"/><rect x="28" y="82" width="64" height="9" rx="4" fill="#8C8A84" {OUT}/>
<path d="M36 82 V52 a24 24 0 0 1 48 0 v30 z" fill="var(--myellow,#FFC400)" {OUT}/>
<g class="beam"><path d="M60 52 L36 40 V64 Z" fill="#fff" opacity=".55"/></g>
{FACE(60,58,.85)}
</svg>'''

M['barricade'] = f'''<svg class="m m-bar" viewBox="0 0 120 120" aria-label="エーくん">{SHADOW}
<g class="rock">
 <path d="M28 108 L48 40" fill="none" {OUT} stroke-width="5"/><path d="M92 108 L72 40" fill="none" {OUT} stroke-width="5"/>
 <path d="M40 76 h40" fill="none" {OUT} stroke-width="4"/>
 <rect x="30" y="40" width="60" height="22" rx="4" fill="var(--myellow,#FFC400)" {OUT}/>
 <path d="M38 40 l-8 22 h10 l8 -22 z M58 40 l-8 22 h10 l8 -22 z M78 40 l-8 22 h10 l8 -22 z" fill="var(--mk,#1C1A17)" opacity=".85"/>
 {FACE(60,51,.6)}
</g></svg>'''

CSS = '''
.m{width:100%;height:auto;display:block;overflow:visible}
.m .bounce{animation:mBounce 1.4s cubic-bezier(.45,0,.2,1) infinite;transform-origin:60px 100px}
.m .bob{animation:mBob 2.2s ease-in-out infinite;transform-origin:60px 100px}
.m .arm{animation:mWave 1.6s ease-in-out infinite;transform-origin:80.5px 64px}
.m .rumble{animation:mRumble .16s steps(2) infinite}

.m .wheel{animation:mSpin 1.2s linear infinite;transform-origin:center;transform-box:fill-box}
.m .boom{animation:mBoom 3.6s ease-in-out infinite;transform-origin:70px 66px}
.m .arm2, .m .boom .arm{animation:mArm 3.6s ease-in-out infinite;transform-origin:104px 30px}
.m .beam{animation:mBeam 1.1s linear infinite;transform-origin:60px 52px}
.m .glow{animation:mGlow 1.1s ease-in-out infinite;transform-origin:60px 52px}
.m .rock{animation:mRock 2.4s ease-in-out infinite;transform-origin:60px 108px}
.m .eye{animation:mBlink 4.5s infinite;transform-origin:center;transform-box:fill-box}
@keyframes mBounce{0%,100%{transform:translateY(0) scale(1,1)}35%{transform:translateY(-10px) scale(.96,1.06)}50%{transform:translateY(-12px)}70%{transform:translateY(0) scale(1.06,.94)}}
@keyframes mBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
@keyframes mWave{0%,100%{transform:rotate(-18deg)}50%{transform:rotate(22deg)}}
@keyframes mRumble{0%{transform:translate(0,0)}100%{transform:translate(.4px,-1px)}}
@keyframes mBed{0%,55%,100%{transform:rotate(0)}75%,85%{transform:rotate(-22deg)}}
@keyframes mSpin{to{transform:rotate(360deg)}}
@keyframes mBoom{0%,100%{transform:rotate(0)}50%{transform:rotate(-18deg)}}
@keyframes mArm{0%,100%{transform:rotate(0)}50%{transform:rotate(30deg)}}
@keyframes mBeam{to{transform:rotate(360deg)}}
@keyframes mGlow{0%,100%{transform:scale(1);opacity:.6}50%{transform:scale(1.15);opacity:1}}
@keyframes mRock{0%,100%{transform:rotate(-3deg)}50%{transform:rotate(3deg)}}
@keyframes mBlink{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.1)}}
@media (prefers-reduced-motion:reduce){.m *{animation:none!important}}
'''
NAMES = {
 'cone': ('コーンくん','規制の基本。跳ねるのが仕事。','作業帯図'),
 'guard': ('ガードさん','誘導棒をふって挨拶。礼儀正しい。','作業帯図'),
 'dump': ('ダンちゃん','エンジンをふかして小刻みに震える。','作業帯図'),
 'hoe': ('ホウくん','バックホウ。掘るのが好き。','土木3D・作業帯図'),
 'light': ('パトくん','黄色回転灯。夜も光ってる。','全ツール共通'),
 'barricade': ('エーくん','A型バリケード。ゆらゆら立ってる。','作業帯図'),
}
