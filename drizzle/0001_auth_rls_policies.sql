-- This migration is intentionally Supabase-only. The test database used by
-- Vitest is plain PostgreSQL, so leave it untouched when Supabase roles are
-- not present.
do $migration$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise notice 'Skipping Supabase RLS migration outside Supabase';
    return;
  end if;

  execute $sql$
    alter table public.advisors enable row level security;
    alter table public.products enable row level security;
    alter table public.commercial_rules enable row level security;
    alter table public.training_questions enable row level security;
    alter table public.training_sessions enable row level security;
    alter table public.training_answers enable row level security;
    alter table public.live_sessions enable row level security;
    alter table public.copilot_exchanges enable row level security;
    alter table public.live_recordings enable row level security;
    alter table public.insights enable row level security;
    alter table public.prompts enable row level security;
    alter table public.llm_calls enable row level security
  $sql$;

  execute $sql$
    revoke all on table
      public.advisors,
      public.products,
      public.commercial_rules,
      public.training_questions,
      public.training_sessions,
      public.training_answers,
      public.live_sessions,
      public.copilot_exchanges,
      public.live_recordings,
      public.insights,
      public.prompts,
      public.llm_calls
    from anon, authenticated;
    grant all on table
      public.advisors,
      public.products,
      public.commercial_rules,
      public.training_questions,
      public.training_sessions,
      public.training_answers,
      public.live_sessions,
      public.copilot_exchanges,
      public.live_recordings,
      public.insights,
      public.prompts,
      public.llm_calls
    to service_role
  $sql$;

  execute $sql$
    grant select on table public.advisors to authenticated;
    grant select, insert, update, delete on table public.products, public.commercial_rules to authenticated;
    grant select on table public.training_questions, public.prompts, public.llm_calls to authenticated;
    grant select, insert, update, delete on table
      public.training_sessions,
      public.training_answers,
      public.live_sessions,
      public.copilot_exchanges,
      public.live_recordings,
      public.insights
    to authenticated
  $sql$;

  execute $sql$
    create policy advisors_authenticated_select
      on public.advisors for select to authenticated
      using (id = (select auth.uid()));

    create policy products_authenticated_select
      on public.products for select to authenticated using (true);
    create policy products_admin_insert
      on public.products for insert to authenticated
      with check (exists (
        select 1 from public.advisors a
        where a.id = (select auth.uid()) and a.role = 'admin' and a.status = 'activa'
      ));
    create policy products_admin_update
      on public.products for update to authenticated
      using (exists (
        select 1 from public.advisors a
        where a.id = (select auth.uid()) and a.role = 'admin' and a.status = 'activa'
      ))
      with check (exists (
        select 1 from public.advisors a
        where a.id = (select auth.uid()) and a.role = 'admin' and a.status = 'activa'
      ));
    create policy products_admin_delete
      on public.products for delete to authenticated
      using (exists (
        select 1 from public.advisors a
        where a.id = (select auth.uid()) and a.role = 'admin' and a.status = 'activa'
      ));

    create policy commercial_rules_authenticated_select
      on public.commercial_rules for select to authenticated using (true);
    create policy commercial_rules_admin_insert
      on public.commercial_rules for insert to authenticated
      with check (exists (
        select 1 from public.advisors a
        where a.id = (select auth.uid()) and a.role = 'admin' and a.status = 'activa'
      ));
    create policy commercial_rules_admin_update
      on public.commercial_rules for update to authenticated
      using (exists (
        select 1 from public.advisors a
        where a.id = (select auth.uid()) and a.role = 'admin' and a.status = 'activa'
      ))
      with check (exists (
        select 1 from public.advisors a
        where a.id = (select auth.uid()) and a.role = 'admin' and a.status = 'activa'
      ));
    create policy commercial_rules_admin_delete
      on public.commercial_rules for delete to authenticated
      using (exists (
        select 1 from public.advisors a
        where a.id = (select auth.uid()) and a.role = 'admin' and a.status = 'activa'
      ));

    create policy training_questions_authenticated_select
      on public.training_questions for select to authenticated using (true);

    create policy training_sessions_advisor_select
      on public.training_sessions for select to authenticated
      using (
        advisor_id = (select auth.uid()) or exists (
          select 1 from public.advisors a
          where a.id = (select auth.uid()) and a.role = 'admin' and a.status = 'activa'
        )
      );
    create policy training_sessions_advisor_insert
      on public.training_sessions for insert to authenticated
      with check (advisor_id = (select auth.uid()));
    create policy training_sessions_advisor_update
      on public.training_sessions for update to authenticated
      using (advisor_id = (select auth.uid()))
      with check (advisor_id = (select auth.uid()));
    create policy training_sessions_advisor_delete
      on public.training_sessions for delete to authenticated
      using (advisor_id = (select auth.uid()));

    create policy training_answers_advisor_select
      on public.training_answers for select to authenticated
      using (exists (
        select 1 from public.training_sessions s
        where s.id = session_id
          and (
            s.advisor_id = (select auth.uid()) or exists (
              select 1 from public.advisors a
              where a.id = (select auth.uid()) and a.role = 'admin' and a.status = 'activa'
            )
          )
      ));
    create policy training_answers_advisor_insert
      on public.training_answers for insert to authenticated
      with check (exists (
        select 1 from public.training_sessions s
        where s.id = session_id and s.advisor_id = (select auth.uid())
      ));
    create policy training_answers_advisor_update
      on public.training_answers for update to authenticated
      using (exists (
        select 1 from public.training_sessions s
        where s.id = session_id and s.advisor_id = (select auth.uid())
      ))
      with check (exists (
        select 1 from public.training_sessions s
        where s.id = session_id and s.advisor_id = (select auth.uid())
      ));
    create policy training_answers_advisor_delete
      on public.training_answers for delete to authenticated
      using (exists (
        select 1 from public.training_sessions s
        where s.id = session_id and s.advisor_id = (select auth.uid())
      ));

    create policy live_sessions_advisor_select
      on public.live_sessions for select to authenticated
      using (
        advisor_id = (select auth.uid()) or exists (
          select 1 from public.advisors a
          where a.id = (select auth.uid()) and a.role = 'admin' and a.status = 'activa'
        )
      );
    create policy live_sessions_advisor_insert
      on public.live_sessions for insert to authenticated
      with check (advisor_id = (select auth.uid()));
    create policy live_sessions_advisor_update
      on public.live_sessions for update to authenticated
      using (advisor_id = (select auth.uid()))
      with check (advisor_id = (select auth.uid()));
    create policy live_sessions_advisor_delete
      on public.live_sessions for delete to authenticated
      using (advisor_id = (select auth.uid()));

    create policy copilot_exchanges_advisor_select
      on public.copilot_exchanges for select to authenticated
      using (exists (
        select 1 from public.live_sessions s
        where s.id = live_session_id
          and (
            s.advisor_id = (select auth.uid()) or exists (
              select 1 from public.advisors a
              where a.id = (select auth.uid()) and a.role = 'admin' and a.status = 'activa'
            )
          )
      ));
    create policy copilot_exchanges_advisor_insert
      on public.copilot_exchanges for insert to authenticated
      with check (exists (
        select 1 from public.live_sessions s
        where s.id = live_session_id and s.advisor_id = (select auth.uid())
      ));
    create policy copilot_exchanges_advisor_update
      on public.copilot_exchanges for update to authenticated
      using (exists (
        select 1 from public.live_sessions s
        where s.id = live_session_id and s.advisor_id = (select auth.uid())
      ))
      with check (exists (
        select 1 from public.live_sessions s
        where s.id = live_session_id and s.advisor_id = (select auth.uid())
      ));
    create policy copilot_exchanges_advisor_delete
      on public.copilot_exchanges for delete to authenticated
      using (exists (
        select 1 from public.live_sessions s
        where s.id = live_session_id and s.advisor_id = (select auth.uid())
      ));

    create policy live_recordings_advisor_select
      on public.live_recordings for select to authenticated
      using (
        advisor_id = (select auth.uid()) or exists (
          select 1 from public.advisors a
          where a.id = (select auth.uid()) and a.role = 'admin' and a.status = 'activa'
        )
      );
    create policy live_recordings_advisor_insert
      on public.live_recordings for insert to authenticated
      with check (advisor_id = (select auth.uid()));
    create policy live_recordings_advisor_update
      on public.live_recordings for update to authenticated
      using (advisor_id = (select auth.uid()))
      with check (advisor_id = (select auth.uid()));
    create policy live_recordings_advisor_delete
      on public.live_recordings for delete to authenticated
      using (advisor_id = (select auth.uid()));

    create policy insights_advisor_select
      on public.insights for select to authenticated
      using (exists (
        select 1 from public.live_recordings r
        where r.id = recording_id
          and (
            r.advisor_id = (select auth.uid()) or exists (
              select 1 from public.advisors a
              where a.id = (select auth.uid()) and a.role = 'admin' and a.status = 'activa'
            )
          )
      ));
    create policy insights_advisor_insert
      on public.insights for insert to authenticated
      with check (exists (
        select 1 from public.live_recordings r
        where r.id = recording_id and r.advisor_id = (select auth.uid())
      ));
    create policy insights_advisor_update
      on public.insights for update to authenticated
      using (exists (
        select 1 from public.live_recordings r
        where r.id = recording_id and r.advisor_id = (select auth.uid())
      ))
      with check (exists (
        select 1 from public.live_recordings r
        where r.id = recording_id and r.advisor_id = (select auth.uid())
      ));
    create policy insights_advisor_delete
      on public.insights for delete to authenticated
      using (exists (
        select 1 from public.live_recordings r
        where r.id = recording_id and r.advisor_id = (select auth.uid())
      ));

    create policy prompts_authenticated_select
      on public.prompts for select to authenticated using (active);
    create policy llm_calls_advisor_select
      on public.llm_calls for select to authenticated
      using (
        advisor_id = (select auth.uid()) or exists (
          select 1 from public.advisors a
          where a.id = (select auth.uid()) and a.role = 'admin' and a.status = 'activa'
        )
      )
  $sql$;
end
$migration$;
