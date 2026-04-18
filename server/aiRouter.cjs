const axios = require("axios");

// ── Model config ──────────────────────────────────────────────────────────────
const GEMINI_MODEL      = process.env.GEMINI_MODEL       || "gemini-3-flash-preview";
const GEMINI_API_BASE   = "https://generativelanguage.googleapis.com/v1beta";

const OLLAMA_BASE        = process.env.OLLAMA_BASE        || "http://localhost:11434";
const OLLAMA_MODEL       = process.env.OLLAMA_MODEL       || "llama3.2:latest";
const OLLAMA_VISION_MODEL = process.env.OLLAMA_VISION_MODEL || "llava:latest";

// ── Main router ───────────────────────────────────────────────────────────────
// mode "offline" → llava (image) + llama3.2 (text)   — runs 100% locally
// mode "online"  → Gemini (image) + llama3.2 (text)  — Google vision API
async function analyze(image, prompt, mode = "online") {
  const isOffline = mode === "offline";

  if (image) {
    if (isOffline) {
      return await callOllamaVisionModel(image, prompt);
    }
    return await callGeminiModel(image, prompt);
  }

  // Text-only always uses local Ollama regardless of mode
  return await callOllamaModel(prompt);
}

// ── Gemini (online image analysis) ───────────────────────────────────────────
async function callGeminiModel(image, prompt) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw createError("GEMINI_API_KEY is missing in .env.", 500);
  }

  const { mimeType, base64Data } = parseImageData(image);

  const parts = [
    { text: buildPrompt(prompt) },
    { inlineData: { mimeType, data: base64Data } }
  ];

  try {
    const res = await axios.post(
      `${GEMINI_API_BASE}/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        contents: [{ role: "user", parts }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 1024 }
      },
      { headers: { "Content-Type": "application/json" } }
    );

    const text = res.data?.candidates?.[0]?.content?.parts
      ?.map((p) => p.text || "")
      .join("")
      .trim();

    if (!text) throw createError("Gemini returned an empty response.", 502);
    return text;
  } catch (error) {
    throw normalizeGeminiError(error);
  }
}

// ── Ollama llava (offline image analysis) ─────────────────────────────────────
async function callOllamaVisionModel(image, prompt) {
  // llava accepts base64 image via the `images` array
  const base64Data = extractBase64(image);

  try {
    const res = await axios.post(
      `${OLLAMA_BASE}/api/generate`,
      {
        model: OLLAMA_VISION_MODEL,
        prompt: buildPrompt(prompt),
        images: [base64Data],
        stream: false,
        options: { temperature: 0.2, num_predict: 1024 }
      },
      {
        headers: { "Content-Type": "application/json" },
        timeout: 180_000   // 3-min timeout — llava is larger
      }
    );

    const text = (res.data?.response || "").trim();
    if (!text) throw createError("llava returned an empty response.", 502);
    return text;
  } catch (error) {
    throw normalizeOllamaError(error, OLLAMA_VISION_MODEL);
  }
}

// ── Ollama llama3.2 (text-only, both modes) ───────────────────────────────────
async function callOllamaModel(prompt) {
  try {
    const res = await axios.post(
      `${OLLAMA_BASE}/api/generate`,
      {
        model: OLLAMA_MODEL,
        prompt: buildPrompt(prompt),
        stream: false,
        options: { temperature: 0.2, num_predict: 1024 }
      },
      {
        headers: { "Content-Type": "application/json" },
        timeout: 120_000
      }
    );

    const text = (res.data?.response || "").trim();
    if (!text) throw createError("Ollama returned an empty response.", 502);
    return text;
  } catch (error) {
    throw normalizeOllamaError(error, OLLAMA_MODEL);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseImageData(image) {
  const match = /^data:(.+?);base64,(.+)$/s.exec(image);
  if (match) return { mimeType: match[1], base64Data: match[2] };
  return { mimeType: "image/png", base64Data: image.split(",").pop() || image };
}

function extractBase64(image) {
  const match = /^data:.+?;base64,(.+)$/s.exec(image);
  return match ? match[1] : (image.split(",").pop() || image);
}

function buildPrompt(userPrompt) {
  return `
You are an expert tutor helping a student.

Default behavior (IMPORTANT):
- Keep the answer short and direct (max 4 short bullet points OR 3 concise lines).
- Do not give long step-by-step explanations unless the user explicitly asks.
- Do not add extra examples or practice questions unless requested.

If the user explicitly asks to "elaborate", "explain in detail", "step-by-step", "deep dive", or "more details", then provide a detailed response.

User request: ${userPrompt}
`;
}

function normalizeGeminiError(error) {
  if (error.statusCode) return error;
  const statusCode = error.response?.status || 500;
  const msg =
    error.response?.data?.error?.message ||
    error.response?.data?.error?.details?.[0]?.message ||
    error.response?.data?.message;
  if (msg) return createError(msg, statusCode);
  if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
    return createError("Gemini API is unreachable.", 503);
  }
  return createError(error.message || "Gemini request failed.", statusCode);
}

function normalizeOllamaError(error, model) {
  if (error.statusCode) return error;
  if (error.code === "ECONNREFUSED") {
    return createError(
      `Ollama is not running. Make sure Ollama is open (model: ${model}).`,
      503
    );
  }
  if (error.code === "ECONNABORTED" || error.message?.includes("timeout")) {
    return createError(
      `Ollama timed out. "${model}" may still be loading — try again in a moment.`,
      504
    );
  }
  const statusCode = error.response?.status || 500;
  const msg =
    error.response?.data?.error ||
    error.response?.data?.message ||
    error.message ||
    "Ollama request failed.";
  return createError(msg, statusCode);
}

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

module.exports = { analyze };