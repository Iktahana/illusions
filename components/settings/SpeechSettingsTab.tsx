"use client";

import type React from "react";
import { useState, useEffect, useCallback } from "react";

import { useSpeechSettings } from "@/contexts/EditorSettingsContext";
import { SettingsField, SettingsSection, SliderField } from "./primitives";

/**
 * Settings tab for text-to-speech (読み上げ) and speech recognition (音声入力).
 * Covers: voice selection, playback rate, pitch, and volume.
 * Available Japanese voices are loaded asynchronously from the Web Speech API.
 */
export default function SpeechSettingsTab(): React.ReactElement {
  const {
    speechVoiceURI,
    speechRate,
    speechPitch,
    speechVolume,
    onSpeechVoiceURIChange,
    onSpeechRateChange,
    onSpeechPitchChange,
    onSpeechVolumeChange,
  } = useSpeechSettings();
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Load available Japanese voices (may arrive asynchronously)
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const loadVoices = (): void => {
      const voices = window.speechSynthesis.getVoices().filter((v) => v.lang === "ja-JP");
      setAvailableVoices(voices);
    };
    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
    };
  }, []);

  const handlePreview = useCallback((): void => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }
    // Re-fetch voices at speak time — stale voice references cause silence in Chromium/Electron
    const freshVoices = window.speechSynthesis.getVoices();
    const selectedVoice = freshVoices.find((v) => v.voiceURI === speechVoiceURI) ?? null;
    const voiceName = selectedVoice
      ? selectedVoice.name.replace(/\s*\([^)]*\([^)]*\)\)$/, "").trim()
      : "illusions";
    const utterance = new SpeechSynthesisUtterance(`こんにちは、私は${voiceName}です。`);
    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.rate = speechRate;
    utterance.pitch = speechPitch;
    utterance.volume = speechVolume;
    utterance.lang = "ja-JP";
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    setIsSpeaking(true);
    // resume() is a workaround for the Chromium bug where speechSynthesis enters a paused state
    window.speechSynthesis.resume();
    window.speechSynthesis.speak(utterance);
  }, [isSpeaking, speechVoiceURI, speechRate, speechPitch, speechVolume]);

  const currentVoiceName = availableVoices.find((v) => v.voiceURI === speechVoiceURI);
  const previewName = currentVoiceName
    ? currentVoiceName.name.replace(/\s*\([^)]*\([^)]*\)\)$/, "").trim()
    : "illusions";

  return (
    <div className="space-y-8">
      <SettingsSection
        title="音声入力"
        description="Illusions には独自の音声入力機能はありませんが外部ツールの Superwhisper とは非常に相性が良いです。ぜひ併用を検討してみてください。"
      >
        <div className="flex items-center gap-4 px-4 py-3 border border-border rounded-xl bg-background-secondary">
          <img
            src="./image/superwhisper_logo.png"
            alt="Superwhisper"
            className="w-12 h-12 rounded-xl object-contain flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">Superwhisper</p>
            <p className="text-xs text-foreground-tertiary">macOS/Windows 向け音声入力ツール</p>
          </div>
          <a
            href="https://superwhisper.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold px-4 py-1.5 rounded-full bg-foreground text-background hover:opacity-75 transition-opacity flex-shrink-0"
          >
            ダウンロード
          </a>
        </div>
      </SettingsSection>

      <div className="border-t border-border" />

      <SettingsSection
        title="読み上げ"
        description="テキストの読み上げ（Text-to-Speech）の設定を調整します。"
      >
        <SettingsField label="音声" htmlFor="speech-voice">
          <div className="flex items-center gap-2">
            <select
              id="speech-voice"
              value={speechVoiceURI}
              onChange={(e) => onSpeechVoiceURIChange(e.target.value)}
              className="flex-1 px-3 py-2 border border-border-secondary rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="">自動（デフォルト）</option>
              {availableVoices.map((voice) => (
                <option key={voice.voiceURI} value={voice.voiceURI}>
                  {voice.name.replace(/\s*\([^)]*\([^)]*\)\)$/, "").trim()}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handlePreview}
              title={isSpeaking ? "停止" : "試聴"}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-background-hover transition-colors flex-shrink-0"
            >
              {isSpeaking ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-4 h-4"
                >
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-4 h-4"
                >
                  <path d="M8 5.14v14l11-7-11-7z" />
                </svg>
              )}
              {isSpeaking ? "停止" : "試聴"}
            </button>
          </div>
          <p className="mt-1 text-xs text-foreground-tertiary">
            「こんにちは、私は{previewName}です。」
          </p>
          {availableVoices.length === 0 && (
            <p className="mt-1 text-xs text-foreground-tertiary">
              日本語の音声が見つかりません。OS の音声設定をご確認ください。
            </p>
          )}
        </SettingsField>

        <SliderField
          label="速度"
          value={speechRate}
          min={0.5}
          max={2.0}
          step={0.1}
          formatValue={(v) => `${v.toFixed(1)}x`}
          onChange={onSpeechRateChange}
        />

        <SliderField
          label="ピッチ"
          value={speechPitch}
          min={0.5}
          max={2.0}
          step={0.1}
          formatValue={(v) => v.toFixed(1)}
          onChange={onSpeechPitchChange}
        />

        <SliderField
          label="音量"
          value={speechVolume}
          min={0}
          max={1}
          step={0.1}
          formatValue={(v) => `${Math.round(v * 100)}%`}
          onChange={onSpeechVolumeChange}
        />
      </SettingsSection>
    </div>
  );
}
