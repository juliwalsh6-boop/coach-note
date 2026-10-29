import type { Metadata } from "next";
import { MealDayClient } from "@/components/meals/meal-day-client";
import { MealsSetupNotice } from "@/components/meals/meals-setup-notice";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/lib/auth";
import { getMealDay, getNutritionDays } from "@/lib/data/meals";
import { listMyTrainers } from "@/lib/data/profiles";
import { addDaysISO, currentHour, isValidISODate, todayISO } from "@/lib/dates";
import { isMissingSchemaError } from "@/lib/errors";
import { defaultMealType } from "@/lib/nutrition/meal-types";

export const metadata: Metadata = { title: "食事" };

/** 記録を見返せる期間（日）。DB の add_meal_items と合わせる */
const MAX_PAST_DAYS = 400;

export default async function ClientMealsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { date: rawDate } = await searchParams;
  const { supabase, userId } = await requireRole("client");
  const today = todayISO();
  const requested = typeof rawDate === "string" && isValidISODate(rawDate) ? rawDate : today;
  const date = requested > today || requested < addDaysISO(today, -MAX_PAST_DAYS) ? today : requested;

  let data;
  try {
    data = await Promise.all([
      getMealDay(supabase, userId, date),
      getNutritionDays(supabase, userId, addDaysISO(date, -6), date),
      listMyTrainers(supabase),
    ]);
  } catch (e) {
    // データベースの更新前（食事のテーブルが無い）なら、落とさずに案内だけ出す
    if (!isMissingSchemaError(e)) throw e;
    return (
      <>
        <PageHeader title="食事" />
        <MealsSetupNotice role="client" />
      </>
    );
  }
  const [meals, days, trainers] = data;

  return (
    <MealDayClient
      key={date}
      clientId={userId}
      date={date}
      today={today}
      currentMealType={defaultMealType(currentHour())}
      initialMeals={meals}
      initialDays={days}
      hasTrainer={trainers.length > 0}
      trainerLabel={trainers.length === 1 ? (trainers[0]?.display_name ?? "トレーナー") : "トレーナー"}
    />
  );
}
