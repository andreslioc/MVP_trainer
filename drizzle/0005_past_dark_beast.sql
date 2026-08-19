-- RLS policy for chat_coverage table: asesores can only read their own recordings' chat coverage
do $migration$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise notice 'Skipping RLS policies outside Supabase';
    return;
  end if;

  execute $sql$
    create policy chat_coverage_asesor_all
      on public.chat_coverage for all to authenticated
      using (
        recording_id in (
          select id from public.live_recordings
          where advisor_id = (select auth.uid())
        )
      )
      with check (
        recording_id in (
          select id from public.live_recordings
          where advisor_id = (select auth.uid())
        )
      );
  $sql$;
end
$migration$;