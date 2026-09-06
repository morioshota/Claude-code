# GENBA TOOLS — ツール紹介サイト（`site/`）

土木の現場で作った実務ツールを紹介するホームページと、ツールごとのLP（ランディングページ）、要望フォーム。
**ビルド不要の静的HTML**。`main` に push すれば GitHub Pages で公開される。

- 公開URL: https://morioshota.github.io/Claude-code/site/
  （リポジトリのルート `https://morioshota.github.io/Claude-code/` を開いても `site/` へ自動で移動する）
- ローカル確認: リポジトリのルートで `python3 -m http.server 8000` → http://localhost:8000/site/
  （`file://` で直接開いても大半は動くが、相対リンクの確認はサーバー経由が確実）

## ファイル構成

```
site/
├── index.html            ホーム（ヒーロー / ツール一覧 / こだわり / 更新情報 / 作成者 / CTA）
├── feedback.html         要望・不具合フォーム（?tool=<id> で対象ツールを事前選択）
├── tools/
│   ├── sagyotaizu.html         T-001 作業帯図作成ツール LP（ポップ案・マスコット付き。_build から生成）
│   ├── sagyotaizu-details.html T-001 くわしく（動作環境・FAQ・更新履歴。台帳から自動で埋まる）
│   ├── fukkoban.html           T-002 覆工板 最適勾配 検討ツール LP（洗練案・3D＋体験。_build から生成）
│   ├── fukkoban-details.html   T-002 くわしく
│   ├── civil-3d.html           T-003 土木3Dビルダー LP（開発中・準備中表示）
│   └── _template.html          「くわしく」型ページのテンプレート（★を書き換える）
├── _build/                     上記2つのLPの生成元（python3 site/_build/build_site.py で再生成）
│   ├── pattern_a.py / pattern_f.py   各LPの本文・CSS・JS
│   ├── build.py                共通セクション・共通CSS/JS
│   └── parts/                  マスコットSVG（mascots.py）・ミニ体験（demo.*）
├── assets/
│   ├── config.js         サイト名・作成者・URL・要望フォームの送信先 ← 運用で触るのはここ
│   ├── tools.js          ツール台帳（カード一覧・更新情報・フォーム選択肢の単一情報源）
│   ├── site.css / site.js  共通スタイル・共通スクリプト（依存ライブラリなし）
│   ├── favicon.svg
│   ├── img/              スクリーンショット（WebP）
│   └── og/               SNS共有カード画像（1200×630 PNG）
└── README.md             このファイル
```

## LP（sagyotaizu.html / fukkoban.html）を直すとき

この2ページは `site/_build/` から生成している。**生成物を直接編集せず**、`pattern_a.py`（作業帯図）/ `pattern_f.py`（覆工板）/ `parts/` を直してから

```bash
python3 site/_build/build_site.py
```

で書き出す（Pythonだけで動く。npm等は不要）。マスコットの絵・動きは `parts/mascots.py`。
ヒーローやミニ体験の計算はツール本体と同じ評価式（覆工板は `optimizePlane` と同じ手順）で、数値の見せ方を変えるときはそこを崩さないこと。

## 新しいツールを載せる手順

1. **ツール本体を配置**する（例: `mytool/index.html`。ビルド不要なら `main` に置けばそのままPagesで開ける）
2. **`assets/tools.js` に1件追加**する。`id` / `no`（T-00X）/ `name` / `tagline` / `summary` / `category` / `tags` / `status`（`released`・`beta`・`wip`）/ `version` / `updated` / `url`（site/ からの相対。例 `../mytool/`）/ `lp`（`tools/<id>.html`）/ `shot` / `changelog`
   → ホームのカード・更新情報・要望フォームの選択肢に自動で出る
3. **LPを作る**: `tools/_template.html` を `tools/<id>.html` にコピーし、★の箇所を書く。`data-tool="<id>"` を台帳の `id` と一致させると、版・更新日・履歴・「ツールを開く」のURLが自動で埋まる
4. **スクリーンショット**を `assets/img/<id>.webp` に置く（横1800px程度・200KB以下が目安）。OG画像は `assets/og/<id>.png`（1200×630）
5. カテゴリを増やすなら `tools.js` の `TOOL_CATEGORIES` に追加
6. ローカルで表示確認 → コミット → **`main` にマージして push**（作業ブランチだけでは公開URLは更新されない）

## 版を上げたとき（ツール更新時）

`assets/tools.js` の該当ツールの `version` / `updated` を更新し、`changelog` の先頭に1行足す。LP側の文言は自動で追随する。

## 要望フォームの送信先を設定する（初回のみ・5分）

`assets/config.js` の `feedbackEndpoint` が空の間は、フォームは「内容をまとめて GitHub Issue で送る／コピーする」動作になる。
メールで受け取りたい場合は次のいずれか。

| 方法 | 手順 | 向いている人 |
|---|---|---|
| **Formspree（推奨）** | https://formspree.io で無料登録 → New Form → 発行された `https://formspree.io/f/xxxxxxx` を `feedbackEndpoint` に貼る | 回答者にアカウント不要。月50件まで無料。スパム対策込み |
| Googleフォーム | フォームを作り、URLを `feedbackFormUrl` に貼る（フォームページに「Googleフォームで送る」ボタンが出る） | 集計をスプレッドシートで見たい |
| メール直送 | `contactEmail` にアドレスを書く（`mailto:` で回答者のメールアプリが開く） | **アドレスが公開される**ので注意 |
| GitHub Issue | 設定不要（既定のフォールバック）。`.github/ISSUE_TEMPLATE/tool-request.yml` に項目が入って開く | 回答者がGitHubアカウントを持っている |

## サイト名・作成者名を変える

`assets/config.js` の `siteName` / `siteTagline` / `author` を変えると、ヘッダー・フッター・表題欄は自動で変わる。
`<title>` と OGP のメタタグは検索エンジン向けに静的に書いてあるので、各HTMLの `GENBA TOOLS` を置換する:

```bash
grep -rl "GENBA TOOLS" site --include=*.html | xargs sed -i 's/GENBA TOOLS/新しい名前/g'
```

## 設計メモ

- 依存ライブラリ・ビルド工程なし（ツール本体と同じ方針。Pagesにそのまま置ける）
- テーマ: 初期表示はダーク（製図のブループリント）。☀️/🌙で切替、選択は `localStorage`（`genba-theme`）に保存
- `prefers-reduced-motion` では描画アニメーション・スクロール出現をオフ
- 見た目の確認は環境内の Chromium（`/opt/pw-browsers/`）で実描画してから提示する（`sagyotaizu/test/README.md` と同じ運用）
