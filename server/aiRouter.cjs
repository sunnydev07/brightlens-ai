const axios = require("axios");

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

// 🔥 MAIN ROUTER FUNCTION
async function analyze(image, prompt) {
  return await callGeminiModel(image, prompt);
}

async function callGeminiModel(image, prompt) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw createGeminiError("GEMINI_API_KEY is missing in server/.env.", 500);
  }

  const parts = [{ text: buildPrompt(prompt) }];

  if (image) {
    const { mimeType, base64Data } = parseImageData(image);
    parts.push({
      inlineData: {
        mimeType,
        data: base64Data
      }
    });
  }

  try {
    const res = await axios.post(
      `${GEMINI_API_BASE}/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        contents: [
          {
            role: "user",
            parts
          }
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 320
        }
      },
      {
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

    const text = res.data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("")
      .trim();

    if (!text) {
      throw createGeminiError("Gemini returned an empty response.", 502);
    }

    return text;
  } catch (error) {
    throw normalizeGeminiError(error);
  }
}

function parseImageData(image) {
  const match = /^data:(.+?);base64,(.+)$/s.exec(image);

  if (match) {
    return {
      mimeType: match[1],
      base64Data: match[2]
    };
  }

  return {
    mimeType: "image/png",
    base64Data: image.split(",").pop() || image
  };
}

function normalizeGeminiError(error) {
  if (error.statusCode) {
    return error;
  }

  const statusCode = error.response?.status || 500;
  const responseMessage = error.response?.data?.error?.message
    || error.response?.data?.error?.details?.[0]?.message
    || error.response?.data?.error?.message
    || error.response?.data?.message;

  if (responseMessage) {
    return createGeminiError(responseMessage, statusCode);
  }

  if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
    return createGeminiError("Gemini API is unreachable.", 503);
  }

  return createGeminiError(error.message || "Gemini request failed.", statusCode);
}

function createGeminiError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

// 🎯 Prompt builder (VERY IMPORTANT)
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

module.exports = { analyze };