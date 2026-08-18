import { z } from "zod";

import { db } from "../db/client.ts";
import { advisors } from "../db/schema.ts";
import { createAdminSupabaseClient, requireRole } from "../lib/auth.ts";

const advisorFromAuthSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  displayName: z.string().trim().min(1),
  role: z.enum(["asesor", "admin"]).default("asesor"),
});

type AdvisorWriter = Pick<typeof db, "insert">;
type AdvisorInput = z.input<typeof advisorFromAuthSchema>;
type AdminAuth = ReturnType<typeof createAdminSupabaseClient>["auth"]["admin"];

const advisorInvitationSchema = advisorFromAuthSchema.omit({ id: true });

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

export async function inviteAdvisor(input: z.input<typeof advisorInvitationSchema>) {
  const authorization = await requireRole("admin");
  if (!authorization.ok) {
    return authorization;
  }

  return createInvitedAdvisor(input);
}

export async function createInvitedAdvisor(
  input: z.input<typeof advisorInvitationSchema>,
  adminAuth: AdminAuth = createAdminSupabaseClient().auth.admin,
  database: AdvisorWriter = db,
) {
  const parsed = advisorInvitationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: { code: "INVALID_ADVISOR" as const, message: z.prettifyError(parsed.error) },
    };
  }

  const { data, error } = await adminAuth.inviteUserByEmail(parsed.data.email, {
    data: { display_name: parsed.data.displayName },
  });

  if (error || !data.user) {
    return {
      ok: false as const,
      error: { code: "INVITATION_FAILED" as const, message: "No se pudo enviar la invitación." },
    };
  }

  try {
    return await createAdvisorFromAuthUser({ id: data.user.id, ...parsed.data }, database);
  } catch (databaseError) {
    await adminAuth.deleteUser(data.user.id);
    return {
      ok: false as const,
      error: {
        code: "ADVISOR_CREATE_FAILED" as const,
        message:
          databaseError instanceof Error ? databaseError.message : "No se pudo crear la cuenta.",
      },
    };
  }
}
