# CODE_STRUCTURE.md — コード構造マップ

`index.html` は単一ファイル（約720KB。うち約600KBは同梱した three.js r128）。
上から **three.js同梱 → CSS → HTML → JavaScript** の順。
アプリの JavaScript は**属性の付かないスクリプトブロック1つ**のみ（three.js の同梱ブロックを除く）。

---

## ファイル全体の並び

| 区間 | 内容 |
|---|---|
| 冒頭 | バージョンヘッダコメント、three.js r128 同梱ブロック（`id="three-r128"`） |
| `<style>` | 全CSS（CSS変数によるテーマ、レイアウト、印刷用 `@media print`） |
| `<body>` | header / サイドバー(`<aside>` ①〜⑧) / メイン(`<main>` = タブ + 4ビュー) |
| `<script>` | ①計算コア → ②状態 → ③司令塔 → ④数量ビュー → ⑤構造ビュー＋2D図 → ⑥3D → ⑦集計・ライブラリ → ⑧保存・書き出し → ⑨UI配線 → ⑩起動 |

各セクションは `/* ==================== ⑦ ... ==================== */` の見出しコメントで区切ってある。

---

## CSS の要点

- **CSS変数**（`:root`）でテーマを一元管理。`--accent`（ティール `#0F8B8D`）がこのツールの色。
  `--ok`（緑＝許容内）、`--ng`（赤＝許容超・要確認）、`--warn`（金＝目安値）。
  同居する他ツールと色を分けている（作業帯図=琥珀 / 覆工板=橙 / 土木3D=青）。
- `@media print` … header / サイドバー / タブ / 3Dの操作バーを消し、`.view.active` だけ出す。
  印刷見出し `#printHead` はここで初めて `display:block` になる。
- スクロール可能領域は `aside` と `.view`。`body` は `overflow:hidden` 固定。
- `.row.stack` … `select` を置く行だけラベルを上に積む（横並びだとラベルが潰れる）。

---

## JavaScript の構造

### ① 計算コア（純関数・DOM非依存）

**`test/core.test.js` がこの区間だけを文字列で切り出して `eval` する。**
区切りコメント「① 計算コア ここから／ここまで」を消すとテストが動かなくなる。

| 関数 | 役割 |
|---|---|
| `excavationGeometry(g)` | 掘削形状 → 体積・床付け面積・壁の総延長。トレンチ=台形断面×延長、立坑=プリズマトイド公式 |
| `toLoose / toCompact / looseToBank / compactToBank` | 変化率 L・C の換算。0除算は 0 を返す |
| `earthBalance(geo, p)` | 土量収支。掘削／埋戻し／流用／購入土／残土／基礎材を地山・ほぐし・締固め・重量で返す |
| `looseDensity(dens, L)` | ほぐし密度＝湿潤密度÷L |
| `truckLoad(truck, densLoose, heap)` | 1台の積載。容積と重量の小さい方。どちらで頭打ちかも返す |
| `haulPlan(volLoose, ...)` | 延べ台数・サイクル・回転数・日数・最終便 |
| `materialCount(geo, m, opt)` | 矢板の枚数／親杭の本数・長さ・重量。立坑は隅角部を加算 |
| `strutLevels(H, first, pitch, clear)` | 切梁の段位置。最下段は床付けから `clear`(1.0m) 以上上 |
| `rankineKa / rankineKp` | ランキンの土圧係数 |
| `backPressure(z, p)` | 背面側圧（主働＋残留水圧）。負の主働は 0 に丸める |
| `frontPassive(zp, p, H)` | 前面受働。前面水圧は見込まない（安全側） |
| `integrate(f, a, b, n)` | 中点則。`{area, moment}` を返す |
| `requiredEmbedment(p,H,Fs,pivotFn,sign,zFrom)` | 必要根入れ長。**`sign`＝腕の向き**（自立式 −1／切梁式 +1）、**`zFrom`＝主働を積分し始める深さ**（自立式 0／切梁式は最下段切梁）。二分法 |
| `adoptEmbedment(Dcalc, Dmin)` | 採用根入れ長＝計算値と最小根入れ長の大きい方 |
| `simpleBeamAnalysis(load, supports, zEnd)` | **慣用法（単純梁法）**。支間ごとに単純梁として解く。支点で M=0 |
| `cantileverMoments(load, zEnd)` | 自立式の片持ち M(z)=∫q(t)(z−t)dt |
| `sectionCheck(Mmax, Z, sigmaA)` | σ = M×1000÷Z。**Z が null なら判定しない**（`ok: null`） |
| `walerMoment(R, span)` | 腹起し M = R·l²/10 |
| `structuralCheck(geo, p, opt)` | 上を束ねる。工法で自立/切梁を振り分け、根入れ→断面力→照査まで |
| `buildSteps(method, levels, H)` | 3Dのステップ送り用。掘削深さ・壁の有無・切梁段数を持つ配列 |

**マスタ定数**: `SOIL_PRESETS`（土質）/ `MEMBER_LIB_DEFAULT`（部材）/ `TRUCK_LIB_DEFAULT`（車種）/ `METHODS`（工法）。
`MEMBER_LIB_DEFAULT` の `src` は値の状態（`一般値` / `要確認` / `要入力` / `自分で入力`）。

> **⚠ 根入れ計算でつまずく2点**（どちらも開発中に実際に踏んだ。回帰テストで見張っている）
>
> 1. **腕の符号。** 腕は `sign*(z − pivot)`。自立式は回転の中心が最下端なので全部が中心より上＝`sign:-1`。
>    切梁式は中心が上のほうにあるので `sign:+1`。取り違えると根入れが求まらなくなる。
> 2. **主働を積分する範囲（`zFrom`）。** 切梁式は**最下段の切梁より下だけ**を積分する。
>    それより上の土圧は上段の切梁が受け持つ。壁頭（0）から積分すると、切梁より上の土圧が
>    逆向きの大きなモーメントになって打ち消し合い、**根入れがほぼ0で返る**。

> **⚠ 単純梁法を選んだ理由**：当初は「1/2分担法で反力を決めて全長を数値積分」する方式にしたが、
> 分担法は全体のモーメント釣合いを満たさないため、下端で M が 0 に戻らず図が歪んだ。
> 支間ごとの単純梁に変えると支点で M=0 になり、反力の総和も荷重の総和に厳密に一致する。

### ② 状態とパラメータ

| 名前 | 役割 |
|---|---|
| `LIB` / `TRUCKS` | 編集可能なライブラリ。`dodome_lib_v1` / `dodome_truck_v1` に保存 |
| `ST` | 直近の計算結果一式（`{p, geo, bal, st, mat, haul, steps, ZperM}`）。全レンダラがここを見る |
| `shape` / `method` | `'trench'|'shaft'` / `METHODS` のキー |
| `readParams()` | 全入力欄を読む。**単位変換はここに集約**（流用率 % → 小数） |
| `currentMember()` | サイドバーの手入力値が優先。ライブラリを選び直すと入力欄が上書きされる |

### ③ 司令塔

`recalc()` … パラメータ読取 → 形状 → 土量 → 構造 → 員数 → 運搬 → ステップ を計算して `ST` に入れ、
各レンダラを呼び、保存する。**入力が変わったら必ずここを通す**（`bump()` が60msデバウンス）。

> 親杭は `Z(1本) ÷ 建込み間隔` で壁1mあたりに換算してから `structuralCheck` に渡す（`ST.ZperM`）。

### ④〜⑤ レンダラ

| 関数 | 対象 |
|---|---|
| `renderVolume()` | ①タブ。カード・土量内訳・ダンプ・員数・式 |
| `volumeFormulaText(s)` | ①タブの「計算に使った式」。数値を入れた形で組み立てる |
| `renderStructure()` | ②タブ。カード・切梁テーブル・式 |
| `structFormulaText(s)` | ②タブの式と前提。**行っていない照査の列挙もここ** |
| `diagFrame(cv, zEnd, H)` | 2D図の共通枠（深さ目盛・GL・床付け線） |
| `drawPressure()` / `drawMoment()` | 側圧分布図 / 曲げモーメント図（Canvas 2D） |
| `card(k,v,u,sub,cls)` | 結果カードのHTMLを組む共通部品 |

### ⑥ 3D ビュー

| 関数 | 役割 |
|---|---|
| `init3D()` | 初回のみ。renderer/scene/camera/ライト/**自前オービット**/描画ループ。`T3` にキャッシュ |
| `buildGround(bx,bz,dig,n,EXn,EXp,EZ,GD)` | **地盤を毎回 BufferGeometry で作り直す。** 掘削でくり抜かれた形を四角形の集まりで組む。垂直掘削でも法面掘削でも同じコードで正しい形になる |
| `mkBox / mkCyl / mkTruck` | 部品づくり |
| `makeLabel(text, color, worldH)` | Canvas に文字を描いて Sprite 化 |
| `update3D()` | シーンの再構築。表示切替やパラメータ変更のたびに全オブジェクトを作り直す |
| `resetCam()` / `syncStepRange()` / `renderLegend()` | 視点戻し / ステップスライダー / 凡例 |

座標系は **X＝掘削幅の方向 / Z＝延長の方向 / Y＝高さ（GLが0、掘削はY<0）**。

- **OrbitControls は使えない**（r128 の `build/three.min.js` に同梱されない）。`cam` オブジェクト
  （方位角 az / 仰角 el / 距離 r / 注視点 tx,ty,tz）をポインタイベントで更新して `place()` を呼ぶ。
- **ラベルは描画ループでカメラ距離に合わせて拡縮する**（`o.userData.bh × cam.r/42`）。
  固定サイズだと、引いたとき読めず寄ったとき巨大になる。
- **地中の注記は掘削の角に立てた「寸法スタッフ」の上に並べる。** ラベルは `depthTest:false` で
  地盤を透かして見えるため、ばらばらに置くと宙に浮いて見える。スタッフに揃えると引出線として読める。
- **残土とダンプは +X 側の「ヤード」に置く。** 地盤は左右非対称（`EXn` / `EXp`）に作り、
  残土が出ないときはヤードを作らない。
- **既設埋設管は `depthTest:false` の透視表示。** 地中の物を見せる素直な方法が他にないため。
  土被りが読めるよう、地表から管まで細い線を1本立てている。
- **3Dビューは非表示中に canvas サイズが 0 になる。** タブ切替時に `resize3D()` → `update3D()` を遅延実行。
- 印刷のため renderer は `preserveDrawingBuffer: true`。外すと3Dが白紙で印刷される。

### ⑦〜⑧ 集計・ライブラリ・保存

| 関数 | 備考 |
|---|---|
| `renderSummary()` / `renderLib()` / `renderTruckLib()` | ④タブ。ライブラリ表は `data-lib` / `data-trk` 属性で行を特定し、イベント委譲で編集する |
| `saveState()` / `loadState()` | `dodome_tool_v1`。入力・チェック・選択・工法・ステップを保存 |
| `exportCSV()` / `exportJSON()` | CSVはBOM付き。JSONは入力と結果の全体＋免責文 |

> 保存形式を変えるときは**キー名も変える**こと（`_v2` にする）。初回のみ再入力が必要になる旨を利用者に伝える。

### ⑨〜⑩ UI配線・起動

`wire()` で全イベントを結線 → `init()` が `loadLibs → fillSelects → loadState → syncVisibility → wire → recalc`。

- `syncVisibility()` … 工法・形状に応じて入力欄の出し入れをする唯一の場所
- `refreshMemberSelect()` … 工法の `cat` に合う部材だけを選択肢に出す
- `stepTouched` … 利用者がスライダーを触るまでは**最終ステップ（床付け完了）を初期表示**する。
  触った後はその位置を保つ

---

## 同梱している three.js

| 項目 | 内容 |
|---|---|
| バージョン | three.js r128 |
| 出所 | npm パッケージ `three@0.128.0` の `build/three.min.js` を無改変。同リポジトリの `fukkoban/index.html` に同梱されているものと同一 |
| ライセンス | MIT（Copyright 2010-2021 Three.js Authors）。冒頭のライセンス表記を削らないこと |
| サイズ | 約600KB |

差し替えるときは `npm pack three@0.128.0` → `package/build/three.min.js` の中身を
`id="three-r128"` ブロックと丸ごと入れ替える。**この id を消さないこと**（テストと構文チェックが
「属性の付かないスクリプトタグの最後のブロック＝アプリ本体」を抜き出す仕組みのため）。

---

## テスト観点（ブラウザで見るとき）

1. 工法5つ × 形状2つ を切り替えて、入力欄の出し入れと3Dの形が破綻しないか
2. 深さを 1.0m → 10m まで動かして、切梁の段数・根入れ・図が連続して変わるか
3. 地下水位を掘削深さより浅くして、側圧図に水圧が乗り、3Dに水位面が出るか
4. 「掘削土を埋戻しに流用する」を外して、残土・購入土・ダンプ台数・3Dのヤードが出るか
5. 部材ライブラリで断面係数を空にして、②の判定が「—（未入力）」に落ちるか
6. 3Dのステップ送りを端から端まで動かして、掘削→切梁の順序が正しく見えるか
7. 印刷プレビューで、表示中のタブだけが出て見出しが付くか
