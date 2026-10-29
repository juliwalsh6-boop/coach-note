import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  computeItemNutrients,
  dayStatus,
  defaultTolerance,
  itemWeightG,
  nutrientStatus,
  nutrientStatuses,
  progressRatio,
  remainingNutrients,
  roundHalfAway,
  sumNutrients,
  type Nutrients,
} from "./nutrients";

const n = (energyKcal: number, proteinG: number, fatG: number, carbsG: number): Nutrients => ({
  energyKcal,
  proteinG,
  fatG,
  carbsG,
});

describe("roundHalfAway（DB の round と同じ丸め）", () => {
  test("0.5 は 0 から遠い方へ", () => {
    assert.equal(roundHalfAway(2.5, 0), 3);
    assert.equal(roundHalfAway(0.25, 1), 0.3);
    assert.equal(roundHalfAway(-2.5, 0), -3);
  });
  test("浮動小数点の誤差で境界がずれない", () => {
    // 1.15 * 10 = 11.499999999999998 になるが 1.2 に丸める
    assert.equal(roundHalfAway(1.15, 1), 1.2);
    assert.equal(roundHalfAway(1.005, 2), 1.01);
  });
});

describe("computeItemNutrients（1 品の換算）", () => {
  const rice = { unit: "g" as const, refAmount: 100, ref: n(156, 2.5, 0.3, 37.1) };

  test("100g あたりの値 × 180g（DB のテストと同じ値）", () => {
    assert.deepEqual(computeItemNutrients(rice, 180), n(281, 4.5, 0.5, 66.8));
  });
  test("量を変えると比例して変わる（150g）", () => {
    assert.deepEqual(computeItemNutrients(rice, 150), n(234, 3.8, 0.5, 55.7));
  });
  test("1 食分の値 × 2 個", () => {
    const onigiri = { unit: "serving" as const, refAmount: 1, ref: n(180, 4.5, 1.2, 38) };
    assert.deepEqual(computeItemNutrients(onigiri, 2), n(360, 9, 2.4, 76));
    assert.deepEqual(computeItemNutrients(onigiri, 0.5), n(90, 2.3, 0.6, 19));
  });
  test("AI の推定（150g あたり）を 200g に修正", () => {
    const karaage = { unit: "g" as const, refAmount: 150, ref: n(420, 25.2, 28.1, 12.4) };
    assert.deepEqual(computeItemNutrients(karaage, 200), n(560, 33.6, 37.5, 16.5));
  });
  test("割り切れる値は正確に（1.5 × 1 ÷ 3 = 0.5 → 1）", () => {
    const basis = { unit: "serving" as const, refAmount: 3, ref: n(1.5, 0.15, 0, 0) };
    assert.deepEqual(computeItemNutrients(basis, 1), n(1, 0.1, 0, 0));
  });
  test("量や基準量が 0 以下なら 0", () => {
    assert.deepEqual(computeItemNutrients(rice, 0), n(0, 0, 0, 0));
    assert.deepEqual(computeItemNutrients({ ...rice, refAmount: 0 }, 100), n(0, 0, 0, 0));
  });
});

describe("itemWeightG", () => {
  test("g ならそのまま、1食なら 1 食分の重量 × 数量", () => {
    assert.equal(itemWeightG("g", 180, null), 180);
    assert.equal(itemWeightG("serving", 2, 110), 220);
    assert.equal(itemWeightG("serving", 1, null), null);
  });
});

describe("sumNutrients（合計に丸め誤差を出さない）", () => {
  test("0.1 + 0.2 = 0.3", () => {
    assert.deepEqual(sumNutrients([n(1, 0.1, 0.1, 0.1), n(2, 0.2, 0.2, 0.2)]), n(3, 0.3, 0.3, 0.3));
  });
  test("多数の品を足しても小数第 1 位で正確", () => {
    const items = Array.from({ length: 10 }, () => n(33, 0.7, 1.1, 4.3));
    assert.deepEqual(sumNutrients(items), n(330, 7, 11, 43));
  });
  test("空なら 0", () => {
    assert.deepEqual(sumNutrients([]), n(0, 0, 0, 0));
  });
});

describe("remainingNutrients（残り = 目標 − 摂取量）", () => {
  test("マイナスは超過としてそのまま返す（0 にしない）", () => {
    const remaining = remainingNutrients(n(2000, 120, 60, 250), n(2150.4, 98.3, 72.6, 240));
    assert.deepEqual(remaining, n(-150, 21.7, -12.6, 10));
  });
});

describe("nutrientStatus / dayStatus（許容範囲での判定）", () => {
  test("目標 ± 許容範囲 なら範囲内（境界を含む）", () => {
    assert.equal(nutrientStatus(130, 120, 10), "within");
    assert.equal(nutrientStatus(110, 120, 10), "within");
    assert.equal(nutrientStatus(130.1, 120, 10), "over");
    assert.equal(nutrientStatus(109.9, 120, 10), "under");
  });
  test("許容範囲 0 は完全一致だけが範囲内", () => {
    assert.equal(nutrientStatus(60, 60, 0), "within");
    assert.equal(nutrientStatus(60.1, 60, 0), "over");
  });
  test("1 日の判定", () => {
    const target = n(2000, 120, 60, 250);
    const tol = n(100, 10, 5, 20);
    assert.equal(dayStatus(n(2050, 125, 58, 240), target, tol, 8), "achieved");
    assert.equal(dayStatus(n(2050, 125, 70, 240), target, tol, 8), "over");
    assert.equal(dayStatus(n(1500, 125, 58, 240), target, tol, 8), "under");
    assert.equal(dayStatus(n(0, 0, 0, 0), target, tol, 0), "no_record");
    assert.equal(dayStatus(n(100, 1, 1, 1), null, null, 1), "no_target");
  });
  test("栄養素ごとの判定", () => {
    const statuses = nutrientStatuses(n(2200, 100, 50, 260), n(2000, 120, 60, 250), n(100, 10, 5, 20));
    assert.deepEqual(statuses, { energyKcal: "over", proteinG: "under", fatG: "under", carbsG: "within" });
  });
});

describe("progressRatio / defaultTolerance", () => {
  test("割合", () => {
    assert.equal(progressRatio(50, 100), 0.5);
    assert.equal(progressRatio(0, 0), 0);
    assert.ok(progressRatio(10, 0) > 1);
  });
  test("初期の許容範囲は目標の ±10%", () => {
    assert.deepEqual(defaultTolerance(n(2200, 140, 60, 270)), n(220, 14, 6, 27));
    assert.deepEqual(defaultTolerance(n(1200, 20, 20, 40)), n(120, 3, 3, 5));
  });
});
