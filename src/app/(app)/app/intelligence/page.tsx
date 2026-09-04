import { Card } from "../../../../components/ui/card.tsx";
import { PageSection } from "../../../../components/ui/page-section.tsx";
import { getSession } from "../../../../lib/auth.ts";
import { listInsights, listChatCoverage } from "../../../../server/insights.ts";
import { listAnalyzableRecordings } from "../../../../server/recordings/analyze.ts";
import { env } from "../../../../lib/env.ts";
import { InsightsPanel } from "./insights-panel.tsx";
import { RecordingIntake } from "./recording-intake.tsx";

export default async function IntelligencePage({
  searchParams,
}: {
  searchParams: Promise<{ grabacion?: string }>;
}) {
  const { grabacion } = await searchParams;
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
  // Cual se mira viene de la URL para que se pueda volver a una grabacion vieja,
  // sobreviva a una recarga y se pueda compartir. Antes se tomaba siempre la
  // primera analizada, asi que los hallazgos de todas las demas existian en la
  // base y no habia forma de llegar a ellos. Un id que no es de esta asesora
  // simplemente no esta en `rows` y cae al comportamiento por defecto.
  const analizadas = rows.filter((recording) => recording.status === "analyzed");
  const selected =
    analizadas.find((recording) => recording.id === grabacion) ?? analizadas[0] ?? null;
  const insights = selected ? await listInsights(selected.id, { authorize }) : null;
  const chatCoverageResult = selected ? await listChatCoverage(selected.id, { authorize }) : null;

  return (
    <PageSection
      eyebrow="Después del live"
      lead="Analiza las conversaciones del live y convierte patrones reales en nuevos aprendizajes."
      title="Live Intelligence"
      width="completo"
    >
      {!recordings.ok ? (
        <Card className="mt-8" density="compacta" tone="alerta">
          <p className="font-semibold" role="alert">
            No se pudieron cargar las grabaciones.
          </p>
        </Card>
      ) : (
        <>
          <div className="mt-8">
            <RecordingIntake
              callbackReady={callbackReady}
              maxUploadBytes={env.SUPABASE_MAX_UPLOAD_BYTES}
            />
          </div>
          <InsightsPanel
            chatCoverage={chatCoverageResult?.ok ? chatCoverageResult.data : []}
            insights={insights?.ok ? insights.data : []}
            recordings={rows}
            selectedId={selected?.id ?? null}
          />
        </>
      )}
    </PageSection>
  );
}
