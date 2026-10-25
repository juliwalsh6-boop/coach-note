"use client";

import { FALLBACK_TONES, SOUND_FILES, type SoundId } from "./sounds";

type AudioContextConstructor = typeof AudioContext;

/**
 * Web Audio API で効果音を鳴らす。
 * iOS Safari は「ユーザーがタップした処理の中」で一度音を出さないと以後も鳴らないため、
 * ボタン操作のたびに unlock() を呼んでおく（2回目以降は何もしない）。
 */
class SoundEngine {
  private context: AudioContext | null = null;
  private buffers = new Map<SoundId, AudioBuffer>();
  private loadPromise: Promise<void> | null = null;
  private unlocked = false;

  private getContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (this.context) return this.context;
    const w = window as Window & { webkitAudioContext?: AudioContextConstructor };
    const Ctor: AudioContextConstructor | undefined = window.AudioContext ?? w.webkitAudioContext;
    if (!Ctor) return null;
    try {
      this.context = new Ctor();
    } catch {
      return null;
    }
    return this.context;
  }

  /** タップなどのユーザー操作の中で呼ぶ */
  unlock(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => undefined);
    }
    if (!this.unlocked) {
      // 無音を一瞬鳴らして再生を許可させる
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
      this.unlocked = true;
    }
    void this.preload();
  }

  /** 効果音ファイルを読み込んでおく（失敗した音は電子音で代用） */
  preload(): Promise<void> {
    const ctx = this.getContext();
    if (!ctx) return Promise.resolve();
    if (!this.loadPromise) {
      this.loadPromise = Promise.all(
        (Object.keys(SOUND_FILES) as SoundId[]).map(async (id) => {
          try {
            const response = await fetch(SOUND_FILES[id]);
            if (!response.ok) return;
            const data = await response.arrayBuffer();
            const buffer = await decode(ctx, data);
            this.buffers.set(id, buffer);
          } catch {
            // 読み込めなかった音は FALLBACK_TONES で鳴らす
          }
        }),
      ).then(() => undefined);
    }
    return this.loadPromise;
  }

  play(id: SoundId, volume = 0.9): void {
    const ctx = this.getContext();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => undefined);
    }
    const gain = ctx.createGain();
    gain.gain.value = volume;
    gain.connect(ctx.destination);

    const buffer = this.buffers.get(id);
    if (buffer) {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(gain);
      source.start();
      return;
    }
    this.playTones(ctx, gain, id);
  }

  private playTones(ctx: AudioContext, output: GainNode, id: SoundId): void {
    const start = ctx.currentTime + 0.01;
    for (const tone of FALLBACK_TONES[id]) {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = tone.freq;
      const t0 = start + tone.at;
      env.gain.setValueAtTime(0.0001, t0);
      env.gain.exponentialRampToValueAtTime(0.8, t0 + 0.01);
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + tone.duration);
      osc.connect(env);
      env.connect(output);
      osc.start(t0);
      osc.stop(t0 + tone.duration + 0.02);
    }
  }
}

function decode(ctx: AudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
  // 古い Safari はコールバック形式のみ対応
  return new Promise((resolve, reject) => {
    const result = ctx.decodeAudioData(data, resolve, reject);
    if (result && typeof result.then === "function") {
      result.then(resolve, reject);
    }
  });
}

export const soundEngine = new SoundEngine();
