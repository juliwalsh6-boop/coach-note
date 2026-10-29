import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { analyzeMealImage, MealAnalysisError, messagesApiUrl } from "./meal-analysis";

const IMAGE = { base64: "aGVsbG8=", mediaType: "image/jpeg" as const };

const VALID_ANALYSIS = {
  is_food_photo: true,
  items: [
    {
      name: "鶏の唐揚げ",
      kind: "dish",
      estimated_weight_g: 150,
      portion_text: "5個",
      energy_kcal: 420,
      protein_g: 25,
      fat_g: 28,
      carbs_g: 15,
      confidence: "medium",
      basis: "visual_estimate",
      note: "揚げ油を含む",
    },
  ],
  overall_confidence: "medium",
  warnings: [],
};

function apiResponse(body: unknown, status = 200): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function messageWith(text: string, stopReason = "end_turn") {
  return { type: "message", role: "assistant", content: [{ type: "text", text }], stop_reason: stopReason };
}

const originalFetch = globalThis.fetch;
const originalError = console.error;
const originalKey = process.env.ANTHROPIC_API_KEY;
const originalBase = process.env.ANTHROPIC_BASE_URL;
let calls: { url: string; init: RequestInit | undefined }[] = [];

function mockFetch(result: Response | Error) {
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (result instanceof Error) throw result;
    return result;
  }) as typeof fetch;
}

async function analysisError(): Promise<string> {
  try {
    await analyzeMealImage(IMAGE);
  } catch (e) {
    assert.ok(e instanceof MealAnalysisError);
    return e.code;
  }
  assert.fail("エラーになるはず");
}

describe("messagesApiUrl", () => {
  test("既定は Anthropic の API。ANTHROPIC_BASE_URL があればそちらを使う", () => {
    assert.equal(messagesApiUrl(undefined), "https://api.anthropic.com/v1/messages");
    assert.equal(messagesApiUrl(""), "https://api.anthropic.com/v1/messages");
    assert.equal(messagesApiUrl("http://127.0.0.1:4010"), "http://127.0.0.1:4010/v1/messages");
    assert.equal(messagesApiUrl("https://proxy.example.com/anthropic/"), "https://proxy.example.com/anthropic/v1/messages");
  });

  test("http(s) 以外・不正な値は使わない", () => {
    assert.equal(messagesApiUrl("ftp://example.com"), "https://api.anthropic.com/v1/messages");
    assert.equal(messagesApiUrl("not a url"), "https://api.anthropic.com/v1/messages");
  });
});

describe("analyzeMealImage", () => {
  beforeEach(() => {
    calls = [];
    process.env.ANTHROPIC_API_KEY = "test-key";
    delete process.env.ANTHROPIC_BASE_URL;
    console.error = () => undefined; // API エラー時のログを表示しない
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    console.error = originalError;
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalKey;
    if (originalBase === undefined) delete process.env.ANTHROPIC_BASE_URL;
    else process.env.ANTHROPIC_BASE_URL = originalBase;
  });

  test("構造化出力の結果を検証して返す（API キーはヘッダーでだけ送る）", async () => {
    mockFetch(apiResponse(messageWith(JSON.stringify(VALID_ANALYSIS))));
    const { analysis, model } = await analyzeMealImage(IMAGE);
    assert.equal(model, "claude-sonnet-5-5");
    assert.equal(analysis.items.length, 1);
    assert.equal(analysis.items[0]?.name, "鶏の唐揚げ");
    assert.equal(analysis.items[0]?.energyKcal, 420);

    const call = calls[0];
    assert.equal(call?.url, "https://api.anthropic.com/v1/messages");
    const headers = call?.init?.headers as Record<string, string>;
    assert.equal(headers["x-api-key"], "test-key");
    const body = JSON.parse(String(call?.init?.body)) as Record<string, unknown>;
    assert.equal(JSON.stringify(body).includes("test-key"), false, "本文に API キーを入れない");
    assert.deepEqual((body.output_config as { format: { type: string } }).format.type, "json_schema");
  });

  test("API キーが無ければ呼び出さずに ai_not_configured", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    mockFetch(apiResponse(messageWith("{}")));
    assert.equal(await analysisError(), "ai_not_configured");
    assert.equal(calls.length, 0);
  });

  test("API のエラーを画面用のコードに変える", async () => {
    mockFetch(apiResponse({ type: "error" }, 529));
    assert.equal(await analysisError(), "ai_busy");
    mockFetch(apiResponse({ type: "error" }, 429));
    assert.equal(await analysisError(), "ai_busy");
    mockFetch(apiResponse({ type: "error" }, 401));
    assert.equal(await analysisError(), "ai_not_configured");
    mockFetch(apiResponse({ type: "error" }, 500));
    assert.equal(await analysisError(), "ai_failed");
    mockFetch(new TypeError("fetch failed"));
    assert.equal(await analysisError(), "ai_failed");
    mockFetch(new DOMException("timed out", "TimeoutError"));
    assert.equal(await analysisError(), "ai_timeout");
  });

  test("拒否・途中で切れた応答・形式違いは使わない", async () => {
    mockFetch(apiResponse(messageWith("", "refusal")));
    assert.equal(await analysisError(), "ai_refused");
    mockFetch(apiResponse(messageWith("{\"is_food_photo\": true", "max_tokens")));
    assert.equal(await analysisError(), "ai_invalid_response");
    mockFetch(apiResponse(messageWith("これは JSON ではありません")));
    assert.equal(await analysisError(), "ai_invalid_response");
    mockFetch(apiResponse(messageWith(JSON.stringify({ ...VALID_ANALYSIS, overall_confidence: "unknown" }))));
    assert.equal(await analysisError(), "ai_invalid_response");
    const tooMuch = { ...VALID_ANALYSIS, items: [{ ...VALID_ANALYSIS.items[0], energy_kcal: 99999 }] };
    mockFetch(apiResponse(messageWith(JSON.stringify(tooMuch))));
    assert.equal(await analysisError(), "ai_invalid_response");
    mockFetch(apiResponse("<html>bad gateway</html>"));
    assert.equal(await analysisError(), "ai_invalid_response");
  });

  test("ANTHROPIC_BASE_URL を設定するとそこへ送る（テスト用のモックなど）", async () => {
    process.env.ANTHROPIC_BASE_URL = "http://127.0.0.1:4010";
    mockFetch(apiResponse(messageWith(JSON.stringify(VALID_ANALYSIS))));
    await analyzeMealImage(IMAGE);
    assert.equal(calls[0]?.url, "http://127.0.0.1:4010/v1/messages");
  });
});
