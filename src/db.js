// src/db.js (Postgres version for Railway)
// Uses process.env.DATABASE_URL
// Keeps the same API: run/get/all/initDb

const { Pool } = require("pg");

// Railway provides DATABASE_URL automatically when you add Postgres
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error(
    "[db] FATAL: DATABASE_URL is not set. Add a Railway Postgres database or set DATABASE_URL environment variable."
  );
  process.exit(1);
}

console.log("[db] Initializing database connection pool...");

// Recommended for Railway: use SSL if provided; Railway usually works without extra SSL config,
// but leaving this as "auto" is safest.
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined,
  // Connection pool settings to handle timeouts better
  connectionTimeoutMillis: 30000,  // 30 seconds to establish connection
  idleTimeoutMillis: 30000,        // 30 seconds idle before closing
  max: 20,                          // Max connections in pool
  statement_timeout: 30000,         // Query timeout in milliseconds
  keepAlive: true
});

// Handle pool errors
pool.on("error", (err) => {
  console.error("[db] Unexpected error on idle client in pool:", err);
});

pool.on("connect", (client) => {
  console.log("[db] New client connected to database");
  client.on("error", (err) => {
    console.error("[db] Client connection error:", err?.message || err);
  });
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
// Test connection and initDb
// ─────────────────────────────────────────────

async function testConnection() {
  try {
    console.log("[db] Testing database connection...");
    const client = await pool.connect();
    const result = await client.query("SELECT NOW()");
    client.release();
    console.log("[db] ✓ Database connection successful:", result.rows[0]);
    return true;
  } catch (err) {
    console.error("[db] ✗ Failed to connect to database:");
    console.error("   Error:", err.message);
    if (err.code === "ENOTFOUND") {
      console.error("   → Host not found. Check DATABASE_URL hostname.");
    } else if (err.code === "ECONNREFUSED") {
      console.error("   → Connection refused. Is the database server running?");
    } else if (err.code === "ETIMEDOUT") {
      console.error("   → Connection timeout. Check network access to database.");
    }
    throw err;
  }
}

async function initDb() {
  try {
    console.log("[db] Initializing database tables...");
    
    // Test connection first
    await testConnection();

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
      command_prefix TEXT DEFAULT '!',
      new_account_warn_days INTEGER DEFAULT 1,
      mod_role_id TEXT DEFAULT NULL,
      log_channel_id TEXT DEFAULT NULL,

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

  // Customization unlocks (per-guild, per-option required level)
  await run(`
    CREATE TABLE IF NOT EXISTS customization_unlocks (
      guild_id TEXT NOT NULL,
      option TEXT NOT NULL,
      required_level INTEGER NOT NULL,
      PRIMARY KEY (guild_id, option)
    )
  `);

  // Moderation warnings
  await run(`
    CREATE TABLE IF NOT EXISTS mod_warnings (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      moderator_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_at BIGINT NOT NULL
    )
  `);

  // Logging exclusions (channels/categories to skip logging)
  await run(`
    CREATE TABLE IF NOT EXISTS logging_exclusions (
      guild_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      target_type TEXT NOT NULL,
      PRIMARY KEY (guild_id, target_id)
    )
  `);

  // Per-event logging controls (enabled + optional channel override)
  await run(`
    CREATE TABLE IF NOT EXISTS logging_event_configs (
      guild_id TEXT NOT NULL,
      event_key TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      channel_id TEXT DEFAULT NULL,
      PRIMARY KEY (guild_id, event_key)
    )
  `);

  // Excluded actors (users/roles) for log suppression
  await run(`
    CREATE TABLE IF NOT EXISTS logging_actor_exclusions (
      guild_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      target_type TEXT NOT NULL,
      PRIMARY KEY (guild_id, target_id)
    )
  `);

  // Reaction-role bindings (message + emoji -> role)
  await run(`
    CREATE TABLE IF NOT EXISTS reaction_role_bindings (
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      emoji_key TEXT NOT NULL,
      role_id TEXT NOT NULL,
      remove_on_unreact INTEGER NOT NULL DEFAULT 1,
      created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
      PRIMARY KEY (guild_id, message_id, emoji_key)
    )
  `);

  // Ticket system settings per guild
  await run(`
    CREATE TABLE IF NOT EXISTS ticket_settings (
      guild_id TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 0,
      panel_channel_id TEXT DEFAULT NULL,
      category_id TEXT DEFAULT NULL,
      support_role_id TEXT DEFAULT NULL,
      ticket_prefix TEXT DEFAULT 'ticket',
      panel_message_id TEXT DEFAULT NULL,
      ticket_log_channel_id TEXT DEFAULT NULL,
      ticket_transcript_channel_id TEXT DEFAULT NULL,
      save_transcript INTEGER NOT NULL DEFAULT 1,
      delete_on_close INTEGER NOT NULL DEFAULT 0
    )
  `);

  // Ticket instances
  await run(`
    CREATE TABLE IF NOT EXISTS tickets (
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      opener_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_at BIGINT NOT NULL,
      closed_at BIGINT DEFAULT NULL,
      closed_by TEXT DEFAULT NULL,
      PRIMARY KEY (guild_id, channel_id)
    )
  `);

  // User rank card customizations
  await run(`
    CREATE TABLE IF NOT EXISTS user_rankcard_customizations (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      font TEXT,
      fontcolor TEXT,
      gradient TEXT,
      bgimage TEXT,
      bgimage_data BYTEA,
      bgcolor TEXT,
      bgmode TEXT,
      border TEXT,
      avatarframe TEXT,
      avatarborder INTEGER DEFAULT 3,
      avatarbordercolor TEXT DEFAULT '#7bc96f',
      borderglow TEXT DEFAULT 'none',
      PRIMARY KEY (guild_id, user_id)
    )
  `);

  // Migrations: Add missing columns to existing tables
  try {
    await run(`ALTER TABLE user_rankcard_customizations ADD COLUMN IF NOT EXISTS avatarborder INTEGER DEFAULT 3`);
    await run(`ALTER TABLE user_rankcard_customizations ADD COLUMN IF NOT EXISTS avatarbordercolor TEXT DEFAULT '#7bc96f'`);
    await run(`ALTER TABLE user_rankcard_customizations ADD COLUMN IF NOT EXISTS borderglow TEXT DEFAULT 'none'`);
    await run(`ALTER TABLE user_rankcard_customizations ADD COLUMN IF NOT EXISTS bgmode TEXT`);
    await run(`ALTER TABLE user_rankcard_customizations ADD COLUMN IF NOT EXISTS bgimage_data BYTEA`);
    await run(`ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS command_prefix TEXT DEFAULT '!'`);
    await run(`ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS new_account_warn_days INTEGER DEFAULT 1`);
    await run(`ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS mod_role_id TEXT DEFAULT NULL`);
    await run(`ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS log_channel_id TEXT DEFAULT NULL`);
    await run(`ALTER TABLE ticket_settings ADD COLUMN IF NOT EXISTS panel_message_id TEXT DEFAULT NULL`);
    await run(`ALTER TABLE ticket_settings ADD COLUMN IF NOT EXISTS ticket_log_channel_id TEXT DEFAULT NULL`);
    await run(`ALTER TABLE ticket_settings ADD COLUMN IF NOT EXISTS ticket_transcript_channel_id TEXT DEFAULT NULL`);
    await run(`ALTER TABLE ticket_settings ADD COLUMN IF NOT EXISTS save_transcript INTEGER DEFAULT 1`);
    await run(`ALTER TABLE ticket_settings ADD COLUMN IF NOT EXISTS delete_on_close INTEGER DEFAULT 0`);
  } catch (e) {
    // Columns might already exist, ignore error
  }

  console.log("[db] ✓ All database tables initialized successfully");
  } catch (err) {
    console.error("[db] ✗ Failed to initialize database:");
    console.error(err);
    throw err;
  }
}

module.exports = {
  initDb,
  testConnection,
  run,
  get,
  all,
  DATABASE_URL
};
