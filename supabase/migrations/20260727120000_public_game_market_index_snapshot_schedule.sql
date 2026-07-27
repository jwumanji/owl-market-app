-- Extend the weekly market-index history job to every live public game.
-- The capture function is already game-scoped and idempotent for a date.

begin;

create extension if not exists pg_cron with schema pg_catalog;

do $$
declare
  existing_job_id bigint;
begin
  for existing_job_id in
    select jobid
    from cron.job
    where jobname in (
      'one-piece-market-index-snapshots',
      'public-game-market-index-snapshots'
    )
  loop
    perform cron.unschedule(existing_job_id);
  end loop;

  perform cron.schedule(
    'public-game-market-index-snapshots',
    '40 23 * * 0',
    $command$
      select public.capture_market_index_snapshots(games.id, current_date)
      from public.games
      where games.is_active = true
        and games.is_public = true;
    $command$
  );
end
$$;

commit;
