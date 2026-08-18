import { env } from "../../lib/env.ts";

export function GET(): Response {
  return Response.json({
    ok: true,
    commit: env.VERCEL_GIT_COMMIT_SHA ?? "unknown",
  });
}
