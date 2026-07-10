# コード構造解説 — 作業帯図作成ツール

`作業帯図作成ツール.html` は「HTML + CSS + 1 つの `<script>`」で構成される単一ファイル。
JS は約 1,300 行、`// ---------- 見出し ----------` コメントでセクション分割されている。
Claude Code で編集する際は、この地図を頼りに該当セクションだけを触れば全体を読み直す必要はない。

---

## ファイル全体の並び

```
<head>            CSS 変数(:root) と全スタイル。ヘッダー/パレット/右パネル/モーダルのレイアウト
<body>
  header          ツールバー（読込・縮尺・自動配置・Undo・出力 等のボタン）
  main
    aside#palette   左：記号/作図ツールのパレット（buildPalette が動的生成）
    #stage > canvas 中央：作図キャンバス（#cv）＋ヒント表示（#hint）
    aside#props     右：図面設定 ＋ 選択オブジェクトのプロパティ（renderProps が動的生成）
  footer          モード・選択・座標表示
  各種 <input hidden> / モーダル（wizard/help/input/print）/ 非表示 iframe#printFrame
<script> …本体…
```

---

## JS セクション早見表（上から順）

| セクション | 主な関数 / 変数 | 役割 |
|---|---|---|
| 定数・状態 | `PAPER`, `LS_KEY`, `state`, `uid`, `pxPerM` | 用紙寸法、全体状態、ID 採番、縮尺換算 |
| 記号ライブラリ | `KINDS`, `txtSign`, `boardSign`, `r_round` | **記号の定義と描画**。各記号は `draw(ctx, p)` を持つ。`p`=1m あたりpx |
| ジオメトリ | `V`, `distToSeg`, `ptInPoly`, `polyCenter` | ベクトル演算・当たり判定用の数学 |
| 入力モーダル | `askInput({title,message,value,validate})` | **prompt 代替**。Promise を返す自前モーダル |
| キャンバス/ビュー | `resize`, `toWorld`, `evPos`, `zoomFit` | 画面⇔世界座標変換、ズーム調整 |
| 描画 | `render`, `drawSheet`, `drawObj`, `conePositions`, `drawDim` | **毎フレームの描画中枢**。`drawObj` が type ごとに分岐 |
| 凡例 | `usedLegendItems`, `drawLegend`, `drawLegendIcon` | 使用記号から凡例を自動生成 |
| 選択・オーバーレイ | `objBBox`, `objPoints`, `drawOverlays` | 選択枠・頂点ハンドル・作図中プレビュー |
| ヒットテスト | `hitTest`, `hitVertex` | クリック位置のオブジェクト/頂点特定 |
| Undo/Redo/自動保存 | `snapshot`, `pushUndo`, `undo`, `redo`, `autosave` | 履歴管理と localStorage 保存 |
| ツール/ヒント | `setHint`, `setTool` | 現在ツールの切替とヒント文言 |
| 入力処理 | `pointerDown/Move/Up`, `finishDraft`, keydown ハンドラ | **マウス・キーボード操作の全処理** |
| 縮尺設定 | `finishCalib`(async), `updateScaleBadge` | 2 点+実距離から `mPerPx` を決定 |
| 規制パターン自動配置 | `runTemplate(A,B)`, `wizardParams` | 3 パターンの部材一括生成 |
| パレット構築 | `PALETTE`, `buildPalette`, `drawToolIcon` | 左パレットの定義と生成 |
| プロパティパネル | `renderProps` | 選択物に応じた右パネル UI を生成・バインド |
| 背景読込 | `ensurePdfJs`, `loadBackground`, `setBgFromDataURL` | PDF/画像の取り込み（PDF.js 遅延ロード） |
| 保存/読込/出力 | `saveJson`, `loadJson`, `renderExportCanvas`, `exportPng`, `doPrint` | JSON 入出力・PNG・印刷 |
| UIバインド | `syncSettingsUI`, `bindUI` | ボタン/入力の onclick 等を接続 |
| 初期化 | `init` | 起動時の復元・パレット構築・初回フィット |

---

## 「1 種類の部材を追加する」ときに触る箇所（重要）

新しいオブジェクト type を足すと、以下の**同じ 7〜9 箇所**を一貫して更新する必要がある。
v1.1 の `divzone`（導流帯）追加がそのままお手本になる。`divzone` で grep すると全変更点が並ぶ。

1. **`drawObj`**（描画）に `else if (o.type === 'xxx')` を追加
2. **描画順マップ** `const order = {…}`（`drawSheet` と `hitTest` の 2 箇所）に登録
3. **`hitTest`** にクリック判定を追加（多角形なら `ptInPoly`+辺距離）
4. **`finishDraft`**（線/多角形ツールの確定）に生成分岐を追加、必要なら `min` 点数も
5. **パレット** `PALETTE` に項目追加、**`drawToolIcon`** にアイコン、ツールのヒント文言
6. **`setTool`** のモードラベル、**`renderProps`** の `selLabel` 名称マップ
7. **`renderProps`** に固有プロパティ UI（例：`divzone` の斜線間隔・薄塗りトグル）と `bind(...)`
8. **凡例** `usedLegendItems` と `drawLegendIcon` に登録
9. 記号 1 個で足りるなら type 追加ではなく **`KINDS` に 1 エントリ足すだけ**で済む（パレットにも 1 行追加）

> 記号（`symbol`）を増やすだけなら 1・5 相当（KINDS へ 1 エントリ＋PALETTE へ 1 行）で完了。導流帯のような「塗り・当たり判定・固有プロパティを持つ図形」はフルセットが必要。

---

## 座標系と縮尺の考え方

- 画面 = `translate(view.ox, view.oy) → scale(view.z)` を掛けた**世界座標**を表示。
- 世界座標 1px の実寸 = `settings.mPerPx`（m）。逆数 `pxPerM()` が「1m あたり px」。
- 記号サイズは `pxPerM() * symScale * (o.scl||1)`。**縮尺を変えると全記号・寸法が実寸連動**する。
- 縮尺未設定時は既定 `mPerPx=0.05`（1m=20px）。自動配置はこの既定でも動くが、警告を出す。

---

## テスト観点（変更時に必ず確認）

- **描画系**: 3 パターン自動配置 + 作業帯 + 導流帯（塗りあり/なし）+ 寸法 + 文字を置いて、PNG 出力が崩れないか。
- **縮尺**: 縮尺設定 → 寸法線が実測値を表示、コーン間隔が指定 m どおりか。
- **異常系**: 縮尺 2 点が近すぎ / 実距離に負数・空欄 / 空データで PNG 出力 / localStorage 満杯。
- **入力モーダル**: 縮尺・文字入力で `Enter`=OK, `Esc`/背景クリック=キャンセルが効くか。
- **印刷**: A4 と A3 の両方で印刷プレビューが用紙にフィットするか。
- **Undo**: 移動/頂点編集を「実際に動かした時だけ」履歴に積む挙動（クリックだけでは積まない）。
- **保存往復**: JSON 保存 → 別ブラウザで読込 → 背景・全オブジェクト・縮尺が復元されるか。

ヘッドレス検証は Canvas→SVG 変換シムで代替できる（開発時に使用。詳細は開発メモ参照）。
