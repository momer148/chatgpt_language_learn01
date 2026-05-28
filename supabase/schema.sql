-- =====================================================================
-- Study Pulse — Supabase schema
-- Paste this into Supabase SQL editor and run.
-- Safe to re-run: every statement is idempotent (uses IF NOT EXISTS / OR REPLACE).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------
create extension if not exists "pgcrypto";  -- for gen_random_uuid()

-- ---------------------------------------------------------------------
-- Helper: keep updated_at fresh on UPDATE
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- profiles — one row per auth user
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  palette text not null default 'peach',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile row on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- vocab_folders — named decks
-- ---------------------------------------------------------------------
create table if not exists public.vocab_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, name)
);

create index if not exists vocab_folders_user_idx on public.vocab_folders(user_id);
create index if not exists vocab_folders_updated_idx on public.vocab_folders(user_id, updated_at);

drop trigger if exists trg_vocab_folders_updated on public.vocab_folders;
create trigger trg_vocab_folders_updated before update on public.vocab_folders
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- vocab_words — flashcards with SRS state
-- ---------------------------------------------------------------------
create table if not exists public.vocab_words (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  folder text not null default 'General',
  word text not null,
  meaning text,
  sentence text,
  topic text,
  due date,
  interval integer not null default 0,
  ease numeric(4,2) not null default 2.5,
  repetitions integer not null default 0,
  lapses integer not null default 0,
  last_reviewed date,
  last_grade text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists vocab_words_user_idx on public.vocab_words(user_id);
create index if not exists vocab_words_folder_idx on public.vocab_words(user_id, folder);
create index if not exists vocab_words_due_idx on public.vocab_words(user_id, due);
create index if not exists vocab_words_updated_idx on public.vocab_words(user_id, updated_at);

drop trigger if exists trg_vocab_words_updated on public.vocab_words;
create trigger trg_vocab_words_updated before update on public.vocab_words
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- tasks — daily study schedule blocks
-- ---------------------------------------------------------------------
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  type text,
  time text,
  duration integer,
  notes text,
  link_tab text,
  pinned boolean not null default false,
  sort_order integer not null default 0,
  client_id text,                           -- preserves "task-flashcards" stable id
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists tasks_user_idx on public.tasks(user_id);
create index if not exists tasks_updated_idx on public.tasks(user_id, updated_at);
create unique index if not exists tasks_user_client_idx on public.tasks(user_id, client_id) where client_id is not null;

drop trigger if exists trg_tasks_updated on public.tasks;
create trigger trg_tasks_updated before update on public.tasks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- task_completions — one row per (task, day) tracking done/undone
-- ---------------------------------------------------------------------
create table if not exists public.task_completions (
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  day date not null,
  done boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, task_id, day)
);

create index if not exists task_completions_user_day_idx on public.task_completions(user_id, day);
create index if not exists task_completions_updated_idx on public.task_completions(user_id, updated_at);

drop trigger if exists trg_task_completions_updated on public.task_completions;
create trigger trg_task_completions_updated before update on public.task_completions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- grammar_drills
-- ---------------------------------------------------------------------
create table if not exists public.grammar_drills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  book text,
  unit text,
  exercises text,
  due date,
  notes text,
  done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists grammar_drills_user_idx on public.grammar_drills(user_id);
create index if not exists grammar_drills_updated_idx on public.grammar_drills(user_id, updated_at);

drop trigger if exists trg_grammar_drills_updated on public.grammar_drills;
create trigger trg_grammar_drills_updated before update on public.grammar_drills
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- media_logs — reading / listening sessions
-- ---------------------------------------------------------------------
create table if not exists public.media_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text,
  title text,
  source text,
  minutes integer,
  notes text,
  logged_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists media_logs_user_idx on public.media_logs(user_id);
create index if not exists media_logs_updated_idx on public.media_logs(user_id, updated_at);

drop trigger if exists trg_media_logs_updated on public.media_logs;
create trigger trg_media_logs_updated before update on public.media_logs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- review_sessions — per-folder review counters
-- ---------------------------------------------------------------------
create table if not exists public.review_sessions (
  user_id uuid not null references auth.users(id) on delete cascade,
  folder text not null,
  seen integer not null default 0,
  grades jsonb not null default '{}'::jsonb,
  word_grades jsonb not null default '{}'::jsonb,
  filter text,
  updated_at timestamptz not null default now(),
  primary key (user_id, folder)
);

create index if not exists review_sessions_updated_idx on public.review_sessions(user_id, updated_at);

drop trigger if exists trg_review_sessions_updated on public.review_sessions;
create trigger trg_review_sessions_updated before update on public.review_sessions
  for each row execute function public.set_updated_at();

-- =====================================================================
-- Row Level Security — every table is per-user
-- =====================================================================

alter table public.profiles          enable row level security;
alter table public.vocab_folders     enable row level security;
alter table public.vocab_words       enable row level security;
alter table public.tasks             enable row level security;
alter table public.task_completions  enable row level security;
alter table public.grammar_drills    enable row level security;
alter table public.media_logs        enable row level security;
alter table public.review_sessions   enable row level security;

-- ---------------------------------------------------------------------
-- profiles: id IS the user id
-- ---------------------------------------------------------------------
drop policy if exists "profiles self select" on public.profiles;
create policy "profiles self select" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles self insert" on public.profiles;
create policy "profiles self insert" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- ---------------------------------------------------------------------
-- Macro: same four policies on every per-user table
-- ---------------------------------------------------------------------
do $$
declare
  t text;
  tables text[] := array[
    'vocab_folders', 'vocab_words', 'tasks', 'task_completions',
    'grammar_drills', 'media_logs', 'review_sessions'
  ];
begin
  foreach t in array tables loop
    execute format('drop policy if exists "%I self select" on public.%I;', t, t);
    execute format('create policy "%I self select" on public.%I for select using (auth.uid() = user_id);', t, t);
    execute format('drop policy if exists "%I self insert" on public.%I;', t, t);
    execute format('create policy "%I self insert" on public.%I for insert with check (auth.uid() = user_id);', t, t);
    execute format('drop policy if exists "%I self update" on public.%I;', t, t);
    execute format('create policy "%I self update" on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id);', t, t);
    execute format('drop policy if exists "%I self delete" on public.%I;', t, t);
    execute format('create policy "%I self delete" on public.%I for delete using (auth.uid() = user_id);', t, t);
  end loop;
end;
$$;
