import { sql } from "drizzle-orm";

import { db } from "../../db/client.ts";
import { env } from "../../lib/env.ts";

export const dynamic = "force-dynamic";

/**
 * Liveness, no readiness. `ok` sigue en `true` aunque la base este caida: un
 * liveness que se cae con la base hace que el orquestador reinicie el
 * contenedor equivocado. El estado de la base se reporta aparte, en `db`.
 */
export async function GET(): Promise<Response> {
  let database: "up" | "down" = "down";
  try {
    await db.execute(sql`select 1`);
    database = "up";
  } catch {
    database = "down";
  }

  return Response.json({
    ok: true,
    db: database,
    commit: env.VERCEL_GIT_COMMIT_SHA ?? "unknown",
  });
}
