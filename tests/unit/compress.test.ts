import { describe, expect, it } from "vitest";

import { compressForTranscription } from "../../src/server/recordings/compress.ts";

/** WAV de tono puro: comprimible de verdad, sin depender de un fixture binario. */
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

describe("compressForTranscription", () => {
  it("no toca el audio que ya cabe: comprimir de gratis solo degrada", async () => {
    const audio = wav(1);

    const result = await compressForTranscription(
      { audio, contentType: "audio/wav" },
      { maxBytes: 10 * 1024 * 1024 },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.compressed).toBe(false);
    expect(result.data.audio).toBe(audio);
    expect(result.data.contentType).toBe("audio/wav");
  });

  it("comprime de verdad el audio que no cabe y lo deja bajo el tope", async () => {
    const audio = wav(30);

    const result = await compressForTranscription(
      { audio, contentType: "audio/wav" },
      { maxBytes: 64 * 1024 },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.compressed).toBe(true);
    expect(result.data.contentType).toBe("audio/ogg");
    expect(result.data.bytes).toBeLessThanOrEqual(64 * 1024);
    expect(result.data.bytes).toBeLessThan(audio.byteLength);
  });

  it("dice que el live es demasiado largo en vez de mandar algo que el proveedor rechazara", async () => {
    const result = await compressForTranscription(
      { audio: wav(30), contentType: "audio/wav" },
      { maxBytes: 200 },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("TOO_LONG");
    expect(result.error.message).toContain("Corta el live");
  });

  it("culpa al servidor y no a la grabacion cuando falta ffmpeg", async () => {
    const result = await compressForTranscription(
      { audio: wav(2), contentType: "audio/wav" },
      {
        maxBytes: 1024,
        run: async () => ({ ok: false, stderr: "spawn ffmpeg ENOENT" }),
      },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("FFMPEG_MISSING");
  });
});
