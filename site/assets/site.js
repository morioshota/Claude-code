/* =====================================================================
   GENBA TOOLS — 共通スクリプト（依存なし）
   - テーマ切替 / モバイルナビ / スクロール出現
   - ツール台帳（tools.js）からカード一覧・更新情報・フォーム選択肢を生成
   - 要望フォームの送信（config.js の設定に応じて送信先を切替）
   ===================================================================== */
(function () {
  'use strict';
  const CFG = window.SITE_CONFIG || {};
  const TOOLS = window.TOOLS || [];
  const CATS = window.TOOL_CATEGORIES || [];
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // site/ からの相対パスを、現在ページの階層に合わせて解決する（tools/ 配下からは ../ を足す）
  const ROOT = document.documentElement.getAttribute('data-root') || './';
  const rel = (p) => (p == null ? null : /^(https?:)?\/\//.test(p) ? p : ROOT + p);
  const STATUS_LABEL = { released: '公開中', beta: 'ベータ', wip: '開発中' };

  /* ---------- テーマ ---------- */
  const THEME_KEY = 'genba-theme';
  function applyTheme(t) {
    if (t === 'light') document.documentElement.setAttribute('data-theme', 'light');
    else document.documentElement.removeAttribute('data-theme');
    $$('.theme-toggle').forEach((b) => { b.textContent = t === 'light' ? '🌙' : '☀️'; b.setAttribute('aria-label', t === 'light' ? 'ダークテーマに切替' : 'ライトテーマに切替'); });
  }
  function initTheme() {
    let t = null;
    try { t = localStorage.getItem(THEME_KEY); } catch (e) { /* private mode 等 */ }
    if (!t) t = 'dark'; // 初期表示はダーク（製図のブループリント）。切替は保存され、次回から尊重される
    applyTheme(t);
    $$('.theme-toggle').forEach((b) => b.addEventListener('click', () => {
      const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      applyTheme(next);
      try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* noop */ }
    }));
  }

  /* ---------- ナビ ---------- */
  function initNav() {
    const t = $('.nav-toggle'), nav = $('.nav');
    if (!t || !nav) return;
    t.addEventListener('click', () => { const o = nav.classList.toggle('open'); t.setAttribute('aria-expanded', String(o)); });
    nav.addEventListener('click', (e) => { if (e.target.closest('a')) nav.classList.remove('open'); });
  }

  /* ---------- スクロール出現 ---------- */
  function initReveal() {
    const els = $$('.reveal');
    if (!els.length) return;
    if (!('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return; }
    const io = new IntersectionObserver((ents) => ents.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { rootMargin: '0px 0px -8% 0px', threshold: .08 });
    els.forEach((e) => io.observe(e));
  }

  /* ---------- 共通テキストの流し込み（サイト名・作成者など） ---------- */
  function fillConfig() {
    $$('[data-cfg]').forEach((el) => { const k = el.getAttribute('data-cfg'); if (CFG[k] != null) el.textContent = CFG[k]; });
    $$('[data-cfg-href]').forEach((el) => { const k = el.getAttribute('data-cfg-href'); if (CFG[k]) el.setAttribute('href', CFG[k]); else el.closest('li,p,div')?.remove(); });
    const y = $('[data-year]'); if (y) y.textContent = String(new Date().getFullYear());
    // 表題欄の「最終更新」は台帳の最新日付
    const latest = TOOLS.map((t) => t.updated).filter(Boolean).sort().pop();
    $$('[data-latest]').forEach((el) => { el.textContent = latest || '—'; });
    $$('[data-tool-count]').forEach((el) => { el.textContent = String(TOOLS.filter((t) => t.status === 'released').length); });
  }

  /* ---------- ツールカード ---------- */
  function toolCard(t) {
    const released = t.status === 'released' && t.url;
    const shot = t.shot
      ? `<img src="${esc(rel(t.shot))}" alt="${esc(t.name)} の画面" loading="lazy" decoding="async">`
      : `<div class="placeholder">COMING SOON</div>`;
    return `
      <article class="card tool-card reveal" style="--tool-accent:${esc(t.accent || '#f5b400')}" data-id="${esc(t.id)}" data-cat="${esc(t.category)}">
        <a class="shot" href="${esc(rel(t.lp))}" aria-label="${esc(t.name)} の紹介ページ">
          ${shot}
          <span class="badge no">${esc(t.no)}</span>
          <span class="stamp ${esc(t.status)}">${esc(STATUS_LABEL[t.status] || t.status)}</span>
        </a>
        <div class="body">
          <h3><a href="${esc(rel(t.lp))}">${esc(t.name)}</a><small>${esc(t.en || '')}</small></h3>
          <p class="tagline">${esc(t.tagline)}</p>
          <div class="tags">${(t.tags || []).slice(0, 4).map((x) => `<span class="chip">${esc(x)}</span>`).join('')}</div>
          <div class="meta"><span>${esc(t.version)}</span><span>更新 ${esc(t.updated)}</span><span>${esc(t.platform || '')}</span></div>
        </div>
        <div class="actions">
          ${released ? `<a class="btn primary sm" href="${esc(rel(t.url))}" target="_blank" rel="noopener">ツールを開く ↗</a>` : `<span class="btn sm" aria-disabled="true">準備中</span>`}
          <a class="btn sm ghost" href="${esc(rel(t.lp))}">詳しく見る →</a>
        </div>
        <span class="accent-bar" aria-hidden="true"></span>
      </article>`;
  }
  function initCatalog() {
    const grid = $('#tool-grid'); if (!grid) return;
    const chips = $('#cat-chips'), search = $('#tool-search'), count = $('#tool-count'), empty = $('#tool-empty');
    let cat = 'all', q = '';
    if (chips) chips.innerHTML = CATS.map((c) => `<button type="button" class="chip${c.id === 'all' ? ' on' : ''}" data-cat="${esc(c.id)}">${esc(c.label)}</button>`).join('');
    function render() {
      const list = TOOLS.filter((t) => (cat === 'all' || t.category === cat) && (!q || [t.name, t.en, t.tagline, t.summary, ...(t.tags || [])].join(' ').toLowerCase().includes(q)));
      grid.innerHTML = list.map(toolCard).join('');
      if (count) count.textContent = `${list.length} / ${TOOLS.length} 件`;
      if (empty) empty.hidden = list.length > 0;
      initReveal();
    }
    chips?.addEventListener('click', (e) => { const b = e.target.closest('[data-cat]'); if (!b) return; cat = b.dataset.cat; $$('.chip', chips).forEach((c) => c.classList.toggle('on', c === b)); render(); });
    search?.addEventListener('input', () => { q = search.value.trim().toLowerCase(); render(); });
    render();
  }

  /* ---------- 更新情報 ---------- */
  function initTimeline() {
    const ul = $('#timeline'); if (!ul) return;
    const items = [];
    TOOLS.forEach((t) => (t.changelog || []).forEach((c) => items.push({ ...c, tool: t })));
    items.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const limit = Number(ul.getAttribute('data-limit') || 8);
    ul.innerHTML = items.slice(0, limit).map((c) => `
      <li class="reveal">
        <div class="date">${esc(c.date)}</div>
        <div class="what"><a href="${esc(rel(c.tool.lp))}">${esc(c.tool.name)}</a><span class="ver">${esc(c.v)}</span></div>
        <div class="muted small">${esc(c.text)}</div>
      </li>`).join('');
  }

  /* ---------- LP: 台帳から自動で埋める箇所（版・更新日・履歴） ---------- */
  function initToolPage() {
    const id = document.documentElement.getAttribute('data-tool'); if (!id) return;
    const t = TOOLS.find((x) => x.id === id); if (!t) return;
    $$('[data-tool-field]').forEach((el) => { const k = el.getAttribute('data-tool-field'); if (t[k] != null) el.textContent = t[k]; });
    $$('[data-tool-open]').forEach((el) => { if (t.url) el.setAttribute('href', rel(t.url)); else { el.setAttribute('aria-disabled', 'true'); el.textContent = '準備中（公開までお待ちください）'; } });
    $$('[data-tool-guide]').forEach((el) => { if (t.guide) el.setAttribute('href', rel(t.guide)); else el.remove(); });
    $$('[data-tool-feedback]').forEach((el) => el.setAttribute('href', `${ROOT}feedback.html?tool=${encodeURIComponent(t.id)}`));
    const log = $('#tool-changelog');
    if (log) log.innerHTML = (t.changelog || []).map((c) => `<li><div class="date">${esc(c.date)}</div><div class="what">${esc(c.v)}</div><div class="muted small">${esc(c.text)}</div></li>`).join('');
  }

  /* ---------- 要望フォーム ---------- */
  function initFeedback() {
    const form = $('#feedback-form'); if (!form) return;
    const sel = $('#fb-tool');
    const params = new URLSearchParams(location.search);
    if (sel) {
      sel.innerHTML = TOOLS.map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('') +
        `<option value="new">新しいツールの提案</option><option value="site">このサイトについて</option><option value="other">その他</option>`;
      const pre = params.get('tool'); if (pre && $$('option', sel).some((o) => o.value === pre)) sel.value = pre;
    }
    const mode = $('#fb-mode');
    const hasEndpoint = !!CFG.feedbackEndpoint;
    if (mode) {
      mode.textContent = hasEndpoint ? '送信すると作成者にメールで届きます。' :
        (CFG.contactEmail ? '送信ボタンでメールアプリが開きます（内容は自動で本文に入ります）。' :
          '送信ボタンを押すと内容がまとまります。コピーして GitHub Issue で送るか、作成者に直接お渡しください。');
    }
    const gform = $('#fb-gform'); if (gform) { if (CFG.feedbackFormUrl) gform.href = CFG.feedbackFormUrl; else gform.remove(); }
    const result = $('#fb-result');
    const toolName = (v) => (TOOLS.find((t) => t.id === v)?.name) || ({ new: '新しいツールの提案', site: 'このサイトについて', other: 'その他' }[v] || v);

    function payload() {
      const fd = new FormData(form);
      return {
        tool: toolName(fd.get('tool')), toolId: fd.get('tool'), kind: fd.get('kind'),
        title: (fd.get('title') || '').toString().trim(), body: (fd.get('body') || '').toString().trim(),
        env: (fd.get('env') || '').toString().trim(), contact: (fd.get('contact') || '').toString().trim(),
        page: location.href, ua: navigator.userAgent,
      };
    }
    function asText(p) {
      return [`【ツール】${p.tool}`, `【種別】${p.kind}`, `【件名】${p.title}`, '', '【内容】', p.body, '', p.env ? `【環境】${p.env}` : '', p.contact ? `【連絡先】${p.contact}` : ''].filter((l) => l !== '').join('\n');
    }
    function issueUrl(p) {
      const u = new URL(CFG.repoUrl.replace(/\/$/, '') + '/issues/new');
      if (CFG.issueTemplate) u.searchParams.set('template', CFG.issueTemplate);
      u.searchParams.set('title', `[${p.tool}] ${p.title}`);
      u.searchParams.set('tool', p.tool); u.searchParams.set('kind', p.kind); u.searchParams.set('body', p.body);
      if (p.env) u.searchParams.set('env', p.env);
      return u.toString();
    }
    function show(kind, html) { result.className = `form-result show ${kind}`; result.innerHTML = html; result.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (form.querySelector('.honey input')?.value) return; // bot
      const p = payload();
      if (!p.title || !p.body) { show('err', '<b>件名と内容は必須です。</b>'); return; }
      const btn = $('#fb-submit'); btn.disabled = true; btn.textContent = '送信中…';
      try {
        if (hasEndpoint) {
          const res = await fetch(CFG.feedbackEndpoint, { method: 'POST', headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...p, _subject: `[要望] ${p.tool}: ${p.title}` }) });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          show('ok', `<b>送信しました。ありがとうございます。</b><p class="muted small" style="margin:8px 0 0">内容は作成者に届きました。連絡先を書いていただいた場合のみ、返信することがあります。</p>`);
          form.reset(); if (sel && params.get('tool')) sel.value = params.get('tool');
        } else if (CFG.contactEmail) {
          location.href = `mailto:${CFG.contactEmail}?subject=${encodeURIComponent(`[要望] ${p.tool}: ${p.title}`)}&body=${encodeURIComponent(asText(p))}`;
          show('ok', `<b>メールアプリを開きました。</b><p class="muted small" style="margin:8px 0 0">開かない場合は下の内容をコピーして <a href="mailto:${esc(CFG.contactEmail)}">${esc(CFG.contactEmail)}</a> へお送りください。</p><pre>${esc(asText(p))}</pre>`);
        } else {
          const txt = asText(p);
          show('ok', `<b>内容をまとめました。</b> 次のどちらかで作成者に届けてください。
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0">
              <a class="btn primary sm" href="${esc(issueUrl(p))}" target="_blank" rel="noopener">GitHub Issue として送る ↗</a>
              <button type="button" class="btn sm" id="fb-copy">内容をコピー</button>
            </div>
            <p class="muted small" style="margin:0 0 8px">GitHub のアカウントが無い場合は、コピーした内容をメールやチャットで作成者に直接お渡しください。</p>
            <pre id="fb-text">${esc(txt)}</pre>`);
          $('#fb-copy')?.addEventListener('click', async () => {
            try { await navigator.clipboard.writeText(txt); $('#fb-copy').textContent = 'コピーしました ✓'; } catch (err) { $('#fb-copy').textContent = '手動で選択してコピーしてください'; }
          });
        }
      } catch (err) {
        show('err', `<b>送信に失敗しました。</b> ${esc(err.message)}<p class="muted small" style="margin:8px 0 0">時間をおいて再度お試しください。急ぐ場合は下の内容をコピーして直接お送りください。</p><pre>${esc(asText(p))}</pre>`);
      } finally { btn.disabled = false; btn.textContent = '送信する'; }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initTheme(); initNav(); fillConfig(); initCatalog(); initTimeline(); initToolPage(); initFeedback(); initReveal();
  });
  // テーマは描画前に適用してちらつきを防ぐ
  try { const t = localStorage.getItem(THEME_KEY); if (t === 'light') document.documentElement.setAttribute('data-theme', 'light'); } catch (e) { /* noop */ }
})();
