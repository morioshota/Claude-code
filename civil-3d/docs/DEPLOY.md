# デプロイ手順（Vercelでブラウザから開けるようにする）

このツールは静的ビルド（Vite）なので、銘柄図鑑と同じように **Vercel にデプロイすると URL から開けます**。
Node.js のローカル起動は不要になります。

> このリポジトリの**ルートは銘柄図鑑（KABU DEX）**です。土木3Dビルダーはサブフォルダ `civil-3d/` にあるため、
> Vercel では **Root Directory を `civil-3d` に指定**して、銘柄図鑑とは**別の Vercel プロジェクト**として作成します。
> （1つの GitHub リポジトリから2つの Vercel プロジェクトを作れます）

## 手順（Vercel ダッシュボード）

1. https://vercel.com にログイン → **Add New… → Project**
2. この GitHub リポジトリ（`Claude-code`）を **Import**
3. 設定画面で以下を指定：
   - **Root Directory**: `civil-3d` を選択（「Edit」から選ぶ）
   - **Framework Preset**: `Vite`（自動検出されます）
   - **Build Command / Output Directory**: 既定のまま（`vercel.json` が `npm run build` → `dist` を指定済み）
4. **Deploy** を押す

ビルド時に `npm install`（postinstall）と `prebuild` が LibreDWG の wasm を `public/wasm/` に自動配置し、
`dist/wasm/libredwg-web.wasm` として一緒に公開されます。**追加の環境変数や設定は不要**です。

デプロイが終わると `https://<プロジェクト名>.vercel.app/` で開けます。

## 公開ブランチについて

- 現在の開発ブランチは `claude/civil-drawings-3d-model-tivyvg` です。
- そのブランチを push するたびに Vercel が **プレビューURL**を発行します（動作確認向け）。
- 常設の**本番URL**にしたい場合は、`main` にマージするか、Vercel プロジェクトの
  **Production Branch** をこのブランチに設定してください。

## 補足

- **wasm(9.4MB)** はリポジトリにはコミットせず、ビルド時に `node_modules` からコピーしています
  （`scripts/copy-wasm.mjs`）。そのため Vercel 側は通常の `npm install`＋ビルドだけで完結します。
- Vercel 以外（Netlify / Cloudflare Pages / GitHub Pages 等）でも、
  **Root=`civil-3d` / Build=`npm run build` / 公開=`dist`** で同様に動きます。
  GitHub Pages のようにサブパス（`https://<user>.github.io/<repo>/`）で公開する場合も、
  wasm の参照は `import.meta.env.BASE_URL` 基準にしてあるためベースパスに追従します
  （必要なら `vite build --base=/<repo>/` を指定）。
- ローカルで本番相当を確認するには `npm run build && npm run preview`。
