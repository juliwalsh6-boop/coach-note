"use client";

import { useSyncExternalStore } from "react";

// 端末ごとの音の設定（localStorage に保存）

const SOUND_KEY = "coachnote.sound";
const VOICE_KEY = "coachnote.voice";

const listeners = new Set<() => void>();

function read(key: string, fallback: boolean): boolean {
  try {
    const value = window.localStorage.getItem(key);
    return value === null ? fallback : value === "on";
  } catch {
    return fallback;
  }
}

function write(key: string, value: boolean): void {
  try {
    window.localStorage.setItem(key, value ? "on" : "off");
  } catch {
    // プライベートモードなどで保存できなくても動作は続ける
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === SOUND_KEY || event.key === VOICE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** 効果音（初期値: ON） */
export function isSoundEnabled(): boolean {
  return read(SOUND_KEY, true);
}

export function setSoundEnabled(value: boolean): void {
  write(SOUND_KEY, value);
}

/** 音声ガイド（試験中の機能。初期値: OFF） */
export function isVoiceEnabled(): boolean {
  return read(VOICE_KEY, false);
}

export function setVoiceEnabled(value: boolean): void {
  write(VOICE_KEY, value);
}

export function useSoundEnabled(): boolean {
  return useSyncExternalStore(subscribe, isSoundEnabled, () => true);
}

export function useVoiceEnabled(): boolean {
  return useSyncExternalStore(subscribe, isVoiceEnabled, () => false);
}
