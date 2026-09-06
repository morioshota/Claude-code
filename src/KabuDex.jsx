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
import { AnalysisView } from "./components/Analysis.jsx";
import { DetailModal } from "./components/DetailModal.jsx";
import { DexCard } from "./components/DexCard.jsx";
import { Heatmap } from "./components/Heatmap.jsx";
import { RanchView } from "./components/Ranch.jsx";
import { StockForm } from "./components/StockForm.jsx";
import { TriggerCheckModal, dueForCheck } from "./components/TriggerCheck.jsx";
import { FxLayer, EvoCeremony, ShinyCeremony, burstConfetti } from "./components/fx.jsx";
import { PartyModal, BadgeModal, DataPortModal } from "./components/modals.jsx";
import { NoteEditor } from "./components/notes.jsx";
import { btnStyle, PressButton, FilterChip, pageStyle } from "./components/ui.jsx";
import { STORAGE_KEY, noteKey, TYPES, STATUSES, ACHIEVEMENTS, SEED, BACKUP_FORMAT } from "./data/constants.js";
import { evoPoolFor, rollEvoFx } from "./data/evolution.js";
import { loadActivity, recordActivity, seedActivity, ACTIVITY_KEY } from "./lib/activity.js";
import { sfx, soundEnabled, setSoundEnabled } from "./lib/sound.js";
import { enableTilt, disableTilt, restoreTilt, tiltOn, tiltSupported, onTiltChange } from "./lib/cardfx.js";
import { fetchHeldQuotes, stopLossStateOf, stopLossPctOf } from "./lib/holdings.js";
import { calcLevel, stageOf, freshInfo, evalAchievements } from "./lib/stock.js";
import { today, uid, daysSince } from "./lib/util.js";

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
  const [view, setView] = useState("dex"); // 'dex'|'ranch'|'analysis'|'album'
  const [graduating, setGraduating] = useState(null); // 卒業式モーダル対象のstock
  const [activity, setActivity] = useState(null); // 草カレンダー用 {days, seeded}
  const [soundOn, setSoundOn] = useState(soundEnabled());
  const [quotes, setQuotes] = useState({}); // 保有銘柄の参考株価(カード・警告・牧場で共有)
  const [tilt, setTilt] = useState(false); // カードを端末の傾きで動かすか(iOSは許可が必要)
  const [checkNagDismissed, setCheckNagDismissed] = useState(() => {
    try { return localStorage.getItem("kabu-checknag") === today(); } catch (e) { return false; }
  });
  // 最終バックアップ日(書き出し成功時に記録)。データ消失対策のリマインダー用
  const [lastBackup, setLastBackup] = useState(() => {
    try { return localStorage.getItem("kabu-lastbackup") || ""; } catch (e) { return ""; }
  });
  const [backupNagDismissed, setBackupNagDismissed] = useState(() => {
    try { return localStorage.getItem("kabu-backupnag") === today(); } catch (e) { return false; }
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

  /* カードの傾き演出: 前回オンなら復帰(iOSは許可が要るのでボタン待ち)。状態はボタン表示に反映 */
  useEffect(() => {
    restoreTilt();
    setTilt(tiltOn());
    return onTiltChange(setTilt);
  }, []);

  /* 保有情報のある銘柄の参考株価をまとめて取得。失敗しても本体には影響しない */
  const holdSig = (stocks || [])
    .map((s) => `${s.id}:${s.status}:${s.shares}:${s.avgPrice}:${s.stopLossPct}`)
    .join("|");
  useEffect(() => {
    if (!stocks) return;
    let alive = true;
    fetchHeldQuotes(stocks).then((m) => { if (alive) setQuotes(m); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdSig]);

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

  /* 分析タブの手入力指標。空オブジェクトならフィールドごと消して自動取得に戻す */
  const saveFundamentals = (id, values) => {
    persist(stocks.map((s) => {
      if (s.id !== id) return s;
      const ns = { ...s };
      if (values && Object.keys(values).length > 0) ns.fundamentals = values;
      else delete ns.fundamentals;
      return ns;
    }));
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

  /* 書き出しが完了したら最終バックアップ日を記録(リマインダーの起点) */
  const markBackupDone = () => {
    const d = today();
    setLastBackup(d);
    setBackupNagDismissed(true); // 今日はもう催促しない
    try { localStorage.setItem("kabu-lastbackup", d); } catch (e) { /* 保存不可でも本体は動く */ }
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

  // バックアップ催促: ユーザーが実際に研究した痕跡があり(初期シードだけの状態では出さない)、
  // かつ長期間バックアップしていない/未実施のとき
  const backupDays = lastBackup ? (daysSince(lastBackup) ?? 999) : null;
  const hasWorthSaving = stocks.some((s) =>
    (s.noteCount || 0) > 0 || (s.logs || []).length > 0 || s.lastResearch || s.shiny || s.status === "sold"
  );
  const backupStale = hasWorthSaving && (backupDays === null || backupDays >= 14);

  // にげるライン(損切りライン)の判定。オーナー自身が決めたルールへの到達を知らせるだけで、売買の指示はしない
  const stopLossMap = {};
  stocks.forEach((s) => { const st = stopLossStateOf(s, quotes[s.id]); if (st) stopLossMap[s.id] = st; });
  const overList = stocks.filter((s) => stopLossMap[s.id] === "over");
  const nearList = stocks.filter((s) => stopLossMap[s.id] === "near");

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
        @keyframes kzHazard { from{background-position:0 0} to{background-position:31px 31px} }

        /* ---- ポケポケ風のカード演出 ----
           傾き(--tx/--ty)とホロの位置(--hp)、光沢の中心(--gx/--gy)は lib/cardfx.js が書き込む。
           ⚠ kzCard3d に overflow/filter/opacity を付けると立体が潰れる(仕様上フラット化される) */
        .kzCard3d { transform-style: preserve-3d;
          transform: rotateX(var(--tx,0deg)) rotateY(var(--ty,0deg));
          transition: transform .28s cubic-bezier(.22,.68,.32,1); will-change: transform; }
        .kzCardFg { transform: translateZ(14px); }
        .kzCardHero { transform: translateZ(16px); }
        /* 虹の反射。スクロール・傾きで位置が動く */
        .kzHoloSheet { background: repeating-linear-gradient(112deg,
            #ff4d6d 0%, #ffb03a 9%, #ffe66d 18%, #4ade80 27%, #38bdf8 36%, #a78bfa 45%, #ff4d6d 54%);
          background-size: 320% 320%; background-position: var(--hp,50%) 50%;
          mix-blend-mode: color-dodge; filter: blur(3px);
          /* 本物の箔のように「光の当たっている所」だけ虹が出るようマスクする。
             全面に出すとカードの黒基調が飛んで別物になってしまう */
          -webkit-mask-image: radial-gradient(circle at var(--gx,50%) var(--gy,50%), #000 0%, rgba(0,0,0,.5) 34%, transparent 68%);
          mask-image: radial-gradient(circle at var(--gx,50%) var(--gy,50%), #000 0%, rgba(0,0,0,.5) 34%, transparent 68%); }
        /* 細かい干渉縞。ゆっくり流れて、止まっていてもカードが生きて見える */
        .kzHoloFine { background: repeating-linear-gradient(68deg,
            rgba(255,255,255,.10) 0 2px, rgba(255,255,255,0) 2px 7px);
          background-size: 220% 220%; mix-blend-mode: overlay; opacity: .32;
          animation: kzHoloDrift 9s linear infinite; }
        @keyframes kzHoloDrift { from{background-position:0% 0%} to{background-position:220% 220%} }
        /* 走査光。ステージ2から出す。出だしは銘柄ごとにずらす(DexCard側のanimationDelay) */
        .kzHoloBeam { background: linear-gradient(105deg,
            rgba(255,255,255,0) 40%, rgba(255,255,255,.42) 50%, rgba(255,255,255,0) 60%);
          background-size: 260% 100%; mix-blend-mode: overlay;
          animation: kzBeam 5.5s ease-in-out infinite; }
        @keyframes kzBeam { 0%{background-position:180% 0; opacity:0} 14%{opacity:.6} 55%{background-position:-60% 0; opacity:0} 100%{background-position:-60% 0; opacity:0} }
        /* 光沢。斜めの光の帯が --hp に沿って流れる(スクロール・指・傾きで動く)＋
           光の当たっている一点の照り返し(--gx/--gy)。ステージ2はこれだけで、虹は出ない */
        .kzGlare { background:
            linear-gradient(107deg, rgba(255,255,255,0) 30%, rgba(255,255,255,.14) 41%,
              rgba(255,255,255,.62) 50%, rgba(255,255,255,.14) 59%, rgba(255,255,255,0) 70%),
            radial-gradient(circle at var(--gx,50%) var(--gy,50%),
              rgba(255,255,255,.34) 0%, rgba(255,255,255,.08) 24%, rgba(255,255,255,0) 55%);
          background-size: 260% 100%, 100% 100%;
          background-position: var(--hp,50%) 0, 0 0;
          background-repeat: no-repeat;
          mix-blend-mode: overlay; transform: translateZ(24px); }

        /* ---- デンセツ(UR)だけの特別演出 ----
           5種のうち1つが証券コードから決まる(=見るたびに変わらない。不変条件1/6)。
           どれも「枠の中」で光るので、カードの外形や文字は邪魔しない */
        /* 角丸で切り抜くのはこの層の中だけ。⚠ 親の .kzCard3d には絶対に overflow を付けないこと */
        .kzUr { mix-blend-mode: screen; overflow: hidden; }
        /* ① きらめき: 光の粒が散ってまたたく。2組を別々の間隔で明滅させると
           「一斉に点滅」ではなく「あちこちが順にきらめく」ように見える */
        .kzUr-spangle, .kzUr-spangle::before {
          animation: kzUrSpangle 2.4s ease-in-out infinite; }
        .kzUr-spangle { background:
            radial-gradient(circle at 18% 22%, #fff 0 1.4px, rgba(255,255,255,.35) 2.6px, transparent 4.5px),
            radial-gradient(circle at 74% 15%, #ffe9b0 0 1.6px, rgba(255,233,176,.3) 3px, transparent 5px),
            radial-gradient(circle at 42% 57%, #fff 0 1.2px, rgba(255,255,255,.3) 2.4px, transparent 4px),
            radial-gradient(circle at 88% 64%, #cfe6ff 0 1.5px, rgba(207,230,255,.3) 2.8px, transparent 4.6px),
            radial-gradient(circle at 27% 86%, #fff 0 1.4px, rgba(255,255,255,.3) 2.6px, transparent 4.4px);
          background-repeat: no-repeat; }
        .kzUr-spangle::before { content:""; position:absolute; inset:0; animation-delay: 1.2s; background:
            radial-gradient(circle at 61% 36%, #ffe0a0 0 1.5px, rgba(255,224,160,.3) 2.8px, transparent 4.6px),
            radial-gradient(circle at 8% 61%, #fff 0 1.3px, rgba(255,255,255,.3) 2.5px, transparent 4.2px),
            radial-gradient(circle at 54% 91%, #dff0ff 0 1.4px, rgba(223,240,255,.3) 2.6px, transparent 4.4px),
            radial-gradient(circle at 92% 33%, #fff 0 1.2px, rgba(255,255,255,.3) 2.4px, transparent 4px),
            radial-gradient(circle at 34% 12%, #ffe9b0 0 1.3px, rgba(255,233,176,.3) 2.5px, transparent 4.2px);
          background-repeat: no-repeat; }
        @keyframes kzUrSpangle { 0%,100%{ opacity:.15 } 50%{ opacity:1 } }
        /* ② おき火: ふちから熱がにじんで、ゆっくり息をする。
           まん中は暗いままにしておく(全面を染めるとクリーチャーが見えなくなる) */
        .kzUr-ember { background:
            radial-gradient(130% 46% at 50% 104%, rgba(255,138,60,.7) 0%, rgba(255,80,40,.2) 42%, transparent 72%),
            radial-gradient(130% 34% at 50% -4%, rgba(255,190,90,.4) 0%, transparent 70%);
          animation: kzUrEmber 3.4s ease-in-out infinite; }
        @keyframes kzUrEmber { 0%,100%{ opacity:.42 } 50%{ opacity:1 } }
        /* ③ オーロラ: 色のもやが奥でゆっくり渦を巻く。
           回すのは ::before 側。層そのものを回すとカードの外へはみ出す */
        .kzUr-aurora::before { content:""; position:absolute; inset:-45%;
          background: conic-gradient(from 0deg,
            rgba(96,165,250,.6), rgba(167,139,250,.55), rgba(240,171,252,.5),
            rgba(45,212,191,.55), rgba(96,165,250,.6));
          filter: blur(14px); animation: kzUrAurora 15s linear infinite; }
        @keyframes kzUrAurora { from{ transform: rotate(0deg) } to{ transform: rotate(360deg) } }
        /* ④ 虹のふち: 縁だけを虹が一周する(枠だけを光らせるのは mask-composite) */
        .kzUr-prism::before { content:""; position:absolute; inset:0; border-radius:inherit; padding:3px;
          background: conic-gradient(from 0deg,
            #ff4d6d, #ffb03a, #ffe66d, #4ade80, #38bdf8, #a78bfa, #ff4d6d);
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor; mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          mask-composite: exclude; animation: kzUrPrism 4.5s linear infinite; }
        /* ⚠ にじみ(drop-shadow)もキーフレーム側に書くこと。
           静的な filter を別に置くとアニメの filter に上書きされて消える */
        @keyframes kzUrPrism {
          from{ filter: hue-rotate(0deg) drop-shadow(0 0 4px rgba(255,255,255,.45)) }
          to{ filter: hue-rotate(360deg) drop-shadow(0 0 4px rgba(255,255,255,.45)) } }
        /* ⑤ 光条: 細い光の筋が何本か斜めに流れる */
        .kzUr-rays { background: repeating-linear-gradient(58deg,
            rgba(255,255,255,0) 0 34px, rgba(255,255,255,.5) 34px 36px,
            rgba(255,255,255,0) 36px 52px, rgba(255,255,255,.28) 52px 53px, rgba(255,255,255,0) 53px 96px);
          background-size: 300% 100%; filter: blur(.6px);
          animation: kzUrRays 6s linear infinite; }
        @keyframes kzUrRays { from{ background-position: 140% 0; opacity:.25 } 45%{ opacity:.85 } to{ background-position: -60% 0; opacity:.25 } }
        /* ✦のまたたき(オーラ進化・色違い)。sprites.jsが返した座標に重ねる */
        .kzGlint, .kzGlintGlow { transform-origin: 0px 0px; animation-name: kzGlint;
          animation-iteration-count: infinite; animation-timing-function: ease-in-out; }
        .kzGlintGlow { opacity: .55; filter: blur(1.1px); animation-name: kzGlintGlow; }
        @keyframes kzGlint { 0%,100%{ transform: scale(.28) rotate(0deg); opacity:.35 } 50%{ transform: scale(1) rotate(45deg); opacity:1 } }
        @keyframes kzGlintGlow { 0%,100%{ transform: scale(.5) rotate(0deg); opacity:.18 } 50%{ transform: scale(1.55) rotate(45deg); opacity:.65 } }

        /* ---- 押し込めるボタン ----
           土台の影(kzBtnShadow)で浮かせ、押すと沈む。選択中(kzBtnOn)は沈んだ姿勢で固定し、
           内側に影を入れて「押し込まれている」と分かるようにする。
           ⚠ ブラウザ既定の見た目を消す all:unset は必ず【このCSS側】で行うこと。
             インラインstyleに all:unset を書くと、インラインのほうが強いので
             ここの box-shadow / transform / :active が全部消える(実際に踏んだ) */
        .kzBtn { all: unset; box-sizing: border-box; cursor: pointer; position: relative;
          display: inline-flex; align-items: center; justify-content: center; text-align: center;
          box-shadow: 0 3px 0 var(--kzBtnShadow, #00000066), 0 4px 8px rgba(0,0,0,.32);
          transform: translateY(0); transition: transform .09s ease, box-shadow .09s ease, background .15s ease; }
        .kzBtn:active { transform: translateY(3px); box-shadow: 0 0 0 var(--kzBtnShadow, #00000066), 0 1px 3px rgba(0,0,0,.3); }
        .kzBtnOn { transform: translateY(3px);
          box-shadow: 0 0 0 var(--kzBtnShadow, #00000066), inset 0 2px 7px rgba(0,0,0,.55), inset 0 -1px 0 rgba(255,255,255,.06); }
        .kzBtnOn:active { transform: translateY(3px); }
        .kzChip { box-shadow: 0 2px 0 var(--kzBtnShadow, #00000066); }
        .kzChip:active { transform: translateY(2px); box-shadow: 0 0 0 var(--kzBtnShadow, #00000066); }
        .kzChip.kzBtnOn { transform: translateY(2px); box-shadow: 0 0 0 var(--kzBtnShadow,#00000066), inset 0 2px 5px rgba(0,0,0,.5); }

        /* ---- 説明欄の枠を走る光(詳細画面) ----
           研究レベル由来のレアリティで強さが変わる。位置(--hp)はスクロール連動 */
        .kzSecFx { position: relative; }
        .kzSecFx::before { content:""; position:absolute; inset:-1px; border-radius:inherit; pointer-events:none;
          padding:1.5px; background: linear-gradient(100deg,
            transparent 38%, var(--kzSecCol,#8b93b8) 47%, #ffffff 50%, var(--kzSecCol,#8b93b8) 53%, transparent 62%);
          background-size: 300% 100%; background-position: var(--hp,50%) 0;
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor; mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          mask-composite: exclude; opacity: 0; }
        .kzSecFx2::before { opacity: .30; }
        .kzSecFx3::before { opacity: .48; }
        .kzSecFx4::before { opacity: .68; }
        .kzSecFx5::before { opacity: .90; filter: drop-shadow(0 0 5px var(--kzSecCol,#ffd166)); }
        /* ステージ5は内側にも淡い光をまとう */
        .kzSecFx5 { box-shadow: inset 0 0 22px rgba(255,209,102,.09); }
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
          <div style={{ marginTop: 8, fontSize: 10.5, color: backupStale ? "#fca5a5" : "#5b6284" }}>
            💾 最終バックアップ: {lastBackup ? `${backupDays === 0 ? "今日" : `${backupDays}日前`}（${lastBackup}）` : "まだ書き出していません"}
          </div>
        </div>

        {/* にげるライン超過の警告(常時表示。自分で決めたラインへの到達を知らせる) */}
        {overList.length > 0 && (
          <div style={{
            display: "flex", alignItems: "center", gap: 10, marginBottom: 12, borderRadius: 12,
            padding: "10px 14px", border: "2px solid #f87171", position: "relative", overflow: "hidden",
            background: "#2a1414",
          }}>
            <div style={{
              position: "absolute", inset: 0, pointerEvents: "none",
              background: "repeating-linear-gradient(45deg, rgba(251,146,60,.22) 0 11px, rgba(0,0,0,.30) 11px 22px)",
              backgroundSize: "31px 31px", animation: "kzHazard 1.6s linear infinite",
            }} />
            <span style={{ fontSize: 20, zIndex: 1 }}>🚨</span>
            <span style={{ flex: 1, fontSize: 12.5, color: "#fecaca", lineHeight: 1.6, zIndex: 1 }}>
              <b>にげるラインを超えた銘柄が{overList.length}件あります</b>
              <span style={{ display: "block", fontSize: 11, color: "#fca5a5" }}>
                {overList.map((s) => `${s.name}（${stopLossPctOf(s)}%）`).join("・")}
              </span>
              <span style={{ display: "block", fontSize: 10, color: "#b98a8a", marginTop: 2 }}>
                あなたが決めたラインです。株価は遅延データのため、実際の判断は必ずご自身で確認してください
              </span>
            </span>
          </div>
        )}
        {overList.length === 0 && nearList.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#2e230e", border: "1.5px solid #fbbf2466", borderRadius: 12, padding: "10px 14px", marginBottom: 12 }}>
            <span style={{ fontSize: 20 }}>⚠️</span>
            <span style={{ flex: 1, fontSize: 12.5, color: "#fcd34d", lineHeight: 1.6 }}>
              にげるラインが近い銘柄が<b>{nearList.length}件</b>あります（{nearList.map((s) => s.name).join("・")}）
            </span>
          </div>
        )}

        {/* バックアップ催促(データ消失対策。記録があり14日以上未バックアップ/未実施のとき・1日1回) */}
        {backupStale && !backupNagDismissed && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#2a1414", border: "1.5px solid #f8717166", borderRadius: 12, padding: "10px 14px", marginBottom: 12 }}>
            <span style={{ fontSize: 20 }}>💾</span>
            <span style={{ flex: 1, fontSize: 12.5, color: "#fca5a5", lineHeight: 1.6 }}>
              {lastBackup ? `前回のバックアップから${backupDays}日たっています。` : "まだ一度もバックアップしていません。"}
              端末の都合でデータが消えることがあります。<b>いま書き出しておくと安心です</b>
            </span>
            <button onClick={() => setPanel("data")} style={{ all: "unset", cursor: "pointer", background: "#f87171", color: "#2a0505", fontWeight: 800, fontSize: 12, borderRadius: 8, padding: "7px 12px", whiteSpace: "nowrap" }}>書き出す</button>
            <button onClick={() => {
              setBackupNagDismissed(true);
              try { localStorage.setItem("kabu-backupnag", today()); } catch (e) { /* 保存できなくても今セッションは消える */ }
            }} style={{ all: "unset", cursor: "pointer", color: "#8b93b8", fontSize: 16, padding: 4 }}>✕</button>
          </div>
        )}

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

        {/* ビュー切り替え(均等グリッド。スマホで高さが凸凹しないよう1行1段に固定) */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr) 44px 44px", gap: 7, marginBottom: 10 }}>
          {[["dex", "📕", "図鑑"], ["ranch", "🏞", "ぼくじょう"], ["analysis", "📊", "分析"], ["album", "🎓", "アルバム"]].map(([k, icon, label]) => (
            <PressButton key={k} color="#ffd166" active={view === k} onClick={() => setView(k)}
              style={{ flexDirection: "column", gap: 1, padding: "7px 2px", fontFamily: "'DotGothic16', monospace", fontSize: 11.5, letterSpacing: 0.5 }}>
              <span style={{ fontSize: 15, lineHeight: 1 }}>{icon}</span>
              <span>{label}</span>
            </PressButton>
          ))}
          <PressButton
            color="#c084fc" active={tilt} title={tilt ? "端末の傾きでカードが動きます" : "端末を傾けるとカードが動くようにする"}
            onClick={async () => { if (!tiltSupported()) return; if (tilt) disableTilt(); else { const ok = await enableTilt(); if (!ok) setTilt(false); } }}
            style={{ padding: "7px 0", fontSize: 16, opacity: tiltSupported() ? 1 : 0.35 }}>
            📱
          </PressButton>
          <PressButton
            color="#60a5fa" active={soundOn} title={soundOn ? "効果音オン" : "効果音オフ"}
            onClick={() => { const next = !soundOn; setSoundOn(next); setSoundEnabled(next); if (next) sfx("sparkle"); }}
            style={{ padding: "7px 0", fontSize: 16 }}>
            {soundOn ? "🔊" : "🔇"}
          </PressButton>
        </div>

        {view === "ranch" && <RanchView stocks={stocks} activity={activity} quotes={quotes} onSelect={openDetail} />}
        {view === "analysis" && <AnalysisView stocks={stocks} onSelect={openDetail} />}
        {view === "album" && <AlbumView stocks={stocks} onSelect={openDetail} onSaveLesson={saveLesson} />}

        {view === "dex" && (<>
        {/* 操作列。副ボタンは4つなので2列×2行にすると必ず埋まる
            (自動折り返しにすると3+1で最後の1つだけ半端に残り、凸凹して見えた) */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginBottom: 8 }}>
          <PressButton color="#ffd166" filled onClick={() => { setSelectedId(null); setFormMode("add"); }}
            style={{ gridColumn: "1 / -1", fontSize: 13.5, padding: "11px 12px" }}>
            ＋ あたらしくゲット
          </PressButton>
          <PressButton color="#60a5fa" onClick={() => setPanel("party")}>📊 パーティ分析</PressButton>
          <PressButton color="#ffd166" onClick={() => setPanel("badges")}>🎖 実績 {unlockedCount}/{ACHIEVEMENTS.length}</PressButton>
          <PressButton color="#fbbf24" onClick={() => setPanel("check")}>
            🔔 点検{due.length > 0 && <span style={{ background: "#f87171", color: "#fff", borderRadius: 999, fontSize: 10, padding: "1px 6px", marginLeft: 2 }}>{due.length}</span>}
          </PressButton>
          <PressButton color="#4ade80" onClick={() => setPanel("data")}>💾 バックアップ</PressButton>
        </div>
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 名前・コードで検索"
          style={{ width: "100%", boxSizing: "border-box", marginBottom: 12, background: "#12152a", border: "1px solid #2a3050", borderRadius: 11, color: "#eef1ff", padding: "10px 12px", fontSize: 13, outline: "none", boxShadow: "inset 0 2px 6px rgba(0,0,0,.45)" }}
        />

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
              <DexCard key={s.id} stock={s} onClick={() => openDetail(s.id)} stopLossState={stopLossMap[s.id]} />
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
          onSaveFundamentals={saveFundamentals}
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
      {panel === "data" && <DataPortModal stocks={stocks} onExport={exportAll} onImport={importAll} onBackupDone={markBackupDone} onClose={() => setPanel(null)} />}
      {panel === "check" && <TriggerCheckModal due={due} onAnswer={answerTriggerCheck} onClose={() => setPanel(null)} />}
      {graduating && <GraduationModal stock={graduating} onConfirm={confirmGraduation} onCancel={() => setGraduating(null)} />}
    </div>
  );
}
