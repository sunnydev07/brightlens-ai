const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.join(__dirname, "memory.db");
const db = new sqlite3.Database(dbPath);

db.run(`
CREATE TABLE IF NOT EXISTS history (
  id INTEGER PRIMARY KEY,
  question TEXT,
  answer TEXT
)
`);

function save(question, answer) {
  db.run(
    "INSERT INTO history (question, answer) VALUES (?, ?)",
    [question, answer],
    (error) => {
      if (error) {
        console.error("DB save error:", error);
      }
    }
  );
}

module.exports = { save };