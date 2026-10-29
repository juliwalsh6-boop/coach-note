import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseAiEstimate } from "./ai-estimate";
import {
  initialTargetForm,
  macroEnergyCheck,
  parseTargetNumber,
  parsedTargetTexts,
  proteinPerKg,
  validateTargetForm,
  type TargetFormValues,
} from "./target-form";

const TODAY = "2026-10-29";

function form(overrides: Partial<TargetFormValues> = {}): TargetFormValues {
  return {
    effectiveFrom: TODAY,
    target: { energyKcal: "2200", proteinG: "140", fatG: "60", carbsG: "270" },
    tolerance: { energyKcal: "100", proteinG: "10", fatG: "5", carbsG: "20" },
    note: "",
    ...overrides,
  };
}

describe("validateTargetForm", () => {
  test("正しい入力は保存する値になる（カロリーは整数、PFC は小数第 1 位に丸める）", () => {
    const result = validateTargetForm(
      form({ target: { energyKcal: "2200.4", proteinG: "140.25", fatG: "６０", carbsG: "270" }, note: "  減量期  " }),
      TODAY,
    );
    assert.ok(result.ok);
    assert.deepEqual(result.target, { energyKcal: 2200, proteinG: 140.3, fatG: 60, carbsG: 270 });
    assert.deepEqual(result.tolerance, { energyKcal: 100, proteinG: 10, fatG: 5, carbsG: 20 });
    assert.equal(result.note, "減量期");
    assert.deepEqual(result.toleranceAuto, []);
  });

  test("許容範囲が空欄なら目標から自動で決める", () => {
    const result = validateTargetForm(form({ tolerance: { energyKcal: "", proteinG: "", fatG: "8", carbsG: "" } }), TODAY);
    assert.ok(result.ok);
    // ±10% 前後（カロリーは 10kcal 単位、下限あり）
    assert.deepEqual(result.tolerance, { energyKcal: 220, proteinG: 14, fatG: 8, carbsG: 27 });
    assert.deepEqual(result.toleranceAuto, ["energyKcal", "proteinG", "carbsG"]);
  });

  test("過去の日付・1 年より先の日付は選べない（過去の日の目標を書き換えない）", () => {
    const past = validateTargetForm(form({ effectiveFrom: "2026-10-28" }), TODAY);
    assert.equal(past.ok, false);
    assert.ok(!past.ok && past.errors.effectiveFrom);

    const far = validateTargetForm(form({ effectiveFrom: "2027-10-30" }), TODAY);
    assert.ok(!far.ok && far.errors.effectiveFrom);

    const lastDay = validateTargetForm(form({ effectiveFrom: "2027-10-29" }), TODAY);
    assert.ok(lastDay.ok);

    const invalid = validateTargetForm(form({ effectiveFrom: "2026-02-30" }), TODAY);
    assert.ok(!invalid.ok && invalid.errors.effectiveFrom);
  });

  test("空欄・範囲外・数字でない値はエラー", () => {
    const result = validateTargetForm(
      form({
        target: { energyKcal: "400", proteinG: "", fatG: "abc", carbsG: "1600" },
        tolerance: { energyKcal: "2500", proteinG: "-1", fatG: "5", carbsG: "20" },
        note: "あ".repeat(501),
      }),
      TODAY,
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.ok(result.errors["target.energyKcal"]);
    assert.equal(result.errors["target.proteinG"], "入力してください");
    assert.ok(result.errors["target.fatG"]);
    assert.ok(result.errors["target.carbsG"]);
    assert.ok(result.errors["tolerance.energyKcal"]);
    assert.ok(result.errors["tolerance.proteinG"]);
    assert.equal(result.errors["tolerance.fatG"], undefined);
    assert.ok(result.errors.note);
  });
});

describe("initialTargetForm", () => {
  test("いまの目標を引き継ぎ、適用開始日は今日", () => {
    const values = initialTargetForm(
      { target: { energyKcal: 2000, proteinG: 130.5, fatG: 55, carbsG: 240 }, tolerance: { energyKcal: 100, proteinG: 10, fatG: 5, carbsG: 20 } },
      TODAY,
    );
    assert.equal(values.effectiveFrom, TODAY);
    assert.deepEqual(values.target, { energyKcal: "2000", proteinG: "130.5", fatG: "55", carbsG: "240" });
    assert.deepEqual(values.tolerance, { energyKcal: "100", proteinG: "10", fatG: "5", carbsG: "20" });
  });

  test("目標が無ければ空欄", () => {
    const values = initialTargetForm(null, TODAY);
    assert.deepEqual(values.target, { energyKcal: "", proteinG: "", fatG: "", carbsG: "" });
  });
});

describe("macroEnergyCheck / parsedTargetTexts / proteinPerKg", () => {
  test("P・F・C から計算したカロリーとの差（大きいときだけ注意）", () => {
    // 140×4 + 60×9 + 270×4 = 2180
    assert.deepEqual(macroEnergyCheck({ energyKcal: 2200, proteinG: 140, fatG: 60, carbsG: 270 }), {
      macroKcal: 2180,
      diff: -20,
      mismatch: false,
    });
    const off = macroEnergyCheck({ energyKcal: 2500, proteinG: 140, fatG: 60, carbsG: 270 });
    assert.equal(off?.mismatch, true);
    assert.equal(off?.diff, -320);
    assert.equal(macroEnergyCheck({ energyKcal: 2200, proteinG: 140 }), null);
  });

  test("入力途中の文字列から数値だけ取り出す", () => {
    assert.deepEqual(parsedTargetTexts({ energyKcal: "2,200", proteinG: "１４０", fatG: "", carbsG: "x" }), {
      energyKcal: 2200,
      proteinG: 140,
    });
    assert.equal(parseTargetNumber("1,234.5"), 1234.5);
    assert.equal(parseTargetNumber("12.5"), 12.5);
    assert.equal(parseTargetNumber(""), null);
    // 3 桁区切りでないカンマは、食事の量の入力と同じく小数点として読む
    assert.equal(parseTargetNumber("12,5"), 12.5);
    assert.ok(Number.isNaN(parseTargetNumber("12a")));
  });

  test("体重あたりのたんぱく質", () => {
    assert.equal(proteinPerKg(140, 70), 2);
    assert.equal(proteinPerKg(130, 68.5), 1.9);
    assert.equal(proteinPerKg(130, null), null);
    assert.equal(proteinPerKg(undefined, 70), null);
  });
});

describe("parseAiEstimate", () => {
  test("保存された AI の推定値を読み取る", () => {
    assert.deepEqual(
      parseAiEstimate({
        name: " 唐揚げ ",
        estimated_weight_g: 150,
        energy_kcal: 420,
        protein_g: 24.5,
        fat_g: 28,
        carbs_g: 12,
        confidence: "medium",
      }),
      { name: "唐揚げ", weightG: 150, energyKcal: 420, proteinG: 24.5, fatG: 28, carbsG: 12, confidence: "medium" },
    );
  });

  test("形式が違うものは null（量・確度は無くてもよい）", () => {
    assert.equal(parseAiEstimate(null), null);
    assert.equal(parseAiEstimate([]), null);
    assert.equal(parseAiEstimate({ name: "x", energy_kcal: "420", protein_g: 1, fat_g: 1, carbs_g: 1 }), null);
    assert.deepEqual(parseAiEstimate({ name: "x", energy_kcal: 100, protein_g: 1, fat_g: 1, carbs_g: 1, confidence: "?" }), {
      name: "x",
      weightG: null,
      energyKcal: 100,
      proteinG: 1,
      fatG: 1,
      carbsG: 1,
      confidence: null,
    });
  });
});
