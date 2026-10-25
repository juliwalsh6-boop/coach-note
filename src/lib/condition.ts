// 朝のチェックインの項目定義と、コンディション表示の目安。
// ここでの判定は入力値を単純に集計しただけの目安で、医学的な判断ではありません。

export type MetricKey = "sleep" | "fatigue" | "soreness" | "stress" | "motivation";

export type MetricDirection = "higher_is_better" | "lower_is_better";

export type MetricDefinition = {
  key: MetricKey;
  label: string;
  /** 1 の意味 */
  lowLabel: string;
  /** 10 の意味 */
  highLabel: string;
  direction: MetricDirection;
};

export const METRICS: readonly MetricDefinition[] = [
  { key: "sleep", label: "睡眠", lowLabel: "非常に悪い", highLabel: "非常に良い", direction: "higher_is_better" },
  { key: "fatigue", label: "疲労度", lowLabel: "疲れていない", highLabel: "非常に疲れている", direction: "lower_is_better" },
  { key: "soreness", label: "筋肉痛", lowLabel: "ほぼない", highLabel: "非常に強い", direction: "lower_is_better" },
  { key: "stress", label: "ストレス", lowLabel: "非常に低い", highLabel: "非常に高い", direction: "lower_is_better" },
  { key: "motivation", label: "やる気", lowLabel: "全くない", highLabel: "非常に高い", direction: "higher_is_better" },
];

export type MetricValues = Record<MetricKey, number>;

export type ConditionStatus = "good" | "caution" | "recovery";

export const CONDITION_LABELS: Record<ConditionStatus | "none", string> = {
  good: "コンディション良好",
  caution: "注意",
  recovery: "疲労高め",
  none: "未入力",
};

export const CONDITION_SHORT_LABELS: Record<ConditionStatus | "none", string> = {
  good: "良好",
  caution: "注意",
  recovery: "疲労高め",
  none: "未入力",
};

/** 一覧の並び順（気にかけたい順） */
export const CONDITION_ORDER: Record<ConditionStatus | "none", number> = {
  recovery: 0,
  caution: 1,
  good: 2,
  none: 3,
};

export const CONDITION_RULE_TEXT =
  "5項目の平均と、疲労・筋肉痛などの高さから自動で表示している目安です。医学的な判断ではありません。";

/** 値を「良さ」に揃える（10 = 良い状態） */
export function goodness(direction: MetricDirection, value: number): number {
  return direction === "higher_is_better" ? value : 11 - value;
}

/** 5項目の「良さ」の平均（1〜10、小数1桁） */
export function conditionScore(values: MetricValues): number {
  const total = METRICS.reduce((sum, m) => sum + goodness(m.direction, values[m.key]), 0);
  return Math.round((total / METRICS.length) * 10) / 10;
}

export function evaluateCondition(values: MetricValues): ConditionStatus {
  const score = conditionScore(values);
  if (values.fatigue >= 8 || values.soreness >= 8 || score <= 4) {
    return "recovery";
  }
  if (
    score < 5.5 ||
    values.sleep <= 3 ||
    values.motivation <= 3 ||
    values.stress >= 8 ||
    values.fatigue >= 7 ||
    values.soreness >= 7
  ) {
    return "caution";
  }
  return "good";
}

export type MetricLevel = "good" | "fair" | "poor";

/** 個々の値の色分け用 */
export function metricLevel(direction: MetricDirection, value: number): MetricLevel {
  const g = goodness(direction, value);
  if (g >= 7) return "good";
  if (g >= 4) return "fair";
  return "poor";
}

/** DB の行などから MetricValues を取り出す（どれか欠けていれば null） */
export function toMetricValues(row: Partial<Record<MetricKey, number | null>>): MetricValues | null {
  const { sleep, fatigue, soreness, stress, motivation } = row;
  if (sleep == null || fatigue == null || soreness == null || stress == null || motivation == null) {
    return null;
  }
  return { sleep, fatigue, soreness, stress, motivation };
}
