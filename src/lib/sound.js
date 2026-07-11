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
};

export const sfx = (name) => {
  if (!soundEnabled()) return;
  const seq = SFX[name];
  if (!seq) return;
  try {
    const c = ac();
    if (!c) return;
    seq.forEach(([f, t, d, w]) => tone(c, f, t, d, w));
  } catch (e) { /* 音が出なくてもアプリは止めない */ }
};
