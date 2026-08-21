import { getSession } from "../../../../lib/auth.ts";
import { getCopilotSetup } from "../../../../server/copilot/session.ts";
import { CopilotForm } from "./copilot-form.tsx";

export default async function CopilotPage() {
  const authorization = await getSession();
  if (!authorization.ok) return null;
  const result = await getCopilotSetup({ authorize: async () => authorization });

  return (
    <section aria-labelledby="page-title">
      <p className="text-sm font-semibold text-primary">Durante el live</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-fg" id="page-title">
        Live Copilot
      </h1>
      <p className="mt-2 max-w-2xl text-fg-muted">
        Convierte preguntas de clientes en respuestas claras y listas para decir en cámara.
      </p>
      {result.ok ? (
        <CopilotForm
          activeRules={result.data.activeRules}
          initialSessionId={result.data.activeSession?.id ?? null}
          productPromos={result.data.activeSession?.productPromos ?? []}
          products={result.data.products}
        />
      ) : (
        <p
          className="mt-8 rounded-card border border-destructive bg-confidence-low-bg p-4 text-confidence-low-fg"
          role="alert"
        >
          {result.error.message}
        </p>
      )}
    </section>
  );
}
