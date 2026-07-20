"use client";

import { useEffect, useState } from "react";

/**
 * 現在のウィンドウ幅（px）を返すフック。#1856
 *
 * リサイズに追従して再レンダリングを促す。SSR 安全（初期値は 0、
 * マウント後に実値へ更新）。狭いウィンドウでのレスポンシブ判定に使う。
 */
export function useWindowWidth(): number {
  const [width, setWidth] = useState<number>(() =>
    typeof window === "undefined" ? 0 : window.innerWidth,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = (): void => setWidth(window.innerWidth);
    // マウント直後に実値へ同期（SSR 初期値 0 のケースを補正）。
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return width;
}
