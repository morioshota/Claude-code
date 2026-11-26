/* 💰 通算損益(分析タブの一番上・2026-11・オーナー要望)
   始めてから合計いくら増えた・減ったか = いま持っている株の含み損益 ＋ これまでに確定した損益。
   ％は平均取得額比(始めてから今日まで、平均していくら株に入れていたかに対する割合)。通貨ごと・為替換算なし。
   方針(CLAUDE.md): 事実の集計のみ。良し悪しの判定・売買の推奨はしない。＋/−は空色/薄紫(赤緑にしない) */
import { totalsOf } from "../lib/portfolio.js";
import { today } from "../lib/util.js";
import { fmtMoney, fmtPct } from "../lib/holdings.js";
import { SectionFx, PAGE_FX_RANK } from "./SectionFx.jsx";

const mono = "'DotGothic16', ui-monospace, monospace";
const PLUS = "#7dd3fc", MINUS = "#c4b5fd";

const fmtSince = (d) => { const [y, m, dd] = String(d).split("-"); return `${y}/${Number(m)}/${Number(dd)}`; };
const fmtSpan = (days) => { const m = Math.round(days / 30.44); return m >= 12 ? `${Math.floor(m / 12)}年${m % 12 ? `${m % 12}か月` : ""}` : m >= 1 ? `${m}か月` : `${days}日`; };

export function TotalPnl({ stocks, quotes, loading }) {
  const { list, missingQuote, missingSale, noDate } = totalsOf(stocks, quotes || {}, today());
  if (!list.length) return null;
  const sign = (v) => (v >= 0 ? PLUS : MINUS);
  return (
    <SectionFx rank={PAGE_FX_RANK} color="#ffd166" className="kzGlassPanel" style={{ borderRadius: 14, padding: "12px 14px", marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: "#c7cdec", fontWeight: 700, marginBottom: 6 }}>
        💰 通算損益<span style={{ fontWeight: 400, fontSize: 10.5, color: "#6b7394" }}>　始めてからの合計（含み損益＋確定した損益）</span>
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        {list.map((t) => (
          <div key={t.currency}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontFamily: mono, fontSize: 24, color: "#f2f4ff", fontVariantNumeric: "tabular-nums" }}>{fmtMoney(t.pnl, t.currency, true)}</span>
              {t.pct !== null && <span style={{ fontSize: 13, color: sign(t.pnl) }}>平均取得額比 {fmtPct(t.pct)}</span>}
              {list.length > 1 && <span style={{ fontSize: 10.5, color: "#6b7394" }}>{t.currency === "JPY" ? "円の銘柄" : "ドルの銘柄"}</span>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px 12px", fontSize: 11.5, color: "#8b93b8", marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
              <span>含み損益（いま持っている{t.holdN}銘柄）</span><span style={{ textAlign: "right", color: "#dfe4ff" }}>{fmtMoney(t.unreal, t.currency, true)}</span>
              <span>＋ 確定した損益（売却{t.soldN ? `・卒業${t.soldN}回` : ""}）</span><span style={{ textAlign: "right", color: "#dfe4ff" }}>{fmtMoney(t.realized, t.currency, true)}</span>
              {t.avgCost !== null && <><span>平均取得額（{fmtSince(t.since)}から{fmtSpan(t.days)}の平均）</span><span style={{ textAlign: "right", color: "#dfe4ff" }}>{fmtMoney(t.avgCost, t.currency)}</span></>}
            </div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10, color: "#5b6284", marginTop: 8, lineHeight: 1.6 }}>
        平均取得額＝始めてから今日まで、毎日「その日に持っていた株の取得額」を平均したもの（売って買い直しても積み上がりません。何も持っていない日は0円）。％は始めてからの合計で、1年あたりではありません。
        {noDate.length > 0 && <> 購入日が未入力の銘柄（{noDate.join("・")}）は平均取得額に入っていません。</>}
        <br />含み損益は参考株価（遅延）で計算しています{loading ? "（株価を取得中…）" : ""}。配当は含みません。
        {!loading && missingQuote.length > 0 && <> 株価を取得できなかった銘柄（{missingQuote.join("・")}）の含み損益は入っていません。</>}
        {missingSale.length > 0 && <> 売却単価か平均取得単価が未入力の卒業生（{missingSale.join("・")}）は入っていません（🎓アルバムの売買の記録から入れられます）。</>}
        {" "}事実の集計で、良し悪しの判定や売買の推奨ではありません。
      </div>
    </SectionFx>
  );
}
