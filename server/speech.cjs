const { exec } = require("child_process");
const path = require("path");

function speechToText(filePath) {
  return new Promise((resolve, reject) => {
    const fullPath = path.resolve(filePath);

    exec(`python "${path.join(__dirname, 'speech.py')}" "${fullPath}"`, (err, stdout, stderr) => {
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