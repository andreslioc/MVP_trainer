import { describe, expect, it } from "vitest";

import { MAX_RECORDING_BYTES, recordingFileProblem } from "../../src/lib/recordings.ts";

describe("recordingFileProblem", () => {
  it("acepta un audio dentro del limite", () => {
    expect(recordingFileProblem({ type: "audio/mpeg", size: 50 * 1024 * 1024 })).toBeNull();
  });

  it("dice cuanto pesa y cual es el tope cuando no hay como convertirlo", () => {
    // El parser de multipart ya no esta en el camino: la subida va del
    // navegador a Storage. Lo que corta ahora es el tope del bucket, y por eso
    // el tope se pasa como argumento en vez de leerse de una constante.
    const problem = recordingFileProblem(
      { type: "video/mp4", size: 400 * 1024 * 1024 },
      50 * 1024 * 1024,
    );

    expect(problem).toContain("400 MB");
    expect(problem).toContain("50 MB");
  });

  it("acepta exactamente el limite y rechaza un byte mas", () => {
    expect(
      recordingFileProblem({ type: "audio/wav", size: MAX_RECORDING_BYTES }, MAX_RECORDING_BYTES),
    ).toBeNull();
    expect(
      recordingFileProblem(
        { type: "audio/wav", size: MAX_RECORDING_BYTES + 1 },
        MAX_RECORDING_BYTES,
      ),
    ).not.toBeNull();
  });

  it("rechaza un formato que el proveedor no acepta", () => {
    expect(recordingFileProblem({ type: "application/pdf", size: 1024 })).not.toBeNull();
  });

  it("rechaza un archivo vacio", () => {
    expect(recordingFileProblem({ type: "audio/mpeg", size: 0 })).not.toBeNull();
  });
});
