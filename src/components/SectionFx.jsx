/* 枠を走る光(スクロール・指・傾きで動く --hp を cardfx のrAFが書き込む)。
   研究レベル由来のレアリティ(rank 2〜5)で光の強さが変わる。rank 1 以下は光らせない。
   もとは銘柄詳細(DetailModal)の中だけにあったが、2026-10に分析・今日・アルバムの枠でも使うため切り出した */
import { useEffect, useRef } from "react";
import { registerCard } from "../lib/cardfx.js";

// 銘柄に結びつかない枠(今日・分析・アルバムの一覧など)の光の強さ。ST4 相当
export const PAGE_FX_RANK = 4;

export function SectionFx({ rank, color, style, className = "", children, ...rest }) {
  const ref = useRef(null);
  useEffect(() => registerCard(ref.current), []);
  if (rank <= 1) return <div {...rest} className={`kzSecWrap ${className}`} style={style}>{children}</div>;
  return (
    <div {...rest} ref={ref} className={`kzSecWrap kzSecFx kzSecFx${Math.min(5, rank)} ${className}`} style={{ ...style, "--kzSecCol": color }}>
      {children}
    </div>
  );
}
