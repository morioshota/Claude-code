/* =====================================================================
   ツール台帳（カタログの単一情報源）
   - ホームのカード一覧・更新情報・要望フォームの選択肢はすべてここから生成される
   - 新しいツールを載せる手順は site/README.md を参照
   - path は site/ からの相対パス。url は「ツールを開く」先（Pages上でも手元でも動くよう相対で書く）
   ===================================================================== */
window.TOOLS = [
  {
    id: 'sagyotaizu',
    no: 'T-001',
    name: '作業帯図作成ツール',
    en: 'Work Zone Diagram Builder',
    tagline: '道路使用許可申請の作業帯図を、地形図の上に半自動で。',
    summary: 'PDF/画像の地形図を背景に、縮尺を合わせ、規制パターン（片側交互通行・車線減少・通行止め）を起点→終点の2クリックで配置。凡例は自動生成、A4/A3印刷とPNG出力まで一気通貫。',
    category: 'road',
    tags: ['道路使用許可', '交通規制', '作図', '単一HTML', 'オフライン可'],
    status: 'released',        // released | beta | wip
    version: 'v3.1',
    updated: '2026-08-20',
    platform: 'PC（Chrome / Edge）',
    url: '../sagyotaizu/',
    lp: 'tools/sagyotaizu.html',
    guide: null,
    accent: '#f5b400',
    shot: 'assets/img/sagyotaizu-demo.webp',
    changelog: [
      { v: 'v3.1', date: '2026-08-20', text: 'ヘッダーに制作クレジットを表示' },
      { v: 'v3.0', date: '2026-08-03', text: 'A型バリケードの絵柄を現物準拠に刷新' },
      { v: 'v2.9', date: '2026-08-03', text: '寸法値の入力を実寸駆動に変更（寸法線・連続寸法）' },
      { v: 'v2.7', date: '2026-08-01', text: '建設車両の記号を追加、連続寸法に対応' },
    ],
  },
  {
    id: 'fukkoban',
    no: 'T-002',
    name: '覆工板 最適勾配 検討ツール',
    en: 'Optimal Grade Finder for Road Decking',
    tagline: '既設舗装の実測高から、段差が最小になる覆工板の勾配を算出。',
    summary: '縦断×横断のグリッドに実測高を入れるだけで、最小二乗的に最適な縦断・横断勾配を求め、各測点の高低差・すり付け長・管理値を出力。ヒートマップと3Dビューで納まりを目で確認できる。',
    category: 'temp',
    tags: ['仮設工', '覆工板', '計算', '3D', '単一HTML', 'オフライン可'],
    status: 'released',
    version: 'v1.2.0',
    updated: '2026-08-20',
    platform: 'PC（Chrome / Edge）',
    url: '../fukkoban/',
    lp: 'tools/fukkoban.html',
    guide: '../fukkoban/guide/',
    accent: '#e8590c',
    shot: 'assets/img/fukkoban-d3.webp',
    changelog: [
      { v: 'v1.2.0', date: '2026-08-20', text: 'ヘッダーに「📖 使い方」を追加。使い方ページを同梱' },
      { v: 'v1.1.0', date: '2026-08-20', text: 'three.js をローカル同梱し、オフラインでも3Dビューが動くように' },
      
    ],
  },
  {
    id: 'civil-3d',
    no: 'T-003',
    name: '土木3Dビルダー',
    en: 'Civil 3D Builder',
    tagline: '平面図と横断図から、検討用の3Dモデルをブラウザで。',
    summary: 'DWG/DXFの平面図をトレースして立坑を押し出し、横断図をジオリファレンスして現況地盤サーフェスを生成。試験掘り・埋設物・構造物を同じ標高系に重ね、納まりと干渉を確認するプロトタイプ。',
    category: 'cad',
    tags: ['3D', 'DWG/DXF', '仮設設計', '試験掘り', 'プロトタイプ'],
    status: 'wip',
    version: 'v0.1（開発中）',
    updated: '2026-07-15',
    platform: 'PC（WebGL対応ブラウザ）',
    url: null,                 // 公開ビルド未配置。準備中
    lp: 'tools/civil-3d.html',
    guide: null,
    accent: '#3b82f6',
    shot: null,
    changelog: [
      { v: 'v0.1', date: '2026-07-15', text: 'ロフトエンジン・DWG/DXF読込・立坑の3D起こし・統合ビューを試作' },
    ],
  },
  {
    id: 'koteihyo',
    no: 'T-004',
    name: '工程表作成ツール',
    en: 'Construction Schedule Builder',
    tagline: '図面つきの1ヶ月・3ヶ月工程表を、A3横1枚で。',
    summary: '明細表・図面・日ごとの作業予定をA3横1枚に。1ヶ月と3ヶ月をワンタッチで切替、雨天中止や別現場を入れれば以降の予定が自動でずれる（📌で固定した作業は動かない）。図面に施工箇所の番号を打てて、そのまま印刷できる。',
    category: 'manage',
    tags: ['工程管理', '工程表', '雨休', '図面', '単一HTML', 'オフライン可'],
    status: 'released',
    version: 'v1.0.0',
    updated: '2026-09-12',
    platform: 'PC（Chrome / Edge）',
    url: '../koteihyo/',
    lp: 'tools/koteihyo.html',
    guide: null,
    accent: '#12a150',
    shot: 'assets/img/koteihyo.webp',
    changelog: [
      { v: 'v1.0.0', date: '2026-09-12', text: '公開。1ヶ月／3ヶ月・日別セル／バーチャート・休工の自動スライド・図面への番号打ち・A3印刷' },
    ],
  },
];

window.TOOL_CATEGORIES = [
  { id: 'all',  label: 'すべて' },
  { id: 'road', label: '道路・交通規制' },
  { id: 'temp', label: '仮設工・計算' },
  { id: 'cad',  label: '図面・3D' },
  { id: 'manage', label: '工程・現場管理' },
];
