create extension if not exists pgcrypto;

create table if not exists public.hardware_history (
  id uuid primary key default gen_random_uuid(),
  block_id text not null,
  block_type text not null,
  block_capability text not null,
  status text not null,
  battery integer not null,
  source text not null default 'server_snapshot',
  payload jsonb not null default '{}'::jsonb,
  recorded_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists hardware_history_block_id_recorded_at_idx
  on public.hardware_history (block_id, recorded_at desc);

create index if not exists hardware_history_capability_recorded_at_idx
  on public.hardware_history (block_capability, recorded_at desc);

create index if not exists hardware_history_recorded_at_idx
  on public.hardware_history (recorded_at desc);

alter table public.hardware_history enable row level security;

drop policy if exists "service role full access on hardware_history" on public.hardware_history;
create policy "service role full access on hardware_history"
  on public.hardware_history
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
