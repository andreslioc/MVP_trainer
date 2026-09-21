-- Las metas son visibles para su dueña y para supervision; solo administracion
-- las configura. Vitest usa PostgreSQL puro, donde estos roles no existen.
do $migration$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise notice 'Skipping Supabase RLS migration outside Supabase';
    return;
  end if;

  alter table public.weekly_training_goals enable row level security;

  revoke all on table public.weekly_training_goals from anon, authenticated;
  grant all on table public.weekly_training_goals to service_role;
  grant select, insert, update, delete on table public.weekly_training_goals to authenticated;

  create policy weekly_training_goals_select
    on public.weekly_training_goals for select to authenticated
    using (
      advisor_id = (select auth.uid()) or exists (
        select 1 from public.advisors a
        where a.id = (select auth.uid())
          and a.role in ('supervisor', 'admin')
          and a.status = 'activa'
      )
    );

  create policy weekly_training_goals_admin_insert
    on public.weekly_training_goals for insert to authenticated
    with check (exists (
      select 1 from public.advisors a
      where a.id = (select auth.uid()) and a.role = 'admin' and a.status = 'activa'
    ));

  create policy weekly_training_goals_admin_update
    on public.weekly_training_goals for update to authenticated
    using (exists (
      select 1 from public.advisors a
      where a.id = (select auth.uid()) and a.role = 'admin' and a.status = 'activa'
    ))
    with check (exists (
      select 1 from public.advisors a
      where a.id = (select auth.uid()) and a.role = 'admin' and a.status = 'activa'
    ));

  create policy weekly_training_goals_admin_delete
    on public.weekly_training_goals for delete to authenticated
    using (exists (
      select 1 from public.advisors a
      where a.id = (select auth.uid()) and a.role = 'admin' and a.status = 'activa'
    ));
end
$migration$;
