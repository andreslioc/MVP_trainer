import { getSession } from "../../../../lib/auth.ts";
import { listInsights } from "../../../../server/insights.ts";
import { listAnalyzableRecordings } from "../../../../server/recordings/analyze.ts";
import { env } from "../../../../lib/env.ts";
import { InsightsPanel } from "./insights-panel.tsx";
import { RecordingIntake } from "./recording-intake.tsx";

export default async function IntelligencePage() {
  const session = await getSession();
  if (!session.ok) return null;
  const authorize = async () => session;

  const recordings = await listAnalyzableRecordings({ authorize });
  // El callback solo puede llegar si el proveedor alcanza esta app desde fuera.
  // En local no puede, y la pantalla debe decirlo en vez de dejar una grabacion
  // esperando para siempre en `transcribing`.
  const callbackReady = Boolean(
    env.DEEPGRAM_API_KEY &&
      env.DEEPGRAM_CALLBACK_SECRET &&
      env.PUBLIC_BASE_URL &&
      !env.PUBLIC_BASE_URL.includes("127.0.0.1") &&
      !env.PUBLIC_BASE_URL.includes("localhost"),
  );
  const rows = recordings.ok ? recordings.data : [];
  const selected = rows.find((recording) => recording.status === "analyzed") ?? null;
  const insights = selected ? await listInsights(selected.id, { authorize }) : null;

  return (
    <section aria-labelledby="page-title" className="max-w-6xl">
      <p className="text-sm font-semibold text-primary">Después del live</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-fg" id="page-title">
        Live Intelligence
      </h1>
      <p className="mt-2 max-w-2xl text-fg-muted">
        Analiza las conversaciones del live y convierte patrones reales en nuevos aprendizajes.
      </p>

      {!recordings.ok ? (
        <p
          className="mt-8 rounded-card border border-destructive bg-confidence-low-bg p-4 font-semibold text-confidence-low-fg"
          role="alert"
        >
          No se pudieron cargar las grabaciones.
        </p>
      ) : (
        <>
          <div className="mt-8">
            <RecordingIntake callbackReady={callbackReady} />
          </div>
          <InsightsPanel
            insights={insights?.ok ? insights.data : []}
            recordings={rows}
            selectedId={selected?.id ?? null}
          />
        </>
      )}
    </section>
  );
}
