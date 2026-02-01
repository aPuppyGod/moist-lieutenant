// src/settings.js
const { get, all, run } = require("./db");

const DEFAULT_LEVEL_UP_MESSAGE =
  "🎉 Congratumalations {user}! you just advanced to the next **Lop Level {level}**! 🍪✨";

async function getGuildSettings(guildId) {
  await run(
    `INSERT INTO guild_settings (guild_id) VALUES (?)
 ON CONFLICT (guild_id) DO NOTHING`,
    [guildId]
  );

  const row = await get(
    `SELECT * FROM guild_settings WHERE guild_id=?`,
    [guildId]
  );

  return {
    guild_id: guildId,

    message_xp_min: row?.message_xp_min ?? 15,
    message_xp_max: row?.message_xp_max ?? 25,
    message_cooldown_seconds: row?.message_cooldown_seconds ?? 60,

    reaction_xp: row?.reaction_xp ?? 3,
    reaction_cooldown_seconds: row?.reaction_cooldown_seconds ?? 30,

    voice_xp_per_minute: row?.voice_xp_per_minute ?? 5,

    level_up_channel_id: row?.level_up_channel_id ?? null,

    // ✅ EXACT message, spelling preserved
    level_up_message: row?.level_up_message ?? DEFAULT_LEVEL_UP_MESSAGE
  };
}

async function updateGuildSettings(guildId, patch) {
  const allowed = new Set([
    "message_xp_min",
    "message_xp_max",
    "message_cooldown_seconds",
    "reaction_xp",
    "reaction_cooldown_seconds",
    "voice_xp_per_minute",
    "level_up_channel_id",
    "level_up_message"
  ]);

  const entries = Object.entries(patch).filter(([k]) => allowed.has(k));
  if (entries.length === 0) return;

  const sets = entries.map(([k]) => `${k}=?`).join(", ");
  const values = entries.map(([, v]) => v);

  await run(
    `UPDATE guild_settings SET ${sets} WHERE guild_id=?`,
    [...values, guildId]
  );
}

// ─────────────────────────────────────────────
// Level roles (level → role)
// ─────────────────────────────────────────────

async function getLevelRoles(guildId) {
  return await all(
    `SELECT level, role_id
     FROM level_roles
     WHERE guild_id=?
     ORDER BY level ASC`,
    [guildId]
  );
}

async function setLevelRole(guildId, level, roleId) {
  await run(
    `INSERT INTO level_roles (guild_id, level, role_id)
     VALUES (?, ?, ?)
     ON CONFLICT(guild_id, level)
     DO UPDATE SET role_id=excluded.role_id`,
    [guildId, level, roleId]
  );
}

async function deleteLevelRole(guildId, level) {
  await run(
    `DELETE FROM level_roles WHERE guild_id=? AND level=?`,
    [guildId, level]
  );
}

module.exports = {
  getGuildSettings,
  updateGuildSettings,
  getLevelRoles,
  setLevelRole,
  deleteLevelRole
};