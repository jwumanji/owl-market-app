-- OWL Market — Moon Terminal: admit entity_type='set_baseline' to
-- market_index_snapshots (set-value v2, booster-baseline population)
--
-- ############################################################################
-- ## NOT YET APPLIED at authoring time (2026-07-28). Justin applies this by ##
-- ## hand in the SQL editor. DELIBERATELY NO TRACKING ROW (Justin's         ##
-- ## instruction): the file stays unrecorded so a future `supabase db push` ##
-- ## re-runs it — harmless, it is idempotent — and records it normally.     ##
-- ## Do NOT insert a schema_migrations row for this file by hand.           ##
-- ############################################################################
--
-- WHY. The set-value v2 series needs a fourth entity_type. Two CHECK
-- constraints whitelist the current three; the v2 livability probe was
-- rejected with 23514 (docs/investigations/set-value-v2.md). Option B —
-- widening the whitelist — was chosen over widening the natural key to
-- include metric_version, because the key change could silently break the
-- Sunday pg_cron capture's ON CONFLICT arbiter inside a function the
-- out-of-repo Codex machine can redeploy without our knowledge. That risk was
-- ruled disqualifying (Justin, 2026-07-28). See the option analysis in
-- docs/investigations/set-value-v2.md.
--
-- SEMANTICS — READ BEFORE CONSUMING THIS TABLE. Two set series now coexist
-- and mean DIFFERENT populations:
--
--   entity_type='set'           the OFFICIAL series. index_value sums the full
--                               printed_set_code population — PROMO-INCLUSIVE.
--                               45.5% of the One Piece index is promo/event
--                               paper (value-ratio-population-audit.md §1).
--   entity_type='set_baseline'  metric_version=2. Sums ONLY the booster-
--                               baseline population defined by
--                               src/lib/games/one-piece/booster-baseline.ts.
--                               Feeds every Value Ratio surface.
--
-- The two figures are NOT comparable. A consumer reading entity_type='set'
-- gets the promo-inclusive number — choose deliberately. This ambiguity is
-- exactly how the polluted population shipped in the first place
-- (moon-terminal-sealed-spec.md §2.2, CLAUDE.md §8).
--
-- MECHANICS. Postgres cannot ALTER a CHECK in place, so each amendment is
-- drop-and-re-add, guarded so a re-run is a no-op once the definition already
-- admits 'set_baseline'. Both predicates below copy the live branches
-- VERBATIM (introspected via pg_get_constraintdef, pasted by Justin
-- 2026-07-28) and append exactly one element / one branch. The new
-- 'set_baseline' reference branch is identical to the 'set' branch. Re-adding
-- validates existing rows; both new predicates are strict supersets of the
-- old, so validation cannot fail on legitimate data. Table is ~1.8k rows —
-- validation is instant.

begin;

do $$
begin
  -- 1. entity_type whitelist gains 'set_baseline'
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.market_index_snapshots'::regclass
      and conname = 'market_index_snapshots_entity_type_check'
      and pg_get_constraintdef(oid) ilike '%set_baseline%'
  ) then
    alter table public.market_index_snapshots
      drop constraint if exists market_index_snapshots_entity_type_check;
    alter table public.market_index_snapshots
      add constraint market_index_snapshots_entity_type_check
      check (entity_type = any (array[
        'character'::text,
        'set'::text,
        'rarity'::text,
        'set_baseline'::text
      ]));
  end if;

  -- 2. reference rules gain a 'set_baseline' branch identical to 'set'
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.market_index_snapshots'::regclass
      and conname = 'market_index_snapshots_entity_reference_check'
      and pg_get_constraintdef(oid) ilike '%set_baseline%'
  ) then
    alter table public.market_index_snapshots
      drop constraint if exists market_index_snapshots_entity_reference_check;
    alter table public.market_index_snapshots
      add constraint market_index_snapshots_entity_reference_check
      check (
        entity_type = 'character' and character_id is not null and set_id is null and rarity_id is null
        or entity_type = 'set' and character_id is null and rarity_id is null
        or entity_type = 'rarity' and character_id is null and set_id is null
        or entity_type = 'set_baseline' and character_id is null and rarity_id is null
      );
  end if;
end
$$;

commit;

-- ---------------------------------------------------------------------------
-- Verification 1 — definitional: both constraints exist and admit the type
-- ---------------------------------------------------------------------------

do $$
declare
  missing text[] := '{}';
  c record;
begin
  for c in
    select unnest(array[
      'market_index_snapshots_entity_type_check',
      'market_index_snapshots_entity_reference_check'
    ]) as conname
  loop
    if not exists (
      select 1 from pg_constraint
      where conrelid = 'public.market_index_snapshots'::regclass
        and conname = c.conname
        and pg_get_constraintdef(oid) ilike '%set_baseline%'
    ) then
      missing := missing || c.conname;
    end if;
  end loop;

  if array_length(missing, 1) is not null then
    raise exception 'set_baseline migration incomplete, constraint(s) missing or unamended: %',
      array_to_string(missing, ', ');
  end if;

  raise notice 'set_baseline OK — both constraints amended.';
end
$$;

-- ---------------------------------------------------------------------------
-- Verification 2 — functional: a real set_baseline row inserts and deletes.
-- Mirrors a live entity_type='set' row (so every other CHECK — counts,
-- not-blank, index_value, metric_version, region — is satisfied by
-- construction), overriding only type, key, date, and metric_version.
-- Leaves zero residue.
-- ---------------------------------------------------------------------------

do $$
declare
  src jsonb;
  n int;
begin
  select to_jsonb(m) into src
  from public.market_index_snapshots m
  where m.entity_type = 'set'
  limit 1;

  if src is null then
    raise exception 'verification: no entity_type=''set'' row to mirror';
  end if;

  src := src || jsonb_build_object(
    'id', gen_random_uuid(),
    'entity_type', 'set_baseline',
    'entity_key', '__v2_probe__',
    'snapshot_date', '1970-01-01',
    'metric_version', 2
  );

  insert into public.market_index_snapshots
  select * from jsonb_populate_record(null::public.market_index_snapshots, src);

  delete from public.market_index_snapshots
  where entity_type = 'set_baseline'
    and entity_key = '__v2_probe__';
  get diagnostics n = row_count;

  if n <> 1 then
    raise exception 'verification: probe delete removed % rows, expected 1', n;
  end if;

  raise notice 'set_baseline OK — functional probe inserted and deleted cleanly.';
end
$$;
