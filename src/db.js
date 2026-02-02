// src/db.js (Postgres version for Railway)
// Uses process.env.DATABASE_URL
// Keeps the same API: run/get/all/initDb

const { Pool } = require("pg");

// Railway provides DATABASE_URL automatically when you add Postgres
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.warn(
    "[db] WARNING: DATABASE_URL is not set. Add a Railway Postgres database or set DATABASE_URL."
  );
}

// Recommended for Railway: use SSL if provided; Railway usually works without extra SSL config,
// but leaving this as "auto" is safest.
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined
});

// ─────────────────────────────────────────────
// Helpers: convert sqlite-style query to pg-style query
// - Replaces ? placeholders with $1, $2, ...
// - Converts "INSERT OR IGNORE" -> "INSERT ... ON CONFLICT DO NOTHING"
// - Converts "INSERT OR REPLACE" -> table-specific UPSERT based on known PKs
// ─────────────────────────────────────────────

const UPSERT_KEYS = {
  user_xp: ["guild_id", "user_id"],
  guild_settings: ["guild_id"],
  level_roles: ["guild_id", "level"],
  ignored_channels: ["guild_id", "channel_id"],
  user_birthdays: ["guild_id", "user_id"],
  birthday_settings: ["guild_id"],
  mee6_snapshot: ["guild_id", "snapshot_username"],
  private_voice_rooms: ["guild_id", "voice_channel_id"]
};

function replaceQMarks(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

function parseInsertColumns(sql) {
  // Matches: INSERT ... INTO table (a, b, c) VALUES (...)
  // Returns { table, columns[] } or null
  const m = sql.match(/insert\s+(?:or\s+(?:ignore|replace)\s+)?into\s+([a-z0-9_]+)\s*\(([^)]+)\)\s*values\s*\(/i);
  if (!m) return null;
  const table = m[1];
  const columns = m[2]
    .split(",")
    .map(s => s.trim().replace(/"/g, ""))
    .filter(Boolean);
  return { table, columns };
}

function toPg(sql) {
  if (!sql || typeof sql !== "string") return sql;

  let s = sql.trim();

  // normalize whitespace a bit (don’t change meaning)
  // keep original casing mostly; pg is case-insensitive for keywords anyway
  const lower = s.toLowerCase();

  // Convert placeholders first
  s = replaceQMarks(s);

  // INSERT OR IGNORE -> ON CONFLICT DO NOTHING
  if (lower.startsWith("insert or ignore into")) {
    s = s.replace(/insert\s+or\s+ignore\s+into/i, "INSERT INTO");
    s += " ON CONFLICT DO NOTHING";
    return s;
  }

  // INSERT OR REPLACE -> known table upsert
  if (lower.startsWith("insert or replace into")) {
    const parsed = parseInsertColumns(sql);
    if (!parsed) {
      // fallback: drop "OR REPLACE" (may error if conflict happens)
      return s.replace(/insert\s+or\s+replace\s+into/i, "INSERT INTO");
    }

    const { table, columns } = parsed;
    const keys = UPSERT_KEYS[table];

    // If we don't know keys, fallback (still better than crashing hard)
    if (!keys || keys.length === 0) {
      return s.replace(/insert\s+or\s+replace\s+into/i, "INSERT INTO");
    }

    // Build update set: all non-key columns
    const nonKeys = columns.filter(c => !keys.includes(c));
    const setClause =
      nonKeys.length === 0
        ? "DO NOTHING"
        : "DO UPDATE SET " +
          nonKeys.map(c => `"${c}" = EXCLUDED."${c}"`).join(", ");

    // Replace the prefix and append conflict clause
    s = s.replace(/insert\s+or\s+replace\s+into/i, "INSERT INTO");
    s += ` ON CONFLICT (${keys.map(k => `"${k}"`).join(", ")}) ${setClause}`;
    return s;
  }

  // Everything else: return placeholder-converted SQL
  return s;
}

// ─────────────────────────────────────────────
// Query wrappers
// ─────────────────────────────────────────────

async function run(sql, params = []) {
  const q = toPg(sql);
  const res = await pool.query(q, params);
  return res;
}

async function get(sql, params = []) {
  const q = toPg(sql);
  const res = await pool.query(q, params);
  return res.rows[0] || null;
}

async function all(sql, params = []) {
  const q = toPg(sql);
  const res = await pool.query(q, params);
  return res.rows || [];
}

// ─────────────────────────────────────────────
// initDb: create tables
// ─────────────────────────────────────────────

async function initDb() {
  // Core XP table
  await run(`
    CREATE TABLE IF NOT EXISTS user_xp (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      xp INTEGER DEFAULT 0,
      level INTEGER DEFAULT 0,
      last_message_xp_at BIGINT DEFAULT 0,
      last_reaction_xp_at BIGINT DEFAULT 0,
      PRIMARY KEY (guild_id, user_id)
    )
  `);

  // Guild settings
  await run(`
    CREATE TABLE IF NOT EXISTS guild_settings (
      guild_id TEXT PRIMARY KEY,
      message_xp_min INTEGER DEFAULT 15,
      message_xp_max INTEGER DEFAULT 25,
      message_cooldown_seconds INTEGER DEFAULT 60,
      reaction_xp INTEGER DEFAULT 3,
      reaction_cooldown_seconds INTEGER DEFAULT 30,
      voice_xp_per_minute INTEGER DEFAULT 5,

      level_up_channel_id TEXT DEFAULT NULL,
      level_up_message TEXT DEFAULT NULL,

      claim_all_done INTEGER DEFAULT 0
    )
  `);

  // Level roles
  await run(`
    CREATE TABLE IF NOT EXISTS level_roles (
      guild_id TEXT NOT NULL,
      level INTEGER NOT NULL,
      role_id TEXT NOT NULL,
      PRIMARY KEY (guild_id, level)
    )
  `);

  // Ignored channels (for XP)
  await run(`
    CREATE TABLE IF NOT EXISTS ignored_channels (
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      channel_type TEXT NOT NULL,
      PRIMARY KEY (guild_id, channel_id)
    )
  `);

  // Birthdays
  await run(`
    CREATE TABLE IF NOT EXISTS user_birthdays (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      birth_month INTEGER NOT NULL,
      birth_day INTEGER NOT NULL,
      PRIMARY KEY (guild_id, user_id)
    )
  `);

  // Birthday settings
  await run(`
    CREATE TABLE IF NOT EXISTS birthday_settings (
      guild_id TEXT PRIMARY KEY,
      birthday_channel_id TEXT DEFAULT NULL,
      birthday_message TEXT DEFAULT '🎉 Happy Birthday {user}! 🎂 Hope you have an amazing day! 🎈'
    )
  `);

  // MEE6 snapshot table
  await run(`
    CREATE TABLE IF NOT EXISTS mee6_snapshot (
      guild_id TEXT NOT NULL,
      snapshot_username TEXT NOT NULL,
      snapshot_xp INTEGER NOT NULL,
      snapshot_level INTEGER NOT NULL,
      claimed_user_id TEXT DEFAULT NULL,
      claimed_at BIGINT DEFAULT NULL,
      PRIMARY KEY (guild_id, snapshot_username)
    )
  `);

  // Private voice rooms
  await run(`
    CREATE TABLE IF NOT EXISTS private_voice_rooms (
      guild_id TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      voice_channel_id TEXT NOT NULL,
      text_channel_id TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      last_active_at BIGINT NOT NULL,
      PRIMARY KEY (guild_id, voice_channel_id)
    )
  `);
}

module.exports = {
  initDb,
  run,
  get,
  all,
  DATABASE_URL
};