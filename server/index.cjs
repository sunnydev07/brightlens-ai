require("dotenv").config();

const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const helmet = require("helmet");
const { z } = require("zod");
const { analyze, analyzeStream } = require("./aiRouter.cjs");
const { speechToText } = require("./speech.cjs");
const { save, getSessionHistory } = require("./db.cjs");

const app = express();
app.use(helmet());

// Origin validation/CSRF protection middleware
const allowedOrigins = ['http://localhost:5173', 'http://localhost:5174', 'http://127.0.0.1:5173', 'http://127.0.0.1:5174'];
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !allowedOrigins.includes(origin)) {
    return res.status(403).json({ error: `Access denied from unauthorized origin: ${origin}` });
  }
  next();
});

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST'],
  credentials: true
}));
app.use(express.json({ limit: "10mb" }));

const uploadDir = path.join(__dirname, "uploads");
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB max
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['audio/webm', 'audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/ogg', 'audio/mp4'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported audio format: ${file.mimetype}`), false);
    }
  }
});

// Zod schemas for input validation
const analyzeSchema = z.object({
  image: z.string().nullable().optional(),
  prompt: z.string().min(1, "Prompt cannot be empty").max(10000, "Prompt must be less than 10000 characters"),
  mode: z.enum(["online", "offline"]).default("online"),
  systemPrompt: z.string().max(2000, "System prompt must be less than 2000 characters").nullable().optional(),
  onlineVisionModel: z.enum(["gemini", "nvidia"]).optional()
});

function sanitizeSystemPrompt(prompt) {
  if (!prompt) return prompt;
  // Remove control characters to prevent prompt injection and model state disruption
  return prompt.replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F]/g, "").trim();
}

app.post("/analyze", async (req, res) => {
  try {
    const parsed = analyzeSchema.safeParse(req.body);
    if (!parsed.success) {
      const errorMsg = parsed.error.errors.map(e => e.message).join(", ");
      return res.status(400).json({ error: errorMsg });
    }

    const { image, prompt, mode, systemPrompt } = parsed.data;
    const sanitizedSystemPrompt = sanitizeSystemPrompt(systemPrompt);

    if (!image && !prompt) {
      return res.status(400).json({ error: "Missing image or prompt." });
    }

    const keys = {
      geminiKey: req.headers["x-gemini-key"] || req.body?.keys?.geminiKey,
      openrouterKey: req.headers["x-openrouter-key"] || req.body?.keys?.openrouterKey,
      nvidiaKey: req.headers["x-nvidia-key"] || req.body?.keys?.nvidiaKey
    };

    const history = await getSessionHistory();
    let historyPrefix = "";
    if (history.length > 0) {
      historyPrefix = "Previous conversation history:\n" + history.map(row => `User: ${row.question}\nAI: ${row.answer}`).join("\n\n") + "\n\nCurrent request:\n";
    }

    const fullPrompt = historyPrefix + prompt;

    const result = await analyze(image, fullPrompt, mode, sanitizedSystemPrompt, keys);

    // Save to database without blocking the response.
    save(prompt, result);

    res.json({ result });
  } catch (error) {
    const statusCode = error.statusCode || error.response?.status || 500;
    const message = error.response?.data?.error?.message
      || error.response?.data?.error?.message?.message
      || error.response?.data?.error
      || error.message
      || "Failed to analyze image.";

    console.error("Analyze error:", error.response?.data || error);
    res.status(statusCode).json({ error: message });
  }
});

// ── Streaming endpoint (SSE) ──────────────────────────────────────────────────
app.post("/analyze-stream", async (req, res) => {
  try {
    const parsed = analyzeSchema.safeParse(req.body);
    if (!parsed.success) {
      const errorMsg = parsed.error.errors.map(e => e.message).join(", ");
      return res.status(400).json({ error: errorMsg });
    }

    const { image, prompt, mode, systemPrompt, onlineVisionModel } = parsed.data;
    const sanitizedSystemPrompt = sanitizeSystemPrompt(systemPrompt);

    if (!image && !prompt) {
      return res.status(400).json({ error: "Missing image or prompt." });
    }

    const keys = {
      geminiKey: req.headers["x-gemini-key"] || req.body?.keys?.geminiKey,
      openrouterKey: req.headers["x-openrouter-key"] || req.body?.keys?.openrouterKey,
      nvidiaKey: req.headers["x-nvidia-key"] || req.body?.keys?.nvidiaKey
    };

    const history = await getSessionHistory();
    let historyPrefix = "";
    if (history.length > 0) {
      historyPrefix = "Previous conversation history:\n" + history.map(row => `User: ${row.question}\nAI: ${row.answer}`).join("\n\n") + "\n\nCurrent request:\n";
    }

    const fullPrompt = historyPrefix + prompt;

    const fullText = await analyzeStream(image, fullPrompt, mode, sanitizedSystemPrompt, onlineVisionModel, res, keys);

    if (fullText) {
      // Save prompt to DB after stream completes
      save(prompt, fullText);
    }
  } catch (error) {
    console.error("Stream error:", error.response?.data || error);
    if (!res.headersSent) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({ error: error.message || "Streaming failed." });
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

// ── Graceful shutdown ──────────────────────────────────────────────────────────
const server = app.listen(5000, '127.0.0.1', () => console.log("Server running on 127.0.0.1:5000"));

process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
});