"use server";

import { revalidatePath } from "next/cache";

import type {
  AdvisorDelete,
  AdvisorInvite,
  AdvisorRoleUpdate,
  AdvisorStatusUpdate,
} from "../../../../lib/validation/advisor.ts";
import { deleteAdvisor } from "../../../../server/advisor-delete.ts";
import {
  inviteAdvisor,
  updateAdvisorRole,
  updateAdvisorStatus,
} from "../../../../server/advisors.ts";

export async function inviteAdvisorAction(input: AdvisorInvite) {
  const result = await inviteAdvisor(input);
  if (result.ok) revalidatePath("/app/cuentas");
  return result;
}

export async function updateAdvisorRoleAction(input: AdvisorRoleUpdate) {
  const result = await updateAdvisorRole(input);
  if (result.ok) revalidatePath("/app/cuentas");
  return result;
}

export async function updateAdvisorStatusAction(input: AdvisorStatusUpdate) {
  const result = await updateAdvisorStatus(input);
  if (result.ok) revalidatePath("/app/cuentas");
  return result;
}

export async function deleteAdvisorAction(input: AdvisorDelete) {
  const result = await deleteAdvisor(input);
  if (result.ok) revalidatePath("/app/cuentas");
  return result;
}
