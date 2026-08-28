import { loadEnv } from "./src/lib/load-env.ts";
loadEnv();
async function main() {
  const [{ openDirectDatabase }, { advisors }, { researchProduct }, drizzle] = await Promise.all([
    import("./src/db/client.ts"),
    import("./src/db/schema.ts"),
    import("./src/server/product-research.ts"),
    import("drizzle-orm"),
  ]);
  const connection = openDirectDatabase("dev");
  try {
    const [admin] = await connection.db
      .select({ id: advisors.id })
      .from(advisors)
      .where(drizzle.and(drizzle.eq(advisors.role, "admin"), drizzle.eq(advisors.status, "activa")))
      .limit(1);
    if (!admin) throw new Error("Sin admin activa.");
    const result = await researchProduct(process.argv[2], {
      authorize: async () => ({ ok: true, data: { id: admin.id, role: "admin" } }),
      database: connection.db,
    });
    console.log(
      result.ok
        ? JSON.stringify({ sources: result.data.sources, safetyApplied: result.data.safetyApplied })
        : `FALLO ${JSON.stringify(result.error)}`,
    );
  } finally {
    await connection.close();
  }
}
main().catch((e: unknown) => {
  console.error("Error:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
