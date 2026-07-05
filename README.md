# 銘柄図鑑 KABU DEX（Claude Code移行版）

リサーチ済み銘柄を図鑑コレクションとして管理するアプリ。詳細な設計情報は `CLAUDE.md` を参照。

## セットアップ

前提: Node.js 18以上

```bash
npm install
npm run dev
```

ブラウザで http://localhost:5173 を開く。

## 公開（デプロイ）とAIアシスタントの有効化

Vercelでの公開手順と「🤖AI調査アシスタント」の接続手順は **[docs/DEPLOY.md](docs/DEPLOY.md)** を参照。
アカウント作成からAPIキー設定まで、初めての方向けに書いてあります。

## Claude Codeで開発を続けるには

1. Claude Codeをインストール（公式手順: https://code.claude.com/docs/en/overview ）
   ※ 有料プラン（Pro/Max/Team/Enterprise）またはConsoleのAPI課金が必要
2. このフォルダで `claude` を起動
3. `CLAUDE.md` が自動で読み込まれ、設計思想・データモデル・バックログを引き継いだ状態で開発できる

最初の依頼の例:
- 「CLAUDE.mdのバックログ1（エクスポート/インポート）を実装して」
- 「KabuDex.jsxをCLAUDE.mdの方針でモジュール分割して」

## 注意

- データはブラウザのlocalStorageに保存される（claude.aiアーティファクト版のデータは自動移行されない）。端末間の移行は図鑑の「💾 バックアップ」機能で
- AI調査アシスタントはローカル開発では未接続。Vercelデプロイ＋APIキー設定で有効になる（docs/DEPLOY.md）
