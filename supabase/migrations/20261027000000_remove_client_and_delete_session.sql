-- =====================================================================
-- クライアントの削除（担当から外す）と、トレーニング記録の削除
--
-- クライアントの削除:
--   trainer_clients.status を 'archived' にする（行は消さない）。
--   - トレーナーからは、そのクライアントのプロフィール・体調・記録が見えなくなる（is_trainer_of が false になる）
--   - クライアントからは、そのトレーナーのメニューが見えなくなる（下の RLS 変更）
--   - クライアントのアカウントと記録は残る。新しい招待リンクで再びつなぐと元どおり見える
--
-- 記録の削除:
--   本人と担当トレーナーが workout_sessions を削除できる
--   （種目・セットは外部キーの on delete cascade でまとめて消え、コメントは session_id が null になって残る）
-- =====================================================================

-- ---------------------------------------------------------------------
-- クライアントの削除（トレーナーのみ・自分の担当だけ）
-- ---------------------------------------------------------------------
create or replace function public.remove_client(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'not_authenticated';
  end if;

  update public.trainer_clients
     set status = 'archived'
   where trainer_id = v_uid
     and client_id = p_client_id
     and status = 'active';
  if not found then
    raise exception using errcode = 'P0002', message = 'client_not_found';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 担当から外れたトレーナーのメニューは、クライアントに見せない
-- ---------------------------------------------------------------------
alter policy "workout_plans_select" on public.workout_plans
  using (
    trainer_id = (select auth.uid())
    or (client_id = (select auth.uid()) and private.is_client_of(trainer_id))
  );

alter policy "plan_exercises_select" on public.plan_exercises
  using (
    exists (
      select 1 from public.workout_plans wp
      where wp.id = plan_exercises.plan_id
        and (
          wp.trainer_id = (select auth.uid())
          or (wp.client_id = (select auth.uid()) and private.is_client_of(wp.trainer_id))
        )
    )
  );

-- ---------------------------------------------------------------------
-- トレーニング開始: 担当関係が続いているトレーナーのメニューだけ開始できる
--   （それ以外は 20261026000000_per_set_targets.sql と同じ）
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
   where id = p_plan_id
     and client_id = v_uid
     and private.is_client_of(trainer_id);
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
-- 記録の削除（本人・担当トレーナー）
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
      from pg_policies
     where schemaname = 'public'
       and tablename = 'workout_sessions'
       and policyname = 'workout_sessions_delete'
  ) then
    create policy "workout_sessions_delete" on public.workout_sessions
      for delete to authenticated
      using (client_id = (select auth.uid()) or private.is_trainer_of(client_id));
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 権限
-- ---------------------------------------------------------------------
grant delete on public.workout_sessions to authenticated;

revoke all on function public.remove_client(uuid) from public, anon, authenticated;
grant execute on function public.remove_client(uuid) to authenticated;

revoke all on function public.start_workout_session(uuid, date) from public, anon, authenticated;
grant execute on function public.start_workout_session(uuid, date) to authenticated;
