/* カードのホロ演出ドライバ(ポケポケ風)

   図鑑カードを「スクロール位置 / 指の位置 / 端末の傾き」に反応させる。
   カードごとにイベントを張ると枚数ぶん重くなるので、
   ここで1つのrAFループにまとめ、各カードにはCSS変数だけを書き込む:
     --tx --ty … 傾き(deg)
     --gx --gy … 光沢(グレア)の中心
     --hp      … 虹の反射(ホロ)の位置

   ⚠ ジャイロはiOS 13+で明示的な許可が必要（しかもユーザー操作の中でしか求められない）。
     許可なしでも成立するよう、既定はスクロール連動で動く。 */

const TILT_KEY = "kabu-tilt";

const cards = new Set();
let raf = 0;
let gyro = { x: 0, y: 0 };
let gyroOn = false;
let pointer = null; // {el, x, y}
const listeners = new Set(); // 傾きON/OFFの購読(ボタンの見た目更新用)

const reduced = () =>
  typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const paint = () => {
  raf = 0;
  const vh = window.innerHeight || 1;
  cards.forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.bottom < -120 || r.top > vh + 120) return; // 画面外は触らない
    // 画面のどの高さにいるか(-1=上端 0=中央 1=下端)
    const p = clamp(((r.top + r.height / 2) / vh) * 2 - 1, -1, 1);

    let tx = -p * 5, ty = 0;
    let gx = 50, gy = 50 - p * 34;
    let hp = 50 + p * 130;

    if (gyroOn) {
      tx += gyro.x; ty += gyro.y;
      gx += gyro.y * 3.2; gy -= gyro.x * 3.2;
      hp += gyro.y * 9;
    }
    if (pointer && pointer.el === el) { // 指/カーソルが乗っているカードは追従を優先
      const px = clamp((pointer.x - r.left) / (r.width || 1), 0, 1);
      const py = clamp((pointer.y - r.top) / (r.height || 1), 0, 1);
      tx = (0.5 - py) * 17;
      ty = (px - 0.5) * 17;
      gx = px * 100; gy = py * 100;
      hp = 50 + (px - 0.5) * 220;
    }

    const st = el.style;
    st.setProperty("--tx", tx.toFixed(2) + "deg");
    st.setProperty("--ty", ty.toFixed(2) + "deg");
    st.setProperty("--gx", gx.toFixed(1) + "%");
    st.setProperty("--gy", gy.toFixed(1) + "%");
    st.setProperty("--hp", hp.toFixed(1) + "%");
  });
};

const kick = () => {
  if (raf || reduced() || typeof window === "undefined") return;
  raf = requestAnimationFrame(paint);
};

let wired = false;
const wire = () => {
  if (wired || typeof window === "undefined") return;
  wired = true;
  window.addEventListener("scroll", kick, { passive: true });
  window.addEventListener("resize", kick);
};

/* カードの登録。戻り値を呼ぶと解除される */
export const registerCard = (el) => {
  if (!el) return () => {};
  wire();
  cards.add(el);
  kick();
  return () => { cards.delete(el); };
};

export const setPointer = (el, x, y) => { pointer = { el, x, y }; kick(); };
export const clearPointer = (el) => {
  if (pointer && pointer.el === el) {
    pointer = null;
    // 指を離したら基準の姿勢へ戻す(CSSのtransitionでなめらかに戻る)
    el.style.setProperty("--tx", "0deg");
    el.style.setProperty("--ty", "0deg");
    kick();
  }
};

/* ---- ジャイロ(端末の傾き) ---- */

const onOrient = (e) => {
  // beta=前後(手に持つ角度の基準を45度とする) / gamma=左右
  const b = (typeof e.beta === "number" ? e.beta : 45) - 45;
  const g = typeof e.gamma === "number" ? e.gamma : 0;
  gyro.x = clamp(b * 0.34, -11, 11);
  gyro.y = clamp(g * 0.34, -11, 11);
  kick();
};

export const tiltNeedsPermission = () =>
  typeof window !== "undefined" &&
  typeof window.DeviceOrientationEvent !== "undefined" &&
  typeof window.DeviceOrientationEvent.requestPermission === "function";

export const tiltSupported = () =>
  typeof window !== "undefined" && "DeviceOrientationEvent" in window;

export const tiltOn = () => gyroOn;

const notify = () => listeners.forEach((fn) => fn(gyroOn));
export const onTiltChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

const save = (v) => { try { localStorage.setItem(TILT_KEY, v ? "1" : "0"); } catch (e) { /* 保存不可でも動く */ } };
export const tiltSaved = () => { try { return localStorage.getItem(TILT_KEY) === "1"; } catch (e) { return false; } };

/* 有効化。iOSでは必ずユーザー操作(タップ)の中から呼ぶこと */
export const enableTilt = async () => {
  if (!tiltSupported()) return false;
  if (tiltNeedsPermission()) {
    try {
      const res = await window.DeviceOrientationEvent.requestPermission();
      if (res !== "granted") return false;
    } catch (e) { return false; } // ユーザー操作の外から呼ばれた等
  }
  window.addEventListener("deviceorientation", onOrient);
  gyroOn = true; save(true); notify(); kick();
  return true;
};

export const disableTilt = () => {
  window.removeEventListener("deviceorientation", onOrient);
  gyroOn = false; gyro = { x: 0, y: 0 };
  save(false); notify(); kick();
};

/* 前回オンにしていた端末では、許可の要らない環境（Android等）だけ自動で復帰する。
   iOSは許可がユーザー操作必須なので、ボタンを押してもらう */
export const restoreTilt = () => {
  if (tiltSaved() && tiltSupported() && !tiltNeedsPermission()) enableTilt();
};
