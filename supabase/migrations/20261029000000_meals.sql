-- =====================================================================
-- 食事管理（PFC 目標・食事記録・食事写真・食事コメント・商品データ）
--
-- 既存のテーブル・関数は変更しません（追加のみ）。全体を 1 トランザクションで実行します。
--
--   nutrition_targets    トレーナーが決める 1 日の目標と許容範囲。適用開始日ごとに行を分けて履歴を残す
--                        （目標を変えても過去の日の目標・食事記録は書き換わらない）
--   foods                商品・メニューの栄養データ（出典・最終確認日・検証状態・販売状態つき）
--   meals                1 日 × 食事区分（朝食・昼食・夕食・間食）
--   meal_items           食べたもの。カロリー・PFC は
--                          基準量あたりの値 × 食べた量 ÷ 基準量
--                        を DB のトリガーで計算して保存する（画面から送られた合計値は使わない）
--   meal_photos          食事写真（非公開の Storage バケット meal-photos に保存。表示は署名付き URL）
--   meal_comments        食事へのコメント（トレーナー ⇄ クライアント）
--   meal_analysis_usage  AI 写真解析の利用回数（使いすぎ防止）
--
-- 丸め: 1 品ごとにカロリーは整数、PFC は小数第 1 位で保存し、食事・1 日の合計はその合計。
--       画面・集計関数のどちらで足しても同じ値になる。
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. 内部ヘルパー関数（private スキーマ・API 非公開）
-- ---------------------------------------------------------------------

-- 検索用キー: 全角/半角・大文字/小文字・ひらがな/カタカナの違いを吸収する
create or replace function private.normalize_search_text(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select translate(
    lower(btrim(regexp_replace(normalize(coalesce(p_text, ''), NFKC), '\s+', ' ', 'g'))),
    'ぁあぃいぅうぇえぉおかがきぎくぐけげこごさざしじすずせぜそぞただちぢっつづてでとどなにぬねのはばぱひびぴふぶぷへべぺほぼぽまみむめもゃやゅゆょよらりるれろゎわゐゑをんゔゕゖ',
    'ァアィイゥウェエォオカガキギクグケゲコゴサザシジスズセゼソゾタダチヂッツヅテデトドナニヌネノハバパヒビピフブプヘベペホボポマミムメモャヤュユョヨラリルレロヮワヰヱヲンヴヵヶ'
  );
$$;

create or replace function private.food_search_key(p_name text, p_brand text, p_category text)
returns text
language sql
immutable
set search_path = ''
as $$
  select private.normalize_search_text(
    coalesce(p_name, '') || ' ' || coalesce(p_brand, '') || ' ' || coalesce(p_category, '')
  );
$$;

-- 文字列を uuid に変換（不正な値は null。Storage のパスの判定用）
create or replace function private.try_uuid(p_value text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_value is null or p_value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  return p_value::uuid;
end;
$$;

-- AI の推定値（meal_items.ai_estimate）の形式チェック
create or replace function private.valid_ai_estimate(p_value jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_value is null then
    return true;
  end if;
  if jsonb_typeof(p_value) is distinct from 'object' or length(p_value::text) > 4000 then
    return false;
  end if;
  if coalesce(jsonb_typeof(p_value -> 'name'), '') <> 'string'
     or coalesce(jsonb_typeof(p_value -> 'energy_kcal'), '') <> 'number'
     or coalesce(jsonb_typeof(p_value -> 'protein_g'), '') <> 'number'
     or coalesce(jsonb_typeof(p_value -> 'fat_g'), '') <> 'number'
     or coalesce(jsonb_typeof(p_value -> 'carbs_g'), '') <> 'number'
     or coalesce(jsonb_typeof(p_value -> 'estimated_weight_g'), 'null') not in ('number', 'null') then
    return false;
  end if;
  return true;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. テーブル
-- ---------------------------------------------------------------------

-- 1 日の栄養目標（トレーナーがクライアントごとに設定）
--   ある日の目標 = その日以前で最も新しい effective_from の行
create table if not exists public.nutrition_targets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  trainer_id uuid references public.profiles (id) on delete set null, -- 設定したトレーナー
  effective_from date not null, -- 適用開始日（この日から次の目標の前日まで有効）
  energy_kcal integer not null check (energy_kcal between 500 and 10000),
  protein_g numeric(5, 1) not null check (protein_g between 0 and 1000),
  fat_g numeric(5, 1) not null check (fat_g between 0 and 1000),
  carbs_g numeric(5, 1) not null check (carbs_g between 0 and 1500),
  -- 許容範囲（目標 ± この値なら「目標範囲内」）
  energy_tolerance_kcal integer not null default 100 check (energy_tolerance_kcal between 0 and 2000),
  protein_tolerance_g numeric(5, 1) not null default 10 check (protein_tolerance_g between 0 and 500),
  fat_tolerance_g numeric(5, 1) not null default 5 check (fat_tolerance_g between 0 and 500),
  carbs_tolerance_g numeric(5, 1) not null default 20 check (carbs_tolerance_g between 0 and 500),
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, effective_from)
);
comment on table public.nutrition_targets is '1日の栄養目標と許容範囲。適用開始日ごとの履歴（過去の目標は書き換えない）';

-- 商品・メニューの栄養データ
create table if not exists public.foods (
  id uuid primary key default gen_random_uuid(),
  code text unique check (code ~ '^[a-z0-9_]+:[a-z0-9_-]+$'), -- 共有データの識別子（例: yoshinoya:gyudon-nami）。データ更新に使う
  owner_trainer_id uuid references public.profiles (id) on delete cascade, -- null = 全員が使える共有データ
  name text not null check (char_length(btrim(name)) between 1 and 80),
  brand_key text check (brand_key ~ '^[a-z0-9_]+$'), -- 店舗・チェーンのキー（seven_eleven, yoshinoya など）
  brand text check (char_length(brand) <= 40), -- 店舗・チェーン名（表示用）
  channel text not null check (channel in ('convenience', 'restaurant', 'grocery')), -- コンビニ / 外食 / 一般の食品
  genre text check (genre in ('gyudon', 'teishoku', 'sushi', 'family', 'fastfood', 'other')), -- 外食のジャンル
  category text check (char_length(category) <= 30), -- おにぎり / サラダ / 丼 など
  meal_role text not null check (meal_role in ('main', 'staple', 'protein', 'side', 'soup', 'drink', 'snack')), -- 組み合わせ提案での役割
  serving_label text not null default '1食' check (char_length(btrim(serving_label)) between 1 and 30),
  serving_weight_g numeric(6, 1) check (serving_weight_g > 0 and serving_weight_g < 10000), -- 1食分の重量（不明なら null）
  nutrient_basis text not null check (nutrient_basis in ('serving', 'per_100g')), -- 栄養値が「1食分あたり」か「100gあたり」か
  energy_kcal numeric(6, 1) not null check (energy_kcal between 0 and 9999),
  protein_g numeric(6, 1) not null check (protein_g between 0 and 999),
  fat_g numeric(6, 1) not null check (fat_g between 0 and 999),
  carbs_g numeric(6, 1) not null check (carbs_g between 0 and 999),
  price_yen integer check (price_yen between 0 and 100000), -- 価格（信頼できる情報があるときだけ）
  price_note text check (char_length(price_note) <= 100),
  source_type text not null check (source_type in ('official_web', 'package_label', 'standard_table', 'trainer', 'sample')),
  source_url text check (source_url ~ '^https://' and char_length(source_url) <= 500),
  source_note text check (char_length(source_note) <= 300),
  verified_on date, -- 栄養情報の最終確認日
  verification_status text not null default 'unverified'
    check (verification_status in ('verified', 'unverified', 'sample')),
  availability text not null default 'active'
    check (availability in ('active', 'discontinued', 'needs_review')), -- 販売中 / 販売終了 / 要確認
  search_key text generated always as (private.food_search_key(name, brand, category)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 100g あたりの値なら 1 食分の重量が必要（1 食分に換算するため）
  check (nutrient_basis <> 'per_100g' or serving_weight_g is not null),
  -- 確認済みと言えるのは、出典と確認日がある公式情報・表示・成分表だけ
  check (
    verification_status <> 'verified'
    or (
      verified_on is not null
      and source_type in ('official_web', 'package_label', 'standard_table')
      and (source_url is not null or source_type = 'package_label')
    )
  ),
  check (verification_status <> 'sample' or source_type = 'sample'),
  check (source_type <> 'sample' or verification_status = 'sample'),
  check (channel <> 'restaurant' or genre is not null)
);
create index if not exists foods_channel_brand_idx on public.foods (channel, brand_key);
create index if not exists foods_owner_idx on public.foods (owner_trainer_id);
comment on table public.foods is '商品・メニューの栄養データ。verification_status で確認済み / 未確認 / サンプルを区別する';

-- 食事（1 日 × 食事区分）
create table if not exists public.meals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  eaten_on date not null,
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, eaten_on, meal_type),
  unique (id, client_id)
);
create index if not exists meals_client_date_idx on public.meals (client_id, eaten_on desc);
comment on table public.meals is '食事（1日×食事区分）。写真・食べたもの・コメントがぶら下がる';

-- 食事写真（Storage: meal-photos/<client_id>/<uuid>.jpg）
create table if not exists public.meal_photos (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null,
  client_id uuid not null,
  storage_path text not null unique
    check (storage_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'),
  content_hash text check (content_hash ~ '^[0-9a-f]{64}$'), -- 元画像の SHA-256（同じ写真の二重登録の検出用）
  width integer check (width between 1 and 10000),
  height integer check (height between 1 and 10000),
  size_bytes integer check (size_bytes between 1 and 10485760),
  created_at timestamptz not null default now(),
  foreign key (meal_id, client_id) references public.meals (id, client_id) on delete cascade,
  check (split_part(storage_path, '/', 1) = client_id::text) -- 自分のフォルダの写真だけ
);
create index if not exists meal_photos_meal_idx on public.meal_photos (meal_id);
create index if not exists meal_photos_hash_idx on public.meal_photos (client_id, content_hash);

-- 食べたもの
create table if not exists public.meal_items (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null,
  client_id uuid not null,
  position integer not null default 0,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  brand text check (char_length(brand) <= 40),
  origin text not null check (origin in ('manual', 'food', 'ai_photo', 'reuse')), -- 手入力 / 商品データ / AI 写真解析 / 過去の食事から
  food_id uuid references public.foods (id) on delete set null,
  photo_id uuid references public.meal_photos (id) on delete set null,
  -- 換算の基準: 「ref_amount（unit）あたり ref_* 」。食べた量は amount（同じ unit）
  unit text not null check (unit in ('g', 'serving')),
  ref_amount numeric(8, 2) not null check (ref_amount > 0 and ref_amount <= 5000),
  ref_energy_kcal numeric(7, 2) not null check (ref_energy_kcal between 0 and 10000),
  ref_protein_g numeric(7, 2) not null check (ref_protein_g between 0 and 1000),
  ref_fat_g numeric(7, 2) not null check (ref_fat_g between 0 and 1000),
  ref_carbs_g numeric(7, 2) not null check (ref_carbs_g between 0 and 1000),
  amount numeric(8, 2) not null check (amount > 0 and amount <= 5000),
  serving_label text check (char_length(serving_label) <= 30), -- 「1個」「並盛」など（unit = serving のとき）
  serving_weight_g numeric(7, 1) check (serving_weight_g > 0 and serving_weight_g < 10000),
  -- ここから下はトリガーで計算（画面から送られた値は使わない）
  weight_g numeric(8, 1),
  energy_kcal numeric(6, 0) not null default 0,
  protein_g numeric(6, 1) not null default 0,
  fat_g numeric(6, 1) not null default 0,
  carbs_g numeric(6, 1) not null default 0,
  -- AI の推定値（解析時のまま。あとから変更できない）と、ユーザーが修正したかどうか
  ai_estimate jsonb check (private.valid_ai_estimate(ai_estimate)),
  ai_adjusted boolean not null default false,
  request_id uuid, -- 二重送信の防止用
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (meal_id, client_id) references public.meals (id, client_id) on delete cascade,
  check (unit <> 'serving' or amount <= 50),
  check (origin = 'ai_photo' or ai_estimate is null)
);
create index if not exists meal_items_meal_idx on public.meal_items (meal_id, position);
create index if not exists meal_items_client_recent_idx on public.meal_items (client_id, created_at desc);
create unique index if not exists meal_items_request_idx on public.meal_items (client_id, request_id, position)
  where request_id is not null;
comment on table public.meal_items is '食べたもの。栄養値は ref_* × amount ÷ ref_amount をトリガーで計算（kcal は整数、PFC は小数第1位）';

-- 食事へのコメント（トレーナー ⇄ クライアント）
create table if not exists public.meal_comments (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null,
  client_id uuid not null,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  read_at timestamptz, -- 相手が読んだ時刻
  created_at timestamptz not null default now(),
  foreign key (meal_id, client_id) references public.meals (id, client_id) on delete cascade
);
create index if not exists meal_comments_meal_idx on public.meal_comments (meal_id, created_at);
create index if not exists meal_comments_client_idx on public.meal_comments (client_id, created_at desc);

-- AI 写真解析の利用記録（回数制限のためだけに使う）
create table if not exists public.meal_analysis_usage (
  id bigint generated always as identity primary key,
  client_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists meal_analysis_usage_client_idx on public.meal_analysis_usage (client_id, created_at desc);

-- 作成直後に RLS を有効化
alter table public.nutrition_targets enable row level security;
alter table public.foods enable row level security;
alter table public.meals enable row level security;
alter table public.meal_photos enable row level security;
alter table public.meal_items enable row level security;
alter table public.meal_comments enable row level security;
alter table public.meal_analysis_usage enable row level security;

-- ---------------------------------------------------------------------
-- 3. トリガー
-- ---------------------------------------------------------------------

-- 食べたものの栄養値を計算する（追加・変更のたびに必ず再計算）
create or replace function private.compute_meal_item()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_factor numeric;
  v_ai jsonb;
begin
  if tg_op = 'UPDATE' then
    -- AI の推定値・入力元・持ち主・二重送信防止キーは後から変えられない
    new.ai_estimate := old.ai_estimate;
    new.origin := old.origin;
    new.client_id := old.client_id;
    new.meal_id := old.meal_id;
    new.request_id := old.request_id;
  end if;

  new.name := btrim(new.name);
  new.brand := nullif(btrim(coalesce(new.brand, '')), '');

  if new.ref_amount is null or new.amount is null or new.ref_amount <= 0 or new.amount <= 0 then
    raise exception using errcode = '23514', message = 'invalid_meal_item';
  end if;
  v_factor := new.amount / new.ref_amount;
  if v_factor > 100 then
    raise exception using errcode = '22023', message = 'meal_item_out_of_range';
  end if;

  -- 先に掛けてから割る（1.5 × 1 ÷ 3 = 0.5 のように、割り切れる値は正確に計算される）
  new.energy_kcal := round(new.ref_energy_kcal * new.amount / new.ref_amount, 0);
  new.protein_g := round(new.ref_protein_g * new.amount / new.ref_amount, 1);
  new.fat_g := round(new.ref_fat_g * new.amount / new.ref_amount, 1);
  new.carbs_g := round(new.ref_carbs_g * new.amount / new.ref_amount, 1);
  new.weight_g := case
    when new.unit = 'g' then round(new.amount, 1)
    when new.serving_weight_g is not null then round(new.amount * new.serving_weight_g, 1)
    else null
  end;
  if new.energy_kcal > 20000 or new.protein_g > 2000 or new.fat_g > 2000 or new.carbs_g > 2000 then
    raise exception using errcode = '22023', message = 'meal_item_out_of_range';
  end if;

  -- AI の推定から変えたか（名前・量・栄養値のどれかが違えば「修正あり」）
  v_ai := new.ai_estimate;
  new.ai_adjusted := v_ai is not null and (
    new.name is distinct from btrim(v_ai ->> 'name')
    or new.energy_kcal is distinct from round((v_ai ->> 'energy_kcal')::numeric, 0)
    or new.protein_g is distinct from round((v_ai ->> 'protein_g')::numeric, 1)
    or new.fat_g is distinct from round((v_ai ->> 'fat_g')::numeric, 1)
    or new.carbs_g is distinct from round((v_ai ->> 'carbs_g')::numeric, 1)
    or (
      jsonb_typeof(v_ai -> 'estimated_weight_g') = 'number'
      and new.weight_g is distinct from round((v_ai ->> 'estimated_weight_g')::numeric, 1)
    )
  );
  return new;
end;
$$;

drop trigger if exists compute_meal_item on public.meal_items;
create trigger compute_meal_item before insert or update on public.meal_items
  for each row execute function private.compute_meal_item();

drop trigger if exists set_updated_at on public.nutrition_targets;
create trigger set_updated_at before update on public.nutrition_targets
  for each row execute function private.set_updated_at();

drop trigger if exists set_updated_at on public.foods;
create trigger set_updated_at before update on public.foods
  for each row execute function private.set_updated_at();

drop trigger if exists set_updated_at on public.meals;
create trigger set_updated_at before update on public.meals
  for each row execute function private.set_updated_at();

drop trigger if exists set_updated_at on public.meal_items;
create trigger set_updated_at before update on public.meal_items
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------
-- 4. Row Level Security
-- ---------------------------------------------------------------------

-- nutrition_targets: 本人と担当トレーナーが閲覧。設定は担当トレーナーだけ。
--   過去の目標は書き換えられない（今日以降の行だけ追加・変更できる。UTC と日本時間の差を見込んで 1 日の余裕）
drop policy if exists "nutrition_targets_select" on public.nutrition_targets;
create policy "nutrition_targets_select" on public.nutrition_targets
  for select to authenticated
  using (client_id = (select auth.uid()) or private.is_trainer_of(client_id));

drop policy if exists "nutrition_targets_insert" on public.nutrition_targets;
create policy "nutrition_targets_insert" on public.nutrition_targets
  for insert to authenticated
  with check (
    trainer_id = (select auth.uid())
    and private.is_trainer_of(client_id)
    and effective_from >= current_date - 1
  );

drop policy if exists "nutrition_targets_update" on public.nutrition_targets;
create policy "nutrition_targets_update" on public.nutrition_targets
  for update to authenticated
  using (private.is_trainer_of(client_id) and effective_from >= current_date - 1)
  with check (
    trainer_id = (select auth.uid())
    and private.is_trainer_of(client_id)
    and effective_from >= current_date - 1
  );

drop policy if exists "nutrition_targets_delete" on public.nutrition_targets;
create policy "nutrition_targets_delete" on public.nutrition_targets
  for delete to authenticated
  using (private.is_trainer_of(client_id) and effective_from > current_date);

-- foods: 共有データは全員が閲覧。トレーナーが登録した食品は本人と担当クライアントが閲覧、編集は本人だけ
drop policy if exists "foods_select" on public.foods;
create policy "foods_select" on public.foods
  for select to authenticated
  using (
    owner_trainer_id is null
    or owner_trainer_id = (select auth.uid())
    or private.is_client_of(owner_trainer_id)
  );

drop policy if exists "foods_insert" on public.foods;
create policy "foods_insert" on public.foods
  for insert to authenticated
  with check (owner_trainer_id = (select auth.uid()) and private.current_app_role() = 'trainer');

drop policy if exists "foods_update" on public.foods;
create policy "foods_update" on public.foods
  for update to authenticated
  using (owner_trainer_id = (select auth.uid()))
  with check (owner_trainer_id = (select auth.uid()) and private.current_app_role() = 'trainer');

drop policy if exists "foods_delete" on public.foods;
create policy "foods_delete" on public.foods
  for delete to authenticated
  using (owner_trainer_id = (select auth.uid()));

-- meals: 本人は記録、担当トレーナーは閲覧のみ
drop policy if exists "meals_select" on public.meals;
create policy "meals_select" on public.meals
  for select to authenticated
  using (client_id = (select auth.uid()) or private.is_trainer_of(client_id));

drop policy if exists "meals_insert_self" on public.meals;
create policy "meals_insert_self" on public.meals
  for insert to authenticated
  with check (client_id = (select auth.uid()) and private.current_app_role() = 'client');

drop policy if exists "meals_update_self" on public.meals;
create policy "meals_update_self" on public.meals
  for update to authenticated
  using (client_id = (select auth.uid()))
  with check (client_id = (select auth.uid()));

-- meal_photos: 本人は追加・削除、担当トレーナーは閲覧のみ
drop policy if exists "meal_photos_select" on public.meal_photos;
create policy "meal_photos_select" on public.meal_photos
  for select to authenticated
  using (client_id = (select auth.uid()) or private.is_trainer_of(client_id));

drop policy if exists "meal_photos_insert_self" on public.meal_photos;
create policy "meal_photos_insert_self" on public.meal_photos
  for insert to authenticated
  with check (client_id = (select auth.uid()) and private.current_app_role() = 'client');

drop policy if exists "meal_photos_delete_self" on public.meal_photos;
create policy "meal_photos_delete_self" on public.meal_photos
  for delete to authenticated
  using (client_id = (select auth.uid()));

-- meal_items: 本人は追加・変更・削除、担当トレーナーは閲覧のみ
drop policy if exists "meal_items_select" on public.meal_items;
create policy "meal_items_select" on public.meal_items
  for select to authenticated
  using (client_id = (select auth.uid()) or private.is_trainer_of(client_id));

drop policy if exists "meal_items_insert_self" on public.meal_items;
create policy "meal_items_insert_self" on public.meal_items
  for insert to authenticated
  with check (client_id = (select auth.uid()) and private.current_app_role() = 'client');

drop policy if exists "meal_items_update_self" on public.meal_items;
create policy "meal_items_update_self" on public.meal_items
  for update to authenticated
  using (client_id = (select auth.uid()))
  with check (client_id = (select auth.uid()));

drop policy if exists "meal_items_delete_self" on public.meal_items;
create policy "meal_items_delete_self" on public.meal_items
  for delete to authenticated
  using (client_id = (select auth.uid()));

-- meal_comments: 本人と担当トレーナーが閲覧・投稿。削除は書いた人だけ
drop policy if exists "meal_comments_select" on public.meal_comments;
create policy "meal_comments_select" on public.meal_comments
  for select to authenticated
  using (client_id = (select auth.uid()) or private.is_trainer_of(client_id));

drop policy if exists "meal_comments_insert" on public.meal_comments;
create policy "meal_comments_insert" on public.meal_comments
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (
      (client_id = (select auth.uid()) and private.current_app_role() = 'client')
      or private.is_trainer_of(client_id)
    )
  );

drop policy if exists "meal_comments_delete_own" on public.meal_comments;
create policy "meal_comments_delete_own" on public.meal_comments
  for delete to authenticated
  using (author_id = (select auth.uid()));

-- meal_analysis_usage: ポリシーなし（consume_meal_analysis_quota 関数からのみ書き込む）

-- ---------------------------------------------------------------------
-- 5. Storage（食事写真）: 非公開バケット。パスの 1 階層目がクライアントの id
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('meal-photos', 'meal-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "meal_photos_objects_insert" on storage.objects;
create policy "meal_photos_objects_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'meal-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and private.current_app_role() = 'client'
  );

drop policy if exists "meal_photos_objects_select" on storage.objects;
create policy "meal_photos_objects_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'meal-photos'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or private.is_trainer_of(private.try_uuid((storage.foldername(name))[1]))
    )
  );

drop policy if exists "meal_photos_objects_delete" on storage.objects;
create policy "meal_photos_objects_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'meal-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ---------------------------------------------------------------------
-- 6. RPC 関数
-- ---------------------------------------------------------------------

-- トレーナーが目標を設定する（同じ適用開始日の行があれば更新。過去の行は RLS で変更不可）
create or replace function public.save_nutrition_target(
  p_client_id uuid,
  p_effective_from date,
  p_energy_kcal integer,
  p_protein_g numeric,
  p_fat_g numeric,
  p_carbs_g numeric,
  p_energy_tolerance_kcal integer,
  p_protein_tolerance_g numeric,
  p_fat_tolerance_g numeric,
  p_carbs_tolerance_g numeric,
  p_note text default null
)
returns public.nutrition_targets
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.nutrition_targets;
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'not_authenticated';
  end if;
  if not private.is_trainer_of(p_client_id) then
    raise exception using errcode = 'P0002', message = 'client_not_found';
  end if;
  if p_effective_from is null or p_effective_from < current_date - 1 or p_effective_from > current_date + 366 then
    raise exception using errcode = '22023', message = 'invalid_target_date';
  end if;

  insert into public.nutrition_targets (
    client_id, trainer_id, effective_from,
    energy_kcal, protein_g, fat_g, carbs_g,
    energy_tolerance_kcal, protein_tolerance_g, fat_tolerance_g, carbs_tolerance_g,
    note
  ) values (
    p_client_id, v_uid, p_effective_from,
    p_energy_kcal, round(p_protein_g, 1), round(p_fat_g, 1), round(p_carbs_g, 1),
    p_energy_tolerance_kcal, round(p_protein_tolerance_g, 1), round(p_fat_tolerance_g, 1), round(p_carbs_tolerance_g, 1),
    nullif(btrim(coalesce(p_note, '')), '')
  )
  on conflict (client_id, effective_from) do update
    set trainer_id = excluded.trainer_id,
        energy_kcal = excluded.energy_kcal,
        protein_g = excluded.protein_g,
        fat_g = excluded.fat_g,
        carbs_g = excluded.carbs_g,
        energy_tolerance_kcal = excluded.energy_tolerance_kcal,
        protein_tolerance_g = excluded.protein_tolerance_g,
        fat_tolerance_g = excluded.fat_tolerance_g,
        carbs_tolerance_g = excluded.carbs_tolerance_g,
        note = excluded.note
  returning * into v_row;

  return v_row;
end;
$$;

-- 食べたものを追加する（食事が無ければ作る。写真の登録も同じトランザクションで行う）
--   p_items: [{ name, brand?, origin, food_id?, from_photo?, unit, ref_amount, ref_energy_kcal, ref_protein_g,
--               ref_fat_g, ref_carbs_g, amount, serving_label?, serving_weight_g?, ai_estimate? }, ...]
--   p_photo: { storage_path, content_hash?, width?, height?, size_bytes? } または null
--   p_request_id: 同じ値で 2 回呼ばれたら、2 回目は何もせず同じ食事の id を返す（二重送信の防止）
create or replace function public.add_meal_items(
  p_date date,
  p_meal_type text,
  p_items jsonb,
  p_photo jsonb default null,
  p_request_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_meal_id uuid;
  v_photo_id uuid;
  v_path text;
  v_count integer;
  v_pos integer;
  v_item jsonb;
  v_ord integer;
  v_food_id uuid;
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'not_authenticated';
  end if;
  if private.current_app_role() is distinct from 'client' then
    raise exception using errcode = 'P0001', message = 'client_only';
  end if;
  if p_date is null or p_date < current_date - 400 or p_date > current_date + 1 then
    raise exception using errcode = '22023', message = 'invalid_date';
  end if;
  if p_meal_type is null or p_meal_type not in ('breakfast', 'lunch', 'dinner', 'snack') then
    raise exception using errcode = '22023', message = 'invalid_meal_type';
  end if;
  if p_items is null or jsonb_typeof(p_items) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'invalid_meal_item';
  end if;
  v_count := jsonb_array_length(p_items);
  if v_count = 0 and p_photo is null then
    raise exception using errcode = '22023', message = 'meal_items_required';
  end if;
  if v_count > 30 then
    raise exception using errcode = '22023', message = 'too_many_meal_items';
  end if;

  -- 二重送信: 同じリクエストで追加済みなら何もしない
  if p_request_id is not null then
    select mi.meal_id into v_meal_id
      from public.meal_items mi
     where mi.client_id = v_uid and mi.request_id = p_request_id
     limit 1;
    if v_meal_id is not null then
      return v_meal_id;
    end if;
  end if;

  insert into public.meals (client_id, eaten_on, meal_type)
  values (v_uid, p_date, p_meal_type)
  on conflict (client_id, eaten_on, meal_type) do nothing
  returning id into v_meal_id;
  if v_meal_id is null then
    select id into v_meal_id
      from public.meals
     where client_id = v_uid and eaten_on = p_date and meal_type = p_meal_type;
  end if;

  if p_photo is not null then
    if jsonb_typeof(p_photo) is distinct from 'object' or coalesce(jsonb_typeof(p_photo -> 'storage_path'), '') <> 'string' then
      raise exception using errcode = '22023', message = 'invalid_photo';
    end if;
    v_path := p_photo ->> 'storage_path';
    if split_part(v_path, '/', 1) <> v_uid::text then
      raise exception using errcode = '22023', message = 'invalid_photo';
    end if;

    select id into v_photo_id from public.meal_photos where storage_path = v_path;
    if v_photo_id is null then
      begin
        insert into public.meal_photos (meal_id, client_id, storage_path, content_hash, width, height, size_bytes)
        values (
          v_meal_id,
          v_uid,
          v_path,
          nullif(p_photo ->> 'content_hash', ''),
          (p_photo ->> 'width')::integer,
          (p_photo ->> 'height')::integer,
          (p_photo ->> 'size_bytes')::integer
        )
        returning id into v_photo_id;
      exception
        when check_violation or invalid_text_representation or numeric_value_out_of_range then
          raise exception using errcode = '22023', message = 'invalid_photo';
      end;
    end if;
  end if;

  select coalesce(max(position), 0) into v_pos from public.meal_items where meal_id = v_meal_id;

  for v_item, v_ord in select e.value, e.ordinality from jsonb_array_elements(p_items) with ordinality as e (value, ordinality) loop
    if jsonb_typeof(v_item) is distinct from 'object'
       or coalesce(jsonb_typeof(v_item -> 'name'), '') <> 'string'
       or coalesce(jsonb_typeof(v_item -> 'unit'), '') <> 'string'
       or coalesce(jsonb_typeof(v_item -> 'ref_amount'), '') <> 'number'
       or coalesce(jsonb_typeof(v_item -> 'amount'), '') <> 'number'
       or coalesce(jsonb_typeof(v_item -> 'ref_energy_kcal'), '') <> 'number'
       or coalesce(jsonb_typeof(v_item -> 'ref_protein_g'), '') <> 'number'
       or coalesce(jsonb_typeof(v_item -> 'ref_fat_g'), '') <> 'number'
       or coalesce(jsonb_typeof(v_item -> 'ref_carbs_g'), '') <> 'number' then
      raise exception using errcode = '22023', message = 'invalid_meal_item';
    end if;

    -- 見えない（存在しない）商品 id は付けない
    v_food_id := private.try_uuid(v_item ->> 'food_id');
    if v_food_id is not null and not exists (select 1 from public.foods f where f.id = v_food_id) then
      v_food_id := null;
    end if;

    begin
      insert into public.meal_items (
        meal_id, client_id, position, name, brand, origin, food_id, photo_id,
        unit, ref_amount, ref_energy_kcal, ref_protein_g, ref_fat_g, ref_carbs_g,
        amount, serving_label, serving_weight_g, ai_estimate, request_id
      ) values (
        v_meal_id,
        v_uid,
        v_pos + v_ord,
        v_item ->> 'name',
        nullif(btrim(coalesce(v_item ->> 'brand', '')), ''),
        coalesce(v_item ->> 'origin', 'manual'),
        v_food_id,
        case when (v_item ->> 'from_photo') = 'true' then v_photo_id else null end,
        v_item ->> 'unit',
        (v_item ->> 'ref_amount')::numeric,
        (v_item ->> 'ref_energy_kcal')::numeric,
        (v_item ->> 'ref_protein_g')::numeric,
        (v_item ->> 'ref_fat_g')::numeric,
        (v_item ->> 'ref_carbs_g')::numeric,
        (v_item ->> 'amount')::numeric,
        nullif(btrim(coalesce(v_item ->> 'serving_label', '')), ''),
        nullif(v_item ->> 'serving_weight_g', '')::numeric,
        case when jsonb_typeof(v_item -> 'ai_estimate') = 'object' then v_item -> 'ai_estimate' else null end,
        p_request_id
      );
    exception
      when check_violation or not_null_violation or invalid_text_representation or numeric_value_out_of_range then
        raise exception using errcode = '22023', message = 'invalid_meal_item';
    end;
  end loop;

  return v_meal_id;
end;
$$;

-- 過去の食事を、指定した日・食事区分にコピーする（自分の食事だけ。写真・AI の推定値はコピーしない）
create or replace function public.copy_meal(
  p_source_meal_id uuid,
  p_date date,
  p_meal_type text,
  p_request_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_items jsonb;
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'not_authenticated';
  end if;
  if not exists (select 1 from public.meals m where m.id = p_source_meal_id and m.client_id = v_uid) then
    raise exception using errcode = 'P0002', message = 'meal_not_found';
  end if;

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'name', mi.name,
             'brand', mi.brand,
             'origin', 'reuse',
             'food_id', mi.food_id,
             'unit', mi.unit,
             'ref_amount', mi.ref_amount,
             'ref_energy_kcal', mi.ref_energy_kcal,
             'ref_protein_g', mi.ref_protein_g,
             'ref_fat_g', mi.ref_fat_g,
             'ref_carbs_g', mi.ref_carbs_g,
             'amount', mi.amount,
             'serving_label', mi.serving_label,
             'serving_weight_g', mi.serving_weight_g
           ) order by mi.position
         ), '[]'::jsonb)
    into v_items
    from public.meal_items mi
   where mi.meal_id = p_source_meal_id;

  if jsonb_array_length(v_items) = 0 then
    raise exception using errcode = '22023', message = 'meal_items_required';
  end if;

  return public.add_meal_items(p_date, p_meal_type, v_items, null, p_request_id);
end;
$$;

-- 表示した食事のコメントを既読にする（自分が受け取った側のコメントだけ）
create or replace function public.mark_meal_comments_read(p_meal_ids uuid[])
returns integer
language sql
security definer
set search_path = ''
as $$
  with updated as (
    update public.meal_comments mc
       set read_at = now()
     where mc.meal_id = any (coalesce(p_meal_ids, '{}'))
       and mc.read_at is null
       and mc.author_id <> auth.uid()
       and (
         -- クライアント本人: トレーナーからのコメント
         mc.client_id = auth.uid()
         -- 担当トレーナー: クライアントからのコメント
         or (mc.author_id = mc.client_id and private.is_trainer_of(mc.client_id))
       )
    returning 1
  )
  select count(*)::integer from updated;
$$;

-- AI 写真解析の回数制限（24 時間で 40 回まで）。使える場合は記録して残り回数を返す
create or replace function public.consume_meal_analysis_quota()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_limit constant integer := 40;
  v_used integer;
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'not_authenticated';
  end if;
  if private.current_app_role() is distinct from 'client' then
    raise exception using errcode = 'P0001', message = 'client_only';
  end if;

  -- 同じ人の同時実行で上限を超えないよう、本人のプロフィール行をロックしてから数える
  perform 1 from public.profiles where id = v_uid for update;

  select count(*) into v_used
    from public.meal_analysis_usage
   where client_id = v_uid and created_at > now() - interval '24 hours';
  if v_used >= v_limit then
    raise exception using errcode = 'P0001', message = 'analysis_quota_exceeded';
  end if;

  insert into public.meal_analysis_usage (client_id) values (v_uid);
  return v_limit - v_used - 1;
end;
$$;

-- 日ごとの目標と摂取量（保存された記録から集計。最大 93 日分）
create or replace function public.get_nutrition_days(p_client_id uuid, p_from date, p_to date)
returns table (
  day date,
  target_id uuid,
  target_effective_from date,
  target_energy_kcal integer,
  target_protein_g numeric,
  target_fat_g numeric,
  target_carbs_g numeric,
  energy_tolerance_kcal integer,
  protein_tolerance_g numeric,
  fat_tolerance_g numeric,
  carbs_tolerance_g numeric,
  energy_kcal numeric,
  protein_g numeric,
  fat_g numeric,
  carbs_g numeric,
  item_count integer,
  meal_count integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  with days as (
    select g.d::date as day
      from generate_series(p_from::timestamp, least(p_to, p_from + 92)::timestamp, interval '1 day') as g (d)
     where p_from is not null
       and p_to is not null
       and p_from <= p_to
       and (p_client_id = (select auth.uid()) or private.is_trainer_of(p_client_id))
  ),
  totals as (
    select m.eaten_on,
           sum(mi.energy_kcal) as energy_kcal,
           sum(mi.protein_g) as protein_g,
           sum(mi.fat_g) as fat_g,
           sum(mi.carbs_g) as carbs_g,
           count(*)::integer as item_count,
           count(distinct m.id)::integer as meal_count
      from public.meals m
      join public.meal_items mi on mi.meal_id = m.id
     where m.client_id = p_client_id
       and m.eaten_on between p_from and least(p_to, p_from + 92)
     group by m.eaten_on
  )
  select
    d.day,
    t.id,
    t.effective_from,
    t.energy_kcal,
    t.protein_g,
    t.fat_g,
    t.carbs_g,
    t.energy_tolerance_kcal,
    t.protein_tolerance_g,
    t.fat_tolerance_g,
    t.carbs_tolerance_g,
    coalesce(x.energy_kcal, 0),
    coalesce(x.protein_g, 0),
    coalesce(x.fat_g, 0),
    coalesce(x.carbs_g, 0),
    coalesce(x.item_count, 0),
    coalesce(x.meal_count, 0)
  from days d
  left join totals x on x.eaten_on = d.day
  left join lateral (
    select nt.*
      from public.nutrition_targets nt
     where nt.client_id = p_client_id
       and nt.effective_from <= d.day
     order by nt.effective_from desc
     limit 1
  ) t on true
  order by d.day;
$$;

-- トレーナーの「食事」一覧: 担当クライアントごとの目標・指定日の摂取量・最終記録・未読 / 未返信のコメント・体重
create or replace function public.get_trainer_nutrition_overview(p_date date)
returns table (
  client_id uuid,
  display_name text,
  target_energy_kcal integer,
  target_protein_g numeric,
  target_fat_g numeric,
  target_carbs_g numeric,
  energy_tolerance_kcal integer,
  protein_tolerance_g numeric,
  fat_tolerance_g numeric,
  carbs_tolerance_g numeric,
  energy_kcal numeric,
  protein_g numeric,
  fat_g numeric,
  carbs_g numeric,
  item_count integer,
  meal_count integer,
  photo_count integer,
  last_logged_at timestamptz,
  unread_comment_count integer,
  awaiting_reply_count integer,
  latest_weight_kg numeric,
  latest_weight_date date
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    p.id,
    p.display_name,
    t.energy_kcal,
    t.protein_g,
    t.fat_g,
    t.carbs_g,
    t.energy_tolerance_kcal,
    t.protein_tolerance_g,
    t.fat_tolerance_g,
    t.carbs_tolerance_g,
    coalesce(x.energy_kcal, 0),
    coalesce(x.protein_g, 0),
    coalesce(x.fat_g, 0),
    coalesce(x.carbs_g, 0),
    coalesce(x.item_count, 0),
    coalesce(x.meal_count, 0),
    coalesce(ph.photo_count, 0),
    l.last_logged_at,
    coalesce(u.unread_count, 0),
    coalesce(a.awaiting_count, 0),
    w.body_weight_kg,
    w.checkin_date
  from public.trainer_clients tc
  join public.profiles p on p.id = tc.client_id
  left join lateral (
    select nt.*
      from public.nutrition_targets nt
     where nt.client_id = tc.client_id and nt.effective_from <= p_date
     order by nt.effective_from desc
     limit 1
  ) t on true
  left join lateral (
    select sum(mi.energy_kcal) as energy_kcal,
           sum(mi.protein_g) as protein_g,
           sum(mi.fat_g) as fat_g,
           sum(mi.carbs_g) as carbs_g,
           count(*)::integer as item_count,
           count(distinct m.id)::integer as meal_count
      from public.meals m
      join public.meal_items mi on mi.meal_id = m.id
     where m.client_id = tc.client_id and m.eaten_on = p_date
  ) x on true
  left join lateral (
    select count(*)::integer as photo_count
      from public.meals m
      join public.meal_photos mp on mp.meal_id = m.id
     where m.client_id = tc.client_id and m.eaten_on = p_date
  ) ph on true
  left join lateral (
    select max(mi.created_at) as last_logged_at
      from public.meal_items mi
     where mi.client_id = tc.client_id
  ) l on true
  left join lateral (
    select count(*)::integer as unread_count
      from public.meal_comments mc
     where mc.client_id = tc.client_id and mc.author_id = tc.client_id and mc.read_at is null
  ) u on true
  -- 未返信: 最後のコメントがクライアントからの食事の数（既読にしても、返信するまでは数える）
  left join lateral (
    select count(*)::integer as awaiting_count
      from (
        select distinct on (mc.meal_id) mc.author_id
          from public.meal_comments mc
         where mc.client_id = tc.client_id
         order by mc.meal_id, mc.created_at desc, mc.id desc
      ) last_comment
     where last_comment.author_id = tc.client_id
  ) a on true
  left join lateral (
    select c.body_weight_kg, c.checkin_date
      from public.checkins c
     where c.client_id = tc.client_id and c.body_weight_kg is not null
     order by c.checkin_date desc
     limit 1
  ) w on true
  where tc.trainer_id = (select auth.uid())
    and tc.status = 'active'
  order by p.display_name;
$$;

-- ---------------------------------------------------------------------
-- 7. 権限（GRANT）
-- ---------------------------------------------------------------------
revoke all on table
  public.nutrition_targets,
  public.foods,
  public.meals,
  public.meal_photos,
  public.meal_items,
  public.meal_comments,
  public.meal_analysis_usage
from anon, authenticated;

grant all on table
  public.nutrition_targets,
  public.foods,
  public.meals,
  public.meal_photos,
  public.meal_items,
  public.meal_comments,
  public.meal_analysis_usage
to service_role;

grant select, delete on public.nutrition_targets to authenticated;
grant insert (
  client_id, trainer_id, effective_from, energy_kcal, protein_g, fat_g, carbs_g,
  energy_tolerance_kcal, protein_tolerance_g, fat_tolerance_g, carbs_tolerance_g, note
) on public.nutrition_targets to authenticated;
grant update (
  trainer_id, energy_kcal, protein_g, fat_g, carbs_g,
  energy_tolerance_kcal, protein_tolerance_g, fat_tolerance_g, carbs_tolerance_g, note
) on public.nutrition_targets to authenticated;

grant select, delete on public.foods to authenticated;
grant insert (
  owner_trainer_id, name, brand_key, brand, channel, genre, category, meal_role, serving_label, serving_weight_g,
  nutrient_basis, energy_kcal, protein_g, fat_g, carbs_g, price_yen, price_note,
  source_type, source_url, source_note, verified_on, verification_status, availability
) on public.foods to authenticated;
grant update (
  name, brand_key, brand, channel, genre, category, meal_role, serving_label, serving_weight_g,
  nutrient_basis, energy_kcal, protein_g, fat_g, carbs_g, price_yen, price_note,
  source_type, source_url, source_note, verified_on, verification_status, availability
) on public.foods to authenticated;

grant select on public.meals to authenticated;
grant insert (client_id, eaten_on, meal_type, note) on public.meals to authenticated;
grant update (note) on public.meals to authenticated;

grant select, delete on public.meal_photos to authenticated;
grant insert (meal_id, client_id, storage_path, content_hash, width, height, size_bytes) on public.meal_photos to authenticated;

grant select, delete on public.meal_items to authenticated;
grant insert (
  meal_id, client_id, position, name, brand, origin, food_id, photo_id,
  unit, ref_amount, ref_energy_kcal, ref_protein_g, ref_fat_g, ref_carbs_g,
  amount, serving_label, serving_weight_g, ai_estimate, request_id
) on public.meal_items to authenticated;
grant update (
  position, name, brand, unit, ref_amount, ref_energy_kcal, ref_protein_g, ref_fat_g, ref_carbs_g,
  amount, serving_label, serving_weight_g
) on public.meal_items to authenticated;

grant select, delete on public.meal_comments to authenticated;
grant insert (meal_id, client_id, author_id, body) on public.meal_comments to authenticated;

-- private 関数: 生成列・RLS・関数の中から呼ぶものだけ authenticated に実行権限
revoke all on function private.normalize_search_text(text) from public, anon, authenticated;
revoke all on function private.food_search_key(text, text, text) from public, anon, authenticated;
revoke all on function private.try_uuid(text) from public, anon, authenticated;
revoke all on function private.valid_ai_estimate(jsonb) from public, anon, authenticated;
revoke all on function private.compute_meal_item() from public, anon, authenticated;
grant execute on function private.normalize_search_text(text) to authenticated, service_role;
grant execute on function private.food_search_key(text, text, text) to authenticated, service_role;
grant execute on function private.try_uuid(text) to authenticated, service_role;
grant execute on function private.valid_ai_estimate(jsonb) to authenticated, service_role;

-- public RPC
revoke all on function public.save_nutrition_target(uuid, date, integer, numeric, numeric, numeric, integer, numeric, numeric, numeric, text) from public, anon, authenticated;
revoke all on function public.add_meal_items(date, text, jsonb, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.copy_meal(uuid, date, text, uuid) from public, anon, authenticated;
revoke all on function public.mark_meal_comments_read(uuid[]) from public, anon, authenticated;
revoke all on function public.consume_meal_analysis_quota() from public, anon, authenticated;
revoke all on function public.get_nutrition_days(uuid, date, date) from public, anon, authenticated;
revoke all on function public.get_trainer_nutrition_overview(date) from public, anon, authenticated;

grant execute on function public.save_nutrition_target(uuid, date, integer, numeric, numeric, numeric, integer, numeric, numeric, numeric, text) to authenticated;
grant execute on function public.add_meal_items(date, text, jsonb, jsonb, uuid) to authenticated;
grant execute on function public.copy_meal(uuid, date, text, uuid) to authenticated;
grant execute on function public.mark_meal_comments_read(uuid[]) to authenticated;
grant execute on function public.consume_meal_analysis_quota() to authenticated;
grant execute on function public.get_nutrition_days(uuid, date, date) to authenticated;
grant execute on function public.get_trainer_nutrition_overview(date) to authenticated;

commit;
