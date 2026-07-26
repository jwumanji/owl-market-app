-- Moon Terminal Phase C — preflight checks (D2)
-- READ-ONLY. Run in the Supabase SQL editor; paste full output back.
-- Date: 2026-07-26 · Requested in docs/moon-terminal-phases-c-g-plan.md §1
--
-- What each block answers is in the comment above it, with the interpretation
-- key so the output is self-explanatory.

-- ---------------------------------------------------------------------------
-- 1. pg_cron inventory — confirm job 1 exists, its schedule and command
-- ---------------------------------------------------------------------------
select jobid, jobname, schedule, active, command
from cron.job
order by jobid;

-- ---------------------------------------------------------------------------
-- 2. Has the set-value cron EVER fired? (findings §5 open question)
--    Interpretation:
--      no rows            -> never fired; created after 07-19, first fire is
--                            Sunday 2026-07-27 23:40 UTC — check again Monday
--      rows w/ 'failed'   -> failing silently; return_message says why
--      rows w/ 'succeeded'-> it fired; then the 07-23 Thursday snapshot being
--                            the ONLY row needs a different explanation
-- ---------------------------------------------------------------------------
select jobid, runid, status, return_message, start_time, end_time
from cron.job_run_details
order by start_time desc
limit 20;

-- ---------------------------------------------------------------------------
-- 3. Is v50 (20260726150000_terminal_sealed_index_cleanup) applied?
--    Interpretation — look for these two index names:
--      uq_sealed_price_history_product_source_day
--      idx_sealed_price_history_game_date
--    BOTH PRESENT -> v50 not applied (expected: its header says never applied;
--                    a future `supabase db push` from the other machine will
--                    apply and record it)
--    BOTH ABSENT  -> v50 applied
--    Either way these two MUST be present (the originals v50 preserves):
--      sealed_product_price_history_product_day_key
--      sealed_product_price_history_game_date_idx
-- ---------------------------------------------------------------------------
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'sealed_product_price_history'
order by indexname;

-- ---------------------------------------------------------------------------
-- 4. game_rarities twin-unique check (v50's report block, run standalone)
--    Interpretation: >1 unique index covering exactly (id, game_id) means v49
--    created a twin; decision on which to drop stays manual (do NOT drop here).
-- ---------------------------------------------------------------------------
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'game_rarities'
  and indexdef ilike '%unique%'
order by indexname;

-- ---------------------------------------------------------------------------
-- 5. Migration tracking tail — confirms v49 has its hand-inserted row and that
--    v50 has NO row (it must be applied+recorded by db push, never by hand)
-- ---------------------------------------------------------------------------
select version, name
from supabase_migrations.schema_migrations
order by version desc
limit 10;
