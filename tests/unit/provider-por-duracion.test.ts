import { describe, expect, it } from "vitest";

import { GROQ_MAX_AUDIO_SECONDS } from "../../src/server/recordings/groq.ts";

/**
 * El tope de Groq es por ventana de una hora, no por peticion: un live que lo
 * excede no se arregla troceandolo, porque los segundos se gastan igual. Esta
 * constante es la que decide cuando hay que irse a Deepgram, asi que fijarla
 * evita que alguien la baje "por si acaso" y empiece a gastar credito de mas.
 */
describe("tope de audio de Groq", () => {
  it("son dos horas exactas, verificadas contra la API", () => {
    expect(GROQ_MAX_AUDIO_SECONDS).toBe(7200);
    expect(GROQ_MAX_AUDIO_SECONDS / 60).toBe(120);
  });

  it("un live de 2,4 horas lo excede y uno de 1,5 no", () => {
    const dosHorasVeinticuatro = 8523;
    const horaYMedia = 5400;

    expect(dosHorasVeinticuatro).toBeGreaterThan(GROQ_MAX_AUDIO_SECONDS);
    expect(horaYMedia).toBeLessThan(GROQ_MAX_AUDIO_SECONDS);
  });
});
