const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.join(__dirname, "memory.db");
const db = new sqlite3.Database(dbPath);

let activeSessionId = Date.now().toString() + Math.random().toString(36).substring(7);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question TEXT,
      answer TEXT
    )
  `);

  db.run("ALTER TABLE history ADD COLUMN sessionId TEXT", (err) => {
    // Ignore error if column already exists
  });

  db.run("ALTER TABLE history ADD COLUMN timestamp DATETIME DEFAULT CURRENT_TIMESTAMP", (err) => {
    // Ignore error if column already exists
  });
});

function setActiveSession(sessionId) {
  if (sessionId) {
    activeSessionId = sessionId;
  }
}

function getActiveSession() {
  return activeSessionId;
}

function startNewSession() {
  activeSessionId = Date.now().toString() + Math.random().toString(36).substring(7);
  return activeSessionId;
}

function save(question, answer) {
  if (!question || !answer) return;
  db.run(
    "INSERT INTO history (sessionId, question, answer) VALUES (?, ?, ?)",
    [activeSessionId, question, answer],
    (error) => {
      if (error) {
        console.error("DB save error:", error);
      }
    }
  );
}

function getSessionHistory(limit = 20) {
  return new Promise((resolve) => {
    db.all(
      "SELECT question, answer FROM history WHERE sessionId = ? ORDER BY id DESC LIMIT ?",
      [activeSessionId, limit],
      (err, rows) => {
        if (err) {
          console.error("DB read error:", err);
          resolve([]);
        } else {
          // Reverse to get chronological order (oldest first)
          resolve((rows || []).reverse());
        }
      }
    );
  });
}

function listSessions() {
  return new Promise((resolve) => {
    db.all(
      "SELECT sessionId, MIN(id) as firstId, question, timestamp FROM history GROUP BY sessionId ORDER BY firstId DESC",
      [],
      (err, rows) => {
        if (err) {
          console.error("DB list sessions error:", err);
          resolve([]);
        } else {
          resolve(rows || []);
        }
      }
    );
  });
}

function deleteSession(sessionId) {
  return new Promise((resolve) => {
    db.run(
      "DELETE FROM history WHERE sessionId = ?",
      [sessionId],
      (err) => {
        if (err) {
          console.error("DB delete session error:", err);
          resolve(false);
        } else {
          resolve(true);
        }
      }
    );
  });
}

module.exports = {
  save,
  getSessionHistory,
  setActiveSession,
  getActiveSession,
  startNewSession,
  listSessions,
  deleteSession
};