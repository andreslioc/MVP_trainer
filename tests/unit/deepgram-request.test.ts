import { describe, expect, it } from "vitest";

import {
  buildDeepgramRequest,
  callbackSecretFromRequest,
  secretsMatch,
  type DeepgramConfig,
} from "../../src/server/recordings/transcription.ts";

const config: DeepgramConfig = {
  apiKey: "deepgram-test-key",
  baseUrl: "https://api.deepgram.test/v1/listen",
  model: "nova-test",
  language: "es-419",
  callbackSecret: "callback-secret-long-enough",
  publicBaseUrl: "https://sales.example.test",
};

describe("Deepgram transcription request", () => {
  it("uses configured REST parameters, callback, language and current diarization", () => {
    const request = buildDeepgramRequest(
      {
        audioUrl: "https://storage.example.test/signed/audio.mp3",
        callbackToken: "recording-token",
      },
      config,
    );
    const url = new URL(request.url);
    const callback = new URL(url.searchParams.get("callback") ?? "");

    expect(`${url.origin}${url.pathname}`).toBe(config.baseUrl);
    expect(url.searchParams.get("model")).toBe(config.model);
    expect(url.searchParams.get("language")).toBe(config.language);
    expect(url.searchParams.get("diarize_model")).toBe("latest");
    expect(url.searchParams.has("diarize")).toBe(false);
    expect(url.searchParams.get("callback_method")).toBe("POST");
    expect(callback.origin).toBe(config.publicBaseUrl);
    expect(callback.pathname).toBe("/api/transcription-callback");
    expect(callback.searchParams.get("token")).toBe("recording-token");
    expect(callback.username).toBe("deepgram");
    expect(callback.password).toBe(config.callbackSecret);
    expect(request.init).toMatchObject({
      method: "POST",
      headers: {
        Authorization: `Token ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: "https://storage.example.test/signed/audio.mp3" }),
    });
  });

  it("compares secrets in constant-size digests and accepts supported callback auth", () => {
    expect(secretsMatch("the-secret", "the-secret")).toBe(true);
    expect(secretsMatch("wrong", "the-secret")).toBe(false);
    expect(secretsMatch(null, "the-secret")).toBe(false);

    const explicit = new Request("https://example.test", {
      headers: { "x-callback-secret": "header-secret" },
    });
    const basic = new Request("https://example.test", {
      headers: {
        Authorization: `Basic ${Buffer.from("deepgram:basic-secret").toString("base64")}`,
      },
    });
    expect(callbackSecretFromRequest(explicit)).toBe("header-secret");
    expect(callbackSecretFromRequest(basic)).toBe("basic-secret");
  });
});
