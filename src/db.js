const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.join(__dirname, "..", "bot.sqlite");
const db = new sqlite3.Database(dbPath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function initDb() {
  // guild_settings
  try {
    await run(`ALTER TABLE guild_settings ADD COLUMN level_up_channel_id TEXT`);
  } catch (_) {}

  try {
    await run(
      `ALTER TABLE guild_settings ADD COLUMN level_up_message TEXT DEFAULT '🎉 {user} leveled up to **Level {level}**!'`
    );
  } catch (_) {}
  
  // XP / levels
    await run(`
    CREATE TABLE IF NOT EXISTS guild_settings (
      guild_id TEXT PRIMARY KEY,
      message_xp_min INTEGER NOT NULL DEFAULT 15,
      message_xp_max INTEGER NOT NULL DEFAULT 25,
      message_cooldown_seconds INTEGER NOT NULL DEFAULT 60,
      reaction_xp INTEGER NOT NULL DEFAULT 3,
      reaction_cooldown_seconds INTEGER NOT NULL DEFAULT 30,
      voice_xp_per_minute INTEGER NOT NULL DEFAULT 5
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS level_roles (
      guild_id TEXT NOT NULL,
      level INTEGER NOT NULL,
      role_id TEXT NOT NULL,
      PRIMARY KEY (guild_id, level)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS user_xp (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      xp INTEGER NOT NULL DEFAULT 0,
      level INTEGER NOT NULL DEFAULT 0,
      last_message_xp_at INTEGER NOT NULL DEFAULT 0,
      last_reaction_xp_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, user_id)
    )
  `);

  // MEE6 snapshot (username -> xp/level) and claim mapping to stable Discord IDs
  await run(`
    CREATE TABLE IF NOT EXISTS mee6_snapshot (
      guild_id TEXT NOT NULL,
      mee6_name TEXT NOT NULL,
      xp INTEGER NOT NULL,
      level INTEGER NOT NULL,
      claimed_user_id TEXT,
      PRIMARY KEY (guild_id, mee6_name)
    )
  `);

  // Temp private VC tracking
  await run(`
    CREATE TABLE IF NOT EXISTS private_rooms (
      guild_id TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      voice_id TEXT NOT NULL,
      text_id TEXT NOT NULL,
      empty_since INTEGER,
      PRIMARY KEY (guild_id, voice_id)
    )
  `);
}

module.exports = { db, run, get, all, initDb };
