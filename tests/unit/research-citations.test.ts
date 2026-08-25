import { describe, expect, it } from "vitest";

import { resolveCitations } from "../../src/lib/research-citations.ts";

const redirect = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AB123";

describe("resolveCitations", () => {
  it("cambia el redirect del buscador por la pagina real", async () => {
    const resolved = await resolveCitations(
      [{ url: redirect, title: "pipingrock.com" }],
      async () => ({
        url: "https://www.pipingrock.com/oregano-oil-59ml",
      }),
    );

    expect(resolved).toEqual([
      {
        url: "https://www.pipingrock.com/oregano-oil-59ml",
        title: "pipingrock.com/oregano-oil-59ml",
      },
    ]);
  });

  it("conserva la fuente cuando el redirect no responde", async () => {
    const resolved = await resolveCitations(
      [{ url: redirect, title: "pipingrock.com" }],
      async () => {
        throw new Error("timeout");
      },
    );

    expect(resolved).toEqual([{ url: redirect, title: "pipingrock.com" }]);
  });

  it("distingue dos paginas del mismo sitio", async () => {
    let call = 0;
    const resolved = await resolveCitations(
      [
        { url: `${redirect}-uno`, title: "nih.gov" },
        { url: `${redirect}-dos`, title: "nih.gov" },
      ],
      async () => {
        call += 1;
        return {
          url:
            call === 1
              ? "https://dailymed.nlm.nih.gov/dailymed/lookup.cfm"
              : "https://pubmed.ncbi.nlm.nih.gov/12345678",
        };
      },
    );

    // Con la etiqueta del proveedor —solo el dominio— las dos filas se llamaban
    // igual y React las trataba como una sola.
    expect(new Set(resolved.map((citation) => citation.title)).size).toBe(2);
  });

  it("no repite una pagina a la que llegan dos redirects", async () => {
    const resolved = await resolveCitations(
      [
        { url: `${redirect}-uno`, title: "pipingrock.com" },
        { url: `${redirect}-dos`, title: "pipingrock.com" },
      ],
      async () => ({ url: "https://www.pipingrock.com/oregano-oil-59ml" }),
    );

    expect(resolved).toHaveLength(1);
  });
});
