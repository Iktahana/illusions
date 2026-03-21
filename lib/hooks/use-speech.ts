"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export interface SpeechState {
  isPlaying: boolean;
  isPaused: boolean;
  isSupported: boolean;
}

export interface SpeechConfig {
  voiceURI?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
}

/** Returns true when the Web Speech API is available in the current environment. */
function checkSupport(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/**
 * Finds a Japanese voice, preferring the one matching the given voiceURI.
 * Falls back to the first ja-JP voice if no match or no URI specified.
 */
function findJapaneseVoice(voiceURI?: string): SpeechSynthesisVoice | undefined {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return undefined;
  }
  const voices = window.speechSynthesis.getVoices();
  if (voiceURI) {
    const match = voices.find((v) => v.voiceURI === voiceURI && v.lang === "ja-JP");
    if (match) return match;
  }
  return voices.find((v) => v.lang === "ja-JP") ?? undefined;
}

/** Apply config (rate, pitch, volume) to an utterance */
function applyConfig(utterance: SpeechSynthesisUtterance, config?: SpeechConfig): void {
  utterance.rate = config?.rate ?? 1.0;
  utterance.pitch = config?.pitch ?? 1.0;
  utterance.volume = config?.volume ?? 1.0;
}

export interface SpeechCallbacks {
  onBoundary?: (charIndex: number, charLength: number) => void;
  onEnd?: () => void;
}

export interface SegmentCallbacks {
  onSegmentStart?: (index: number) => void;
  onEnd?: () => void;
}

export function useSpeech(config?: SpeechConfig): {
  state: SpeechState;
  speak: (text: string, callbacks?: SpeechCallbacks) => void;
  speakSegments: (segments: string[], callbacks?: SegmentCallbacks) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
} {
  const [state, setState] = useState<SpeechState>({
    isPlaying: false,
    isPaused: false,
    isSupported: false, // Start false for SSR; updated after mount
  });

  // Store config in a ref to avoid recreating callbacks when settings change.
  const configRef = useRef(config);
  configRef.current = config;

  // Store callbacks in refs so they can be updated without recreating the utterance.
  const onBoundaryRef = useRef<SpeechCallbacks["onBoundary"]>(undefined);
  const onEndRef = useRef<SpeechCallbacks["onEnd"]>(undefined);
  const onSegmentStartRef = useRef<SegmentCallbacks["onSegmentStart"]>(undefined);

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

  const speak = useCallback((text: string, callbacks?: SpeechCallbacks) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }

    onBoundaryRef.current = callbacks?.onBoundary;
    onEndRef.current = callbacks?.onEnd;

    // Cancel whatever is currently playing before starting new speech.
    window.speechSynthesis.cancel();

    const cfg = configRef.current;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ja-JP";

    const voice = findJapaneseVoice(cfg?.voiceURI);
    if (voice !== undefined) {
      utterance.voice = voice;
    }
    applyConfig(utterance, cfg);

    utterance.onstart = () => {
      setState({ isPlaying: true, isPaused: false, isSupported: true });
    };

    utterance.onend = () => {
      setState({ isPlaying: false, isPaused: false, isSupported: true });
      onEndRef.current?.();
    };

    utterance.onerror = () => {
      setState({ isPlaying: false, isPaused: false, isSupported: true });
      onEndRef.current?.();
    };

    utterance.onpause = () => {
      setState({ isPlaying: false, isPaused: true, isSupported: true });
    };

    utterance.onresume = () => {
      setState({ isPlaying: true, isPaused: false, isSupported: true });
    };

    utterance.onboundary = (e) => {
      const charLength = (e as SpeechSynthesisEvent & { charLength?: number }).charLength ?? 1;
      onBoundaryRef.current?.(e.charIndex, charLength);
    };

    window.speechSynthesis.speak(utterance);
  }, []);

  const speakSegments = useCallback((segments: string[], callbacks?: SegmentCallbacks) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }
    if (segments.length === 0) return;

    onSegmentStartRef.current = callbacks?.onSegmentStart;
    onEndRef.current = callbacks?.onEnd;

    window.speechSynthesis.cancel();

    const cfg = configRef.current;
    const voice = findJapaneseVoice(cfg?.voiceURI);
    const utterances = segments.map((text, i) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "ja-JP";
      if (voice) u.voice = voice;
      applyConfig(u, cfg);

      u.onstart = () => {
        setState({ isPlaying: true, isPaused: false, isSupported: true });
        onSegmentStartRef.current?.(i);
      };
      u.onpause = () => {
        setState({ isPlaying: false, isPaused: true, isSupported: true });
      };
      u.onresume = () => {
        setState({ isPlaying: true, isPaused: false, isSupported: true });
      };
      u.onerror = () => {
        window.speechSynthesis.cancel();
        setState({ isPlaying: false, isPaused: false, isSupported: true });
        onEndRef.current?.();
      };
      return u;
    });

    // Only the last utterance's onend resets state and fires callback
    utterances[utterances.length - 1].onend = () => {
      setState({ isPlaying: false, isPaused: false, isSupported: true });
      onEndRef.current?.();
    };

    // Queue all utterances — speechSynthesis plays them in order
    utterances.forEach((u) => window.speechSynthesis.speak(u));
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
      onEndRef.current?.();
    }
  }, []);

  return { state, speak, speakSegments, pause, resume, stop };
}
