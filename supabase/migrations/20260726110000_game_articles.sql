begin;

create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  slug text not null,
  title text not null,
  summary text not null,
  body text not null,
  category text not null default 'news',
  status text not null default 'draft',
  hero_image_url text,
  hero_alt text,
  author_name text,
  created_by uuid,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint articles_game_slug_key unique (game_id, slug),
  constraint articles_slug_format_check
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint articles_title_not_blank_check
    check (length(trim(title)) > 0),
  constraint articles_summary_not_blank_check
    check (length(trim(summary)) > 0),
  constraint articles_body_not_blank_check
    check (length(trim(body)) > 0),
  constraint articles_category_check
    check (category in ('news', 'reveal', 'market', 'event', 'release', 'guide')),
  constraint articles_status_check
    check (status in ('draft', 'published')),
  constraint articles_published_date_check
    check (status <> 'published' or published_at is not null),
  constraint articles_hero_alt_check
    check (hero_image_url is null or length(trim(coalesce(hero_alt, ''))) > 0)
);

create index if not exists articles_public_feed_idx
  on public.articles (game_id, published_at desc, id desc)
  where status = 'published';

create index if not exists articles_admin_feed_idx
  on public.articles (game_id, updated_at desc, id desc);

alter table public.articles enable row level security;
revoke all on table public.articles from anon, authenticated;
grant select, insert, update, delete on table public.articles to service_role;

comment on table public.articles is
  'Game-scoped editorial stories shown on each game market page and news archive.';
comment on column public.articles.body is
  'Plain-text editorial body with lightweight Markdown-style headings and lists rendered safely by the app.';
comment on column public.articles.published_at is
  'Controls both public visibility and reverse-chronological feed ordering.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'article-heroes',
  'article-heroes',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Preserve the four One Piece stories already shown on the market page so the
-- new reader launches without dead cards. Editors can replace this starter
-- copy and upload final heroes from /admin/articles.
insert into public.articles (
  game_id,
  slug,
  title,
  summary,
  body,
  category,
  status,
  published_at,
  author_name
)
select
  games.id,
  seed.slug,
  seed.title,
  seed.summary,
  seed.body,
  seed.category,
  'published',
  seed.published_at,
  'Moon Market Editorial'
from public.games games
cross join (
  values
    (
      'op16-round-one-reveals',
      'Round 1 cards revealed — OP16 first look',
      'A first look at the opening wave of OP-16 card reveals and what collectors should watch as more details arrive.',
      E'The first OP-16 reveals are here, opening a new round of discussion for players and collectors. This page brings the early story together in one place as the release picture develops.\n\n## What to watch\n\n- Newly revealed leaders and their likely deck homes\n- Alternate-art treatments and early collector interest\n- Official release details as they are confirmed\n\nMoon Market will keep this story updated as the reveal cycle continues.',
      'reveal',
      '2026-07-14T09:00:00Z'::timestamptz
    ),
    (
      'regional-market-movers',
      'Top regional cards: what won and what it did to prices',
      'A market-focused recap of the cards drawing attention after the latest regional results.',
      E'Regional results often move the One Piece market quickly. Strong finishes can create new demand for deck staples, while cards that miss expectations may cool just as fast.\n\n## Reading the movement\n\nThe useful signal is not a single sale. Watch the combination of tournament representation, available supply, and repeated sales across several days. That context helps separate a lasting move from a brief spike.\n\nUse the live market tables alongside this editorial recap to follow the cards that matter.',
      'market',
      '2026-07-11T09:00:00Z'::timestamptz
    ),
    (
      'one-piece-day-2026',
      'One Piece Day 2026 — full reveal schedule',
      'Keep track of the One Piece Day reveal window and the announcements collectors will want to follow.',
      E'One Piece Day is a major checkpoint for card-game announcements. This story is the home for the reveal schedule, official links, and the collector-focused details that emerge from the event.\n\n## Follow the story\n\nWe will organize confirmed announcements here in chronological order so readers can catch up without hunting across multiple feeds. Check back during the event for updates.',
      'event',
      '2026-07-08T09:00:00Z'::timestamptz
    ),
    (
      'op16-secret-rare',
      'Round 2 cards revealed — secret rare chase confirmed',
      'The next OP-16 reveal wave turns attention to the set’s high-rarity chase cards.',
      E'The second reveal wave shifts the conversation toward OP-16’s chase cards. Collectors will be watching artwork, rarity treatments, and early availability as the full set takes shape.\n\n## Collector checklist\n\n- Compare confirmed variants before placing early orders\n- Watch completed sales instead of asking prices\n- Revisit the market after wider product availability\n\nThis article will be updated when the editorial team has more confirmed release information.',
      'release',
      '2026-07-05T09:00:00Z'::timestamptz
    )
) as seed(slug, title, summary, body, category, published_at)
where games.slug = 'one_piece'
on conflict (game_id, slug) do nothing;

commit;
