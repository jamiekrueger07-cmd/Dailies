-- Dailies database. Paste this whole file into Supabase -> SQL Editor -> New query -> Run.
-- Safe to run more than once.

-- ---------- profiles: one per user, holds the plan ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  plan text not null default 'free' check (plan in ('free','pro')),
  stripe_customer_id text unique,
  stripe_subscription_id text,
  subscription_status text,
  current_period_end timestamptz,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select using (auth.uid() = id);
-- No insert/update policy on purpose: only the Stripe webhook (service role) can change a plan.

alter table public.profiles add column if not exists display_name text; -- name on brand reports, set at sign-up

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, nullif(trim(new.raw_user_meta_data->>'display_name'), ''))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
-- backfill anyone who signed up before this ran
insert into public.profiles (id, email) select id, email from auth.users on conflict (id) do nothing;

-- ---------- deals ----------
create table if not exists public.deals (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '',
  color text not null default '#0f7a6c',
  quota_mode text not null default 'day',
  videos_per_day int not null default 1,
  videos_per_week int not null default 7,
  needs_approval boolean not null default false,
  platforms text[] not null default '{}',
  rate_per_video numeric,
  start_date date not null default current_date,
  end_date date,
  film_day int,
  contact text default '',
  status text not null default 'active',
  invoice_sent boolean not null default false,
  paid boolean not null default false,
  notes text default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists deals_user on public.deals(user_id);
alter table public.deals enable row level security;
drop policy if exists "own deals" on public.deals;
create policy "own deals" on public.deals for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Free plan = 2 deals. Enforced here so nobody can get around it from the browser.
create or replace function public.enforce_deal_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  user_plan text;
  n int;
begin
  -- upserts of an existing deal are edits, not new deals
  if exists (select 1 from public.deals where id = new.id) then return new; end if;
  select plan into user_plan from public.profiles where id = new.user_id;
  if coalesce(user_plan, 'free') in ('pro', 'plus') then return new; end if;
  select count(*) into n from public.deals where user_id = new.user_id;
  if n >= 2 then
    raise exception 'FREE_PLAN_LIMIT: the Free plan covers 2 brand deals';
  end if;
  return new;
end $$;
drop trigger if exists deal_limit on public.deals;
create trigger deal_limit before insert on public.deals
  for each row execute function public.enforce_deal_limit();

-- ---------- posts checked off ----------
create table if not exists public.post_checks (
  user_id uuid not null references auth.users(id) on delete cascade,
  deal_id uuid not null references public.deals(id) on delete cascade,
  date date not null,
  video_no int not null,
  platform text not null,
  link text,
  created_at timestamptz not null default now(),
  primary key (user_id, deal_id, date, video_no, platform)
);
alter table public.post_checks enable row level security;
drop policy if exists "own checks" on public.post_checks;
create policy "own checks" on public.post_checks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- film list ----------
create table if not exists public.videos (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  deal_id uuid not null references public.deals(id) on delete cascade,
  week_start date not null,
  no int not null,
  hook text default '',
  format text default '',
  notes text default '',
  revision text default '',
  status text not null default 'idea',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists videos_user on public.videos(user_id);
alter table public.videos enable row level security;
drop policy if exists "own videos" on public.videos;
create policy "own videos" on public.videos for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =====================================================================
-- v3 additions: yearly plan + trial, reminder settings, shareable reports
-- =====================================================================

-- billing details the webhook fills in, and settings the user can change
alter table public.profiles add column if not exists billing_interval text;
alter table public.profiles add column if not exists trial_end timestamptz;
alter table public.profiles add column if not exists trial_used boolean not null default false;
alter table public.profiles add column if not exists reminder_email boolean not null default false;
alter table public.profiles add column if not exists reminder_hour int not null default 20 check (reminder_hour between 0 and 23);
alter table public.profiles add column if not exists timezone text not null default 'America/Los_Angeles';
alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists last_reminder_on date;

-- Users may edit only their own settings columns. Plan and billing columns stay webhook-only.
revoke update on public.profiles from anon, authenticated;
grant update (reminder_email, reminder_hour, timezone, display_name) on public.profiles to authenticated;
drop policy if exists "update own settings" on public.profiles;
create policy "update own settings" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- share links: one row per brand + month the creator sends out
create table if not exists public.report_shares (
  token text primary key default replace(gen_random_uuid()::text, '-', ''),
  user_id uuid not null references auth.users(id) on delete cascade,
  deal_id uuid not null references public.deals(id) on delete cascade,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  creator_name text,
  created_at timestamptz not null default now()
);
alter table public.report_shares enable row level security;
drop policy if exists "own shares read" on public.report_shares;
create policy "own shares read" on public.report_shares for select using (auth.uid() = user_id);
drop policy if exists "own shares delete" on public.report_shares;
create policy "own shares delete" on public.report_shares for delete using (auth.uid() = user_id);
-- sharing is a Pro feature, checked here too
drop policy if exists "pro can share" on public.report_shares;
create policy "pro can share" on public.report_shares for insert with check (
  auth.uid() = user_id
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.plan in ('pro', 'plus'))
  and exists (select 1 from public.deals d where d.id = deal_id and d.user_id = auth.uid())
);

-- What a brand sees from a share link. No rates, notes, contacts or other brands.
create or replace function public.get_shared_report(share_token text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'month', s.month,
    'creator_name', s.creator_name,
    'deal', json_build_object(
      'id', d.id, 'name', d.name, 'color', d.color, 'quota_mode', d.quota_mode,
      'videos_per_day', d.videos_per_day, 'videos_per_week', d.videos_per_week,
      'needs_approval', d.needs_approval, 'platforms', d.platforms,
      'start_date', d.start_date, 'end_date', d.end_date, 'film_day', null, 'status', d.status
    ),
    'checks', coalesce((
      select json_agg(json_build_object('deal_id', c.deal_id, 'date', c.date, 'video_no', c.video_no, 'platform', c.platform, 'link', c.link))
      from public.post_checks c
      where c.deal_id = s.deal_id and to_char(c.date, 'YYYY-MM') = s.month
    ), '[]'::json)
  )
  from public.report_shares s join public.deals d on d.id = s.deal_id
  where s.token = share_token
$$;
revoke all on function public.get_shared_report(text) from public;
grant execute on function public.get_shared_report(text) to anon, authenticated;

-- =====================================================================
-- v4 additions: scripts (inside Film) + AI script helper usage log
-- =====================================================================
create table if not exists public.scripts (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  deal_id uuid not null references public.deals(id) on delete cascade,
  week_start date not null,
  video_id uuid references public.videos(id) on delete set null,
  title text not null default '',
  hook text default '',
  format text default '',
  steps jsonb not null default '[]'::jsonb,
  caption text default '',
  notes text default '',
  done boolean not null default false,
  source text not null default 'manual' check (source in ('manual','brief','ai')),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists scripts_user on public.scripts(user_id);
alter table public.scripts enable row level security;
drop policy if exists "own scripts" on public.scripts;
create policy "own scripts" on public.scripts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- one row per AI request, used for the daily limit (written by the scripts-ai function only)
create table if not exists public.ai_runs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null,
  created_at timestamptz not null default now()
);
create index if not exists ai_runs_user_time on public.ai_runs(user_id, created_at);
alter table public.ai_runs enable row level security;

-- =====================================================================
-- v5 additions: Pro Plus, monthly AI script allowance, top-ups, cost log
-- Allowance: Pro 40 / Pro Plus 400 AI scripts per calendar month (keep in sync with
-- AI_ALLOWANCE in src/lib/model.ts). Top-up scripts sit in ai_bonus and never expire.
-- =====================================================================
alter table public.profiles drop constraint if exists profiles_plan_check;
alter table public.profiles add constraint profiles_plan_check check (plan in ('free', 'pro', 'plus'));
alter table public.profiles add column if not exists ai_bonus int not null default 0;

alter table public.ai_runs add column if not exists scripts int not null default 0;
alter table public.ai_runs add column if not exists model text;
alter table public.ai_runs add column if not exists input_tokens int;
alter table public.ai_runs add column if not exists output_tokens int;
alter table public.ai_runs add column if not exists cost_usd numeric(10, 5);
-- people can see their own usage (the app shows "12 of 40 used"); only the function writes it
drop policy if exists "read own ai runs" on public.ai_runs;
create policy "read own ai runs" on public.ai_runs for select using (auth.uid() = user_id);

create or replace function public.ai_allowance(p text) returns int
language sql immutable as $$ select case p when 'plus' then 400 when 'pro' then 40 else 0 end $$;

-- During the free trial people get a small taste (5 AI scripts). The full allowance starts once they pay.
create or replace function public.ai_allowance_now(p text, status text) returns int
language sql immutable as $$
  select case when status = 'trialing' then least(5, public.ai_allowance(p)) else public.ai_allowance(p) end
$$;

-- AI scripts someone can still use right now (this month's allowance left + top-ups)
create or replace function public.ai_scripts_left(uid uuid) returns int
language sql stable security definer set search_path = public as $$
  select greatest(0, public.ai_allowance_now(p.plan, p.subscription_status) - coalesce((
           select sum(r.scripts) from public.ai_runs r
           where r.user_id = uid and r.created_at >= date_trunc('month', now())), 0))::int
         + greatest(0, p.ai_bonus)
  from public.profiles p where p.id = uid
$$;

-- Log a run and spend: this month's allowance first, then top-ups.
create or replace function public.record_ai_run(uid uuid, run_mode text, n int, run_model text, in_tok int, out_tok int, cost numeric)
returns void language plpgsql security definer set search_path = public as $$
declare
  user_plan text;
  user_status text;
  used int;
  from_month int;
begin
  select plan, subscription_status into user_plan, user_status from public.profiles where id = uid for update;
  select coalesce(sum(scripts), 0) into used from public.ai_runs
    where user_id = uid and created_at >= date_trunc('month', now());
  from_month := least(n, greatest(0, public.ai_allowance_now(user_plan, user_status) - used));
  if n > from_month then
    update public.profiles set ai_bonus = greatest(0, ai_bonus - (n - from_month)) where id = uid;
  end if;
  insert into public.ai_runs (user_id, mode, scripts, model, input_tokens, output_tokens, cost_usd)
    values (uid, run_mode, n, run_model, in_tok, out_tok, cost);
end $$;

-- Top-up purchases. The session id makes it safe if Stripe sends the same event twice.
create table if not exists public.topups (
  session_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  scripts int not null,
  amount_cents int,
  created_at timestamptz not null default now()
);
alter table public.topups enable row level security;

create or replace function public.add_topup(sid text, uid uuid, n int, cents int) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  insert into public.topups (session_id, user_id, scripts, amount_cents) values (sid, uid, n, cents)
    on conflict (session_id) do nothing;
  if not found then return false; end if;
  update public.profiles set ai_bonus = ai_bonus + n where id = uid;
  return true;
end $$;

revoke all on function public.ai_scripts_left(uuid) from public, anon, authenticated;
revoke all on function public.record_ai_run(uuid, text, int, text, int, int, numeric) from public, anon, authenticated;
revoke all on function public.add_topup(text, uuid, int, int) from public, anon, authenticated;
-- =====================================================================
-- v6 (Sept 24): bug-hunt fixes
-- =====================================================================

-- 1. Rows can only point at your own brand deal (stops someone planting posts/links on another creator's report).
drop policy if exists "own checks" on public.post_checks;
create policy "own checks" on public.post_checks for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id and exists (select 1 from public.deals d where d.id = deal_id and d.user_id = auth.uid()));
drop policy if exists "own videos" on public.videos;
create policy "own videos" on public.videos for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id and exists (select 1 from public.deals d where d.id = deal_id and d.user_id = auth.uid()));
drop policy if exists "own scripts" on public.scripts;
create policy "own scripts" on public.scripts for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id and exists (select 1 from public.deals d where d.id = deal_id and d.user_id = auth.uid()));

-- ...and a shared report only ever shows the creator's own posts.
create or replace function public.get_shared_report(share_token text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'month', s.month,
    'creator_name', s.creator_name,
    'deal', json_build_object(
      'id', d.id, 'name', d.name, 'color', d.color, 'quota_mode', d.quota_mode,
      'videos_per_day', d.videos_per_day, 'videos_per_week', d.videos_per_week,
      'needs_approval', d.needs_approval, 'platforms', d.platforms,
      'start_date', d.start_date, 'end_date', d.end_date, 'film_day', null, 'status', d.status
    ),
    'checks', coalesce((
      select json_agg(json_build_object('deal_id', c.deal_id, 'date', c.date, 'video_no', c.video_no, 'platform', c.platform, 'link', c.link))
      from public.post_checks c
      where c.deal_id = s.deal_id and c.user_id = s.user_id and to_char(c.date, 'YYYY-MM') = s.month
    ), '[]'::json)
  )
  from public.report_shares s join public.deals d on d.id = s.deal_id and d.user_id = s.user_id
  where s.token = share_token
$$;
revoke all on function public.get_shared_report(text) from public;
grant execute on function public.get_shared_report(text) to anon, authenticated;

-- 2. Free plan limit: lock the profile row so two quick inserts can't both slip past the count.
create or replace function public.enforce_deal_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  user_plan text;
  n int;
begin
  -- upserts of an existing deal are edits, not new deals
  if exists (select 1 from public.deals where id = new.id) then return new; end if;
  select plan into user_plan from public.profiles where id = new.user_id for update;
  if coalesce(user_plan, 'free') in ('pro', 'plus') then return new; end if;
  select count(*) into n from public.deals where user_id = new.user_id;
  if n >= 2 then
    raise exception 'FREE_PLAN_LIMIT: the Free plan covers 2 brand deals';
  end if;
  return new;
end $$;

-- 3. AI scripts: count the trial as one window (not per calendar month), and reserve scripts
--    BEFORE the AI runs so parallel requests can't overspend. Unused reservations are refunded.
alter table public.ai_runs add column if not exists from_bonus int not null default 0;

create or replace function public.ai_used(uid uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(r.scripts), 0)::int
  from public.ai_runs r, public.profiles p
  where p.id = uid and r.user_id = uid
    and r.created_at >= case
      when p.subscription_status = 'trialing' and p.trial_end is not null then least(date_trunc('month', now()), p.trial_end - interval '7 days')
      else date_trunc('month', now()) end
$$;

create or replace function public.ai_scripts_left(uid uuid) returns int
language sql stable security definer set search_path = public as $$
  select greatest(0, public.ai_allowance_now(p.plan, p.subscription_status) - public.ai_used(uid))
         + greatest(0, p.ai_bonus)
  from public.profiles p where p.id = uid
$$;

-- Take n AI scripts now (monthly allowance first, then top-ups). Returns the run id, or null if there aren't enough.
create or replace function public.reserve_ai(uid uuid, run_mode text, n int) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  p record;
  from_month int;
  rid bigint;
begin
  select plan, subscription_status, ai_bonus into p from public.profiles where id = uid for update;
  if not found or n < 0 then return null; end if;
  from_month := least(n, greatest(0, public.ai_allowance_now(p.plan, p.subscription_status) - public.ai_used(uid)));
  if n - from_month > greatest(0, p.ai_bonus) then return null; end if;
  if n > from_month then update public.profiles set ai_bonus = ai_bonus - (n - from_month) where id = uid; end if;
  insert into public.ai_runs (user_id, mode, scripts, from_bonus) values (uid, run_mode, n, n - from_month) returning id into rid;
  return rid;
end $$;

-- Close a reservation with what was actually delivered; anything unused goes back (top-ups first).
create or replace function public.finish_ai_run(rid bigint, n int, run_model text, in_tok int, out_tok int, cost numeric) returns void
language plpgsql security definer set search_path = public as $$
declare
  r record;
  back int;
  back_bonus int;
begin
  select * into r from public.ai_runs where id = rid for update;
  if not found then return; end if;
  back := greatest(0, r.scripts - greatest(0, n));
  back_bonus := least(r.from_bonus, back);
  if back_bonus > 0 then update public.profiles set ai_bonus = ai_bonus + back_bonus where id = r.user_id; end if;
  update public.ai_runs set scripts = r.scripts - back, from_bonus = r.from_bonus - back_bonus,
    model = coalesce(run_model, model), input_tokens = coalesce(in_tok, input_tokens), output_tokens = coalesce(out_tok, output_tokens), cost_usd = coalesce(cost, cost_usd)
  where id = rid;
end $$;

-- The app asks the server how many AI scripts are left, so the counter always matches.
create or replace function public.my_ai_left() returns int
language sql stable security definer set search_path = public as $$
  select public.ai_scripts_left(auth.uid())
$$;

revoke all on function public.ai_used(uuid) from public, anon, authenticated;
revoke all on function public.ai_scripts_left(uuid) from public, anon, authenticated;
revoke all on function public.reserve_ai(uuid, text, int) from public, anon, authenticated;
revoke all on function public.finish_ai_run(bigint, int, text, int, int, numeric) from public, anon, authenticated;
revoke all on function public.my_ai_left() from public, anon;
grant execute on function public.my_ai_left() to authenticated;
