const axios = require("axios");

// ── Model config ──────────────────────────────────────────────────────────────
const GEMINI_MODEL        = process.env.GEMINI_MODEL        || "gemini-3-flash-preview";
const GEMINI_API_BASE     = "https://generativelanguage.googleapis.com/v1beta";
const OLLAMA_BASE         = process.env.OLLAMA_BASE         || "http://127.0.0.1:11434";
const OLLAMA_MODEL        = process.env.OLLAMA_MODEL        || "llama3.2:latest";
const OLLAMA_VISION_MODEL = process.env.OLLAMA_VISION_MODEL || "llava:latest";

// OpenRouter config (online text generation)
const OPENROUTER_API_KEY  = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL    = process.env.OPENROUTER_MODEL    || "nvidia/nemotron-nano-9b-v2:free";
const OPENROUTER_API_BASE = "https://openrouter.ai/api/v1";

// NVIDIA config (online vision generation)
const NVIDIA_API_KEY      = process.env.NVIDIA_API_KEY;
const NVIDIA_API_BASE     = "https://integrate.api.nvidia.com/v1";

// ── Non-streaming (kept for /analyze) ────────────────────────────────────────
async function analyze(image, prompt, mode = "online", systemPrompt = null) {
  if (image) {
    return mode === "offline"
      ? await callOllamaVisionModel(image, prompt, systemPrompt)
      : await callGeminiModel(image, prompt, systemPrompt);
  }
  // Text-only: online → OpenRouter, offline → local Ollama
  if (mode === "online") {
    return await callOpenRouterModel(prompt, systemPrompt);
  }
  return await callOllamaModel(prompt, systemPrompt);
}

// ── Streaming entry point (/analyze-stream) ───────────────────────────────────
async function analyzeStream(image, prompt, mode = "online", systemPrompt = null, onlineVisionModel = "gemini", expressRes) {
  // SSE headers
  expressRes.setHeader("Content-Type", "text/event-stream");
  expressRes.setHeader("Cache-Control", "no-cache");
  expressRes.setHeader("Connection", "keep-alive");
  expressRes.setHeader("X-Accel-Buffering", "no"); // disable nginx/proxy buffering
  expressRes.flushHeaders();

  try {
    if (image) {
      if (mode === "offline") {
        return await streamOllamaVision(image, prompt, systemPrompt, expressRes);
      } else {
        if (onlineVisionModel === "nvidia") {
          return await streamNvidiaVision(image, prompt, systemPrompt, expressRes);
        } else {
          // Gemini: get full response then emit as one event
          const text = await callGeminiModel(image, prompt, systemPrompt);
          sendSSE(expressRes, { token: text, done: true });
          expressRes.end();
          return text;
        }
      }
    } else {
      // Text-only: online → OpenRouter streaming, offline → local Ollama streaming
      if (mode === "online") {
        return await streamOpenRouterText(prompt, systemPrompt, expressRes);
      }
      return await streamOllamaText(prompt, systemPrompt, expressRes);
    }
  } catch (err) {
    if (!expressRes.writableEnded) {
      sendSSE(expressRes, { error: err.message || "Analysis failed.", done: true });
      expressRes.end();
    }
    return null;
  }
}


// ── Streaming: OpenRouter text (online) ───────────────────────────────────────
async function streamOpenRouterText(prompt, systemPrompt, expressRes) {
  if (!OPENROUTER_API_KEY) throw createError("OPENROUTER_API_KEY is missing in .env.", 500);

  const controller = new AbortController();
  expressRes.on("close", () => controller.abort());

  const messages = [];
  const sys = systemPrompt || `You are an expert tutor helping a student.

Default behavior:
- Be concise but complete. Use bullet points or numbered steps where helpful.
- Match response length to the complexity of the question. Don't add unnecessary filler.

If the user explicitly asks to "elaborate", "explain in detail", "step-by-step", or "more details", provide a thorough response.`;

  messages.push({ role: "system", content: sys });
  messages.push({ role: "user", content: prompt });

  let axiosRes;
  try {
    axiosRes = await axios.post(
      `${OPENROUTER_API_BASE}/chat/completions`,
      {
        model: OPENROUTER_MODEL,
        messages,
        stream: true,
        temperature: 0.2,
        max_tokens: 4096
      },
      {
        headers: {
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "http://localhost:5000",
          "X-Title": "Brightlens AI"
        },
        responseType: "stream",
        timeout: 300_000,
        signal: controller.signal
      }
    );
  } catch (err) {
    if (axios.isCancel(err)) return;
    throw normalizeOpenRouterError(err);
  }

  return pipeOpenRouterStream(axiosRes.data, expressRes);
}

// ── Pipe OpenRouter SSE → our SSE ─────────────────────────────────────────────
function pipeOpenRouterStream(stream, expressRes) {
  return new Promise((resolve, reject) => {
    let buf = "";
    let fullText = "";

    stream.on("data", (chunk) => {
      buf += chunk.toString();
      const lines = buf.split("\n");
      buf = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        const payload = trimmed.slice(6);
        if (payload === "[DONE]") {
          sendSSE(expressRes, { token: "", done: true });
          if (!expressRes.writableEnded) expressRes.end();
          return resolve(fullText);
        }
        try {
          const obj = JSON.parse(payload);
          const delta = obj.choices?.[0]?.delta?.content;
          if (delta) {
            fullText += delta;
            sendSSE(expressRes, { token: delta, done: false });
          }
          // Check if finish_reason is set
          if (obj.choices?.[0]?.finish_reason) {
            sendSSE(expressRes, { token: "", done: true });
            if (!expressRes.writableEnded) expressRes.end();
            return resolve(fullText);
          }
        } catch { /* skip malformed JSON */ }
      }
    });

    stream.on("end", () => {
      if (!expressRes.writableEnded) {
        sendSSE(expressRes, { token: "", done: true });
        expressRes.end();
      }
      resolve(fullText);
    });

    stream.on("error", (err) => reject(normalizeOpenRouterError(err)));
  });
}

// ── Streaming: NVIDIA vision (online) ─────────────────────────────────────────
async function streamNvidiaVision(image, prompt, systemPrompt, expressRes) {
  if (!NVIDIA_API_KEY) throw createError("NVIDIA_API_KEY is missing in .env.", 500);

  const controller = new AbortController();
  expressRes.on("close", () => controller.abort());

  let axiosRes;
  try {
    // The image might not have the full data: URL if it's just base64, but parseImageData handles it.
    const { mimeType, base64Data } = parseImageData(image);
    const dataUrl = `data:${mimeType};base64,${base64Data}`;

    axiosRes = await axios.post(
      `${NVIDIA_API_BASE}/chat/completions`,
      {
        model: "microsoft/phi-4-multimodal-instruct",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: buildPrompt(prompt, systemPrompt) },
              { type: "image_url", image_url: { url: dataUrl } }
            ]
          }
        ],
        stream: true,
        temperature: 0.1,
        max_tokens: 1024,
        top_p: 0.70
      },
      {
        headers: {
          "Authorization": `Bearer ${NVIDIA_API_KEY}`,
          "Accept": "text/event-stream",
          "Content-Type": "application/json"
        },
        responseType: "stream",
        timeout: 300_000,
        signal: controller.signal
      }
    );
  } catch (err) {
    if (axios.isCancel(err)) return;
    throw normalizeOpenRouterError(err); // OpenRouter error formatter works perfectly for NVIDIA's OpenAI-compatible API
  }

  return pipeOpenRouterStream(axiosRes.data, expressRes); // We can reuse OpenRouter's pipe logic
}

// ── Streaming: Ollama text (llama3.2) ─────────────────────────────────────────
async function streamOllamaText(prompt, systemPrompt, expressRes) {
  let axiosRes;
  const controller = new AbortController();
  
  expressRes.on("close", () => {
    controller.abort();
  });

  try {
    axiosRes = await axios.post(
      `${OLLAMA_BASE}/api/generate`,
      {
        model: OLLAMA_MODEL,
        prompt: buildPrompt(prompt, systemPrompt),
        stream: true,
        options: { temperature: 0.2, num_predict: 4096 }  // ← increased
      },
      { responseType: "stream", timeout: 300_000, signal: controller.signal }
    );
  } catch (err) {
    if (axios.isCancel(err)) return; // Ignore aborts
    throw normalizeOllamaError(err, OLLAMA_MODEL);
  }
  return pipeOllamaStream(axiosRes.data, expressRes);
}

// ── Streaming: Ollama vision (llava) ──────────────────────────────────────────
async function streamOllamaVision(image, prompt, systemPrompt, expressRes) {
  const base64Data = extractBase64(image);
  let axiosRes;
  const controller = new AbortController();

  expressRes.on("close", () => {
    controller.abort();
  });

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
      { responseType: "stream", timeout: 300_000, signal: controller.signal }
    );
  } catch (err) {
    if (axios.isCancel(err)) return; // Ignore aborts
    throw normalizeOllamaError(err, OLLAMA_VISION_MODEL);
  }
  return pipeOllamaStream(axiosRes.data, expressRes);
}

// ── Pipe Ollama NDJSON → SSE ──────────────────────────────────────────────────
function pipeOllamaStream(stream, expressRes) {
  return new Promise((resolve, reject) => {
    let buf = "";
    let fullText = "";

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
            return resolve(fullText);
          }
          if (obj.response !== undefined) {
            fullText += obj.response;
            sendSSE(expressRes, { token: obj.response, done: false });
          }
          if (obj.done) {
            sendSSE(expressRes, { token: "", done: true });
            if (!expressRes.writableEnded) expressRes.end();
            return resolve(fullText);
          }
        } catch { /* skip malformed JSON chunks */ }
      }
    });

    stream.on("end", () => {
      if (!expressRes.writableEnded) {
        sendSSE(expressRes, { token: "", done: true });
        expressRes.end();
      }
      resolve(fullText);
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

// ── Non-streaming: OpenRouter (online text) ───────────────────────────────────
async function callOpenRouterModel(prompt, systemPrompt) {
  if (!OPENROUTER_API_KEY) throw createError("OPENROUTER_API_KEY is missing in .env.", 500);

  const sys = systemPrompt || `You are an expert tutor helping a student.

Default behavior:
- Be concise but complete. Use bullet points or numbered steps where helpful.
- Match response length to the complexity of the question. Don't add unnecessary filler.

If the user explicitly asks to "elaborate", "explain in detail", "step-by-step", or "more details", provide a thorough response.`;

  try {
    const res = await axios.post(
      `${OPENROUTER_API_BASE}/chat/completions`,
      {
        model: OPENROUTER_MODEL,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: prompt }
        ],
        temperature: 0.2,
        max_tokens: 4096
      },
      {
        headers: {
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "http://localhost:5000",
          "X-Title": "Brightlens AI"
        },
        timeout: 300_000
      }
    );
    const text = res.data?.choices?.[0]?.message?.content?.trim();
    if (!text) throw createError("OpenRouter returned an empty response.", 502);
    return text;
  } catch (error) {
    throw normalizeOpenRouterError(error);
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

function normalizeOpenRouterError(error) {
  if (error.statusCode) return error;
  if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") return createError("OpenRouter API is unreachable. Check your internet connection.", 503);
  if (error.code === "ECONNABORTED" || error.message?.includes("timeout")) return createError("OpenRouter request timed out — try again.", 504);
  const statusCode = error.response?.status || 500;
  const msg = error.response?.data?.error?.message || error.response?.data?.error || error.message || "OpenRouter request failed.";
  return createError(msg, statusCode);
}

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

module.exports = { analyze, analyzeStream };