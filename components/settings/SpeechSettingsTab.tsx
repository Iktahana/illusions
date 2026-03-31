"use client";

import type React from "react";
import { useState, useEffect } from "react";
import { useSpeechSettings } from "@/contexts/EditorSettingsContext";

/**
 * Settings tab for text-to-speech (朗読) and speech recognition (聴写).
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

  return (
    <div className="space-y-8 p-6">
      {/* 聴写 section */}
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-1">聴写</h3>
        <p className="text-sm text-foreground-tertiary">
          音声認識による入力機能は今後のアップデートで追加予定です。
        </p>
      </div>

      <div className="border-t border-border" />

      {/* 朗読 section */}
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-1">朗読</h3>
          <p className="text-sm text-foreground-secondary mb-4">
            テキストの読み上げ（Text-to-Speech）の設定を調整します。
          </p>
        </div>

        {/* Voice selection */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">音声</label>
          <select
            value={speechVoiceURI}
            onChange={(e) => onSpeechVoiceURIChange(e.target.value)}
            className="w-full px-3 py-2 border border-border-secondary rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="">自動（デフォルト）</option>
            {availableVoices.map((voice) => (
              <option key={voice.voiceURI} value={voice.voiceURI}>
                {voice.name}
              </option>
            ))}
          </select>
          {availableVoices.length === 0 && (
            <p className="text-xs text-foreground-tertiary mt-1">
              日本語の音声が見つかりません。OSの音声設定をご確認ください。
            </p>
          )}
        </div>

        {/* Rate slider */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            速度{" "}
            <span className="text-foreground-tertiary font-normal">({speechRate.toFixed(1)}x)</span>
          </label>
          <input
            type="range"
            min={0.5}
            max={2.0}
            step={0.1}
            value={speechRate}
            onChange={(e) => onSpeechRateChange(parseFloat(e.target.value))}
            className="w-full accent-accent"
          />
          <div className="flex justify-between text-xs text-foreground-tertiary mt-1">
            <span>0.5x（遅い）</span>
            <span>2.0x（速い）</span>
          </div>
        </div>

        {/* Pitch slider */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            ピッチ{" "}
            <span className="text-foreground-tertiary font-normal">({speechPitch.toFixed(1)})</span>
          </label>
          <input
            type="range"
            min={0.5}
            max={2.0}
            step={0.1}
            value={speechPitch}
            onChange={(e) => onSpeechPitchChange(parseFloat(e.target.value))}
            className="w-full accent-accent"
          />
          <div className="flex justify-between text-xs text-foreground-tertiary mt-1">
            <span>0.5（低い）</span>
            <span>2.0（高い）</span>
          </div>
        </div>

        {/* Volume slider */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            音量{" "}
            <span className="text-foreground-tertiary font-normal">
              ({Math.round(speechVolume * 100)}%)
            </span>
          </label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.1}
            value={speechVolume}
            onChange={(e) => onSpeechVolumeChange(parseFloat(e.target.value))}
            className="w-full accent-accent"
          />
          <div className="flex justify-between text-xs text-foreground-tertiary mt-1">
            <span>0%</span>
            <span>100%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
