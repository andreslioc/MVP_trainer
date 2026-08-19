import type { AiProviderClient, AiProviderRequest, AiProviderResponse } from "./gateway.ts";

/**
 * Cliente para Ollama corriendo localmente en puerto 11434.
 * Usado para desarrollo y pruebas sin gastar cuota de Gemini.
 */

const OLLAMA_BASE_URL = "http://localhost:11434";
const REQUEST_TIMEOUT_MS = 60_000;

export async function checkOllamaAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function toProviderResponse(
  ollamaResponse: Record<string, unknown>,
  model: string,
): AiProviderResponse {
  const text = String(ollamaResponse.response ?? "").trim();
  return {
    id: `ollama-${Date.now()}`,
    model,
    text,
    finishReason: String(ollamaResponse.done ?? false) === "true" ? "end_turn" : "max_tokens",
    refusalCategory: null,
    usage: {
      inputTokens: Number(ollamaResponse.prompt_eval_count ?? 0),
      outputTokens: Number(ollamaResponse.eval_count ?? 0),
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
  };
}

async function callOllama(
  request: AiProviderRequest,
  model: string,
  stream: boolean,
): Promise<Record<string, unknown> | ReadableStream<Uint8Array>> {
  const prompt = `${request.system}\n\n${request.messages.map((m) => m.content).join("\n\n")}`;

  const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      stream,
      raw: true,
      format: request.jsonSchema ? "json" : undefined,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Ollama error ${response.status}: ${text}`);
  }

  if (!stream) return response.json();
  if (!response.body) throw new Error("Ollama no devolvio cuerpo de stream.");
  return response.body;
}

export function createOllamaClient(modelName: string = "llama2:7b"): AiProviderClient {
  return {
    async createMessage(request) {
      const response = (await callOllama(request, modelName, false)) as Record<string, unknown>;
      return toProviderResponse(response, modelName);
    },

    async parseMessage(request) {
      const response = (await callOllama(request, modelName, false)) as Record<string, unknown>;
      const base = toProviderResponse(response, modelName);
      let parsedOutput: unknown;
      try {
        parsedOutput = base.text ? JSON.parse(base.text) : undefined;
      } catch {
        parsedOutput = undefined;
      }
      return { ...base, parsedOutput };
    },

    streamMessage(request) {
      let resolveFinal: (value: AiProviderResponse) => void;
      let rejectFinal: (reason: unknown) => void;
      const final = new Promise<AiProviderResponse>((resolve, reject) => {
        resolveFinal = resolve;
        rejectFinal = reject;
      });

      async function* iterate() {
        try {
          const body = (await callOllama(request, modelName, true)) as ReadableStream<Uint8Array>;
          const reader = body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let text = "";
          let lastResponse: Record<string, unknown> | undefined;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                const json = JSON.parse(line) as Record<string, unknown>;
                lastResponse = json;
                const chunk = String(json.response ?? "");
                if (chunk) {
                  text += chunk;
                  yield { partialJson: chunk };
                }
              } catch {
                // Ignorar líneas que no sean JSON válido
              }
            }
          }

          buffer += decoder.decode();
          for (const line of buffer.split("\n")) {
            if (!line.trim()) continue;
            try {
              const json = JSON.parse(line) as Record<string, unknown>;
              lastResponse = json;
              const chunk = String(json.response ?? "");
              if (chunk) {
                text += chunk;
                yield { partialJson: chunk };
              }
            } catch {
              // Ignorar líneas que no sean JSON válido
            }
          }

          if (!lastResponse) throw new Error("Ollama no produjo respuesta.");
          const base = toProviderResponse(lastResponse, modelName);
          let parsedOutput: unknown;
          try {
            parsedOutput = text ? JSON.parse(text) : undefined;
          } catch {
            parsedOutput = undefined;
          }

          resolveFinal({ ...base, text: text.trim(), parsedOutput });
        } catch (error) {
          rejectFinal(error);
          throw error;
        }
      }

      return Object.assign(iterate(), { finalMessage: () => final });
    },
  };
}
