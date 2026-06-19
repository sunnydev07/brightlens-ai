const { execFile } = require("child_process");
const path = require("path");

function speechToText(filePath) {
  return new Promise((resolve, reject) => {
    const fullPath = path.resolve(filePath);
    const scriptPath = path.join(__dirname, 'speech.py');

    // Use execFile instead of exec to prevent shell injection
    execFile('python', [scriptPath, fullPath], { timeout: 60000 }, (err, stdout, stderr) => {
      if (err) {
        console.error("Speech error:", err);
        reject(err);
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

module.exports = { speechToText };