import {
  callbackSecretFromRequest,
  handleTranscriptionCallback,
} from "../../../server/recordings/transcription.ts";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const result = await handleTranscriptionCallback({
    secret: callbackSecretFromRequest(request),
    token: url.searchParams.get("token"),
    readBody: () => request.json(),
  });
  return Response.json(result.body, { status: result.status });
}
