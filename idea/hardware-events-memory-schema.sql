create extension if not exists pgcrypto;

create table if not exists public.hardware_events (
  id uuid primary key default gen_random_uuid(),
  protocol_version integer not null,
  event_ts_ms bigint not null,
  recorded_at timestamptz not null,
  msg_id text not null,
  topic text not null,
  scope text not null,
  subject text not null,
  type text not null,
  node_id text not null,
  node_type text null,
  chip_family text null,
  mac_suffix text null,
  capability text null,
  signal_name text null,
  status text null,
  success boolean null,
  confidence real null,
  payload jsonb not null default '{}'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  source text not null default 'mqtt',
  ingest_trace_id text null,
  ingested_at timestamptz not null default now(),
  home_id text null,
  room_id text null,
  created_at timestamptz not null default now()
);

create unique index if not exists hardware_events_msg_id_uidx
  on public.hardware_events (msg_id);

create index if not exists hardware_events_recorded_at_idx
  on public.hardware_events (recorded_at desc);

create index if not exists hardware_events_node_id_recorded_at_idx
  on public.hardware_events (node_id, recorded_at desc);

create index if not exists hardware_events_scope_subject_recorded_at_idx
  on public.hardware_events (scope, subject, recorded_at desc);

create index if not exists hardware_events_type_recorded_at_idx
  on public.hardware_events (type, recorded_at desc);

create index if not exists hardware_events_capability_recorded_at_idx
  on public.hardware_events (capability, recorded_at desc);

create index if not exists hardware_events_home_id_recorded_at_idx
  on public.hardware_events (home_id, recorded_at desc);

create index if not exists hardware_events_payload_gin_idx
  on public.hardware_events using gin (payload jsonb_path_ops);

alter table public.hardware_events enable row level security;

drop policy if exists "service role full access on hardware_events" on public.hardware_events;
create policy "service role full access on hardware_events"
  on public.hardware_events
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create table if not exists public.context_episodes (
  id uuid primary key default gen_random_uuid(),
  home_id text null,
  room_id text null,
  context_type text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  confidence real not null,
  summary text not null,
  source text not null default 'rule_engine',
  evidence jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists context_episodes_home_id_start_at_idx
  on public.context_episodes (home_id, start_at desc);

create index if not exists context_episodes_context_type_start_at_idx
  on public.context_episodes (context_type, start_at desc);

create index if not exists context_episodes_status_start_at_idx
  on public.context_episodes (status, start_at desc);

alter table public.context_episodes enable row level security;

drop policy if exists "service role full access on context_episodes" on public.context_episodes;
create policy "service role full access on context_episodes"
  on public.context_episodes
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create table if not exists public.agent_memories (
  id uuid primary key default gen_random_uuid(),
  home_id text null,
  memory_type text not null,
  memory_key text not null,
  memory_value text not null,
  confidence real not null,
  evidence_count integer not null default 1,
  last_observed_at timestamptz not null,
  source_episode_ids jsonb not null default '[]'::jsonb,
  reason text null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists agent_memories_home_id_key_uidx
  on public.agent_memories (home_id, memory_key)
  where status = 'active';

create index if not exists agent_memories_home_id_updated_at_idx
  on public.agent_memories (home_id, updated_at desc);

create index if not exists agent_memories_memory_type_updated_at_idx
  on public.agent_memories (memory_type, updated_at desc);

alter table public.agent_memories enable row level security;

drop policy if exists "service role full access on agent_memories" on public.agent_memories;
create policy "service role full access on agent_memories"
  on public.agent_memories
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
