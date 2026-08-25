import { closeSync, existsSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";

import { loadEnv } from "../src/lib/load-env.ts";

loadEnv();

type Success = { name: string; sources: number; completedAt: string };
type Failure = { name: string; code: string; message: string; failedAt: string };
type BatchState = {
  startedAt: string;
  updatedAt: string;
  total: number;
  baselinePrices: Record<string, number | null>;
  successes: Record<string, Success>;
  failures: Record<string, Failure>;
};

const localHosts = new Set(["127.0.0.1", "localhost", "::1"]);

function assertLocalDatabase(databaseUrl: string) {
  const host = new URL(databaseUrl).hostname;
  if (!localHosts.has(host)) {
    throw new Error(`Escritura rechazada: DIRECT_DATABASE_URL apunta a ${host}, no a local.`);
  }
}

function option(name: string) {
  return process.argv.find((argument) => argument.startsWith(`${name}=`))?.slice(name.length + 1);
}

function saveState(path: string, state: BatchState) {
  state.updatedAt = new Date().toISOString();
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

function errorDetails(error: unknown) {
  if (typeof error === "object" && error !== null) {
    const candidate = error as { code?: unknown; message?: unknown; retryable?: unknown };
    return {
      code: typeof candidate.code === "string" ? candidate.code : "UNKNOWN",
      message: typeof candidate.message === "string" ? candidate.message : "Error desconocido.",
      retryable: candidate.retryable === true,
    };
  }
  return { code: "UNKNOWN", message: "Error desconocido.", retryable: false };
}

async function main() {
  const statePath = option("--state") ?? "backups/products-research-state.json";
  const lockPath = `${statePath}.lock`;
  const lock = openSync(lockPath, "wx", 0o600);
  writeFileSync(lock, `${process.pid}\n`);

  const [{ env }, { openDirectDatabase, closeDatabase }, { advisors, products }, drizzle] =
    await Promise.all([
      import("../src/lib/env.ts"),
      import("../src/db/client.ts"),
      import("../src/db/schema.ts"),
      import("drizzle-orm"),
    ]);
  assertLocalDatabase(env.DIRECT_DATABASE_URL);
  const connection = openDirectDatabase("dev");

  try {
    const catalog = await connection.db
      .select({ id: products.id, name: products.name, priceCop: products.priceCop })
      .from(products)
      .orderBy(drizzle.asc(products.name), drizzle.asc(products.id));
    const [admin] = await connection.db
      .select({ id: advisors.id })
      .from(advisors)
      .where(drizzle.and(drizzle.eq(advisors.role, "admin"), drizzle.eq(advisors.status, "activa")))
      .limit(1);
    if (!admin)
      throw new Error("No existe una cuenta admin activa para auditar las llamadas de IA.");

    const state: BatchState = existsSync(statePath)
      ? (JSON.parse(readFileSync(statePath, "utf8")) as BatchState)
      : {
          startedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          total: catalog.length,
          baselinePrices: Object.fromEntries(
            catalog.map((product) => [product.id, product.priceCop]),
          ),
          successes: {},
          failures: {},
        };
    if (state.total !== catalog.length) {
      throw new Error(
        `El catalogo cambio desde el inicio del lote: ${state.total} productos antes, ${catalog.length} ahora.`,
      );
    }
    saveState(statePath, state);

    const { researchProduct } = await import("../src/server/product-research.ts");
    let stoppedByQuota = false;
    for (const [index, product] of catalog.entries()) {
      if (state.successes[product.id]) continue;
      console.info(`[${index + 1}/${catalog.length}] ${product.name}`);

      let result = await researchProduct(product.id, {
        authorize: async () => ({ ok: true, data: { id: admin.id, role: "admin" } }),
        database: connection.db,
      });
      if (!result.ok && errorDetails(result.error).retryable) {
        await new Promise((resolve) => setTimeout(resolve, 5_000));
        result = await researchProduct(product.id, {
          authorize: async () => ({ ok: true, data: { id: admin.id, role: "admin" } }),
          database: connection.db,
        });
      }

      if (result.ok) {
        if (result.data.product.priceCop !== state.baselinePrices[product.id]) {
          throw new Error(`El precio cambio durante la investigacion de ${product.name}.`);
        }
        state.successes[product.id] = {
          name: product.name,
          sources: result.data.sources,
          completedAt: new Date().toISOString(),
        };
        delete state.failures[product.id];
        console.info(`  ok · ${result.data.sources} fuentes`);
      } else {
        const detail = errorDetails(result.error);
        state.failures[product.id] = {
          name: product.name,
          code: detail.code,
          message: detail.message,
          failedAt: new Date().toISOString(),
        };
        console.error(`  ${detail.code}: ${detail.message}`);
        if (detail.code === "AI_QUOTA_EXCEEDED") stoppedByQuota = true;
      }
      saveState(statePath, state);
      if (stoppedByQuota) break;
    }

    const finalRows = await connection.db
      .select({ id: products.id, priceCop: products.priceCop })
      .from(products);
    const changedPrices = finalRows.filter(
      (product) => product.priceCop !== state.baselinePrices[product.id],
    );
    if (changedPrices.length > 0) {
      throw new Error(`La verificacion encontro ${changedPrices.length} precios modificados.`);
    }
    console.info(
      JSON.stringify({
        total: catalog.length,
        completed: Object.keys(state.successes).length,
        failed: Object.keys(state.failures).length,
        stoppedByQuota,
        statePath,
      }),
    );
    if (stoppedByQuota || Object.keys(state.failures).length > 0) process.exitCode = 2;
  } finally {
    await connection.close();
    await closeDatabase();
    closeSync(lock);
    unlinkSync(lockPath);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Error desconocido.");
  process.exitCode = 1;
});
