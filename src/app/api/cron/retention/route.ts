import { cronSecretMatches, runRetention } from "../../../../server/retention.ts";

/**
 * Vercel Cron invoca con **GET** y manda `Authorization: Bearer <CRON_SECRET>`.
 * Un handler que solo exporte POST devuelve 405 en cada disparo, el panel se ve
 * sano y el trabajo nunca ocurre. Por eso el verbo aqui es GET.
 */
export async function GET(request: Request) {
  if (!cronSecretMatches(request.headers.get("authorization"))) {
    return Response.json(
      { ok: false, error: { code: "UNAUTHENTICATED", message: "Bearer inválido." } },
      { status: 401 },
    );
  }

  try {
    const result = await runRetention();
    return Response.json({ ok: true, ...result });
  } catch {
    return Response.json(
      { ok: false, error: { code: "INTERNAL", message: "La retención falló." } },
      { status: 500 },
    );
  }
}
