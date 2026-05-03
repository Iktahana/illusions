"use client";

import { useEffect, useState } from "react";

interface WindowActivityState {
  isDocumentVisible: boolean;
  isWindowFocused: boolean;
}

function readWindowActivity(): WindowActivityState {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return {
      isDocumentVisible: true,
      isWindowFocused: true,
    };
  }

  return {
    isDocumentVisible: document.visibilityState === "visible",
    isWindowFocused: document.hasFocus(),
  };
}

export function useWindowActivityState(): WindowActivityState {
  const [state, setState] = useState<WindowActivityState>(() => readWindowActivity());

  useEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") {
      return;
    }

    const syncState = () => {
      setState(readWindowActivity());
    };

    syncState();
    document.addEventListener("visibilitychange", syncState);
    window.addEventListener("focus", syncState);
    window.addEventListener("blur", syncState);

    return () => {
      document.removeEventListener("visibilitychange", syncState);
      window.removeEventListener("focus", syncState);
      window.removeEventListener("blur", syncState);
    };
  }, []);

  return state;
}
