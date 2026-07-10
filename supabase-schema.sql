create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  employment_id text unique not null,
  full_name text not null default '',
  preferred_name text not null default '',
  work_start_date date,
  contract_type text not null default 'INDEPENDENT PARTNER',
  address_of_residence text not null default '',
  citizenship_country text not null default '',
  iban text not null default '',
  personal_email text not null default '',
  job_role text not null default '',
  work_email text not null default '',
  estimated_hours text not null default '',
  phone_number text not null default '',
  benefit_programs text[] not null default '{}',
  time_zone text not null default '',
  strike_system integer not null default 0 check (strike_system >= 0 and strike_system <= 3),
  portfolio text not null default '',
  languages text not null default '',
  software text not null default '',
  seniority text not null default '',
  gdpr_signed boolean not null default false,
  nda_signed boolean not null default false,
  onboarding_contract_type text not null default 'None',
  xp integer not null default 0,
  status text not null default 'active',
  status_until date,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_state (
  id text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.levelup_levels (
  id uuid primary key default gen_random_uuid(),
  level_number integer not null,
  name text not null,
  xp_required integer not null,
  description text not null default ''
);

create table public.levelup_rewards (
  id uuid primary key default gen_random_uuid(),
  level_id uuid references public.levelup_levels(id) on delete cascade,
  reward_name text not null,
  description text not null default ''
);

create table public.guide_pages (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null default '',
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
