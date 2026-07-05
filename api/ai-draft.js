/*
 * AI調査アシスタント用プロキシ (Vercel Serverless Function)
 * APIキーをブラウザに置かないため、サーバー側の環境変数 ANTHROPIC_API_KEY を使って
 * Anthropic /v1/messages へ転送する。設定手順は docs/DEPLOY.md 参照。
 *
 * 悪用対策: 許可モデル・max_tokens・ツールを固定し、任意のリクエスト転送はしない。
 */

const ALLOWED_MODELS = new Set([
  "claude-sonnet-4-6",
  "claude-sonnet-5",
  "claude-haiku-4-5",
  "claude-opus-4-8",
]);
const MAX_TOKENS_CAP = 2000;
const MAX_CONTINUATIONS = 3; // web検索(サーバーツール)のpause_turn継続上限

const API_BASE = process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com";

const readBody = (req) =>
  new Promise((resolve, reject) => {
    if (req.body !== undefined) return resolve(req.body); // Vercelはパース済み
    let data = "";
    req.on("data", (c) => { data += c; });
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : null); } catch (e) { reject(e); }
    });
    req.on("error", reject);
  });

const send = (res, status, body) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
};

export default async function handler(req, res) {
  // CORS: ローカル開発(localhost:5173)からデプロイ先のプロキシを叩けるように許可
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.statusCode = 204; res.end(); return; }
  if (req.method !== "POST") {
    return send(res, 405, { error: { message: "POSTのみ受け付けます" } });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return send(res, 500, { error: { message: "サーバーに ANTHROPIC_API_KEY が設定されていません。Vercelの環境変数を確認してください（docs/DEPLOY.md 手順3）" } });
  }

  let body;
  try { body = await readBody(req); } catch (e) { body = null; }
  if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
    return send(res, 400, { error: { message: "リクエスト形式が不正です（messagesが必要）" } });
  }
  if (!ALLOWED_MODELS.has(body.model)) {
    return send(res, 400, { error: { message: `このプロキシで許可されていないモデルです: ${body.model}` } });
  }

  // 転送するフィールドをホワイトリストで固定(コスト暴走と任意転送を防ぐ)
  const payload = {
    model: body.model,
    max_tokens: Math.min(Number(body.max_tokens) || 1000, MAX_TOKENS_CAP),
    messages: body.messages,
  };
  if (Array.isArray(body.tools)) {
    payload.tools = body.tools.filter((t) => t && typeof t.type === "string" && t.type.startsWith("web_search"));
  }

  try {
    // サーバーツール(web検索)はstop_reason=pause_turnで中断されることがあるため、
    // assistant応答を積んで再送し、テキストを集約して返す
    const texts = [];
    let messages = payload.messages;
    let data = null;
    for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
      const upstream = await fetch(`${API_BASE}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({ ...payload, messages }),
      });
      data = await upstream.json();
      if (!upstream.ok) {
        const msg = data && data.error && data.error.message ? data.error.message : `Anthropic APIエラー (${upstream.status})`;
        return send(res, upstream.status, { error: { message: msg } });
      }
      for (const block of data.content || []) {
        if (block.type === "text" && block.text) texts.push({ type: "text", text: block.text });
      }
      if (data.stop_reason !== "pause_turn") break;
      messages = [...messages, { role: "assistant", content: data.content }];
    }
    return send(res, 200, {
      content: texts,
      stop_reason: data.stop_reason,
      model: data.model,
      usage: data.usage,
    });
  } catch (e) {
    return send(res, 502, { error: { message: "Anthropic APIへの接続に失敗しました。時間をおいて再試行してください" } });
  }
}
