import { redirect } from "next/navigation";

import { requireRole } from "../../../../lib/auth.ts";
import { isCommercialRuleKey } from "../../../../lib/validation/commercial-rule.ts";
import { listCommercialRules } from "../../../../server/commercial-rules.ts";
import { RuleEditor } from "./rule-editor.tsx";

export default async function SettingsPage() {
  // Supervisora: las reglas comerciales son su herramienta de trabajo. Las
  // cuentas viven aparte, en /app/cuentas, y esas si son solo de admin.
  const authorization = await requireRole("supervisor");
  if (!authorization.ok) {
    redirect("/app");
  }

  const result = await listCommercialRules({ authorize: async () => authorization });

  return (
    <section aria-labelledby="page-title" className="max-w-5xl">
      <p className="text-sm font-semibold text-primary">Administración</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-fg" id="page-title">
        Reglas comerciales
      </h1>
      <p className="mt-2 max-w-2xl text-fg-muted">
        Estas reglas alimentan las respuestas comerciales. Un cambio guardado aplica desde la
        siguiente lectura.
      </p>

      {!result.ok ? (
        <p
          className="mt-8 rounded-card border border-destructive bg-confidence-low-bg p-4 text-confidence-low-fg"
          role="alert"
        >
          No se pudieron cargar las reglas.
        </p>
      ) : (
        <div className="mt-8 grid gap-4">
          {result.data.map((rule) =>
            isCommercialRuleKey(rule.key) ? (
              <RuleEditor
                key={rule.key}
                rule={{ key: rule.key, value: rule.value, active: rule.active }}
              />
            ) : null,
          )}
        </div>
      )}
    </section>
  );
}
