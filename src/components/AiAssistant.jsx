/* AI調査アシスタント(下書き生成)。接続方法はCLAUDE.md参照 */

import { useState, useRef } from "react";
import { MdView, btnStyle, Overlay } from "./ui.jsx";

function AiAssistant({ stock, onSaveAsNote, onClose }) {
  const [state, setState] = useState("idle"); // idle|loading|done|error
  const [draft, setDraft] = useState("");
  const [errMsg, setErrMsg] = useState("");
  const runningRef = useRef(false);

  const run = async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setState("loading");
    const prompt = `あなたは日本株・米国株のリサーチアシスタントです。以下の銘柄について、web検索で最新情報を確認し、投資メモの「下書き」を作成してください。

銘柄: ${stock.name}（${stock.code}）市場: ${stock.market || "不明"}
背景のマクロ仮説: ${stock.hypothesis || "未設定（ボトムアップ調査として扱う）"}

厳守ルール:
- 数値には必ず出典（媒体名と日付）を添える。検索で確認できない数値は書かない
- 確認できない情報は「未確認」と明記する。推測と事実を混ぜない
- 売買の推奨は一切しない。判断材料の提示のみ
- 出力はマークダウンの投資メモ本文のみ。前置き・後書き不要
- 分量制限があるため簡潔に。見出し: マクロ仮説との関係 / 直近の業績・ニュース / 強気材料 / リスク / 未確認事項`;
    try {
      // Vercelデプロイでは同一オリジンの /api/ai-draft (api/ai-draft.js) が使われる。
      // ローカル開発でデプロイ済みプロキシを使う場合は VITE_ANTHROPIC_PROXY にそのURLを設定。
      const endpoint = import.meta.env?.VITE_ANTHROPIC_PROXY || "/api/ai-draft";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }],
          tools: [{ type: "web_search_20260209", name: "web_search" }],
        }),
      });
      if (res.status === 404 || res.status === 405) {
        // プロキシ未設置(ローカルのnpm run dev等)
        setErrMsg("AI下書きは未接続です。Vercelへのデプロイで有効になります（docs/DEPLOY.md参照）。それまではチャットのkabu-researchで作成したメモの貼り付けをご利用ください。");
        setState("error");
        runningRef.current = false;
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setErrMsg(data?.error?.message || `生成に失敗しました（HTTP ${res.status}）`);
        setState("error");
        runningRef.current = false;
        return;
      }
      const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
      if (!text) throw new Error("empty response");
      setDraft(text);
      setState("done");
    } catch (e) {
      setErrMsg("下書きの生成に失敗しました。プロキシの設定・通信状況を確認してください。");
      setState("error");
    }
    runningRef.current = false;
  };

  return (
    <Overlay onClose={onClose} z={70}>
      <div style={{ background: "#0e1122", border: "2px solid #c084fc66", borderRadius: 18, padding: 18 }}>
        <div style={{ fontFamily: "'DotGothic16', monospace", fontSize: 15, color: "#c084fc" }}>🤖 AI調査アシスタント</div>
        <div style={{ fontSize: 11.5, color: "#8b93b8", marginTop: 4, lineHeight: 1.7 }}>
          {stock.name}（{stock.code}）についてweb検索し、投資メモの下書きを生成します。<br />
          <span style={{ color: "#fbbf24" }}>⚠ あくまで下書きです。数値・出典は必ずご自身かチャットのkabu-researchで検証してください。</span>
        </div>

        {state === "idle" && (
          <button onClick={run} style={{ ...btnStyle("#c084fc"), marginTop: 14, display: "block", textAlign: "center", padding: "11px 0", width: "100%", boxSizing: "border-box" }}>
            🔍 検索して下書きを生成する
          </button>
        )}
        {state === "loading" && (
          <div style={{ textAlign: "center", padding: "26px 0", fontFamily: "'DotGothic16', monospace", color: "#c084fc", fontSize: 13 }}>
            <span style={{ display: "inline-block", animation: "kzAura 1.2s ease-in-out infinite" }}>🔮</span> 生態を調査中…（30秒ほどかかることがあります）
          </div>
        )}
        {state === "error" && (
          <div style={{ marginTop: 14, background: "#2a0e12", border: "1px solid #f8717166", borderRadius: 10, padding: 12, fontSize: 12.5, color: "#fca5a5", lineHeight: 1.7 }}>
            {errMsg || "生成に失敗しました。通信環境を確認してください。"}<br />
            代替として、チャットで「{stock.name}を調べて」と依頼して結果を貼り付ける方法が確実です。
            <button onClick={run} style={{ ...btnStyle("#c084fc"), display: "block", marginTop: 10, padding: "7px 12px" }}>もう一度試す</button>
          </div>
        )}
        {state === "done" && (
          <>
            <div style={{ marginTop: 12, maxHeight: 320, overflowY: "auto", background: "#10142a", border: "1px solid #262d4d", borderRadius: 10, padding: 12 }}>
              <MdView text={draft} />
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button onClick={() => onSaveAsNote(draft)} style={{ all: "unset", cursor: "pointer", flex: 1, textAlign: "center", background: "#c084fc", color: "#1e0b2e", fontWeight: 800, borderRadius: 10, padding: "10px 0", fontSize: 13 }}>
                調査記録として保存（🤖印つき）
              </button>
              <button onClick={onClose} style={{ ...btnStyle("#8b93b8"), padding: "10px 16px" }}>破棄</button>
            </div>
          </>
        )}
      </div>
    </Overlay>
  );
}

export { AiAssistant };
