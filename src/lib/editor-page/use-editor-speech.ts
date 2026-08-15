"use client";

import { useCallback, useEffect, useRef } from "react";
import { Decoration } from "@milkdown/prose/view";
import type { EditorView } from "@milkdown/prose/view";

import { useSpeechSettings } from "@/contexts/EditorSettingsContext";
import type { EditorInteractionStore, SelectionToken } from "@/lib/editor-interaction";
import { buildSegments, buildSpeechChunks, buildSpeechMap } from "@/lib/hooks/speech-utils";
import { useSpeech } from "@/lib/hooks/use-speech";
import { cancelSpeechScroll, scrollToSpeechTarget } from "./speech-auto-scroll";
import { SPEECH_DECORATIONS_META } from "./speech-highlight-plugin";

const MAX_SPEECH_DOC_RANGE = 10_000;

interface SpeechSession {
  editorId: string;
  generation: number;
  view: EditorView;
  end: number;
}

function findScrollContainer(node: HTMLElement, fallback: HTMLElement | null): HTMLElement | null {
  let current: HTMLElement | null = node.parentElement;
  while (current) {
    const style = getComputedStyle(current);
    if (/(auto|scroll)/.test(`${style.overflow} ${style.overflowX} ${style.overflowY}`)) {
      return current;
    }
    current = current.parentElement;
  }
  return fallback;
}

export function useEditorSpeech({
  interaction,
  isVertical,
  editorSurface,
}: {
  interaction: EditorInteractionStore;
  isVertical: boolean;
  editorSurface: React.RefObject<HTMLDivElement | null>;
}) {
  const { speechVoiceURI, speechRate, speechPitch, speechVolume } = useSpeechSettings();
  const {
    state,
    speakSegments,
    pause,
    resume,
    stop: stopSynthesis,
  } = useSpeech({
    voiceURI: speechVoiceURI,
    rate: speechRate,
    pitch: speechPitch,
    volume: speechVolume,
  });
  const sessionRef = useRef<SpeechSession | null>(null);
  const verticalRef = useRef(isVertical);
  verticalRef.current = isVertical;

  const isCurrent = useCallback(
    (session: SpeechSession): boolean => {
      const snapshot = interaction.getSnapshot();
      return (
        snapshot.ready &&
        snapshot.active &&
        snapshot.editorId === session.editorId &&
        snapshot.generation === session.generation &&
        session.view.isDestroyed === false
      );
    },
    [interaction],
  );

  const clearHighlight = useCallback(() => {
    cancelSpeechScroll();
    const session = sessionRef.current;
    // Cleanup is allowed on the session's own still-live view even after the
    // pane has become inactive. It never applies content edits, and prevents a
    // hidden split/tab from retaining a stale speech decoration.
    if (!session || session.view.isDestroyed !== false) return;
    session.view.dispatch(session.view.state.tr.setMeta(SPEECH_DECORATIONS_META, []));
  }, []);

  const stop = useCallback(() => {
    stopSynthesis();
    clearHighlight();
    sessionRef.current = null;
  }, [clearHighlight, stopSynthesis]);

  const speakRangeRef = useRef<(session: SpeechSession, from: number) => void>(() => {});
  const speakRange = useCallback(
    (session: SpeechSession, from: number) => {
      if (!isCurrent(session) || from >= session.end) {
        stop();
        return;
      }
      const to = Math.min(from + MAX_SPEECH_DOC_RANGE, session.end);
      const map = buildSpeechMap(session.view.state.doc, from, to);
      const chunks = buildSpeechChunks(map.text, buildSegments(map.text));
      if (chunks.length === 0) {
        if (to < session.end) speakRangeRef.current(session, to);
        else stop();
        return;
      }

      speakSegments(
        chunks.map((chunk) => chunk.speech),
        {
          onSegmentStart(index) {
            if (!isCurrent(session)) {
              stop();
              return;
            }
            const chunk = chunks[index];
            const start = map.positions[chunk.highlightStart];
            const last = map.positions[chunk.highlightEnd - 1];
            if (start === undefined || last === undefined) return;
            const decoration = Decoration.inline(start, last + 1, { class: "speech-reading" });
            session.view.dispatch(
              session.view.state.tr.setMeta(SPEECH_DECORATIONS_META, [decoration]),
            );
            try {
              const dom = session.view.domAtPos(start).node;
              const target = dom instanceof HTMLElement ? dom : dom.parentElement;
              if (!target) return;
              const container = findScrollContainer(target, editorSurface.current);
              if (container)
                scrollToSpeechTarget({
                  container,
                  target,
                  isVertical: verticalRef.current,
                });
            } catch {
              // The view may be between layout passes; the next segment retries.
            }
          },
          onEnd() {
            clearHighlight();
            if (to < session.end && isCurrent(session)) speakRangeRef.current(session, to);
            else sessionRef.current = null;
          },
          onError: stop,
        },
      );
    },
    [clearHighlight, editorSurface, isCurrent, speakSegments, stop],
  );
  speakRangeRef.current = speakRange;

  const start = useCallback(
    (view: EditorView, token: SelectionToken, generation: number) => {
      stop();
      const { from, to, empty, head } = view.state.selection;
      const docEnd = view.state.doc.content.size;
      const startAt = Math.max(1, empty ? head : from);
      const endAt = empty ? docEnd : to;
      if (startAt >= endAt) return;
      const session: SpeechSession = {
        editorId: token.editorId,
        generation,
        view,
        end: endAt,
      };
      sessionRef.current = session;
      speakRangeRef.current(session, startAt);
    },
    [stop],
  );

  useEffect(() => {
    if (!state.isSupported) return;
    const unregisterToggle = interaction.registerExecutor(
      "speech.toggle",
      ({ token, view, generation }) => {
        if (state.isPlaying) pause();
        else if (state.isPaused) resume();
        else if (token) start(view, token, generation);
        else return { status: "stale" };
        return { status: "executed" };
      },
    );
    const unregisterStop = interaction.registerExecutor("speech.stop", () => {
      stop();
      return { status: "executed" };
    });
    return () => {
      unregisterToggle();
      unregisterStop();
    };
  }, [interaction, pause, resume, start, state.isPaused, state.isPlaying, state.isSupported, stop]);

  useEffect(() => {
    return interaction.subscribe(() => {
      const session = sessionRef.current;
      if (session && !isCurrent(session)) stop();
    });
  }, [interaction, isCurrent, stop]);

  useEffect(() => stop, [stop]);

  const toggle = useCallback(() => {
    const token = interaction.getSnapshot().selection.token;
    interaction.execute({ id: "speech.toggle" }, token);
  }, [interaction]);

  return { state, toggle, stop };
}
