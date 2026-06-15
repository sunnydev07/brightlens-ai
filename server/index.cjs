require("dotenv").config();

const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { analyze, analyzeStream } = require("./aiRouter.cjs");
const { speechToText } = require("./speech.cjs");
const { save, getSessionHistory } = require("./db.cjs");
const { normalizeAnalyzeRequest } = require("./request.cjs");

const app = express();
const SERVER_HOST = process.env.BRIGHTLENS_HOST || "127.0.0.1";
const SERVER_PORT = Number(process.env.BRIGHTLENS_PORT || 5000);
const allowedOrigins = new Set([
  "http://127.0.0.1:5173",
  "http://127.0.0.1:4173",
  "http://localhost:5173",
  "http://localhost:4173",
  "null",
]);

app.use((req, res, next) => {
  const origin = req.get("origin");
  if (origin && !allowedOrigins.has(origin)) {
    return res.status(403).json({ error: "Origin is not allowed." });
  }
  next();
});
app.use(cors({
  origin(origin, callback) {
    callback(null, !origin || allowedOrigins.has(origin));
  },
}));
app.use(express.json({ limit: "10mb" }));

const uploadDir = path.join(__dirname, "uploads");
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 25 * 1024 * 1024,
    files: 1,
  },
});

function createHistoryPrompt(history, prompt) {
  if (history.length === 0) return prompt;

  const historyText = history
    .map((row) => `User: ${row.question}\nAI: ${row.answer}`)
    .join("\n\n");
  return `Previous conversation history:\n${historyText}\n\nCurrent request:\n${prompt}`;
}

function getErrorMessage(error, fallback) {
  const responseError = error.response?.data?.error;
  if (typeof responseError === "string") return responseError;
  if (typeof responseError?.message === "string") return responseError.message;
  if (typeof error.response?.data?.message === "string") {
    return error.response.data.message;
  }
  return error.message || fallback;
}

app.post("/analyze", async (req, res) => {
  try {
    const { image, prompt, mode, systemPrompt } = normalizeAnalyzeRequest(req.body);

    const history = await getSessionHistory();
    const fullPrompt = createHistoryPrompt(history, prompt);

    const result = await analyze(image, fullPrompt, mode, systemPrompt);

    // Save to database without blocking the response.
    save(prompt, result);

    res.json({ result });
  } catch (error) {
    const statusCode = error.statusCode || error.response?.status || 500;
    const message = getErrorMessage(error, "Failed to analyze image.");

    if (statusCode >= 500) {
      console.error("Analyze error:", error.response?.data || error);
    }
    res.status(statusCode).json({ error: message });
  }
});

// ── Streaming endpoint (SSE) ──────────────────────────────────────────────────
app.post("/analyze-stream", async (req, res) => {
  try {
    const { image, prompt, mode, systemPrompt } = normalizeAnalyzeRequest(req.body);

    const history = await getSessionHistory();
    const fullPrompt = createHistoryPrompt(history, prompt);

    const fullText = await analyzeStream(image, fullPrompt, mode, systemPrompt, res);

    if (fullText) {
      // Save prompt to DB after stream completes
      save(prompt, fullText);
    }
  } catch (error) {
    const statusCode = error.statusCode || error.response?.status || 500;
    if (statusCode >= 500) {
      console.error("Stream error:", error.response?.data || error);
    }
    if (!res.headersSent) {
      res.status(statusCode).json({
        error: getErrorMessage(error, "Streaming failed."),
      });
    }
  }
});

app.post("/speech", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file?.path) {
      return res.status(400).json({ error: "Missing audio file. Use form-data field name 'audio'." });
    }

    // Rename file to have .webm extension for audio decoder compatibility
    const webmPath = req.file.path + ".webm";
    fs.renameSync(req.file.path, webmPath);
    req.file.path = webmPath;

    // Guard: reject empty or tiny files (< 1KB)
    const stats = fs.statSync(webmPath);
    if (stats.size < 1024) {
      fs.unlinkSync(webmPath);
      req.file.path = null;
      return res.json({ text: "" });
    }

    const text = await speechToText(webmPath);
    res.json({ text });
  } catch (error) {
    const message = error?.message || "Speech transcription failed.";
    console.error("Speech error:", error);
    res.status(500).json({ error: message });
  } finally {
    if (req.file?.path) {
      fs.unlink(req.file.path, () => {});
    }
  }
});

app.use((error, _req, res, next) => {
  if (error instanceof multer.MulterError) {
    const message = error.code === "LIMIT_FILE_SIZE"
      ? "Audio file is too large. Maximum size is 25 MB."
      : error.message;
    return res.status(400).json({ error: message });
  }
  next(error);
});

function startServer() {
  return app.listen(SERVER_PORT, SERVER_HOST, () => {
    console.log(`Server running on http://${SERVER_HOST}:${SERVER_PORT}`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
