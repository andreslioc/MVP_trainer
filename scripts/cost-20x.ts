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
      })
      .from(llmCalls)
      .groupBy(llmCalls.purpose);

    const prices = {
      input: 0.075 / 1_000_000,
      output: 0.3 / 1_000_000,
    };

    const scale = 20;
    const days = 30;
    const multiplier = scale * days;

    console.log(`\n💰 SIMULACIÓN: 20x uso diario × 30 días (${multiplier}x el patrón actual)\n`);
    console.log("Propósito".padEnd(25) + " | Llamadas/mes |   Entrada   |   Salida   |     TOTAL");
    console.log("-".repeat(95));

    let totalInputCost = 0;
    let totalOutputCost = 0;
    let totalCalls = 0;

    const sorted = results.sort((a, b) => {
      const costA = (a.inputTokens || 0) * prices.input + (a.outputTokens || 0) * prices.output;
      const costB = (b.inputTokens || 0) * prices.input + (b.outputTokens || 0) * prices.output;
      return costB - costA;
    });

    for (const r of sorted) {
      const scaledCalls = (r.calls || 0) * multiplier;
      const scaledInputTokens = (r.inputTokens || 0) * multiplier;
      const scaledOutputTokens = (r.outputTokens || 0) * multiplier;

      const inputCost = scaledInputTokens * prices.input;
      const outputCost = scaledOutputTokens * prices.output;
      const totalCost = inputCost + outputCost;

      totalInputCost += inputCost;
      totalOutputCost += outputCost;
      totalCalls += scaledCalls;

      const purpose = r.purpose.padEnd(25);
      const calls = String(scaledCalls.toLocaleString()).padStart(13);
      const input = `$${inputCost.toFixed(2)}`.padStart(11);
      const output = `$${outputCost.toFixed(2)}`.padStart(10);
      const total = `$${totalCost.toFixed(2)}`.padStart(12);

      console.log(`${purpose} | ${calls} | ${input} | ${output} | ${total}`);
    }

    const grandTotal = totalInputCost + totalOutputCost;
    console.log("-".repeat(95));
    const totalLabel = "TOTAL".padEnd(25);
    const totalCallsStr = String(totalCalls.toLocaleString()).padStart(13);
    const totalInputDisplay = `$${totalInputCost.toFixed(2)}`.padStart(11);
    const totalOutputDisplay = `$${totalOutputCost.toFixed(2)}`.padStart(10);
    const totalDisplay = `$${grandTotal.toFixed(2)}`.padStart(12);
    console.log(
      `${totalLabel} | ${totalCallsStr} | ${totalInputDisplay} | ${totalOutputDisplay} | ${totalDisplay}\n`,
    );

    const costPerDay = grandTotal / days;
    const costPerWeek = costPerDay * 7;

    console.log("📊 Desglose temporal:\n");
    console.log(
      `  Por día:   ${(totalCalls / days).toFixed(0)} llamadas → $${costPerDay.toFixed(2)}`,
    );
    console.log(`  Por semana: $${costPerWeek.toFixed(2)}`);
    console.log(`  Por mes:   $${grandTotal.toFixed(2)}`);
    console.log(`  Por año:   $${(grandTotal * 12).toFixed(2)}\n`);

    console.log("📈 Tabla comparativa:\n");
    const scenarios = [
      { scale: 1, days: 30, label: "Patrón actual" },
      { scale: 10, days: 30, label: "10x pesado" },
      { scale: 20, days: 30, label: "20x pesado" },
      { scale: 50, days: 30, label: "50x (ref)" },
      { scale: 100, days: 30, label: "100x (ref)" },
    ];

    console.log("Escala        | Llamadas/mes | Costo/mes | Costo/año");
    console.log("-".repeat(60));

    for (const scenario of scenarios) {
      const mult = scenario.scale * scenario.days;
      const calls = 23 * mult;
      const monthCost = (0.006416 * mult).toFixed(2);
      const yearCost = (0.006416 * mult * 12).toFixed(2);
      console.log(
        `${scenario.label.padEnd(14)} | ${String(calls.toLocaleString()).padStart(12)} | $${monthCost.padStart(7)} | $${yearCost.padStart(7)}`,
      );
    }
    console.log();
  } finally {
    await connection.close();
  }
})();
