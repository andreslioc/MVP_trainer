import { Card } from "../../../../components/ui/card.tsx";
import { PageSection } from "../../../../components/ui/page-section.tsx";
import { getSession } from "../../../../lib/auth.ts";
import { getCopilotSetup } from "../../../../server/copilot/session.ts";
import { CopilotForm } from "./copilot-form.tsx";

export default async function CopilotPage() {
  const authorization = await getSession();
  if (!authorization.ok) return null;
  const result = await getCopilotSetup({ authorize: async () => authorization });

  return (
    <PageSection
      eyebrow="Durante el live"
      lead="Convierte preguntas de clientes en respuestas claras y listas para decir en cámara."
      title="Live Copilot"
      width="completo"
    >
      {result.ok ? (
        <CopilotForm
          activeRules={result.data.activeRules}
          initialSessionId={result.data.activeSession?.id ?? null}
          productPromos={result.data.activeSession?.productPromos ?? []}
          products={result.data.products}
        />
      ) : (
        <Card className="mt-8" density="compacta" tone="alerta">
          <p role="alert">{result.error.message}</p>
        </Card>
      )}
    </PageSection>
  );
}
