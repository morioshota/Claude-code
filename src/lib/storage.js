/*
 * ストレージアダプタ
 * claude.aiアーティファクトの window.storage 互換API。
 * ローカル版では localStorage を使用（同期だがasyncで包んで互換にする）。
 * 将来 SQLite やサーバーAPIに差し替える場合はこのファイルだけ変更すればよい。
 * 書き込み・削除のたびに onStorageWrite の購読者へキーを知らせる(☁️同期がこれを見て送信を予約する)。
 */
const LS = typeof localStorage !== "undefined" ? localStorage : null;

const listeners = new Set();
export const onStorageWrite = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const notify = (key) => listeners.forEach((fn) => { try { fn(key); } catch (e) { /* 購読者の失敗で保存を止めない */ } });

export const storage = {
  async get(key) {
    const value = LS ? LS.getItem(key) : null;
    return { key, value }; // 未作成キーは value: null（例外は投げない）
  },
  async set(key, value) {
    if (LS) LS.setItem(key, value);
    notify(key);
    return { key, value };
  },
  async delete(key) {
    if (LS) LS.removeItem(key);
    notify(key);
    return { key, deleted: true };
  },
};
