// src/db.js
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "bot.sqlite");

let _db = null;

function db() {
  if (_db) return _db;
  _db = new sqlite3.Database(DB_PATH);
  return _db;
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db().run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db().get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db().all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

async function initDb() {
  // ─────────────────────────────────────────────
  // Core XP table
  // ─────────────────────────────────────────────
  await run(`
    CREATE TABLE IF NOT EXISTS user_xp (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      xp INTEGER DEFAULT 0,
      level INTEGER DEFAULT 0,
      last_message_xp_at INTEGER DEFAULT 0,
      last_reaction_xp_at INTEGER DEFAULT 0,
      PRIMARY KEY (guild_id, user_id)
    )
  `);

  // ─────────────────────────────────────────────
  // Guild settings
  // ─────────────────────────────────────────────
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
      level_up_message TEXT DEFAULT NULL
    )
  `);

  // Backwards-compat: add columns if DB existed before these settings
  try {
    await run(`ALTER TABLE guild_settings ADD COLUMN level_up_channel_id TEXT`);
  } catch (_) {}
  try {
    await run(`ALTER TABLE guild_settings ADD COLUMN level_up_message TEXT`);
  } catch (_) {}

  // Optional: one-time claim-all lock flag (if commands.js uses it)
  try {
    await run(`ALTER TABLE guild_settings ADD COLUMN claim_all_done INTEGER DEFAULT 0`);
  } catch (_) {}

  // ─────────────────────────────────────────────
  // Level roles table (dashboard feature)
  // ─────────────────────────────────────────────
  await run(`
    CREATE TABLE IF NOT EXISTS level_roles (
      guild_id TEXT NOT NULL,
      level INTEGER NOT NULL,
      role_id TEXT NOT NULL,
      PRIMARY KEY (guild_id, level)
    )
  `);

  // ─────────────────────────────────────────────
  // MEE6 snapshot table (import source)
  // ─────────────────────────────────────────────
  await run(`
    CREATE TABLE IF NOT EXISTS mee6_snapshot (
      guild_id TEXT NOT NULL,
      snapshot_username TEXT NOT NULL,
      snapshot_xp INTEGER NOT NULL,
      snapshot_level INTEGER NOT NULL,
      claimed_user_id TEXT DEFAULT NULL,
      claimed_at INTEGER DEFAULT NULL,
      PRIMARY KEY (guild_id, snapshot_username)
    )
  `);

  // Backwards-compat: add columns if DB existed before claim tracking
  try { await run(`ALTER TABLE mee6_snapshot ADD COLUMN claimed_user_id TEXT`); } catch (_) {}
  try { await run(`ALTER TABLE mee6_snapshot ADD COLUMN claimed_at INTEGER`); } catch (_) {}

  // ─────────────────────────────────────────────
  // Private voice rooms
  // ─────────────────────────────────────────────
  // We keep created_at/last_active_at for future dashboard/stats,
  // and also add empty_since for the auto-delete behaviour.
  await run(`
    CREATE TABLE IF NOT EXISTS private_voice_rooms (
      guild_id TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      voice_channel_id TEXT NOT NULL,
      text_channel_id TEXT NOT NULL,
      created_at INTEGER DEFAULT 0,
      last_active_at INTEGER DEFAULT 0,
      empty_since INTEGER DEFAULT NULL,
      PRIMARY KEY (guild_id, voice_channel_id)
    )
  `);

  // Backwards-compat: upgrade older schemas
  try { await run(`ALTER TABLE private_voice_rooms ADD COLUMN created_at INTEGER DEFAULT 0`); } catch (_) {}
  try { await run(`ALTER TABLE private_voice_rooms ADD COLUMN last_active_at INTEGER DEFAULT 0`); } catch (_) {}
  try { await run(`ALTER TABLE private_voice_rooms ADD COLUMN empty_since INTEGER DEFAULT NULL`); } catch (_) {}
}

module.exports = {
  initDb,
  run,
  get,
  all,
  DB_PATH
};