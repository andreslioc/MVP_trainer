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

    const usdToCop = 4200;
    const targetCop = 40_000;
    const targetUsd = targetCop / usdToCop;

    // Modelos y sus precios (entrada / salida por 1M tokens)
    const models = {
      "Gemini 1.5 Flash (actual)": {
        input: 0.075,
        output: 0.3,
        color: "🟢",
      },
      "Gemini 1.5 Pro": {
        input: 1.25,
        output: 5.0,
        color: "🟡",
      },
      "Claude 3.5 Sonnet": {
        input: 3.0,
        output: 15.0,
        color: "🔴",
      },
      "GPT-4o": {
        input: 2.5,
        output: 10.0,
        color: "🟠",
      },
    };

    console.log(`\n💰 ¿Cuántas llamadas para $40.000 COP/mes (~$${targetUsd.toFixed(2)} USD)?\n`);

    // Calcular costo promedio por llamada actual
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCalls = 0;

    for (const r of results) {
      totalInputTokens += r.inputTokens || 0;
      totalOutputTokens += r.outputTokens || 0;
      totalCalls += r.calls || 0;
    }

    const avgInputPerCall = totalInputTokens / totalCalls;
    const avgOutputPerCall = totalOutputTokens / totalCalls;

    console.log(`Tokens promedio por llamada (basado en patrón actual):`);
    console.log(`  ${avgInputPerCall.toFixed(0)} tokens entrada`);
    console.log(`  ${avgOutputPerCall.toFixed(0)} tokens salida\n`);

    console.log("Modelo".padEnd(30) + " | Costo/llamada | Llamadas/mes | Llamadas/día");
    console.log("-".repeat(90));

    const callsPerMonth = [];

    for (const [modelName, pricing] of Object.entries(models)) {
      const inputPrice = pricing.input / 1_000_000;
      const outputPrice = pricing.output / 1_000_000;

      const costPerCall = avgInputPerCall * inputPrice + avgOutputPerCall * outputPrice;
      const callsNeeded = targetUsd / costPerCall;
      const callsPerDay = callsNeeded / 30;

      callsPerMonth.push({
        model: modelName,
        costPerCall,
        callsPerMonth: callsNeeded,
        callsPerDay,
      });

      const costStr = `$${costPerCall.toFixed(6)} USD`.padStart(13);
      const monthStr = String(Math.round(callsNeeded).toLocaleString()).padStart(12);
      const dayStr = String(Math.round(callsPerDay).toLocaleString()).padStart(12);

      console.log(`${modelName.padEnd(30)} | ${costStr} | ${monthStr} | ${dayStr}`);
    }

    console.log("\n");
    console.log("📊 CON GEMINI 1.5 FLASH (actual):\n");

    const flashCostPerCall =
      avgInputPerCall * (0.075 / 1_000_000) + avgOutputPerCall * (0.3 / 1_000_000);
    const flashCalls = targetUsd / flashCostPerCall;
    const flashCallsPerDay = flashCalls / 30;

    console.log(`  Llamadas/mes: ${Math.round(flashCalls).toLocaleString()}`);
    console.log(`  Llamadas/día: ${Math.round(flashCallsPerDay).toLocaleString()}`);
    console.log(`  Multiplicador: ${(flashCallsPerDay / 230).toFixed(1)}x del patrón 20x pesado\n`);

    // Tabla de escalas para Gemini Flash
    console.log("Comparación de escalas (Gemini Flash):\n");
    console.log("Escala         | Llamadas/día | Llamadas/mes | Costo/mes COP | Vs. $40k");
    console.log("-".repeat(85));

    const scales = [1, 5, 10, 20, 50, Math.round(flashCallsPerDay / 23)];
    const unique = [...new Set(scales)];

    for (const scale of unique.sort((a, b) => a - b)) {
      const callsDay = Math.round(23 * scale);
      const callsMonth = callsDay * 30;
      const costMonth = callsMonth * flashCostPerCall * usdToCop;

      const ratio = ((callsDay / Math.round(flashCallsPerDay)) * 100).toFixed(0);
      console.log(
        `${scale}x (${callsDay.toLocaleString()} calls)`.padEnd(14) +
          ` | ${String(callsDay).padStart(12)} | ${String(callsMonth).padStart(12)} | $${String(Math.round(costMonth)).padStart(12)} | ${ratio}%`,
      );
    }

    console.log();
  } finally {
    await connection.close();
  }
})();
