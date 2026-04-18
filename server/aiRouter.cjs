const axios = require("axios");

// ── Model config ──────────────────────────────────────────────────────────────
const GEMINI_MODEL        = process.env.GEMINI_MODEL        || "gemini-3-flash-preview";
const GEMINI_API_BASE     = "https://generativelanguage.googleapis.com/v1beta";
const OLLAMA_BASE         = process.env.OLLAMA_BASE         || "http://127.0.0.1:11434";
const OLLAMA_MODEL        = process.env.OLLAMA_MODEL        || "llama3.2:latest";
const OLLAMA_VISION_MODEL = process.env.OLLAMA_VISION_MODEL || "llava:latest";

// ── Non-streaming (kept for /analyze) ────────────────────────────────────────
async function analyze(image, prompt, mode = "online", systemPrompt = null) {
  if (image) {
    return mode === "offline"
      ? await callOllamaVisionModel(image, prompt, systemPrompt)
      : await callGeminiModel(image, prompt, systemPrompt);
  }
  return await callOllamaModel(prompt, systemPrompt);
}

// ── Streaming entry point (/analyze-stream) ───────────────────────────────────
async function analyzeStream(image, prompt, mode = "online", systemPrompt = null, expressRes) {
  // SSE headers
  expressRes.setHeader("Content-Type", "text/event-stream");
  expressRes.setHeader("Cache-Control", "no-cache");
  expressRes.setHeader("Connection", "keep-alive");
  expressRes.setHeader("X-Accel-Buffering", "no"); // disable nginx/proxy buffering
  expressRes.flushHeaders();

  try {
    if (image) {
      if (mode === "offline") {
        await streamOllamaVision(image, prompt, systemPrompt, expressRes);
      } else {
        // Gemini: get full response then emit as one event
        const text = await callGeminiModel(image, prompt, systemPrompt);
        sendSSE(expressRes, { token: text, done: true });
        expressRes.end();
      }
    } else {
      await streamOllamaText(prompt, systemPrompt, expressRes);
    }
  } catch (err) {
    if (!expressRes.writableEnded) {
      sendSSE(expressRes, { error: err.message || "Analysis failed.", done: true });
      expressRes.end();
    }
  }
}

// ── Streaming: Ollama text (llama3.2) ─────────────────────────────────────────
async function streamOllamaText(prompt, systemPrompt, expressRes) {
  let axiosRes;
  try {
    axiosRes = await axios.post(
      `${OLLAMA_BASE}/api/generate`,
      {
        model: OLLAMA_MODEL,
        prompt: buildPrompt(prompt, systemPrompt),
        stream: true,
        options: { temperature: 0.2, num_predict: 4096 }  // ← increased
      },
      { responseType: "stream", timeout: 300_000 }
    );
  } catch (err) {
    throw normalizeOllamaError(err, OLLAMA_MODEL);
  }
  return pipeOllamaStream(axiosRes.data, expressRes);
}

// ── Streaming: Ollama vision (llava) ──────────────────────────────────────────
async function streamOllamaVision(image, prompt, systemPrompt, expressRes) {
  const base64Data = extractBase64(image);
  let axiosRes;
  try {
    axiosRes = await axios.post(
      `${OLLAMA_BASE}/api/generate`,
      {
        model: OLLAMA_VISION_MODEL,
        prompt: buildPrompt(prompt, systemPrompt),
        images: [base64Data],
        stream: true,
        options: { temperature: 0.2, num_predict: 2048 }  // ← increased
      },
      { responseType: "stream", timeout: 300_000 }
    );
  } catch (err) {
    throw normalizeOllamaError(err, OLLAMA_VISION_MODEL);
  }
  return pipeOllamaStream(axiosRes.data, expressRes);
}

// ── Pipe Ollama NDJSON → SSE ──────────────────────────────────────────────────
function pipeOllamaStream(stream, expressRes) {
  return new Promise((resolve, reject) => {
    let buf = "";

    stream.on("data", (chunk) => {
      buf += chunk.toString();
      const lines = buf.split("\n");
      buf = lines.pop() || ""; // keep incomplete last line

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line);
          if (obj.error) {
            sendSSE(expressRes, { error: obj.error, done: true });
            if (!expressRes.writableEnded) expressRes.end();
            return resolve();
          }
          if (obj.response !== undefined) {
            sendSSE(expressRes, { token: obj.response, done: false });
          }
          if (obj.done) {
            sendSSE(expressRes, { token: "", done: true });
            if (!expressRes.writableEnded) expressRes.end();
            return resolve();
          }
        } catch { /* skip malformed JSON chunks */ }
      }
    });

    stream.on("end", () => {
      if (!expressRes.writableEnded) {
        sendSSE(expressRes, { token: "", done: true });
        expressRes.end();
      }
      resolve();
    });

    stream.on("error", (err) => reject(normalizeOllamaError(err, "model")));
  });
}

// ── Non-streaming model calls (for /analyze) ──────────────────────────────────
async function callGeminiModel(image, prompt, systemPrompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw createError("GEMINI_API_KEY is missing in .env.", 500);

  const { mimeType, base64Data } = parseImageData(image);
  const parts = [
    { text: buildPrompt(prompt, systemPrompt) },
    { inlineData: { mimeType, data: base64Data } }
  ];

  try {
    const res = await axios.post(
      `${GEMINI_API_BASE}/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        contents: [{ role: "user", parts }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 2048 }
      },
      { headers: { "Content-Type": "application/json" } }
    );

    const text = res.data?.candidates?.[0]?.content?.parts
      ?.map((p) => p.text || "").join("").trim();
    if (!text) throw createError("Gemini returned an empty response.", 502);
    return text;
  } catch (error) {
    throw normalizeGeminiError(error);
  }
}

async function callOllamaVisionModel(image, prompt, systemPrompt) {
  const base64Data = extractBase64(image);
  try {
    const res = await axios.post(
      `${OLLAMA_BASE}/api/generate`,
      {
        model: OLLAMA_VISION_MODEL,
        prompt: buildPrompt(prompt, systemPrompt),
        images: [base64Data],
        stream: false,
        options: { temperature: 0.2, num_predict: 2048 }
      },
      { headers: { "Content-Type": "application/json" }, timeout: 300_000 }
    );
    const text = (res.data?.response || "").trim();
    if (!text) throw createError("llava returned an empty response.", 502);
    return text;
  } catch (error) {
    throw normalizeOllamaError(error, OLLAMA_VISION_MODEL);
  }
}

async function callOllamaModel(prompt, systemPrompt) {
  try {
    const res = await axios.post(
      `${OLLAMA_BASE}/api/generate`,
      {
        model: OLLAMA_MODEL,
        prompt: buildPrompt(prompt, systemPrompt),
        stream: false,
        options: { temperature: 0.7, num_predict: 4096 }
      },
      { headers: { "Content-Type": "application/json" }, timeout: 300_000 }
    );
    const text = (res.data?.response || "").trim();
    if (!text) throw createError("Ollama returned an empty response.", 502);
    return text;
  } catch (error) {
    throw normalizeOllamaError(error, OLLAMA_MODEL);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function sendSSE(res, data) {
  if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function parseImageData(image) {
  const match = /^data:(.+?);base64,(.+)$/s.exec(image);
  if (match) return { mimeType: match[1], base64Data: match[2] };
  return { mimeType: "image/png", base64Data: image.split(",").pop() || image };
}

function extractBase64(image) {
  const match = /^data:.+?;base64,(.+)$/s.exec(image);
  return match ? match[1] : (image.split(",").pop() || image);
}

function buildPrompt(userPrompt, systemPrompt) {
  const sys = systemPrompt ? systemPrompt : `You are an expert tutor helping a student.

Default behavior:
- Be concise but complete. Use bullet points or numbered steps where helpful.
- Match response length to the complexity of the question. Don't add unnecessary filler.

If the user explicitly asks to "elaborate", "explain in detail", "step-by-step", or "more details", provide a thorough response.`;

  return `${sys}

User request: ${userPrompt}`;
}

function normalizeGeminiError(error) {
  if (error.statusCode) return error;
  const statusCode = error.response?.status || 500;
  const msg = error.response?.data?.error?.message || error.response?.data?.message;
  if (msg) return createError(msg, statusCode);
  if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") return createError("Gemini API is unreachable.", 503);
  return createError(error.message || "Gemini request failed.", statusCode);
}

function normalizeOllamaError(error, model) {
  if (error.statusCode) return error;
  if (error.code === "ECONNREFUSED") return createError(`Ollama is not running. Make sure Ollama is open (model: ${model}).`, 503);
  if (error.code === "ECONNABORTED" || error.message?.includes("timeout")) return createError(`Ollama timed out. "${model}" may still be loading — try again.`, 504);
  const statusCode = error.response?.status || 500;
  const msg = error.response?.data?.error || error.response?.data?.message || error.message || "Ollama request failed.";
  return createError(msg, statusCode);
}

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

module.exports = { analyze, analyzeStream };