-- =====================================================================
-- 食事管理のテスト（RLS・権限・栄養値の計算・RPC）
--
-- 前提: supabase_shim.sql → migrations/*.sql を流した PostgreSQL に対して実行
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/meals_test.sql
-- 全体を 1 トランザクションで実行し、最後に ROLLBACK するのでデータは残りません。
-- 1 つでも失敗すると "TEST FAILED" で停止します。
-- =====================================================================
\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned

begin;

-- ---------------------------------------------------------------------
-- テスト用ヘルパー（rls_test.sql と同じ）
-- ---------------------------------------------------------------------
create schema tests;
grant usage on schema tests to anon, authenticated;

create function tests.ok(p_cond boolean, p_msg text) returns void
language plpgsql as $$
begin
  if p_cond is distinct from true then
    raise exception 'TEST FAILED: %', p_msg;
  end if;
  raise notice 'ok - %', p_msg;
end;
$$;

create function tests.throws(p_sql text, p_msg text, p_sqlstate text default null, p_message text default null)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if p_sqlstate is not null and sqlstate <> p_sqlstate then
      raise exception 'TEST FAILED: % (expected SQLSTATE %, got %: %)', p_msg, p_sqlstate, sqlstate, sqlerrm;
    end if;
    if p_message is not null and sqlerrm <> p_message then
      raise exception 'TEST FAILED: % (expected message %, got %)', p_msg, p_message, sqlerrm;
    end if;
    raise notice 'ok - % [%: %]', p_msg, sqlstate, sqlerrm;
    return;
  end;
  raise exception 'TEST FAILED: % (no error was raised)', p_msg;
end;
$$;

create function tests.affects(p_sql text, p_expected integer, p_msg text)
returns void language plpgsql as $$
declare
  n integer;
begin
  execute p_sql;
  get diagnostics n = row_count;
  if n <> p_expected then
    raise exception 'TEST FAILED: % (expected % rows, got %)', p_msg, p_expected, n;
  end if;
  raise notice 'ok - % (% rows)', p_msg, n;
end;
$$;

create function tests.login(p_key text) returns void
language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', current_setting('test.' || p_key), 'role', 'authenticated')::text,
    false
  );
end;
$$;

create function tests.uid(p_key text) returns uuid
language sql stable as $$ select current_setting('test.' || p_key)::uuid $$;

-- 食べたもの 1 品分の JSON（add_meal_items に渡す形）
create function tests.item(
  p_name text,
  p_unit text,
  p_ref_amount numeric,
  p_kcal numeric,
  p_p numeric,
  p_f numeric,
  p_c numeric,
  p_amount numeric,
  p_extra jsonb default '{}'::jsonb
) returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'name', p_name, 'unit', p_unit, 'ref_amount', p_ref_amount,
    'ref_energy_kcal', p_kcal, 'ref_protein_g', p_p, 'ref_fat_g', p_f, 'ref_carbs_g', p_c,
    'amount', p_amount, 'origin', 'manual'
  ) || p_extra
$$;

grant execute on all functions in schema tests to anon, authenticated;

select set_config('test.t1', '10000000-0000-4000-8000-000000000001', false);
select set_config('test.t2', '10000000-0000-4000-8000-000000000002', false);
select set_config('test.c1', '20000000-0000-4000-8000-000000000001', false);
select set_config('test.c2', '20000000-0000-4000-8000-000000000002', false);
select set_config('test.c3', '20000000-0000-4000-8000-000000000003', false);

-- ---------------------------------------------------------------------
-- 0. 準備: T1 の担当 = C1, C2 / T2 の担当 = C3
-- ---------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  (tests.uid('t1'), 't1@example.com', '{"display_name": "トレーナーA", "app_role": "trainer"}'),
  (tests.uid('t2'), 't2@example.com', '{"display_name": "トレーナーB", "app_role": "trainer"}'),
  (tests.uid('c1'), 'c1@example.com', '{"display_name": "クライアント1", "app_role": "client"}'),
  (tests.uid('c2'), 'c2@example.com', '{"display_name": "クライアント2", "app_role": "client"}'),
  (tests.uid('c3'), 'c3@example.com', '{"display_name": "クライアント3", "app_role": "client"}');
insert into public.trainer_clients (trainer_id, client_id) values
  (tests.uid('t1'), tests.uid('c1')),
  (tests.uid('t1'), tests.uid('c2')),
  (tests.uid('t2'), tests.uid('c3'));

-- 共有の商品データ（実際の運用では supabase/data/foods.sql で登録する）
insert into public.foods (
  code, name, brand_key, brand, channel, category, meal_role, serving_label, serving_weight_g,
  nutrient_basis, energy_kcal, protein_g, fat_g, carbs_g, source_type, source_url, verified_on, verification_status
) values
  ('test_store:onigiri-sake', 'おにぎり 鮭', 'test_store', 'テストストア', 'convenience', 'おにぎり', 'staple', '1個', 110,
   'serving', 180, 4.5, 1.2, 38.0, 'official_web', 'https://example.com/onigiri', current_date, 'verified'),
  ('generic:rice', 'ごはん（精白米）', null, null, 'grocery', 'ごはん', 'staple', '茶碗1杯', 150,
   'per_100g', 156, 2.5, 0.3, 37.1, 'standard_table', 'https://example.com/rice', current_date, 'verified');
select id as food_onigiri from public.foods where code = 'test_store:onigiri-sake' \gset

-- ---------------------------------------------------------------------
-- 1. 商品データの形式
-- ---------------------------------------------------------------------
select tests.throws(
  $q$insert into public.foods (name, channel, meal_role, nutrient_basis, energy_kcal, protein_g, fat_g, carbs_g, source_type, source_url, verification_status)
     values ('x', 'convenience', 'main', 'serving', 1, 1, 1, 1, 'official_web', 'https://example.com', 'verified')$q$,
  '確認日の無い商品は「確認済み」にできない', '23514');
select tests.throws(
  $q$insert into public.foods (name, channel, meal_role, nutrient_basis, energy_kcal, protein_g, fat_g, carbs_g, source_type)
     values ('x', 'convenience', 'main', 'per_100g', 1, 1, 1, 1, 'trainer')$q$,
  '100gあたりの値には1食分の重量が必要', '23514');
select tests.throws(
  $q$insert into public.foods (name, channel, meal_role, nutrient_basis, energy_kcal, protein_g, fat_g, carbs_g, source_type)
     values ('x', 'restaurant', 'main', 'serving', 1, 1, 1, 1, 'trainer')$q$,
  '外食はジャンルが必要', '23514');
select tests.throws(
  $q$insert into public.foods (name, channel, meal_role, nutrient_basis, energy_kcal, protein_g, fat_g, carbs_g, source_type, verification_status)
     values ('x', 'convenience', 'main', 'serving', 1, 1, 1, 1, 'official_web', 'sample')$q$,
  'サンプルデータは出典を sample にしないと登録できない', '23514');
insert into public.foods (name, channel, meal_role, nutrient_basis, energy_kcal, protein_g, fat_g, carbs_g, source_type, verification_status)
values ('ｻﾗﾀﾞﾁｷﾝ　ＰＬＡＩＮ', 'convenience', 'protein', 'serving', 1, 1, 1, 1, 'sample', 'sample');
select tests.ok(
  (select search_key from public.foods where name = 'ｻﾗﾀﾞﾁｷﾝ　ＰＬＡＩＮ') = 'サラダチキン plain',
  '検索キーは半角カナ・全角英字・全角スペースを正規化する');
select tests.ok(
  private.normalize_search_text('さらだ　ちきん') = 'サラダ チキン',
  'ひらがなの検索語はカタカナに揃える');
delete from public.foods where source_type = 'sample';

-- ---------------------------------------------------------------------
-- 2. 商品データの見え方・編集
-- ---------------------------------------------------------------------
select tests.login('c1');
set role authenticated;
select tests.ok((select count(*) from public.foods) = 2, 'クライアントは共有の商品データを見られる');
select tests.throws(
  $q$insert into public.foods (owner_trainer_id, name, channel, meal_role, nutrient_basis, energy_kcal, protein_g, fat_g, carbs_g, source_type)
     values ('20000000-0000-4000-8000-000000000001', 'x', 'grocery', 'side', 'serving', 1, 1, 1, 1, 'trainer')$q$,
  'クライアントは商品データを登録できない', '42501');
select tests.affects(format('update public.foods set energy_kcal = 1 where id = %L', :'food_onigiri'), 0, 'クライアントは共有の商品データを変更できない');

select tests.login('t1');
insert into public.foods (owner_trainer_id, name, channel, category, meal_role, nutrient_basis, serving_label, energy_kcal, protein_g, fat_g, carbs_g, source_type)
values (tests.uid('t1'), 'ジムの鶏むねボウル', 'grocery', 'ボウル', 'main', 'serving', '1杯', 520, 42, 9.5, 62, 'trainer')
returning id as food_t1 \gset
select tests.ok(
  (select verification_status from public.foods where id = :'food_t1') = 'unverified',
  'トレーナーが登録した食品は「未確認」になる');
select tests.affects(format('update public.foods set energy_kcal = 530 where id = %L', :'food_t1'), 1, 'トレーナーは自分の食品を変更できる');
select tests.affects(format('update public.foods set energy_kcal = 1 where id = %L', :'food_onigiri'), 0, 'トレーナーは共有の商品データを変更できない');

select tests.login('c1');
select tests.ok(exists (select 1 from public.foods where id = :'food_t1'), 'C1 は担当トレーナーの食品を見られる');
select tests.login('c3');
select tests.ok(not exists (select 1 from public.foods where id = :'food_t1'), 'C3 は担当外のトレーナーの食品を見られない');
select tests.login('t2');
select tests.affects(format('update public.foods set energy_kcal = 1 where id = %L', :'food_t1'), 0, 'T2 は T1 の食品を変更できない');
select tests.affects(format('delete from public.foods where id = %L', :'food_t1'), 0, 'T2 は T1 の食品を削除できない');

-- ---------------------------------------------------------------------
-- 3. 栄養目標（トレーナーが設定・過去は書き換えない）
-- ---------------------------------------------------------------------
reset role;
-- 30 日前から使っている目標（過去の行）
insert into public.nutrition_targets (client_id, trainer_id, effective_from, energy_kcal, protein_g, fat_g, carbs_g)
values (tests.uid('c1'), tests.uid('t1'), current_date - 30, 1800, 100, 50, 230)
returning id as target_past \gset

set role authenticated;
select tests.login('t1');
select (public.save_nutrition_target(tests.uid('c1'), current_date, 2200, 140, 60, 270, 100, 10, 5, 20, '増量期')).id as target_today \gset
select tests.ok((select energy_kcal from public.nutrition_targets where id = :'target_today') = 2200, 'T1 は担当クライアントの目標を設定できる');
select tests.ok(
  (public.save_nutrition_target(tests.uid('c1'), current_date, 2300, 145.04, 62, 280, 150, 12, 6, 25, null)).id = :'target_today'::uuid,
  '同じ適用開始日で保存すると、同じ行が更新される');
select tests.ok((select protein_g from public.nutrition_targets where id = :'target_today') = 145.0, '目標の PFC は小数第1位に丸める');
select tests.ok((select note from public.nutrition_targets where id = :'target_today') is null, 'メモを空にできる');
select (public.save_nutrition_target(tests.uid('c1'), current_date + 7, 2000, 150, 55, 220, 100, 10, 5, 20, '減量へ')).id as target_future \gset
select tests.ok((select count(*) from public.nutrition_targets where client_id = tests.uid('c1')) = 3, '目標の履歴が残る（過去・今日・予定の 3 件）');

select tests.throws(format('select public.save_nutrition_target(%L, current_date - 10, 2000, 100, 50, 250, 100, 10, 5, 20)', tests.uid('c1')),
  '過去の日付から適用する目標は作れない', '22023', 'invalid_target_date');
select tests.throws(format('select public.save_nutrition_target(%L, current_date, 2000, 100, 50, 250, 100, 10, 5, 20)', tests.uid('c3')),
  'T1 は担当外の C3 の目標を設定できない', 'P0002', 'client_not_found');
select tests.throws(format('select public.save_nutrition_target(%L, current_date, 100, 100, 50, 250, 100, 10, 5, 20)', tests.uid('c1')),
  'ありえない目標カロリーは保存できない', '23514');
select tests.affects(format('update public.nutrition_targets set energy_kcal = 9999 where id = %L', :'target_past'), 0,
  '過去の目標は担当トレーナーでも書き換えられない');
select tests.throws(
  format($q$insert into public.nutrition_targets (client_id, trainer_id, effective_from, energy_kcal, protein_g, fat_g, carbs_g) values (%L, %L, current_date - 5, 2000, 100, 50, 250)$q$,
    tests.uid('c1'), tests.uid('t1')),
  '過去の日付の目標を直接作ることもできない', '42501');
select tests.throws(format('update public.nutrition_targets set effective_from = current_date - 20 where id = %L', :'target_today'),
  '適用開始日はあとから変更できない', '42501');
select tests.affects(format('delete from public.nutrition_targets where id = %L', :'target_today'), 0, '今日の目標は削除できない（予定だけ削除できる）');

select tests.login('t2');
select tests.ok((select count(*) from public.nutrition_targets) = 0, 'T2 には T1 のクライアントの目標が見えない');
select tests.affects(format('delete from public.nutrition_targets where id = %L', :'target_future'), 0, 'T2 は T1 のクライアントの予定を削除できない');

select tests.login('c1');
select tests.ok((select count(*) from public.nutrition_targets) = 3, 'C1 は自分の目標の履歴を見られる');
select tests.throws(format('select public.save_nutrition_target(%L, current_date, 2000, 100, 50, 250, 100, 10, 5, 20)', tests.uid('c1')),
  'クライアントは自分で目標を設定できない', 'P0002', 'client_not_found');
select tests.affects(format('update public.nutrition_targets set energy_kcal = 1000 where id = %L', :'target_today'), 0, 'クライアントは目標を書き換えられない');

select tests.login('c2');
select tests.ok((select count(*) from public.nutrition_targets) = 0, 'C2 には C1 の目標が見えない');

-- ---------------------------------------------------------------------
-- 4. 食べたものの追加と栄養値の計算
-- ---------------------------------------------------------------------
select tests.login('c1');
select public.add_meal_items(
  current_date, 'lunch',
  jsonb_build_array(
    -- ごはん: 100g あたり 156kcal / P2.5 / F0.3 / C37.1 を 180g
    tests.item('ごはん', 'g', 100, 156, 2.5, 0.3, 37.1, 180),
    -- おにぎり: 1 個あたり 180kcal / P4.5 / F1.2 / C38 を 2 個（1 個 110g）
    tests.item('おにぎり 鮭', 'serving', 1, 180, 4.5, 1.2, 38, 2,
      jsonb_build_object('origin', 'food', 'food_id', :'food_onigiri', 'brand', 'テストストア', 'serving_label', '1個', 'serving_weight_g', 110))
  ),
  null,
  '30000000-0000-4000-8000-000000000001'
) as lunch \gset

select tests.ok((select meal_type from public.meals where id = :'lunch') = 'lunch', '食事（昼食）が作られる');
select tests.ok((select count(*) from public.meal_items where meal_id = :'lunch') = 2, '2 品が保存される');
select tests.ok(
  (select array[energy_kcal, protein_g, fat_g, carbs_g, weight_g]::text from public.meal_items where meal_id = :'lunch' and name = 'ごはん')
    = '{281,4.5,0.5,66.8,180.0}',
  '100gあたりの値 × 180g（kcal は整数、PFC は小数第1位に丸める）');
select tests.ok(
  (select array[energy_kcal, protein_g, fat_g, carbs_g, weight_g]::text from public.meal_items where meal_id = :'lunch' and name = 'おにぎり 鮭')
    = '{360,9.0,2.4,76.0,220.0}',
  '1食分の値 × 2個（重量は 1 個の重量 × 個数）');
select tests.ok((select food_id from public.meal_items where meal_id = :'lunch' and name = 'おにぎり 鮭') = :'food_onigiri'::uuid, '商品データとのつながりが残る');
select tests.ok(
  (select string_agg(position::text, ',' order by position) from public.meal_items where meal_id = :'lunch') = '1,2',
  '並び順は追加した順');

select tests.ok(
  public.add_meal_items(current_date, 'lunch', jsonb_build_array(tests.item('ごはん', 'g', 100, 156, 2.5, 0.3, 37.1, 180)), null,
    '30000000-0000-4000-8000-000000000001') = :'lunch'::uuid,
  '同じリクエストを再送しても同じ食事が返る');
select tests.ok((select count(*) from public.meal_items where meal_id = :'lunch') = 2, '再送しても二重に記録されない');

select public.add_meal_items(current_date, 'lunch', jsonb_build_array(tests.item('みそ汁', 'serving', 1, 40, 2.5, 1.4, 4.4, 1)), null, null) as lunch_again \gset
select tests.ok(:'lunch_again' = :'lunch', '同じ日・同じ食事区分には同じ食事に追加される');
select tests.ok((select max(position) from public.meal_items where meal_id = :'lunch') = 3, '追加した品は最後に並ぶ');

select tests.throws(format('select public.add_meal_items(current_date, %L, %L::jsonb)', 'lunch', jsonb_build_array(tests.item('x', 'kg', 1, 1, 1, 1, 1, 1))),
  '単位は g か 1食 だけ', '22023', 'invalid_meal_item');
select tests.throws(format('select public.add_meal_items(current_date, %L, %L::jsonb)', 'lunch', jsonb_build_array(tests.item('x', 'g', 100, 1, 1, 1, 1, 0))),
  '量 0 は保存できない', '22023', 'invalid_meal_item');
select tests.throws(format('select public.add_meal_items(current_date, %L, %L::jsonb)', 'lunch', jsonb_build_array(tests.item('x', 'g', 100, -1, 1, 1, 1, 10))),
  'マイナスの栄養値は保存できない', '22023', 'invalid_meal_item');
select tests.throws(format('select public.add_meal_items(current_date, %L, %L::jsonb)', 'lunch', jsonb_build_array(tests.item('  ', 'g', 100, 1, 1, 1, 1, 10))),
  '名前が空だと保存できない', '22023', 'invalid_meal_item');
select tests.throws(format('select public.add_meal_items(current_date, %L, %L::jsonb)', 'lunch', '[{"name": "x", "unit": "g", "ref_amount": "100", "ref_energy_kcal": 1, "ref_protein_g": 1, "ref_fat_g": 1, "ref_carbs_g": 1, "amount": 1}]'),
  '数値が文字列だと保存できない', '22023', 'invalid_meal_item');
select tests.throws(format('select public.add_meal_items(current_date, %L, %L::jsonb)', 'lunch', jsonb_build_array(tests.item('x', 'g', 1, 100, 10, 10, 10, 500))),
  '基準量の 100 倍を超える量は保存できない', '22023', 'meal_item_out_of_range');
select tests.throws('select public.add_meal_items(current_date, ''lunch'', ''[]''::jsonb)',
  '0 品（写真なし）は保存できない', '22023', 'meal_items_required');
select tests.throws(format('select public.add_meal_items(current_date, %L, %L::jsonb)', 'lunch',
    (select jsonb_agg(tests.item('x', 'g', 100, 1, 1, 1, 1, 10)) from generate_series(1, 31))),
  '1 回に追加できるのは 30 品まで', '22023', 'too_many_meal_items');
select tests.throws(format('select public.add_meal_items(current_date, %L, %L::jsonb)', 'brunch', jsonb_build_array(tests.item('x', 'g', 100, 1, 1, 1, 1, 10))),
  '食事区分は朝食・昼食・夕食・間食だけ', '22023', 'invalid_meal_type');
select tests.throws(format('select public.add_meal_items(current_date + 30, %L, %L::jsonb)', 'lunch', jsonb_build_array(tests.item('x', 'g', 100, 1, 1, 1, 1, 10))),
  '未来の日付には記録できない', '22023', 'invalid_date');

-- 直接の書き換え
select id as item_rice from public.meal_items where meal_id = :'lunch' and name = 'ごはん' \gset
select tests.affects(format('update public.meal_items set amount = 150 where id = %L', :'item_rice'), 1, 'C1 は量を変更できる');
select tests.ok(
  (select array[energy_kcal, protein_g, fat_g, carbs_g]::text from public.meal_items where id = :'item_rice') = '{234,3.8,0.5,55.7}',
  '量を変えると栄養値が再計算される（150g）');
select tests.throws(format('update public.meal_items set energy_kcal = 1 where id = %L', :'item_rice'),
  '栄養値の合計を直接書き換えることはできない', '42501');
select tests.throws(format('update public.meal_items set client_id = %L where id = %L', tests.uid('c2'), :'item_rice'),
  '持ち主は書き換えられない', '42501');
select tests.throws(
  format($q$insert into public.meal_items (meal_id, client_id, name, origin, unit, ref_amount, ref_energy_kcal, ref_protein_g, ref_fat_g, ref_carbs_g, amount) values (%L, %L, 'x', 'manual', 'g', 100, 1, 1, 1, 1, 1)$q$,
    :'lunch', tests.uid('c2')),
  '他人の名前で記録することはできない', '42501');

select tests.login('c2');
select tests.ok((select count(*) from public.meals) = 0, 'C2 には C1 の食事が見えない');
select tests.ok((select count(*) from public.meal_items) = 0, 'C2 には C1 の食べたものが見えない');
select tests.affects(format('update public.meal_items set amount = 1 where id = %L', :'item_rice'), 0, 'C2 は C1 の記録を変更できない');
select tests.affects(format('delete from public.meal_items where id = %L', :'item_rice'), 0, 'C2 は C1 の記録を削除できない');
select tests.throws(
  format($q$insert into public.meal_items (meal_id, client_id, name, origin, unit, ref_amount, ref_energy_kcal, ref_protein_g, ref_fat_g, ref_carbs_g, amount) values (%L, %L, 'x', 'manual', 'g', 100, 1, 1, 1, 1, 1)$q$,
    :'lunch', tests.uid('c2')),
  'C2 は C1 の食事に品を足せない', '23503');

select tests.login('t1');
select tests.ok((select count(*) from public.meal_items where meal_id = :'lunch') = 3, 'T1 は担当クライアントの食べたものを見られる');
select tests.affects(format('update public.meal_items set amount = 1 where id = %L', :'item_rice'), 0, 'トレーナーはクライアントの記録を変更できない');
select tests.affects(format('delete from public.meal_items where id = %L', :'item_rice'), 0, 'トレーナーはクライアントの記録を削除できない');
select tests.throws(format('select public.add_meal_items(current_date, %L, %L::jsonb)', 'lunch', jsonb_build_array(tests.item('x', 'g', 100, 1, 1, 1, 1, 10))),
  'トレーナーは食事を記録できない', 'P0001', 'client_only');

select tests.login('t2');
select tests.ok((select count(*) from public.meal_items) = 0, 'T2 には T1 のクライアントの記録が見えない');

-- ---------------------------------------------------------------------
-- 5. AI の推定値と修正
-- ---------------------------------------------------------------------
select tests.login('c1');
select public.add_meal_items(
  current_date, 'dinner',
  jsonb_build_array(
    tests.item('鶏の唐揚げ', 'g', 150, 420, 25.2, 28.1, 12.4, 150, jsonb_build_object(
      'origin', 'ai_photo',
      'ai_estimate', jsonb_build_object('name', '鶏の唐揚げ', 'estimated_weight_g', 150, 'energy_kcal', 420, 'protein_g', 25.2, 'fat_g', 28.1, 'carbs_g', 12.4, 'confidence', 'medium')
    ))
  )
) as dinner \gset
select id as item_ai from public.meal_items where meal_id = :'dinner' \gset
select tests.ok((select ai_adjusted from public.meal_items where id = :'item_ai') = false, 'AI の推定どおりなら「修正なし」');
select tests.ok((select (ai_estimate ->> 'energy_kcal')::numeric from public.meal_items where id = :'item_ai') = 420, 'AI の推定値が保存される');
select tests.affects(format('update public.meal_items set amount = 200 where id = %L', :'item_ai'), 1, 'AI の推定量を修正できる');
select tests.ok((select energy_kcal from public.meal_items where id = :'item_ai') = 560, '修正した量で再計算される（420 × 200/150）');
select tests.ok((select ai_adjusted from public.meal_items where id = :'item_ai') = true, '修正すると「AI から修正」になる');
select tests.ok((select (ai_estimate ->> 'energy_kcal')::numeric from public.meal_items where id = :'item_ai') = 420, '修正しても AI の推定値は元のまま残る');
select tests.throws(format($q$update public.meal_items set ai_estimate = '{}' where id = %L$q$, :'item_ai'), 'AI の推定値は書き換えられない', '42501');
select tests.throws(format('select public.add_meal_items(current_date, %L, %L::jsonb)', 'dinner',
    jsonb_build_array(tests.item('x', 'g', 100, 1, 1, 1, 1, 10, jsonb_build_object('origin', 'ai_photo', 'ai_estimate', jsonb_build_object('name', 'x'))))),
  '形式が不正な AI の推定値は保存できない', '22023', 'invalid_meal_item');
select tests.throws(format('select public.add_meal_items(current_date, %L, %L::jsonb)', 'dinner',
    jsonb_build_array(tests.item('x', 'g', 100, 1, 1, 1, 1, 10, jsonb_build_object('origin', 'manual', 'ai_estimate', jsonb_build_object('name', 'x', 'energy_kcal', 1, 'protein_g', 1, 'fat_g', 1, 'carbs_g', 1))))),
  '手入力の品に AI の推定値は付けられない', '22023', 'invalid_meal_item');

-- ---------------------------------------------------------------------
-- 6. 食事写真
-- ---------------------------------------------------------------------
select set_config('test.photo1', tests.uid('c1')::text || '/40000000-0000-4000-8000-000000000001.jpg', false);
select public.add_meal_items(
  current_date, 'breakfast',
  jsonb_build_array(tests.item('トースト', 'serving', 1, 250, 8, 7, 38, 1, jsonb_build_object('from_photo', true))),
  jsonb_build_object('storage_path', current_setting('test.photo1'), 'content_hash', repeat('a', 64), 'width', 1200, 'height', 900, 'size_bytes', 180000),
  '30000000-0000-4000-8000-000000000002'
) as breakfast \gset
select id as photo1 from public.meal_photos where storage_path = current_setting('test.photo1') \gset
select tests.ok((select meal_id from public.meal_photos where id = :'photo1') = :'breakfast'::uuid, '写真が食事に登録される');
select tests.ok((select photo_id from public.meal_items where meal_id = :'breakfast') = :'photo1'::uuid, '写真から記録した品は写真とつながる');
select tests.ok(
  public.add_meal_items(current_date, 'breakfast', '[]'::jsonb,
    jsonb_build_object('storage_path', current_setting('test.photo1')), '30000000-0000-4000-8000-000000000002') = :'breakfast'::uuid,
  '同じ写真の保存を再送しても同じ食事が返る');
select tests.ok((select count(*) from public.meal_photos where meal_id = :'breakfast') = 1, '再送しても写真は二重に登録されない');

select public.add_meal_items(current_date, 'snack', '[]'::jsonb,
  jsonb_build_object('storage_path', tests.uid('c1')::text || '/40000000-0000-4000-8000-000000000002.jpg'), null) as snack \gset
select tests.ok((select count(*) from public.meal_photos where meal_id = :'snack') = 1 and (select count(*) from public.meal_items where meal_id = :'snack') = 0,
  '写真だけでも記録できる（AI が使えないときなど）');

select tests.throws(format('select public.add_meal_items(current_date, %L, %L::jsonb, %L::jsonb)', 'snack', '[]',
    jsonb_build_object('storage_path', tests.uid('c2')::text || '/40000000-0000-4000-8000-000000000003.jpg')),
  '他人のフォルダの写真は登録できない', '22023', 'invalid_photo');
select tests.throws(format('select public.add_meal_items(current_date, %L, %L::jsonb, %L::jsonb)', 'snack', '[]',
    jsonb_build_object('storage_path', tests.uid('c1')::text || '/../x.jpg')),
  '形式が不正なパスは登録できない', '22023', 'invalid_photo');

select tests.login('t1');
select tests.ok((select count(*) from public.meal_photos) = 2, 'T1 は担当クライアントの写真の情報を見られる');
select tests.affects(format('delete from public.meal_photos where id = %L', :'photo1'), 0, 'トレーナーは写真を削除できない');
select tests.login('c2');
select tests.ok((select count(*) from public.meal_photos) = 0, 'C2 には C1 の写真が見えない');
select tests.affects(format('delete from public.meal_photos where id = %L', :'photo1'), 0, 'C2 は C1 の写真を削除できない');
select tests.login('c1');
select tests.affects(format('delete from public.meal_photos where id = %L', :'photo1'), 1, 'C1 は自分の写真を削除できる');
select tests.ok((select photo_id from public.meal_items where meal_id = :'breakfast') is null, '写真を消しても食べたものの記録は残る');

-- Storage のアクセス制御（meal-photos バケット）
reset role;
insert into storage.objects (bucket_id, name) values ('meal-photos', 'not-a-uuid/x.jpg');
set role authenticated;
select tests.login('c1');
insert into storage.objects (bucket_id, name) values ('meal-photos', tests.uid('c1')::text || '/40000000-0000-4000-8000-000000000009.jpg');
select tests.ok(true, 'C1 は自分のフォルダに写真をアップロードできる');
select tests.throws(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'meal-photos', tests.uid('c2')::text || '/x.jpg'),
  'C1 は他人のフォルダにアップロードできない', '42501');
select tests.ok((select count(*) from storage.objects) = 1, 'C1 に見える写真は自分のものだけ');
select tests.login('t1');
select tests.throws(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'meal-photos', tests.uid('t1')::text || '/x.jpg'),
  'トレーナーは食事写真をアップロードできない', '42501');
select tests.ok((select count(*) from storage.objects) = 1, 'T1 は担当クライアントの写真を見られる（形式が不正なフォルダは無視）');
select tests.affects('delete from storage.objects', 0, 'トレーナーはクライアントの写真ファイルを削除できない');
select tests.login('t2');
select tests.ok((select count(*) from storage.objects) = 0, 'T2 には T1 のクライアントの写真が見えない');
select tests.login('c2');
select tests.ok((select count(*) from storage.objects) = 0, 'C2 には C1 の写真が見えない');
select tests.login('c1');
select tests.affects('delete from storage.objects', 1, 'C1 は自分の写真ファイルを削除できる');

-- ---------------------------------------------------------------------
-- 7. 食事へのコメント
-- ---------------------------------------------------------------------
select tests.login('t1');
insert into public.meal_comments (meal_id, client_id, author_id, body)
values (:'lunch', tests.uid('c1'), tests.uid('t1'), 'タンパク質がしっかり取れていますね。')
returning id as comment_t1 \gset
select tests.throws(
  format('insert into public.meal_comments (meal_id, client_id, author_id, body) values (%L, %L, %L, %L)', :'lunch', tests.uid('c1'), tests.uid('c1'), 'x'),
  'T1 はクライアントの名前でコメントできない', '42501');

select tests.login('c1');
insert into public.meal_comments (meal_id, client_id, author_id, body)
values (:'lunch', tests.uid('c1'), tests.uid('c1'), 'ありがとうございます！夜も意識します。')
returning id as comment_c1 \gset
select tests.ok((select count(*) from public.meal_comments where meal_id = :'lunch') = 2, 'クライアントはトレーナーのコメントに返信できる');

select tests.login('c2');
select tests.throws(
  format('insert into public.meal_comments (meal_id, client_id, author_id, body) values (%L, %L, %L, %L)', :'lunch', tests.uid('c1'), tests.uid('c2'), 'x'),
  'C2 は C1 の食事にコメントできない', '42501');
select tests.throws(
  format('insert into public.meal_comments (meal_id, client_id, author_id, body) values (%L, %L, %L, %L)', :'lunch', tests.uid('c2'), tests.uid('c2'), 'x'),
  '他人の食事を自分の食事としてコメントすることはできない', '23503');
select tests.ok((select count(*) from public.meal_comments) = 0, 'C2 には C1 の食事のコメントが見えない');

select tests.login('t2');
select tests.throws(
  format('insert into public.meal_comments (meal_id, client_id, author_id, body) values (%L, %L, %L, %L)', :'lunch', tests.uid('c1'), tests.uid('t2'), 'x'),
  'T2 は T1 のクライアントの食事にコメントできない', '42501');

-- 既読
select tests.login('t1');
select tests.ok(
  (select unread_comment_count from public.get_trainer_nutrition_overview(current_date) where client_id = tests.uid('c1')) = 1,
  'トレーナーの一覧にクライアントからの未読の返信数が出る');
select tests.login('c2');
select tests.ok(public.mark_meal_comments_read(array[:'lunch'::uuid]) = 0, 'C2 は C1 の食事のコメントを既読にできない');
select tests.login('c1');
select tests.ok(public.mark_meal_comments_read(array[:'lunch'::uuid]) = 1, 'C1 はトレーナーのコメントを既読にできる');
select tests.ok((select read_at from public.meal_comments where id = :'comment_c1') is null, '自分の書いたコメントは既読にならない');
select tests.login('t1');
select tests.ok(public.mark_meal_comments_read(array[:'lunch'::uuid]) = 1, 'T1 はクライアントの返信を既読にできる');
select tests.ok(
  (select unread_comment_count from public.get_trainer_nutrition_overview(current_date) where client_id = tests.uid('c1')) = 0,
  '既読にすると未読の返信数が 0 になる');

select tests.login('c1');
select tests.affects(format('delete from public.meal_comments where id = %L', :'comment_t1'), 0, 'クライアントはトレーナーのコメントを削除できない');
select tests.login('t1');
select tests.affects(format('delete from public.meal_comments where id = %L', :'comment_t1'), 1, 'トレーナーは自分のコメントを削除できる');

-- ---------------------------------------------------------------------
-- 8. 過去の食事の再利用
-- ---------------------------------------------------------------------
select tests.login('c1');
select public.copy_meal(:'lunch', current_date + 1, 'dinner', '30000000-0000-4000-8000-000000000003') as copied \gset
select tests.ok((select count(*) from public.meal_items where meal_id = :'copied') = 3, '昼食の 3 品が翌日の夕食にコピーされる');
select tests.ok((select bool_and(origin = 'reuse' and ai_estimate is null and photo_id is null) from public.meal_items where meal_id = :'copied'),
  'コピーした品は「過去の食事から」になる');
select tests.ok(
  (select sum(energy_kcal) from public.meal_items where meal_id = :'copied') = (select sum(energy_kcal) from public.meal_items where meal_id = :'lunch'),
  'コピー元と同じ栄養値になる');
select tests.ok(public.copy_meal(:'lunch', current_date + 1, 'dinner', '30000000-0000-4000-8000-000000000003') = :'copied'::uuid,
  'コピーを再送しても二重にならない');
select tests.ok((select count(*) from public.meal_items where meal_id = :'copied') = 3, 'コピーを再送しても品数は同じ');
select tests.login('c2');
select tests.throws(format('select public.copy_meal(%L, current_date, %L)', :'lunch', 'dinner'), 'C2 は C1 の食事をコピーできない', 'P0002', 'meal_not_found');
select tests.login('t1');
select tests.throws(format('select public.copy_meal(%L, current_date, %L)', :'lunch', 'dinner'), 'トレーナーはクライアントの食事をコピーできない', 'P0002', 'meal_not_found');

-- ---------------------------------------------------------------------
-- 9. 日ごとの集計と目標の履歴
-- ---------------------------------------------------------------------
select tests.login('c1');
select tests.ok(
  (select energy_kcal from public.get_nutrition_days(tests.uid('c1'), current_date, current_date))
    = (select sum(mi.energy_kcal) from public.meal_items mi join public.meals m on m.id = mi.meal_id where m.eaten_on = current_date),
  '1 日の摂取カロリーは保存された記録の合計');
select tests.ok(
  (select array[protein_g, fat_g, carbs_g]::text from public.get_nutrition_days(tests.uid('c1'), current_date, current_date))
    = (select array[sum(mi.protein_g), sum(mi.fat_g), sum(mi.carbs_g)]::text from public.meal_items mi join public.meals m on m.id = mi.meal_id where m.eaten_on = current_date),
  '1 日の PFC も保存された記録の合計（丸め誤差が出ない）');
select tests.ok(
  (select item_count = 5 and meal_count = 3 from public.get_nutrition_days(tests.uid('c1'), current_date, current_date)),
  '品数と食事の数（写真だけの間食は数えない）');
select tests.ok(
  (select target_energy_kcal from public.get_nutrition_days(tests.uid('c1'), current_date - 31, current_date - 31)) is null,
  '目標ができる前の日は目標なし');
select tests.ok(
  (select target_energy_kcal from public.get_nutrition_days(tests.uid('c1'), current_date - 1, current_date - 1)) = 1800,
  '昨日はその時点の目標（1800kcal）のまま');
select tests.ok(
  (select target_energy_kcal from public.get_nutrition_days(tests.uid('c1'), current_date, current_date)) = 2300,
  '今日は今日からの目標（2300kcal）');
select tests.ok(
  (select target_energy_kcal from public.get_nutrition_days(tests.uid('c1'), current_date + 7, current_date + 7)) = 2000,
  '予定の目標は適用開始日から使われる');
select tests.ok((select count(*) from public.get_nutrition_days(tests.uid('c1'), current_date - 200, current_date)) = 93, '一度に取れるのは 93 日分まで');

select tests.login('t1');
select tests.ok(
  (select energy_kcal from public.get_nutrition_days(tests.uid('c1'), current_date, current_date))
    = (select sum(mi.energy_kcal) from public.meal_items mi join public.meals m on m.id = mi.meal_id where m.client_id = tests.uid('c1') and m.eaten_on = current_date),
  'トレーナーにも同じ集計が見える');
select tests.login('c2');
select tests.ok(not exists (select 1 from public.get_nutrition_days(tests.uid('c1'), current_date, current_date)), 'C2 は C1 の集計を取得できない');
select tests.login('t2');
select tests.ok(not exists (select 1 from public.get_nutrition_days(tests.uid('c1'), current_date, current_date)), 'T2 は T1 のクライアントの集計を取得できない');

-- 予定の目標の削除
select tests.login('t1');
select tests.affects(format('delete from public.nutrition_targets where id = %L', :'target_future'), 1, 'まだ始まっていない予定の目標は削除できる');

-- ---------------------------------------------------------------------
-- 10. トレーナーの「食事」一覧
-- ---------------------------------------------------------------------
reset role;
insert into public.checkins (client_id, checkin_date, sleep, fatigue, soreness, stress, motivation, body_weight_kg)
values (tests.uid('c1'), current_date - 1, 6, 4, 3, 4, 7, 71.8);
set role authenticated;
select tests.login('t1');
select tests.ok((select count(*) from public.get_trainer_nutrition_overview(current_date)) = 2, 'T1 の一覧には担当 2 人が出る');
select tests.ok(
  (select target_energy_kcal = 2300 and energy_kcal > 0 and meal_count = 3 and photo_count = 1 and last_logged_at is not null
     from public.get_trainer_nutrition_overview(current_date) where client_id = tests.uid('c1')),
  '一覧に目標・今日の摂取量・食事数・写真数・最終記録が出る');
select tests.ok(
  (select latest_weight_kg = 71.8 and latest_weight_date = current_date - 1
     from public.get_trainer_nutrition_overview(current_date) where client_id = tests.uid('c1')),
  '一覧に直近の体重（朝のチェックイン）が出る');
select tests.ok(
  (select target_energy_kcal is null and item_count = 0 from public.get_trainer_nutrition_overview(current_date) where client_id = tests.uid('c2')),
  '目標・記録の無いクライアントは空欄');
select tests.login('t2');
select tests.ok((select count(*) from public.get_trainer_nutrition_overview(current_date)) = 1, 'T2 の一覧には C3 だけ');
select tests.login('c1');
select tests.ok((select count(*) from public.get_trainer_nutrition_overview(current_date)) = 0, 'クライアントが一覧を呼んでも何も返らない');

-- ---------------------------------------------------------------------
-- 11. AI 写真解析の回数制限
-- ---------------------------------------------------------------------
select tests.login('c1');
select tests.ok(public.consume_meal_analysis_quota() = 39, '1 回使うと残りは 39 回');
do $$
begin
  for i in 1..39 loop
    perform public.consume_meal_analysis_quota();
  end loop;
end;
$$;
select tests.throws('select public.consume_meal_analysis_quota()', '24 時間で 40 回を超えると使えない', 'P0001', 'analysis_quota_exceeded');
select tests.throws('select * from public.meal_analysis_usage', '利用記録は直接読めない', '42501');
select tests.login('c2');
select tests.ok(public.consume_meal_analysis_quota() = 39, '回数制限は人ごと');
select tests.login('t1');
select tests.throws('select public.consume_meal_analysis_quota()', 'トレーナーは写真解析を使わない', 'P0001', 'client_only');

-- ---------------------------------------------------------------------
-- 12. 担当から外れた場合・未ログイン
-- ---------------------------------------------------------------------
select tests.login('c2');
select public.add_meal_items(current_date, 'lunch', jsonb_build_array(tests.item('サラダ', 'serving', 1, 80, 3, 5, 6, 1))) as c2_lunch \gset
select tests.login('t1');
select tests.ok(exists (select 1 from public.meals where id = :'c2_lunch'), '担当中は C2 の食事が見える');
select public.remove_client(tests.uid('c2'));
select tests.ok(not exists (select 1 from public.meals where id = :'c2_lunch'), '担当から外すと C2 の食事は見えない');
select tests.ok(not exists (select 1 from public.meal_items where client_id = tests.uid('c2')), '担当から外すと C2 の食べたものも見えない');
select tests.throws(format('select public.save_nutrition_target(%L, current_date, 2000, 100, 50, 250, 100, 10, 5, 20)', tests.uid('c2')),
  '担当から外したクライアントの目標は設定できない', 'P0002', 'client_not_found');
select tests.login('c2');
select tests.ok(exists (select 1 from public.meals where id = :'c2_lunch'), 'C2 本人の記録は残る');

reset role;
select set_config('request.jwt.claims', '', false);
set role anon;
select tests.throws('select * from public.meals', 'anon は meals を読めない', '42501');
select tests.throws('select * from public.meal_items', 'anon は meal_items を読めない', '42501');
select tests.throws('select * from public.nutrition_targets', 'anon は nutrition_targets を読めない', '42501');
select tests.throws('select * from public.foods', 'anon は foods を読めない', '42501');
select tests.throws('select * from public.meal_comments', 'anon は meal_comments を読めない', '42501');
select tests.throws(format('select public.add_meal_items(current_date, %L, %L::jsonb)', 'lunch', jsonb_build_array(tests.item('x', 'g', 100, 1, 1, 1, 1, 10))),
  'anon は食事を記録できない', '42501');
select tests.throws('select public.consume_meal_analysis_quota()', 'anon は写真解析を使えない', '42501');

reset role;
select 'ALL TESTS PASSED' as result;

rollback;
