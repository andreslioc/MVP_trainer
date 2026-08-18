import { z } from "zod";

import { db } from "../db/client.ts";
import { advisors } from "../db/schema.ts";

const advisorFromAuthSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  displayName: z.string().trim().min(1),
  role: z.enum(["asesor", "admin"]).default("asesor"),
});

type AdvisorWriter = Pick<typeof db, "insert">;
type AdvisorInput = z.input<typeof advisorFromAuthSchema>;

export async function createAdvisorFromAuthUser(input: AdvisorInput, database: AdvisorWriter = db) {
  const parsed = advisorFromAuthSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: { code: "INVALID_ADVISOR", message: z.prettifyError(parsed.error) },
    };
  }

  const [advisor] = await database.insert(advisors).values(parsed.data).returning();
  return { ok: true as const, data: advisor };
}
