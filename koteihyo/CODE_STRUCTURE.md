# コード構造解説 — 工程表作成ツール

`工程表作成ツール.html` は「HTML + CSS + 1つの `<script>`」の単一ファイル。
JSは約1,100行で、`/* ══ 見出し ══ */` と `/* ---------- 見出し ---------- */` で区切ってある。
Claude Code で直すときは、この地図で該当セクションだけ見れば全体を読み直さなくてよい。

---

## ファイル全体の並び

```
<head>
  <style>   :root の色・用紙(#sheet)・明細表(.dt)・図面(.dwgBox)・工程表(.sch)・印刷(@media print)
<body>
  header          ツールバー（新規/開く/保存・図面・表示切替・＋作業・Undo・ズーム・印刷）
  main
    #stageWrap > #stage > #sheet    ← ここが「紙」。画面のこれがそのまま印刷される
        .shHead      表題欄（工事名・施工箇所・会社/代理人/連絡先・基準日）
        .shMid       [ #sideL 明細表 ][ .shDwg 図面 ][ #sideR 明細表 ]
        .shBot       工程表（日別セル or バーチャート）
    aside#side      右パネル（選択中・休工日・レイアウト・凡例）※印刷されない
  footer            工期・実日数/完了/残・選択中・自動保存
  モーダル（新規 / 印刷 / 入力 / 使い方）、#hint、#toast、file input
<script> …本体…
```

**用紙の寸法**: `--sheetW:1587px / --sheetH:1122px`（96dpiでA3横=420×297mm）。
画面上は `setZoom()` が `#sheet` を CSS transform で拡縮するだけで、**中身のレイアウトは常に実寸**。
だから印刷で崩れない。

---

## JS セクション早見表（上から順）

| セクション | 主な関数 / 変数 | 役割 |
|---|---|---|
| 定数・ひな型 | `LS_KEY`, `STATUS`, `OFFTYPE`, `TEMPLATES` | 状態の色、休工の種類、ひな型（電線類地中化／汎用）の列見出し・候補・凡例 |
| 状態 | `state`, `sel`, `ui`, `newState`, `newTask` | 全データと選択・UI状態。`state` の形は README の「データモデル」 |
| 日付ユーティリティ | `pd/fd/addD/dowOf/diffD`, `monthAdd`, `waText`, `isOffDay`, `workDates`, `nextWork` | 文字列 `'YYYY-MM-DD'` を正として扱う（Dateは正午固定で作り、時差でずれないように） |
| **工程エンジン** | `compute()`, `totals`, `blockTotals`, `rangeDates`, `tasksOn` | **ここが心臓**。並び順に日程を詰め、休工を飛ばし、📌を尊重する |
| Undo/自動保存 | `snap`, `pushUndo`, `beginEdit`/`commitEdit`, `undo`, `redo`, `autosave`, `edit()` | 変更は必ず `edit(fn)` か `beginEdit→commitEdit` を通す。図面の画像は履歴に積まない |
| 小物 | `esc`, `showToast`, `setHint`, `askInput` | `prompt()` はブロックされるので自前モーダル |
| 描画・全体 | `renderAll`, `applySheetVars`, `renderMeta`, `renderFooter`, `selectIt` | `renderAll` は **applySheetVars を先に呼ぶ**（工程表が実寸を測って行の高さを決めるため） |
| 明細表 | `COLS`, `blockHtml`, `sumBoxHtml`, `bindSideEvents`, `scheduleSidesRefresh` | 左右の表。エリア列は同値が続く間だけ rowspan で結合 |
| 図面 | `renderDwg`, `toView`/`toNorm`, `drawMarks`, `renderDwgTools`, `renderLegend` | 画像はCSS transform、書き込みはSVG。**座標は画像に対する0〜1の比**で持つ |
| 工程表 | `renderSchedule`, `headHtml`, `cellVal`, `cellHtml`, `barHtml`, `offOverlayHtml` | CSS Grid（`--labW` + `repeat(--nCol, --colW)`）。セル表示は同じ内容が続く間だけ結合 |
| 操作 | `bindScheduleEvents`, `startBarDrag`, `openOffMenu` | 棒のドラッグ、日付クリックの休工メニュー |
| 右パネル | `renderPanel`, `renderTaskPanel`, `renderMarkPanel`, `renderPanelOff/View/Legend`, `addTask`, `addBlock`, `moveTask`, `fitBotHeight` | 選択中のものを細かく直す場所 |
| 図面の操作 | `setTool`, `fitDwg`, `dwgLocal`, `bindDwgEvents`, `finishLine` | 配置・移動・ズーム・折れ線の作図 |
| 用紙のズーム | `setZoom`, `zoomFit` | `#sheet` の transform と `#stage` の寸法 |
| 入出力 | `ensurePdfJs`, `loadDwgFile`, `saveJson`, `loadJson`, `migrate` | PDFは遅延ロードして1ページを画像化 |
| 印刷 | `doPrint(size, withDwg)` | `@page` を差し込み、A4は0.7071倍。`afterprint` で後始末 |
| 起動 | `HELP_HTML`, `openNewModal`, `seedRows`, `bindUI`, `syncSegs`, `init` | |

---

## よくある改修の勘どころ

### 明細表に列を1つ足す
1. `COLS` に `{ k:'xxx', w:幅, cls:'ctr' }` を足す
2. `TEMPLATES.*.cols` / `colLabels` に `xxx` を足す（両方のひな型に）
3. `newTask()` の初期値に `xxx:''` を足す
4. `migrate()` は `newState('general',…)` を土台に既存データを埋めるので、追記だけで旧データも開ける

### 休工の種類を足す
`OFFTYPE` に1行足すだけ。休工メニュー・凡例・工程表の表示は全部そこを見ている。

### 図面に書き込める図形を足す
`drawMarks()` の分岐 ／ `DWG_TOOLS` ／ `bindDwgEvents()` の作成処理 ／ `renderMarkPanel()` の4か所。
`type:'span'` が一番単純な見本。

---

## 触るときの注意（実際に踏んだもの）

1. **ドラッグ中に、掴んでいる要素を作り直さない。**
   `startBarDrag` で `selectIt()` を呼ぶと棒のDOMが作り直されてドラッグが切れる（`setPointerCapture` が InvalidStateError で落ちた）。
   選択は `sel` だけ書き換え、`pointermove`/`pointerup` は **window** に張る。
2. **履歴は「変更前」を積む。**
   入力欄の `change` で `pushUndo()` すると、すでに変わった値を積むので取り消しても戻らない。
   `focus` で `beginEdit()`、`change` で `commitEdit()` の2段構え。ボタン等の一発変更は `edit(fn)`（内部で先に積む）。
3. **`renderAll()` は `applySheetVars()` を先に呼ぶ。**
   工程表は `sch.clientHeight` を測って行の高さを決めるので、先に用紙の寸法を確定させないと
   「収まっているのに⚠が出る」「行が潰れる」が起きる。
4. **図面の「全体表示」フラグ (`dwg.fitted`)。**
   枠の高さが変わったとき、全体表示のままなら合わせ直し、手で動かした図面は勝手に戻さない。
   パン・ホイール・±ボタンでは必ず `fitted=false` にすること。
5. **日付は文字列 `'YYYY-MM-DD'` が正。** `Date` は `pd()` が正午で作る（時差・夏時間で前日にずれるのを防ぐ）。
6. **列の位置は「カレンダー日の差」で出す** (`diffD(dates[0], d)`)。`dates.indexOf()` だと表示期間をまたぐ棒が描けない。
7. **`prompt()` / `alert()` を作図フロー中に使わない。** 入力は `askInput()`。
