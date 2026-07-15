// LibreDWG の wasm(約9.4MB)を public/wasm/ にコピーする。
// リポジトリにはコミットせず、npm install 後(postinstall)と dev/build 前に配置する。
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(root, 'node_modules/@mlightcad/libredwg-web/wasm/libredwg-web.wasm');
const destDir = resolve(root, 'public/wasm');
const dest = resolve(destDir, 'libredwg-web.wasm');

if (!existsSync(src)) {
  console.warn('[copy-wasm] wasm が見つかりません。`npm install` 後に再実行されます:', src);
  process.exit(0);
}
mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log('[copy-wasm] 配置しました:', dest);
