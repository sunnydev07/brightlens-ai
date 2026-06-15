const fs = require('fs');
const path = require('path');
const os = require('os');

const logDir = path.join(os.homedir(), '.brightlens-ai');
const logFile = path.join(logDir, 'mini-jarvis-actions.jsonl');

function logAction(entry) {
  fs.mkdirSync(logDir, { recursive: true });
  fs.appendFileSync(
    logFile,
    `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`,
    'utf8',
  );
}

module.exports = { logAction, logFile };
