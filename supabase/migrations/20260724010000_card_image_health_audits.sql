begin;

create table if not exists public.card_image_health_audits (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null,
  completed_at timestamptz not null,
  scope text not null default 'all_active_games',
  healthy boolean not null,
  game_count integer not null default 0 check (game_count >= 0),
  card_count integer not null default 0 check (card_count >= 0),
  probed_count integer not null default 0 check (probed_count >= 0),
  broken_count integer not null default 0 check (broken_count >= 0),
  missing_source_count integer not null default 0 check (missing_source_count >= 0),
  mirror_error_count integer not null default 0 check (mirror_error_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  summaries jsonb not null default '[]'::jsonb,
  issues jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint card_image_health_audits_scope_check check (length(trim(scope)) > 0),
  constraint card_image_health_audits_summaries_check check (jsonb_typeof(summaries) = 'array'),
  constraint card_image_health_audits_issues_check check (jsonb_typeof(issues) = 'array')
);

create index if not exists card_image_health_audits_created_at_idx
  on public.card_image_health_audits (created_at desc);

alter table public.card_image_health_audits enable row level security;

revoke all on table public.card_image_health_audits from anon, authenticated;
grant select, insert on table public.card_image_health_audits to service_role;

commit;
