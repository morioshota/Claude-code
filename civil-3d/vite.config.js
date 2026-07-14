import { defineConfig } from 'vite';

// このプロトタイプ専用の最小設定。ルートは civil-3d/ 直下。
export default defineConfig({
  root: '.',
  server: { port: 5180, open: false },
  build: { outDir: 'dist' },
});
