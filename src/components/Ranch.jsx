/* 牧場モード: three.jsの3D牧場(WebGL不可なら2Dにフォールバック) */

import { useState, useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { Creature } from "./ui.jsx";
import { spriteCanvasFor } from "../lib/sprites.js";
import { calcLevel, stageOf, moveTierOf, evalAchievements } from "../lib/stock.js";
import { ACHIEVEMENTS } from "../data/constants.js";
import { hashStr, today } from "../lib/util.js";

const dayPhase = () => {
  const h = new Date().getHours() + new Date().getMinutes() / 60;
  if (h >= 7 && h < 16.5) return "day";
  if ((h >= 5 && h < 7) || (h >= 16.5 && h < 19)) return "dusk";
  return "night";
};

const PHASE_INFO = {
  day:   { label: "☀️ ひる",   sky: 0x87c5eb, amb: 0.9,  sun: 0.95, stars: 0 },
  dusk:  { label: "🌆 ゆうがた", sky: 0xd97a52, amb: 0.62, sun: 0.5,  stars: 0.2 },
  night: { label: "🌙 よる",   sky: 0x0d1230, amb: 0.34, sun: 0.1,  stars: 0.9 },
};

/* 季節(月で決まる)と天気(日付ハッシュで決まる)。実時間だけの演出で株価・市場とは無関係 */
const seasonOf = (m) => {
  if (m >= 3 && m <= 5)  return { key: "spring", label: "🌸はる", leaf: 0xe58fb4, ground: 0x4a9455, wild: 0x437a42, particle: { color: 0xffb7d5, size: 0.34, speed: 1.3, sway: 1.6 } };
  if (m >= 6 && m <= 8)  return { key: "summer", label: "🌻なつ", leaf: 0x1f5c33, ground: 0x3d8a4e, wild: 0x3a6b35, particle: null };
  if (m >= 9 && m <= 11) return { key: "autumn", label: "🍁あき", leaf: 0xc2622d, ground: 0x7d8a45, wild: 0x6b7a3a, particle: { color: 0xd97a3a, size: 0.38, speed: 1.9, sway: 2.2 } };
  return { key: "winter", label: "⛄ふゆ", leaf: 0x2d5a44, ground: 0xb9c8c3, wild: 0x9fb3ac, particle: { color: 0xffffff, size: 0.3, speed: 1.1, sway: 0.9 } };
};
const isRainyToday = () => hashStr(today()) % 10 < 3; // 3割の日は雨(冬なら雪が強まる)

/* ---- 3D牧場(2.5D: ドット絵スプライト×3D地形) ---- */

function Ranch3D({ stocks, onSelect, onFallback }) {
  const mountRef = useRef(null);
  const stocksRef = useRef(stocks); stocksRef.current = stocks;
  const onSelectRef = useRef(onSelect); onSelectRef.current = onSelect;
  const reduced = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // メンバー・ステータス・睡眠・ステージが変わったときだけシーンを作り直す
  const sceneKey = stocks
    .filter((s) => s.status !== "sold")
    .map((s) => `${s.id}:${s.status}:${moveTierOf(s) === 3 ? "z" : "a"}:${stageOf(calcLevel(s)).no}:${s.shiny ? "S" : ""}:${s.evoPattern || ""}`)
    .join("|") + `|s:${seasonOf(new Date().getMonth() + 1).key}|r:${isRainyToday() ? 1 : 0}|a:${evalAchievements(stocks).size}`;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let renderer, raf = 0;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false });
      if (!renderer.getContext()) throw new Error("no webgl");
    } catch (e) { onFallback(); return; }

    const W = () => Math.max(1, mount.clientWidth);
    const H = () => Math.max(1, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(W(), H());
    mount.appendChild(renderer.domElement);
    const el = renderer.domElement;
    el.style.touchAction = "none";

    const scene = new THREE.Scene();
    const season = seasonOf(new Date().getMonth() + 1);
    const rainy = isRainyToday();
    const camera = new THREE.PerspectiveCamera(50, W() / H(), 0.1, 400);
    // 初期アングルは旧自作オービット(az=0.5, pol=1.02, r=27)と同じ位置
    const AZ0 = 0.5, POL0 = 1.02, R0 = 27;
    camera.position.set(
      R0 * Math.sin(POL0) * Math.sin(AZ0),
      R0 * Math.cos(POL0) + 1.5,
      R0 * Math.sin(POL0) * Math.cos(AZ0)
    );
    // 公式OrbitControls(慣性つき)。回転とズームのみ・パンなし。可動域は旧実装と同じ
    const controls = new OrbitControls(camera, el);
    controls.target.set(0, 1, 0);
    controls.enablePan = false;
    controls.enableDamping = !reduced; // 動きを減らす設定では慣性もオフ
    controls.dampingFactor = 0.08;
    controls.minDistance = 11;
    controls.maxDistance = 55;
    controls.minPolarAngle = 0.28;
    controls.maxPolarAngle = 1.35;
    controls.update();

    // HD-2D風ポストプロセス: 光のにじみ(ブルーム)。非対応環境では素のレンダラーに落とす
    // ⚠ 強度・しきい値は時間帯で変える(applyTime参照)。昼の明るい空に強いブルームを
    //   掛けると画面全体が白飛びするため、昼は控えめ・夜はしっかり光らせる
    let composer = null, bloomPass = null;
    try {
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      bloomPass = new UnrealBloomPass(new THREE.Vector2(W(), H()), 0.3, 0.7, 0.9);
      composer.addPass(bloomPass);
      composer.setSize(W(), H());
    } catch (e) { composer = null; bloomPass = null; }

    // ライト(時間帯で変化)
    const amb = new THREE.AmbientLight(0xffffff, 0.7);
    const sun = new THREE.DirectionalLight(0xfff4e0, 0.8);
    sun.position.set(12, 22, 8);
    scene.add(amb, sun);

    // 地形: 柵(x=4)の左=ぼくじょう、右=やせい
    const gPast = new THREE.Mesh(new THREE.PlaneGeometry(20, 24), new THREE.MeshLambertMaterial({ color: season.ground }));
    gPast.rotation.x = -Math.PI / 2; gPast.position.set(-6, 0, 0);
    const gWild = new THREE.Mesh(new THREE.PlaneGeometry(13, 24), new THREE.MeshLambertMaterial({ color: season.wild }));
    gWild.rotation.x = -Math.PI / 2; gWild.position.set(10.5, 0, 0);
    scene.add(gPast, gWild);

    // 柵
    const fenceMat = new THREE.MeshLambertMaterial({ color: 0x8a6a3a });
    for (let z = -12; z <= 12; z += 3) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.32, 1.7, 0.32), fenceMat);
      post.position.set(4, 0.85, z);
      scene.add(post);
    }
    [0.6, 1.25].forEach((y) => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.13, 24.4), fenceMat);
      rail.position.set(4, y, 0);
      scene.add(rail);
    });

    // 木・池・岩
    const mkTree = (x, z, s = 1) => {
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * s, 0.34 * s, 1.2 * s, 6), new THREE.MeshLambertMaterial({ color: 0x6b4a2b }));
      trunk.position.y = 0.6 * s;
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(1.3 * s, 2.5 * s, 7), new THREE.MeshLambertMaterial({ color: season.leaf }));
      leaf.position.y = 2.3 * s;
      g.add(trunk, leaf);
      g.position.set(x, 0, z);
      scene.add(g);
    };
    mkTree(9, -9); mkTree(13.5, -3.5, 1.25); mkTree(11, 7.5, 0.9); mkTree(-14.5, -10, 1.15); mkTree(-13, 9, 0.85);
    const pond = new THREE.Mesh(new THREE.CircleGeometry(2.5, 22), new THREE.MeshLambertMaterial({ color: 0x3aa0c9 }));
    pond.rotation.x = -Math.PI / 2; pond.position.set(-11, 0.02, 5.5);
    scene.add(pond);
    [[-3, -10], [12, 3], [-15, 0]].forEach(([x, z]) => {
      const rock = new THREE.Mesh(new THREE.SphereGeometry(0.55, 5, 4), new THREE.MeshLambertMaterial({ color: 0x6b7280 }));
      rock.position.set(x, 0.3, z);
      scene.add(rock);
    });

    // 星(夜だけ見える)
    const starPos = [];
    for (let i = 0; i < 140; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.random() * Math.PI * 0.45, R = 150;
      starPos.push(R * Math.sin(ph) * Math.cos(th), R * Math.cos(ph) + 5, R * Math.sin(ph) * Math.sin(th));
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.Float32BufferAttribute(starPos, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.8, transparent: true, opacity: 0 }));
    scene.add(stars);

    // 季節・天気のパーティクル(花びら/落ち葉/雪/雨)。動きを減らす設定では出さない
    let drops = null, dropVel = null, dropCfg = null;
    const pcfg = rainy
      ? (season.key === "winter"
        ? { color: 0xffffff, size: 0.32, speed: 2.4, sway: 0.8 }   // 冬の雨日は本降りの雪
        : { color: 0x9db8e8, size: 0.2, speed: 16, sway: 0.1 })    // 雨すじ
      : season.particle;
    if (pcfg && !reduced) {
      const N = rainy ? 240 : 140;
      const pos = new Float32Array(N * 3);
      dropVel = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        pos[i * 3] = -18 + Math.random() * 36;
        pos[i * 3 + 1] = Math.random() * 15;
        pos[i * 3 + 2] = -13 + Math.random() * 26;
        dropVel[i] = 0.7 + Math.random() * 0.6;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      drops = new THREE.Points(geo, new THREE.PointsMaterial({ color: pcfg.color, size: pcfg.size, transparent: true, opacity: rainy && season.key !== "winter" ? 0.5 : 0.9 }));
      dropCfg = pcfg;
      scene.add(drops);
    }

    // 実績で解放される飾り(研究の蓄積が牧場を豊かにする)
    const unlocked = evalAchievements(stocksRef.current).size;
    if (unlocked >= 3) { // 🌼花壇
      [[-13.5, -5.5], [-12.7, -6.3], [-13.9, -6.6], [-12.9, -5.2], [-13.4, -7.1], [-12.3, -5.8]].forEach(([x, z], i) => {
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 4), new THREE.MeshLambertMaterial({ color: 0x2f7a3d }));
        stem.position.set(x, 0.25, z);
        const bud = new THREE.Mesh(new THREE.SphereGeometry(0.17, 6, 5), new THREE.MeshLambertMaterial({ color: [0xff8fb3, 0xffd166, 0xc4b5fd, 0xff8f6b, 0xffffff, 0x93c5fd][i % 6] }));
        bud.position.set(x, 0.55, z);
        scene.add(stem, bud);
      });
    }
    if (unlocked >= 6) { // 🪧かんばん
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.7, 0.18), fenceMat);
      post.position.set(-6, 0.85, 11.3);
      const cv2 = document.createElement("canvas");
      cv2.width = 256; cv2.height = 96;
      const c2 = cv2.getContext("2d");
      c2.fillStyle = "#8a6a3a"; c2.fillRect(0, 0, 256, 96);
      c2.fillStyle = "#5c4526"; c2.fillRect(6, 6, 244, 84);
      c2.fillStyle = "#ffe9c9"; c2.font = "bold 30px sans-serif"; c2.textAlign = "center"; c2.textBaseline = "middle";
      c2.fillText("KABUぼくじょう", 128, 50);
      const signTex = new THREE.CanvasTexture(cv2);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(2.7, 1.0, 0.12), new THREE.MeshLambertMaterial({ map: signTex }));
      panel.position.set(-6, 1.75, 11.3);
      scene.add(post, panel);
    }
    if (unlocked >= 9) { // 🔥かがり火(ブルームで夜に光る)
      [[-1.6, -8], [-1.6, 8]].forEach(([x, z]) => {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 1.4, 5), fenceMat);
        pole.position.set(x, 0.7, z);
        const flame = new THREE.Mesh(new THREE.SphereGeometry(0.24, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffb54d }));
        flame.position.set(x, 1.55, z);
        scene.add(pole, flame);
      });
    }
    if (unlocked >= ACHIEVEMENTS.length) { // 🏆全実績: 金の像
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 0.5, 8), new THREE.MeshLambertMaterial({ color: 0x9ca3af }));
      ped.position.set(-9.5, 0.25, -9);
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 7), new THREE.MeshBasicMaterial({ color: 0xffd166 }));
      body.position.set(-9.5, 1.0, -9);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 7), new THREE.MeshBasicMaterial({ color: 0xffd166 }));
      head.position.set(-9.5, 1.62, -9);
      scene.add(ped, body, head);
    }

    // 実時間の昼夜(1分ごとに再判定)
    const applyTime = () => {
      const phase = dayPhase();
      const p = PHASE_INFO[phase];
      const sky = new THREE.Color(p.sky);
      if (rainy) sky.lerp(new THREE.Color(0x6b7280), 0.45); // 雨の日は空を鈍色に
      scene.background = sky;
      scene.fog = new THREE.Fog(sky, rainy ? 22 : 30, rainy ? 72 : 100); // HD-2D風の空気遠近(雨は濃く)
      amb.intensity = p.amb * (rainy ? 0.72 : 1);
      sun.intensity = p.sun * (rainy ? 0.45 : 1);
      stars.material.opacity = rainy ? 0 : p.stars;
      if (bloomPass) {
        // 昼: 空が明るいのでほぼ光らせない / 夕方: ほどほど / 夜: しっかり発光
        const b = phase === "day" ? { s: 0.22, t: 0.92 } : phase === "dusk" ? { s: 0.5, t: 0.75 } : { s: 0.85, t: 0.55 };
        bloomPass.strength = b.s;
        bloomPass.threshold = b.t;
      }
    };
    applyTime();
    const timeIv = setInterval(applyTime, 60000);

    // クリーチャー(ビルボードスプライト)
    const zoneOf = (s) => (s.status === "hold"
      ? { x0: -15, x1: 2.6, z0: -10.5, z1: 10.5 }
      : { x0: 5.4, x1: 15.5, z0: -10.5, z1: 10.5 });
    const members = new Map();
    stocksRef.current.filter((s) => s.status !== "sold").forEach((s) => {
      const tier = moveTierOf(s);
      const cv = spriteCanvasFor(s, tier === 3);
      const tex = new THREE.CanvasTexture(cv);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
      const hgt = 3.2, aspect = cv.width / cv.height;
      sp.scale.set(hgt * aspect, hgt, 1);
      sp.userData.stockId = s.id;
      const z = zoneOf(s);
      const st = { x: z.x0 + Math.random() * (z.x1 - z.x0), z: z.z0 + Math.random() * (z.z1 - z.z0) };
      st.tx = st.x; st.tz = st.z; st.hop = Math.random() * 6;
      sp.position.set(st.x, hgt / 2, st.z);
      scene.add(sp);
      // 足元の柔らかい落とし影(HD-2D風)。ジャンプ中は小さく薄くなる
      const sh = new THREE.Mesh(
        new THREE.CircleGeometry(1, 18),
        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.26, depthWrite: false })
      );
      sh.rotation.x = -Math.PI / 2;
      sh.scale.set(1.15, 0.72, 1);
      sh.position.set(st.x, 0.03, st.z + 0.15);
      scene.add(sh);
      members.set(s.id, { sp, sh, st, tex, hgt, tier });
    });

    // すれ違い挨拶: 近づいたペアの間に♪が浮かぶ(ペアごと20秒クールダウン)
    const greets = [];
    const greetTex = (() => {
      const gcv = document.createElement("canvas");
      gcv.width = 64; gcv.height = 64;
      const gctx = gcv.getContext("2d");
      gctx.font = "bold 44px sans-serif"; gctx.textAlign = "center"; gctx.textBaseline = "middle";
      gctx.strokeStyle = "#1f2430"; gctx.lineWidth = 6; // 昼の明るい空でも見えるように縁取り
      gctx.strokeText("♪", 32, 34);
      gctx.fillStyle = "#ffffff";
      gctx.fillText("♪", 32, 34);
      return new THREE.CanvasTexture(gcv);
    })();
    const spawnGreet = (x, z) => {
      const gsp = new THREE.Sprite(new THREE.SpriteMaterial({ map: greetTex, transparent: true, depthTest: false }));
      gsp.scale.set(1.3, 1.3, 1);
      gsp.position.set(x, 4.0, z);
      scene.add(gsp);
      greets.push({ sp: gsp, born: performance.now() });
    };
    const lastGreet = new Map();

    // 徘徊(鮮度で速さ・頻度が変化)
    const moveIv = setInterval(() => {
      if (reduced) return;
      members.forEach((o, id) => {
        const s = stocksRef.current.find((x) => x.id === id);
        if (!s) return;
        const tier = moveTierOf(s);
        o.tier = tier;
        if (tier === 3) return;
        const speed = [0.6, 0.32, 0.14][tier];
        const restart = [0.3, 0.14, 0.05][tier];
        const dx = o.st.tx - o.st.x, dz = o.st.tz - o.st.z, d = Math.hypot(dx, dz);
        if (d < 0.25) {
          if (Math.random() < restart) {
            const z = zoneOf(s);
            o.st.tx = z.x0 + Math.random() * (z.x1 - z.x0);
            o.st.tz = z.z0 + Math.random() * (z.z1 - z.z0);
          }
        } else {
          o.st.x += (dx / d) * Math.min(speed, d);
          o.st.z += (dz / d) * Math.min(speed, d);
        }
      });
      // すれ違い判定(眠っている子は挨拶しない)
      if (!reduced) {
        const arr = [...members.entries()];
        const now = Date.now();
        for (let i = 0; i < arr.length; i++) {
          for (let j = i + 1; j < arr.length; j++) {
            const [ida, a] = arr[i], [idb, b] = arr[j];
            if (a.tier === 3 || b.tier === 3) continue;
            const d2 = Math.hypot(a.sp.position.x - b.sp.position.x, a.sp.position.z - b.sp.position.z);
            const key = ida < idb ? ida + idb : idb + ida;
            if (d2 < 2.4 && (!lastGreet.has(key) || now - lastGreet.get(key) > 20000)) {
              lastGreet.set(key, now);
              spawnGreet((a.sp.position.x + b.sp.position.x) / 2, (a.sp.position.z + b.sp.position.z) / 2);
            }
          }
        }
      }
    }, 480);

    // 描画ループ(位置補間＋ぴょんぴょん)
    const clock = new THREE.Clock();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const t = clock.getElapsedTime();
      members.forEach((o) => {
        const p = o.sp.position;
        p.x += (o.st.x - p.x) * 0.08;
        p.z += (o.st.z - p.z) * 0.08;
        const moving = Math.hypot(o.st.tx - p.x, o.st.tz - p.z) > 0.35;
        const hopY = o.tier === 0 && moving && !reduced ? Math.abs(Math.sin(t * 6 + o.st.hop)) * 0.5 : 0;
        p.y = o.hgt / 2 + hopY;
        // 影はキャラの真下。ジャンプの高さに応じて小さく・薄く
        const k = 1 - hopY * 0.35;
        o.sh.position.set(p.x, 0.03, p.z + 0.15);
        o.sh.scale.set(1.15 * k, 0.72 * k, 1);
        o.sh.material.opacity = 0.26 - hopY * 0.12;
      });
      // 季節・天気パーティクルの落下(下まで行ったら上に戻す)
      if (drops) {
        const pos = drops.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          let y = pos.getY(i) - dropCfg.speed * dropVel[i] * 0.016;
          if (y < 0) {
            y = 14 + Math.random() * 2;
            pos.setX(i, -18 + Math.random() * 36);
            pos.setZ(i, -13 + Math.random() * 26);
          } else if (dropCfg.sway > 0.2) {
            pos.setX(i, pos.getX(i) + Math.sin(t * 2 + i) * dropCfg.sway * 0.008);
          }
          pos.setY(i, y);
        }
        pos.needsUpdate = true;
      }
      // ♪はふわっと浮かんで消える
      for (let i = greets.length - 1; i >= 0; i--) {
        const g2 = greets[i];
        const age = (performance.now() - g2.born) / 1300;
        if (age >= 1) {
          scene.remove(g2.sp);
          g2.sp.material.dispose();
          greets.splice(i, 1);
        } else {
          g2.sp.position.y = 4.0 + age * 1.4;
          g2.sp.material.opacity = 1 - age * age;
        }
      }
      controls.update(); // 慣性(damping)の反映
      if (composer) composer.render(); else renderer.render(scene, camera);
    };
    loop();

    // タップ/クリック=選択。回転・ピンチ・ホイールはOrbitControlsが担当
    // ドラッグ後(7px以上の移動)と2本指操作では選択しない(旧実装と同じ挙動)
    let downAt = null, multi = false;
    const onDown = (e) => {
      if (downAt === null) { downAt = { x: e.clientX, y: e.clientY }; multi = false; }
      else multi = true;
    };
    const onUp = (e) => {
      if (downAt === null) return;
      const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
      const wasMulti = multi;
      downAt = null;
      if (wasMulti || moved >= 7) return;
      const rect = el.getBoundingClientRect();
      const m = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      const rc = new THREE.Raycaster();
      rc.setFromCamera(m, camera);
      const hits = rc.intersectObjects([...members.values()].map((o) => o.sp));
      if (hits.length > 0) onSelectRef.current(hits[0].object.userData.stockId);
    };
    const onCancel = () => { downAt = null; };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onCancel);

    // リサイズ追従
    const ro = new ResizeObserver(() => {
      camera.aspect = W() / H();
      camera.updateProjectionMatrix();
      renderer.setSize(W(), H());
      if (composer) composer.setSize(W(), H());
    });
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(moveIv);
      clearInterval(timeIv);
      ro.disconnect();
      controls.dispose();
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onCancel);
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
            if (m.map) m.map.dispose();
            m.dispose();
          });
        }
      });
      starGeo.dispose();
      if (composer) { composer.renderTarget1.dispose(); composer.renderTarget2.dispose(); }
      renderer.dispose();
      if (el.parentNode === mount) mount.removeChild(el);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneKey]);

  return (
    <div ref={mountRef} style={{
      width: "100%", height: "min(64vh, 540px)", borderRadius: 18,
      overflow: "hidden", border: "2px solid #3b4470", background: "#0d1230",
    }} />
  );
}

/* ---- 2Dフォールバック(WebGL不可の端末用) ---- */

function Ranch2D({ stocks, onSelect }) {
  const actives = stocks.filter((s) => s.status !== "sold");
  const holds = actives.filter((s) => s.status === "hold");
  const posRef = useRef({});
  const [, force] = useState(0);
  const reduced = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const zoneOf = (s) => (s.status === "hold"
    ? { x0: 5, x1: 52, y0: 32, y1: 80 }
    : { x0: 66, x1: 91, y0: 32, y1: 80 });

  useEffect(() => {
    const p = posRef.current;
    actives.forEach((s) => {
      const z = zoneOf(s);
      const cur = p[s.id];
      const inZone = cur && cur.x >= z.x0 - 2 && cur.x <= z.x1 + 2;
      if (!cur || !inZone) {
        const x = z.x0 + Math.random() * (z.x1 - z.x0);
        const y = z.y0 + Math.random() * (z.y1 - z.y0);
        p[s.id] = { x, y, tx: x, ty: y };
      }
    });
    Object.keys(p).forEach((id) => { if (!actives.some((s) => s.id === id)) delete p[id]; });
    force((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stocks]);

  useEffect(() => {
    if (reduced) return;
    const iv = setInterval(() => {
      const p = posRef.current;
      actives.forEach((s) => {
        const c = p[s.id]; if (!c) return;
        const tier = moveTierOf(s);
        if (tier === 3) return;
        const speed = [3.0, 1.6, 0.7][tier];
        const restart = [0.3, 0.14, 0.05][tier];
        const dx = c.tx - c.x, dy = c.ty - c.y, d = Math.hypot(dx, dy);
        if (d < 1) {
          if (Math.random() < restart) {
            const z = zoneOf(s);
            c.tx = z.x0 + Math.random() * (z.x1 - z.x0);
            c.ty = z.y0 + Math.random() * (z.y1 - z.y0);
          }
        } else {
          const step = Math.min(speed, d);
          c.x += (dx / d) * step; c.y += (dy / d) * step;
        }
      });
      force((n) => n + 1);
    }, 480);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stocks, reduced]);

  const sorted = [...actives].sort((a, b) => (posRef.current[a.id]?.y || 0) - (posRef.current[b.id]?.y || 0));
  return (
    <div style={{
      position: "relative", width: "100%", height: "min(64vh, 540px)", borderRadius: 18,
      overflow: "hidden", border: "2px solid #3b4470",
      background: "linear-gradient(180deg, #16204a 0%, #1b2f63 22%, #1d4d33 26%, #17402b 60%, #123322 100%)",
    }}>
      <div style={{ position: "absolute", left: "59%", top: "27%", bottom: 0, width: 0, borderLeft: "3px dashed #8a6a3a" }} />
      <div style={{ position: "absolute", left: "3%", top: "20%", fontFamily: "'DotGothic16', monospace", fontSize: 11, color: "#ffd166", background: "#0e1122cc", border: "1px solid #ffd16655", borderRadius: 8, padding: "3px 9px" }}>
        ⭐ ぼくじょう（{holds.length}）
      </div>
      <div style={{ position: "absolute", right: "3%", top: "20%", fontFamily: "'DotGothic16', monospace", fontSize: 11, color: "#60a5fa", background: "#0e1122cc", border: "1px solid #60a5fa55", borderRadius: 8, padding: "3px 9px" }}>
        👀 やせい（{actives.length - holds.length}）
      </div>
      {sorted.map((s) => {
        const c = posRef.current[s.id];
        if (!c) return null;
        const tier = moveTierOf(s);
        const moving = tier < 3 && Math.hypot(c.tx - c.x, c.ty - c.y) >= 1;
        return (
          <button key={s.id} onClick={() => onSelect(s.id)} style={{
            all: "unset", cursor: "pointer", position: "absolute",
            left: `${c.x}%`, top: `${c.y}%`, transform: "translate(-50%,-70%)",
            transition: reduced ? "none" : "left .48s linear, top .48s linear",
            textAlign: "center", zIndex: Math.round(c.y),
          }}>
            <div style={{ position: "relative", display: "inline-block", animation: !reduced && moving && tier === 0 ? "kzHop .48s ease-in-out infinite" : "none" }}>
              <Creature stock={s} size={44} sleeping={tier === 3} />
              {tier === 3 && <span style={{ position: "absolute", top: -8, right: -14, fontSize: 12 }}>💤</span>}
            </div>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: "#eef1ff", background: "#0e1122bb", borderRadius: 999, padding: "1px 7px", marginTop: 2, whiteSpace: "nowrap" }}>
              {s.name}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ---- 牧場ビュー(WebGL判定つき) ---- */

function RanchView({ stocks, onSelect }) {
  const [mode, setMode] = useState(() => {
    try {
      const c = document.createElement("canvas");
      return (c.getContext("webgl") || c.getContext("experimental-webgl")) ? "3d" : "2d";
    } catch (e) { return "2d"; }
  });
  const phase = PHASE_INFO[dayPhase()];
  const season = seasonOf(new Date().getMonth() + 1);
  const rainy = isRainyToday();
  return (
    <div>
      {mode === "3d"
        ? <Ranch3D stocks={stocks} onSelect={onSelect} onFallback={() => setMode("2d")} />
        : <Ranch2D stocks={stocks} onSelect={onSelect} />}
      <div style={{ fontSize: 10.5, color: "#5b6284", marginTop: 8, lineHeight: 1.7 }}>
        {mode === "3d"
          ? <>いまは{season.label}の{phase.label}{rainy ? "・☔あめもよう" : ""}（季節は月、天気は日替わり、時刻は端末の時計と連動）。<b style={{ color: "#8b93b8" }}>ドラッグで回転、ピンチ/ホイールでズーム、タップで詳細</b>が開きます。柵の左がぼくじょう（保有）、右がやせい（ウォッチ中）。</>
          : <>この端末では3D表示が使えないため2D表示です。タップで詳細が開きます。柵の左がぼくじょう（保有）、右がやせい（ウォッチ中）。</>}
        🌱新鮮な銘柄ほど元気に跳ね、🍂古いとのんびり、🥀90日超は眠ります（動き＝記録の鮮度で、株価とは無関係です）。リリースした銘柄は野生に帰るため現れません。
      </div>
    </div>
  );
}

export { dayPhase, PHASE_INFO, Ranch3D, Ranch2D, RanchView };
