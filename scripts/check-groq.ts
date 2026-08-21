/** Confirma que la ruta de Groq esta configurada, sin imprimir ninguna llave. */
import { loadEnv } from "../src/lib/load-env.ts";

loadEnv();

async function main(): Promise<void> {
  const { env } = await import("../src/lib/env.ts");
  console.log("TRANSCRIPTION_PROVIDER :", env.TRANSCRIPTION_PROVIDER);
  console.log("GROQ_MODEL             :", env.GROQ_MODEL ?? "whisper-large-v3-turbo (por defecto)");
  console.log("GROQ_API_KEY           :", env.GROQ_API_KEY ? "presente" : "AUSENTE");
  console.log("TRANSCRIPTION_MAX_BYTES:", env.TRANSCRIPTION_MAX_BYTES);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
