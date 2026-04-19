const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.join(__dirname, "memory.db");
const db = new sqlite3.Database(dbPath);

const currentSessionId = Date.now().toString() + Math.random().toString(36).substring(7);

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

function save(question, answer) {
  if (!question || !answer) return;
  db.run(
    "INSERT INTO history (sessionId, question, answer) VALUES (?, ?, ?)",
    [currentSessionId, question, answer],
    (error) => {
      if (error) {
        console.error("DB save error:", error);
      }
    }
  );
}

function getSessionHistory() {
  return new Promise((resolve) => {
    db.all(
      "SELECT question, answer FROM history WHERE sessionId = ? ORDER BY id ASC",
      [currentSessionId],
      (err, rows) => {
        if (err) {
          console.error("DB read error:", err);
          resolve([]);
        } else {
          resolve(rows || []);
        }
      }
    );
  });
}

module.exports = { save, getSessionHistory };