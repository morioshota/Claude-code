/* とくべつパック: 特別キャラのドット絵を「自分の端末だけ」に読み込む仕組み(2026-09末)。
   特別キャラには既存作品のキャラクター(フレデリック・任天堂のキャラ等)が含まれるため、
   アプリ本体(GitHub・公開URL)には一切入れず、オーナーが手元のJSONファイルを読み込む。
   保存先はこの端末のストレージ(kabu-special-pack)。バックアップ(書き出し)にも含めて、端末のデータ消失に備える。
   形式: { format: "kabu-special-pack", version: 1, specials: [{ key, name, px: [..], pal: {文字: 色}, native?, raw? }] }
     native: Scale2xをかけず実寸で描く / raw: 陰影・輪郭もかけない(元のドット絵のまま) */

import { storage } from "./storage.js";

export const SPECIAL_PACK_KEY = "kabu-special-pack";

let pack = [];
let version = 0;

export const getSpecials = () => pack;
export const specialsVersion = () => version;
export const findSpecial = (key) => (key ? pack.find((x) => x.key === key) || null : null);

/* 形式チェック。壊れた要素は捨て、使えるものだけ返す */
export function parseSpecialPack(data) {
  const list = data && (data.format === "kabu-special-pack" ? data.specials : Array.isArray(data) ? data : null);
  if (!Array.isArray(list)) return null;
  return list.filter((s) => s && typeof s.key === "string" && typeof s.name === "string"
    && Array.isArray(s.px) && s.px.length > 0 && s.px.every((r) => typeof r === "string")
    && s.pal && typeof s.pal === "object")
    .map((s) => ({ key: s.key, name: s.name, px: s.px, pal: s.pal, native: !!s.native, raw: !!s.raw }));
}

const setPack = (list) => { pack = list; version++; };

export async function loadSpecialPack() {
  try {
    const res = await storage.get(SPECIAL_PACK_KEY);
    const list = res && res.value ? parseSpecialPack(JSON.parse(res.value)) : null;
    setPack(list || []);
  } catch (e) { setPack([]); /* 読めなくても本体は通常の種族で動く */ }
  return pack;
}

/* 追加・上書き(同じkeyは新しいほうで置き換え) */
export async function mergeSpecialPack(list) {
  const map = new Map(pack.map((s) => [s.key, s]));
  list.forEach((s) => map.set(s.key, s));
  const next = [...map.values()];
  await storage.set(SPECIAL_PACK_KEY, JSON.stringify({ format: "kabu-special-pack", version: 1, specials: next }));
  setPack(next);
  return next;
}

export async function clearSpecialPack() {
  try { await storage.delete(SPECIAL_PACK_KEY); } catch (e) { /* 無くても問題なし */ }
  setPack([]);
}
