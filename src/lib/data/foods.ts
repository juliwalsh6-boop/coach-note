import { escapeLikePattern, searchTerms } from "@/lib/nutrition/search";
import type { FoodChannel } from "@/lib/nutrition/foods";
import type { FoodRow } from "@/types/app";
import type { DB } from "./db";

export type FoodSearchOptions = {
  query: string;
  channel?: FoodChannel | null;
  brandKey?: string | null;
  limit?: number;
};

/**
 * 食品・メニューの検索（名前・店名・カテゴリ。ひらがな/カタカナ・全角/半角の違いは無視）。
 * 販売終了の商品は出さない。確認済みのデータを先に並べる。
 */
export async function searchFoods(db: DB, options: FoodSearchOptions): Promise<FoodRow[]> {
  let query = db
    .from("foods")
    .select("*")
    .neq("availability", "discontinued")
    .neq("verification_status", "sample");
  for (const term of searchTerms(options.query)) {
    query = query.ilike("search_key", `%${escapeLikePattern(term)}%`);
  }
  if (options.channel) query = query.eq("channel", options.channel);
  if (options.brandKey) query = query.eq("brand_key", options.brandKey);
  const { data, error } = await query
    .order("verification_status", { ascending: false })
    .order("brand", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true })
    .limit(options.limit ?? 40);
  if (error) throw error;
  return data ?? [];
}

/** 提案に使う商品（販売中・サンプル以外） */
export async function listSuggestionFoods(
  db: DB,
  filter: { channel: FoodChannel; brandKey?: string | null; genre?: string | null },
): Promise<FoodRow[]> {
  let query = db
    .from("foods")
    .select("*")
    .eq("channel", filter.channel)
    .eq("availability", "active")
    .neq("verification_status", "sample");
  if (filter.brandKey) query = query.eq("brand_key", filter.brandKey);
  if (filter.genre) query = query.eq("genre", filter.genre);
  const { data, error } = await query.order("name").limit(400);
  if (error) throw error;
  return data ?? [];
}

export type BrandSummary = {
  brandKey: string;
  brand: string;
  channel: FoodChannel;
  genre: string | null;
  count: number;
  /** 確認日のうち最も新しいもの */
  latestVerifiedOn: string | null;
};

/** 商品データのあるお店・チェーンの一覧（選択画面用） */
export async function listBrands(db: DB): Promise<BrandSummary[]> {
  const { data, error } = await db
    .from("foods")
    .select("brand_key, brand, channel, genre, verified_on")
    .eq("availability", "active")
    .neq("verification_status", "sample")
    .not("brand_key", "is", null)
    .limit(2000);
  if (error) throw error;

  const map = new Map<string, BrandSummary>();
  for (const row of data ?? []) {
    if (!row.brand_key || (row.channel !== "convenience" && row.channel !== "restaurant")) continue;
    const current = map.get(row.brand_key);
    if (current) {
      current.count += 1;
      if (row.verified_on && (!current.latestVerifiedOn || row.verified_on > current.latestVerifiedOn)) {
        current.latestVerifiedOn = row.verified_on;
      }
    } else {
      map.set(row.brand_key, {
        brandKey: row.brand_key,
        brand: row.brand ?? row.brand_key,
        channel: row.channel,
        genre: row.genre,
        count: 1,
        latestVerifiedOn: row.verified_on,
      });
    }
  }
  return [...map.values()].sort((a, b) => a.brand.localeCompare(b.brand, "ja"));
}

export async function getFood(db: DB, foodId: string): Promise<FoodRow | null> {
  const { data, error } = await db.from("foods").select("*").eq("id", foodId).maybeSingle();
  if (error) throw error;
  return data;
}
