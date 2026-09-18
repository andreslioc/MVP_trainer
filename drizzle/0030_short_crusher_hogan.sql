-- `pretraining_activity` es privada por asesora. Esta migracion solo aplica
-- las defensas de Supabase; Vitest usa PostgreSQL puro y no tiene esos roles.
do $migration$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise notice 'Skipping Supabase RLS migration outside Supabase';
    return;
  end if;

  alter table public.pretraining_activity enable row level security;

  revoke all on table public.pretraining_activity from anon, authenticated;
  grant all on table public.pretraining_activity to service_role;
  grant select, insert, update, delete on table public.pretraining_activity to authenticated;

  create policy pretraining_activity_advisor_select
    on public.pretraining_activity for select to authenticated
    using (
      advisor_id = (select auth.uid()) or exists (
        select 1 from public.advisors a
        where a.id = (select auth.uid()) and a.role = 'admin' and a.status = 'activa'
      )
    );

  create policy pretraining_activity_advisor_insert
    on public.pretraining_activity for insert to authenticated
    with check (advisor_id = (select auth.uid()));

  create policy pretraining_activity_advisor_update
    on public.pretraining_activity for update to authenticated
    using (advisor_id = (select auth.uid()))
    with check (advisor_id = (select auth.uid()));

  create policy pretraining_activity_advisor_delete
    on public.pretraining_activity for delete to authenticated
    using (advisor_id = (select auth.uid()));
end
$migration$;
