import Link from "next/link";
import { redirect } from "next/navigation";

import { WeeklyGoalCard } from "../../../../components/goals/weekly-goal-card.tsx";
import { Card } from "../../../../components/ui/card.tsx";
import { PageSection } from "../../../../components/ui/page-section.tsx";
import { requireRole } from "../../../../lib/auth.ts";
import { isMonday, weekStartFor } from "../../../../lib/weekly-goals.ts";
import { listWeeklyGoals } from "../../../../server/weekly-goals.ts";
import { WeeklyGoalForm } from "./weekly-goal-form.tsx";

export default async function WeeklyGoalsPage({
  searchParams,
}: {
  searchParams: Promise<{ semana?: string }>;
}) {
  const authorization = await requireRole("admin");
  if (!authorization.ok) redirect("/app");

  const currentWeekStart = weekStartFor();
  const requested = (await searchParams).semana;
  const selectedWeek = requested && isMonday(requested) ? requested : currentWeekStart;
  const result = await listWeeklyGoals(selectedWeek, { authorize: async () => authorization });
  const rows = result.ok ? result.data : [];
  const advisors = rows.map(({ advisorId, displayName }) => ({ id: advisorId, displayName }));

  return (
    <PageSection
      eyebrow="Administración"
      lead="Define cuánto debe practicar el equipo y comprueba el avance con actividad real, de lunes a domingo."
      title="Metas semanales"
    >
      <WeeklyGoalForm
        advisors={advisors}
        currentWeekStart={currentWeekStart}
        selectedWeek={selectedWeek}
      />

      <div className="mt-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-medium text-fg">Avance del equipo</h2>
          <p className="mt-1 text-sm text-fg-muted">Semana del {selectedWeek}</p>
        </div>
        {selectedWeek !== currentWeekStart ? (
          <Link
            className="text-sm font-semibold text-primary hover:underline"
            href="/app/metas-semanales"
          >
            Ver semana actual
          </Link>
        ) : null}
      </div>

      {!result.ok ? (
        <p
          className="mt-4 rounded-card border border-destructive bg-confidence-low-bg p-4 text-confidence-low-fg"
          role="alert"
        >
          {result.error.message}
        </p>
      ) : rows.length === 0 ? (
        <Card className="mt-4">
          <p className="font-semibold text-fg">No hay asesoras activas.</p>
          <p className="mt-1 text-sm text-fg-muted">
            Crea o activa una cuenta antes de asignar metas.
          </p>
        </Card>
      ) : (
        <div className="mt-4 grid gap-4">
          {rows.map((row) =>
            row.hasGoal ? (
              <WeeklyGoalCard goal={row} key={row.advisorId} showName />
            ) : (
              <Card key={row.advisorId}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-semibold text-fg">{row.displayName}</h3>
                  <span className="rounded-full border border-border bg-surface-sunken px-2.5 py-1 text-xs font-semibold text-fg-muted">
                    Sin meta asignada
                  </span>
                </div>
              </Card>
            ),
          )}
        </div>
      )}
    </PageSection>
  );
}
