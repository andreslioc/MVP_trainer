-- live_simulations nacio en 0012 sin RLS: quedo fuera del bloque de 0001 y
-- nadie la agrego despues. Es la unica tabla de public sin RLS, y por eso el
-- advisor de Supabase la marca como CRITICAL: esta expuesta a PostgREST.
--
-- Activar RLS va fuera del guardia de rol a proposito (igual que 0006): no
-- necesita que exista el rol `authenticated`, corre sobre Postgres puro y por
-- eso tambien aplica en la base de pruebas, donde una prueba puede afirmarlo.
alter table public.live_simulations enable row level security;
--> statement-breakpoint
-- Los grants y las politicas si necesitan los roles de Supabase.
do $migration$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise notice 'Skipping Supabase grants and policies outside Supabase';
    return;
  end if;

  execute $sql$
    revoke all on table public.live_simulations from anon, authenticated;
    grant all on table public.live_simulations to service_role;
    grant select, insert, update, delete on table public.live_simulations to authenticated
  $sql$;

  execute $sql$
    create policy live_simulations_advisor_select
      on public.live_simulations for select to authenticated
      using (
        advisor_id = (select auth.uid()) or exists (
          select 1 from public.advisors a
          where a.id = (select auth.uid()) and a.role = 'admin' and a.status = 'activa'
        )
      );
    create policy live_simulations_advisor_insert
      on public.live_simulations for insert to authenticated
      with check (advisor_id = (select auth.uid()));
    create policy live_simulations_advisor_update
      on public.live_simulations for update to authenticated
      using (advisor_id = (select auth.uid()))
      with check (advisor_id = (select auth.uid()));
    create policy live_simulations_advisor_delete
      on public.live_simulations for delete to authenticated
      using (advisor_id = (select auth.uid()))
  $sql$;
end
$migration$;
