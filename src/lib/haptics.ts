"use client";

/**
 * 振動（触覚フィードバック）。
 * - Android など: Vibration API（navigator.vibrate）
 * - iPhone: Safari に振動の API がないため、スイッチ（<input type="checkbox" switch>）を
 *   切り替えたときの触覚フィードバックを利用する（iOS 17.4 以降の Safari。環境によっては動かない）
 * どちらにも対応していない端末では何もしない。
 */

let iosSwitchLabel: HTMLLabelElement | null = null;
const TICK_SPACING_MS = 45;

function canVibrate(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function iosTick(): void {
  try {
    if (!iosSwitchLabel || !iosSwitchLabel.isConnected) {
      const label = document.createElement("label");
      label.setAttribute("aria-hidden", "true");
      label.style.cssText =
        "position:fixed;left:-100px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.setAttribute("switch", "");
      input.tabIndex = -1;
      label.appendChild(input);
      document.body.appendChild(label);
      iosSwitchLabel = label;
    }
    iosSwitchLabel.click();
  } catch {
    // 触覚に対応していない環境
  }
}

/** pattern は [振動ms, 休みms, 振動ms, …]。iPhone では長い振動を細かい「コツコツ」に置き換える */
export function vibrate(pattern: number[]): void {
  if (pattern.length === 0) return;
  if (canVibrate()) {
    try {
      navigator.vibrate(pattern);
    } catch {
      // 非対応
    }
    return;
  }
  if (!isIOS()) return;
  let at = 0;
  pattern.forEach((ms, index) => {
    if (index % 2 === 0) {
      const ticks = Math.max(1, Math.round(ms / TICK_SPACING_MS));
      for (let k = 0; k < ticks; k++) {
        const delay = at + k * TICK_SPACING_MS;
        if (delay === 0) iosTick();
        else window.setTimeout(iosTick, delay);
      }
    }
    at += ms;
  });
}
