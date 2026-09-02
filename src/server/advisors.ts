import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "../db/client.ts";
import { advisors } from "../db/schema.ts";
import { type AdvisorRole, createAdminSupabaseClient, requireRole } from "../lib/auth.ts";
import {
  type AdvisorRoleUpdate,
  type AdvisorStatusUpdate,
  advisorRoleUpdateSchema,
  advisorRoles,
  advisorStatusUpdateSchema,
  selfLockoutError,
} from "../lib/validation/advisor.ts";

const advisorFromAuthSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  displayName: z.string().trim().min(1),
  role: z.enum(advisorRoles).default("asesor"),
});

type AdvisorWriter = Pick<typeof db, "insert">;
export type AdvisorDatabase = Pick<typeof db, "select" | "update" | "delete">;
type AuthorizationResult =
  | { ok: true; data: { id: string; role: AdvisorRole } }
  | { ok: false; error: { code: string; message: string } };
type Authorize = (role: AdvisorRole) => Promise<AuthorizationResult>;

export type AdvisorDependencies = {
  database?: AdvisorDatabase;
  authorize?: Authorize;
  adminAuth?: { deleteUser: (id: string) => Promise<{ error: { message: string } | null }> };
};

export function advisorDependencies(options: AdvisorDependencies) {
  return {
    database: options.database ?? db,
    authorize: options.authorize ?? requireRole,
  };
}

function dependencies(options: AdvisorDependencies) {
  return {
    database: options.database ?? db,
    authorize: options.authorize ?? requireRole,
  };
}
type AdvisorInput = z.input<typeof advisorFromAuthSchema>;
export type AdminAuth = ReturnType<typeof createAdminSupabaseClient>["auth"]["admin"];

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

/** El directorio de cuentas. Solo una admin lo ve: trae correos de todo el equipo. */
export async function listAdvisors(options: AdvisorDependencies = {}) {
  const { database, authorize } = dependencies(options);
  const authorization = await authorize("admin");
  if (!authorization.ok) return authorization;

  try {
    const rows = await database
      .select({
        id: advisors.id,
        email: advisors.email,
        displayName: advisors.displayName,
        role: advisors.role,
        status: advisors.status,
        createdAt: advisors.createdAt,
      })
      .from(advisors)
      .orderBy(asc(advisors.createdAt));

    return {
      ok: true as const,
      data: rows.map((row) => ({ ...row, isSelf: row.id === authorization.data.id })),
    };
  } catch {
    return {
      ok: false as const,
      error: {
        code: "ADVISOR_LIST_FAILED" as const,
        message: "No se pudieron cargar las cuentas.",
      },
    };
  }
}

export async function updateAdvisorRole(
  input: AdvisorRoleUpdate,
  options: AdvisorDependencies = {},
) {
  const { database, authorize } = dependencies(options);
  const authorization = await authorize("admin");
  if (!authorization.ok) return authorization;

  const parsed = advisorRoleUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: { code: "INVALID_ADVISOR" as const, message: z.prettifyError(parsed.error) },
    };
  }

  const lockout = selfLockoutError(authorization.data.id, parsed.data.advisorId, "rol");
  if (lockout) return { ok: false as const, error: lockout };

  return writeAdvisor(database, parsed.data.advisorId, { role: parsed.data.role });
}

export async function updateAdvisorStatus(
  input: AdvisorStatusUpdate,
  options: AdvisorDependencies = {},
) {
  const { database, authorize } = dependencies(options);
  const authorization = await authorize("admin");
  if (!authorization.ok) return authorization;

  const parsed = advisorStatusUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: { code: "INVALID_ADVISOR" as const, message: z.prettifyError(parsed.error) },
    };
  }

  const lockout = selfLockoutError(authorization.data.id, parsed.data.advisorId, "estado");
  if (lockout) return { ok: false as const, error: lockout };

  return writeAdvisor(database, parsed.data.advisorId, { status: parsed.data.status });
}

async function writeAdvisor(
  database: AdvisorDatabase,
  advisorId: string,
  values: { role?: AdvisorRole } | { status?: "activa" | "inactiva" },
) {
  try {
    const [updated] = await database
      .update(advisors)
      .set(values)
      .where(eq(advisors.id, advisorId))
      .returning({
        id: advisors.id,
        email: advisors.email,
        displayName: advisors.displayName,
        role: advisors.role,
        status: advisors.status,
      });

    if (!updated) {
      return {
        ok: false as const,
        error: { code: "ADVISOR_NOT_FOUND" as const, message: "La cuenta ya no existe." },
      };
    }

    return { ok: true as const, data: updated };
  } catch {
    return {
      ok: false as const,
      error: { code: "ADVISOR_UPDATE_FAILED" as const, message: "No se pudo guardar la cuenta." },
    };
  }
}
