"use server";

import { revalidatePath } from "next/cache";

import type { CommercialRuleUpdate } from "../../../../lib/validation/commercial-rule.ts";
import { updateCommercialRule } from "../../../../server/commercial-rules.ts";

export async function updateCommercialRuleAction(input: CommercialRuleUpdate) {
  const result = await updateCommercialRule(input);
  if (result.ok) revalidatePath("/app/settings");
  return result;
}
