/* レトロゲーム風の効果音(Web Audioで自前生成・音声ファイル不要)
   すべてユーザー操作(クリック)起点で鳴らすためautoplay制限に抵触しない。
   ミュート設定は kabu-sound キーに永続化。 */

const KEY = "kabu-sound";
let ctx = null;

export const soundEnabled = () => {
  try { return localStorage.getItem(KEY) !== "off"; } catch (e) { return true; }
};
export const setSoundEnabled = (on) => {
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch (e) { /* 保存できなくても動作は継続 */ }
};

const ac = () => {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
};

// 1音: 周波数f(Hz)をt秒後からd秒間、type波形で鳴らす
const tone = (c, f, t, d, type = "square", vol = 0.12) => {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, c.currentTime + t);
  g.gain.setValueAtTime(vol, c.currentTime + t);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + t + d);
  o.connect(g).connect(c.destination);
  o.start(c.currentTime + t);
  o.stop(c.currentTime + t + d + 0.02);
};

// 音の定義: [周波数, 開始秒, 長さ秒, 波形?]の列
const SFX = {
  get:      [[523, 0, .08], [659, .08, .08], [784, .16, .15]],                                  // ゲット
  levelup:  [[440, 0, .07], [554, .07, .07], [659, .14, .12]],                                   // メモ+1Lv
  evo:      [[392, 0, .1], [523, .1, .1], [659, .2, .1], [784, .3, .25]],                        // 進化(通常)
  evoRare:  [[392, 0, .08], [523, .08, .08], [659, .16, .08], [784, .24, .08], [1047, .32, .3]], // 進化(レア)
  evoUltra: [[262, 0, .1], [330, .1, .1], [392, .2, .1], [523, .3, .1], [659, .4, .1], [784, .5, .1], [1047, .6, .45]], // 超レア
  shiny:    [[988, 0, .06, "triangle"], [1319, .07, .06, "triangle"], [1760, .14, .3, "triangle"]], // 色違い
  sparkle:  [[1568, 0, .05, "triangle"], [2093, .06, .12, "triangle"]],                          // キラッ
  ok:       [[659, 0, .06], [880, .07, .1]],                                                     // 点検✓
  warn:     [[330, 0, .09], [262, .1, .18]],                                                     // 点検⚠
  fanfare:  [[523, 0, .1], [523, .12, .1], [523, .24, .1], [659, .36, .12], [784, .5, .3]],      // 点検コンプ
  // 2026-11 追加(操作の手ざわり。どれも小さめの音)
  tap:      [[880, 0, .035, "triangle", .06]],                                                   // カードを開く
  tab:      [[660, 0, .03, "triangle", .05], [990, .035, .04, "triangle", .05]],                 // タブ切り替え
  flip:     [[440, 0, .04, "triangle", .07], [330, .04, .04, "triangle", .06], [660, .09, .07, "triangle", .07]], // カードを裏返す
  close:    [[660, 0, .03, "triangle", .05], [440, .035, .05, "triangle", .05]],                 // とじる
  charge:   [[196, 0, .12, "sawtooth", .05], [233, .12, .12, "sawtooth", .06], [277, .24, .12, "sawtooth", .07], [330, .36, .12, "sawtooth", .08], [392, .48, .14, "sawtooth", .09]], // 進化のため
  dexFound: [[784, 0, .06, "triangle"], [988, .07, .06, "triangle"], [1319, .14, .16, "triangle"]], // 新しい種族と出会った
};

export const sfx = (name) => {
  if (!soundEnabled()) return;
  const seq = SFX[name];
  if (!seq) return;
  try {
    const c = ac();
    if (!c) return;
    seq.forEach(([f, t, d, w, v]) => tone(c, f, t, d, w, v));
  } catch (e) { /* 音が出なくてもアプリは止めない */ }
};

/* ---- 牧場の環境音(2026-11) ----
   音声ファイルは使わず、その場で作る: 昼=小鳥のさえずり / 夜=虫の声 / 雨=さあさあという雨音。
   時間帯と天気(牧場の演出と同じ=実時間と日付)だけで決まる。株価は関係しない(不変条件5)。
   牧場タブを開いたとき(タブを押す=ユーザー操作)に始め、離れたら止める。🔊がオフなら鳴らさない */
let amb = null; // { stop() }
const chirp = (c, out, f0, f1, t, d, vol) => {
  const o = c.createOscillator(), g = c.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(f0, c.currentTime + t);
  o.frequency.exponentialRampToValueAtTime(f1, c.currentTime + t + d);
  g.gain.setValueAtTime(0.0001, c.currentTime + t);
  g.gain.exponentialRampToValueAtTime(vol, c.currentTime + t + d * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + t + d);
  o.connect(g).connect(out);
  o.start(c.currentTime + t); o.stop(c.currentTime + t + d + 0.02);
};
export const stopAmbience = () => { if (amb) { try { amb.stop(); } catch (e) { /* 無視 */ } amb = null; } };
export const startAmbience = ({ night = false, rain = false } = {}) => {
  stopAmbience();
  if (!soundEnabled()) return;
  try {
    const c = ac();
    if (!c) return;
    const master = c.createGain();
    master.gain.value = 0.0001;
    master.gain.exponentialRampToValueAtTime(1, c.currentTime + 1.2); // ふわっと入る
    master.connect(c.destination);
    const timers = [];
    let noise = null;
    if (rain) { // 雨: 白色雑音を高めの帯域だけ通す
      const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      noise = c.createBufferSource(); noise.buffer = buf; noise.loop = true;
      const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2600; bp.Q.value = 0.5;
      const g = c.createGain(); g.gain.value = 0.035;
      noise.connect(bp).connect(g).connect(master); noise.start();
    }
    const loop = (fn, min, max) => { const tick = () => { fn(); timers.push(setTimeout(tick, min + Math.random() * (max - min))); }; timers.push(setTimeout(tick, 600 + Math.random() * 1500)); };
    if (night) { // 虫の声: 高い音を細かく刻む
      loop(() => { const f = 4200 + Math.random() * 500; for (let i = 0; i < 6; i++) chirp(c, master, f, f * 1.02, i * 0.07, 0.045, 0.012); }, 1400, 3200);
    } else if (!rain) { // 小鳥: 上がる・下がる短いさえずりを2〜4回
      loop(() => { const base = 2200 + Math.random() * 1400, n = 2 + Math.floor(Math.random() * 3); for (let i = 0; i < n; i++) chirp(c, master, base * (i % 2 ? 1.25 : 1), base * (i % 2 ? 1 : 1.3), i * 0.13, 0.09, 0.018); }, 2600, 6500);
    }
    amb = { stop: () => {
      timers.forEach(clearTimeout);
      try { master.gain.cancelScheduledValues(c.currentTime); master.gain.setValueAtTime(master.gain.value, c.currentTime); master.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.4); } catch (e) { /* 無視 */ }
      setTimeout(() => { try { if (noise) noise.stop(); master.disconnect(); } catch (e) { /* 無視 */ } }, 500);
    } };
  } catch (e) { /* 音が出なくてもアプリは止めない */ }
};
