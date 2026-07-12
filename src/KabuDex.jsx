/* ============================================================
   銘柄図鑑 — KABU DEX v2
   ・生態調査記録: kabu-researchの投資メモ全文を銘柄ごとに蓄積
   ・レベルで進化するカードビジュアル(ステージ1〜4)
   ・鮮度ゲージ / パーティ編成分析 / 実績バッジ / AI下書き
   保存: window.storage
     - 図鑑本体: kabu-zukan-v1 (既存データを引き継ぐ)
     - 調査記録: kabu-notes:{銘柄id} (銘柄ごとに独立保存)
   ============================================================ */

import { useState, useEffect } from "react";
import { storage } from "./lib/storage.js";
import { AiAssistant } from "./components/AiAssistant.jsx";
import { GraduationModal, AlbumView } from "./components/Album.jsx";
import { DetailModal } from "./components/DetailModal.jsx";
import { DexCard } from "./components/DexCard.jsx";
import { Heatmap } from "./components/Heatmap.jsx";
import { RanchView } from "./components/Ranch.jsx";
import { StockForm } from "./components/StockForm.jsx";
import { TriggerCheckModal, dueForCheck } from "./components/TriggerCheck.jsx";
import { FxLayer, EvoCeremony, ShinyCeremony, burstConfetti } from "./components/fx.jsx";
import { PartyModal, BadgeModal, DataPortModal } from "./components/modals.jsx";
import { NoteEditor } from "./components/notes.jsx";
import { btnStyle, FilterChip, pageStyle } from "./components/ui.jsx";
import { STORAGE_KEY, noteKey, TYPES, STATUSES, ACHIEVEMENTS, SEED, BACKUP_FORMAT } from "./data/constants.js";
import { evoPoolFor, rollEvoFx } from "./data/evolution.js";
import { loadActivity, recordActivity, seedActivity, ACTIVITY_KEY } from "./lib/activity.js";
import { sfx, soundEnabled, setSoundEnabled } from "./lib/sound.js";
import { calcLevel, stageOf, freshInfo, evalAchievements } from "./lib/stock.js";
import { today, uid } from "./lib/util.js";

export default function KabuDex() {
  const [stocks, setStocks] = useState(null);
  const [notesCache, setNotesCache] = useState({});
  const [notesLoading, setNotesLoading] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [formMode, setFormMode] = useState(null); // null|'add'|'edit'
  const [panel, setPanel] = useState(null); // null|'noteEditor'|'ai'|'party'|'badges'
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [saveState, setSaveState] = useState("");
  const [getFlash, setGetFlash] = useState(null);
  const [evoFlash, setEvoFlash] = useState(null); // {stock, stage, tier} 進化セレモニー
  const [shinyFlash, setShinyFlash] = useState(null); // 色違い当選セレモニー(進化と重なったら後で表示)
  const [view, setView] = useState("dex"); // 'dex'|'ranch'|'album'
  const [graduating, setGraduating] = useState(null); // 卒業式モーダル対象のstock
  const [activity, setActivity] = useState(null); // 草カレンダー用 {days, seeded}
  const [soundOn, setSoundOn] = useState(soundEnabled());
  const [checkNagDismissed, setCheckNagDismissed] = useState(() => {
    try { return localStorage.getItem("kabu-checknag") === today(); } catch (e) { return false; }
  });

  /* 読み込み(初回のみ。1回リトライ。失敗時は既存データを守るため上書きしない) */
  useEffect(() => {
    (async () => {
      let data = null;
      let readOk = false;
      for (let attempt = 0; attempt < 2 && !readOk; attempt++) {
        try {
          const res = await storage.get(STORAGE_KEY);
          if (res && res.value) data = JSON.parse(res.value);
          readOk = true; // 取得処理自体は成功(キー未作成で例外の場合はリトライへ)
        } catch (e) {
          await new Promise((r) => setTimeout(r, 400)); // 一時的な失敗に備えて再試行
        }
      }
      if (!data || !Array.isArray(data.stocks)) {
        data = { stocks: SEED.map((s, i) => ({ ...s, id: uid(), no: i + 1, noteCount: 0, lastResearch: "" })) };
        // 読み込みが2回とも例外だった場合は、既存データが生きている可能性があるため上書きしない
        if (readOk) {
          try { await storage.set(STORAGE_KEY, JSON.stringify(data)); } catch (e) { /* 後続保存で再試行 */ }
        } else {
          setSaveState("⚠ 保存データを読み込めませんでした（上書きは行っていません。開き直してみてください）");
          setTimeout(() => setSaveState(""), 6000);
        }
      }
      // v1→v2移行: 不足フィールドを補完(既存データは壊さない)
      const migrated = data.stocks.map((s) => ({
        noteCount: 0, lastResearch: "", triggers: [], logs: [], bullets: [], risks: [], ...s,
      }));
      setStocks(migrated);
      // 草カレンダー: 初回のみ既存のメモ・記録の日付から過去の活動を復元
      const act = await seedActivity(migrated, async (id) => {
        const res = await storage.get(noteKey(id));
        return res && res.value ? JSON.parse(res.value) : [];
      });
      setActivity(act);
    })();
  }, []);

  const persist = async (next) => {
    setStocks(next);
    try {
      setSaveState("保存中…");
      const ok = await storage.set(STORAGE_KEY, JSON.stringify({ stocks: next }));
      setSaveState(ok ? "✓ 保存済み" : "⚠ 保存に失敗");
    } catch (e) {
      setSaveState("⚠ 保存に失敗（再操作で再試行）");
    }
    setTimeout(() => setSaveState(""), 2000);
  };

  /* ステージ跨ぎ検知つきの銘柄更新。進化の瞬間に:
     1) 進化タイプをセクター別プールから抽選して永久保存(姿の決定論は保存で維持)
     2) 演出ガチャ(超レア5%/レア25%/通常70%)を抽選。最高レアは実績用に保存 */
  const persistWithEvoCheck = (next, id) => {
    const before = stocks.find((s) => s.id === id);
    let after = next.find((s) => s.id === id);
    if (before && after) {
      const s1 = stageOf(calcLevel(before)).no;
      const s2 = stageOf(calcLevel(after)).no;
      if (s2 > s1) {
        let evoPattern = after.evoPattern;
        if (!evoPattern) {
          const pool = evoPoolFor(after.type);
          evoPattern = pool[Math.floor(Math.random() * pool.length)];
        }
        const tier = rollEvoFx();
        const rank = { normal: 0, rare: 1, ultra: 2 };
        const evoFxBest = rank[tier] > (rank[after.evoFxBest] ?? -1) ? tier : after.evoFxBest;
        after = { ...after, evoPattern, evoFxBest };
        next = next.map((s) => (s.id === id ? after : s));
        setEvoFlash({ stock: after, stage: stageOf(calcLevel(after)), tier });
      }
    }
    persist(next);
  };

  const addStock = (f) => {
    const maxNo = stocks.reduce((m, s) => Math.max(m, s.no || 0), 0);
    const ns = { ...f, id: uid(), no: maxNo + 1, logs: f.logs || [], noteCount: 0, lastResearch: "" };
    persist([...stocks, ns]);
    setFormMode(null);
    setGetFlash({ icon: "🎉", text: `${ns.name} を図鑑に登録した！` });
    sfx("get");
    burstConfetti(30);
    recordActivity().then(setActivity);
    setTimeout(() => setGetFlash(null), 2000);
  };

  const updateStock = (updated, openEdit) => {
    if (openEdit) { setFormMode("edit"); return; }
    // リリース(→sold)は即保存せず卒業式モーダルへ(「学んだこと」を書いてから確定)
    const before = stocks.find((s) => s.id === updated.id);
    if (updated.status === "sold" && before && before.status !== "sold") {
      setGraduating(before);
      return;
    }
    persist(stocks.map((s) => (s.id === updated.id ? updated : s)));
  };

  /* 卒業式の確定: 学んだこと(lesson)と卒業日を保存してアルバム入り */
  const confirmGraduation = (lesson) => {
    const g = graduating;
    setGraduating(null);
    setSelectedId(null);
    persist(stocks.map((s) => (s.id === g.id ? { ...s, status: "sold", soldAt: today(), lesson } : s)));
    sfx("fanfare");
    burstConfetti(50);
    recordActivity().then(setActivity); // 振り返りも研究行動として草に記録
    setGetFlash({ icon: "🕊️", text: `${g.name} が卒業しました。おもいでは🎓アルバムに` });
    setTimeout(() => setGetFlash(null), 2600);
  };

  const saveLesson = (id, text) => {
    persist(stocks.map((s) => (s.id === id ? { ...s, lesson: text } : s)));
  };

  const saveEdit = (f) => {
    persist(stocks.map((s) => (s.id === selectedId ? { ...s, ...f, id: s.id, no: s.no, logs: s.logs, noteCount: s.noteCount, lastResearch: s.lastResearch } : s)));
    setFormMode(null);
  };

  const deleteStock = async (id) => {
    persist(stocks.filter((s) => s.id !== id));
    setSelectedId(null);
    try { await storage.delete(noteKey(id)); } catch (e) { /* 記録なしならOK */ }
    setNotesCache((c) => { const n = { ...c }; delete n[id]; return n; });
  };

  const addLogEntry = (id, text) => {
    const next = stocks.map((s) => (s.id === id ? { ...s, logs: [...s.logs, { date: today(), text }], lastResearch: today() } : s));
    persistWithEvoCheck(next, id);
    sfx("levelup");
    recordActivity().then(setActivity);
  };

  /* トリガー点検の回答: ✓無事は点検日のみ更新(鮮度は触らない=不変条件3)。
     ⚠崩れたかもはメモをクイック記録として残す(こちらは調査なので鮮度も更新) */
  const answerTriggerCheck = (id, result, text) => {
    let next = stocks.map((s) => (s.id === id ? { ...s, lastTriggerCheck: today() } : s));
    if (result === "warn" && text) {
      next = next.map((s) => (s.id === id ? { ...s, logs: [...s.logs, { date: today(), text }], lastResearch: today() } : s));
    }
    persistWithEvoCheck(next, id);
    recordActivity().then(setActivity);
  };

  /* ---- 生態調査記録の読み書き ---- */
  const loadNotes = async (stockId) => {
    if (notesCache[stockId]) return;
    setNotesLoading(true);
    let notes = [];
    try {
      const res = await storage.get(noteKey(stockId));
      if (res && res.value) notes = JSON.parse(res.value);
      if (!Array.isArray(notes)) notes = [];
    } catch (e) { notes = []; }
    setNotesCache((c) => ({ ...c, [stockId]: notes }));
    setNotesLoading(false);
  };

  const saveNotes = async (stockId, notes, touch) => {
    const prev = notesCache[stockId] || [];
    setNotesCache((c) => ({ ...c, [stockId]: notes }));
    try {
      await storage.set(noteKey(stockId), JSON.stringify(notes));
    } catch (e) {
      // 保存できなかったらキャッシュを巻き戻す(見た目と保存内容のズレを防ぐ)
      setNotesCache((c) => ({ ...c, [stockId]: prev }));
      setSaveState("⚠ 記録の保存に失敗しました。もう一度お試しください");
      setTimeout(() => setSaveState(""), 3000);
      return false;
    }
    // touch=true(記録の追加)のときだけ鮮度(最終調査日)を更新。削除では更新しない
    // 色違い抽選: 記録の追加ごとに5%。当選は永久保存(削除では抽選しない)
    let wonShiny = false;
    const next = stocks.map((s) => {
      if (s.id !== stockId) return s;
      let ns = { ...s, noteCount: notes.length, lastResearch: touch ? today() : s.lastResearch };
      if (touch && !s.shiny && Math.random() < 0.05) {
        ns = { ...ns, shiny: true, shinyAt: today() };
        wonShiny = true;
      }
      return ns;
    });
    persistWithEvoCheck(next, stockId);
    if (touch) {
      recordActivity().then(setActivity);
      if (wonShiny) setShinyFlash(next.find((s) => s.id === stockId));
    }
    return true;
  };

  const addNote = async (note) => {
    const cur = notesCache[selectedId] || [];
    const ok = await saveNotes(selectedId, [...cur, note], true);
    if (ok) setPanel(null); // 失敗時はエディタを開いたままにして入力を守る
    return ok;
  };

  const deleteNote = async (noteId) => {
    const cur = notesCache[selectedId] || [];
    await saveNotes(selectedId, cur.filter((n) => n.id !== noteId), false);
  };

  const saveAiDraft = async (text) => {
    const cur = notesCache[selectedId] || [];
    const ok = await saveNotes(selectedId, [...cur, { id: uid(), date: today(), title: "AI下書き（要検証）", body: text, diff: "", ai: true }], true);
    if (ok) setPanel(null);
    return ok;
  };

  /* ---- バックアップ(エクスポート/インポート) ---- */
  const exportAll = async () => {
    const notes = {};
    for (const s of stocks) {
      if (notesCache[s.id]) { notes[s.id] = notesCache[s.id]; continue; }
      try {
        const res = await storage.get(noteKey(s.id));
        if (res && res.value) {
          const arr = JSON.parse(res.value);
          if (Array.isArray(arr)) notes[s.id] = arr;
        }
      } catch (e) { /* 壊れた記録キーはアプリ本体でも読めないためスキップ */ }
    }
    const act = await loadActivity(); // 草カレンダーの活動履歴も含める(format 2)
    return { app: "kabu-dex", format: BACKUP_FORMAT, exportedAt: new Date().toISOString(), stocks, notes, activity: act };
  };

  /* 草カレンダーの取り込み: replaceは上書き、mergeは日ごとに大きい方を採用(二重加算を防ぐ) */
  const importActivity = async (data, mode) => {
    const src = data.activity && typeof data.activity.days === "object" ? data.activity : null;
    if (!src) return;
    const cur = await loadActivity();
    const days = mode === "replace" ? { ...src.days } : { ...cur.days };
    if (mode !== "replace") {
      for (const [d, n] of Object.entries(src.days)) days[d] = Math.max(days[d] || 0, n);
    }
    const merged = { days, seeded: true };
    try { await storage.set(ACTIVITY_KEY, JSON.stringify(merged)); } catch (e) { /* 草は派生データなので失敗しても本体に影響なし */ }
    setActivity(merged);
  };

  const importAll = async (data, mode) => {
    const srcNotes = data.notes && typeof data.notes === "object" ? data.notes : {};
    // 読み込み時のv1→v2移行と同じ補完(バックアップが古い形式でも壊さない)
    const normalize = (s) => ({ noteCount: 0, lastResearch: "", triggers: [], logs: [], bullets: [], risks: [], ...s });
    const valid = data.stocks.filter((s) => s && s.name && s.code != null);
    const countNotes = (m) => Object.values(m).reduce((a, n) => a + n.length, 0);

    if (mode === "replace") {
      // 内部IDは発行し直す: 記録は新キーに書き込み→最後に図鑑本体を書く順にすることで、
      // 途中で保存が失敗しても既存データが無傷で残る(旧記録キーの削除は成功後)
      const nextStocks = [];
      const nextNotes = {};
      valid.forEach((s, i) => {
        const id = uid();
        const notes = Array.isArray(srcNotes[s.id]) ? srcNotes[s.id] : [];
        nextStocks.push({ ...normalize(s), id, no: s.no || i + 1, noteCount: notes.length });
        nextNotes[id] = notes;
      });
      for (const [id, notes] of Object.entries(nextNotes)) {
        if (notes.length > 0) await storage.set(noteKey(id), JSON.stringify(notes));
      }
      await storage.set(STORAGE_KEY, JSON.stringify({ stocks: nextStocks }));
      for (const s of stocks) {
        try { await storage.delete(noteKey(s.id)); } catch (e) { /* 残っても実害なし */ }
      }
      setStocks(nextStocks);
      setNotesCache(nextNotes);
      setSelectedId(null);
      await importActivity(data, mode);
      return { stockCount: nextStocks.length, noteCount: countNotes(nextNotes), skipped: 0 };
    }

    // merge: 証券コードが未登録の銘柄だけ追加し、既存データには一切触らない
    const existing = new Set(stocks.map((s) => String(s.code).toUpperCase()));
    let maxNo = stocks.reduce((m, s) => Math.max(m, s.no || 0), 0);
    const added = [];
    const addedNotes = {};
    let skipped = 0;
    for (const s of valid) {
      const codeKey = String(s.code).toUpperCase();
      if (existing.has(codeKey)) { skipped++; continue; }
      existing.add(codeKey);
      const id = uid();
      const notes = Array.isArray(srcNotes[s.id]) ? srcNotes[s.id] : [];
      added.push({ ...normalize(s), id, no: ++maxNo, noteCount: notes.length });
      addedNotes[id] = notes;
    }
    for (const [id, notes] of Object.entries(addedNotes)) {
      if (notes.length > 0) await storage.set(noteKey(id), JSON.stringify(notes));
    }
    const next = [...stocks, ...added];
    await storage.set(STORAGE_KEY, JSON.stringify({ stocks: next }));
    setStocks(next);
    setNotesCache((c) => ({ ...c, ...addedNotes }));
    await importActivity(data, mode);
    return { stockCount: added.length, noteCount: countNotes(addedNotes), skipped };
  };

  const openDetail = (id) => { setSelectedId(id); loadNotes(id); };

  if (stocks === null) {
    return (
      <div style={{ ...pageStyle, display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <div style={{ fontFamily: "'DotGothic16', monospace", color: "#8b93b8", fontSize: 14 }}>図鑑を起動中…</div>
      </div>
    );
  }

  const selected = stocks.find((s) => s.id === selectedId) || null;
  const filtered = stocks.filter((s) =>
    (filterType === "all" || s.type === filterType) &&
    (filterStatus === "all" || s.status === filterStatus) &&
    (search === "" || s.name.includes(search) || String(s.code).toUpperCase().includes(search.toUpperCase()))
  );

  const due = dueForCheck(stocks);
  const holdCount = stocks.filter((s) => s.status === "hold").length;
  const watchCount = stocks.filter((s) => s.status === "watch").length;
  const totalLv = stocks.reduce((a, s) => a + calcLevel(s), 0);
  const trainerLv = 1 + Math.floor(totalLv / 5);
  const typesSeen = new Set(stocks.map((s) => s.type)).size;
  const unlockedCount = evalAchievements(stocks).size;
  const staleCount = stocks.filter((s) => { const f = freshInfo(s); return f && f.days !== null && f.days > 90; }).length;

  return (
    <div style={pageStyle}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DotGothic16&display=swap');
        @keyframes kzBounce { 0%{transform:scale(1)} 30%{transform:scale(1.35) rotate(-8deg)} 60%{transform:scale(.95)} 100%{transform:scale(1)} }
        @keyframes kzRise { 0%{opacity:0; transform:translate(-50%,10px)} 20%{opacity:1} 80%{opacity:1} 100%{opacity:0; transform:translate(-50%,-14px)} }
        @keyframes kzPop { 0%{opacity:0; transform:translate(-50%,-50%) scale(.6)} 40%{opacity:1; transform:translate(-50%,-50%) scale(1.08)} 70%{transform:translate(-50%,-50%) scale(1)} 100%{opacity:0; transform:translate(-50%,-50%) scale(1)} }
        @keyframes kzHolo { 0%{background-position:0% 50%} 100%{background-position:300% 50%} }
        @keyframes kzAura { 0%,100%{transform:scale(1)} 50%{transform:scale(1.07)} }
        @keyframes kzHop { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-7px)} }
        @keyframes kzShiny { 0%,100%{ filter: drop-shadow(0 0 3px #f0abfc) } 50%{ filter: drop-shadow(0 0 8px #ffffff) drop-shadow(0 0 14px #f0abfc) } }
        @keyframes kzSpin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes kzShake { 0%,100%{transform:translate(0,0)} 20%{transform:translate(-7px,3px)} 40%{transform:translate(6px,-4px)} 60%{transform:translate(-5px,-2px)} 80%{transform:translate(4px,3px)} }
        body.kz-shake { animation: kzShake .55s ease; }
        @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
        ::placeholder { color: #4a5170; }
      `}</style>

      {/* パーティクルの受け皿(紙吹雪・星・フラッシュ) */}
      <FxLayer />

      {/* ゲット・卒業などの汎用フラッシュ演出 */}
      {getFlash && (
        <div style={{ position: "fixed", top: "40%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 100, background: "#0e1122", border: "2px solid #ffd166", borderRadius: 16, padding: "18px 28px", textAlign: "center", boxShadow: "0 0 40px rgba(255,209,102,.4)", animation: "kzPop 2.4s ease forwards", pointerEvents: "none" }}>
          <div style={{ fontSize: 34 }}>{getFlash.icon}</div>
          <div style={{ fontFamily: "'DotGothic16', monospace", color: "#ffd166", fontSize: 16, marginTop: 4 }}>{getFlash.text}</div>
        </div>
      )}

      {/* 進化セレモニー(演出ガチャ) */}
      {evoFlash && <EvoCeremony evo={evoFlash} onDone={() => setEvoFlash(null)} />}
      {/* 色違いセレモニー(進化と重なった場合は進化のあとに表示) */}
      {shinyFlash && !evoFlash && <ShinyCeremony stock={shinyFlash} onDone={() => setShinyFlash(null)} />}

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "20px 14px 60px" }}>
        {/* ヘッダー */}
        <div style={{ background: "linear-gradient(135deg, #1a1040 0%, #0e1122 60%)", border: "2px solid #3b4470", borderRadius: 18, padding: "18px 18px 14px", marginBottom: 16, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: 12, right: 16, display: "flex", gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#f87171", boxShadow: "0 0 8px #f87171" }} />
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ffd166", boxShadow: "0 0 8px #ffd166" }} />
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 8px #4ade80" }} />
          </div>
          <div style={{ fontFamily: "'DotGothic16', monospace", fontSize: 24, color: "#f2f4ff", letterSpacing: 3 }}>
            📕 銘柄図鑑 <span style={{ color: "#ffd166" }}>KABU DEX</span>
          </div>
          <div style={{ fontSize: 12, color: "#8b93b8", marginTop: 2 }}>集めて、調べて、育てる。生態調査記録つき図鑑</div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 12 }}>
            {[
              ["トレーナーLv", trainerLv, "#ffd166"],
              ["登録", `${stocks.length}銘柄`, "#f2f4ff"],
              ["ホカク済み", `${holdCount}`, "#4ade80"],
              ["ウォッチ中", `${watchCount}`, "#60a5fa"],
              ["発見タイプ", `${typesSeen}/${Object.keys(TYPES).length}`, "#c084fc"],
            ].map(([k, v, c]) => (
              <div key={k} style={{ fontFamily: "'DotGothic16', monospace", fontSize: 12 }}>
                <span style={{ color: "#5b6284" }}>{k} </span>
                <span style={{ color: c, fontSize: 15 }}>{v}</span>
              </div>
            ))}
            {saveState && <span style={{ fontSize: 11, color: "#8b93b8", alignSelf: "center" }}>{saveState}</span>}
          </div>
          {staleCount > 0 && (
            <div style={{ marginTop: 10, fontSize: 11.5, color: "#fca5a5" }}>
              🥀 90日以上調査していない銘柄が{staleCount}件あります（記録が風化中）
            </div>
          )}
        </div>

        {/* 研究活動の草カレンダー */}
        {activity && <Heatmap activity={activity} />}

        {/* トリガー点検の案内(30日経過銘柄があるとき、1日1回) */}
        {due.length > 0 && !checkNagDismissed && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#2e230e", border: "1.5px solid #fbbf2466", borderRadius: 12, padding: "10px 14px", marginBottom: 12 }}>
            <span style={{ fontSize: 20 }}>🔔</span>
            <span style={{ flex: 1, fontSize: 12.5, color: "#fcd34d", lineHeight: 1.5 }}>
              点検の時間です！ 前提のチェックが30日以上あいた銘柄が<b>{due.length}件</b>あります
            </span>
            <button onClick={() => setPanel("check")} style={{ all: "unset", cursor: "pointer", background: "#fbbf24", color: "#221a00", fontWeight: 800, fontSize: 12, borderRadius: 8, padding: "7px 12px", whiteSpace: "nowrap" }}>点検する</button>
            <button onClick={() => {
              setCheckNagDismissed(true);
              try { localStorage.setItem("kabu-checknag", today()); } catch (e) { /* 保存できなくても今セッションは消える */ }
            }} style={{ all: "unset", cursor: "pointer", color: "#8b93b8", fontSize: 16, padding: 4 }}>✕</button>
          </div>
        )}

        {/* ビュー切り替え */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
          {[["dex", "📕 図鑑"], ["ranch", "🏞 ぼくじょう"], ["album", "🎓 アルバム"]].map(([k, label]) => (
            <button key={k} onClick={() => setView(k)} style={{
              all: "unset", cursor: "pointer", padding: "8px 18px", borderRadius: 10,
              fontFamily: "'DotGothic16', monospace", fontSize: 13, letterSpacing: 1,
              border: `1.5px solid ${view === k ? "#ffd166" : "#252b48"}`,
              background: view === k ? "#ffd16618" : "transparent",
              color: view === k ? "#ffd166" : "#5b6284",
            }}>{label}</button>
          ))}
          <button
            onClick={() => { const next = !soundOn; setSoundOn(next); setSoundEnabled(next); if (next) sfx("sparkle"); }}
            title={soundOn ? "効果音オン" : "効果音オフ"}
            style={{ all: "unset", cursor: "pointer", marginLeft: "auto", fontSize: 17, padding: "6px 10px", borderRadius: 10, border: "1.5px solid #252b48", opacity: soundOn ? 1 : 0.45 }}>
            {soundOn ? "🔊" : "🔇"}
          </button>
        </div>

        {view === "ranch" && <RanchView stocks={stocks} onSelect={openDetail} />}
        {view === "album" && <AlbumView stocks={stocks} onSelect={openDetail} onSaveLesson={saveLesson} />}

        {view === "dex" && (<>
        {/* 操作列 */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
          <button onClick={() => { setSelectedId(null); setFormMode("add"); }} style={{ all: "unset", cursor: "pointer", background: "#ffd166", color: "#221a00", fontWeight: 800, fontSize: 13, borderRadius: 10, padding: "9px 16px", boxShadow: "0 0 14px rgba(255,209,102,.25)" }}>
            ＋ あたらしくゲット
          </button>
          <button onClick={() => setPanel("party")} style={{ ...btnStyle("#60a5fa"), padding: "8px 13px" }}>📊 パーティ分析</button>
          <button onClick={() => setPanel("badges")} style={{ ...btnStyle("#ffd166"), padding: "8px 13px" }}>🎖 実績 {unlockedCount}/{ACHIEVEMENTS.length}</button>
          <button onClick={() => setPanel("check")} style={{ ...btnStyle("#fbbf24"), padding: "8px 13px" }}>
            🔔 点検{due.length > 0 && <span style={{ background: "#f87171", color: "#fff", borderRadius: 999, fontSize: 10, padding: "1px 6px", marginLeft: 4 }}>{due.length}</span>}
          </button>
          <button onClick={() => setPanel("data")} style={{ ...btnStyle("#4ade80"), padding: "8px 13px" }}>💾 バックアップ</button>
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 名前・コードで検索"
            style={{ flex: 1, minWidth: 150, background: "#12152a", border: "1px solid #2a3050", borderRadius: 10, color: "#eef1ff", padding: "9px 12px", fontSize: 13, outline: "none" }}
          />
        </div>

        {/* フィルタ */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
          <FilterChip active={filterStatus === "all"} onClick={() => setFilterStatus("all")} color="#8b93b8">すべて</FilterChip>
          {Object.entries(STATUSES).map(([k, s]) => (
            <FilterChip key={k} active={filterStatus === k} onClick={() => setFilterStatus(filterStatus === k ? "all" : k)} color={s.color}>{s.icon} {s.label}</FilterChip>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
          <FilterChip active={filterType === "all"} onClick={() => setFilterType("all")} color="#8b93b8">全タイプ</FilterChip>
          {Object.entries(TYPES).map(([k, t]) => (
            <FilterChip key={k} active={filterType === k} onClick={() => setFilterType(filterType === k ? "all" : k)} color={t.color}>{t.icon} {t.label}</FilterChip>
          ))}
        </div>

        {/* 図鑑グリッド */}
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "50px 20px", color: "#5b6284", border: "2px dashed #2a3050", borderRadius: 16, fontSize: 13 }}>
            <div style={{ fontSize: 34, marginBottom: 8 }}>🌿</div>
            条件に合う銘柄がいません。<br />「＋あたらしくゲット」でリサーチ済みの銘柄を登録しよう
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))" }}>
            {filtered.map((s) => (
              <DexCard key={s.id} stock={s} onClick={() => openDetail(s.id)} />
            ))}
          </div>
        )}
        </>)}

        <div style={{ textAlign: "center", fontSize: 10.5, color: "#3f4666", marginTop: 30, lineHeight: 1.8 }}>
          データと調査記録はこのアカウント専用に保存され、次回も引き継がれます（テキストのみ・画像不可）。<br />
          Lv・CP・レアリティ・鮮度は研究の蓄積を表す遊びの指標で、売買推奨ではありません。AI下書きの数値は必ず検証してください。
        </div>
      </div>

      {/* モーダル群 */}
      {selected && formMode !== "edit" && panel !== "noteEditor" && panel !== "ai" && (
        <DetailModal
          stock={selected}
          notes={notesCache[selected.id] || []}
          notesLoading={notesLoading && !notesCache[selected.id]}
          onClose={() => setSelectedId(null)}
          onUpdate={updateStock}
          onDelete={deleteStock}
          onLog={addLogEntry}
          onOpenNoteEditor={() => setPanel("noteEditor")}
          onOpenAi={() => setPanel("ai")}
          onDeleteNote={deleteNote}
        />
      )}
      {formMode === "add" && <StockForm onSave={addStock} onCancel={() => setFormMode(null)} />}
      {formMode === "edit" && selected && <StockForm initial={selected} onSave={saveEdit} onCancel={() => setFormMode(null)} />}
      {panel === "noteEditor" && selected && (
        <NoteEditor stock={selected} hasPrev={(notesCache[selected.id] || []).length > 0} onSave={addNote} onCancel={() => setPanel(null)} />
      )}
      {panel === "ai" && selected && (
        <AiAssistant stock={selected} onSaveAsNote={saveAiDraft} onClose={() => setPanel(null)} />
      )}
      {panel === "party" && <PartyModal stocks={stocks} onClose={() => setPanel(null)} />}
      {panel === "badges" && <BadgeModal stocks={stocks} onClose={() => setPanel(null)} />}
      {panel === "data" && <DataPortModal stocks={stocks} onExport={exportAll} onImport={importAll} onClose={() => setPanel(null)} />}
      {panel === "check" && <TriggerCheckModal due={due} onAnswer={answerTriggerCheck} onClose={() => setPanel(null)} />}
      {graduating && <GraduationModal stock={graduating} onConfirm={confirmGraduation} onCancel={() => setGraduating(null)} />}
    </div>
  );
}
