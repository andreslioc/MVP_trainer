import { describe, expect, it } from "vitest";

import { compressForTranscription } from "../../src/server/recordings/compress.ts";

function wav(seconds: number) {
  const rate = 16000;
  const frames = rate * seconds;
  const buffer = Buffer.alloc(44 + frames * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + frames * 2, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(frames * 2, 40);
  for (let frame = 0; frame < frames; frame += 1) {
    buffer.writeInt16LE(
      Math.round(9000 * Math.sin((2 * Math.PI * 220 * frame) / rate)),
      44 + frame * 2,
    );
  }
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

describe("duración medida al preparar el audio", () => {
  it("la mide aunque no haya que comprimir: la lista y el proveedor la necesitan igual", async () => {
    const result = await compressForTranscription(
      { audio: wav(7), contentType: "audio/wav" },
      { maxBytes: 10 * 1024 * 1024 },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.compressed).toBe(false);
    expect(result.data.durationS).toBe(7);
  });

  it("la conserva cuando si comprime, y no la toma del archivo ya reducido", async () => {
    const result = await compressForTranscription(
      { audio: wav(30), contentType: "audio/wav" },
      { maxBytes: 64 * 1024 },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.compressed).toBe(true);
    expect(result.data.durationS).toBe(30);
  });

  it("devuelve null si no se pudo medir, en vez de inventar un cero", async () => {
    const result = await compressForTranscription(
      { audio: wav(2), contentType: "audio/wav" },
      { maxBytes: 10 * 1024 * 1024, probe: async () => null },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.durationS).toBeNull();
  });
});
