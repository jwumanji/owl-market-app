-- Preserve unavailable price-change metrics as NULL in public summaries.
-- The full function definition remains owned by schema-migration-v47.
alter table public.public_rarity_summaries
  alter column chg_7d drop not null,
  alter column chg_30d drop not null;

alter table public.public_character_summaries
  alter column chg_7d drop not null,
  alter column chg_30d drop not null;

do $$
declare
  current_definition text;
  corrected_definition text;
begin
  select pg_get_functiondef('public.refresh_public_game_summaries(uuid)'::regprocedure)
  into current_definition;

  if current_definition is null then
    raise exception 'refresh_public_game_summaries(uuid) is not installed';
  end if;

  corrected_definition := current_definition;
  corrected_definition := replace(corrected_definition, $from$coalesce(avg(chg_7d), 0) as chg_7d$from$, $to$avg(chg_7d) as chg_7d$to$);
  corrected_definition := replace(corrected_definition, $from$coalesce(avg(chg_30d), 0) as chg_30d$from$, $to$avg(chg_30d) as chg_30d$to$);
  corrected_definition := replace(corrected_definition, $from$'chg1d', coalesce(chg_1d, 0)$from$, $to$'chg1d', chg_1d$to$);
  corrected_definition := replace(corrected_definition, $from$'chg7d', coalesce(chg_7d, 0)$from$, $to$'chg7d', chg_7d$to$);
  corrected_definition := replace(corrected_definition, $from$'chg30d', coalesce(chg_30d, 0)$from$, $to$'chg30d', chg_30d$to$);
  corrected_definition := replace(corrected_definition, $from$round(coalesce(aggregates.chg_7d, 0), 1)$from$, $to$round(aggregates.chg_7d, 1)$to$);
  corrected_definition := replace(corrected_definition, $from$round(coalesce(aggregates.chg_30d, 0), 1)$from$, $to$round(aggregates.chg_30d, 1)$to$);

  if position($check$'chg1d', chg_1d$check$ in corrected_definition) = 0
    or position($check$avg(chg_7d) as chg_7d$check$ in corrected_definition) = 0
    or position($check$round(aggregates.chg_30d, 1)$check$ in corrected_definition) = 0
  then
    raise exception 'Unexpected refresh_public_game_summaries definition; nullable change upgrade was not applied';
  end if;

  if corrected_definition <> current_definition then
    execute corrected_definition;
  end if;
end
$$;

select public.refresh_public_game_summaries();
