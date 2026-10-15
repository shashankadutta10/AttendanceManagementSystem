import fs from 'node:fs';
import path from 'node:path';

export const DB_PATH = path.resolve(process.cwd(), 'data', 'attendance_db.json');

export const DEFAULT_DB = {
  config: {
    name: "SHASHANKA'S HOME",
    latitude: 27.459316,
    longitude: 94.552332,
    radius: 300,
    startTime: "00:00",
    endTime: "23:59",
    strictAccuracy: true,
  },
  adminPin: "0310",
  records: [],
};

/**
 * Reads database state from disk.
 * Falls back to DEFAULT_DB if file does not exist or JSON is invalid.
 */
export function getDb() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      const dir = path.dirname(DB_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(DB_PATH, JSON.stringify(DEFAULT_DB, null, 2), 'utf-8');
      return { ...DEFAULT_DB };
    }
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      config: { ...DEFAULT_DB.config, ...(parsed.config || {}) },
      adminPin: parsed.adminPin || "0310",
      records: Array.isArray(parsed.records) ? parsed.records : [],
    };
  } catch (err) {
    console.error("[Database Manager] Error reading database, using fallback:", err);
    return { ...DEFAULT_DB };
  }
}

/**
 * Persists database state to disk safely.
 */
export function saveDb(db) {
  try {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error("[Database Manager] Error saving database to disk:", err);
    return false;
  }
}
