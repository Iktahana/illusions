"use client";

import { useState, useEffect, useCallback } from "react";

export interface SpeechState {
  isPlaying: boolean;
  isPaused: boolean;
  isSupported: boolean;
}

/** Returns true when the Web Speech API is available in the current environment. */
function checkSupport(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/**
 * Finds the best available Japanese voice, falling back to undefined
 * if no ja-JP voice is installed.
 */
function findJapaneseVoice(): SpeechSynthesisVoice | undefined {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return undefined;
  }
  const voices = window.speechSynthesis.getVoices();
  return voices.find((v) => v.lang === "ja-JP") ?? undefined;
}

export function useSpeech(): {
  state: SpeechState;
  speak: (text: string) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
} {
  const [state, setState] = useState<SpeechState>({
    isPlaying: false,
    isPaused: false,
    isSupported: false, // Start false for SSR; updated after mount
  });

  // Detect support on the client after mount (window is not available during SSR).
  useEffect(() => {
    setState((prev) => ({ ...prev, isSupported: checkSupport() }));
  }, []);

  // Cancel any ongoing speech on unmount to avoid dangling utterances.
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const speak = useCallback((text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }

    // Cancel whatever is currently playing before starting new speech.
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ja-JP";

    const voice = findJapaneseVoice();
    if (voice !== undefined) {
      utterance.voice = voice;
    }

    utterance.onstart = () => {
      setState({ isPlaying: true, isPaused: false, isSupported: true });
    };

    utterance.onend = () => {
      setState({ isPlaying: false, isPaused: false, isSupported: true });
    };

    utterance.onerror = () => {
      setState({ isPlaying: false, isPaused: false, isSupported: true });
    };

    utterance.onpause = () => {
      setState({ isPlaying: false, isPaused: true, isSupported: true });
    };

    utterance.onresume = () => {
      setState({ isPlaying: true, isPaused: false, isSupported: true });
    };

    window.speechSynthesis.speak(utterance);
  }, []);

  const pause = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.pause();
    }
  }, []);

  const resume = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.resume();
    }
  }, []);

  const stop = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      setState((prev) => ({ ...prev, isPlaying: false, isPaused: false }));
    }
  }, []);

  return { state, speak, pause, resume, stop };
}
