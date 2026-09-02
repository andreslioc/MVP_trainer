import { AdvisorRow, type AdvisorRowData } from "./advisor-row.tsx";
import { InviteAdvisorForm } from "./invite-advisor-form.tsx";

export function AdvisorDirectory({
  result,
}: {
  result: { ok: true; data: AdvisorRowData[] } | { ok: false; error: { message: string } };
}) {
  return (
    <section aria-labelledby="accounts-title" className="mt-12">
      <h2 className="text-2xl font-semibold tracking-tight text-fg" id="accounts-title">
        Cuentas
      </h2>
      <p className="mt-2 max-w-2xl text-fg-muted">
        Con asesoría se entra a los módulos de trabajo. Con administración se ve además esta página:
        reglas comerciales y cuentas.
      </p>

      <InviteAdvisorForm />

      {!result.ok ? (
        <p
          className="mt-4 rounded-card border border-destructive bg-confidence-low-bg p-4 text-confidence-low-fg"
          role="alert"
        >
          {result.error.message}
        </p>
      ) : result.data.length === 0 ? (
        <p className="mt-4 rounded-card border border-border bg-surface p-4 text-fg-muted">
          Todavía no hay cuentas. Invita la primera con el formulario de arriba.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-card border border-border bg-surface">
          <table className="w-full min-w-[40rem] text-left">
            <caption className="sr-only">Cuentas del equipo con su rol y su estado</caption>
            <thead>
              <tr className="text-sm text-fg-muted">
                <th className="px-3 py-3 font-medium" scope="col">
                  Persona
                </th>
                <th className="px-3 py-3 font-medium" scope="col">
                  Rol
                </th>
                <th className="px-3 py-3 font-medium" scope="col">
                  Estado
                </th>
                <th className="px-3 py-3 text-right font-medium" scope="col">
                  Acceso
                </th>
              </tr>
            </thead>
            <tbody>
              {result.data.map((advisor) => (
                <AdvisorRow advisor={advisor} key={advisor.id} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
