import { describe, expect, it } from "vitest";

import { GET } from "../../src/app/health/route.ts";

describe("GET /health", () => {
  it("reports that the application is alive", async () => {
    const response = GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true });
  });
});
