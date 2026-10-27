-- =====================================================================
-- RLS / 権限分離のテスト
--
-- 前提: supabase_shim.sql → migrations/*.sql を流した PostgreSQL に対して実行
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/rls_test.sql
-- 全体を 1 トランザクションで実行し、最後に ROLLBACK するのでデータは残りません。
-- 1 つでも失敗すると "TEST FAILED" で停止します。
-- =====================================================================
\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned

begin;

-- ---------------------------------------------------------------------
-- テスト用ヘルパー
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

-- p_sql がエラーになること（p_sqlstate を指定した場合はその SQLSTATE であること）
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

-- p_sql (UPDATE/DELETE) の影響行数
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

-- ログインユーザーの切り替え（PostgREST と同じく request.jwt.claims を設定）
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

grant execute on all functions in schema tests to anon, authenticated;

select set_config('test.t1', '10000000-0000-4000-8000-000000000001', false);
select set_config('test.t2', '10000000-0000-4000-8000-000000000002', false);
select set_config('test.c1', '20000000-0000-4000-8000-000000000001', false);
select set_config('test.c2', '20000000-0000-4000-8000-000000000002', false);
select set_config('test.c3', '20000000-0000-4000-8000-000000000003', false);
select set_config('test.c4', '20000000-0000-4000-8000-000000000004', false);
select set_config('test.c5', '20000000-0000-4000-8000-000000000005', false);

-- ---------------------------------------------------------------------
-- 1. トレーナーのサインアップ（GoTrue が auth.users に INSERT するのを再現）
-- ---------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  (tests.uid('t1'), 't1@example.com', '{"display_name": "トレーナーA", "app_role": "trainer"}'),
  (tests.uid('t2'), 't2@example.com', '{"display_name": "トレーナーB", "app_role": "trainer"}');

select tests.ok((select role from public.profiles where id = tests.uid('t1')) = 'trainer', 'T1 のプロフィールが trainer で作成される');
select tests.ok((select display_name from public.profiles where id = tests.uid('t2')) = 'トレーナーB', 'T2 の表示名が保存される');

-- ---------------------------------------------------------------------
-- 2. 招待コードの発行
-- ---------------------------------------------------------------------
select tests.login('t1');
set role authenticated;
select code as inv_c1 from public.create_client_invite('クライアント1') \gset
select code as inv_c2 from public.create_client_invite('クライアント2') \gset
select code as inv_c4 from public.create_client_invite(null) \gset
select tests.ok(char_length(:'inv_c1') = 10 and :'inv_c1' ~ '^[A-HJ-NP-Z2-9]+$', '招待コードは読み間違えにくい10桁');
select tests.ok((select count(*) from public.client_invites) = 3, 'T1 は自分の招待コード 3 件だけ見える');

select tests.login('t2');
select code as inv_c3 from public.create_client_invite('T2の客') \gset
select tests.ok((select count(*) from public.client_invites) = 1, 'T2 は自分の招待コード 1 件だけ見える');
select tests.affects(format('delete from public.client_invites where code = %L', :'inv_c1'), 0, 'T2 は T1 の招待コードを削除できない');

-- ---------------------------------------------------------------------
-- 3. クライアントのサインアップ（招待コード付き）
-- ---------------------------------------------------------------------
reset role;
insert into auth.users (id, email, raw_user_meta_data) values
  (tests.uid('c1'), 'c1@example.com', jsonb_build_object('display_name', 'クライアント1', 'app_role', 'client', 'invite_code', lower(:'inv_c1'))),
  (tests.uid('c2'), 'c2@example.com', jsonb_build_object('display_name', 'クライアント2', 'app_role', 'client', 'invite_code', :'inv_c2')),
  (tests.uid('c3'), 'c3@example.com', jsonb_build_object('display_name', 'クライアント3', 'app_role', 'client', 'invite_code', :'inv_c3')),
  (tests.uid('c4'), 'c4@example.com', jsonb_build_object('display_name', 'クライアント4', 'app_role', 'client', 'invite_code', 'WRONGCODE1')),
  (tests.uid('c5'), 'c5@example.com', jsonb_build_object('app_role', 'client', 'invite_code', :'inv_c1'));

select tests.ok(exists (select 1 from public.trainer_clients where trainer_id = tests.uid('t1') and client_id = tests.uid('c1')), 'C1 は招待コード（小文字でも可）で T1 とつながる');
select tests.ok(exists (select 1 from public.trainer_clients where trainer_id = tests.uid('t1') and client_id = tests.uid('c2')), 'C2 は T1 とつながる');
select tests.ok(exists (select 1 from public.trainer_clients where trainer_id = tests.uid('t2') and client_id = tests.uid('c3')), 'C3 は T2 とつながる');
select tests.ok(not exists (select 1 from public.trainer_clients where client_id = tests.uid('c4')), '無効なコードのC4 はアカウントだけ作成され、誰ともつながらない');
select tests.ok(not exists (select 1 from public.trainer_clients where client_id = tests.uid('c5')), '使用済みコードのC5 は誰ともつながらない');
select tests.ok((select display_name from public.profiles where id = tests.uid('c5')) = 'c5', '表示名が無い場合はメールアドレスの@前を使う');
select tests.ok((select count(*) from public.profiles where role = 'client') = 5, 'クライアントは client ロールで作成される');

-- ---------------------------------------------------------------------
-- 4. 未ログイン（anon）
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', '', false);
set role anon;
select tests.throws('select * from public.profiles', 'anon は profiles を読めない', '42501');
select tests.throws('select * from public.checkins', 'anon は checkins を読めない', '42501');
select tests.throws('select * from public.set_logs', 'anon は set_logs を読めない', '42501');
select tests.ok((select status from public.get_invite_info(:'inv_c4')) = 'valid', 'anon でも招待コードの状態を確認できる');
select tests.ok((select trainer_name from public.get_invite_info(:'inv_c4')) = 'トレーナーA', '招待コードからトレーナー名がわかる');
select tests.ok((select status from public.get_invite_info(:'inv_c1')) = 'used', '使用済みコードは used');
select tests.ok(not exists (select 1 from public.get_invite_info('NOSUCHCODE')), '存在しないコードは空');
select tests.throws(format('select public.accept_invite(%L)', :'inv_c4'), 'anon は招待を受け入れられない', '42501');
select tests.throws('select public.get_trainer_dashboard(current_date)', 'anon はダッシュボードを呼べない', '42501');

-- ---------------------------------------------------------------------
-- 5. ログイン後の招待受け入れ
-- ---------------------------------------------------------------------
reset role;
select tests.login('c4');
set role authenticated;
select tests.ok(public.accept_invite(lower(:'inv_c4')) = tests.uid('t1'), 'C4 はログイン後に招待リンクから T1 とつながる');

select tests.login('c5');
select tests.throws(format('select public.accept_invite(%L)', :'inv_c4'), '使用済みの招待コードは使えない', 'P0001', 'invite_already_used');
select tests.throws('select public.accept_invite(''NOSUCHCODE'')', '存在しない招待コードは使えない', 'P0002', 'invite_not_found');

select tests.login('t2');
select tests.throws(format('select public.accept_invite(%L)', :'inv_c4'), 'トレーナーは招待を受け入れられない', 'P0001', 'invite_requires_client');

select tests.login('c1');
select tests.throws('select public.create_client_invite(null)', 'クライアントは招待コードを発行できない', 'P0001', 'trainer_only');
select tests.throws(format('insert into public.trainer_clients (trainer_id, client_id) values (%L, %L)', tests.uid('t2'), tests.uid('c1')), 'クライアントは担当関係を直接作れない', '42501');

-- ---------------------------------------------------------------------
-- 6. プロフィールの見え方
-- ---------------------------------------------------------------------
select tests.login('c1');
select tests.ok((select count(*) from public.profiles) = 2, 'C1 に見えるのは自分と担当トレーナーだけ');
select tests.ok(not exists (select 1 from public.profiles where id = tests.uid('c2')), 'C1 には C2 のプロフィールが見えない');
select tests.affects(format('update public.profiles set display_name = %L where id = %L', 'たなか', tests.uid('c1')), 1, 'C1 は自分の表示名を変更できる');
select tests.throws(format('update public.profiles set role = %L where id = %L', 'trainer', tests.uid('c1')), 'C1 は自分のロールを変更できない', '42501');
select tests.affects(format('update public.profiles set display_name = %L where id = %L', 'x', tests.uid('c2')), 0, 'C1 は他人の表示名を変更できない');
select tests.affects(format('update public.profiles set display_name = %L where id = %L', 'x', tests.uid('t1')), 0, 'C1 はトレーナーの表示名を変更できない');

select tests.login('t1');
select tests.ok((select count(*) from public.profiles) = 4, 'T1 に見えるのは自分と担当クライアント 3 人');
select tests.ok(not exists (select 1 from public.profiles where id in (tests.uid('c3'), tests.uid('t2'))), 'T1 には T2 と T2 のクライアントが見えない');

select tests.login('t2');
select tests.ok((select count(*) from public.profiles) = 2, 'T2 に見えるのは自分と C3 だけ');

-- ---------------------------------------------------------------------
-- 7. 朝のチェックイン
-- ---------------------------------------------------------------------
select tests.login('c1');
insert into public.checkins (client_id, checkin_date, sleep, fatigue, soreness, stress, motivation, body_weight_kg, note)
values (tests.uid('c1'), current_date, 7, 3, 2, 4, 8, 72.4, 'よく眠れた');
insert into public.checkins (client_id, checkin_date, sleep, fatigue, soreness, stress, motivation, body_weight_kg, note)
values (tests.uid('c1'), current_date, 6, 4, 3, 4, 7, 72.2, '再入力')
on conflict (client_id, checkin_date) do update
  set sleep = excluded.sleep, fatigue = excluded.fatigue, soreness = excluded.soreness,
      stress = excluded.stress, motivation = excluded.motivation,
      body_weight_kg = excluded.body_weight_kg, note = excluded.note;
select tests.ok((select count(*) from public.checkins where client_id = tests.uid('c1')) = 1, '同じ日に再入力してもレコードは 1 件のまま');
select tests.ok((select sleep from public.checkins where client_id = tests.uid('c1')) = 6, '同じ日の再入力で値が更新される');
select tests.throws(
  format('insert into public.checkins (client_id, checkin_date, sleep, fatigue, soreness, stress, motivation) values (%L, current_date, 5, 5, 5, 5, 5)', tests.uid('c2')),
  'C1 は C2 のチェックインを作れない', '42501');
select tests.throws(
  format('insert into public.checkins (client_id, checkin_date, sleep, fatigue, soreness, stress, motivation) values (%L, current_date - 1, 11, 5, 5, 5, 5)', tests.uid('c1')),
  '1〜10 以外の値は保存できない', '23514');

select tests.login('c2');
insert into public.checkins (client_id, checkin_date, sleep, fatigue, soreness, stress, motivation)
values (tests.uid('c2'), current_date, 3, 9, 8, 7, 3);
select tests.ok((select count(*) from public.checkins) = 1, 'C2 に見えるのは自分のチェックインだけ');
select tests.affects(format('update public.checkins set sleep = 1 where client_id = %L', tests.uid('c1')), 0, 'C2 は C1 のチェックインを更新できない');

select tests.login('t1');
select tests.ok((select count(*) from public.checkins) = 2, 'T1 は担当クライアント（C1, C2）のチェックインが見える');
select tests.affects(format('update public.checkins set sleep = 1 where client_id = %L', tests.uid('c1')), 0, 'トレーナーはチェックインを書き換えられない');
select tests.throws(
  format('insert into public.checkins (client_id, checkin_date, sleep, fatigue, soreness, stress, motivation) values (%L, current_date - 3, 5, 5, 5, 5, 5)', tests.uid('c1')),
  'トレーナーはクライアントのチェックインを作れない', '42501');

select tests.login('t2');
select tests.ok((select count(*) from public.checkins) = 0, 'T2 には T1 のクライアントのチェックインが見えない');

-- ---------------------------------------------------------------------
-- 8. トレーニングメニュー
-- ---------------------------------------------------------------------
select tests.login('t1');
select public.save_workout_plan(
  null, tests.uid('c1'), '胸・肩・三頭', current_date, '3セット目はRPE8目安',
  '[
    {"name": "ﾍﾞﾝﾁﾌﾟﾚｽ  ", "target_weight_kg": 80, "target_reps": 8, "target_sets": 3, "rest_seconds": 120},
    {"name": "インクラインダンベルプレス", "target_weight_kg": 30, "target_reps": 10, "target_sets": 3, "rest_seconds": 90},
    {"name": "Side　Raise", "target_weight_kg": 8, "target_reps": 15, "target_sets": 3, "rest_seconds": 60, "note": "反動なし"},
    {"name": "トライセプスプレスダウン", "target_weight_kg": 25, "target_reps": 12, "target_sets": 3, "rest_seconds": 60}
  ]'::jsonb
) as plan_c1 \gset

select tests.ok((select count(*) from public.plan_exercises where plan_id = :'plan_c1') = 4, 'メニューに 4 種目保存される');
select tests.ok((select name from public.plan_exercises where plan_id = :'plan_c1' and position = 1) = 'ﾍﾞﾝﾁﾌﾟﾚｽ', '種目名の前後の空白は除去される');
select tests.ok((select exercise_key from public.plan_exercises where plan_id = :'plan_c1' and position = 1) = 'ベンチプレス', '半角カナも正規化されたキーになる');
select tests.ok((select exercise_key from public.plan_exercises where plan_id = :'plan_c1' and position = 3) = 'side raise', '全角スペース・大文字も正規化される');

-- 並べ替え + 1種目削除 + 1種目追加（既存の id は維持される）
select id as ex_bench from public.plan_exercises where plan_id = :'plan_c1' and position = 1 \gset
select id as ex_incline from public.plan_exercises where plan_id = :'plan_c1' and position = 2 \gset
select id as ex_side from public.plan_exercises where plan_id = :'plan_c1' and position = 3 \gset
select public.save_workout_plan(
  :'plan_c1', tests.uid('c1'), '胸・肩・三頭', current_date, null,
  jsonb_build_array(
    jsonb_build_object('id', :'ex_incline', 'name', 'インクラインダンベルプレス', 'target_weight_kg', 32.5, 'target_reps', 10, 'target_sets', 3, 'rest_seconds', 90),
    jsonb_build_object('id', :'ex_bench', 'name', 'ベンチプレス', 'target_weight_kg', 80, 'target_reps', 8, 'target_sets', 3, 'rest_seconds', 120),
    jsonb_build_object('id', :'ex_side', 'name', 'サイドレイズ', 'target_weight_kg', 8, 'target_reps', 15, 'target_sets', 2, 'rest_seconds', 60),
    jsonb_build_object('name', 'ケーブルフライ', 'target_weight_kg', null, 'target_reps', 15, 'target_sets', 2, 'rest_seconds', 0)
  )
) as plan_c1_again \gset
select tests.ok(:'plan_c1' = :'plan_c1_again', '既存メニューの更新は同じ id を返す');
select tests.ok((select position from public.plan_exercises where id = :'ex_incline') = 1, '並べ替え: インクラインが 1 番目になる');
select tests.ok((select position from public.plan_exercises where id = :'ex_bench') = 2, '並べ替え: ベンチが 2 番目になる');
select tests.ok((select count(*) from public.plan_exercises where plan_id = :'plan_c1') = 4, '削除・追加後も 4 種目');
select tests.ok(not exists (select 1 from public.plan_exercises where plan_id = :'plan_c1' and name = 'トライセプスプレスダウン'), '送らなかった種目は削除される');
select tests.ok((select target_weight_kg from public.plan_exercises where plan_id = :'plan_c1' and name = 'ケーブルフライ') is null, '目標重量なし（自重など）も保存できる');
select tests.ok((select note from public.workout_plans where id = :'plan_c1') is null, 'メモを空にできる');

select tests.throws(
  format($q$select public.save_workout_plan(null, %L, 'x', null, null, '[{"name":"a","target_reps":1,"target_sets":1}]')$q$, tests.uid('c3')),
  'T1 は担当外の C3 にメニューを作れない', '42501');
select tests.throws(
  format($q$select public.save_workout_plan(null, %L, 'x', null, null, '[]')$q$, tests.uid('c1')),
  '種目 0 件のメニューは保存できない', '22023', 'exercises_required');
select tests.throws(
  format($q$select public.save_workout_plan(null, %L, 'x', null, null, '[{"name":"a","target_reps":1,"target_sets":99}]')$q$, tests.uid('c1')),
  'セット数の上限を超えると保存できない', '22023', 'invalid_set_targets');

select public.save_workout_plan(
  null, tests.uid('c2'), '下半身', null, null,
  '[{"name": "スクワット", "target_weight_kg": 60, "target_reps": 10, "target_sets": 3, "rest_seconds": 120}]'::jsonb
) as plan_c2 \gset

select tests.login('t2');
select tests.throws(
  format($q$select public.save_workout_plan(null, %L, 'x', null, null, '[{"name":"a","target_reps":1,"target_sets":1}]')$q$, tests.uid('c1')),
  'T2 は T1 のクライアントにメニューを作れない', '42501');
select tests.throws(
  format($q$select public.save_workout_plan(%L, %L, 'x', null, null, '[{"name":"a","target_reps":1,"target_sets":1}]')$q$, :'plan_c1', tests.uid('c1')),
  'T2 は T1 のメニューを書き換えられない', 'P0002', 'plan_not_found');
select tests.affects(format('update public.workout_plans set title = %L where id = %L', 'hack', :'plan_c1'), 0, 'T2 は T1 のメニューを直接更新できない');
select tests.affects(format('delete from public.plan_exercises where plan_id = %L', :'plan_c1'), 0, 'T2 は T1 のメニューの種目を削除できない');
select tests.ok((select count(*) from public.workout_plans) = 0, 'T2 には T1 のメニューが見えない');

select tests.login('c1');
select tests.ok((select count(*) from public.workout_plans) = 1, 'C1 には自分宛てのメニューだけ見える');
select tests.ok((select count(*) from public.plan_exercises) = 4, 'C1 は自分のメニューの種目を見られる');
select tests.affects(format('update public.workout_plans set title = %L where id = %L', 'hack', :'plan_c1'), 0, 'C1 はメニューを書き換えられない');
select tests.throws(
  format($q$insert into public.plan_exercises (plan_id, position, name, exercise_key, target_reps, target_sets) values (%L, 9, 'x', 'x', 1, 1)$q$, :'plan_c1'),
  'C1 はメニューに種目を追加できない', '42501');

select tests.login('c2');
select tests.ok((select count(*) from public.workout_plans) = 1, 'C2 には C2 宛てのメニューだけ見える');
select tests.ok(not exists (select 1 from public.plan_exercises where plan_id = :'plan_c1'), 'C2 には C1 のメニューの種目が見えない');

-- ---------------------------------------------------------------------
-- 9. トレーニングの実施・記録
-- ---------------------------------------------------------------------
select tests.login('c2');
select tests.throws(format('select public.start_workout_session(%L, current_date)', :'plan_c1'), 'C2 は C1 のメニューを開始できない', 'P0002', 'plan_not_found');

select tests.login('c1');
select public.start_workout_session(:'plan_c1', current_date) as s1 \gset
select tests.ok(public.start_workout_session(:'plan_c1', current_date) = :'s1'::uuid, '同じ日に同じメニューを開くと実施中のセッションを再開する');
select tests.ok((select count(*) from public.session_exercises where session_id = :'s1') = 4, 'セッションに 4 種目がコピーされる');
select tests.ok((select count(*) from public.set_logs where session_id = :'s1') = 10, '目標セット数ぶんのセット行が作られる（3+3+2+2）');
select tests.throws(format('select public.start_workout_session(%L, current_date + 30)', :'plan_c1'), 'ありえない日付では開始できない', '22023', 'invalid_date');

select se.id as se_bench from public.session_exercises se where se.session_id = :'s1' and se.exercise_key = 'ベンチプレス' \gset
select sl.id as set_bench_1 from public.set_logs sl where sl.session_exercise_id = :'se_bench' and sl.set_number = 1 \gset
select sl.id as set_bench_2 from public.set_logs sl where sl.session_exercise_id = :'se_bench' and sl.set_number = 2 \gset

select tests.ok((select target_weight_kg from public.set_logs where id = :'set_bench_1') = 80, 'セット行に目標重量が入る');
select tests.ok((select actual_weight_kg from public.set_logs where id = :'set_bench_1') is null, '実績値は未入力（目標値と別カラム）');
select tests.affects(format('update public.set_logs set actual_weight_kg = 80, actual_reps = 8, completed_at = now() where id = %L', :'set_bench_1'), 1, 'C1 はセットの実績を記録できる');
select tests.affects(format('update public.set_logs set actual_weight_kg = 77.5, actual_reps = 10, completed_at = now() where id = %L', :'set_bench_2'), 1, 'C1 は 2 セット目も記録できる');
select tests.throws(format('update public.set_logs set target_weight_kg = 1 where id = %L', :'set_bench_1'), 'C1 は目標値を書き換えられない', '42501');
select tests.throws(format('update public.set_logs set client_id = %L where id = %L', tests.uid('c2'), :'set_bench_1'), 'C1 はセットの持ち主を書き換えられない', '42501');
select tests.throws(
  format('insert into public.set_logs (session_exercise_id, session_id, client_id, set_number) values (%L, %L, %L, 9)', :'se_bench', :'s1', tests.uid('c1')),
  'セット行は直接 INSERT できない（関数経由のみ）', '42501');
select tests.throws(format('update public.workout_sessions set status = %L where id = %L', 'completed', :'s1'), 'セッションの状態は直接更新できない', '42501');
select tests.throws(format('update public.session_exercises set target_weight_kg = 1 where id = %L', :'se_bench'), 'スナップショットの目標値は書き換えられない', '42501');

select (public.add_set(:'se_bench')).set_number as added_set_number \gset
select tests.ok(:added_set_number = 4, 'セット追加で 4 セット目ができる');
select tests.ok(public.remove_last_set(:'se_bench') is not null, '未完了の最後のセットは削除できる');
select tests.ok((select count(*) from public.set_logs where session_exercise_id = :'se_bench') = 3, '削除後は 3 セット');

select tests.login('c2');
select tests.ok((select count(*) from public.workout_sessions) = 0, 'C2 には C1 のセッションが見えない');
select tests.ok((select count(*) from public.set_logs) = 0, 'C2 には C1 のセット記録が見えない');
select tests.affects(format('update public.set_logs set actual_reps = 1 where session_id = %L', :'s1'), 0, 'C2 は C1 のセット記録を書き換えられない');
select tests.throws(format('select public.complete_workout_session(%L)', :'s1'), 'C2 は C1 のセッションを完了にできない', 'P0002', 'session_not_found');
select tests.throws(format('select public.add_set(%L)', :'se_bench'), 'C2 は C1 のセッションにセットを追加できない', 'P0002', 'exercise_not_found');
select tests.throws(format('select public.discard_workout_session(%L)', :'s1'), 'C2 は C1 のセッションを破棄できない', 'P0002', 'session_not_found');
select tests.ok(not exists (select 1 from public.get_previous_sets(:'s1')), 'C2 は C1 の前回記録を取得できない');

select tests.login('t1');
select tests.ok((select count(*) from public.set_logs where session_id = :'s1') = 10, 'T1 は担当クライアントのセット記録を見られる');
select tests.affects(format('update public.set_logs set actual_reps = 1 where id = %L', :'set_bench_1'), 0, 'トレーナーはクライアントの実績を書き換えられない');

select tests.login('t2');
select tests.ok((select count(*) from public.set_logs) = 0, 'T2 には T1 のクライアントのセット記録が見えない');
select tests.ok((select count(*) from public.workout_sessions) = 0, 'T2 には T1 のクライアントのセッションが見えない');

select tests.login('c1');
select public.complete_workout_session(:'s1');
select tests.ok((select status from public.workout_sessions where id = :'s1') = 'completed', 'トレーニング完了でステータスが completed になる');
select tests.throws(format('select public.discard_workout_session(%L)', :'s1'), '完了済みセッションは破棄できない', 'P0002', 'session_not_found');
select tests.affects(format('update public.set_logs set actual_reps = 9 where id = %L', :'set_bench_2'), 1, '完了後も自分の実績は修正できる');

-- 前回記録（1 回目のセッションを過去にずらしてから 2 回目を開始）
reset role;
update public.workout_sessions set started_at = now() - interval '3 days', performed_date = current_date - 2 where id = :'s1';
select tests.login('c1');
set role authenticated;
select public.start_workout_session(:'plan_c1', current_date) as s2 \gset
select tests.ok(:'s2' <> :'s1', '完了済みの日のあとは新しいセッションが作られる');
select tests.ok((select count(*) from public.get_previous_sets(:'s2') where exercise_key = 'ベンチプレス') = 2, '前回記録: ベンチプレスは完了した 2 セットが返る');
select tests.ok(
  (select string_agg(actual_weight_kg::text || 'x' || actual_reps::text, ',' order by set_number) from public.get_previous_sets(:'s2') where exercise_key = 'ベンチプレス') = '80.00x8,77.50x9',
  '前回記録の値が正しい（80x8, 77.5x9）');
select tests.ok(not exists (select 1 from public.get_previous_sets(:'s2') where exercise_key = 'サイドレイズ'), '前回セットを完了していない種目は空');
select tests.ok(not exists (select 1 from public.get_previous_sets(:'s1')), '最初のセッションには前回記録が無い');

select tests.login('t1');
select tests.ok((select count(*) from public.get_previous_sets(:'s2')) = 2, 'トレーナーも担当クライアントの前回記録を見られる');

select tests.login('c1');
select public.discard_workout_session(:'s2');
select tests.ok(not exists (select 1 from public.workout_sessions where id = :'s2'), '実施中のセッションは破棄できる');

-- ---------------------------------------------------------------------
-- 10. トレーナーのダッシュボード
-- ---------------------------------------------------------------------
select tests.login('t1');
select tests.ok((select count(*) from public.get_trainer_dashboard(current_date)) = 3, 'T1 のダッシュボードには担当 3 人が出る');
select tests.ok((select sleep from public.get_trainer_dashboard(current_date) where client_id = tests.uid('c1')) = 6, 'ダッシュボードに今日のチェックインが出る');
select tests.ok((select last_session_status from public.get_trainer_dashboard(current_date) where client_id = tests.uid('c1')) = 'completed', 'ダッシュボードに直近のトレーニングが出る');
select tests.ok((select checkin_date from public.get_trainer_dashboard(current_date) where client_id = tests.uid('c4')) is null, '未入力のクライアントはチェックインが空');

select tests.login('t2');
select tests.ok((select count(*) from public.get_trainer_dashboard(current_date)) = 1, 'T2 のダッシュボードには C3 だけ');

select tests.login('c1');
select tests.ok((select count(*) from public.get_trainer_dashboard(current_date)) = 0, 'クライアントがダッシュボードを呼んでも何も返らない');

-- ---------------------------------------------------------------------
-- 11. トレーナーのコメント
-- ---------------------------------------------------------------------
select tests.login('t1');
insert into public.trainer_comments (trainer_id, client_id, session_id, body)
values (tests.uid('t1'), tests.uid('c1'), :'s1', '今日は3セット目でRPE高かったので、次回は75kgでいきましょう。');
select tests.throws(
  format('insert into public.trainer_comments (trainer_id, client_id, body) values (%L, %L, %L)', tests.uid('t1'), tests.uid('c3'), 'x'),
  'T1 は担当外の C3 にコメントできない', '42501');
select tests.throws(
  format('insert into public.trainer_comments (trainer_id, client_id, session_id, body) values (%L, %L, %L, %L)', tests.uid('t1'), tests.uid('c2'), :'s1', 'x'),
  '他のクライアントのセッションを紐づけたコメントは作れない', '42501');
select tests.throws(
  format('insert into public.trainer_comments (trainer_id, client_id, body) values (%L, %L, %L)', tests.uid('t2'), tests.uid('c1'), 'x'),
  'T1 は他のトレーナー名義でコメントできない', '42501');

select tests.login('t2');
select tests.throws(
  format('insert into public.trainer_comments (trainer_id, client_id, body) values (%L, %L, %L)', tests.uid('t2'), tests.uid('c1'), 'x'),
  'T2 は T1 のクライアントにコメントできない', '42501');
select tests.ok((select count(*) from public.trainer_comments) = 0, 'T2 には T1 のコメントが見えない');

select tests.login('c1');
select tests.ok((select count(*) from public.trainer_comments) = 1, 'C1 は自分宛てのコメントを見られる');
select tests.ok(public.mark_comments_read() = 1, 'C1 はコメントを既読にできる');
select tests.ok((select read_at from public.trainer_comments limit 1) is not null, '既読時刻が入る');
select tests.throws(
  format('insert into public.trainer_comments (trainer_id, client_id, body) values (%L, %L, %L)', tests.uid('t1'), tests.uid('c1'), 'x'),
  'クライアントはコメントを作れない', '42501');
select tests.affects('delete from public.trainer_comments', 0, 'クライアントはコメントを削除できない');

select tests.login('c2');
select tests.ok((select count(*) from public.trainer_comments) = 0, 'C2 には C1 宛てのコメントが見えない');
select tests.ok(public.mark_comments_read() = 0, 'C2 の既読処理は C1 のコメントに影響しない');

select tests.login('t1');
select tests.affects('delete from public.trainer_comments', 1, 'T1 は自分のコメントを削除できる');

-- ---------------------------------------------------------------------
-- 12. 担当関係・招待の見え方
-- ---------------------------------------------------------------------
select tests.login('c1');
select tests.ok((select count(*) from public.trainer_clients) = 1, 'C1 に見える担当関係は自分の 1 件だけ');
select tests.ok((select count(*) from public.client_invites) = 0, 'クライアントには招待コードが見えない');

select tests.login('t1');
select tests.ok((select count(*) from public.trainer_clients) = 3, 'T1 に見える担当関係は 3 件');
select tests.ok(exists (select 1 from public.get_exercise_name_suggestions() where name = 'ベンチプレス'), '種目名の候補が取れる');

select tests.login('t2');
select tests.ok(not exists (select 1 from public.get_exercise_name_suggestions()), 'T2 の候補に T1 の種目は出ない');

-- ---------------------------------------------------------------------
-- 12. セットごとの目標
-- ---------------------------------------------------------------------
select tests.login('t1');
select public.save_workout_plan(
  null, tests.uid('c1'), 'ピラミッド', null, null,
  '[
    {"name": "デッドリフト", "sets": [{"weight_kg": 100, "reps": 8}, {"weight_kg": 110, "reps": 5}, {"weight_kg": 120.255, "reps": 3}], "rest_seconds": 180},
    {"name": "懸垂", "sets": [{"weight_kg": null, "reps": 10}, {"reps": 8, "weight_kg": 5}], "rest_seconds": 120},
    {"name": "プランク", "target_weight_kg": null, "target_reps": 60, "target_sets": 2, "rest_seconds": 60}
  ]'::jsonb
) as plan_pyr \gset

select id as ex_dead from public.plan_exercises where plan_id = :'plan_pyr' and position = 1 \gset
select tests.ok((select target_sets from public.plan_exercises where id = :'ex_dead') = 3, 'セットごとの目標: セット数は配列の長さになる');
select tests.ok((select target_weight_kg = 100 and target_reps = 8 from public.plan_exercises where id = :'ex_dead'), 'セットごとの目標: 種目の目標には 1 セット目の値が入る');
select tests.ok(
  (select set_targets::text from public.plan_exercises where id = :'ex_dead')
    = '[{"reps": 8, "weight_kg": 100}, {"reps": 5, "weight_kg": 110}, {"reps": 3, "weight_kg": 120.26}]',
  'セットごとの目標が保存される（重量は小数第2位に丸め、余分な 0 は付けない）');
select tests.ok((select set_targets -> 0 -> 'weight_kg' from public.plan_exercises where plan_id = :'plan_pyr' and position = 2) = 'null'::jsonb, '自重のセット（重量 null）も保存できる');
select tests.ok(
  (select set_targets from public.plan_exercises where plan_id = :'plan_pyr' and position = 3)
    = '[{"weight_kg": null, "reps": 60}, {"weight_kg": null, "reps": 60}]'::jsonb,
  '旧形式（sets なし）は全セット同じ目標として保存される');

select tests.throws(format($q$select public.save_workout_plan(null, %L, 'x', null, null, '[{"name":"a","sets":[]}]')$q$, tests.uid('c1')),
  'セット 0 件は保存できない', '22023', 'invalid_set_targets');
select tests.throws(format($q$select public.save_workout_plan(null, %L, 'x', null, null, '[{"name":"a","sets":[{"reps":0}]}]')$q$, tests.uid('c1')),
  '回数 0 は保存できない', '22023', 'invalid_set_targets');
select tests.throws(format($q$select public.save_workout_plan(null, %L, 'x', null, null, '[{"name":"a","sets":[{"reps":8.5}]}]')$q$, tests.uid('c1')),
  '回数が小数だと保存できない', '22023', 'invalid_set_targets');
select tests.throws(format($q$select public.save_workout_plan(null, %L, 'x', null, null, '[{"name":"a","sets":[{"reps":"8"}]}]')$q$, tests.uid('c1')),
  '回数が文字列だと保存できない', '22023', 'invalid_set_targets');
select tests.throws(format($q$select public.save_workout_plan(null, %L, 'x', null, null, '[{"name":"a","sets":[{"weight_kg":-1,"reps":8}]}]')$q$, tests.uid('c1')),
  '重量がマイナスだと保存できない', '22023', 'invalid_set_targets');
select tests.throws(format($q$select public.save_workout_plan(null, %L, 'x', null, null, '[{"name":"a","sets":[{"weight_kg":"60","reps":8}]}]')$q$, tests.uid('c1')),
  '重量が文字列だと保存できない', '22023', 'invalid_set_targets');
select tests.throws(format($q$select public.save_workout_plan(null, %L, 'x', null, null, '[{"name":"a","sets":{"reps":8}}]')$q$, tests.uid('c1')),
  'sets が配列でないと保存できない', '22023', 'invalid_set_targets');
select tests.throws(
  format($q$select public.save_workout_plan(null, %L, 'x', null, null, %L)$q$, tests.uid('c1'),
    jsonb_build_array(jsonb_build_object('name', 'a', 'sets', (select jsonb_agg(jsonb_build_object('reps', 5)) from generate_series(1, 21))))),
  'セット数の上限（20）を超えると保存できない', '22023', 'invalid_set_targets');

select tests.throws(format($q$update public.plan_exercises set set_targets = '[{"weight_kg": 1, "reps": 1}]' where id = %L$q$, :'ex_dead'),
  'セット数と合わない set_targets は直接書き込めない', '23514');
select tests.throws(format($q$update public.plan_exercises set set_targets = '[{"reps": 1}, {"reps": 1}, {"reps": "x"}]' where id = %L$q$, :'ex_dead'),
  '形式が不正な set_targets は直接書き込めない', '23514');

select tests.login('t2');
select tests.affects(format($q$update public.plan_exercises set set_targets = null where id = %L$q$, :'ex_dead'), 0, 'T2 は T1 のメニューのセットごとの目標を書き換えられない');

select tests.login('c2');
select tests.ok(not exists (select 1 from public.plan_exercises where id = :'ex_dead'), 'C2 には C1 のセットごとの目標が見えない');

select tests.login('c1');
select tests.affects(format($q$update public.plan_exercises set set_targets = null where id = %L$q$, :'ex_dead'), 0, 'C1 はセットごとの目標を書き換えられない');
select tests.ok((select jsonb_array_length(set_targets) from public.plan_exercises where id = :'ex_dead') = 3, 'C1 には自分のメニューのセットごとの目標が見える');

select public.start_workout_session(:'plan_pyr', current_date) as s_pyr \gset
select se.id as se_dead from public.session_exercises se where se.session_id = :'s_pyr' and se.position = 1 \gset
select tests.ok(
  (select array_agg(array[target_weight_kg, target_reps::numeric] order by set_number) from public.set_logs where session_exercise_id = :'se_dead')
    = array[array[100, 8], array[110, 5], array[120.26, 3]]::numeric[],
  '開始するとセット行にセットごとの目標（重量・回数）が入る');
select tests.ok(
  (select array_agg(sl.target_weight_kg order by sl.set_number)
     from public.set_logs sl join public.session_exercises se on se.id = sl.session_exercise_id
    where se.session_id = :'s_pyr' and se.position = 2)
    is not distinct from array[null, 5]::numeric[],
  '自重のセット（重量なし）もセット行に反映される');
select tests.ok((select (public.add_set(:'se_dead')).target_weight_kg) = 120.26, 'セット追加では直前のセットの目標をコピーする');
select tests.ok((select target_reps from public.set_logs where session_exercise_id = :'se_dead' and set_number = 4) = 3, '追加したセットの回数も直前のセットと同じ');

-- set_targets が無い（この変更より前に作られた）種目は、種目の目標で全セットを作る
reset role;
update public.plan_exercises set set_targets = null where plan_id = :'plan_pyr' and position = 3;
set role authenticated;
select public.start_workout_session(:'plan_pyr', current_date + 1) as s_pyr2 \gset
select tests.ok(
  (select count(*)
     from public.set_logs sl join public.session_exercises se on se.id = sl.session_exercise_id
    where se.session_id = :'s_pyr2' and se.position = 3 and sl.target_reps = 60 and sl.target_weight_kg is null) = 2,
  'set_targets が無い種目は種目の目標で全セット作られる');

-- ---------------------------------------------------------------------
-- 13. 記録の削除
-- ---------------------------------------------------------------------
select tests.login('t1');
insert into public.trainer_comments (trainer_id, client_id, session_id, body)
values (tests.uid('t1'), tests.uid('c1'), :'s1', '記録へのコメント')
returning id as comment_s1 \gset

select tests.login('c2');
select tests.affects(format('delete from public.workout_sessions where id = %L', :'s1'), 0, 'C2 は C1 の記録を削除できない');
select tests.login('t2');
select tests.affects(format('delete from public.workout_sessions where id = %L', :'s1'), 0, 'T2 は担当外の C1 の記録を削除できない');

select tests.login('c1');
select tests.affects(format('delete from public.workout_sessions where id = %L', :'s1'), 1, 'C1 は自分の記録（完了済み）を削除できる');
select tests.ok(not exists (select 1 from public.set_logs where session_id = :'s1'), '記録を削除するとセットもまとめて消える');
select tests.ok(not exists (select 1 from public.session_exercises where session_id = :'s1'), '記録を削除すると種目もまとめて消える');
select tests.ok(
  (select session_id from public.trainer_comments where id = :'comment_s1') is null,
  '記録へのコメントは残り、記録とのつながりだけ外れる');

select tests.login('t1');
select tests.affects(format('delete from public.workout_sessions where id = %L', :'s_pyr2'), 1, 'T1 は担当クライアントの記録を削除できる');

reset role;
select set_config('request.jwt.claims', '', false);
set role anon;
select tests.throws(format('delete from public.workout_sessions where id = %L', :'s_pyr'), '未ログインでは記録を削除できない', '42501');
reset role;
set role authenticated;

-- ---------------------------------------------------------------------
-- 14. クライアントの削除（担当から外す）
-- ---------------------------------------------------------------------
select tests.login('c2');
select public.start_workout_session(:'plan_c2', current_date) as s_c2 \gset

select tests.login('c1');
select tests.throws(format('select public.remove_client(%L)', tests.uid('c2')), 'クライアントは他のクライアントを削除できない', 'P0002', 'client_not_found');
select tests.login('t2');
select tests.throws(format('select public.remove_client(%L)', tests.uid('c2')), 'T2 は T1 のクライアントを削除できない', 'P0002', 'client_not_found');

select tests.login('t1');
select public.remove_client(tests.uid('c2'));
select tests.ok(
  (select status from public.trainer_clients where trainer_id = tests.uid('t1') and client_id = tests.uid('c2')) = 'archived',
  '削除すると担当関係は archived になる（行は残る）');
select tests.ok(not exists (select 1 from public.profiles where id = tests.uid('c2')), '削除したクライアントのプロフィールは見えない');
select tests.ok(not exists (select 1 from public.workout_sessions where client_id = tests.uid('c2')), '削除したクライアントの記録は見えない');
select tests.ok(not exists (select 1 from public.checkins where client_id = tests.uid('c2')), '削除したクライアントの体調は見えない');
select tests.ok(
  not exists (select 1 from public.get_trainer_dashboard(current_date) d where d.client_id = tests.uid('c2')),
  '削除したクライアントはダッシュボードから消える');
select tests.ok(
  exists (select 1 from public.get_trainer_dashboard(current_date) d where d.client_id = tests.uid('c1')),
  'ほかのクライアントはそのまま');
select tests.throws(
  format($q$select public.save_workout_plan(null, %L, 'x', null, null, '[{"name":"a","target_reps":1,"target_sets":1}]')$q$, tests.uid('c2')),
  '削除したクライアントにはメニューを作れない', '42501');
select tests.throws(format('select public.remove_client(%L)', tests.uid('c2')), '同じクライアントを二度は削除できない', 'P0002', 'client_not_found');

select tests.login('c2');
select tests.ok(not exists (select 1 from public.workout_plans where id = :'plan_c2'), '削除されたクライアントには元トレーナーのメニューが見えない');
select tests.ok(not exists (select 1 from public.plan_exercises where plan_id = :'plan_c2'), '元トレーナーのメニューの種目も見えない');
select tests.throws(format('select public.start_workout_session(%L, current_date - 1)', :'plan_c2'), '元トレーナーのメニューは開始できない', 'P0002', 'plan_not_found');
select tests.ok(exists (select 1 from public.workout_sessions where id = :'s_c2'), 'クライアント本人の記録は残る');
select tests.ok(not exists (select 1 from public.profiles where id = tests.uid('t1')), '元トレーナーのプロフィールは見えなくなる');

select tests.login('t1');
select code as inv_back from public.create_client_invite('戻ってきた') \gset
select tests.login('c2');
select public.accept_invite(:'inv_back');
select tests.ok(exists (select 1 from public.workout_plans where id = :'plan_c2'), '再招待でつなぎ直すとメニューがまた見える');
select tests.login('t1');
select tests.ok(exists (select 1 from public.workout_sessions where id = :'s_c2'), '再招待でつなぎ直すと記録がまた見える');

reset role;
select 'ALL TESTS PASSED' as result;

rollback;
