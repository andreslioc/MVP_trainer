import { composeCopilotAnswer } from "../../../server/copilot/compose.ts";

const encoder = new TextEncoder();

function event(value: unknown) {
  return encoder.encode(`${JSON.stringify(value)}\n`);
}

export async function POST(request: Request) {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: { code: "VALIDATION", message: "La solicitud no es valida." } },
      { status: 400 },
    );
  }

  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      void composeCopilotAnswer(input, {
        onChunk: (chunk) => {
          if (!cancelled) controller.enqueue(event({ type: "chunk", chunk }));
        },
      })
        .then((result) => {
          if (!cancelled) {
            controller.enqueue(event({ type: result.ok ? "complete" : "error", result }));
          }
        })
        .catch(() => {
          if (!cancelled) {
            controller.enqueue(
              event({
                type: "error",
                result: {
                  ok: false,
                  error: {
                    code: "COPILOT_FAILED",
                    message: "No se pudo generar. Intenta de nuevo.",
                  },
                },
              }),
            );
          }
        })
        .finally(() => {
          if (!cancelled) controller.close();
        });
    },
    cancel() {
      cancelled = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/x-ndjson; charset=utf-8",
    },
  });
}
