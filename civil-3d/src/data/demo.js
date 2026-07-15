// デモデータ: 実DXFが無くてもツールの動作を確認できるサンプル現場。
// ゆるやかにカーブする延長120mの道路 + 現況地盤 + 試験掘り3本 + ボックスカルバート1基。
// （すべて架空の値。検討手順のデモ用）

// 線形: 正弦カーブの平面センターライン
export function demoAlignmentPoints() {
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const s = i / 24;
    pts.push({ x: s * 120, y: 16 * Math.sin(s * Math.PI) });
  }
  return pts;
}

// 断面: 追加距離ごとの横断(現況地盤ライン)。左右で切土/盛土を表現。
function demoProfile(station) {
  const base = 100 - 0.02 * station; // 計画高の下り勾配
  const prof = [];
  for (let o = -14; o <= 14; o += 1) {
    const ao = Math.abs(o);
    let z = base - 0.02 * Math.min(ao, 4); // 路面2%クラウン
    if (ao > 4) z -= 0.45 * (ao - 4); // 法面で下がる
    // 現況地形のうねり（横断・縦断で変化）
    z += 1.6 * Math.sin(station * 0.045 + o * 0.14) + (o < 0 ? 1.2 : -0.6);
    prof.push({ offset: o, z });
  }
  return prof;
}

export function demoSections(alignment) {
  const secs = [];
  for (let st = 0; st <= alignment.length; st += 5) {
    secs.push({ station: st, profile: demoProfile(st) });
  }
  return secs;
}

// 試験掘り(ボーリング柱状図の簡易版): 位置(station/offset) と土層構成
export function demoTestPits() {
  return [
    {
      id: 'TP-1', station: 20, offset: -2,
      layers: [
        { name: '埋土 B', thickness: 1.2, color: 0xb98d4e },
        { name: '砂質土 As', thickness: 2.6, color: 0xd8c37a },
        { name: '粘性土 Ac', thickness: 3.0, color: 0x8a9a5b },
        { name: '礫 G', thickness: 2.2, color: 0x9aa0a6 },
      ],
    },
    {
      id: 'TP-2', station: 60, offset: 0,
      layers: [
        { name: '埋土 B', thickness: 0.8, color: 0xb98d4e },
        { name: '砂質土 As', thickness: 3.4, color: 0xd8c37a },
        { name: '粘性土 Ac', thickness: 4.0, color: 0x8a9a5b },
      ],
    },
    {
      id: 'TP-3', station: 100, offset: 3,
      layers: [
        { name: '埋土 B', thickness: 1.5, color: 0xb98d4e },
        { name: '砂礫 Sg', thickness: 2.0, color: 0xc9b487 },
        { name: '軟岩 Ws', thickness: 3.5, color: 0x7d7f88 },
      ],
    },
  ];
}

// 構造物: ボックスカルバート(検討用の当たり確認)
export function demoStructures() {
  return [
    {
      id: 'BOX-1', type: 'box', station: 60, offset: 0,
      width: 8, // 道路横断方向(オフセット方向)
      run: 6, // 進行方向
      height: 3.2,
      sink: 3.4, // 地表からの埋設深さ(上端の下がり)
      color: 0x9fb2c9,
      label: 'ボックスカルバート 3.0×3.0',
    },
  ];
}

// 仮設: 掘削オープンカット範囲(検討用の想定)
export function demoTempWorks() {
  return [
    {
      id: 'CUT-1', type: 'excavation', station: 60, offset: 0,
      width: 12, run: 10, depth: 4.2,
      color: 0xe0a54a,
      label: '仮設オープンカット H=4.2m',
    },
  ];
}
