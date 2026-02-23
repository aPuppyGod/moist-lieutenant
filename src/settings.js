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
    command_prefix: row?.command_prefix ?? "!",
    new_account_warn_days: row?.new_account_warn_days ?? 1,
    mod_role_id: row?.mod_role_id ?? null,
    log_channel_id: row?.log_channel_id ?? null,

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
    "command_prefix",
    "new_account_warn_days",
    "mod_role_id",
    "log_channel_id",
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

async function getLoggingExclusions(guildId) {
  return await all(
    `SELECT target_id, target_type
     FROM logging_exclusions
     WHERE guild_id=?
     ORDER BY target_type, target_id`,
    [guildId]
  );
}

async function addLoggingExclusion(guildId, targetId, targetType) {
  await run(
    `INSERT INTO logging_exclusions (guild_id, target_id, target_type)
     VALUES (?, ?, ?)
     ON CONFLICT (guild_id, target_id) DO UPDATE SET target_type=EXCLUDED.target_type`,
    [guildId, targetId, targetType]
  );
}

async function removeLoggingExclusion(guildId, targetId) {
  await run(
    `DELETE FROM logging_exclusions WHERE guild_id=? AND target_id=?`,
    [guildId, targetId]
  );
}

async function getLoggingEventConfigs(guildId) {
  return await all(
    `SELECT event_key, enabled, channel_id
     FROM logging_event_configs
     WHERE guild_id=?`,
    [guildId]
  );
}

async function upsertLoggingEventConfig(guildId, eventKey, enabled, channelId) {
  await run(
    `INSERT INTO logging_event_configs (guild_id, event_key, enabled, channel_id)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (guild_id, event_key)
     DO UPDATE SET enabled=EXCLUDED.enabled, channel_id=EXCLUDED.channel_id`,
    [guildId, eventKey, enabled ? 1 : 0, channelId || null]
  );
}

async function getLoggingActorExclusions(guildId) {
  return await all(
    `SELECT target_id, target_type
     FROM logging_actor_exclusions
     WHERE guild_id=?
     ORDER BY target_type, target_id`,
    [guildId]
  );
}

async function addLoggingActorExclusion(guildId, targetId, targetType) {
  await run(
    `INSERT INTO logging_actor_exclusions (guild_id, target_id, target_type)
     VALUES (?, ?, ?)
     ON CONFLICT (guild_id, target_id)
     DO UPDATE SET target_type=EXCLUDED.target_type`,
    [guildId, targetId, targetType]
  );
}

async function removeLoggingActorExclusion(guildId, targetId) {
  await run(
    `DELETE FROM logging_actor_exclusions WHERE guild_id=? AND target_id=?`,
    [guildId, targetId]
  );
}

async function getReactionRoleBindings(guildId) {
  return await all(
    `SELECT channel_id, message_id, emoji_key, role_id, remove_on_unreact
     FROM reaction_role_bindings
     WHERE guild_id=?
     ORDER BY message_id, emoji_key`,
    [guildId]
  );
}

async function getReactionRoleBinding(guildId, messageId, emojiKey) {
  return await get(
    `SELECT channel_id, message_id, emoji_key, role_id, remove_on_unreact
     FROM reaction_role_bindings
     WHERE guild_id=? AND message_id=? AND emoji_key=?`,
    [guildId, messageId, emojiKey]
  );
}

async function upsertReactionRoleBinding(guildId, channelId, messageId, emojiKey, roleId, removeOnUnreact = true) {
  await run(
    `INSERT INTO reaction_role_bindings (guild_id, channel_id, message_id, emoji_key, role_id, remove_on_unreact)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (guild_id, message_id, emoji_key)
     DO UPDATE SET channel_id=EXCLUDED.channel_id, role_id=EXCLUDED.role_id, remove_on_unreact=EXCLUDED.remove_on_unreact`,
    [guildId, channelId, messageId, emojiKey, roleId, removeOnUnreact ? 1 : 0]
  );
}

async function removeReactionRoleBinding(guildId, messageId, emojiKey) {
  await run(
    `DELETE FROM reaction_role_bindings
     WHERE guild_id=? AND message_id=? AND emoji_key=?`,
    [guildId, messageId, emojiKey]
  );
}

async function getTicketSettings(guildId) {
  await run(
    `INSERT INTO ticket_settings (guild_id) VALUES (?)
     ON CONFLICT (guild_id) DO NOTHING`,
    [guildId]
  );

  const row = await get(
    `SELECT guild_id, enabled, panel_channel_id, category_id, support_role_id, ticket_prefix, panel_message_id
     FROM ticket_settings
     WHERE guild_id=?`,
    [guildId]
  );

  return {
    guild_id: guildId,
    enabled: Number(row?.enabled || 0) === 1,
    panel_channel_id: row?.panel_channel_id || null,
    category_id: row?.category_id || null,
    support_role_id: row?.support_role_id || null,
    ticket_prefix: row?.ticket_prefix || "ticket",
    panel_message_id: row?.panel_message_id || null
  };
}

async function upsertTicketSettings(guildId, patch) {
  const current = await getTicketSettings(guildId);
  const merged = {
    enabled: patch.enabled !== undefined ? (patch.enabled ? 1 : 0) : (current.enabled ? 1 : 0),
    panel_channel_id: patch.panel_channel_id !== undefined ? (patch.panel_channel_id || null) : current.panel_channel_id,
    category_id: patch.category_id !== undefined ? (patch.category_id || null) : current.category_id,
    support_role_id: patch.support_role_id !== undefined ? (patch.support_role_id || null) : current.support_role_id,
    ticket_prefix: patch.ticket_prefix !== undefined ? (patch.ticket_prefix || "ticket") : current.ticket_prefix,
    panel_message_id: patch.panel_message_id !== undefined ? (patch.panel_message_id || null) : current.panel_message_id
  };

  await run(
    `INSERT INTO ticket_settings (guild_id, enabled, panel_channel_id, category_id, support_role_id, ticket_prefix, panel_message_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (guild_id)
     DO UPDATE SET
       enabled=EXCLUDED.enabled,
       panel_channel_id=EXCLUDED.panel_channel_id,
       category_id=EXCLUDED.category_id,
       support_role_id=EXCLUDED.support_role_id,
       ticket_prefix=EXCLUDED.ticket_prefix,
       panel_message_id=EXCLUDED.panel_message_id`,
    [
      guildId,
      merged.enabled,
      merged.panel_channel_id,
      merged.category_id,
      merged.support_role_id,
      merged.ticket_prefix,
      merged.panel_message_id
    ]
  );
}

async function getOpenTicketByUser(guildId, openerId) {
  return await get(
    `SELECT guild_id, channel_id, opener_id, status, created_at
     FROM tickets
     WHERE guild_id=? AND opener_id=? AND status='open'
     ORDER BY created_at DESC
     LIMIT 1`,
    [guildId, openerId]
  );
}

async function getTicketByChannel(guildId, channelId) {
  return await get(
    `SELECT guild_id, channel_id, opener_id, status, created_at, closed_at, closed_by
     FROM tickets
     WHERE guild_id=? AND channel_id=?`,
    [guildId, channelId]
  );
}

async function createTicket(guildId, channelId, openerId) {
  await run(
    `INSERT INTO tickets (guild_id, channel_id, opener_id, status, created_at)
     VALUES (?, ?, ?, 'open', ?)
     ON CONFLICT (guild_id, channel_id)
     DO UPDATE SET opener_id=EXCLUDED.opener_id, status='open', created_at=EXCLUDED.created_at, closed_at=NULL, closed_by=NULL`,
    [guildId, channelId, openerId, Date.now()]
  );
}

async function closeTicket(guildId, channelId, closedBy) {
  await run(
    `UPDATE tickets
     SET status='closed', closed_at=?, closed_by=?
     WHERE guild_id=? AND channel_id=?`,
    [Date.now(), closedBy || null, guildId, channelId]
  );
}

async function getOpenTickets(guildId) {
  return await all(
    `SELECT guild_id, channel_id, opener_id, status, created_at
     FROM tickets
     WHERE guild_id=? AND status='open'
     ORDER BY created_at DESC`,
    [guildId]
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
  getLoggingExclusions,
  addLoggingExclusion,
  removeLoggingExclusion,
  getLoggingEventConfigs,
  upsertLoggingEventConfig,
  getLoggingActorExclusions,
  addLoggingActorExclusion,
  removeLoggingActorExclusion,
  getReactionRoleBindings,
  getReactionRoleBinding,
  upsertReactionRoleBinding,
  removeReactionRoleBinding,
  getTicketSettings,
  upsertTicketSettings,
  getOpenTicketByUser,
  getTicketByChannel,
  createTicket,
  closeTicket,
  getOpenTickets,

  // Customization unlocks
  getCustomizationUnlocks,
  setCustomizationUnlock,
  getCustomizationRequiredLevel
};

// ─────────────────────────────────────────────
// Customization unlocks (per-guild, per-option required level)
// ─────────────────────────────────────────────

const DEFAULT_UNLOCKS = {
  bgimage: 10,      // Custom background image
  gradient: 5,      // Custom gradient
  bgcolor: 1,       // Custom background color
  font: 3,          // Custom font
  border: 7,        // Custom border
  avatarframe: 15   // Avatar frame
};

async function getCustomizationUnlocks(guildId) {
  // Returns { option: required_level, ... } with defaults filled in
  const rows = await all(
    `SELECT option, required_level FROM customization_unlocks WHERE guild_id=?`,
    [guildId]
  );
  const result = { ...DEFAULT_UNLOCKS };
  for (const r of rows) {
    result[r.option] = r.required_level;
  }
  return result;
}

async function setCustomizationUnlock(guildId, option, requiredLevel) {
  await run(
    `INSERT INTO customization_unlocks (guild_id, option, required_level)
     VALUES (?, ?, ?)
     ON CONFLICT (guild_id, option) DO UPDATE SET required_level=excluded.required_level`,
    [guildId, option, requiredLevel]
  );
}

async function getCustomizationRequiredLevel(guildId, option) {
  const row = await get(
    `SELECT required_level FROM customization_unlocks WHERE guild_id=? AND option=?`,
    [guildId, option]
  );
  if (row && typeof row.required_level === 'number') return row.required_level;
  return DEFAULT_UNLOCKS[option] ?? 1;
}