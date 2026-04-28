import os from 'node:os';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const DEFAULT_DB_PATH = path.join(os.homedir(), '.opencli', 'twitter', 'tweets.db');

export function openTweetDb(dbPath = DEFAULT_DB_PATH) {
  mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`PRAGMA journal_mode = WAL;`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS tweets (
      tweet_id   TEXT PRIMARY KEY,
      username   TEXT NOT NULL,
      text       TEXT NOT NULL,
      created_at TEXT NOT NULL,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_tweets_user_id ON tweets(username, tweet_id DESC);
  `);

  const maxIdStmt = db.prepare(
    `SELECT tweet_id FROM tweets WHERE username = ? ORDER BY CAST(tweet_id AS INTEGER) DESC LIMIT 1`
  );
  const insertStmt = db.prepare(
    `INSERT OR IGNORE INTO tweets(tweet_id, username, text, created_at) VALUES (?, ?, ?, ?)`
  );
  const countStmt = db.prepare(`SELECT COUNT(*) AS n FROM tweets WHERE username = ?`);

  function insertManyTx(rows) {
    db.exec('BEGIN');
    let inserted = 0;
    try {
      for (const row of rows) {
        const info = insertStmt.run(row[0], row[1], row[2], row[3]);
        inserted += Number(info.changes);
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    return inserted;
  }

  return {
    getMaxIdForUser(username) {
      const row = maxIdStmt.get(username);
      return row ? row.tweet_id : null;
    },
    insertMany(rows) {
      if (!rows || rows.length === 0) return { inserted: 0 };
      const inserted = insertManyTx(rows);
      return { inserted };
    },
    countForUser(username) {
      return Number(countStmt.get(username).n);
    },
    close() {
      db.close();
    },
  };
}
