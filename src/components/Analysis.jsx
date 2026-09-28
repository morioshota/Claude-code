/* 銘柄分析: 指標カード・株価チャート・市場の見方(第三者の評価)

   方針(CLAUDE.md): 表示するのは事実の数値のみ。
   - 「割安/割高」「買い時」等の判定・色分けは一切しない(数値の提示のみ)
   - チャートは単一色で描き、騰落の色分け・矢印は入れない
   - 目標株価とアナリスト評価は「第三者の意見」という事実として載せ、
     アプリからの推奨ではない旨を必ず併記する(2026-07オーナー承認) */

import { useState, useEffect, useRef } from "react";
import { Creature, TypeChip, btnStyle } from "./ui.jsx";
import { TYPES } from "../data/constants.js";
import {
  METRIC_GROUPS, METRIC_BY_KEY, ALL_METRIC_KEYS, RATING_LABEL, CHART_RANGES,
  fetchFundamentals, fetchChart, mergeMetrics, fmtMetric, inputHintOf, parseManual, toManualInput,
} from "../lib/fundamentals.js";

/* ---- 株価チャート(単一色の折れ線。騰落の色分けはしない) ---- */

function PriceChart({ stock, color, reload }) {
  const [range, setRange] = useState("1y");
  const [data, setData] = useState(null);
  const [state, setState] = useState("loading"); // loading|ok|none
  const [hover, setHover] = useState(null);
  const svgRef = useRef(null);
  const forcedRef = useRef(0); // 「更新」1回につき1度だけキャッシュを無視する
  const boxRef = useRef(null);
  const [boxW, setBoxW] = useState(340);

  // 表示幅に合わせて実寸で描く(縮小表示だと文字が潰れるため)
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setBoxW(Math.floor(el.clientWidth));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [state]);

  useEffect(() => {
    let alive = true;
    const force = reload > forcedRef.current;
    forcedRef.current = Math.max(forcedRef.current, reload);
    setState("loading");
    setHover(null);
    fetchChart(stock, range, { force }).then((d) => {
      if (!alive) return;
      setData(d);
      setState(d ? "ok" : "none");
    });
    return () => { alive = false; };
  }, [stock.id, stock.code, range, reload]);

  const rangeBar = (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {CHART_RANGES.map((r) => (
        <button key={r.key} onClick={() => setRange(r.key)} style={{
          all: "unset", cursor: "pointer", padding: "3px 10px", borderRadius: 7, fontSize: 11, fontWeight: 700,
          border: `1px solid ${range === r.key ? color : "#2a3050"}`,
          background: range === r.key ? `${color}1f` : "transparent",
          color: range === r.key ? color : "#6b7394",
        }}>{r.label}</button>
      ))}
    </div>
  );

  if (state !== "ok" || !data) {
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
          <span style={{ fontFamily: "'DotGothic16', monospace", fontSize: 12, color: "#8b93b8", letterSpacing: 2 }}>株価推移</span>
          {rangeBar}
        </div>
        <div style={{ height: 150, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#5b6284", border: "1px dashed #262d4d", borderRadius: 10 }}>
          {state === "loading" ? "読み込み中…" : "この銘柄の株価データは取得できませんでした"}
        </div>
      </div>
    );
  }

  /* ⚠ 以前は viewBox(600幅) を width:100% に縮めていたため、スマホでは文字が約5pxまで
     潰れて読めなかった。いまは実際の表示幅(ResizeObserver)で、そのままのピクセル寸法で描く */
  const pts = data.points;
  const W = Math.max(260, boxW), H = 210, PADL = 8, PADR = 58, PADT = 16, PADB = 26;
  const vals = pts.map((p) => p[1]);
  const lo0 = Math.min(...vals), hi0 = Math.max(...vals);
  const iLo = vals.indexOf(lo0), iHi = vals.indexOf(hi0);
  // 平均取得単価(保有時)。表示範囲の近くにあるときだけ範囲に含めて線を引く(遠いと線が潰れるため)
  const avg = stock.status === "hold" && Number(stock.avgPrice) > 0 ? Number(stock.avgPrice) : null;
  const span0 = hi0 - lo0 || hi0 * 0.02 || 1;
  const showAvg = avg !== null && avg > lo0 - span0 * 0.35 && avg < hi0 + span0 * 0.35;
  const lo1 = showAvg ? Math.min(lo0, avg) : lo0, hi1 = showAvg ? Math.max(hi0, avg) : hi0;
  const { ticks, lo, hi } = niceTicks(lo1, hi1, 4);
  const span = hi - lo || 1;
  const plotR = W - PADR, plotB = H - PADB;
  const x = (i) => PADL + (i / Math.max(1, pts.length - 1)) * (plotR - PADL);
  const y = (v) => PADT + (1 - (v - lo) / span) * (plotB - PADT);
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ");
  const area = `${line} L${x(pts.length - 1).toFixed(1)},${plotB} L${x(0).toFixed(1)},${plotB} Z`;
  const jpy = data.currency === "JPY";
  const fmtAxis = (v) => (jpy ? Math.round(v).toLocaleString("ja-JP") : v.toLocaleString("en-US", { maximumFractionDigits: v < 10 ? 2 : 1 }));
  const fmtVal = (v) => (jpy ? `${Math.round(v).toLocaleString("ja-JP")}円` : `$${v.toFixed(2)}`);
  const long = range === "3y" || range === "5y";
  const fmtDate = (d, full) => {
    const [yy, mm, dd] = String(d).split("-");
    if (full) return `${yy}/${Number(mm)}/${Number(dd)}`;
    return long ? `${yy}/${Number(mm)}` : `${Number(mm)}/${Number(dd)}`;
  };
  const dateTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * (pts.length - 1)));
  const last = pts[pts.length - 1];

  const onPointer = (e) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const rel = e.clientX - rect.left;
    const i = Math.round(((rel - PADL) / (plotR - PADL)) * (pts.length - 1));
    setHover(Math.max(0, Math.min(pts.length - 1, i)));
  };

  const h = hover !== null ? pts[hover] : null;
  const shown = h || last;
  // なぞっている点の吹き出し。端では内側へ寄せる
  const tipW = 118, hx = h ? x(hover) : 0;
  const tipX = Math.max(PADL, Math.min(plotR - tipW, hx - tipW / 2));
  const mono = "'DotGothic16', ui-monospace, monospace";
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
        <div>
          <div style={{ fontFamily: mono, fontSize: 11, color: "#8b93b8", letterSpacing: 2 }}>
            株価推移 <span style={{ letterSpacing: 0, color: "#5b6284" }}>{h ? fmtDate(h[0], true) : `${fmtDate(last[0], true)} 時点`}</span>
          </div>
          <div style={{ fontFamily: mono, fontSize: 22, color: "#f2f4ff", lineHeight: 1.2, fontVariantNumeric: "tabular-nums" }}>
            {fmtVal(shown[1])}
          </div>
        </div>
        {rangeBar}
      </div>
      <div ref={boxRef} className="kzChartGlass" style={{ "--kzChartCol": color }}>
        <svg
          ref={svgRef} width={W} height={H} viewBox={`0 0 ${W} ${H}`}
          style={{ display: "block", touchAction: "pan-y", maxWidth: "100%" }}
          onPointerMove={onPointer} onPointerDown={onPointer} onPointerLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id={`kzChart-${stock.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.34" />
              <stop offset="70%" stopColor={color} stopOpacity="0.06" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
            <filter id={`kzGlow-${stock.id}`} x="-5%" y="-20%" width="110%" height="140%">
              <feGaussianBlur stdDeviation="3" />
            </filter>
          </defs>
          {/* 横の目盛り(きりのいい値)。値は右側に出す */}
          {ticks.map((v) => (
            <g key={v}>
              <line x1={PADL} y1={y(v)} x2={plotR} y2={y(v)} stroke="#ffffff" strokeOpacity="0.07" strokeWidth="1" />
              {/* 最新値のラベルと重なる目盛りの数字は出さない */}
              {Math.abs(y(v) - y(last[1])) > 18 && (
                <text x={plotR + 8} y={y(v) + 4} fontSize="11" fill="#7c84a8" style={{ fontVariantNumeric: "tabular-nums" }}>{fmtAxis(v)}</text>
              )}
            </g>
          ))}
          {/* 縦の目盛り(日付) */}
          {dateTicks.map((i, k) => (
            <g key={k}>
              <line x1={x(i)} y1={PADT} x2={x(i)} y2={plotB} stroke="#ffffff" strokeOpacity="0.04" strokeWidth="1" />
              <text x={x(i)} y={H - 8} fontSize="11" fill="#7c84a8"
                textAnchor={k === 0 ? "start" : k === dateTicks.length - 1 ? "end" : "middle"}>{fmtDate(pts[i][0])}</text>
            </g>
          ))}
          {/* 平均取得単価(自分の記録=事実)。判定はせず、線と数値を置くだけ */}
          {showAvg && (
            <g>
              <line x1={PADL} y1={y(avg)} x2={plotR} y2={y(avg)} stroke="#c7cdec" strokeOpacity="0.55" strokeWidth="1" strokeDasharray="5 4" />
            </g>
          )}
          <path d={area} fill={`url(#kzChart-${stock.id})`} />
          {/* 線の下に同じ色のにじみを敷いて発光して見せる(単一色のまま) */}
          <path d={line} fill="none" stroke={color} strokeWidth="4" strokeOpacity="0.45" filter={`url(#kzGlow-${stock.id})`} />
          <path d={line} fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
          {/* 期間の最高値・最安値(事実)。色は同じで、上下の区別は位置だけ */}
          {[[iHi, hi0, "高"], [iLo, lo0, "安"]].map(([i, v, lb]) => (
            <g key={lb}>
              <circle cx={x(i)} cy={y(v)} r="3" fill="#0e1122" stroke="#dfe4ff" strokeWidth="1.3" />
              <text x={Math.max(PADL + 30, Math.min(plotR - 30, x(i)))} y={lb === "高" ? y(v) - 8 : y(v) + 16}
                textAnchor="middle" fontSize="10.5" fill="#dfe4ff"
                stroke="#0e1122" strokeWidth="3" strokeLinejoin="round" style={{ paintOrder: "stroke" }}>{lb} {fmtAxis(v)}</text>
            </g>
          ))}
          {/* 平均取得単価のラベルは線より手前に置く(折れ線が文字を横切って読めなくなるため) */}
          {showAvg && (
            <text x={PADL + 4} y={y(avg) - 5} fontSize="10.5" fill="#c7cdec"
              stroke="#0e1122" strokeWidth="3.5" strokeLinejoin="round" style={{ paintOrder: "stroke" }}>平均取得単価 {fmtAxis(avg)}</text>
          )}
          {/* 最新値: 右端のラベル */}
          <circle cx={x(pts.length - 1)} cy={y(last[1])} r="4" fill={color} />
          <circle cx={x(pts.length - 1)} cy={y(last[1])} r="8" fill={color} fillOpacity="0.22" className="kzChartPulse" />
          <rect x={plotR + 3} y={y(last[1]) - 10} width={PADR - 5} height="20" rx="5" fill={color} />
          <text x={plotR + 3 + (PADR - 5) / 2} y={y(last[1]) + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#0b0e1d">
            {fmtAxis(last[1])}
          </text>
          {h && (
            <g pointerEvents="none">
              <line x1={hx} y1={PADT} x2={hx} y2={plotB} stroke="#dfe4ff" strokeOpacity="0.5" strokeWidth="1" strokeDasharray="3 3" />
              <line x1={PADL} y1={y(h[1])} x2={plotR} y2={y(h[1])} stroke="#dfe4ff" strokeOpacity="0.25" strokeWidth="1" strokeDasharray="3 3" />
              <circle cx={hx} cy={y(h[1])} r="5" fill="#fff" stroke={color} strokeWidth="2" />
              <rect x={tipX} y={2} width={tipW} height="34" rx="8" fill="#0b0e1d" fillOpacity="0.9" stroke={color} strokeOpacity="0.6" />
              <text x={tipX + tipW / 2} y={15} textAnchor="middle" fontSize="10.5" fill="#8b93b8">{fmtDate(h[0], true)}</text>
              <text x={tipX + tipW / 2} y={30} textAnchor="middle" fontSize="12.5" fontWeight="700" fill="#f2f4ff">{fmtVal(h[1])}</text>
            </g>
          )}
        </svg>
      </div>
      <div style={{ fontSize: 10, color: "#5b6284", marginTop: 4, lineHeight: 1.6 }}>
        {data.source}・終値ベース。なぞると日付と終値が出ます。
        グラフは事実の推移で、値上がり/値下がりの判定はしていません
      </div>
    </div>
  );
}

/* きりのいい目盛り(例: 1,000 / 1,200 / 1,400…)。表示範囲も目盛りに合わせて少し広げる */
export function niceTicks(lo, hi, want = 4) {
  if (!(hi > lo)) { const d = Math.abs(hi) * 0.02 || 1; lo -= d; hi += d; }
  const raw = (hi - lo) / want;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || 10 * mag;
  const a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step;
  const ticks = [];
  for (let v = a; v <= b + step / 2; v += step) ticks.push(Number(v.toFixed(6)));
  return { ticks, lo: a, hi: b };
}

/* ---- 指標カード ---- */

function MetricCard({ metric, cell, currency, color }) {
  const text = cell ? fmtMetric(metric, cell.value, currency) : null;
  return (
    <div style={{
      background: "#10142a", border: "1px solid #262d4d", borderRadius: 10,
      padding: "9px 11px", borderLeft: `3px solid ${text ? color : "#2a3050"}`,
    }}>
      <div style={{ fontSize: 10, color: "#8b93b8", display: "flex", alignItems: "center", gap: 5 }}>
        {metric.label}
        {cell && cell.manual && <span style={{ fontSize: 8.5, color: "#fbbf24", border: "1px solid #fbbf2466", borderRadius: 4, padding: "0 3px" }}>手入力</span>}
      </div>
      <div style={{ fontFamily: "'DotGothic16', monospace", fontSize: text ? 19 : 14, color: text ? "#f2f4ff" : "#3f4666", lineHeight: 1.35, marginTop: 1 }}>
        {text || "—"}
      </div>
      <div style={{ fontSize: 9, color: "#5b6284" }}>{metric.sub}</div>
    </div>
  );
}

/* ---- 手入力フォーム(決算メモから自分で入れる) ---- */

function ManualEditor({ stock, currency, onSave, onClose }) {
  const [draft, setDraft] = useState(() => {
    const cur = stock.fundamentals || {};
    const o = {};
    ALL_METRIC_KEYS.forEach((k) => { o[k] = toManualInput(METRIC_BY_KEY[k], cur[k]); });
    return o;
  });
  const input = { width: "100%", boxSizing: "border-box", background: "#0b0e1d", border: "1px solid #2a3050", borderRadius: 7, color: "#eef1ff", padding: "6px 8px", fontSize: 12.5, outline: "none" };

  const save = () => {
    const out = {};
    ALL_METRIC_KEYS.forEach((k) => {
      const raw = String(draft[k] ?? "").trim();
      if (raw === "") return;
      const v = parseManual(METRIC_BY_KEY[k], raw);
      if (v !== null) out[k] = v;
    });
    onSave(stock.id, out);
    onClose();
  };

  return (
    <div style={{ background: "#141830", border: "1px solid #3b4470", borderRadius: 12, padding: 14, marginBottom: 12 }}>
      <div style={{ fontFamily: "'DotGothic16', monospace", fontSize: 12, color: "#fbbf24", letterSpacing: 2, marginBottom: 4 }}>
        ✏️ 指標を手入力
      </div>
      <div style={{ fontSize: 10.5, color: "#8b93b8", lineHeight: 1.6, marginBottom: 10 }}>
        決算短信やリサーチで調べた値を入れると、自動取得より優先して表示されます。
        空欄にすると自動取得の値に戻ります（%は「10.2」のように書いてください）
      </div>
      {METRIC_GROUPS.map((g) => (
        <div key={g.key} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10.5, color: "#6b7394", marginBottom: 5 }}>{g.icon} {g.label}</div>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}>
            {g.metrics.map((m) => (
              <div key={m.key}>
                <label style={{ fontSize: 10, color: "#8b93b8", display: "block", marginBottom: 2 }}>
                  {m.label} <span style={{ color: "#4a5170" }}>{inputHintOf(m)}</span>
                </label>
                <input
                  style={input} inputMode="decimal" value={draft[m.key]}
                  onChange={(e) => setDraft((p) => ({ ...p, [m.key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button onClick={save} style={{ all: "unset", cursor: "pointer", background: "#4ade80", color: "#052e16", fontWeight: 800, borderRadius: 9, padding: "8px 18px", fontSize: 12.5 }}>保存する</button>
        <button onClick={onClose} style={{ ...btnStyle("#8b93b8"), padding: "8px 14px", fontSize: 12 }}>やめる</button>
      </div>
    </div>
  );
}

/* ---- 分析パネル(銘柄詳細の「📊 分析」タブ) ---- */

export function AnalysisPanel({ stock, onSaveFundamentals }) {
  const t = TYPES[stock.type] || TYPES.metal;
  const [auto, setAuto] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [reload, setReload] = useState(0); // 🔄更新のたびに増やしてキャッシュを迂回する

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchFundamentals(stock, { force: reload > 0 }).then((d) => {
      if (!alive) return;
      setAuto(d);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [stock.id, stock.code, reload]);

  const currency = (auto && auto.currency) || (/^[0-9]/.test(String(stock.code)) ? "JPY" : "USD");
  const cells = mergeMetrics(auto, stock);
  const filled = ALL_METRIC_KEYS.filter((k) => cells[k]).length;
  const rating = auto && auto.analystRating ? RATING_LABEL[String(auto.analystRating).toLowerCase()] || auto.analystRating : null;
  const hasMarketView = auto && (Number.isFinite(auto.targetPrice) || rating);

  const section = { background: "#141830", border: "1px solid #262d4d", borderRadius: 12, padding: 14, marginBottom: 12 };
  const head = { fontFamily: "'DotGothic16', monospace", fontSize: 12, color: "#8b93b8", letterSpacing: 2, marginBottom: 10 };

  return (
    <div>
      {/* チャート */}
      <div style={section}>
        <PriceChart stock={stock} color={t.color} reload={reload} />
      </div>

      {/* 指標カード */}
      {METRIC_GROUPS.map((g) => (
        <div key={g.key} style={section}>
          <div style={{ ...head, marginBottom: 8 }}>{g.icon} {g.label}</div>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fill, minmax(112px, 1fr))" }}>
            {g.metrics.map((m) => (
              <MetricCard key={m.key} metric={m} cell={cells[m.key]} currency={currency} color={t.color} />
            ))}
          </div>
        </div>
      ))}

      {/* 市場の見方(第三者の評価)。アプリからの推奨ではないことを必ず明記する */}
      {hasMarketView && (
        <div style={{ ...section, border: "1px dashed #3b4470" }}>
          <div style={head}>👥 市場の見方（第三者の評価）</div>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            {Number.isFinite(auto.targetPrice) && (
              <div>
                <div style={{ fontSize: 10, color: "#8b93b8" }}>アナリスト目標株価（平均）</div>
                <div style={{ fontFamily: "'DotGothic16', monospace", fontSize: 19, color: "#c7cdec" }}>
                  {currency === "JPY" ? `${Math.round(auto.targetPrice).toLocaleString("ja-JP")}円` : `$${auto.targetPrice.toFixed(2)}`}
                </div>
              </div>
            )}
            {rating && (
              <div>
                <div style={{ fontSize: 10, color: "#8b93b8" }}>アナリスト評価</div>
                <div style={{ fontFamily: "'DotGothic16', monospace", fontSize: 19, color: "#c7cdec" }}>
                  {rating}
                  {Number.isFinite(auto.analystCount) && (
                    <span style={{ fontSize: 11, color: "#6b7394", marginLeft: 6 }}>（{auto.analystCount}人）</span>
                  )}
                </div>
              </div>
            )}
          </div>
          <div style={{ fontSize: 10, color: "#8b93b8", lineHeight: 1.7, marginTop: 10, background: "#0b0e1d", borderRadius: 8, padding: "8px 10px" }}>
            ⚠️ これは<b style={{ color: "#c7cdec" }}>証券アナリストなど第三者の意見</b>であり、この図鑑からの売買推奨ではありません。
            外れることもよくあります。あなた自身の仮説と「にげるタイミング」で判断してください。
          </div>
        </div>
      )}

      {/* 手入力 */}
      {editing ? (
        <ManualEditor stock={stock} currency={currency} onSave={onSaveFundamentals} onClose={() => setEditing(false)} />
      ) : (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <button onClick={() => setEditing(true)} style={{ ...btnStyle("#fbbf24"), padding: "7px 12px", fontSize: 12 }}>✏️ 指標を手入力</button>
          <button
            onClick={() => { if (!loading) setReload((n) => n + 1); }}
            title="キャッシュを無視して取り直します"
            style={{ ...btnStyle("#60a5fa"), padding: "7px 12px", fontSize: 12, opacity: loading ? 0.5 : 1 }}
          >
            {loading ? "🔄 更新中…" : "🔄 更新"}
          </button>
          <span style={{ fontSize: 10.5, color: "#5b6284" }}>
            {loading ? "指標を取得中…" : `${filled}/${ALL_METRIC_KEYS.length}項目を表示中${auto ? "" : "（自動取得なし・手入力のみ）"}`}
          </span>
        </div>
      )}

      <div style={{ fontSize: 10, color: "#3f4666", lineHeight: 1.8 }}>
        数値は{auto ? `${auto.source}および` : ""}あなたの手入力によるもので、遅延・誤差があります。
        このアプリは指標の良し悪しを判定しません（割安・割高の色分けもしていません）。投資判断はご自身の責任でお願いします。
      </div>
    </div>
  );
}

/* ---- 分析ビュー(全銘柄の見比べ表) ---- */

const COMPARE_KEYS = ["per", "pbr", "roe", "dividendYield", "equityRatio"];

export function AnalysisView({ stocks, onSelect }) {
  const actives = stocks.filter((s) => s.status !== "sold");
  const [rows, setRows] = useState({});
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState("no");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all(actives.map((s) => fetchFundamentals(s, { force: reload > 0 }).catch(() => null))).then((res) => {
      if (!alive) return;
      const m = {};
      actives.forEach((s, i) => { m[s.id] = res[i]; });
      setRows(m);
      setLoading(false);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actives.map((s) => s.id).join("|"), reload]);

  if (actives.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "50px 20px", color: "#5b6284", border: "2px dashed #2a3050", borderRadius: 16, fontSize: 13, lineHeight: 2 }}>
        <div style={{ fontSize: 34, marginBottom: 8 }}>📊</div>
        まだ銘柄がありません。図鑑で登録すると、ここで指標を見比べられます
      </div>
    );
  }

  const cellOf = (s, k) => {
    const merged = mergeMetrics(rows[s.id], s);
    return merged[k];
  };
  const sorted = [...actives].sort((a, b) => {
    if (sortKey === "no") return (a.no || 0) - (b.no || 0);
    const ca = cellOf(a, sortKey), cb = cellOf(b, sortKey);
    if (!ca && !cb) return 0;
    if (!ca) return 1;
    if (!cb) return -1;
    return cb.value - ca.value; // 大きい順(並べ替えは見比べのためで、良し悪しの評価ではない)
  });

  const th = { fontSize: 10.5, color: "#8b93b8", fontWeight: 700, padding: "6px 8px", whiteSpace: "nowrap", textAlign: "right", cursor: "pointer" };
  const td = { fontFamily: "'DotGothic16', monospace", fontSize: 13, color: "#dfe4ff", padding: "7px 8px", textAlign: "right", whiteSpace: "nowrap" };

  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200, fontSize: 11.5, color: "#8b93b8", lineHeight: 1.7 }}>
          📊 登録銘柄の指標を並べて見比べます（見出しをタップで並べ替え）。
          {loading ? "　指標を取得中…" : ""}
          <br />
          <span style={{ fontSize: 10.5, color: "#5b6284" }}>
            並び順は数値の大小によるもので、銘柄の優劣やおすすめ順ではありません。取れない指標は「—」になります
          </span>
        </div>
        <button
          onClick={() => { if (!loading) setReload((n) => n + 1); }}
          title="キャッシュを無視して全銘柄を取り直します"
          style={{ ...btnStyle("#60a5fa"), padding: "7px 12px", fontSize: 12, whiteSpace: "nowrap", opacity: loading ? 0.5 : 1 }}
        >
          {loading ? "🔄 更新中…" : "🔄 更新"}
        </button>
      </div>
      <div style={{ overflowX: "auto", border: "1px solid #262d4d", borderRadius: 12, background: "#10142a" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 520 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #262d4d" }}>
              <th style={{ ...th, textAlign: "left" }} onClick={() => setSortKey("no")}>銘柄</th>
              {COMPARE_KEYS.map((k) => (
                <th key={k} style={{ ...th, color: sortKey === k ? "#ffd166" : "#8b93b8" }} onClick={() => setSortKey(k)}>
                  {METRIC_BY_KEY[k].label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => {
              const auto = rows[s.id];
              const currency = (auto && auto.currency) || (/^[0-9]/.test(String(s.code)) ? "JPY" : "USD");
              return (
                <tr key={s.id} onClick={() => onSelect(s.id)} style={{ borderBottom: "1px solid #1b2138", cursor: "pointer" }}>
                  <td style={{ padding: "6px 8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Creature stock={s} size={26} shadow={false} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, color: "#f2f4ff", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 130 }}>
                          {s.shiny ? "✨" : ""}{s.name}
                        </div>
                        <div style={{ fontSize: 9.5, color: "#5b6284" }}>{s.code}</div>
                      </div>
                    </div>
                  </td>
                  {COMPARE_KEYS.map((k) => {
                    const cell = cellOf(s, k);
                    const txt = cell ? fmtMetric(METRIC_BY_KEY[k], cell.value, currency) : null;
                    return (
                      <td key={k} style={{ ...td, color: txt ? "#dfe4ff" : "#3f4666" }}>
                        {txt || "—"}
                        {cell && cell.manual && <span style={{ fontSize: 8, color: "#fbbf24", marginLeft: 3 }}>手</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 10, color: "#3f4666", marginTop: 10, lineHeight: 1.8 }}>
        指標はYahoo Financeの遅延データとあなたの手入力によるもので、誤差があります。
        このアプリは指標の良し悪しを判定しません。投資判断はご自身の責任でお願いします。
      </div>
    </div>
  );
}
