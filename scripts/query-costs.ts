import { openDirectDatabase } from "../src/db/client.ts";
import { llmCalls } from "../src/db/schema.ts";
import { sum, count } from "drizzle-orm";

(async () => {
  const connection = openDirectDatabase();

  try {
    const results = await connection.db
      .select({
        purpose: llmCalls.purpose,
        calls: count().mapWith(Number),
        inputTokensTotal: sum(llmCalls.inputTokens).mapWith(Number),
        outputTokensTotal: sum(llmCalls.outputTokens).mapWith(Number),
        costTotal: sum(llmCalls.costUsd).mapWith(Number),
      })
      .from(llmCalls)
      .groupBy(llmCalls.purpose);

    console.log("\n📊 Costos por propósito:\n");
    console.log("Propósito".padEnd(25) + " | Calls | Input Tokens | Output Tokens | Costo USD");
    console.log("-".repeat(80));
    
    const sorted = results.sort((a, b) => (b.costTotal || 0) - (a.costTotal || 0));
    for (const r of sorted) {
      const purpose = r.purpose.padEnd(25);
      const calls = String(r.calls || 0).padStart(5);
      const input = String(r.inputTokensTotal || 0).padStart(12);
      const output = String(r.outputTokensTotal || 0).padStart(13);
      const cost = (r.costTotal || 0).toFixed(6);
      console.log(`${purpose} | ${calls} | ${input} | ${output} | ${cost}`);
    }

    const totals = {
      totalCalls: results.reduce((sum, r) => sum + (r.calls || 0), 0),
      totalInputTokens: results.reduce((sum, r) => sum + (r.inputTokensTotal || 0), 0),
      totalOutputTokens: results.reduce((sum, r) => sum + (r.outputTokensTotal || 0), 0),
      totalCost: results.reduce((sum, r) => sum + (r.costTotal || 0), 0),
    };

    console.log("-".repeat(80));
    const totalLabel = "TOTAL".padEnd(25);
    const totalCalls = String(totals.totalCalls).padStart(5);
    const totalInput = String(totals.totalInputTokens).padStart(12);
    const totalOutput = String(totals.totalOutputTokens).padStart(13);
    const totalCost = totals.totalCost.toFixed(6);
    console.log(`${totalLabel} | ${totalCalls} | ${totalInput} | ${totalOutput} | ${totalCost}\n`);
  } finally {
    await connection.close();
  }
})();
