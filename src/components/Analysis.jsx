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

function PriceChart({ stock, color }) {
  const [range, setRange] = useState("1y");
  const [data, setData] = useState(null);
  const [state, setState] = useState("loading"); // loading|ok|none
  const [hover, setHover] = useState(null);
  const svgRef = useRef(null);

  useEffect(() => {
    let alive = true;
    setState("loading");
    setHover(null);
    fetchChart(stock, range).then((d) => {
      if (!alive) return;
      setData(d);
      setState(d ? "ok" : "none");
    });
    return () => { alive = false; };
  }, [stock.id, stock.code, range]);

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

  const pts = data.points;
  const W = 600, H = 150, PADL = 46, PADR = 8, PADT = 10, PADB = 20;
  const vals = pts.map((p) => p[1]);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const span = hi - lo || 1;
  const x = (i) => PADL + (i / (pts.length - 1)) * (W - PADL - PADR);
  const y = (v) => PADT + (1 - (v - lo) / span) * (H - PADT - PADB);
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ");
  const area = `${line} L${x(pts.length - 1).toFixed(1)},${H - PADB} L${x(0).toFixed(1)},${H - PADB} Z`;
  const fmtAxis = (v) => (data.currency === "JPY"
    ? Math.round(v).toLocaleString("ja-JP")
    : v.toLocaleString("en-US", { maximumFractionDigits: 1 }));
  const fmtVal = (v) => (data.currency === "JPY" ? `${Math.round(v).toLocaleString("ja-JP")}円` : `$${v.toFixed(2)}`);
  const gridVals = [lo, lo + span / 2, hi];

  const onPointer = (e) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const rel = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((rel - PADL) / (W - PADL - PADR)) * (pts.length - 1));
    if (i >= 0 && i < pts.length) setHover(i);
  };

  const h = hover !== null ? pts[hover] : null;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
        <span style={{ fontFamily: "'DotGothic16', monospace", fontSize: 12, color: "#8b93b8", letterSpacing: 2 }}>
          株価推移
          {h && <span style={{ color: "#dfe4ff", marginLeft: 10, letterSpacing: 0 }}>{h[0]}　{fmtVal(h[1])}</span>}
        </span>
        {rangeBar}
      </div>
      <svg
        ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%" height={H}
        style={{ display: "block", touchAction: "pan-y" }}
        onPointerMove={onPointer} onPointerDown={onPointer} onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`kzChart-${stock.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {gridVals.map((v, k) => (
          <g key={k}>
            <line x1={PADL} y1={y(v)} x2={W - PADR} y2={y(v)} stroke="#262d4d" strokeWidth="1" strokeDasharray="3 4" />
            <text x={PADL - 6} y={y(v) + 3.5} textAnchor="end" fontSize="9.5" fill="#5b6284">{fmtAxis(v)}</text>
          </g>
        ))}
        <path d={area} fill={`url(#kzChart-${stock.id})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
        {h && (
          <g>
            <line x1={x(hover)} y1={PADT} x2={x(hover)} y2={H - PADB} stroke="#8b93b8" strokeWidth="1" />
            <circle cx={x(hover)} cy={y(h[1])} r="3" fill="#fff" stroke={color} strokeWidth="1.5" />
          </g>
        )}
        <text x={PADL} y={H - 6} fontSize="9.5" fill="#5b6284">{pts[0][0]}</text>
        <text x={W - PADR} y={H - 6} textAnchor="end" fontSize="9.5" fill="#5b6284">{pts[pts.length - 1][0]}</text>
      </svg>
      <div style={{ fontSize: 10, color: "#5b6284", marginTop: 2 }}>
        {data.source}・終値ベース。グラフは事実の推移で、値上がり/値下がりの判定はしていません
      </div>
    </div>
  );
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

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchFundamentals(stock).then((d) => {
      if (!alive) return;
      setAuto(d);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [stock.id, stock.code]);

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
        <PriceChart stock={stock} color={t.color} />
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

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all(actives.map((s) => fetchFundamentals(s).catch(() => null))).then((res) => {
      if (!alive) return;
      const m = {};
      actives.forEach((s, i) => { m[s.id] = res[i]; });
      setRows(m);
      setLoading(false);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actives.map((s) => s.id).join("|")]);

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
      <div style={{ fontSize: 11.5, color: "#8b93b8", marginBottom: 10, lineHeight: 1.7 }}>
        📊 登録銘柄の指標を並べて見比べます（見出しをタップで並べ替え）。
        {loading ? "　指標を取得中…" : ""}
        <br />
        <span style={{ fontSize: 10.5, color: "#5b6284" }}>
          並び順は数値の大小によるもので、銘柄の優劣やおすすめ順ではありません。取れない指標は「—」になります
        </span>
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
