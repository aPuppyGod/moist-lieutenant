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

async function getIgnoredChannels(guildId) {
  return await all(
    `SELECT channel_id, channel_type
     FROM ignored_channels
     WHERE guild_id=?`,
    [guildId]
  );
}

async function addIgnoredChannel(guildId, channelId, channelType) {
  await run(
    `INSERT INTO ignored_channels (guild_id, channel_id, channel_type)
     VALUES (?, ?, ?)
     ON CONFLICT (guild_id, channel_id) DO NOTHING`,
    [guildId, channelId, channelType]
  );
}

async function removeIgnoredChannel(guildId, channelId) {
  await run(
    `DELETE FROM ignored_channels WHERE guild_id=? AND channel_id=?`,
    [guildId, channelId]
  );
}

async function getBirthdaySettings(guildId) {
  await run(
    `INSERT INTO birthday_settings (guild_id) VALUES (?) ON CONFLICT (guild_id) DO NOTHING`,
    [guildId]
  );

  const row = await get(
    `SELECT * FROM birthday_settings WHERE guild_id=?`,
    [guildId]
  );

  return {
    guild_id: guildId,
    birthday_channel_id: row?.birthday_channel_id || null,
    birthday_message: row?.birthday_message || "🎉 Happy Birthday {user}! 🎂 Hope you have an amazing day! 🎈"
  };
}

async function updateBirthdaySettings(guildId, updates) {
  const allowed = new Set(["birthday_channel_id", "birthday_message"]);
  const entries = Object.entries(updates).filter(([k]) => allowed.has(k));

  if (entries.length === 0) return;

  const setClause = entries.map(([k], i) => `${k} = $${i + 2}`).join(", ");
  const values = entries.map(([, v]) => v);

  await run(
    `UPDATE birthday_settings SET ${setClause} WHERE guild_id = $1`,
    [guildId, ...values]
  );
}

async function setUserBirthday(guildId, userId, month, day) {
  await run(
    `INSERT INTO user_birthdays (guild_id, user_id, birth_month, birth_day)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (guild_id, user_id)
     DO UPDATE SET birth_month = EXCLUDED.birth_month, birth_day = EXCLUDED.birth_day`,
    [guildId, userId, month, day]
  );
}

async function getUserBirthday(guildId, userId) {
  return await get(
    `SELECT birth_month, birth_day FROM user_birthdays WHERE guild_id=? AND user_id=?`,
    [guildId, userId]
  );
}

async function getTodaysBirthdays(guildId, month, day) {
  return await all(
    `SELECT user_id FROM user_birthdays WHERE guild_id=? AND birth_month=? AND birth_day=?`,
    [guildId, month, day]
  );
}

module.exports = {
  getGuildSettings,
  updateGuildSettings,
  getLevelRoles,
  setLevelRole,
  deleteLevelRole,
  getIgnoredChannels,
  addIgnoredChannel,
  removeIgnoredChannel,
  getBirthdaySettings,
  updateBirthdaySettings,
  setUserBirthday,
  getUserBirthday,
  getTodaysBirthdays
};