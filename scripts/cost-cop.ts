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
      output: 0.30 / 1_000_000,
    };

    const usdToCop = 4200; // Tipo de cambio aproximado

    console.log(`\n💰 COSTOS EN PESOS COLOMBIANOS (1 USD = $${usdToCop.toLocaleString()} COP)\n`);

    const scenarios = [
      { scale: 1, days: 30, label: "Patrón actual" },
      { scale: 10, days: 30, label: "10x pesado" },
      { scale: 20, days: 30, label: "20x pesado" },
      { scale: 50, days: 30, label: "50x pesado" },
      { scale: 100, days: 30, label: "100x pesado" },
    ];

    console.log("Escala              | Llamadas/mes |  Costo/mes USD  |    Costo/mes COP    |  Costo/año COP");
    console.log("-".repeat(100));

    for (const scenario of scenarios) {
      const mult = scenario.scale * scenario.days;
      const calls = 23 * mult;
      const monthCostUsd = 0.006416 * mult;
      const monthCostCop = monthCostUsd * usdToCop;
      const yearCostCop = monthCostCop * 12;

      const callsStr = String(calls.toLocaleString()).padStart(12);
      const usdStr = `$${monthCostUsd.toFixed(2)} USD`.padStart(15);
      const copStr = `$${monthCostCop.toLocaleString("es-CO", { maximumFractionDigits: 0 })}`.padStart(19);
      const yearStr = `$${yearCostCop.toLocaleString("es-CO", { maximumFractionDigits: 0 })}`.padStart(18);

      console.log(`${scenario.label.padEnd(19)} | ${callsStr} | ${usdStr} | ${copStr} | ${yearStr}`);
    }

    console.log("\n");

    // Detalles para 20x
    const scale = 20;
    const multiplier = scale * 30;
    
    let totalInputCost = 0;
    let totalOutputCost = 0;
    let totalCalls = 0;

    console.log("📊 DETALLES 20x PESADO (460 llamadas/día):\n");
    console.log("Propósito".padEnd(25) + " | Llamadas/mes |  Costo USD  |      Costo COP");
    console.log("-".repeat(90));

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
      const totalCostCop = totalCost * usdToCop;

      totalInputCost += inputCost;
      totalOutputCost += outputCost;
      totalCalls += scaledCalls;

      const purpose = r.purpose.padEnd(25);
      const calls = String(scaledCalls.toLocaleString()).padStart(12);
      const usd = `$${totalCost.toFixed(2)}`.padStart(10);
      const cop = `$${totalCostCop.toLocaleString("es-CO", { maximumFractionDigits: 0 })}`.padStart(14);

      console.log(`${purpose} | ${calls} | ${usd} | ${cop}`);
    }

    const grandTotal = totalInputCost + totalOutputCost;
    const grandTotalCop = grandTotal * usdToCop;
    const costPerDay = grandTotal / 30;
    const costPerDayCop = costPerDay * usdToCop;

    console.log("-".repeat(90));
    const totalLabel = "TOTAL".padEnd(25);
    const totalCallsStr = String(totalCalls.toLocaleString()).padStart(12);
    const totalUsdDisplay = `$${grandTotal.toFixed(2)}`.padStart(10);
    const totalCopDisplay = `$${grandTotalCop.toLocaleString("es-CO", { maximumFractionDigits: 0 })}`.padStart(14);
    console.log(`${totalLabel} | ${totalCallsStr} | ${totalUsdDisplay} | ${totalCopDisplay}\n`);

    console.log("📈 Desglose 20x:\n");
    console.log(`  460 llamadas/día × 30 días = 13,800 llamadas/mes`);
    console.log(`  Costo diario:  $${costPerDay.toFixed(2)} USD  =  $${costPerDayCop.toLocaleString("es-CO", { maximumFractionDigits: 0 })} COP`);
    console.log(`  Costo mensual: $${grandTotal.toFixed(2)} USD  =  $${grandTotalCop.toLocaleString("es-CO", { maximumFractionDigits: 0 })} COP`);
    console.log(`  Costo anual:   $${(grandTotal * 12).toFixed(2)} USD  =  $${(grandTotalCop * 12).toLocaleString("es-CO", { maximumFractionDigits: 0 })} COP\n`);

  } finally {
    await connection.close();
  }
})();
