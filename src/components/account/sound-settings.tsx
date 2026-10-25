"use client";

import { Button } from "@/components/ui/button";
import { IconVolume } from "@/components/ui/icons";
import { playCue, unlockAudio } from "@/lib/audio/cues";
import { setSoundEnabled, setVoiceEnabled, useSoundEnabled, useVoiceEnabled } from "@/lib/audio/settings";
import { cn } from "@/lib/cn";

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-4 py-3 text-left"
    >
      <span className="min-w-0 flex-1">
        <span className="block font-bold">{label}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-ash">{description}</span>
      </span>
      <span
        className={cn(
          "relative h-8 w-[52px] shrink-0 rounded-full transition-colors",
          checked ? "bg-plate-green" : "bg-line",
        )}
        aria-hidden="true"
      >
        <span
          className={cn(
            "absolute top-1 h-6 w-6 rounded-full bg-chalk transition-[left] duration-150",
            checked ? "left-[24px]" : "left-1",
          )}
        />
      </span>
    </button>
  );
}

/** 効果音・音声ガイドの設定（この端末に保存） */
export function SoundSettings() {
  const soundOn = useSoundEnabled();
  const voiceOn = useVoiceEnabled();

  return (
    <div>
      <div className="divide-y divide-line">
        <Toggle
          label="効果音"
          description="セット完了・休憩の残り10秒・休憩終了で音を鳴らします。"
          checked={soundOn}
          onChange={(value) => {
            setSoundEnabled(value);
            if (value) unlockAudio();
          }}
        />
        <Toggle
          label="音声ガイド（試験中）"
          description="休憩終了時に「次は○○、80キロ、8回です」と読み上げます。端末によっては読み上げられません。"
          checked={voiceOn}
          onChange={(value) => {
            setVoiceEnabled(value);
            if (value) unlockAudio();
          }}
        />
      </div>
      <div className="mt-3">
        <Button
          variant="secondary"
          block
          onClick={() => {
            unlockAudio();
            playCue({
              type: "rest_end",
              next: { exerciseName: "ベンチプレス", setNumber: 1, weightKg: 80, reps: 8 },
            });
          }}
        >
          <IconVolume size={18} />
          音を確認する
        </Button>
        <p className="mt-2 text-xs leading-relaxed text-ash">
          iPhone はマナーモード（消音）中だとブラウザの音が鳴らないことがあります。音が出ない場合は消音スイッチと音量を確認してください。
        </p>
      </div>
    </div>
  );
}
