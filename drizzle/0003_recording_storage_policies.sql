-- Storage is Supabase-only. Plain PostgreSQL runs the same Drizzle history in
-- integration tests, so this migration becomes a no-op when Storage is absent.
do $migration$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated')
    or to_regclass('storage.objects') is null then
    raise notice 'Skipping Storage policies outside Supabase';
    return;
  end if;

  execute $sql$
    create policy recordings_owner_select
      on storage.objects for select to authenticated
      using (
        bucket_id = 'live-recordings'
        and (storage.foldername(name))[1] = (select auth.uid()::text)
      );

    create policy recordings_owner_insert
      on storage.objects for insert to authenticated
      with check (
        bucket_id = 'live-recordings'
        and (storage.foldername(name))[1] = (select auth.uid()::text)
      );

    create policy recordings_owner_delete
      on storage.objects for delete to authenticated
      using (
        bucket_id = 'live-recordings'
        and (storage.foldername(name))[1] = (select auth.uid()::text)
      )
  $sql$;
end
$migration$;
