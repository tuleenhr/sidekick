-- Run this in your Supabase SQL editor to set up the database

create table if not exists open_loops (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  bucket text,
  source text,
  source_ref text,
  urgency text default 'grey',
  relevant_this_week boolean default false,
  snoozed_until date,
  status text default 'open',
  first_step text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists deadlines (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  due_date timestamptz not null,
  due_timezone text default 'Europe/London',
  due_saudi_time text,
  category text,
  urgency text default 'yellow',
  source text,
  source_email_id text,
  first_step text,
  estimated_minutes int,
  consequence text,
  status text default 'pending',
  created_at timestamptz default now()
);

create table if not exists email_triage (
  id uuid primary key default gen_random_uuid(),
  gmail_thread_id text not null,
  gmail_message_id text not null,
  sender text,
  subject text,
  received_at timestamptz,
  summary text,
  classification text,
  hidden_deadline date,
  hidden_deadline_note text,
  friction_note text,
  draft_reply text,
  urgency text,
  status text default 'pending',
  created_at timestamptz default now()
);

create table if not exists briefings (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  generated_at timestamptz default now(),
  brief_paragraph text,
  priorities jsonb,
  day_plan jsonb,
  open_loops_count int,
  open_loops_this_week int,
  identity_action text,
  warnings jsonb,
  moved_to_later jsonb,
  raw_input_snapshot jsonb
);

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  role text not null,
  content text not null,
  created_at timestamptz default now()
);

create table if not exists user_context (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  value text not null,
  updated_at timestamptz default now()
);

-- Seed some example deadlines
insert into deadlines (title, due_date, category, urgency, consequence, first_step, source) values
  ('KBS Consultancy Project Application', '2026-07-03 23:59:00+01', 'career', 'red', 'Miss the deadline and you can''t join the project', 'Open the application portal and start the personal statement', 'manual'),
  ('UCSD Learning Agreement submission', '2026-07-15 23:59:00+07', 'uni', 'orange', 'Delays year-abroad start date', 'Email the Global Mobility team to confirm the form link', 'manual'),
  ('UCSD Housing Application', '2026-07-01 17:00:00-07', 'admin', 'red', 'No on-campus housing for year abroad', 'Log into UCSD housing portal and check which options are still open', 'manual')
on conflict do nothing;

-- Seed some open loops
insert into open_loops (title, bucket, source, urgency, relevant_this_week, first_step) values
  ('Reply to Global Mobility email about nomination', 'admin', 'manual', 'red', true, 'Open Gmail, find the Global Mobility thread, read the last email'),
  ('Fill in UCSD health form checklist', 'admin', 'manual', 'orange', true, 'Go to the UCSD health portal link from the acceptance email'),
  ('Research San Diego housing options', 'admin', 'manual', 'yellow', false, 'Search UCSD off-campus housing Facebook group'),
  ('Book driving theory test', 'admin', 'manual', 'yellow', false, 'Go to gov.uk/book-theory-test'),
  ('Study for driving theory', 'growth', 'manual', 'grey', false, 'Download the DVSA theory test app'),
  ('Cook a proper meal this week', 'joy', 'manual', 'grey', true, 'Pick one recipe and check what ingredients you have'),
  ('Send one cold email to a company I''d like to intern at', 'growth', 'manual', 'yellow', true, 'Find 3 companies, pick one, draft a 5-line email')
on conflict do nothing;

-- Default user context
insert into user_context (key, value) values
  ('location', 'riyadh'),
  ('current_focus', 'KBS application due 3 July 2026, UCSD year abroad prep (Learning Agreement, housing, health forms), internship search')
on conflict (key) do nothing;
