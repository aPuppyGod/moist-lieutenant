const { get, run, all } = require("./db");

async function ensureGuildSettings(guildId) {
  await run(
    `INSERT OR IGNORE INTO guild_settings (guild_id) VALUES (?)`,
    [guildId]
  );
}

async function getGuildSettings(guildId) {
  await ensureGuildSettings(guildId);
  return get(`SELECT * FROM guild_settings WHERE guild_id=?`, [guildId]);
}

async function updateGuildSettings(guildId, patch) {
  await ensureGuildSettings(guildId);

  const fields = [];
  const values = [];
  for (const [k, v] of Object.entries(patch)) {
    fields.push(`${k}=?`);
    values.push(v);
  }
  if (!fields.length) return;

  values.push(guildId);
  await run(
    `UPDATE guild_settings SET ${fields.join(", ")} WHERE guild_id=?`,
    values
  );
}

async function getLevelRoles(guildId) {
  return all(
    `SELECT level, role_id FROM level_roles WHERE guild_id=? ORDER BY level ASC`,
    [guildId]
  );
}

async function setLevelRole(guildId, level, roleId) {
  await run(
    `INSERT OR REPLACE INTO level_roles (guild_id, level, role_id) VALUES (?, ?, ?)`,
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
