import React from "react";
import { createRoot } from "react-dom/client";
import KabuDex from "./KabuDex.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <KabuDex />
  </React.StrictMode>
);
