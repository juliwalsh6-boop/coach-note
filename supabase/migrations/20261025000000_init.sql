-- =====================================================================
-- COACH NOTE — 初期スキーマ
--
-- Supabase の SQL Editor に全文を貼り付けて Run してください。
-- 全体を 1 トランザクションで実行するので、途中で失敗した場合は何も反映されません。
--
-- 設計の要点
--   * すべてのテーブルで RLS を有効化。アクセス制御はデータベース側で完結します。
--   * クライアントは自分のデータだけ、トレーナーは「担当中のクライアント」のデータだけ見られます。
--   * 担当関係 (trainer_clients) は招待コード経由でしか作れません。
--   * 目標値（トレーナーが決める値）と実績値（クライアントが記録する値）は別カラムで保存します。
--   * セッション開始時にメニューをスナップショットするので、後でメニューを編集しても履歴は変わりません。
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. スキーマ
--    private スキーマは Data API に公開されない内部用（ヘルパー関数・トリガー関数）
-- ---------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

grant usage on schema public to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 1. テーブル
-- ---------------------------------------------------------------------

-- 利用者プロフィール（auth.users と 1:1）
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'client' check (role in ('trainer', 'client')),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profiles is '利用者（トレーナー / クライアント）';

-- 担当関係（トレーナー ↔ クライアント）
create table if not exists public.trainer_clients (
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  primary key (trainer_id, client_id),
  check (trainer_id <> client_id)
);
create index if not exists trainer_clients_client_id_idx on public.trainer_clients (client_id);
comment on table public.trainer_clients is '担当関係。招待コードの利用時にのみ作成される';

-- 招待コード
create table if not exists public.client_invites (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  code text not null unique,
  label text check (char_length(label) <= 40),
  expires_at timestamptz not null default (now() + interval '14 days'),
  used_by uuid references public.profiles (id) on delete set null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists client_invites_trainer_id_idx on public.client_invites (trainer_id, created_at desc);
comment on table public.client_invites is 'クライアント招待コード（1回限り・14日有効）';

-- 朝のコンディションチェック（1日1件）
create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  checkin_date date not null,
  sleep smallint not null check (sleep between 1 and 10),
  fatigue smallint not null check (fatigue between 1 and 10),
  soreness smallint not null check (soreness between 1 and 10),
  stress smallint not null check (stress between 1 and 10),
  motivation smallint not null check (motivation between 1 and 10),
  body_weight_kg numeric(5, 2) check (body_weight_kg > 0 and body_weight_kg < 500),
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, checkin_date)
);
comment on table public.checkins is '朝のチェックイン。sleep/motivation は高いほど良い、fatigue/soreness/stress は高いほど負担が大きい';

-- トレーニングメニュー（トレーナーがクライアントごとに作成）
create table if not exists public.workout_plans (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 60),
  scheduled_date date, -- null = 日付指定なし（いつでも実施可）
  note text check (char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists workout_plans_client_idx on public.workout_plans (client_id, scheduled_date);
create index if not exists workout_plans_trainer_idx on public.workout_plans (trainer_id, client_id);

-- メニュー内の種目（position で並び順を管理）
create table if not exists public.plan_exercises (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.workout_plans (id) on delete cascade,
  position integer not null check (position >= 1),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  exercise_key text not null, -- 種目名を正規化したキー（前回記録・グラフ用。トリガーで自動設定）
  target_weight_kg numeric(6, 2) check (target_weight_kg >= 0 and target_weight_kg < 1000), -- null = 自重など
  target_reps integer not null check (target_reps between 1 and 999),
  target_sets integer not null check (target_sets between 1 and 20),
  rest_seconds integer not null default 90 check (rest_seconds between 0 and 1800),
  note text check (char_length(note) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists plan_exercises_plan_idx on public.plan_exercises (plan_id, position);

-- 実施したトレーニング（1回のジム訪問 = 1セッション）
create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  trainer_id uuid references public.profiles (id) on delete set null, -- メニュー作成者（参考情報）
  plan_id uuid references public.workout_plans (id) on delete set null,
  title text not null,
  performed_date date not null,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists workout_sessions_client_idx on public.workout_sessions (client_id, performed_date desc, started_at desc);
create index if not exists workout_sessions_plan_idx on public.workout_sessions (plan_id);

-- セッション内の種目（開始時点のメニューのスナップショット = 目標値）
create table if not exists public.session_exercises (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.workout_sessions (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  plan_exercise_id uuid references public.plan_exercises (id) on delete set null,
  position integer not null,
  name text not null,
  exercise_key text not null,
  target_weight_kg numeric(6, 2),
  target_reps integer,
  target_sets integer not null,
  rest_seconds integer not null default 90,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists session_exercises_session_idx on public.session_exercises (session_id, position);
create index if not exists session_exercises_history_idx on public.session_exercises (client_id, exercise_key);

-- セットごとの記録（目標値と実績値を別カラムで保持）
create table if not exists public.set_logs (
  id uuid primary key default gen_random_uuid(),
  session_exercise_id uuid not null references public.session_exercises (id) on delete cascade,
  session_id uuid not null references public.workout_sessions (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  set_number integer not null check (set_number between 1 and 50),
  target_weight_kg numeric(6, 2),
  target_reps integer,
  actual_weight_kg numeric(6, 2) check (actual_weight_kg >= 0 and actual_weight_kg < 1000),
  actual_reps integer check (actual_reps between 0 and 999),
  rpe numeric(3, 1) check (rpe between 1 and 10), -- 将来の拡張用（現在のUIでは未使用）
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_exercise_id, set_number)
);
create index if not exists set_logs_session_idx on public.set_logs (session_id);
create index if not exists set_logs_client_idx on public.set_logs (client_id);

-- トレーナーからのコメント
create table if not exists public.trainer_comments (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  session_id uuid references public.workout_sessions (id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists trainer_comments_client_idx on public.trainer_comments (client_id, created_at desc);
create index if not exists trainer_comments_trainer_idx on public.trainer_comments (trainer_id, client_id);

-- ---------------------------------------------------------------------
-- 2. 内部ヘルパー関数（private スキーマ・API 非公開）
-- ---------------------------------------------------------------------

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- 種目名の正規化: 全角/半角の揺れ・前後の空白・大文字小文字を吸収
create or replace function private.normalize_exercise_name(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(regexp_replace(btrim(normalize(coalesce(p_name, ''), NFKC)), '\s+', ' ', 'g'));
$$;

create or replace function private.set_exercise_key()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  new.exercise_key := private.normalize_exercise_name(new.name);
  return new;
end;
$$;

-- 読み間違えにくい文字だけで 10 桁の招待コードを生成（gen_random_uuid の乱数を利用）
create or replace function private.generate_invite_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  raw bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  result text := '';
  idx integer;
begin
  -- UUID v4 のバージョン/バリアントのビットを含むバイト (6, 8) は使わない
  foreach idx in array array[0, 1, 2, 3, 4, 5, 10, 11, 12, 13] loop
    result := result || substr(alphabet, (get_byte(raw, idx) % 32) + 1, 1);
  end loop;
  return result;
end;
$$;

-- 呼び出しユーザーが、指定クライアントの担当トレーナーか
create or replace function private.is_trainer_of(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.trainer_clients tc
    where tc.trainer_id = auth.uid()
      and tc.client_id = p_client_id
      and tc.status = 'active'
  );
$$;

-- 呼び出しユーザーが、指定トレーナーの担当クライアントか
create or replace function private.is_client_of(p_trainer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.trainer_clients tc
    where tc.client_id = auth.uid()
      and tc.trainer_id = p_trainer_id
      and tc.status = 'active'
  );
$$;

-- 呼び出しユーザーのロール（'trainer' / 'client' / null）
create or replace function private.current_app_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.id = auth.uid();
$$;

-- 招待コードを使って担当関係を作る（内部用）
create or replace function private.redeem_invite(p_user_id uuid, p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.client_invites%rowtype;
begin
  select *
    into v_invite
    from public.client_invites
   where code = upper(btrim(coalesce(p_code, '')))
   for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'invite_not_found';
  end if;
  if v_invite.used_at is not null then
    raise exception using errcode = 'P0001', message = 'invite_already_used';
  end if;
  if v_invite.expires_at <= now() then
    raise exception using errcode = 'P0001', message = 'invite_expired';
  end if;
  if v_invite.trainer_id = p_user_id then
    raise exception using errcode = 'P0001', message = 'invite_self';
  end if;

  insert into public.trainer_clients (trainer_id, client_id, status)
  values (v_invite.trainer_id, p_user_id, 'active')
  on conflict (trainer_id, client_id) do update set status = 'active';

  update public.client_invites
     set used_by = p_user_id,
         used_at = now()
   where id = v_invite.id;

  return v_invite.trainer_id;
end;
$$;

-- サインアップ時にプロフィールを作成し、招待コードがあれば担当関係も作る
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_role text := case when v_meta ->> 'app_role' = 'trainer' then 'trainer' else 'client' end;
  v_name text := left(nullif(btrim(coalesce(v_meta ->> 'display_name', '')), ''), 40);
  v_code text := nullif(btrim(coalesce(v_meta ->> 'invite_code', '')), '');
begin
  insert into public.profiles (id, role, display_name)
  values (
    new.id,
    v_role,
    coalesce(v_name, left(nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 40), 'ユーザー')
  )
  on conflict (id) do nothing;

  if v_role = 'client' and v_code is not null then
    begin
      perform private.redeem_invite(new.id, v_code);
    exception when others then
      -- 招待コードが無効でもアカウント作成は止めない（ログイン後に招待リンクから再度参加できる）
      null;
    end;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. トリガー
-- ---------------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

drop trigger if exists set_updated_at on public.profiles;
create trigger set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

drop trigger if exists set_updated_at on public.checkins;
create trigger set_updated_at before update on public.checkins
  for each row execute function private.set_updated_at();

drop trigger if exists set_updated_at on public.workout_plans;
create trigger set_updated_at before update on public.workout_plans
  for each row execute function private.set_updated_at();

drop trigger if exists set_updated_at on public.plan_exercises;
create trigger set_updated_at before update on public.plan_exercises
  for each row execute function private.set_updated_at();

drop trigger if exists set_updated_at on public.workout_sessions;
create trigger set_updated_at before update on public.workout_sessions
  for each row execute function private.set_updated_at();

drop trigger if exists set_updated_at on public.set_logs;
create trigger set_updated_at before update on public.set_logs
  for each row execute function private.set_updated_at();

drop trigger if exists set_exercise_key on public.plan_exercises;
create trigger set_exercise_key before insert or update of name on public.plan_exercises
  for each row execute function private.set_exercise_key();

drop trigger if exists set_exercise_key on public.session_exercises;
create trigger set_exercise_key before insert or update of name on public.session_exercises
  for each row execute function private.set_exercise_key();

-- ---------------------------------------------------------------------
-- 4. Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.trainer_clients enable row level security;
alter table public.client_invites enable row level security;
alter table public.checkins enable row level security;
alter table public.workout_plans enable row level security;
alter table public.plan_exercises enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.session_exercises enable row level security;
alter table public.set_logs enable row level security;
alter table public.trainer_comments enable row level security;

-- profiles: 自分 / 担当クライアント / 自分の担当トレーナー だけ見える
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or private.is_trainer_of(id)
    or private.is_client_of(id)
  );

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- trainer_clients: 自分が関係する担当関係だけ見える（作成は招待コード経由のみ）
drop policy if exists "trainer_clients_select" on public.trainer_clients;
create policy "trainer_clients_select" on public.trainer_clients
  for select to authenticated
  using (trainer_id = (select auth.uid()) or client_id = (select auth.uid()));

-- client_invites: 発行したトレーナーだけ（作成は create_client_invite 関数経由）
drop policy if exists "client_invites_select" on public.client_invites;
create policy "client_invites_select" on public.client_invites
  for select to authenticated
  using (trainer_id = (select auth.uid()));

drop policy if exists "client_invites_delete" on public.client_invites;
create policy "client_invites_delete" on public.client_invites
  for delete to authenticated
  using (trainer_id = (select auth.uid()));

-- checkins: 本人は読み書き、担当トレーナーは閲覧のみ
drop policy if exists "checkins_select" on public.checkins;
create policy "checkins_select" on public.checkins
  for select to authenticated
  using (client_id = (select auth.uid()) or private.is_trainer_of(client_id));

drop policy if exists "checkins_insert_self" on public.checkins;
create policy "checkins_insert_self" on public.checkins
  for insert to authenticated
  with check (client_id = (select auth.uid()));

drop policy if exists "checkins_update_self" on public.checkins;
create policy "checkins_update_self" on public.checkins
  for update to authenticated
  using (client_id = (select auth.uid()))
  with check (client_id = (select auth.uid()));

-- workout_plans: 作成したトレーナーは編集、対象クライアントは閲覧のみ
drop policy if exists "workout_plans_select" on public.workout_plans;
create policy "workout_plans_select" on public.workout_plans
  for select to authenticated
  using (trainer_id = (select auth.uid()) or client_id = (select auth.uid()));

drop policy if exists "workout_plans_insert" on public.workout_plans;
create policy "workout_plans_insert" on public.workout_plans
  for insert to authenticated
  with check (trainer_id = (select auth.uid()) and private.is_trainer_of(client_id));

drop policy if exists "workout_plans_update" on public.workout_plans;
create policy "workout_plans_update" on public.workout_plans
  for update to authenticated
  using (trainer_id = (select auth.uid()))
  with check (trainer_id = (select auth.uid()) and private.is_trainer_of(client_id));

drop policy if exists "workout_plans_delete" on public.workout_plans;
create policy "workout_plans_delete" on public.workout_plans
  for delete to authenticated
  using (trainer_id = (select auth.uid()));

-- plan_exercises: 親メニューの権限に従う
drop policy if exists "plan_exercises_select" on public.plan_exercises;
create policy "plan_exercises_select" on public.plan_exercises
  for select to authenticated
  using (
    exists (
      select 1 from public.workout_plans wp
      where wp.id = plan_exercises.plan_id
        and (wp.trainer_id = (select auth.uid()) or wp.client_id = (select auth.uid()))
    )
  );

drop policy if exists "plan_exercises_insert" on public.plan_exercises;
create policy "plan_exercises_insert" on public.plan_exercises
  for insert to authenticated
  with check (
    exists (
      select 1 from public.workout_plans wp
      where wp.id = plan_exercises.plan_id and wp.trainer_id = (select auth.uid())
    )
  );

drop policy if exists "plan_exercises_update" on public.plan_exercises;
create policy "plan_exercises_update" on public.plan_exercises
  for update to authenticated
  using (
    exists (
      select 1 from public.workout_plans wp
      where wp.id = plan_exercises.plan_id and wp.trainer_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.workout_plans wp
      where wp.id = plan_exercises.plan_id and wp.trainer_id = (select auth.uid())
    )
  );

drop policy if exists "plan_exercises_delete" on public.plan_exercises;
create policy "plan_exercises_delete" on public.plan_exercises
  for delete to authenticated
  using (
    exists (
      select 1 from public.workout_plans wp
      where wp.id = plan_exercises.plan_id and wp.trainer_id = (select auth.uid())
    )
  );

-- workout_sessions / session_exercises / set_logs:
--   本人と担当トレーナーが閲覧可。作成・完了は関数経由。セットの実績値だけ本人が直接更新できる。
drop policy if exists "workout_sessions_select" on public.workout_sessions;
create policy "workout_sessions_select" on public.workout_sessions
  for select to authenticated
  using (client_id = (select auth.uid()) or private.is_trainer_of(client_id));

drop policy if exists "session_exercises_select" on public.session_exercises;
create policy "session_exercises_select" on public.session_exercises
  for select to authenticated
  using (client_id = (select auth.uid()) or private.is_trainer_of(client_id));

drop policy if exists "set_logs_select" on public.set_logs;
create policy "set_logs_select" on public.set_logs
  for select to authenticated
  using (client_id = (select auth.uid()) or private.is_trainer_of(client_id));

drop policy if exists "set_logs_update_self" on public.set_logs;
create policy "set_logs_update_self" on public.set_logs
  for update to authenticated
  using (client_id = (select auth.uid()))
  with check (client_id = (select auth.uid()));

-- trainer_comments: 書いたトレーナーと宛先クライアントだけ見える
drop policy if exists "trainer_comments_select" on public.trainer_comments;
create policy "trainer_comments_select" on public.trainer_comments
  for select to authenticated
  using (client_id = (select auth.uid()) or trainer_id = (select auth.uid()));

drop policy if exists "trainer_comments_insert" on public.trainer_comments;
create policy "trainer_comments_insert" on public.trainer_comments
  for insert to authenticated
  with check (
    trainer_id = (select auth.uid())
    and private.is_trainer_of(client_id)
    and (
      session_id is null
      or exists (
        select 1 from public.workout_sessions ws
        where ws.id = trainer_comments.session_id and ws.client_id = trainer_comments.client_id
      )
    )
  );

drop policy if exists "trainer_comments_delete" on public.trainer_comments;
create policy "trainer_comments_delete" on public.trainer_comments
  for delete to authenticated
  using (trainer_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- 5. RPC 関数（アプリから supabase.rpc() で呼ぶ）
-- ---------------------------------------------------------------------

-- 招待コードの情報（未ログインでも参照可。トレーナー名と状態だけ返す）
create or replace function public.get_invite_info(p_code text)
returns table (trainer_name text, status text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.display_name,
    case
      when i.used_at is not null then 'used'
      when i.expires_at <= now() then 'expired'
      else 'valid'
    end
  from public.client_invites i
  join public.profiles p on p.id = i.trainer_id
  where i.code = upper(btrim(coalesce(p_code, '')));
$$;

-- ログイン中のクライアントが招待コードを使ってトレーナーとつながる
create or replace function public.accept_invite(p_code text)
returns uuid
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
  if private.current_app_role() is distinct from 'client' then
    raise exception using errcode = 'P0001', message = 'invite_requires_client';
  end if;
  return private.redeem_invite(v_uid, p_code);
end;
$$;

-- トレーナーが招待コードを発行する
create or replace function public.create_client_invite(p_label text default null)
returns public.client_invites
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_invite public.client_invites;
  v_active integer;
  attempt integer;
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'not_authenticated';
  end if;
  if private.current_app_role() is distinct from 'trainer' then
    raise exception using errcode = 'P0001', message = 'trainer_only';
  end if;

  select count(*) into v_active
    from public.client_invites
   where trainer_id = v_uid and used_at is null and expires_at > now();
  if v_active >= 30 then
    raise exception using errcode = 'P0001', message = 'too_many_invites';
  end if;

  for attempt in 1..5 loop
    begin
      insert into public.client_invites (trainer_id, code, label)
      values (v_uid, private.generate_invite_code(), left(nullif(btrim(coalesce(p_label, '')), ''), 40))
      returning * into v_invite;
      return v_invite;
    exception when unique_violation then
      null; -- まれなコード衝突。作り直す
    end;
  end loop;

  raise exception using errcode = 'P0001', message = 'invite_code_generation_failed';
end;
$$;

-- メニューと種目を 1 トランザクションで保存（RLS がそのまま適用される SECURITY INVOKER）
--   p_exercises: [{ id?, name, target_weight_kg, target_reps, target_sets, rest_seconds, note }, ...]
--   配列の順番がそのまま種目の並び順になる
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

    if v_ex_id is not null then
      update public.plan_exercises
         set position = v_pos,
             name = v_item ->> 'name',
             target_weight_kg = nullif(v_item ->> 'target_weight_kg', '')::numeric,
             target_reps = (v_item ->> 'target_reps')::integer,
             target_sets = (v_item ->> 'target_sets')::integer,
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
        plan_id, position, name, exercise_key, target_weight_kg, target_reps, target_sets, rest_seconds, note
      ) values (
        v_plan_id,
        v_pos,
        v_item ->> 'name',
        '', -- トリガーで上書き
        nullif(v_item ->> 'target_weight_kg', '')::numeric,
        (v_item ->> 'target_reps')::integer,
        (v_item ->> 'target_sets')::integer,
        coalesce(nullif(v_item ->> 'rest_seconds', '')::integer, 90),
        nullif(btrim(coalesce(v_item ->> 'note', '')), '')
      );
    end if;
  end loop;

  return v_plan_id;
end;
$$;

-- トレーニング開始: メニューをスナップショットしてセッションとセット行を作る
--   同じ日・同じメニューの実施中セッションがあればそれを返す（二重作成を防ぐ）
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
    returning id, target_weight_kg, target_reps, target_sets
  )
  insert into public.set_logs (session_exercise_id, session_id, client_id, set_number, target_weight_kg, target_reps)
  select ins.id, v_session_id, v_uid, gs.n, ins.target_weight_kg, ins.target_reps
  from inserted ins
  cross join lateral generate_series(1, ins.target_sets) as gs (n);

  return v_session_id;
end;
$$;

-- セットを 1 つ追加（目標値は種目の目標をコピー）
create or replace function public.add_set(p_session_exercise_id uuid)
returns public.set_logs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_se public.session_exercises%rowtype;
  v_next integer;
  v_row public.set_logs;
begin
  select * into v_se
    from public.session_exercises
   where id = p_session_exercise_id and client_id = v_uid;
  if not found then
    raise exception using errcode = 'P0002', message = 'exercise_not_found';
  end if;

  select coalesce(max(set_number), 0) + 1 into v_next
    from public.set_logs
   where session_exercise_id = v_se.id;
  if v_next > 20 then
    raise exception using errcode = 'P0001', message = 'too_many_sets';
  end if;

  insert into public.set_logs (session_exercise_id, session_id, client_id, set_number, target_weight_kg, target_reps)
  values (v_se.id, v_se.session_id, v_uid, v_next, v_se.target_weight_kg, v_se.target_reps)
  returning * into v_row;
  return v_row;
end;
$$;

-- 最後のセットを削除（未完了のセットのみ）
create or replace function public.remove_last_set(p_session_exercise_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_set public.set_logs%rowtype;
begin
  select * into v_set
    from public.set_logs
   where session_exercise_id = p_session_exercise_id and client_id = v_uid
   order by set_number desc
   limit 1;
  if not found then
    raise exception using errcode = 'P0002', message = 'set_not_found';
  end if;
  if v_set.completed_at is not null then
    raise exception using errcode = 'P0001', message = 'set_already_completed';
  end if;
  if v_set.set_number <= 1 then
    raise exception using errcode = 'P0001', message = 'last_set_required';
  end if;

  delete from public.set_logs where id = v_set.id;
  return v_set.id;
end;
$$;

-- トレーニング完了
create or replace function public.complete_workout_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.workout_sessions
     set status = 'completed',
         completed_at = coalesce(completed_at, now())
   where id = p_session_id
     and client_id = auth.uid();
  if not found then
    raise exception using errcode = 'P0002', message = 'session_not_found';
  end if;
end;
$$;

-- 実施中のトレーニングを破棄（間違えて開始した場合など）
create or replace function public.discard_workout_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.workout_sessions
   where id = p_session_id
     and client_id = auth.uid()
     and status = 'in_progress';
  if not found then
    raise exception using errcode = 'P0002', message = 'session_not_found';
  end if;
end;
$$;

-- 自分宛てコメントを既読にする
create or replace function public.mark_comments_read()
returns integer
language sql
security definer
set search_path = ''
as $$
  with updated as (
    update public.trainer_comments
       set read_at = now()
     where client_id = auth.uid()
       and read_at is null
    returning 1
  )
  select count(*)::integer from updated;
$$;

-- トレーナーのホーム画面: 担当クライアント + 指定日のチェックイン + 直近のトレーニング
create or replace function public.get_trainer_dashboard(p_date date)
returns table (
  client_id uuid,
  display_name text,
  linked_at timestamptz,
  checkin_date date,
  sleep smallint,
  fatigue smallint,
  soreness smallint,
  stress smallint,
  motivation smallint,
  body_weight_kg numeric,
  checkin_note text,
  last_checkin_date date,
  last_session_id uuid,
  last_session_title text,
  last_session_date date,
  last_session_status text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    p.id,
    p.display_name,
    tc.created_at,
    c.checkin_date,
    c.sleep,
    c.fatigue,
    c.soreness,
    c.stress,
    c.motivation,
    c.body_weight_kg,
    c.note,
    lc.last_checkin_date,
    s.id,
    s.title,
    s.performed_date,
    s.status
  from public.trainer_clients tc
  join public.profiles p on p.id = tc.client_id
  left join public.checkins c on c.client_id = tc.client_id and c.checkin_date = p_date
  left join lateral (
    select max(c2.checkin_date) as last_checkin_date
    from public.checkins c2
    where c2.client_id = tc.client_id
  ) lc on true
  left join lateral (
    select ws.id, ws.title, ws.performed_date, ws.status
    from public.workout_sessions ws
    where ws.client_id = tc.client_id
    order by ws.performed_date desc, ws.started_at desc
    limit 1
  ) s on true
  where tc.trainer_id = (select auth.uid())
    and tc.status = 'active'
  order by p.display_name;
$$;

-- 前回記録: 指定セッションの各種目について、それより前に完了したセットを返す
create or replace function public.get_previous_sets(p_session_id uuid)
returns table (
  exercise_key text,
  session_id uuid,
  performed_date date,
  set_number integer,
  actual_weight_kg numeric,
  actual_reps integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  with cur as (
    select distinct se.exercise_key, ws.client_id, ws.started_at
    from public.session_exercises se
    join public.workout_sessions ws on ws.id = se.session_id
    where se.session_id = p_session_id
  ),
  prev as (
    select distinct on (cur.exercise_key)
      cur.exercise_key,
      pse.id as session_exercise_id,
      pws.id as session_id,
      pws.performed_date
    from cur
    join public.session_exercises pse
      on pse.client_id = cur.client_id
     and pse.exercise_key = cur.exercise_key
    join public.workout_sessions pws on pws.id = pse.session_id
    where pws.started_at < cur.started_at
      and exists (
        select 1 from public.set_logs sl
        where sl.session_exercise_id = pse.id and sl.completed_at is not null
      )
    order by cur.exercise_key, pws.started_at desc, pse.position
  )
  select prev.exercise_key, prev.session_id, prev.performed_date, sl.set_number, sl.actual_weight_kg, sl.actual_reps
  from prev
  join public.set_logs sl on sl.session_exercise_id = prev.session_exercise_id
  where sl.completed_at is not null
  order by prev.exercise_key, sl.set_number;
$$;

-- メニュー作成画面の種目名候補（自分が過去に使った種目名）
create or replace function public.get_exercise_name_suggestions()
returns table (name text)
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct on (pe.exercise_key) pe.name
  from public.plan_exercises pe
  join public.workout_plans wp on wp.id = pe.plan_id
  where wp.trainer_id = (select auth.uid())
  order by pe.exercise_key, pe.updated_at desc
  limit 300;
$$;

-- ---------------------------------------------------------------------
-- 6. 権限（GRANT）
--    2026年以降の Supabase では新しいテーブルが自動で API 公開されないため、明示的に付与する。
--    anon（未ログイン）にはテーブルへの権限を一切与えない。
-- ---------------------------------------------------------------------
revoke all on table
  public.profiles,
  public.trainer_clients,
  public.client_invites,
  public.checkins,
  public.workout_plans,
  public.plan_exercises,
  public.workout_sessions,
  public.session_exercises,
  public.set_logs,
  public.trainer_comments
from anon, authenticated;

grant all on table
  public.profiles,
  public.trainer_clients,
  public.client_invites,
  public.checkins,
  public.workout_plans,
  public.plan_exercises,
  public.workout_sessions,
  public.session_exercises,
  public.set_logs,
  public.trainer_comments
to service_role;

grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant select on public.trainer_clients to authenticated;
grant select, delete on public.client_invites to authenticated;
grant select, insert, update on public.checkins to authenticated;
grant select, insert, update, delete on public.workout_plans to authenticated;
grant select, insert, update, delete on public.plan_exercises to authenticated;
grant select on public.workout_sessions to authenticated;
grant select on public.session_exercises to authenticated;
grant select on public.set_logs to authenticated;
grant update (actual_weight_kg, actual_reps, rpe, completed_at) on public.set_logs to authenticated;
grant select, insert, delete on public.trainer_comments to authenticated;

-- private 関数: RLS ポリシーから呼ぶものだけ authenticated に実行権限
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_trainer_of(uuid) to authenticated;
grant execute on function private.is_client_of(uuid) to authenticated;
grant execute on function private.current_app_role() to authenticated;
grant execute on function private.normalize_exercise_name(text) to authenticated;

-- public RPC
revoke all on function public.get_invite_info(text) from public, anon, authenticated;
revoke all on function public.accept_invite(text) from public, anon, authenticated;
revoke all on function public.create_client_invite(text) from public, anon, authenticated;
revoke all on function public.save_workout_plan(uuid, uuid, text, date, text, jsonb) from public, anon, authenticated;
revoke all on function public.start_workout_session(uuid, date) from public, anon, authenticated;
revoke all on function public.add_set(uuid) from public, anon, authenticated;
revoke all on function public.remove_last_set(uuid) from public, anon, authenticated;
revoke all on function public.complete_workout_session(uuid) from public, anon, authenticated;
revoke all on function public.discard_workout_session(uuid) from public, anon, authenticated;
revoke all on function public.mark_comments_read() from public, anon, authenticated;
revoke all on function public.get_trainer_dashboard(date) from public, anon, authenticated;
revoke all on function public.get_previous_sets(uuid) from public, anon, authenticated;
revoke all on function public.get_exercise_name_suggestions() from public, anon, authenticated;

grant execute on function public.get_invite_info(text) to anon, authenticated;
grant execute on function public.accept_invite(text) to authenticated;
grant execute on function public.create_client_invite(text) to authenticated;
grant execute on function public.save_workout_plan(uuid, uuid, text, date, text, jsonb) to authenticated;
grant execute on function public.start_workout_session(uuid, date) to authenticated;
grant execute on function public.add_set(uuid) to authenticated;
grant execute on function public.remove_last_set(uuid) to authenticated;
grant execute on function public.complete_workout_session(uuid) to authenticated;
grant execute on function public.discard_workout_session(uuid) to authenticated;
grant execute on function public.mark_comments_read() to authenticated;
grant execute on function public.get_trainer_dashboard(date) to authenticated;
grant execute on function public.get_previous_sets(uuid) to authenticated;
grant execute on function public.get_exercise_name_suggestions() to authenticated;

commit;
