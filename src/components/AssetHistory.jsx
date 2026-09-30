/* 💼 資産の推移(分析タブ)  2026-09末
   記録にある保有情報 × 過去の終値 から、時価・投資額・含み損益の流れを再現して見せる(lib/portfolio.js)。

   ・3つの見方: 「時価と投資額」「含み損益(＋と−の内訳)」「銘柄の積み上げ」
   ・グラフをなぞる/タップすると、その日の時価・投資額・含み損益、＋と−の綱引きバー、銘柄ごとの内訳が出る
   ・期間のはじめからの「時価の変化」を「投資額の増減(買った・売った)」と「含み損益の増減(値動き)」に分けて見せる
   ・買った日/売った日(自分の記録)をグラフの下に印で置く

   方針(CLAUDE.md): 事実の表示のみ。予測・良し悪しの判定・売買推奨はしない。
   ＋と−は赤/緑ではなく、評価を連想させない2色(空色/薄紫)で区別する。為替換算はしない */
import { useState, useEffect, useRef, useMemo } from "react";
import { TYPES } from "../data/constants.js";
import { CHART_RANGES } from "../lib/fundamentals.js";
import { fmtMoney, fmtPct } from "../lib/holdings.js";
import { positionsOf, fetchCharts, buildHistory, flowBetween, firstHoldDate, rangeForSince } from "../lib/portfolio.js";
import { niceTicks } from "./Analysis.jsx";

const PLUS = "#7dd3fc";   // 含み益の側
const MINUS = "#c4b5fd";  // 含み損の側
const GOLD = "#ffd166";   // 時価
const COST = "#c7cdec";   // 投資額
const EXIT = "#a5b4fc";   // 売却で確定したぶん(含み損益→実現損益。良し悪しの色ではない)
const mono = "'DotGothic16', ui-monospace, monospace";

const MODES = [
  { key: "value", label: "時価と投資額" },
  { key: "pnl", label: "含み損益" },
  { key: "stack", label: "銘柄の積み上げ" },
];

// 目盛り用の短い書式(円は万・億、ドルはk)
const fmtAxis = (v, cur) => {
  const a = Math.abs(v), s = v < 0 ? "-" : "";
  if (cur === "JPY") {
    if (a >= 1e8) return `${s}${+(a / 1e8).toFixed(2)}億`;
    if (a >= 1e4) return `${s}${+(a / 1e4).toFixed(a >= 1e6 ? 0 : 1)}万`;
    return `${s}${Math.round(a)}`;
  }
  if (a >= 1e6) return `${s}$${+(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${s}$${+(a / 1e3).toFixed(1)}k`;
  return `${s}$${Math.round(a)}`;
};
const fmtDate = (d, long) => {
  const [y, m, dd] = String(d).split("-");
  return long ? `${y}/${Number(m)}` : `${Number(m)}/${Number(dd)}`;
};
// 資産の推移だけ「全期間」(持ち始めてから今まで)を足す。銘柄のチャート(Analysis)は従来の6つのまま
const RANGES = [...CHART_RANGES, { key: "all", label: "全期間" }];
const fullDate = (d) => { const [y, m, dd] = String(d).split("-"); return `${y}/${Number(m)}/${Number(dd)}`; };

export function AssetHistory({ stocks, onSelect }) {
  const [range, setRange] = useState(() => { try { return localStorage.getItem("kabu-asset-range") || "1y"; } catch (e) { return "1y"; } });
  const [mode, setMode] = useState("value");
  const [charts, setCharts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [cur, setCur] = useState("JPY");
  const [idx, setIdx] = useState(null); // なぞっている点(nullなら最新)
  // 銘柄ごとの棒の長さを何で決めるか: "pct"=含み損益率(既定。保有数の差に左右されない) / "amt"=金額(資産への効き方)
  const [barBy, setBarBy] = useState(() => { try { return localStorage.getItem("kabu-asset-bar") || "pct"; } catch (e) { return "pct"; } });
  const boxRef = useRef(null);
  const svgRef = useRef(null);
  const [boxW, setBoxW] = useState(340);

  const positions = useMemo(() => positionsOf(stocks), [stocks]);
  const posSig = positions.map((p) => `${p.stock.id}:${p.shares}:${p.avg}:${p.from}:${p.to}`).join("|");
  const since = range === "all" ? firstHoldDate(positions) : null;
  const fetchKey = range === "all" ? rangeForSince(since) : range;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchCharts(positions, fetchKey, reload > 0).then((m) => { if (alive) { setCharts(m); setLoading(false); setIdx(null); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posSig, fetchKey, reload]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setBoxW(Math.floor(el.clientWidth));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [charts]);

  const hists = useMemo(() => {
    if (!charts) return {};
    const out = {};
    ["JPY", "USD"].forEach((c) => { const h = buildHistory(positions, charts, c, since); if (h) out[c] = h; });
    return out;
  }, [charts, positions, since]);
  const curs = Object.keys(hists);
  const cc = hists[cur] ? cur : curs[0];
  const H = cc ? hists[cc] : null;

  const box = { border: "1px solid #262d4d", borderRadius: 14, background: "linear-gradient(180deg,#121731,#0e1226)", padding: "14px 14px 12px", marginBottom: 16 };
  const chip = (on, color) => ({
    all: "unset", cursor: "pointer", padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
    border: `1px solid ${on ? color : "#2a3050"}`, background: on ? `${color}1f` : "transparent", color: on ? color : "#6b7394",
  });

  const header = (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontFamily: mono, fontSize: 14, color: "#f2f4ff", letterSpacing: 1 }}>💼 資産の推移</div>
        <div style={{ display: "flex", gap: 4 }}>
          {curs.length > 1 && curs.map((c) => (
            <button key={c} onClick={() => { setCur(c); setIdx(null); }} style={chip(cc === c, GOLD)}>{c === "JPY" ? "円" : "ドル"}</button>
          ))}
          <button onClick={() => !loading && setReload((n) => n + 1)} title="株価を取り直す" style={{ ...chip(false, GOLD), opacity: loading ? 0.5 : 1 }}>🔄</button>
        </div>
      </div>
      {/* 7つを1列に等分(折り返すと「全期間」だけ2行目に残って半端に見えた) */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${RANGES.length}, minmax(0, 1fr))`, gap: 4, marginTop: 8 }}>
        {RANGES.map((r) => (
          <button key={r.key} onClick={() => { setRange(r.key); try { localStorage.setItem("kabu-asset-range", r.key); } catch (e) { /* 表示だけ */ } }} style={{ ...chip(range === r.key, GOLD), padding: "4px 0", textAlign: "center" }}>{r.label}</button>
        ))}
      </div>
      {range === "all" && (
        <div style={{ fontSize: 10, color: "#5b6284", marginTop: 5 }}>
          {since ? <>全期間＝いちばん早い購入日（{fullDate(since)}）から今まで</> : "購入日の記録が無いため、5年ぶんを表示しています（購入日か📒売買の記録を入れると、持ち始めからになります）"}
        </div>
      )}
    </>
  );

  if (positions.length === 0) {
    return (
      <div style={box}>
        {header}
        <div style={{ fontSize: 12, color: "#8b93b8", lineHeight: 1.8, marginTop: 10 }}>
          保有中の銘柄に「株数」と「平均取得単価」を入れると、ここに資産の推移が出ます（銘柄の編集画面から。購入日も入れると、その日から数えます）。
        </div>
      </div>
    );
  }
  if (loading || !H) {
    return (
      <div style={box}>
        {header}
        <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#5b6284", border: "1px dashed #262d4d", borderRadius: 10, marginTop: 10 }}>
          {loading ? "株価の履歴を集めています…" : "この期間の株価データを取得できませんでした"}
        </div>
      </div>
    );
  }

  /* ---- グラフの寸法 ---- */
  const pts = H.points;
  const n = pts.length;
  const W = Math.max(280, boxW), HH = 230, PADL = 6, PADR = 54, PADT = 14, PLOTB = HH - 46, LANE = HH - 34, AXIS = HH - 8;
  const plotR = W - PADR;
  const x = (i) => PADL + (i / Math.max(1, n - 1)) * (plotR - PADL);
  const long = ["3y", "5y", "10y", "max"].includes(fetchKey);
  const i0 = idx === null ? n - 1 : idx;
  const P = pts[i0];
  // 内わけの起点は表示期間のはじめの日。まだ何も持っていない日なら「0円から」になり、内わけの合計が上の時価・含み損益と一致する。
  // ⚠ 以前は「最初に持っていた日」を起点にしていたため、その日の時価・含み損益のぶんだけ上の数字と合わなかった(オーナー指摘)
  const P0 = pts[0];
  const fromZero = !P0.items.length;

  // 見方ごとの縦軸
  let lo, hi;
  if (mode === "value") { lo = Math.min(...pts.map((p) => Math.min(p.value, p.cost))); hi = Math.max(...pts.map((p) => Math.max(p.value, p.cost))); lo = Math.max(0, lo - (hi - lo) * 0.15); }
  else if (mode === "pnl") { lo = Math.min(0, ...pts.map((p) => p.loss)); hi = Math.max(0, ...pts.map((p) => p.gain)); }
  else { lo = 0; hi = Math.max(...pts.map((p) => p.value)); }
  const tk = niceTicks(lo, hi, 4);
  const span = tk.hi - tk.lo || 1;
  const y = (v) => PADT + (1 - (v - tk.lo) / span) * (PLOTB - PADT);
  const path = (get) => pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(get(p)).toFixed(1)}`).join("");
  const band = (top, bot) => `${path(top)}${pts.map((p, i) => `L${x(n - 1 - i).toFixed(1)},${y(bot(pts[n - 1 - i])).toFixed(1)}`).join("")}Z`;
  const gid = `kzAsset-${cc}`;

  // 銘柄の積み上げ: 並びは図鑑No.順で固定(色はタイプ色)
  const stackIds = mode === "stack" ? Object.values(H.stocks).sort((a, b) => (a.no || 0) - (b.no || 0)).map((s) => s.id) : [];
  const stackLayers = stackIds.map((id, k) => {
    const below = (p) => stackIds.slice(0, k).reduce((a, j) => a + ((p.items.find((it) => it.id === j) || {}).value || 0), 0);
    const top = (p) => below(p) + ((p.items.find((it) => it.id === id) || {}).value || 0);
    return { id, d: band(top, below), color: (TYPES[H.stocks[id].type] || {}).color || "#8b93b8" };
  });

  const pick = (e) => {
    const svg = svgRef.current; if (!svg) return;
    const r = svg.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left - PADL) / (plotR - PADL)) * (n - 1));
    setIdx(Math.max(0, Math.min(n - 1, i)));
  };
  const evAt = H.events.filter((e) => e.index === i0);
  const flow = flowBetween(P0, P);
  const dateTicks = [0, 0.33, 0.66, 1].map((f) => Math.round(f * (n - 1)));
  const tugTotal = P.gain - P.loss || 1;

  /* ---- 読み取り欄(なぞった日 or 最新) ---- */
  const readout = (
    <div className="kzGlassPanel" style={{ padding: "10px 12px", marginTop: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 11, color: "#8b93b8" }}>{fullDate(P.date)}{idx === null ? " 時点（最新）" : ""}・{P.items.length}銘柄</span>
        {/* ボタンは常に置いて見えなくするだけ(出たり消えたりで高さが変わらないように) */}
        <button onClick={() => setIdx(null)} tabIndex={idx === null ? -1 : 0}
          style={{ ...chip(false, GOLD), padding: "2px 8px", fontSize: 10.5, visibility: idx === null ? "hidden" : "visible" }}>最新に戻す</button>
      </div>
      <div style={{ display: "flex", flexWrap: "nowrap", alignItems: "baseline", gap: 14, marginTop: 2, minWidth: 0 }}>
        <span style={{ fontFamily: mono, fontSize: 22, color: "#f2f4ff", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{fmtMoney(P.value, cc)}</span>
        <span style={{ fontSize: 12, color: "#c7cdec", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>投資額 {fmtMoney(P.cost, cc)}</span>
      </div>
      <div style={{ fontSize: 13, color: "#f2f4ff", marginTop: 2 }}>
        含み損益 <b style={{ fontFamily: mono, fontSize: 15, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(P.pnl, cc, true)}</b>
        <span style={{ color: "#8b93b8" }}>（{P.cost ? fmtPct((P.pnl / P.cost) * 100) : "—"}）</span>
      </div>
      {/* ＋と−の綱引きバー: 左が含み益の合計、右が含み損の合計。長さは金額の比 */}
      <div style={{ display: "flex", height: 10, borderRadius: 6, overflow: "hidden", marginTop: 8, background: "#1b2140" }}>
        <div style={{ width: `${(P.gain / tugTotal) * 100}%`, background: `linear-gradient(90deg, ${PLUS}66, ${PLUS})`, transition: "width .15s" }} />
        <div style={{ width: `${(-P.loss / tugTotal) * 100}%`, background: `linear-gradient(90deg, ${MINUS}, ${MINUS}66)`, transition: "width .15s" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
        <span style={{ color: PLUS }}>＋ {fmtMoney(P.gain, cc)}<span style={{ color: "#8b93b8" }}>（{P.gainN}銘柄）</span></span>
        <span style={{ color: MINUS }}>− {fmtMoney(Math.abs(P.loss), cc)}<span style={{ color: "#8b93b8" }}>（{P.lossN}銘柄）</span></span>
      </div>
      {/* できごと欄: 高さを2行ぶんに固定して、買/売の日をなぞっても下のグラフが動かないようにする。
          同じ日に複数あれば1件目＋「ほか○件」 */}
      <div style={{ marginTop: 6, height: 34, overflow: "hidden", fontSize: 11.5, lineHeight: "17px", borderTop: "1px dashed rgba(255,255,255,.08)", paddingTop: 3 }}>
        {evAt.length === 0 ? (
          <span style={{ color: "#4f5778" }}>📝 この日のできごと：なし（グラフ下の 買／売 の日をなぞると、その日の取引が出ます）</span>
        ) : (() => {
          const e = evAt[0];
          return (
            <span style={{ color: "#dfe4ff", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {evAt.length > 1 && <b style={{ color: "#ffd166" }}>{evAt.length}件 </b>}{e.kind === "buy" ? "📥" : "📤"} {e.label}：{e.name}（{e.shares ? `${e.shares.toLocaleString()}株・` : ""}{fmtMoney(e.amount, cc)}{e.kind === "sell" && e.realized != null ? `・実現損益 ${fmtMoney(e.realized, cc, true)}` : ""}）
            </span>
          );
        })()}
      </div>
    </div>
  );

  /* ---- 時価の変化の内訳(期間のはじめ → いまの日) ---- */
  // 物差しは「期間のはじめ→どの日までの変化でも、いちばん大きかった値」に固定する(銘柄ごとの棒と同じ考え方)。
  // ⚠ その日の3本の最大に合わせると、投資額が変わらなくても株価の動きで投資額の棒が伸び縮みして見えた(オーナー指摘)
  let flowMax = 1;
  pts.forEach((pt) => { const f = flowBetween(P0, pt); flowMax = Math.max(flowMax, Math.abs(f.dCost), Math.abs(f.dPnl), Math.abs(f.dRealized), Math.abs(f.dMove), Math.abs(f.dValue)); });
  const flowRow = (label, v, color, sub) => (
    <div style={{ display: "grid", gridTemplateColumns: "108px minmax(40px,1fr) 100px", alignItems: "center", gap: 8, fontSize: 11.5 }}>
      <span style={{ color: "#8b93b8", lineHeight: 1.25, whiteSpace: "nowrap" }}>{label}{sub && <span style={{ display: "block", fontSize: 9.5, color: "#5b6284", whiteSpace: "normal" }}>{sub}</span>}</span>
      <div style={{ position: "relative", height: 8 }}>
        <div style={{ position: "absolute", left: "50%", top: -2, bottom: -2, width: 1, background: "#3b4470" }} />
        <div style={{ position: "absolute", top: 0, bottom: 0, borderRadius: 4, background: color,
          left: v >= 0 ? "50%" : `${50 - (Math.abs(v) / flowMax) * 50}%`, width: `${(Math.abs(v) / flowMax) * 50}%` }} />
      </div>
      <span style={{ textAlign: "right", color: "#dfe4ff", fontFamily: mono, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(v, cc, true)}</span>
    </div>
  );
  /* 2つの問いに分けて、どちらも「足し算」で合うようにする(利益は＋・損は−のまま読める)。
     ⚠ 以前は「時価の変化＝①＋②＋③」に合わせるため、確定した利益をマイナスで出していた(ややこしい＝オーナー指摘)
       上: 時価の変化            = 投資額の増減   ＋ 含み損益の増減
       下: 損益(株価の動きの成果) = 含み損益の増減 ＋ 確定した損益(実現損益)  (並びはオーナー指定) */
  const secTitle = (t, sub) => (
    <div style={{ fontSize: 11, color: "#c7cdec", fontWeight: 700 }}>{t}<span style={{ fontWeight: 400, color: "#5b6284", fontSize: 10 }}>　{sub}</span></div>
  );
  const sign = (v) => (v >= 0 ? PLUS : MINUS);
  const flowCard = i0 > 0 && P.items.length > 0 && (
    <div style={{ marginTop: 10, border: "1px solid #232a4a", borderRadius: 10, padding: "9px 11px", display: "grid", gap: 6 }}>
      <div style={{ fontSize: 11, color: "#8b93b8" }}>
        🔀 {fromZero ? "保有なし（0円）" : fullDate(P0.date)} → {fullDate(P.date)} の内わけ
        <div style={{ fontSize: 10, color: "#5b6284" }}>
          {fromZero
            ? "期間のはじめはまだ何も持っていないので、時価・含み損益は上の数字と一致します"
            : <>期間のはじめ（{fullDate(P0.date)}）の時価 {fmtMoney(P0.value, H.currency)}・含み損益 {fmtMoney(P0.pnl, H.currency, true)} からの変化です</>}
        </div>
      </div>
      {secTitle("💼 時価", "持っている株の評価額")}
      {flowRow("投資額の増減", flow.dCost, COST, "買った・売った取得額")}
      {flowRow("＋ 含み損益の増減", flow.dPnl, sign(flow.dPnl))}
      <div style={{ borderTop: "1px dashed #2a3050" }} />
      {flowRow("＝ 時価の変化", flow.dValue, GOLD)}
      <div style={{ height: 4 }} />
      {secTitle("💰 損益", "株価の動きで増えた・減ったぶん")}
      {flowRow("含み損益の増減", flow.dPnl, sign(flow.dPnl), "持っている株の評価")}
      {flowRow("＋ 確定した損益", flow.dRealized, EXIT, flow.dRealized ? "売って確定（実現損益）" : "この間の売却なし")}
      <div style={{ borderTop: "1px dashed #2a3050" }} />
      {flowRow("＝ 損益の合計", flow.dMove, sign(flow.dMove))}
      <div style={{ fontSize: 10, color: "#5b6284", lineHeight: 1.6 }}>
        売った株の損益は、売った時点で「確定した損益」になって手元のお金に移るので、時価（持っている株の評価額）には入りません。
        そのため時価の変化には含み損益の増減だけが入り、損益の合計には確定したぶんも足しています。
      </div>
    </div>
  );

  /* ---- 銘柄ごとの内訳(その日の含み損益。中央の線から右が＋、左が−) ---- */
  const metric = (it) => (barBy === "pct" ? it.pct : it.pnl);
  const items = [...P.items].sort((a, b) => metric(b) - metric(a));
  // 物差しは「表示期間の全部の日・全部の銘柄でいちばん大きい値」に固定する(％でも金額でも同じ)。
  // ⚠ その日の最大に合わせると、いちばん大きい銘柄がどの日も右端に張り付き、日をまたいだ増減が見えなかった(オーナー指摘)
  // ⚠ 既定は％: 金額だと保有数の多い銘柄ほど長くなり、棒が「持っている量の差」を表してしまう(オーナーと相談して決定)
  let maxAbs = barBy === "pct" ? 0.01 : 1;
  pts.forEach((pt) => pt.items.forEach((it) => { const a = Math.abs(metric(it)); if (a > maxAbs) maxAbs = a; }));
  const shown = items.length > 12 ? [...items.slice(0, 6), null, ...items.slice(-5)] : items;
  const barChip = (k, label) => (
    <button key={k} onClick={() => { setBarBy(k); try { localStorage.setItem("kabu-asset-bar", k); } catch (e) { /* 表示だけ */ } }}
      style={{ ...chip(barBy === k, "#dfe4ff"), padding: "2px 9px", fontSize: 10.5 }}>{label}</button>
  );
  const breakdown = (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: "#8b93b8" }}>📋 {fullDate(P.date)} の銘柄ごとの含み損益（タップで詳細）</span>
        <span style={{ display: "flex", gap: 4, flexShrink: 0, alignItems: "center" }}>
          <span style={{ fontSize: 10, color: "#6b7394" }}>棒</span>{barChip("pct", "％")}{barChip("amt", "金額")}
        </span>
      </div>
      <div style={{ fontSize: 10, color: "#5b6284", marginTop: -3, marginBottom: 6 }}>
        棒の端＝この期間でいちばん大きかった{barBy === "pct" ? `含み損益率（${fmtPct(maxAbs)}）` : `含み損益（${fmtMoney(maxAbs, cc)}）`}。日を動かすと棒が伸び縮みします
        {barBy === "pct" ? "（％は保有数に左右されません。資産への効き方は金額で）" : ""}
      </div>
      <div style={{ display: "grid", gap: 5 }}>
        {shown.map((it, k) => {
          if (!it) return <div key={"gap" + k} style={{ fontSize: 10.5, color: "#5b6284", textAlign: "center" }}>… ほか{items.length - 11}銘柄 …</div>;
          const s = H.stocks[it.id];
          const w = Math.min(50, (Math.abs(metric(it)) / maxAbs) * 50);
          return (
            <div key={it.id} onClick={() => onSelect && onSelect(it.id)}
              style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(60px,1fr) 104px", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 11.5 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
                <span style={{ width: 7, height: 7, borderRadius: 2, flexShrink: 0, background: (TYPES[s.type] || {}).color || "#8b93b8" }} />
                <span style={{ color: "#dfe4ff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</span>
              </span>
              <div style={{ position: "relative", height: 10 }}>
                <div style={{ position: "absolute", left: "50%", top: -2, bottom: -2, width: 1, background: "#3b4470" }} />
                <div style={{ position: "absolute", top: 0, bottom: 0, borderRadius: 3, background: it.pnl >= 0 ? PLUS : MINUS, opacity: 0.9,
                  left: it.pnl >= 0 ? "50%" : `${50 - w}%`, width: `${Math.max(w, 0.8)}%` }} />
              </div>
              <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: "#dfe4ff", whiteSpace: "nowrap", lineHeight: 1.15 }}>
                {/* 棒と同じものを上(大きく)に、もう片方を下(小さく)に */}
                {barBy === "pct"
                  ? <>{fmtPct(it.pct)}<br /><span style={{ color: "#6b7394", fontSize: 10 }}>{fmtMoney(it.pnl, cc, true)}</span></>
                  : <>{fmtMoney(it.pnl, cc, true)}<br /><span style={{ color: "#6b7394", fontSize: 10 }}>{fmtPct(it.pct)}</span></>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div style={box}>
      {header}
      <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
        {MODES.map((m) => <button key={m.key} onClick={() => setMode(m.key)} style={chip(mode === m.key, "#dfe4ff")}>{m.label}</button>)}
      </div>
      {readout}

      <div ref={boxRef} className="kzChartGlass" style={{ marginTop: 10, "--kzChartCol": GOLD }}>
        <svg ref={svgRef} width={W} height={HH} viewBox={`0 0 ${W} ${HH}`}
          style={{ display: "block", touchAction: "pan-y", maxWidth: "100%", cursor: "crosshair" }}
          onPointerDown={pick} onPointerMove={(e) => { if (e.pointerType === "mouse" || e.buttons) pick(e); }}>
          <defs>
            <linearGradient id={`${gid}-v`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={GOLD} stopOpacity="0.28" /><stop offset="100%" stopColor={GOLD} stopOpacity="0" />
            </linearGradient>
            {/* 投資額の線より上=含み益の側、下=含み損の側 */}
            <clipPath id={`${gid}-above`}><path d={`${path((p) => p.cost)}L${x(n - 1)},0L${x(0)},0Z`} /></clipPath>
            <clipPath id={`${gid}-below`}><path d={`${path((p) => p.cost)}L${x(n - 1)},${HH}L${x(0)},${HH}Z`} /></clipPath>
          </defs>
          {tk.ticks.map((v) => (
            <g key={v}>
              <line x1={PADL} x2={plotR} y1={y(v)} y2={y(v)} stroke="#fff" strokeOpacity={v === 0 && mode === "pnl" ? 0.3 : 0.07} />
              <text x={plotR + 6} y={y(v) + 4} fontSize="10.5" fill="#7c84a8">{fmtAxis(v, cc)}</text>
            </g>
          ))}
          {dateTicks.map((i, k) => (
            <text key={k} x={x(i)} y={AXIS} fontSize="10.5" fill="#7c84a8" textAnchor={k === 0 ? "start" : k === dateTicks.length - 1 ? "end" : "middle"}>{fmtDate(pts[i].date, long)}</text>
          ))}

          {mode === "value" && (
            <g>
              <path d={`${path((p) => p.value)}L${x(n - 1)},${PLOTB}L${x(0)},${PLOTB}Z`} fill={`url(#${gid}-v)`} />
              <path d={band((p) => p.value, (p) => p.cost)} fill={PLUS} fillOpacity="0.28" clipPath={`url(#${gid}-above)`} />
              <path d={band((p) => p.value, (p) => p.cost)} fill={MINUS} fillOpacity="0.32" clipPath={`url(#${gid}-below)`} />
              <path d={path((p) => p.cost)} fill="none" stroke={COST} strokeWidth="1.4" strokeDasharray="5 4" />
              <path d={path((p) => p.value)} fill="none" stroke={GOLD} strokeWidth="2.2" strokeLinejoin="round" />
            </g>
          )}
          {mode === "pnl" && (
            <g>
              <path d={band((p) => p.gain, () => 0)} fill={PLUS} fillOpacity="0.35" />
              <path d={band(() => 0, (p) => p.loss)} fill={MINUS} fillOpacity="0.38" />
              <path d={path((p) => p.gain)} fill="none" stroke={PLUS} strokeWidth="1.2" />
              <path d={path((p) => p.loss)} fill="none" stroke={MINUS} strokeWidth="1.2" />
              <path d={path((p) => p.pnl)} fill="none" stroke="#f2f4ff" strokeWidth="2.2" strokeLinejoin="round" />
            </g>
          )}
          {mode === "stack" && stackLayers.map((L) => (
            <path key={L.id} d={L.d} fill={L.color} fillOpacity={P.items.some((it) => it.id === L.id) ? 0.5 : 0.25} stroke={L.color} strokeOpacity="0.9" strokeWidth="0.8" />
          ))}

          {/* できごとの印(買った日・売った日) */}
          <line x1={PADL} x2={plotR} y1={LANE} y2={LANE} stroke="#fff" strokeOpacity="0.06" />
          {H.events.map((e, k) => (
            <g key={k} onPointerDown={(ev) => { ev.stopPropagation(); setIdx(e.index); }} style={{ cursor: "pointer" }}>
              <circle cx={x(e.index)} cy={LANE} r="7" fill="#0e1122" stroke={e.kind === "buy" ? GOLD : COST} strokeWidth="1.3" />
              <text x={x(e.index)} y={LANE + 3.5} fontSize="9" textAnchor="middle" fill={e.kind === "buy" ? GOLD : COST}>{e.kind === "buy" ? "買" : "売"}</text>
            </g>
          ))}

          {/* なぞっている日 */}
          <line x1={x(i0)} x2={x(i0)} y1={PADT - 4} y2={PLOTB} stroke="#dfe4ff" strokeOpacity={idx === null ? 0.18 : 0.55} strokeDasharray="3 3" />
          {mode === "value" && <><circle cx={x(i0)} cy={y(P.cost)} r="3.5" fill={COST} /><circle cx={x(i0)} cy={y(P.value)} r="5" fill="#fff" stroke={GOLD} strokeWidth="2" /></>}
          {mode === "pnl" && <><circle cx={x(i0)} cy={y(P.gain)} r="3.5" fill={PLUS} /><circle cx={x(i0)} cy={y(P.loss)} r="3.5" fill={MINUS} /><circle cx={x(i0)} cy={y(P.pnl)} r="5" fill="#fff" stroke="#0e1122" strokeWidth="2" /></>}
          {mode === "stack" && <circle cx={x(i0)} cy={y(P.value)} r="5" fill="#fff" stroke={GOLD} strokeWidth="2" />}
        </svg>
      </div>
      {/* 凡例 */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 10.5, color: "#8b93b8", marginTop: 6 }}>
        {mode === "value" && <><span><b style={{ color: GOLD }}>━</b> 時価</span><span><b style={{ color: COST }}>┅</b> 投資額</span><span><b style={{ color: PLUS }}>■</b> 投資額より上（含み益）</span><span><b style={{ color: MINUS }}>■</b> 投資額より下（含み損）</span></>}
        {mode === "pnl" && <><span><b style={{ color: PLUS }}>■</b> 含み益の合計</span><span><b style={{ color: MINUS }}>■</b> 含み損の合計</span><span><b style={{ color: "#f2f4ff" }}>━</b> 差し引き</span></>}
        {mode === "stack" && <span>色＝銘柄のタイプ。積み上げた高さが時価の合計</span>}
        {H.events.length > 0 && <span>買／売＝あなたが記録した購入・買い増し・売却（タップでその日へ）</span>}
      </div>

      {flowCard}
      {breakdown}

      <div style={{ fontSize: 10, color: "#5b6284", marginTop: 10, lineHeight: 1.7 }}>
        記録した保有情報（株数・平均取得単価・購入日・売却日・売買の記録）と過去の終値（遅延データ）からさかのぼって計算した<b>試算</b>です。買い増し・一部売却は、銘柄の「📒 売買の記録」に入れたぶんが反映されます（平均取得単価は移動平均）。
        {H.assumed.length > 0 && <> 購入日が未入力の銘柄（{H.assumed.join("・")}）は、表示期間のはじめから保有していたものとして計算しています。</>}
        {H.skipped.length > 0 && <> 株価を取得できなかった銘柄（{H.skipped.join("・")}）は含まれていません。</>}
        {" "}為替換算はしていません。グラフは事実の推移で、良し悪しの判定や売買の推奨ではありません。
      </div>
    </div>
  );
}
