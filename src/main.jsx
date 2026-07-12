import React from "react";
import { createRoot } from "react-dom/client";
import KabuDex from "./KabuDex.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <KabuDex />
  </React.StrictMode>
);

// PWA: Service Worker登録(本番ビルドのみ。開発中はキャッシュが邪魔になるため無効)
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => { /* 未対応環境でも本体は動く */ });
  });
}
