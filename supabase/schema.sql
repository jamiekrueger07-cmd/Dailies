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

-- =====================================================================
-- v7 (Sept 24): hourly reminder emails
-- =====================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- A random secret made inside the database, so nobody has to copy it around.
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'dailies_cron_secret', 'Lets the hourly schedule run send-reminders')
where not exists (select 1 from vault.secrets where name = 'dailies_cron_secret');

-- send-reminders asks this to confirm a request really came from the schedule (server only).
create or replace function public.check_cron_secret(s text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'dailies_cron_secret' and decrypted_secret = s)
$$;
revoke all on function public.check_cron_secret(text) from public, anon, authenticated;
grant execute on function public.check_cron_secret(text) to service_role;

-- Every hour at :05, check who is due a reminder in their own time zone.
select cron.schedule('dailies-send-reminders', '5 * * * *', $cron$
  select net.http_post(
    url := 'https://jibnhgijjwmxitkablvg.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'dailies_cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  )
$cron$);

-- =====================================================================
-- v8 (Sept 24): second bug hunt
-- =====================================================================

-- 1. Free plan: only the first 2 deals (by sort order, then id — same order as the app) accept new posts,
--    videos and scripts. Stops "start a trial, add 50 deals, cancel, keep tracking them all".
create or replace function public.deal_writable(p_deal uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.deals d join public.profiles p on p.id = d.user_id
    where d.id = p_deal and d.user_id = auth.uid()
      and (p.plan in ('pro', 'plus')
           or d.id in (select x.id from public.deals x where x.user_id = d.user_id order by x.sort_order, x.id limit 2))
  )
$$;
revoke all on function public.deal_writable(uuid) from public, anon;
grant execute on function public.deal_writable(uuid) to authenticated;

drop policy if exists "own checks" on public.post_checks;
create policy "own checks" on public.post_checks for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id and public.deal_writable(deal_id));
drop policy if exists "own videos" on public.videos;
create policy "own videos" on public.videos for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id and public.deal_writable(deal_id));
drop policy if exists "own scripts" on public.scripts;
create policy "own scripts" on public.scripts for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id and public.deal_writable(deal_id));

-- 2. A failed payment (past_due) keeps the plan while Stripe retries, but no new monthly AI scripts until it's paid.
create or replace function public.ai_allowance_now(p text, status text) returns int
language sql immutable as $$
  select case when status = 'past_due' then 0
              when status = 'trialing' then least(5, public.ai_allowance(p))
              else public.ai_allowance(p) end
$$;

-- 3. Closing an AI run only ever happens once, so a retry can't refund scripts twice.
alter table public.ai_runs add column if not exists finished boolean not null default false;
create or replace function public.finish_ai_run(rid bigint, n int, run_model text, in_tok int, out_tok int, cost numeric) returns void
language plpgsql security definer set search_path = public as $$
declare
  r record;
  back int;
  back_bonus int;
begin
  select * into r from public.ai_runs where id = rid for update;
  if not found or r.finished then return; end if;
  back := greatest(0, r.scripts - greatest(0, n));
  back_bonus := least(r.from_bonus, back);
  if back_bonus > 0 then update public.profiles set ai_bonus = ai_bonus + back_bonus where id = r.user_id; end if;
  update public.ai_runs set scripts = r.scripts - back, from_bonus = r.from_bonus - back_bonus, finished = true,
    model = coalesce(run_model, model), input_tokens = coalesce(in_tok, input_tokens), output_tokens = coalesce(out_tok, output_tokens), cost_usd = coalesce(cost, cost_usd)
  where id = rid;
end $$;
revoke all on function public.finish_ai_run(bigint, int, text, int, int, numeric) from public, anon, authenticated;

-- 4. Reading a brief is free but capped at 15 an hour. Claim the slot BEFORE calling the AI (locked), so
--    parallel requests can't slip past the cap. Returns the run id, or null when the cap is reached.
create or replace function public.claim_outline(uid uuid) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  rid bigint;
begin
  perform 1 from public.profiles where id = uid for update;
  if (select count(*) from public.ai_runs where user_id = uid and mode = 'outline' and created_at > now() - interval '1 hour') >= 15 then
    return null;
  end if;
  insert into public.ai_runs (user_id, mode, scripts, from_bonus) values (uid, 'outline', 0, 0) returning id into rid;
  return rid;
end $$;
revoke all on function public.claim_outline(uuid) from public, anon, authenticated;

-- 5. Keep the reminder email address in step when someone changes their login email.
create or replace function public.sync_profile_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end $$;
drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed after update of email on auth.users
  for each row when (old.email is distinct from new.email) execute function public.sync_profile_email();
update public.profiles p set email = u.email from auth.users u where u.id = p.id and p.email is distinct from u.email;

-- =====================================================================
-- v9 (Sept 24): in-app feedback
-- =====================================================================
-- Notes from the "Send feedback" form. Only the send-feedback function (service role) writes or reads them,
-- so there are no policies: signed-in users can't list anyone's notes, including their own.
create table if not exists public.feedback (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  email text,
  plan text,
  kind text not null check (kind in ('working', 'not', 'idea')),
  message text not null check (char_length(message) between 1 and 2000),
  page text,
  created_at timestamptz not null default now()
);
alter table public.feedback enable row level security;
revoke all on public.feedback from anon, authenticated;
create index if not exists feedback_user_time on public.feedback (user_id, created_at desc);

-- =====================================================================
-- v10 (Sept 24): third bug hunt
-- =====================================================================

-- 1. Free plan: the 2 tracked deals are the OLDEST two (sort order can be changed by the user, age can't).
--    The app ranks the same way (state.tsx trackedDeals).
create or replace function public.deal_writable(p_deal uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.deals d join public.profiles p on p.id = d.user_id
    where d.id = p_deal and d.user_id = auth.uid()
      and (p.plan in ('pro', 'plus')
           or d.id in (select x.id from public.deals x where x.user_id = d.user_id order by x.created_at, x.id limit 2))
  )
$$;
revoke all on function public.deal_writable(uuid) from public, anon;
grant execute on function public.deal_writable(uuid) to authenticated;

-- 2. Sane sizes (same caps as the app). NOT VALID: enforced for new writes, old rows are left alone.
alter table public.deals drop constraint if exists deals_sane;
alter table public.deals add constraint deals_sane check (
  videos_per_day between 0 and 20 and videos_per_week between 0 and 140
  and cardinality(platforms) <= 10 and char_length(name) <= 120
  and char_length(coalesce(notes, '')) <= 5000 and char_length(coalesce(contact, '')) <= 500
) not valid;
alter table public.profiles drop constraint if exists profiles_name_len;
alter table public.profiles add constraint profiles_name_len check (char_length(coalesce(display_name, '')) <= 80) not valid;
alter table public.report_shares drop constraint if exists report_shares_name_len;
alter table public.report_shares add constraint report_shares_name_len check (char_length(coalesce(creator_name, '')) <= 120) not valid;
alter table public.post_checks drop constraint if exists post_checks_link_ok;
alter table public.post_checks add constraint post_checks_link_ok check (link is null or (char_length(link) <= 2000 and link ~* '^https?://')) not valid;

-- 3. Feedback: check the hourly limit and save in one locked step, so a burst of requests can't slip past it.
create or replace function public.submit_feedback(uid uuid, p_email text, p_plan text, p_kind text, p_message text, p_page text)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  rid bigint;
begin
  perform 1 from public.profiles where id = uid for update;
  if (select count(*) from public.feedback where user_id = uid and created_at > now() - interval '1 hour') >= 5 then
    return null;
  end if;
  insert into public.feedback (user_id, email, plan, kind, message, page)
  values (uid, p_email, p_plan, p_kind, p_message, p_page) returning id into rid;
  return rid;
end $$;
revoke all on function public.submit_feedback(uuid, text, text, text, text, text) from public, anon, authenticated;

-- =====================================================================
-- v11 (Sept 24): pay types + view bonuses
-- =====================================================================

-- 1. How a deal pays: per video (rate_per_video, already there), a base (per week or month),
--    per 1,000 views with an optional cap per post, bonus tiers per post, and when views get counted.
alter table public.deals add column if not exists base_pay numeric;
alter table public.deals add column if not exists base_per text not null default 'month';
alter table public.deals add column if not exists cpm numeric;
alter table public.deals add column if not exists cpm_cap numeric;
alter table public.deals add column if not exists bonus_tiers jsonb not null default '[]'::jsonb;
alter table public.deals add column if not exists views_after_days int;
alter table public.deals drop constraint if exists deals_pay_sane;
alter table public.deals add constraint deals_pay_sane check (
  base_per in ('week', 'month')
  and (base_pay is null or base_pay between 0 and 1000000)
  and (cpm is null or cpm between 0 and 10000)
  and (cpm_cap is null or cpm_cap between 0 and 1000000)
  and (rate_per_video is null or rate_per_video between 0 and 1000000)
  and jsonb_typeof(bonus_tiers) = 'array' and jsonb_array_length(bonus_tiers) <= 10
  and (views_after_days is null or views_after_days between 0 and 90)
) not valid;

-- 2. Views per post. Only ever written by its own update, so ticking a post never wipes them.
alter table public.post_checks add column if not exists views bigint;
alter table public.post_checks drop constraint if exists post_checks_views_ok;
alter table public.post_checks add constraint post_checks_views_ok check (views is null or views between 0 and 100000000000) not valid;

-- 3. Shared reports show each post's views too (never any pay).
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
      select json_agg(json_build_object('deal_id', c.deal_id, 'date', c.date, 'video_no', c.video_no, 'platform', c.platform, 'link', c.link, 'views', c.views))
      from public.post_checks c
      where c.deal_id = s.deal_id and c.user_id = s.user_id and to_char(c.date, 'YYYY-MM') = s.month
    ), '[]'::json)
  )
  from public.report_shares s join public.deals d on d.id = s.deal_id and d.user_id = s.user_id
  where s.token = share_token
$$;
revoke all on function public.get_shared_report(text) from public;
grant execute on function public.get_shared_report(text) to anon, authenticated;

-- =====================================================================
-- v12 (Sept 24): free-forever (comped) accounts, e.g. the owner's
-- =====================================================================
-- Emails listed here always get that plan for free. Nothing in billing can take it away:
-- a trigger re-applies it whenever the profile changes (sign-up, Stripe webhook, anything).
create table if not exists public.comp_accounts (
  email text primary key check (email = lower(email)),
  plan text not null default 'plus' check (plan in ('pro', 'plus')),
  note text,
  created_at timestamptz not null default now()
);
alter table public.comp_accounts enable row level security; -- no policies: only the database itself reads it

create or replace function public.apply_comp() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  cp text;
begin
  select c.plan into cp from public.comp_accounts c where c.email = lower(new.email);
  if cp is not null then
    new.plan := cp;
    new.subscription_status := 'comped';
    new.trial_end := null;
    new.current_period_end := null;
  end if;
  return new;
end $$;
revoke all on function public.apply_comp() from public, anon, authenticated;

drop trigger if exists profiles_apply_comp on public.profiles;
create trigger profiles_apply_comp before insert or update on public.profiles
  for each row execute function public.apply_comp();

-- The owner
insert into public.comp_accounts (email, plan, note) values ('jamie.krueger07@gmail.com', 'plus', 'Owner')
  on conflict (email) do update set plan = excluded.plan;
update public.profiles set email = email where lower(email) in (select email from public.comp_accounts);

-- =====================================================================
-- v13 (Sept 24): the account each brand's videos go up on
-- =====================================================================
alter table public.deals add column if not exists handle text not null default '';
alter table public.deals drop constraint if exists deals_handle_len;
alter table public.deals add constraint deals_handle_len check (char_length(handle) <= 100) not valid;

-- Shared reports say which account the posts are on.
create or replace function public.get_shared_report(share_token text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'month', s.month,
    'creator_name', s.creator_name,
    'deal', json_build_object(
      'id', d.id, 'name', d.name, 'color', d.color, 'quota_mode', d.quota_mode,
      'videos_per_day', d.videos_per_day, 'videos_per_week', d.videos_per_week,
      'needs_approval', d.needs_approval, 'platforms', d.platforms, 'handle', d.handle,
      'start_date', d.start_date, 'end_date', d.end_date, 'film_day', null, 'status', d.status
    ),
    'checks', coalesce((
      select json_agg(json_build_object('deal_id', c.deal_id, 'date', c.date, 'video_no', c.video_no, 'platform', c.platform, 'link', c.link, 'views', c.views))
      from public.post_checks c
      where c.deal_id = s.deal_id and c.user_id = s.user_id and to_char(c.date, 'YYYY-MM') = s.month
    ), '[]'::json)
  )
  from public.report_shares s join public.deals d on d.id = s.deal_id and d.user_id = s.user_id
  where s.token = share_token
$$;
revoke all on function public.get_shared_report(text) from public;
grant execute on function public.get_shared_report(text) to anon, authenticated;
