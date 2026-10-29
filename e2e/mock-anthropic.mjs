// E2E テスト用の Claude API（Messages API）のモック。
// 本物の API は呼ばずに、決まった解析結果を返す（ANTHROPIC_BASE_URL=http://127.0.0.1:4010 で使う）。
//   - 画像が小さい（base64 が 4,000 文字未満）とき: 529（混雑）を返し、アプリのエラー時の動きを確かめる
//   - それ以外: ごはん・鶏の照り焼きの 2 品を返す
// リクエストの形（API キーのヘッダー・構造化出力の指定・画像）も確かめ、違えば 400 を返す。
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_ANTHROPIC_PORT ?? 4010);
const EXPECTED_KEY = process.env.ANTHROPIC_API_KEY ?? "e2e-test-key";

const ANALYSIS = {
  is_food_photo: true,
  items: [
    {
      name: "ごはん",
      kind: "dish",
      estimated_weight_g: 150,
      portion_text: "茶碗1杯",
      energy_kcal: 234,
      protein_g: 3.8,
      fat_g: 0.5,
      carbs_g: 55.7,
      confidence: "high",
      basis: "visual_estimate",
      note: "",
    },
    {
      name: "鶏の照り焼き",
      kind: "dish",
      estimated_weight_g: 120,
      portion_text: "1皿",
      energy_kcal: 300,
      protein_g: 25,
      fat_g: 18,
      carbs_g: 10,
      confidence: "medium",
      basis: "visual_estimate",
      note: "タレを含む",
    },
  ],
  overall_confidence: "medium",
  warnings: [],
};

let requests = 0;

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") return send(res, 200, { ok: true, requests });
  if (req.method !== "POST" || req.url !== "/v1/messages") return send(res, 404, { type: "error", error: { type: "not_found" } });

  let raw = "";
  req.setEncoding("utf8");
  req.on("data", (chunk) => {
    raw += chunk;
  });
  req.on("end", () => {
    requests += 1;
    if (req.headers["x-api-key"] !== EXPECTED_KEY || !req.headers["anthropic-version"]) {
      return send(res, 401, { type: "error", error: { type: "authentication_error", message: "bad key" } });
    }
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return send(res, 400, { type: "error", error: { type: "invalid_request_error", message: "json" } });
    }
    const content = body?.messages?.[0]?.content ?? [];
    const image = content.find((block) => block?.type === "image");
    const data = image?.source?.data;
    if (
      typeof body.model !== "string" ||
      body?.output_config?.format?.type !== "json_schema" ||
      typeof data !== "string" ||
      !["image/jpeg", "image/png", "image/webp"].includes(image?.source?.media_type)
    ) {
      return send(res, 400, { type: "error", error: { type: "invalid_request_error", message: "shape" } });
    }
    console.log(`request ${requests}: model=${body.model} image=${image.source.media_type} base64=${data.length}`);
    if (data.length < 4000) {
      return send(res, 529, { type: "error", error: { type: "overloaded_error", message: "Overloaded" } });
    }
    return send(res, 200, {
      id: `msg_e2e_${requests}`,
      type: "message",
      role: "assistant",
      model: body.model,
      content: [{ type: "text", text: JSON.stringify(ANALYSIS) }],
      stop_reason: "end_turn",
      usage: { input_tokens: 1000, output_tokens: 300 },
    });
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`mock anthropic listening on http://127.0.0.1:${PORT}`);
});
