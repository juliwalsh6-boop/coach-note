-- =====================================================================
-- セットごとの目標（重量・回数）
--
-- plan_exercises.set_targets: [{ "weight_kg": 60 | null, "reps": 10 }, ...]
--   - 配列の長さ = target_sets
--   - target_weight_kg / target_reps には 1 セット目の値を入れる（一覧表示・旧画面との互換用）
--   - null の行は「全セット同じ」（target_weight_kg × target_reps × target_sets）として扱う
--
-- 旧画面（sets を送らない）からの保存にも対応するので、DB → 画面の順に反映して問題ありません。
-- =====================================================================

alter table public.plan_exercises add column if not exists set_targets jsonb;

comment on column public.plan_exercises.set_targets is
  'セットごとの目標 [{"weight_kg": number|null, "reps": integer}]。長さは target_sets と同じ。null = 全セット同じ';

-- ---------------------------------------------------------------------
-- 形式チェック（CHECK 制約から使う）
-- ---------------------------------------------------------------------
create or replace function private.valid_set_targets(p_targets jsonb, p_sets integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_targets) is distinct from 'array' then false
    when jsonb_array_length(p_targets) <> p_sets then false
    else not exists (
      select 1
        from jsonb_array_elements(p_targets) as t (item)
       where case
               when jsonb_typeof(t.item) <> 'object' then true
               when jsonb_typeof(t.item -> 'reps') is distinct from 'number' then true
               when coalesce(jsonb_typeof(t.item -> 'weight_kg'), 'null') not in ('number', 'null') then true
               else (t.item ->> 'reps')::numeric not between 1 and 999
                 or (t.item ->> 'reps')::numeric <> trunc((t.item ->> 'reps')::numeric)
                 or coalesce((t.item ->> 'weight_kg')::numeric not between 0 and 999.99, false)
             end
    )
  end;
$$;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'plan_exercises_set_targets_check'
       and conrelid = 'public.plan_exercises'::regclass
  ) then
    alter table public.plan_exercises
      add constraint plan_exercises_set_targets_check
      check (set_targets is null or private.valid_set_targets(set_targets, target_sets));
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- save_workout_plan 用: 1 種目分の入力からセットごとの目標（正規化済み）を作る
--   p_item.sets があればそれを使い、無ければ（旧画面）target_weight_kg × target_reps × target_sets から作る
-- ---------------------------------------------------------------------
create or replace function private.build_set_targets(p_item jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_sets jsonb := p_item -> 'sets';
  v_count integer;
  v_set jsonb;
  v_reps numeric;
  v_weight numeric;
  v_result jsonb := '[]'::jsonb;
begin
  if v_sets is null or jsonb_typeof(v_sets) = 'null' then
    v_count := nullif(p_item ->> 'target_sets', '')::integer;
    if v_count is null or v_count not between 1 and 20 then
      raise exception using errcode = '22023', message = 'invalid_set_targets';
    end if;
    select jsonb_agg(
             jsonb_build_object(
               'weight_kg', nullif(p_item ->> 'target_weight_kg', '')::numeric,
               'reps', nullif(p_item ->> 'target_reps', '')::numeric
             )
           )
      into v_sets
      from generate_series(1, v_count);
  end if;

  if jsonb_typeof(v_sets) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'invalid_set_targets';
  end if;
  if jsonb_array_length(v_sets) not between 1 and 20 then
    raise exception using errcode = '22023', message = 'invalid_set_targets';
  end if;

  for v_set in select value from jsonb_array_elements(v_sets) loop
    if jsonb_typeof(v_set) <> 'object'
       or jsonb_typeof(v_set -> 'reps') is distinct from 'number'
       or coalesce(jsonb_typeof(v_set -> 'weight_kg'), 'null') not in ('number', 'null') then
      raise exception using errcode = '22023', message = 'invalid_set_targets';
    end if;

    v_reps := (v_set ->> 'reps')::numeric;
    v_weight := trim_scale(round((v_set ->> 'weight_kg')::numeric, 2));
    if v_reps not between 1 and 999
       or v_reps <> trunc(v_reps)
       or (v_weight is not null and v_weight not between 0 and 999.99) then
      raise exception using errcode = '22023', message = 'invalid_set_targets';
    end if;

    v_result := v_result || jsonb_build_array(jsonb_build_object('weight_kg', v_weight, 'reps', v_reps::integer));
  end loop;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------
-- メニューと種目を 1 トランザクションで保存（RLS がそのまま適用される SECURITY INVOKER）
--   p_exercises: [{ id?, name, sets: [{ weight_kg, reps }, ...], rest_seconds, note }, ...]
--   旧形式 [{ id?, name, target_weight_kg, target_reps, target_sets, rest_seconds, note }] も受け付ける
--   配列の順番がそのまま種目の並び順になる
-- ---------------------------------------------------------------------
create or replace function public.save_workout_plan(
  p_plan_id uuid,
  p_client_id uuid,
  p_title text,
  p_scheduled_date date,
  p_note text,
  p_exercises jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_plan_id uuid;
  v_item jsonb;
  v_pos integer := 0;
  v_keep uuid[];
  v_ex_id uuid;
  v_targets jsonb;
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'not_authenticated';
  end if;
  if jsonb_typeof(p_exercises) is distinct from 'array' or jsonb_array_length(p_exercises) = 0 then
    raise exception using errcode = '22023', message = 'exercises_required';
  end if;
  if jsonb_array_length(p_exercises) > 30 then
    raise exception using errcode = '22023', message = 'too_many_exercises';
  end if;

  if p_plan_id is null then
    insert into public.workout_plans (trainer_id, client_id, title, scheduled_date, note)
    values (v_uid, p_client_id, btrim(p_title), p_scheduled_date, nullif(btrim(coalesce(p_note, '')), ''))
    returning id into v_plan_id;
  else
    update public.workout_plans
       set title = btrim(p_title),
           scheduled_date = p_scheduled_date,
           note = nullif(btrim(coalesce(p_note, '')), '')
     where id = p_plan_id
       and trainer_id = v_uid
    returning id into v_plan_id;

    if v_plan_id is null then
      raise exception using errcode = 'P0002', message = 'plan_not_found';
    end if;
  end if;

  -- 送られてこなかった既存種目は削除
  select coalesce(array_agg((e ->> 'id')::uuid), '{}')
    into v_keep
    from jsonb_array_elements(p_exercises) e
   where nullif(e ->> 'id', '') is not null;

  delete from public.plan_exercises
   where plan_id = v_plan_id
     and not (id = any (v_keep));

  for v_item in select value from jsonb_array_elements(p_exercises) loop
    v_pos := v_pos + 1;
    v_ex_id := nullif(v_item ->> 'id', '')::uuid;
    v_targets := private.build_set_targets(v_item);

    if v_ex_id is not null then
      update public.plan_exercises
         set position = v_pos,
             name = v_item ->> 'name',
             target_weight_kg = (v_targets -> 0 ->> 'weight_kg')::numeric,
             target_reps = (v_targets -> 0 ->> 'reps')::integer,
             target_sets = jsonb_array_length(v_targets),
             set_targets = v_targets,
             rest_seconds = coalesce(nullif(v_item ->> 'rest_seconds', '')::integer, 90),
             note = nullif(btrim(coalesce(v_item ->> 'note', '')), '')
       where id = v_ex_id
         and plan_id = v_plan_id;
      if not found then
        v_ex_id := null; -- 別メニューの ID などは新規として扱う
      end if;
    end if;

    if v_ex_id is null then
      insert into public.plan_exercises (
        plan_id, position, name, exercise_key,
        target_weight_kg, target_reps, target_sets, set_targets, rest_seconds, note
      ) values (
        v_plan_id,
        v_pos,
        v_item ->> 'name',
        '', -- トリガーで上書き
        (v_targets -> 0 ->> 'weight_kg')::numeric,
        (v_targets -> 0 ->> 'reps')::integer,
        jsonb_array_length(v_targets),
        v_targets,
        coalesce(nullif(v_item ->> 'rest_seconds', '')::integer, 90),
        nullif(btrim(coalesce(v_item ->> 'note', '')), '')
      );
    end if;
  end loop;

  return v_plan_id;
end;
$$;

-- ---------------------------------------------------------------------
-- トレーニング開始: メニューをスナップショットしてセッションとセット行を作る
--   セット行の目標値はセットごとの目標（set_targets）から、無ければ種目の目標から入れる
--   同じ日・同じメニューの実施中セッションがあればそれを返す（二重作成を防ぐ）
-- ---------------------------------------------------------------------
create or replace function public.start_workout_session(p_plan_id uuid, p_local_date date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_plan public.workout_plans%rowtype;
  v_session_id uuid;
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'not_authenticated';
  end if;
  if p_local_date is null or p_local_date not between (current_date - 2) and (current_date + 2) then
    raise exception using errcode = '22023', message = 'invalid_date';
  end if;

  select * into v_plan
    from public.workout_plans
   where id = p_plan_id and client_id = v_uid;
  if not found then
    raise exception using errcode = 'P0002', message = 'plan_not_found';
  end if;

  select ws.id into v_session_id
    from public.workout_sessions ws
   where ws.client_id = v_uid
     and ws.plan_id = p_plan_id
     and ws.performed_date = p_local_date
     and ws.status = 'in_progress'
   order by ws.started_at desc
   limit 1;
  if v_session_id is not null then
    return v_session_id;
  end if;

  if not exists (select 1 from public.plan_exercises pe where pe.plan_id = p_plan_id) then
    raise exception using errcode = 'P0001', message = 'plan_empty';
  end if;

  insert into public.workout_sessions (client_id, trainer_id, plan_id, title, performed_date)
  values (v_uid, v_plan.trainer_id, v_plan.id, v_plan.title, p_local_date)
  returning id into v_session_id;

  with inserted as (
    insert into public.session_exercises (
      session_id, client_id, plan_exercise_id, position, name, exercise_key,
      target_weight_kg, target_reps, target_sets, rest_seconds, note
    )
    select
      v_session_id, v_uid, pe.id, pe.position, pe.name, pe.exercise_key,
      pe.target_weight_kg, pe.target_reps, pe.target_sets, pe.rest_seconds, pe.note
    from public.plan_exercises pe
    where pe.plan_id = p_plan_id
    returning id, plan_exercise_id, target_weight_kg, target_reps, target_sets
  )
  insert into public.set_logs (session_exercise_id, session_id, client_id, set_number, target_weight_kg, target_reps)
  select
    ins.id,
    v_session_id,
    v_uid,
    gs.n,
    case when pe.set_targets is null then ins.target_weight_kg
         else (pe.set_targets -> (gs.n - 1) ->> 'weight_kg')::numeric end,
    case when pe.set_targets is null then ins.target_reps
         else (pe.set_targets -> (gs.n - 1) ->> 'reps')::integer end
  from inserted ins
  left join public.plan_exercises pe on pe.id = ins.plan_exercise_id
  cross join lateral generate_series(1, ins.target_sets) as gs (n);

  return v_session_id;
end;
$$;

-- ---------------------------------------------------------------------
-- セットを 1 つ追加（目標値は直前のセットをコピー。セットが無ければ種目の目標）
-- ---------------------------------------------------------------------
create or replace function public.add_set(p_session_exercise_id uuid)
returns public.set_logs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_se public.session_exercises%rowtype;
  v_last public.set_logs%rowtype;
  v_next integer;
  v_row public.set_logs;
begin
  select * into v_se
    from public.session_exercises
   where id = p_session_exercise_id and client_id = v_uid;
  if not found then
    raise exception using errcode = 'P0002', message = 'exercise_not_found';
  end if;

  select * into v_last
    from public.set_logs
   where session_exercise_id = v_se.id
   order by set_number desc
   limit 1;

  v_next := coalesce(v_last.set_number, 0) + 1;
  if v_next > 20 then
    raise exception using errcode = 'P0001', message = 'too_many_sets';
  end if;

  insert into public.set_logs (session_exercise_id, session_id, client_id, set_number, target_weight_kg, target_reps)
  values (
    v_se.id,
    v_se.session_id,
    v_uid,
    v_next,
    case when v_last.id is null then v_se.target_weight_kg else v_last.target_weight_kg end,
    case when v_last.id is null then v_se.target_reps else v_last.target_reps end
  )
  returning * into v_row;
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------
-- 権限
-- ---------------------------------------------------------------------
revoke all on function private.valid_set_targets(jsonb, integer) from public, anon;
revoke all on function private.build_set_targets(jsonb) from public, anon;
grant execute on function private.valid_set_targets(jsonb, integer) to authenticated, service_role;
grant execute on function private.build_set_targets(jsonb) to authenticated, service_role;

revoke all on function public.save_workout_plan(uuid, uuid, text, date, text, jsonb) from public, anon, authenticated;
revoke all on function public.start_workout_session(uuid, date) from public, anon, authenticated;
revoke all on function public.add_set(uuid) from public, anon, authenticated;
grant execute on function public.save_workout_plan(uuid, uuid, text, date, text, jsonb) to authenticated;
grant execute on function public.start_workout_session(uuid, date) to authenticated;
grant execute on function public.add_set(uuid) to authenticated;
