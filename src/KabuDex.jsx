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
import { DetailModal } from "./components/DetailModal.jsx";
import { DexCard } from "./components/DexCard.jsx";
import { RanchView } from "./components/Ranch.jsx";
import { StockForm } from "./components/StockForm.jsx";
import { PartyModal, BadgeModal, DataPortModal } from "./components/modals.jsx";
import { NoteEditor } from "./components/notes.jsx";
import { btnStyle, FilterChip, pageStyle } from "./components/ui.jsx";
import { STORAGE_KEY, noteKey, TYPES, STATUSES, ACHIEVEMENTS, SEED, BACKUP_FORMAT } from "./data/constants.js";
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
  const [evoFlash, setEvoFlash] = useState(null); // {name, stage}
  const [view, setView] = useState("dex"); // 'dex'|'ranch'

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

  /* ステージ跨ぎ検知つきの銘柄更新 */
  const persistWithEvoCheck = (next, id) => {
    const before = stocks.find((s) => s.id === id);
    const after = next.find((s) => s.id === id);
    if (before && after) {
      const s1 = stageOf(calcLevel(before)).no;
      const s2 = stageOf(calcLevel(after)).no;
      if (s2 > s1) {
        setEvoFlash({ name: after.name, stage: stageOf(calcLevel(after)) });
        setTimeout(() => setEvoFlash(null), 2600);
      }
    }
    persist(next);
  };

  const addStock = (f) => {
    const maxNo = stocks.reduce((m, s) => Math.max(m, s.no || 0), 0);
    const ns = { ...f, id: uid(), no: maxNo + 1, logs: f.logs || [], noteCount: 0, lastResearch: "" };
    persist([...stocks, ns]);
    setFormMode(null);
    setGetFlash(ns.name);
    setTimeout(() => setGetFlash(null), 2000);
  };

  const updateStock = (updated, openEdit) => {
    if (openEdit) { setFormMode("edit"); return; }
    persist(stocks.map((s) => (s.id === updated.id ? updated : s)));
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
    const next = stocks.map((s) => (s.id === stockId
      ? { ...s, noteCount: notes.length, lastResearch: touch ? today() : s.lastResearch }
      : s));
    persistWithEvoCheck(next, stockId);
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
    return { app: "kabu-dex", format: BACKUP_FORMAT, exportedAt: new Date().toISOString(), stocks, notes };
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
        @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
        ::placeholder { color: #4a5170; }
      `}</style>

      {/* ゲット演出 */}
      {getFlash && (
        <div style={{ position: "fixed", top: "40%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 100, background: "#0e1122", border: "2px solid #ffd166", borderRadius: 16, padding: "18px 28px", textAlign: "center", boxShadow: "0 0 40px rgba(255,209,102,.4)", animation: "kzPop 2s ease forwards", pointerEvents: "none" }}>
          <div style={{ fontSize: 34 }}>🎉</div>
          <div style={{ fontFamily: "'DotGothic16', monospace", color: "#ffd166", fontSize: 16, marginTop: 4 }}>{getFlash} を図鑑に登録した！</div>
        </div>
      )}

      {/* 進化演出 */}
      {evoFlash && (
        <div style={{ position: "fixed", top: "40%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 100, background: "#0e1122", borderRadius: 16, padding: 2, backgroundImage: "linear-gradient(#0e1122,#0e1122), linear-gradient(120deg,#f0abfc,#ffd166,#4ade80,#60a5fa,#f0abfc)", backgroundOrigin: "border-box", backgroundClip: "padding-box, border-box", border: "2px solid transparent", boxShadow: "0 0 50px rgba(240,171,252,.4)", animation: "kzPop 2.6s ease forwards", pointerEvents: "none" }}>
          <div style={{ padding: "18px 28px", textAlign: "center" }}>
            <div style={{ fontSize: 34 }}>✨</div>
            <div style={{ fontFamily: "'DotGothic16', monospace", color: "#f0abfc", fontSize: 16, marginTop: 4 }}>
              シンカ！ {evoFlash.name} は<br />STAGE {evoFlash.stage.no}「{evoFlash.stage.name}」になった！
            </div>
          </div>
        </div>
      )}

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

        {/* ビュー切り替え */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {[["dex", "📕 図鑑"], ["ranch", "🏞 ぼくじょう"]].map(([k, label]) => (
            <button key={k} onClick={() => setView(k)} style={{
              all: "unset", cursor: "pointer", padding: "8px 18px", borderRadius: 10,
              fontFamily: "'DotGothic16', monospace", fontSize: 13, letterSpacing: 1,
              border: `1.5px solid ${view === k ? "#ffd166" : "#252b48"}`,
              background: view === k ? "#ffd16618" : "transparent",
              color: view === k ? "#ffd166" : "#5b6284",
            }}>{label}</button>
          ))}
        </div>

        {view === "ranch" && <RanchView stocks={stocks} onSelect={openDetail} />}

        {view === "dex" && (<>
        {/* 操作列 */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
          <button onClick={() => { setSelectedId(null); setFormMode("add"); }} style={{ all: "unset", cursor: "pointer", background: "#ffd166", color: "#221a00", fontWeight: 800, fontSize: 13, borderRadius: 10, padding: "9px 16px", boxShadow: "0 0 14px rgba(255,209,102,.25)" }}>
            ＋ あたらしくゲット
          </button>
          <button onClick={() => setPanel("party")} style={{ ...btnStyle("#60a5fa"), padding: "8px 13px" }}>📊 パーティ分析</button>
          <button onClick={() => setPanel("badges")} style={{ ...btnStyle("#ffd166"), padding: "8px 13px" }}>🎖 実績 {unlockedCount}/{ACHIEVEMENTS.length}</button>
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
    </div>
  );
}
