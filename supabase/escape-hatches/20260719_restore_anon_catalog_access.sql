-- Emergency restoration of the anonymous catalog access removed by
-- 20260719090000_multitcg_integrity_and_sync_scope.sql.
-- This restores the prior grants and card-character-link policy; it does not
-- alter any multi-TCG data.
-- Provider identity tables intentionally remain service-only. If a regression
-- involves provider metadata, repair the server-side service path instead of
-- granting anon access to card_external_ids, set_external_ids, or
-- price_provider_mappings.

begin;

grant usage on schema public to anon;

grant select on table public.games to anon;
grant select on table public.game_rarities to anon;
grant select on table public.game_variants to anon;
grant select on table public.game_set_types to anon;

do $$
begin
  if to_regclass('public.card_character_links') is not null then
    grant select on table public.card_character_links to anon;
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'card_character_links'
        and policyname = 'Public card character links are readable'
    ) then
      execute 'create policy "Public card character links are readable" on public.card_character_links for select using (true)';
    end if;
  end if;

  if to_regclass('public.public_rarity_summaries') is not null then
    grant select on table public.public_rarity_summaries to anon;
  end if;

  if to_regclass('public.public_character_summaries') is not null then
    grant select on table public.public_character_summaries to anon;
  end if;
end
$$;

notify pgrst, 'reload schema';

commit;
