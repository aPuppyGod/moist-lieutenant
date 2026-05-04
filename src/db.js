// src/db.js (Postgres version for Railway)
// Uses process.env.DATABASE_URL
// Keeps the same API: run/get/all/initDb

const { Pool, types } = require("pg");

// Parse BIGINT (int8) columns as numbers so arithmetic in command handlers
// does not concatenate strings (e.g. "100" + 50 => "10050").
types.setTypeParser(20, (value) => Number(value));

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
      anti_nuke_enabled INTEGER DEFAULT 1,
      anti_nuke_auto_unlock_minutes INTEGER DEFAULT 0,
      anti_nuke_window_seconds INTEGER DEFAULT 30,
      anti_nuke_cooldown_minutes INTEGER DEFAULT 10,
      anti_nuke_channel_delete_threshold INTEGER DEFAULT 3,
      anti_nuke_role_delete_threshold INTEGER DEFAULT 3,
      anti_nuke_ban_add_threshold INTEGER DEFAULT 4,
      anti_nuke_lock_manage_channels INTEGER DEFAULT 1,
      anti_nuke_lock_manage_roles INTEGER DEFAULT 1,
      anti_nuke_lock_ban_members INTEGER DEFAULT 1,
      anti_nuke_lock_kick_members INTEGER DEFAULT 1,
      anti_nuke_lock_manage_webhooks INTEGER DEFAULT 1,
      anti_nuke_alert_channel_id TEXT DEFAULT NULL,
      anti_nuke_alert_role_id TEXT DEFAULT NULL,
      log_channel_id TEXT DEFAULT NULL,
      log_summary_cards_enabled INTEGER DEFAULT 1,
      log_quick_mod_actions_enabled INTEGER DEFAULT 1,
      social_default_channel_id TEXT DEFAULT NULL,

      level_up_channel_id TEXT DEFAULT NULL,
      level_up_message TEXT DEFAULT NULL,

      member_count_channel_id TEXT DEFAULT NULL,

      modmail_enabled INTEGER DEFAULT 0,
      modmail_channel_id TEXT DEFAULT NULL,
      modmail_category_id TEXT DEFAULT NULL,
      modmail_support_role_id TEXT DEFAULT NULL,
      warn_points_timeout_threshold INTEGER DEFAULT 3,
      warn_points_kick_threshold INTEGER DEFAULT 5,
      warn_points_ban_threshold INTEGER DEFAULT 7,
      warn_timeout_minutes INTEGER DEFAULT 60,
      snipe_enabled INTEGER DEFAULT 1,
      snipe_retention_minutes INTEGER DEFAULT 1440,
      afk_enabled INTEGER DEFAULT 1,

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
      points INTEGER NOT NULL DEFAULT 1,
      created_at BIGINT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS temp_roles (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role_id TEXT NOT NULL,
      moderator_id TEXT DEFAULT NULL,
      reason TEXT DEFAULT NULL,
      created_at BIGINT NOT NULL,
      expires_at BIGINT NOT NULL,
      completed INTEGER DEFAULT 0,
      completed_at BIGINT DEFAULT NULL,
      UNIQUE (guild_id, user_id, role_id, expires_at)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS user_afk_status (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      reason TEXT DEFAULT NULL,
      afk_at BIGINT NOT NULL,
      PRIMARY KEY (guild_id, user_id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS snipe_messages (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      author_id TEXT DEFAULT NULL,
      content TEXT DEFAULT NULL,
      attachments_json TEXT DEFAULT '[]',
      deleted_at BIGINT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS edit_snipes (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      author_id TEXT DEFAULT NULL,
      before_content TEXT DEFAULT NULL,
      after_content TEXT DEFAULT NULL,
      attachments_json TEXT DEFAULT '[]',
      edited_at BIGINT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS modmail_threads (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_at BIGINT NOT NULL,
      last_message_at BIGINT NOT NULL,
      closed_at BIGINT DEFAULT NULL
    )
  `);

  // Moderation logs (all mod actions)
  await run(`
    CREATE TABLE IF NOT EXISTS mod_logs (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      moderator_id TEXT NOT NULL,
      action TEXT NOT NULL,
      reason TEXT,
      details TEXT,
      created_at BIGINT NOT NULL
    )
  `);

  // Anti-nuke incidents (trigger + unlock audit history)
  await run(`
    CREATE TABLE IF NOT EXISTS anti_nuke_incidents (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      incident_type TEXT NOT NULL,
      event_type TEXT DEFAULT NULL,
      actor_user_id TEXT DEFAULT NULL,
      initiated_by_user_id TEXT DEFAULT NULL,
      details TEXT DEFAULT NULL,
      created_at BIGINT NOT NULL
    )
  `);

  // Anti-nuke scheduled unlock jobs
  await run(`
    CREATE TABLE IF NOT EXISTS anti_nuke_unlock_jobs (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      run_at BIGINT NOT NULL,
      unlock_perms_json TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      executed_at BIGINT DEFAULT NULL
    )
  `);

  // Anti-nuke trusted actor exemptions (users/roles)
  await run(`
    CREATE TABLE IF NOT EXISTS anti_nuke_exemptions (
      guild_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      target_type TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      PRIMARY KEY (guild_id, target_id)
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

  // Social link sources (YouTube/Twitch/TikTok/Twitter/etc.)
  await run(`
    CREATE TABLE IF NOT EXISTS social_links (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      external_id TEXT NOT NULL,
      source_url TEXT DEFAULT NULL,
      label TEXT DEFAULT NULL,
      channel_id TEXT DEFAULT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_by TEXT DEFAULT NULL,
      created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
      last_checked_at BIGINT DEFAULT NULL,
      UNIQUE (guild_id, platform, external_id)
    )
  `);

  // Per-link event routing and templates
  await run(`
    CREATE TABLE IF NOT EXISTS social_link_rules (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      link_id BIGINT NOT NULL,
      event_type TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      channel_id TEXT DEFAULT NULL,
      role_id TEXT DEFAULT NULL,
      message_template TEXT DEFAULT NULL,
      created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
      updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
      UNIQUE (link_id, event_type)
    )
  `);

  // Deduped social announcements already sent
  await run(`
    CREATE TABLE IF NOT EXISTS social_announcements (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      link_id BIGINT NOT NULL,
      event_type TEXT NOT NULL,
      event_uid TEXT NOT NULL,
      posted_message_id TEXT DEFAULT NULL,
      sent_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
      UNIQUE (link_id, event_uid)
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
      mode TEXT NOT NULL DEFAULT 'toggle',
      created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
      PRIMARY KEY (guild_id, message_id, emoji_key, role_id)
    )
  `);

  // Migrate old PRIMARY KEY if needed
  try {
    await run(`
      DO $$
      BEGIN
        -- Check if old constraint exists and update it
        IF EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'reaction_role_bindings_pkey' 
          AND conkey = ARRAY[
            (SELECT attnum FROM pg_attribute WHERE attrelid = 'reaction_role_bindings'::regclass AND attname = 'guild_id'),
            (SELECT attnum FROM pg_attribute WHERE attrelid = 'reaction_role_bindings'::regclass AND attname = 'message_id'),
            (SELECT attnum FROM pg_attribute WHERE attrelid = 'reaction_role_bindings'::regclass AND attname = 'emoji_key')
          ]
        ) THEN
          -- Drop old constraint and add new one
          ALTER TABLE reaction_role_bindings DROP CONSTRAINT reaction_role_bindings_pkey;
          ALTER TABLE reaction_role_bindings ADD PRIMARY KEY (guild_id, message_id, emoji_key, role_id);
        END IF;
      END $$;
    `);
  } catch (err) {
    console.error('Primary key migration info:', err.message);
  }

  // Migrate old remove_on_unreact column to mode column if it exists
  try {
    await run(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'reaction_role_bindings' AND column_name = 'remove_on_unreact'
        ) THEN
          -- Add mode column if needed (shouldn't be needed in fresh installs)
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'reaction_role_bindings' AND column_name = 'mode'
          ) THEN
            ALTER TABLE reaction_role_bindings ADD COLUMN mode TEXT DEFAULT 'toggle';
          END IF;
          
          -- Migrate data: remove_on_unreact=1 -> toggle, remove_on_unreact=0 -> add
          UPDATE reaction_role_bindings 
          SET mode = CASE WHEN remove_on_unreact = 1 THEN 'toggle' ELSE 'add' END 
          WHERE mode IS NULL;
          
          -- Drop old column
          ALTER TABLE reaction_role_bindings DROP COLUMN remove_on_unreact;
        END IF;
      END $$;
    `);
  } catch (err) {
    console.error('Migration warning (non-critical):', err.message);
  }

  // Reaction role questions (for multi-option role selection)
  await run(`
    CREATE TABLE IF NOT EXISTS reaction_role_questions (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      question_text TEXT NOT NULL,
      channel_id TEXT DEFAULT NULL,
      message_id TEXT DEFAULT NULL,
      created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
      updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
    )
  `);

  // Reaction role options (answers to questions)
  await run(`
    CREATE TABLE IF NOT EXISTS reaction_role_options (
      id BIGSERIAL PRIMARY KEY,
      question_id BIGINT NOT NULL,
      emoji TEXT NOT NULL,
      label TEXT NOT NULL,
      description TEXT,
      role_ids TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (question_id) REFERENCES reaction_role_questions(id) ON DELETE CASCADE
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
      delete_on_close INTEGER NOT NULL DEFAULT 0,
      sla_first_response_minutes INTEGER NOT NULL DEFAULT 0,
      sla_escalation_minutes INTEGER NOT NULL DEFAULT 0,
      sla_escalation_role_id TEXT DEFAULT NULL
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
      last_activity_at BIGINT NOT NULL,
      sla_reminder_sent_at BIGINT DEFAULT NULL,
      sla_escalated_at BIGINT DEFAULT NULL,
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

  // Welcome/Goodbye messages
  await run(`
    CREATE TABLE IF NOT EXISTS welcome_goodbye_settings (
      guild_id TEXT PRIMARY KEY,
      welcome_enabled INTEGER NOT NULL DEFAULT 0,
      welcome_channel_id TEXT DEFAULT NULL,
      welcome_message TEXT DEFAULT 'Welcome {user} to {server}!',
      welcome_embed INTEGER NOT NULL DEFAULT 1,
      welcome_embed_color TEXT DEFAULT '#7bc96f',
      goodbye_enabled INTEGER NOT NULL DEFAULT 0,
      goodbye_channel_id TEXT DEFAULT NULL,
      goodbye_message TEXT DEFAULT 'Goodbye {user}!',
      goodbye_embed INTEGER NOT NULL DEFAULT 1,
      goodbye_embed_color TEXT DEFAULT '#8b7355'
    )
  `);

  // Auto-roles (roles given on join)
  await run(`
    CREATE TABLE IF NOT EXISTS auto_roles (
      guild_id TEXT NOT NULL,
      role_id TEXT NOT NULL,
      created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
      PRIMARY KEY (guild_id, role_id)
    )
  `);

  // Auto-moderation settings
  await run(`
    CREATE TABLE IF NOT EXISTS automod_settings (
      guild_id TEXT PRIMARY KEY,
      spam_enabled INTEGER NOT NULL DEFAULT 0,
      spam_messages INTEGER DEFAULT 5,
      spam_interval INTEGER DEFAULT 5,
      spam_action TEXT DEFAULT 'warn',
      invites_enabled INTEGER NOT NULL DEFAULT 0,
      invites_action TEXT DEFAULT 'delete',
      invites_whitelist TEXT DEFAULT NULL,
      links_enabled INTEGER NOT NULL DEFAULT 0,
      links_action TEXT DEFAULT 'delete',
      links_whitelist TEXT DEFAULT NULL,
      caps_enabled INTEGER NOT NULL DEFAULT 0,
      caps_percentage INTEGER DEFAULT 70,
      caps_action TEXT DEFAULT 'delete',
      mentions_enabled INTEGER NOT NULL DEFAULT 0,
      mentions_max INTEGER DEFAULT 5,
      mentions_action TEXT DEFAULT 'warn',
      attach_spam_enabled INTEGER NOT NULL DEFAULT 0,
      attach_spam_max INTEGER DEFAULT 3,
      attach_spam_interval INTEGER DEFAULT 5,
      attach_spam_action TEXT DEFAULT 'warn'
    )
  `);

  // Suggestions system
  await run(`
    CREATE TABLE IF NOT EXISTS suggestion_settings (
      guild_id TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 0,
      channel_id TEXT DEFAULT NULL,
      review_channel_id TEXT DEFAULT NULL,
      require_review INTEGER NOT NULL DEFAULT 0
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS suggestions (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      content TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      message_id TEXT DEFAULT NULL,
      review_message_id TEXT DEFAULT NULL,
      published_message_id TEXT DEFAULT NULL,
      upvotes INTEGER DEFAULT 0,
      downvotes INTEGER DEFAULT 0,
      staff_response TEXT DEFAULT NULL,
      created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
    )
  `);

  // Starboard
  await run(`
    CREATE TABLE IF NOT EXISTS starboard_settings (
      guild_id TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 0,
      channel_id TEXT DEFAULT NULL,
      threshold INTEGER DEFAULT 3,
      emoji TEXT DEFAULT '⭐',
      self_star INTEGER NOT NULL DEFAULT 0
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS starboard_messages (
      guild_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      starboard_message_id TEXT DEFAULT NULL,
      star_count INTEGER DEFAULT 0,
      PRIMARY KEY (guild_id, message_id)
    )
  `);

  // Giveaways
  await run(`
    CREATE TABLE IF NOT EXISTS giveaways (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      message_id TEXT DEFAULT NULL,
      host_id TEXT NOT NULL,
      prize TEXT NOT NULL,
      winners_count INTEGER DEFAULT 1,
      end_time BIGINT NOT NULL,
      ended INTEGER DEFAULT 0,
      winner_ids TEXT DEFAULT NULL,
      created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
    )
  `);

  // Polls
  await run(`
    CREATE TABLE IF NOT EXISTS polls (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      message_id TEXT DEFAULT NULL,
      creator_id TEXT NOT NULL,
      question TEXT NOT NULL,
      options TEXT NOT NULL,
      end_time BIGINT DEFAULT NULL,
      ended INTEGER DEFAULT 0,
      allow_multiple INTEGER DEFAULT 0,
      created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS poll_votes (
      poll_id BIGINT NOT NULL,
      user_id TEXT NOT NULL,
      option_index INTEGER NOT NULL,
      created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
      PRIMARY KEY (poll_id, user_id, option_index)
    )
  `);

  // Reaction Roles
  await run(`
    CREATE TABLE IF NOT EXISTS reaction_roles (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      emoji TEXT NOT NULL,
      role_id TEXT NOT NULL,
      created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
      UNIQUE (message_id, emoji)
    )
  `);

  // Economy
  await run(`
    CREATE TABLE IF NOT EXISTS user_economy (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      balance BIGINT DEFAULT 0,
      bank BIGINT DEFAULT 0,
      last_daily BIGINT DEFAULT 0,
      last_weekly BIGINT DEFAULT 0,
      daily_streak INTEGER DEFAULT 0,
      daily_streak_date TEXT DEFAULT NULL,
      job_id TEXT DEFAULT NULL,
      job_shifts_completed INTEGER DEFAULT 0,
      job_weekly_shifts INTEGER DEFAULT 0,
      job_last_shift BIGINT DEFAULT 0,
      job_week_reset BIGINT DEFAULT 0,
      created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
      PRIMARY KEY (guild_id, user_id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS economy_transactions (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      amount BIGINT NOT NULL,
      description TEXT,
      created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS economy_settings (
      guild_id TEXT PRIMARY KEY,
      currency_name TEXT DEFAULT 'coins',
      currency_symbol TEXT DEFAULT '🪙',
      daily_amount INTEGER DEFAULT 300,
      daily_streak_bonus INTEGER DEFAULT 50,
      weekly_amount INTEGER DEFAULT 2500,
      rob_enabled INTEGER DEFAULT 1,
      rob_cooldown INTEGER DEFAULT 3600,
      economy_prefix TEXT DEFAULT '$',
      economy_guide TEXT DEFAULT '',
      enabled INTEGER DEFAULT 1
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS economy_jobs (
      id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      pay_min INTEGER DEFAULT 50,
      pay_max INTEGER DEFAULT 100,
      required_shifts INTEGER DEFAULT 0,
      weekly_shifts_required INTEGER DEFAULT 3,
      created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS economy_shop_items (
      id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      price INTEGER NOT NULL,
      item_type TEXT DEFAULT 'misc',
      item_data TEXT DEFAULT NULL,
      created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS custom_commands (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      command_name TEXT NOT NULL,
      response_text TEXT NOT NULL,
      gifs TEXT DEFAULT '[]',
      responses TEXT DEFAULT NULL,
      target_mode TEXT DEFAULT 'none',
      created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
      created_by TEXT NOT NULL,
      UNIQUE(guild_id, command_name)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS auto_replies (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      trigger_message TEXT NOT NULL,
      response_type TEXT NOT NULL DEFAULT 'text',
      responses TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      created_by TEXT NOT NULL,
      created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS uploaded_media (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      storage_key TEXT NOT NULL UNIQUE,
      mime_type TEXT NOT NULL,
      data_base64 TEXT NOT NULL,
      created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS user_inventory (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      quantity INTEGER DEFAULT 1,
      acquired_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
      PRIMARY KEY (guild_id, user_id, item_id)
    )
  `);

  // Reminders
  await run(`
    CREATE TABLE IF NOT EXISTS reminders (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      guild_id TEXT DEFAULT NULL,
      channel_id TEXT DEFAULT NULL,
      reminder_text TEXT NOT NULL,
      remind_at BIGINT NOT NULL,
      created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
      completed INTEGER DEFAULT 0
    )
  `);

  // Temporary bans (auto-unban scheduler source)
  await run(`
    CREATE TABLE IF NOT EXISTS temp_bans (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      moderator_id TEXT DEFAULT NULL,
      reason TEXT DEFAULT NULL,
      ban_at BIGINT NOT NULL,
      unban_at BIGINT NOT NULL,
      completed INTEGER DEFAULT 0,
      completed_at BIGINT DEFAULT NULL,
      UNIQUE (guild_id, user_id, unban_at)
    )
  `);

  // Birthdays
  await run(`
    CREATE TABLE IF NOT EXISTS birthdays (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      birth_month INTEGER NOT NULL,
      birth_day INTEGER NOT NULL,
      birth_year INTEGER DEFAULT NULL,
      created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
      PRIMARY KEY (guild_id, user_id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS birthday_settings (
      guild_id TEXT PRIMARY KEY,
      enabled INTEGER DEFAULT 1,
      channel_id TEXT DEFAULT NULL,
      message TEXT DEFAULT 'Happy birthday {user}! 🎂🎉',
      role_id TEXT DEFAULT NULL
    )
  `);

  // Migrations: Add missing columns to existing tables
  try {
    await run(`ALTER TABLE birthdays ADD COLUMN IF NOT EXISTS last_wished_year INTEGER DEFAULT NULL`);
    // Seed last_wished_year for today's birthdays so a fresh deploy doesn't re-send messages already sent today
    await run(`
      UPDATE birthdays
      SET last_wished_year = EXTRACT(YEAR FROM NOW())::INTEGER
      WHERE last_wished_year IS NULL
        AND birth_month = EXTRACT(MONTH FROM NOW())::INTEGER
        AND birth_day   = EXTRACT(DAY   FROM NOW())::INTEGER
    `);
    await run(`ALTER TABLE user_rankcard_customizations ADD COLUMN IF NOT EXISTS avatarborder INTEGER DEFAULT 3`);
    await run(`ALTER TABLE user_rankcard_customizations ADD COLUMN IF NOT EXISTS avatarbordercolor TEXT DEFAULT '#7bc96f'`);
    await run(`ALTER TABLE user_rankcard_customizations ADD COLUMN IF NOT EXISTS borderglow TEXT DEFAULT 'none'`);
    await run(`ALTER TABLE user_rankcard_customizations ADD COLUMN IF NOT EXISTS bgmode TEXT`);
    await run(`ALTER TABLE user_rankcard_customizations ADD COLUMN IF NOT EXISTS bgimage_data BYTEA`);
    await run(`ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS command_prefix TEXT DEFAULT '!'`);
    await run(`ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS new_account_warn_days INTEGER DEFAULT 1`);
    await run(`ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS mod_role_id TEXT DEFAULT NULL`);
    await run(`ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS anti_nuke_enabled INTEGER DEFAULT 1`);
    await run(`ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS anti_nuke_auto_unlock_minutes INTEGER DEFAULT 0`);
    await run(`ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS anti_nuke_window_seconds INTEGER DEFAULT 30`);
    await run(`ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS anti_nuke_cooldown_minutes INTEGER DEFAULT 10`);
    await run(`ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS anti_nuke_channel_delete_threshold INTEGER DEFAULT 3`);
    await run(`ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS anti_nuke_role_delete_threshold INTEGER DEFAULT 3`);
    await run(`ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS anti_nuke_ban_add_threshold INTEGER DEFAULT 4`);
    await run(`ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS anti_nuke_lock_manage_channels INTEGER DEFAULT 1`);
    await run(`ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS anti_nuke_lock_manage_roles INTEGER DEFAULT 1`);
    await run(`ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS anti_nuke_lock_ban_members INTEGER DEFAULT 1`);
    await run(`ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS anti_nuke_lock_kick_members INTEGER DEFAULT 1`);
    await run(`ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS anti_nuke_lock_manage_webhooks INTEGER DEFAULT 1`);
    await run(`ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS anti_nuke_alert_channel_id TEXT DEFAULT NULL`);
    await run(`ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS anti_nuke_alert_role_id TEXT DEFAULT NULL`);
    await run(`ALTER TABLE custom_commands ADD COLUMN IF NOT EXISTS responses TEXT DEFAULT NULL`);
    await run(`ALTER TABLE custom_commands ADD COLUMN IF NOT EXISTS target_mode TEXT DEFAULT 'none'`);

    await run(`
      UPDATE custom_commands
      SET responses = json_build_object(
        'target_mode', COALESCE(target_mode, 'none'),
        'responses', json_build_array(
          json_build_object(
            'text', COALESCE(response_text, ''),
            'gifs', CASE
              WHEN gifs IS NULL OR btrim(gifs) = '' THEN '[]'::json
              ELSE gifs::json
            END
          )
        )
      )::text
      WHERE (responses IS NULL OR btrim(responses) = '')
    `);
    await run(`ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS log_channel_id TEXT DEFAULT NULL`);
    await run(`ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS log_summary_cards_enabled INTEGER DEFAULT 1`);
    await run(`ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS log_quick_mod_actions_enabled INTEGER DEFAULT 1`);
    await run(`ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS social_default_channel_id TEXT DEFAULT NULL`);
    await run(`ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS member_count_channel_id TEXT DEFAULT NULL`);
    await run(`ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS modmail_enabled INTEGER DEFAULT 0`);
    await run(`ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS modmail_channel_id TEXT DEFAULT NULL`);
    await run(`ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS modmail_category_id TEXT DEFAULT NULL`);
    await run(`ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS modmail_support_role_id TEXT DEFAULT NULL`);
    await run(`ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS warn_points_timeout_threshold INTEGER DEFAULT 3`);
    await run(`ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS warn_points_kick_threshold INTEGER DEFAULT 5`);
    await run(`ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS warn_points_ban_threshold INTEGER DEFAULT 7`);
    await run(`ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS warn_timeout_minutes INTEGER DEFAULT 60`);
    await run(`ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS snipe_enabled INTEGER DEFAULT 1`);
    await run(`ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS snipe_retention_minutes INTEGER DEFAULT 1440`);
    await run(`ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS afk_enabled INTEGER DEFAULT 1`);
    await run(`ALTER TABLE mod_warnings ADD COLUMN IF NOT EXISTS points INTEGER DEFAULT 1`);
    await run(`ALTER TABLE ticket_settings ADD COLUMN IF NOT EXISTS panel_message_id TEXT DEFAULT NULL`);
    await run(`ALTER TABLE ticket_settings ADD COLUMN IF NOT EXISTS ticket_log_channel_id TEXT DEFAULT NULL`);
    await run(`ALTER TABLE ticket_settings ADD COLUMN IF NOT EXISTS ticket_transcript_channel_id TEXT DEFAULT NULL`);
    await run(`ALTER TABLE ticket_settings ADD COLUMN IF NOT EXISTS save_transcript INTEGER DEFAULT 1`);
    await run(`ALTER TABLE ticket_settings ADD COLUMN IF NOT EXISTS delete_on_close INTEGER DEFAULT 0`);
    await run(`ALTER TABLE ticket_settings ADD COLUMN IF NOT EXISTS sla_first_response_minutes INTEGER DEFAULT 0`);
    await run(`ALTER TABLE ticket_settings ADD COLUMN IF NOT EXISTS sla_escalation_minutes INTEGER DEFAULT 0`);
    await run(`ALTER TABLE ticket_settings ADD COLUMN IF NOT EXISTS sla_escalation_role_id TEXT DEFAULT NULL`);
    await run(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS last_activity_at BIGINT`);
    await run(`UPDATE tickets SET last_activity_at=created_at WHERE last_activity_at IS NULL`);
    await run(`ALTER TABLE tickets ALTER COLUMN last_activity_at SET NOT NULL`);
    await run(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS sla_reminder_sent_at BIGINT DEFAULT NULL`);
    await run(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS sla_escalated_at BIGINT DEFAULT NULL`);
    
    // Economy system migrations
    await run(`ALTER TABLE user_economy ADD COLUMN IF NOT EXISTS daily_streak INTEGER DEFAULT 0`);
    await run(`ALTER TABLE user_economy ADD COLUMN IF NOT EXISTS daily_streak_date TEXT DEFAULT NULL`);
    await run(`ALTER TABLE user_economy ADD COLUMN IF NOT EXISTS job_id TEXT DEFAULT NULL`);
    await run(`ALTER TABLE user_economy ADD COLUMN IF NOT EXISTS job_shifts_completed INTEGER DEFAULT 0`);
    await run(`ALTER TABLE user_economy ADD COLUMN IF NOT EXISTS job_weekly_shifts INTEGER DEFAULT 0`);
    await run(`ALTER TABLE user_economy ADD COLUMN IF NOT EXISTS job_last_shift BIGINT DEFAULT 0`);
    await run(`ALTER TABLE user_economy ADD COLUMN IF NOT EXISTS job_week_reset BIGINT DEFAULT 0`);
    await run(`ALTER TABLE economy_settings ADD COLUMN IF NOT EXISTS daily_streak_bonus INTEGER DEFAULT 10`);
    await run(`ALTER TABLE economy_settings ADD COLUMN IF NOT EXISTS rob_enabled INTEGER DEFAULT 1`);
    await run(`ALTER TABLE economy_settings ADD COLUMN IF NOT EXISTS rob_cooldown INTEGER DEFAULT 3600`);
    await run(`ALTER TABLE economy_settings ADD COLUMN IF NOT EXISTS economy_prefix TEXT DEFAULT '$'`);
    await run(`ALTER TABLE economy_settings ADD COLUMN IF NOT EXISTS economy_guide TEXT DEFAULT ''`);
    await run(`ALTER TABLE suggestion_settings ADD COLUMN IF NOT EXISTS review_channel_id TEXT DEFAULT NULL`);

    // Minigames system
    await run(`ALTER TABLE user_economy ADD COLUMN IF NOT EXISTS last_normal_rob BIGINT DEFAULT 0`);
    await run(`ALTER TABLE user_economy ADD COLUMN IF NOT EXISTS last_bank_rob BIGINT DEFAULT 0`);
    await run(`ALTER TABLE user_inventory ADD COLUMN IF NOT EXISTS equipped INTEGER DEFAULT 0`);
    await run(`ALTER TABLE economy_shop_items ADD COLUMN IF NOT EXISTS item_id TEXT`);
    await run(`ALTER TABLE economy_shop_items ADD COLUMN IF NOT EXISTS use_effect TEXT DEFAULT NULL`);
    await run(`ALTER TABLE economy_shop_items ADD COLUMN IF NOT EXISTS item_image_url TEXT DEFAULT NULL`);
    await run(`UPDATE economy_shop_items SET item_id=id WHERE item_id IS NULL`);
    await run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_economy_shop_items_guild_item_id ON economy_shop_items (guild_id, item_id)`);

    // Minigames stats table
    await run(`
      CREATE TABLE IF NOT EXISTS minigames_stats (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        minigame TEXT NOT NULL,
        stat_name TEXT NOT NULL,
        stat_value BIGINT DEFAULT 0,
        last_played BIGINT DEFAULT NULL,
        created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        PRIMARY KEY (guild_id, user_id, minigame, stat_name)
      )
    `);

    // Robbery attempt logs
    await run(`
      CREATE TABLE IF NOT EXISTS robbery_attempts (
        id BIGSERIAL PRIMARY KEY,
        guild_id TEXT NOT NULL,
        robber_id TEXT NOT NULL,
        victim_id TEXT,
        robbery_type TEXT NOT NULL,
        success INTEGER NOT NULL,
        amount_stolen BIGINT DEFAULT 0,
        attempted_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
      )
    `);

    // Story/Adventure system
    await run(`
      CREATE TABLE IF NOT EXISTS story_progress (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        story_id TEXT NOT NULL,
        chapter INTEGER DEFAULT 1,
        choices TEXT DEFAULT '[]',
        completed INTEGER DEFAULT 0,
        last_updated BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        PRIMARY KEY (guild_id, user_id, story_id)
      )
    `);

    // Character stats and abilities
    await run(`
      CREATE TABLE IF NOT EXISTS character_stats (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        stat_name TEXT NOT NULL,
        stat_value INTEGER DEFAULT 0,
        created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        PRIMARY KEY (guild_id, user_id, stat_name)
      )
    `);

    // Active effects and buffs
    await run(`
      CREATE TABLE IF NOT EXISTS active_effects (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        effect_id TEXT NOT NULL,
        effect_type TEXT NOT NULL,
        duration BIGINT DEFAULT NULL,
        stacks INTEGER DEFAULT 1,
        applied_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        PRIMARY KEY (guild_id, user_id, effect_id)
      )
    `);

    // Swamp exploration zones
    await run(`
      CREATE TABLE IF NOT EXISTS swamp_zones (
        zone_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        danger_level INTEGER DEFAULT 1,
        required_level INTEGER DEFAULT 1,
        rewards TEXT DEFAULT '[]',
        encounters TEXT DEFAULT '[]'
      )
    `);

    // User zone progress
    await run(`
      CREATE TABLE IF NOT EXISTS zone_progress (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        zone_id TEXT NOT NULL,
        visits INTEGER DEFAULT 0,
        discoveries TEXT DEFAULT '[]',
        last_visited BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        PRIMARY KEY (guild_id, user_id, zone_id)
      )
    `);
    await run(`ALTER TABLE suggestion_settings ADD COLUMN IF NOT EXISTS require_review INTEGER DEFAULT 0`);
    await run(`ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS review_message_id TEXT DEFAULT NULL`);
    await run(`ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS published_message_id TEXT DEFAULT NULL`);
    await run(`CREATE TABLE IF NOT EXISTS temp_bans (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      moderator_id TEXT DEFAULT NULL,
      reason TEXT DEFAULT NULL,
      ban_at BIGINT NOT NULL,
      unban_at BIGINT NOT NULL,
      completed INTEGER DEFAULT 0,
      completed_at BIGINT DEFAULT NULL,
      UNIQUE (guild_id, user_id, unban_at)
    )`);

    // ── Lore Economy Upgrade ───────────────────────────────────────────────────

    // Player class selection (Murk Classes)
    await run(`
      CREATE TABLE IF NOT EXISTS user_class (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        class_id TEXT NOT NULL,
        chosen_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        PRIMARY KEY (guild_id, user_id)
      )
    `);

    // Dark Bazaar daily stock (per guild, refreshes daily)
    await run(`
      CREATE TABLE IF NOT EXISTS dark_bazaar_stock (
        guild_id TEXT NOT NULL,
        date_key TEXT NOT NULL,
        items_json TEXT NOT NULL DEFAULT '[]',
        PRIMARY KEY (guild_id, date_key)
      )
    `);

    // Bounty board
    await run(`
      CREATE TABLE IF NOT EXISTS bounties (
        id BIGSERIAL PRIMARY KEY,
        guild_id TEXT NOT NULL,
        poster_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        amount BIGINT NOT NULL,
        posted_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        expires_at BIGINT NOT NULL,
        claimed_by TEXT DEFAULT NULL,
        claimed_at BIGINT DEFAULT NULL,
        status TEXT NOT NULL DEFAULT 'active'
      )
    `);

    // Prestige log
    await run(`
      CREATE TABLE IF NOT EXISTS prestige_log (
        id BIGSERIAL PRIMARY KEY,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        prestige_level INTEGER NOT NULL,
        prestiged_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
      )
    `);

    // Prestige level and lifetime earnings on user_economy
    await run(`ALTER TABLE user_economy ADD COLUMN IF NOT EXISTS prestige_level INTEGER DEFAULT 0`);
    await run(`ALTER TABLE user_economy ADD COLUMN IF NOT EXISTS total_earned BIGINT DEFAULT 0`);
    await run(`ALTER TABLE user_economy ADD COLUMN IF NOT EXISTS weekly_streak INTEGER DEFAULT 0`);
    await run(`ALTER TABLE user_economy ADD COLUMN IF NOT EXISTS last_passive_regen_at BIGINT DEFAULT 0`);
    await run(`ALTER TABLE user_economy ADD COLUMN IF NOT EXISTS work_streak INTEGER DEFAULT 0`);
    await run(`ALTER TABLE user_economy ADD COLUMN IF NOT EXISTS last_work_day TEXT DEFAULT NULL`);

    // Active timed buffs (from crafted items like swamp_tonic)
    await run(`
      CREATE TABLE IF NOT EXISTS user_buffs (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        buff_id TEXT NOT NULL,
        expires_at BIGINT NOT NULL,
        PRIMARY KEY (guild_id, user_id, buff_id)
      )
    `);

    // Investment ventures system
    await run(`
      CREATE TABLE IF NOT EXISTS user_investments (
        id BIGSERIAL PRIMARY KEY,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        venture_id TEXT NOT NULL,
        amount BIGINT NOT NULL,
        invested_at BIGINT NOT NULL,
        matures_at BIGINT NOT NULL,
        collected INTEGER DEFAULT 0
      )
    `);

    // Economy settings rebalancing migrations
    await run(`UPDATE economy_settings SET daily_amount=300 WHERE daily_amount=100`).catch(() => {});
    await run(`UPDATE economy_settings SET weekly_amount=2500 WHERE weekly_amount=500`).catch(() => {});
    await run(`UPDATE economy_settings SET daily_streak_bonus=50 WHERE daily_streak_bonus=10`).catch(() => {});

  } catch (e) {
    // Columns might already exist, ignore error
  }

    // ── New Feature Tables ─────────────────────────────────────────────────────
    try {
    // Word/phrase filter
    await run(`
      CREATE TABLE IF NOT EXISTS word_filter (
        id BIGSERIAL PRIMARY KEY,
        guild_id TEXT NOT NULL,
        word TEXT NOT NULL,
        action TEXT NOT NULL DEFAULT 'delete',
        created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        UNIQUE (guild_id, word)
      )
    `);

    // Trade offers between players
    await run(`
      CREATE TABLE IF NOT EXISTS trade_offers (
        id BIGSERIAL PRIMARY KEY,
        guild_id TEXT NOT NULL,
        from_user_id TEXT NOT NULL,
        to_user_id TEXT NOT NULL,
        from_item TEXT NOT NULL,
        to_item TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        resolved_at BIGINT DEFAULT NULL
      )
    `);

    // Lottery
    await run(`
      CREATE TABLE IF NOT EXISTS lottery_pool (
        guild_id TEXT NOT NULL PRIMARY KEY,
        pot BIGINT NOT NULL DEFAULT 0,
        ticket_price INTEGER NOT NULL DEFAULT 100,
        last_draw_at BIGINT DEFAULT NULL
      )
    `);
    await run(`
      CREATE TABLE IF NOT EXISTS lottery_tickets (
        id BIGSERIAL PRIMARY KEY,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 1,
        purchased_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
      )
    `);

    // Scheduled / auto-post messages
    await run(`
      CREATE TABLE IF NOT EXISTS scheduled_messages (
        id BIGSERIAL PRIMARY KEY,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        content TEXT NOT NULL,
        interval_minutes INTEGER NOT NULL DEFAULT 60,
        next_run_at BIGINT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
      )
    `);

  } catch (e) {
    // ignore duplicate-column / already-exists errors
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
