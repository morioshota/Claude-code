"""LP（作業帯図=A案 / 覆工板=洗練案）を site/tools/ に生成する。
使い方: python3 site/_build/build_site.py  （ビルド不要の成果物 HTML を書き出すだけ。Pages 側の処理は不要）
編集は pattern_a.py / pattern_f.py / parts/ を直してから再実行する。"""
import os, re, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__)); SITE = os.path.dirname(HERE); OUT = os.path.join(HERE, 'out')
os.makedirs(OUT, exist_ok=True)
for f in ('pattern_a.py', 'pattern_f.py'):
    subprocess.run([sys.executable, os.path.join(HERE, f)], check=True, cwd=HERE)
BASE = 'https://morioshota.github.io/Claude-code/site/'

def wrap(proto, *, title, desc, path, og, extra_head='', extra_css='', body_fix=lambda b: b):
    i = proto.index('</style>') + len('</style>')
    head, body = proto[:i], proto[i:]
    head = re.sub(r'<title>.*?</title>', '', head, count=1)
    head = re.sub(r'<meta name="description"[^>]*>', '', head, count=1)
    head = head.replace('</style>', extra_css + '\n</style>')
    doc = f'''<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>{title}</title>
<meta name="description" content="{desc}">
<meta name="theme-color" content="#0a0f1c">
<link rel="icon" href="../assets/favicon.svg" type="image/svg+xml">
<link rel="canonical" href="{BASE}{path}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="GENBA TOOLS">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="{BASE}{path}">
<meta property="og:image" content="{BASE}assets/og/{og}.png">
<meta name="twitter:card" content="summary_large_image">
{extra_head}{head.strip()}
</head>
<body>
{body_fix(body).strip()}
</body>
</html>
'''
    return doc

# ---------- 作業帯図（A案） ----------
a = open(os.path.join(OUT, 'a-pop.html'), encoding='utf-8').read()
def fix_a(b):
    b = b.replace('<span class="brand">GENBA TOOLS</span><a class="btn primary sm"',
                  '<a class="brand" href="../">GENBA TOOLS</a><div class="top-r"><a class="top-link" href="sagyotaizu-details.html">くわしく</a><a class="btn primary sm"')
    b = b.replace('▶ ツールを開く</a></div></header>', '▶ ツールを開く</a></div></div></header>', 1)
    b = b.replace('href="#"', 'href="../feedback.html?tool=sagyotaizu"')
    b = b.replace('<section class="parade" id="parade">',
                  '<div class="wrap more-link"><a href="sagyotaizu-details.html">動作環境・よくある質問・更新履歴は「くわしく」ページへ →</a></div>\n<section class="parade" id="parade">')
    return b
css_a = '''
/* --- くわしくリンク・ホバー/クリックの強調（ポップ: 浮く→押し込む） --- */
.brand,.btn.sm{white-space:nowrap}@media(max-width:640px){.top-link{display:none}}
.top-r{display:flex;gap:12px;align-items:center}.top-link{font-weight:900;font-size:.85rem;text-decoration:underline;text-decoration-thickness:3px;text-underline-offset:4px;text-decoration-color:var(--yel)}
.more-link{padding:0 clamp(18px,4vw,32px) 34px;text-align:center}.more-link a{font-weight:900;text-decoration:underline;text-decoration-thickness:3px;text-underline-offset:5px;text-decoration-color:var(--yel)}
@media(hover:hover){
  .btn:hover{transform:translate(-2px,-2px);box-shadow:6px 6px 0 var(--ink)}.btn.sm:hover{box-shadow:5px 5px 0 var(--ink)}
  .top-link:hover,.more-link a:hover{text-decoration-color:var(--ora);color:var(--ora)}
  .demo-reset:hover{background:#fff;color:var(--ink)}
  .totop:hover{transform:scale(1.12) rotate(-8deg)}
  .stamp:hover{transform:rotate(0) scale(1.06);background:var(--yel)}
}
.btn:active{transform:translate(3px,3px)!important;box-shadow:1px 1px 0 var(--ink)!important;transition-duration:.05s}
.demo-reset:active{transform:scale(.94)}.totop:active{transform:scale(.92)}
'''
open(os.path.join(SITE, 'tools', 'sagyotaizu.html'), 'w', encoding='utf-8').write(wrap(a,
    title='作業帯図作成ツール | GENBA TOOLS', desc='道路使用許可申請の作業帯図を、地形図の上に2クリックで。コーンも看板も凡例も自動。無料・登録不要・オフライン可。',
    path='tools/sagyotaizu.html', og='sagyotaizu', extra_css=css_a, body_fix=fix_a))

# ---------- 覆工板（洗練案） ----------
f = open(os.path.join(OUT, 'f-fukkoban.html'), encoding='utf-8').read()
def fix_f(b):
    b = b.replace('<a class="brand" href="#">GENBA TOOLS <span>/ T-002</span></a><a class="btn primary sm"',
                  '<a class="brand" href="../">GENBA TOOLS <span>/ T-002</span></a><div class="top-r"><a class="top-link" href="../../fukkoban/guide/" target="_blank" rel="noopener">使い方</a><a class="top-link" href="fukkoban-details.html">くわしく</a><a class="btn primary sm"')
    b = b.replace('>ツールを開く</a></div></header>', '>ツールを開く</a></div></div></header>', 1)
    b = b.replace('href="#"', 'href="../feedback.html?tool=fukkoban"')
    b = b.replace('<section class="close">', '<div class="wrap more-link"><a href="fukkoban-details.html">動作環境・よくある質問・更新履歴は「くわしく」ページへ →</a><a href="../../fukkoban/guide/" target="_blank" rel="noopener">使い方ページ（本体同梱） ↗</a></div>\n<section class="close">')
    return b
css_f = '''
/* --- くわしくリンク・ホバー/クリックの強調（洗練: 縁が灯る→沈む） --- */
.brand,.btn.sm{white-space:nowrap}@media(max-width:640px){.top-link{display:none}}
.top-r{display:flex;gap:14px;align-items:center}.top-link{font-size:.82rem;font-weight:700;color:var(--mut);border-bottom:1px solid transparent;transition:.15s}
.more-link{display:flex;flex-wrap:wrap;gap:8px 22px;padding:0 clamp(18px,4vw,32px) 26px}.more-link a{font-size:.88rem;font-weight:700;color:var(--mut);border-bottom:1px solid var(--hair2);transition:.15s}
@media(hover:hover){
  .btn:hover{transform:translateY(-2px);border-color:var(--acc);box-shadow:0 0 0 3px rgba(255,122,26,.18),0 14px 30px -14px var(--acc)}
  .top-link:hover,.more-link a:hover{color:var(--acc);border-color:var(--acc)}
  .d2-modes button:not(:disabled):hover,.d2-samples button:hover{border-color:var(--acc);color:var(--ink)}
  .d2-calc:hover{box-shadow:0 0 0 3px rgba(255,122,26,.25),0 14px 30px -10px var(--acc);transform:translateY(-1px)}
  .totop:hover{border-color:var(--acc);color:var(--acc)}
}
.btn:active,.d2-calc:active,.d2-modes button:active,.d2-samples button:active,.totop:active{transform:translateY(1px) scale(.97)!important;box-shadow:none!important;transition-duration:.05s}
'''
open(os.path.join(SITE, 'tools', 'fukkoban.html'), 'w', encoding='utf-8').write(wrap(f,
    title='覆工板 最適勾配 検討ツール | GENBA TOOLS', desc='既設舗装の実測高を入れるだけで、段差が最小になる覆工板の縦断・横断勾配を一回の計算で。3つの最適化モード、ヒートマップ・3D・管理値テーブル。無料・オフライン可。',
    path='tools/fukkoban.html', og='fukkoban', extra_css=css_f, body_fix=fix_f))
print('site/tools/sagyotaizu.html, fukkoban.html written')
