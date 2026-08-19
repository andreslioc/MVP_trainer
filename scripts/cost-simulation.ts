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
        inputTokens: sum(llmCalls.inputTokens).mapWith(Number),
        outputTokens: sum(llmCalls.outputTokens).mapWith(Number),
        cacheReadTokens: sum(llmCalls.cacheReadTokens).mapWith(Number),
        cacheWriteTokens: sum(llmCalls.cacheWriteTokens).mapWith(Number),
      })
      .from(llmCalls)
      .groupBy(llmCalls.purpose);

    // Precios de Gemini 1.5 Flash
    const prices = {
      input: 0.075 / 1_000_000,
      output: 0.30 / 1_000_000,
      cacheRead: 0.019 / 1_000_000,  // 10% del precio de entrada
      cacheWrite: 0.30 / 1_000_000,  // Mismo que output
    };

    console.log("\n💰 SIMULACIÓN DE COSTOS: Gemini 1.5 Flash (plan pago)\n");
    console.log("Propósito".padEnd(25) + " | Calls |   Entrada   |   Salida   | Cache Read | Cache Write |  TOTAL");
    console.log("-".repeat(105));

    let totalInputCost = 0;
    let totalOutputCost = 0;
    let totalCacheReadCost = 0;
    let totalCacheWriteCost = 0;

    const sorted = results.sort((a, b) => {
      const costA = (a.inputTokens || 0) * prices.input + (a.outputTokens || 0) * prices.output + (a.cacheReadTokens || 0) * prices.cacheRead;
      const costB = (b.inputTokens || 0) * prices.input + (b.outputTokens || 0) * prices.output + (b.cacheReadTokens || 0) * prices.cacheRead;
      return costB - costA;
    });

    for (const r of sorted) {
      const inputCost = (r.inputTokens || 0) * prices.input;
      const outputCost = (r.outputTokens || 0) * prices.output;
      const cacheReadCost = (r.cacheReadTokens || 0) * prices.cacheRead;
      const cacheWriteCost = (r.cacheWriteTokens || 0) * prices.cacheWrite;
      const totalCost = inputCost + outputCost + cacheReadCost + cacheWriteCost;

      totalInputCost += inputCost;
      totalOutputCost += outputCost;
      totalCacheReadCost += cacheReadCost;
      totalCacheWriteCost += cacheWriteCost;

      const purpose = r.purpose.padEnd(25);
      const calls = String(r.calls || 0).padStart(5);
      const input = `$${inputCost.toFixed(4)}`.padStart(11);
      const output = `$${outputCost.toFixed(4)}`.padStart(10);
      const cacheR = `$${cacheReadCost.toFixed(4)}`.padStart(10);
      const cacheW = `$${cacheWriteCost.toFixed(4)}`.padStart(11);
      const total = `$${totalCost.toFixed(6)}`.padStart(8);

      console.log(`${purpose} | ${calls} | ${input} | ${output} | ${cacheR} | ${cacheW} | ${total}`);
    }

    console.log("-".repeat(105));
    const totalLabel = "TOTAL".padEnd(25);
    const totalCalls = String(results.reduce((sum, r) => sum + (r.calls || 0), 0)).padStart(5);
    const totalInputDisplay = `$${totalInputCost.toFixed(4)}`.padStart(11);
    const totalOutputDisplay = `$${totalOutputCost.toFixed(4)}`.padStart(10);
    const totalCacheRDisplay = `$${totalCacheReadCost.toFixed(4)}`.padStart(10);
    const totalCacheWDisplay = `$${totalCacheWriteCost.toFixed(4)}`.padStart(11);
    const grandTotal = `$${(totalInputCost + totalOutputCost + totalCacheReadCost + totalCacheWriteCost).toFixed(6)}`.padStart(8);
    console.log(`${totalLabel} | ${totalCalls} | ${totalInputDisplay} | ${totalOutputDisplay} | ${totalCacheRDisplay} | ${totalCacheWDisplay} | ${grandTotal}\n`);

    // Proyección anual
    const callsPerDay = results.reduce((sum, r) => sum + (r.calls || 0), 0);
    const costPerDay = totalInputCost + totalOutputCost + totalCacheReadCost + totalCacheWriteCost;
    const costPerMonth = costPerDay * 30;
    const costPerYear = costPerDay * 365;

    console.log("📈 Proyecciones (estimadas con patrón actual):\n");
    console.log(`  Por día:   ${callsPerDay} llamadas × $${costPerDay.toFixed(6)} = $${costPerDay.toFixed(2)}`);
    console.log(`  Por mes:   $${costPerMonth.toFixed(2)}`);
    console.log(`  Por año:   $${costPerYear.toFixed(2)}\n`);

  } finally {
    await connection.close();
  }
})();
