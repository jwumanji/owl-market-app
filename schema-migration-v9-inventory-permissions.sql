-- Migration v9: Inventory permissions for the server-side Supabase role
-- Run this in Supabase Studio -> SQL Editor -> New Query -> Run
--
-- This keeps direct browser access locked down, but explicitly allows the
-- server-side service_role key used by the Next.js admin inventory pages.

alter table inventory_items enable row level security;
alter table inventory_status_history enable row level security;

grant usage on schema public to service_role;
grant select, insert, update, delete on table inventory_items to service_role;
grant select, insert, update, delete on table inventory_status_history to service_role;
grant select on table cards to service_role;
grant select on table sets to service_role;

-- Supabase's API role still needs ordinary Postgres table privileges before
-- RLS policies are evaluated. These broader grants are intentional for the
-- server-only service role and do not grant browser anon access.
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

alter default privileges in schema public grant all privileges on tables to service_role;
alter default privileges in schema public grant all privileges on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;

drop policy if exists "service_role can manage inventory_items" on inventory_items;
create policy "service_role can manage inventory_items"
on inventory_items
for all
to service_role
using (true)
with check (true);

drop policy if exists "service_role can manage inventory_status_history" on inventory_status_history;
create policy "service_role can manage inventory_status_history"
on inventory_status_history
for all
to service_role
using (true)
with check (true);
