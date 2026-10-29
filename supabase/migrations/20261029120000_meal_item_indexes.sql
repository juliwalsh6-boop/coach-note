-- =====================================================================
-- 食事管理: 外部キーの索引（Supabase の Performance Advisor の指摘への対応）
--
-- 写真や商品データを削除したときに、それを参照している食べもの（meal_items）を
-- すばやく探せるようにする（on delete set null の処理用）。既存のデータは変更しません。
-- =====================================================================

create index if not exists meal_items_photo_idx on public.meal_items (photo_id) where photo_id is not null;
create index if not exists meal_items_food_idx on public.meal_items (food_id) where food_id is not null;
