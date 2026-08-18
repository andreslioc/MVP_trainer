import { describe, expect, it } from "vitest";

import { GET } from "../../src/app/health/route.ts";

describe("GET /health", () => {
  it("reports that the application is alive", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true });
  });

  it("cumple el contrato de §5: ok, db y commit", async () => {
    const body = (await (await GET()).json()) as { ok: boolean; db: string; commit: string };

    expect(body.ok).toBe(true);
    expect(["up", "down"]).toContain(body.db);
    expect(typeof body.commit).toBe("string");
  });

  it("es liveness y no readiness: ok no depende del estado de la base", async () => {
    // Es la razon de que `db` sea un campo aparte en vez de tumbar `ok`: un
    // orquestador que reinicia por una base caida reinicia el contenedor
    // equivocado.
    const body = (await (await GET()).json()) as { ok: boolean };

    expect(body.ok).toBe(true);
  });
});
