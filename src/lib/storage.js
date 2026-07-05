/*
 * ストレージアダプタ
 * claude.aiアーティファクトの window.storage 互換API。
 * ローカル版では localStorage を使用（同期だがasyncで包んで互換にする）。
 * 将来 SQLite やサーバーAPIに差し替える場合はこのファイルだけ変更すればよい。
 */
const LS = typeof localStorage !== "undefined" ? localStorage : null;

export const storage = {
  async get(key) {
    const value = LS ? LS.getItem(key) : null;
    return { key, value }; // 未作成キーは value: null（例外は投げない）
  },
  async set(key, value) {
    if (LS) LS.setItem(key, value);
    return { key, value };
  },
  async delete(key) {
    if (LS) LS.removeItem(key);
    return { key, deleted: true };
  },
};
