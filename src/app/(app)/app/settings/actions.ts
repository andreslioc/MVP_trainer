"use server";

import { revalidatePath } from "next/cache";

import type { CommercialRuleUpdate } from "../../../../lib/validation/commercial-rule.ts";
import type {
  AdvisorInvite,
  AdvisorRoleUpdate,
  AdvisorStatusUpdate,
} from "../../../../lib/validation/advisor.ts";
import {
  inviteAdvisor,
  updateAdvisorRole,
  updateAdvisorStatus,
} from "../../../../server/advisors.ts";
import { updateCommercialRule } from "../../../../server/commercial-rules.ts";

export async function updateCommercialRuleAction(input: CommercialRuleUpdate) {
  const result = await updateCommercialRule(input);
  if (result.ok) revalidatePath("/app/settings");
  return result;
}

export async function inviteAdvisorAction(input: AdvisorInvite) {
  const result = await inviteAdvisor(input);
  if (result.ok) revalidatePath("/app/settings");
  return result;
}

export async function updateAdvisorRoleAction(input: AdvisorRoleUpdate) {
  const result = await updateAdvisorRole(input);
  if (result.ok) revalidatePath("/app/settings");
  return result;
}

export async function updateAdvisorStatusAction(input: AdvisorStatusUpdate) {
  const result = await updateAdvisorStatus(input);
  if (result.ok) revalidatePath("/app/settings");
  return result;
}
