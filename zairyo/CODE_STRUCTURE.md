# コード構造マップ — 材料在庫管理表

`index.html` は 1ファイル・約2,500行。**どこを触ればよいか**の当たり所を書いておく。
（行番号は目安。セクション区切りコメント `/* ===== ... */` で grep するのが確実）

```
index.html
├─ 1-16    <head> / メタ情報 / ヘッダコメント（★バージョンはここにも書く）
├─ 17-297  <style>       … CSS（下記）
├─ 299-729 <body>        … HTML（タブ6枚＋モーダル4枚）
└─ 730-末  <script>
   ├─ 731-1056  【計算コア】DOM非依存の純関数群 ★テスト対象
   └─ 1058-末   【画面side】状態・描画・イベント
```

---

## CSS（`<style>` 内）

| 節 | 中身 |
|---|---|
| `:root` | 色。`--paper/--ink/--accent` が下地、`--st-*` が**状態色（4段階）**、`--s1〜--s8` が**グラフの系列色** |
| header / .btn / .tabs | ヘッダー・ボタン・タブ |
| .view / .card / .kpis | 画面の器 |
| .alert / .bdg | アラート帯・状態バッジ |
| table.tbl | 表（`tr.st-crit` などで左端に色帯が出る） |
| .chartbox / .cv-wrap / .tip / .legend | グラフまわり |
| .quickpick / .steppers | 記録画面の入力部品 |
| `@media print` | A4横の印刷用。`.noprint` を付けた要素は印刷に出ない |
| `@media (max-width:860px)` | スマホ幅。`.seg .lg` を隠してボタンの文言を短くしている |

---

## 計算コア（731行〜「ここから下は画面（DOM）側」まで）★変更したらテスト

**この範囲だけを `test/core.test.js` が抽出して検証する。**
DOM・`DB`・`localStorage` に触る処理を、この範囲に書いてはいけない（テストが動かなくなる）。

| グループ | 主な関数 |
|---|---|
| 日付 | `ymd` `parseYmd` `addDays` `diffDays` `monthKey` `dateList` |
| 数値・書式 | `num` `round` `fmtQty` `fmtYen` |
| 入出庫の符号 | `signedQty`（out=負 / in=正 / adj=差分）`amountOf` |
| 在庫 | `movementsOf` `stockAt` `currentStock` `lastMoveDate` |
| 使用量 | `usageStats`（合計・使った日数・暦日平均・使った日平均・1回あたり・最大/日） |
| 発注点 | `suggestRop` `ropOf` `daysLeft` `orderQtySuggest` `typicalOrderQty` |
| 状態判定 | `statusOf` ＋定数 `STATUS_ORDER` `IDLE_DAYS` `NEAR_RATIO` |
| 単価 | `unitCostOf`（移動平均法。無ければ標準単価） |
| 時系列 | `seriesStock` `seriesUsage` `movingAvg` |
| 集計 | `purchaseByMonth` `purchaseByMaterial` |
| CSV | `csvCell` `toCSV` `parseCSV`（引用符・改行・BOM対応） |
| その他 | `uid` `niceStep`（軸の目盛り幅） |

---

## 画面side（1058行〜）

| 節 | 役割 | よく触る所 |
|---|---|---|
| 小道具 | `$` `esc` `toast` `download` `copyText` `SERIES`（系列色） | 文言・色 |
| データの保持 | `KEY` `loadDB` `saveDB` `emptyDB` | **保存に失敗したら書き戻す**作りを崩さないこと |
| 派生値 | `computeRows()` | 全画面がここを通る。1品目1行に在庫・平均・発注点・状態・金額をまとめる |
| 画面の切り替え | `show()` `renderView()` `renderBadges()` | タブを増やすときはここと `<nav class="tabs">` |
| 🏠 ダッシュボード | `renderDash` `kpi` `alertHtml` `highlight` | アラートの文面 |
| 📋 在庫一覧 | `renderStock`（`stockSort` で並べ替え） | 列の追加は `<thead>` と合わせて |
| ✏️ 記録する | `renderEntry` `onEntryMat` `onQty` `saveEntry` | 入力の導線。`enType` が out/in/adj |
| 記録の一覧（共通） | `movementTable` `mvRow` `bindMovementButtons` `delMv` | 履歴・直近・きょうの記録で共用 |
| 🧾 履歴 | `renderHist` | 絞り込み条件 |
| 📦 品目管理 | `renderMat` `openMat` `saveMat` `delMat` | |
| 📊 グラフ | `newChart` `ctxOf` `yAxis` `xLabels` `attachTip` `legendHtml` `dataTable` | 描画の土台 |
| 　〃 各グラフ | `drawStockChart` `drawUsageChart` `drawBuyChart` `drawTopChart` `renderCharts` | |
| 記録の編集 | `openMv` `saveMv` | |
| 書き出し・読み込み | `exportJSON` `importJSON` `csvMovements` `csvStock` `csvMaterials` `importMaterialsCSV` `importMovementsCSV` | CSVの列名は `idx()` で複数の別名を許している |
| サンプルデータ | `mulberry32` `sampleData` `loadSample` | **発注点を割ったら発注する**動きを120日ぶんシミュレートして作っている（乱数は固定シード＝毎回同じ） |
| 使い方 | `HELP` `openHelp` | 画面の文言を変えたらここも直す |
| 発注メモ | `orderMemo` | コピーされるテキスト |
| 起動・イベント | `wire()` `boot()` | イベントの登録は全部ここ |

---

## 触るときの注意

- **グラフを足すときは `redraws` に描画関数を push する。** ウィンドウ幅が変わったときの再描画がこれで動く
  （`renderView()` の頭で毎回空にしている）。push を忘れると、リサイズでグラフが潰れたままになる
- **canvas は `ctxOf()` を通す。** devicePixelRatio を掛けて実解像度を確保し、論理座標へ戻している。
  直接 `getContext('2d')` を呼ぶとスマホでぼやける
- **`attachTip()` の hit 判定は論理座標**（`getBoundingClientRect` 基準）で書く
- **保存は必ず `saveDB()` の戻り値を見る。** false（容量不足など）のときは、直前の状態へ戻してから抜ける
  ——入力を握りつぶさないため。既存の `saveEntry` / `saveMat` / `delMv` の書き方に倣う
- **`esc()` を通さずに `innerHTML` へ値を入れない。** 品名・備考は利用者が自由に打つ
- **日付は必ず `'YYYY-MM-DD'` 文字列で持つ。** `Date` を直接持ち回らない
  （`parseYmd` は正午固定でDateにする＝夏時間や時差でずれないため）
- **単位の違う品目を1つのグラフで合計しない。** 全品目をまたぐ使用量は「件数」で見せている
