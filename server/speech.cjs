const { execFile } = require("child_process");
const path = require("path");

function speechToText(filePath) {
  return new Promise((resolve, reject) => {
    const fullPath = path.resolve(filePath);
    const scriptPath = path.join(__dirname, "speech.py");
    const pythonExecutable = process.env.BRIGHTLENS_PYTHON || "python";

    execFile(
      pythonExecutable,
      [scriptPath, fullPath],
      {
        env: {
          ...process.env,
          HF_HUB_OFFLINE: "1",
          TRANSFORMERS_OFFLINE: "1",
        },
        timeout: 120000,
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          const details = stderr.trim() || error.message;
          console.error("Speech error:", details);
          reject(new Error(`Local speech transcription failed: ${details}`));
          return;
        }

        resolve(stdout.trim());
      },
    );
  });
}

module.exports = { speechToText };
