require("dotenv").config();

const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { analyze } = require("./aiRouter.cjs");
const { speechToText } = require("./speech.cjs");
const { save } = require("./db.cjs");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const uploadDir = path.join(__dirname, "uploads");
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir });

app.post("/analyze", async (req, res) => {
  try {
    const { image, prompt, mode } = req.body ?? {};

    if (!image && !prompt) {
      return res.status(400).json({ error: "Missing image or prompt." });
    }

    const result = await analyze(image, prompt, mode);

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

app.listen(5000, () => console.log("Server running on 5000"));