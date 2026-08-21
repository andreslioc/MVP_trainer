import { getSession } from "../../../../../lib/auth.ts";
import { SimulatorClient } from "./simulator-client.tsx";

export default async function SimulacroPage() {
  const authorization = await getSession();
  if (!authorization.ok) return null;

  return (
    <section aria-labelledby="page-title">
      <p className="text-sm font-semibold text-primary">Antes del live</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-fg" id="page-title">
        Simulacro de live
      </h1>
      <p className="mt-2 max-w-2xl text-fg-muted">
        Practica con el chat corriendo, como en un live real: contesta en voz alta las preguntas que
        aparezcan entre los comentarios.
      </p>
      <SimulatorClient />
    </section>
  );
}
