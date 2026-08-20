# CODE_STRUCTURE.md — コード構造マップ

`index.html` は単一ファイル（約635KB。うち約590KBは同梱した three.js r128）。
上から **CSS → HTML → JavaScript** の順で構成される。
アプリの JavaScript は属性の付かないスクリプトブロック1つのみ（three.js の同梱ブロックを除く）。

---

## ファイル全体の並び

| 区間 | 内容 |
|---|---|
| 冒頭 | バージョンヘッダコメント、three.js r128 同梱ブロック（`id="three-r128"`） |
| `<style>` | 全CSS（CSS変数によるテーマ、レイアウト、印刷用 `@media print`） |
| `<body>` | header / サイドバー(`<aside>`) / メイン(`<main>` = タブ + 4ビュー) |
| `<script>` | 計算コア → 状態管理 → 各レンダラ → 3D → CSV → 保存 → UI配線 → 起動 |

---

## CSS の要点

- **CSS変数**（`:root`）でテーマを一元管理。色を変えるならここ。
  - `--accent`（オレンジ #E8590C）がブランドカラー。覆工面の表現色とも連動
  - `--ok`（緑 = 許容内）、`--blue`（青 = 覆工が低い）、`--warn`（覆工が高い）
- `@media print` … 印刷最適化。header / サイドバー / タブ / 3Dパネル等を非表示にし、`.view.active` のみ表示する。印刷見出し `#printHead` はここで初めて `display:block` になる
- スクロール可能領域は `aside` と `.view`。`body` は `overflow:hidden` 固定

---

## JavaScript の構造

### ① 計算コア（純関数。DOM非依存）

このブロックは DOM に一切触れないため、Node.js で単体検証できる。**改修時はここを最初に検証すること。**

| 関数 | 役割 |
|---|---|
| `solve3x3(M, v)` | 3元連立方程式をガウス消去（部分ピボット選択付き）で解く。特異なら `null` |
| `buildPoints(grid, Spos, Tpos)` | グリッドを `{S, T, z}` の点配列へ変換。**null セルは除外**（欠損対応の要） |
| `olsFit(pts)` | 最小二乗による平面フィット。`{a, gS, gT}` を返す（解析解） |
| `evalForSlopes(pts, gS, gT, mode)` | 勾配固定時の最適切片 `a` と目的関数値を返す。**3モードの分岐はここに集約** |
| `optimizePlane(pts, mode, opts)` | 勾配の最適化本体。OLS を初期値に座標降下。クランプ・丸めもここ |
| `computeResults(grid, Spos, Tpos, plane)` | 各点の高低差 `deltas[][]`、最大/最小、RMS、有効点数を算出 |

**新しい最適化モードを追加する場合**は、`evalForSlopes` に分岐を1つ足し、UI のラジオボタンを追加するだけでよい。`optimizePlane` 側の変更は不要。

### ② 状態とパラメータ

| 名前 | 役割 |
|---|---|
| `grid[][]` | 既設舗装高の2次元配列。**行=縦断S、列=横断T**。未入力は `null` |
| `customDS[] / customDT[]` | 非等間隔時の**各区間の距離**（測点数−1個） |
| `lastPlane / lastRes` | 直近の最適化結果。各レンダラが参照する |
| `readParams()` | 全入力欄を読んでパラメータオブジェクトを返す。**単位変換はここで行う**（% → 小数、mm → m） |
| `getPositions(p)` | **測点の累積位置 `{Spos, Tpos}` を返す最重要関数**。等間隔・非等間隔の差異をここで吸収する |
| `ensureSpacing(nR, nC)` | 測点数の増減に合わせ `customDS/DT` を伸縮（新区間は等間隔値で補完） |

> **重要**：位置が必要な処理は必ず `getPositions()` を経由すること。`i * p.dS` のような直接計算を書くと非等間隔対応が壊れる。

### ③ レンダラ

| 関数 | 対象 |
|---|---|
| `renderSpaceEditor()` | サイドバーの個別間隔入力欄を生成 |
| `ensureGrid(nR, nC)` / `renderGrid()` | ①グリッド入力表。入力・キー移動のイベントもここで結線 |
| `fillDemo()` / `clearGrid()` | サンプル値投入 / 全消去 |
| `runOptimize()` | **最適化の実行と全ビューの更新をまとめる司令塔**。サマリー更新 → 各レンダラ呼出 → 保存 |
| `deltaColor(d, scale)` / `renderHeat()` | ②ヒートマップ（Canvas 2D 描画） |
| `renderMgmt()` | ④管理値テーブル |

### ④ 3D ビュー（three.js）

| 関数 | 役割 |
|---|---|
| `init3D()` | 初回のみ実行。renderer / scene / camera / ライト / **自前オービットコントロール** / 描画ループを構築。`THREEctx` にキャッシュ |
| `makeLabel(text, color, worldH)` | Canvas に文字を描いて `THREE.Sprite` 化。数値・測点ラベルはこれで生成 |
| `update3D()` | シーンの再構築。**表示切替やパラメータ変更のたびに全オブジェクトを作り直す**方式 |

`update3D()` の内訳：

1. 座標変換関数の定義 … `fx(j)`（横断→X）、`fz(i)`（縦断→Z）、`fy(h)`（高さ→Y、**鉛直誇張倍率 vEx を乗算**）
2. 高さ基準 `z0` = 既設高の平均。これを 0 とする相対表示
3. 既設面メッシュ … null セルを飛ばして三角形を張る（`map[i_j]` で頂点インデックスを管理）
4. 覆工面 … 4隅の高さから2枚の三角形で平面を構成
5. 高低差バー＋ラベル … `showBars / showVal / showPts` の各チェックボックスに対応
6. グリッドヘルパー、初回のみカメラ距離をエリア寸法に合わせる

> **OrbitControls は使っていない**（r128 の `build/three.min.js` に同梱されないため）。ポインタイベントによる自前実装。`cam` オブジェクト（方位角 az / 仰角 el / 距離 r / 注視点 tx,ty,tz）を更新して `place()` を呼ぶ。

> 印刷対応のため renderer は `preserveDrawingBuffer: true`。

### ⑤ CSV・保存・UI配線

| 関数 | 備考 |
|---|---|
| `exportCSV()` / `importCSV(text)` | `#` 始まりはコメント行として読み飛ばす。1列目は測点ラベルなので `j+1` 列目から読む |
| `saveState()` / `loadState()` | localStorage キーは `fukko_tool_v1`。`grid`、各入力値、`customDS/DT` を保存 |
| `switchView(v)` | タブ切替。3Dタブに入った時のみ `resize()` + `update3D()` を遅延実行（非表示中は canvas サイズが 0 のため） |
| `btnPrint` のハンドラ | 印刷見出し `#printHead` に勾配・モード・統計・日付を流し込んでから `window.print()` |
| 末尾 `init()` | 起動処理。保存復元 → 間隔エディタ → グリッド描画 → （初回のみサンプル投入）→ 最適化実行 |

---

## 同梱している three.js（v1.1.0〜）

3Dビューのための three.js は **CDN ではなく index.html の中に貼り付けてある**。回線の無い現場PCでも
3Dが動くようにするため。ファイル冒頭のヘッダコメントの直後、`id="three-r128"` のスクリプトブロックがそれ。

| 項目 | 内容 |
|---|---|
| バージョン | three.js r128（CDN で読んでいたものと同一） |
| 出所 | npm パッケージ `three@0.128.0` の `build/three.min.js` を**無改変**で貼り付け |
| sha256 | `9274bbcec8d96168626c732b5d31c775aa8cfb7eaa0599bec0c175908a2c1ce2` |
| ライセンス | MIT（Copyright 2010-2021 Three.js Authors）。冒頭のライセンス表記を削らないこと |
| サイズ | 約590KB（index.html 全体で約635KB） |

**差し替え手順**（バージョンを上げたくなったとき）:

```bash
npm pack three@0.128.0            # 別バージョンにするならここを変える
tar xzf three-0.128.0.tgz package/build/three.min.js
# package/build/three.min.js の中身を、index.html の id="three-r128" ブロックの中身と丸ごと入れ替える
```

注意点:

- **`id="three-r128"` を消さないこと。** 回帰テストと構文チェックは「属性の付かないスクリプトタグの
  最後のブロック＝アプリ本体」を抜き出す仕組み。id を消すと 590KB の同梱ブロックが検査対象になってしまう。
- 貼り付ける前に、中身に `</script` の文字列が無いことを確認する（あると HTML が途中で切れる）。r128 には無い。
- r128 より新しいバージョンに上げるときは要注意。r155 以降でライトの既定強度、r160 前後で API の削除がある。
  `update3D()` の見え方が変わるため、上げる場合は 3Dビューを目視確認すること。
- three.js を読み込めない／WebGL が使えない場合は 3Dタブに日本語のエラーを表示するだけで、
  他のタブ（グリッド入力・ヒートマップ・管理値）は通常どおり動く（`init3D()` の `fail()`）。

---

## 改修時の検証手順（推奨）

計算ロジックを変更した場合は、必ず以下で確認する。

```bash
# 1. 埋め込みJSを抽出して構文チェック
node -e "
const fs=require('fs');
const h=fs.readFileSync('index.html','utf8');
const s=[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
fs.writeFileSync('/tmp/x.js', s[s.length-1]);
"
node --check /tmp/x.js
```

**計算コアの回帰テスト**は `test/core.test.js` を用意してある（`node test/core.test.js`）。
既知平面の完全復元・非等間隔・欠損セル・3モードの挙動を検証する。**計算に触ったら必ず実行すること。**

---

## よくある改修ポイントの当たり所

| やりたいこと | 触る場所 |
|---|---|
| 色・テーマ変更 | `:root` の CSS変数 |
| 最適化モード追加 | `evalForSlopes()` に分岐 + サイドバーのラジオ追加 |
| 管理値の項目追加 | `renderMgmt()` のテーブル定義 |
| 3Dの見た目変更 | `update3D()` の該当セクション |
| three.js のバージョン更新 | 「同梱している three.js」の差し替え手順 |
| 印刷レイアウト調整 | `@media print` ブロック |
| 保存項目の追加 | `saveState()` / `loadState()` の両方 |
| 新しい入力欄の追加 | HTML に追加 → `readParams()` に追加 → `saveState()` の `ids` 配列に追加 |
