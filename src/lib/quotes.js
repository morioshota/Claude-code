/* 参考株価の取得(表示のみ・推奨なし)
   /api/quote (api/quote.js) 経由でYahoo Financeの遅延データを取得する。
   失敗時はnullを返し、UI側は何も表示しない(アプリ本体に影響を出さない)。 */

const TTL_MS = 10 * 60 * 1000; // 取得結果のブラウザ側キャッシュ
const NEG_TTL_MS = 60 * 60 * 1000; // 見つからない銘柄は1時間再問い合わせしない
const cacheKey = (symbol) => `kabu-quote:${symbol}`;

// 証券コードからYahoo Financeシンボルへ:
//   日本株(数字始まり4桁: 1721 / 186A) → 東証の .T
//   米国株(英字ティッカー: RKLB / BRK.B) → そのまま(クラス株の . は - に)
export const symbolFor = (stock) => {
  const code = String(stock.code || "").trim();
  if (!code) return null;
  if (/^[0-9][0-9A-Za-z]{3}$/.test(code)) return `${code.toUpperCase()}.T`;
  if (/^[A-Za-z.]{1,6}$/.test(code)) return code.toUpperCase().replace(/\./g, "-");
  return null;
};

export const fetchQuote = async (stock) => {
  const symbol = symbolFor(stock);
  if (!symbol) return null;

  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey(symbol)) || "null");
    if (cached && Date.now() - cached.at < (cached.quote ? TTL_MS : NEG_TTL_MS)) {
      return cached.quote;
    }
  } catch (e) { /* キャッシュ破損は無視して取得へ */ }

  const endpoint = import.meta.env?.VITE_QUOTE_PROXY || "/api/quote";
  let quote = null;
  let cacheable = false; // 一時的な失敗(オフライン・デプロイ直後等)はキャッシュせず次回開いたとき再試行する
  try {
    const res = await fetch(`${endpoint}?symbol=${encodeURIComponent(symbol)}`);
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data.close === "number") { quote = data; cacheable = true; }
    } else if (res.status === 404) {
      cacheable = true; // 「銘柄のデータが存在しない」と確定した場合のみ1時間ネガティブキャッシュ
    }
  } catch (e) { /* オフライン・未デプロイ等。表示しないだけ */ }

  if (cacheable) {
    try {
      localStorage.setItem(cacheKey(symbol), JSON.stringify({ at: Date.now(), quote }));
    } catch (e) { /* 容量不足等は無視 */ }
  }
  return quote;
};
