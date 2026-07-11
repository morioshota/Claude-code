# 銘柄図鑑 KABU DEX

日本株・米国株のリサーチ済み銘柄を「図鑑コレクション」として管理するReactアプリ。
claude.aiのアーティファクトとして開発され、Claude Codeでの継続開発のために移行された。

## オーナーの利用文脈（重要）

- オーナーは中長期の個人投資家。kabu-research（チャット側のスキル）で作った投資メモを、このアプリの「生態調査記録」に貼り付けて蓄積する運用
- **売買推奨に見える演出・文言は絶対に追加しない。** レアリティ・Lv・CP・鮮度は「研究の蓄積量」の遊び指標であり、銘柄の良し悪しや株価とは無関係——この免責はUI各所に明記されており、削除しないこと
- 株価の自動取得を実装する場合も、予測・推奨の表示はしない（事実の提示のみ）

## 技術スタック

- Vite + React 18（JSX、単一コンポーネントファイル構成）
- three.js 0.128（3D牧場。カメラ操作は公式OrbitControls＝慣性つき。タップ選択は自前実装で、7px以上のドラッグ後や2本指操作では選択しない）
- 永続化: `src/lib/storage.js` のアダプタ経由（現在はlocalStorage）

## ファイル構成

- `src/KabuDex.jsx` — メインコンポーネント（状態管理・永続化・バックアップ処理）
- `src/data/constants.js` — 定数・マスタデータ（タイプ/レアリティ/ステージ/実績/シード銘柄/メモテンプレ）
- `src/data/species.js` — 種族ドット絵データ（`SPECIES_POOL` / `CREATURE_LOOK`）
- `src/lib/storage.js` — ストレージアダプタ。claude.aiの `window.storage` 互換API
- `src/lib/util.js` — 日付/ID生成/ハッシュ/擬似乱数/色
- `src/lib/stock.js` — 銘柄の派生値（Lv/CP/ステージ/鮮度/実績判定）
- `src/lib/quotes.js` — 参考株価の取得・キャッシュ（`api/quote.js` 経由）
- `src/lib/sprites.js` — ドット絵のピクセル生成（決定論的抽選＋進化装飾＋色違い）
- `src/lib/sound.js` — レトロ効果音（Web Audioで自前生成。`kabu-sound` キーでミュート永続化）
- `src/lib/activity.js` — 研究活動の記録（草カレンダー用。`kabu-activity-v1` キー）
- `src/data/evolution.js` — 進化パターンのタイプ別プールと演出ガチャの確率
- `src/components/` — UI部品（`ui.jsx` 共通部品 / `DexCard` / `DetailModal` / `StockForm` / `notes` / `AiAssistant` / `modals`（パーティ・実績・バックアップ）/ `Ranch`（3D牧場）/ `Heatmap`（草カレンダー）/ `TriggerCheck`（トリガー点検）/ `fx`（演出レイヤー・セレモニー））
- `src/main.jsx` / `index.html` — エントリポイント

## データモデル

### storage key: `kabu-zukan-v1`
```json
{ "stocks": [ {
  "id": "内部ID(uid)", "no": 1, "name": "コムシスHD", "code": "1721",
  "market": "東証プライム", "type": "build", "rarity": 4,
  "status": "hold | watch | sold",
  "hypothesis": "マクロ仮説", "bullets": ["強気材料"], "risks": ["リスク"],
  "triggers": ["前提が崩れる条件"], "logs": [{"date":"YYYY-MM-DD","text":"クイック記録"}],
  "noteCount": 0, "lastResearch": "YYYY-MM-DD",
  "shiny": false, "shinyAt": "当選日(任意)",
  "evoPattern": "進化装飾のkind(初進化時に抽選し永久保存。evolution.js参照)",
  "evoFxBest": "normal|rare|ultra (引いた進化演出の最高レア。実績用)",
  "lastTriggerCheck": "YYYY-MM-DD (トリガー点検の最終実施日)"
} ] }
```

### storage key: `kabu-activity-v1`
草カレンダー用の日別活動回数。`{ "days": {"YYYY-MM-DD": 回数}, "seeded": true }`。
初回のみ既存のメモ・記録の日付から復元(seed)する。バックアップ(format 2)に含まれる。

### storage key: `kabu-notes:{stockId}`
生態調査記録（投資メモ全文）の配列。銘柄ごとに独立キー。
```json
[ {"id":"...","date":"YYYY-MM-DD","title":"","body":"マークダウン全文","diff":"前回との差分","ai":false} ]
```

## 不変条件（変更してはいけない仕様）

1. **姿の決定論**: クリーチャーの姿は `hashStr(証券コード)` をシードに `mulberry32` で抽選し、コードが同じ限り永久に同一。内部IDをシードに使ってはいけない（過去に「開くたびに姿が変わる」バグの原因になった）
2. **種族システム**: `SPECIES_POOL` はタイプごと3種族×10タイプ=30種族のドット絵（12px幅の文字列グリッド）。文字は `.bsaoweyE` のうち `.bsaowye` のみ許可
3. **鮮度と動き**: `lastResearch` からの経過日数で 0-14日=跳ねる / -45日=歩く / -90日=のんびり / 90日超=眠る。**記録の削除では鮮度を更新しない**（touch フラグ）
4. **保存失敗時の保護**: 読み込み失敗時は既存データを上書きしない。保存失敗時はキャッシュを巻き戻して入力を保持する
5. **運は研究行動にだけ紐づく**: 色違い(記録保存ごと5%)・進化パターン・演出ガチャの抽選トリガーは調査記録・メモ・点検などの研究行動のみ。株価・市場の動きを抽選や演出に絡めてはいけない
6. **抽選結果は永久保存**: `shiny`・`evoPattern` は一度当選したらstockに保存され変わらない（開くたびに変わる姿はNG＝不変条件1の延長）。色違いの再抽選や取り消しをしない

## 開発コマンド

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 本番ビルド(dist/)
```

## AIアシスタントの接続

プロキシは実装済み（`api/ai-draft.js` = Vercel Serverless Function）。Vercelにデプロイして
環境変数 `ANTHROPIC_API_KEY` を設定すれば「🤖AI調査アシスタント」が動く。手順は `docs/DEPLOY.md`。

- フロント（`src/components/AiAssistant.jsx`）は同一オリジンの `/api/ai-draft` を呼ぶ。
  ローカル開発でデプロイ済みプロキシを使う場合のみ `VITE_ANTHROPIC_PROXY` を設定
- プロキシは許可モデル・max_tokens上限(2000)・web検索ツールのみをホワイトリストで固定。
  任意リクエストの転送はしない（キー悪用・コスト暴走の防止）
- web検索の `pause_turn` はプロキシ側で継続処理し、テキストを集約して返す

## 株価表示（参考株価）

- 構成: `api/quote.js`（Vercel Function。Yahoo Finance chart APIをJSON化）→ `src/lib/quotes.js`（取得＋キャッシュ）→ `DetailModal` の `QuoteRow`
- データ源は Yahoo Finance の非公式chart API（`query1.finance.yahoo.com/v8/finance/chart/`）の遅延データ。エッジ10分＋ブラウザ10分キャッシュ、未知銘柄は1時間ネガティブキャッシュ
- **なぜstooqでないか**: stooq.comはクラウド(Vercel)からのアクセスを404で弾くため実運用に使えなかった。Yahooはサーバー経由でも動く（コミット履歴参照）
- **表示は事実のみ**（価格・日時・出典・免責）。前日比・騰落色・矢印などの演出は意図的に入れていない——追加しないこと（オーナー方針）
- 取得失敗・未対応銘柄・未デプロイ環境では行ごと非表示（アプリ本体に影響を出さない）
- シンボル変換: 数字始まり4桁（1721 / 186A）→ 東証 `.T`、英字ティッカー（RKLB / BRK.B）→ そのまま（`.`は`-`に）
- ⚠ Yahoo Financeは非公式エンドポイント。個人利用・表示目的にとどめる（商用再配信は規約上不可の可能性）

## あそびシステム（草・点検・ガチャ・演出）

- **草カレンダー**: `Heatmap.jsx`＋`lib/activity.js`。調査記録・メモ・銘柄登録・点検で+1。連続日数(🔥)表示
- **トリガー点検**: `TriggerCheck.jsx`。triggersが登録済みで30日以上未点検の銘柄が対象。✓無事=点検日のみ更新(鮮度は触らない)、⚠崩れたかも=メモをクイック記録として保存(鮮度も更新)。起動時バナーは1日1回(`kabu-checknag`)
- **色違い(シャイニー)**: 記録保存(touch)ごとに5%抽選→`shiny:true`永久保存。配色を色相150度回転＋きらめきドット
- **進化ビジュアル**: ステージ2以上で進化装飾が育つ。初進化時にタイプ別プール(`evolution.js`)から抽選→`evoPattern`永久保存。ステージ4は王冠
- **進化演出ガチャ**: 進化の瞬間に 通常70%/レア25%/超レア5%(`fx.jsx`のEvoCeremony)。最高レアは`evoFxBest`に保存(実績用)
- **効果音**: `lib/sound.js`。🔊ボタンでミュート(永続)。`prefers-reduced-motion`ではパーティクル等の演出を自動オフ

## バックログ（優先度順の提案）

1. ~~データのエクスポート/インポート（JSON）~~ ✅ 実装済み（図鑑の「💾 バックアップ」ボタン）
2. ~~`KabuDex.jsx` のモジュール分割（data / lib / components）~~ ✅ 実装済み
3. ~~three.js公式OrbitControlsへの置換（慣性つき操作）~~ ✅ 実装済み
4. ~~AIプロキシの実装~~ ✅ 実装済み（`api/ai-draft.js`）
5. ~~Vercel等へのデプロイ~~ ✅ 準備完了（コード・設定・手順書済み。オーナーのVercel操作のみ残 → `docs/DEPLOY.md`）
6. ~~株価表示~~ ✅ 実装済み（表示のみ・推奨なし。上記「株価表示」参照。規約原文の確認のみオーナー宿題）
