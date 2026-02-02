// src/commands.js
const { PermissionsBitField, ChannelType } = require("discord.js");
const { get, all, run } = require("./db");
const { levelFromXp, xpForLevel } = require("./xp");
const { getLevelRoles } = require("./settings");
const fs = require("fs");
const path = require("path");

// Change if you want another prefix
const PREFIX = "!";

// ─────────────────────────────────────────────────────
// Permission helpers
// ─────────────────────────────────────────────────────

function isAdminOrManager(member) {
  if (!member) return false;
  // "manager" is ambiguous; the closest practical perms are ManageGuild / ManageChannels.
  // Admin also works.
  return (
    member.permissions.has(PermissionsBitField.Flags.Administrator) ||
    member.permissions.has(PermissionsBitField.Flags.ManageGuild) ||
    member.permissions.has(PermissionsBitField.Flags.ManageChannels)
  );
}

// ─────────────────────────────────────────────────────
// Private VC room lookup + auth
// ─────────────────────────────────────────────────────

async function getRoomByTextChannel(guildId, textChannelId) {
  return await get(
    `SELECT guild_id, owner_id, voice_channel_id, text_channel_id
     FROM private_voice_rooms
     WHERE guild_id=? AND text_channel_id=?`,
    [guildId, textChannelId]
  );
}

async function assertVoiceCmdAllowed(message) {
  if (!message.guild) return { ok: false, reason: "This command must be used in a server." };

  const room = await getRoomByTextChannel(message.guild.id, message.channel.id);
  if (!room) {
    return {
      ok: false,
      reason: "These VC commands only work in the **paired VC commands channel**."
    };
  }

  const isOwner = message.author.id === room.owner_id;
  const isStaff = isAdminOrManager(message.member);

  if (!isOwner && !isStaff) {
    return { ok: false, reason: "Only the VC owner + admins/managers can use these commands." };
  }

  return { ok: true, room };
}

// ─────────────────────────────────────────────────────
// Parsing helpers
// ─────────────────────────────────────────────────────

function parseCommand(content) {
  if (!content.startsWith(PREFIX)) return null;

  const without = content.slice(PREFIX.length).trim();
  if (!without) return null;

  const parts = without.split(/\s+/);
  const cmd = (parts.shift() || "").toLowerCase();
  const args = parts;

  return { cmd, args };
}

function pickUserFromMention(message) {
  // Supports: mention first, otherwise null
  const u = message.mentions.users.first();
  return u || null;
}

function clampInt(n, min, max) {
  const x = Number.parseInt(String(n), 10);
  if (Number.isNaN(x)) return null;
  return Math.max(min, Math.min(max, x));
}

function normalizeName(s) {
  return String(s || "").trim().toLowerCase();
}

async function setUserXp(guildId, userId, xp) {
  await run(
    `INSERT OR IGNORE INTO user_xp 
     (guild_id, user_id, xp, level, last_message_xp_at, last_reaction_xp_at)
     VALUES (?, ?, 0, 0, 0, 0)`,
    [guildId, userId]
  );
  const lvl = levelFromXp(xp);
  await run(
    `UPDATE user_xp SET xp=?, level=? WHERE guild_id=? AND user_id=?`,
    [xp, lvl, guildId, userId]
  );
}

// ─────────────────────────────────────────────────────
// Command implementations
// ─────────────────────────────────────────────────────

async function cmdHelp(message) {
  const lines = [
    "**Commands**",
    "",
    "**Levels**",
    "• `!rank [@user]` — show XP + level",
    "• `!leaderboard [page]` / `!lb [page]` — show top XP",
    "• `!shame @user` — shame a user",
    "",
    "**Private VC (only inside the VC’s paired commands channel)**",
    "• `!voice-limit <0-99>`",
    "• `!voice-lock` / `!voice-unlock`",
    "• `!voice-rename <name>`",
    "• `!voice-ban @user`",
    "",
    "**Admin/Manager**",
    "• `!xp add @user <amount>`",
    "• `!xp set @user <amount>`",
    "• `!recalc-levels`",
    "• `!sync-roles`",
    "• `!import-mee6`",
    "• `!claim-all [force]`",
  ];

  await message.reply(lines.join("\n")).catch(() => {});
}

async function cmdRank(message, args) {
  if (!message.guild) return;

  const target = message.mentions.users.first() || message.author;

  const row = await get(
    `SELECT xp, level FROM user_xp WHERE guild_id=? AND user_id=?`,
    [message.guild.id, target.id]
  );

  const xp = row?.xp ?? 0;
  const level = row?.level ?? 0;

  // Optional: XP to next level display if your xp.js supports xpForLevel
  let nextLine = "";
  try {
    if (typeof xpForLevel === "function") {
      const nextXp = xpForLevel(level + 1);
      const remaining = Math.max(0, nextXp - xp);
      nextLine = `\nXP to next level: **${remaining}**`;
    }
  } catch (_) {}

  await message.reply(
    `**${target.tag}**\nLevel: **${level}**\nXP: **${xp}**${nextLine}`
  ).catch(() => {});
}

async function cmdLeaderboard(message, args) {
  if (!message.guild) return;

  const page = clampInt(args[0] ?? "1", 1, 999) ?? 1;
  const perPage = 10;
  const offset = (page - 1) * perPage;

  const rows = await all(
    `SELECT user_id, xp, level
     FROM user_xp
     WHERE guild_id=?
     ORDER BY xp DESC
     LIMIT ? OFFSET ?`,
    [message.guild.id, perPage, offset]
  );

  if (!rows || rows.length === 0) {
    await message.reply(`No leaderboard data yet (page ${page}).`).catch(() => {});
    return;
  }

  const lines = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rank = offset + i + 1;

    // Try to resolve a tag for nicer display
    let name = `<@${r.user_id}>`;
    const member = await message.guild.members.fetch(r.user_id).catch(() => null);
    if (member?.user?.tag) name = member.user.tag;

    lines.push(
      `**#${rank}** — ${name} — Level **${r.level}** — XP **${r.xp}**`
    );
  }

  await message.reply(`**Leaderboard (page ${page})**\n` + lines.join("\n")).catch(() => {});
}

async function cmdShame(message, args) {
  if (!message.guild) return;

  const target = pickUserFromMention(message);
  if (!target) {
    await message.reply("Usage: `!shame @user`").catch(() => {});
    return;
  }

  await message.reply(`SHAME ${target} SHAME ON YOU!`).catch(() => {});
}

async function cmdXp(message, args) {
  if (!message.guild) return;

  if (!isAdminOrManager(message.member)) {
    await message.reply("You need to be an admin/manager to use `!xp` commands.").catch(() => {});
    return;
  }

  const sub = (args[0] || "").toLowerCase();
  const target = pickUserFromMention(message);

  if (!sub || !["add", "set"].includes(sub) || !target) {
    await message.reply(
      "Usage:\n• `!xp add @user <amount>`\n• `!xp set @user <amount>`"
    ).catch(() => {});
    return;
  }

  const amount = Number.parseInt(args[2], 10);
  if (!Number.isFinite(amount)) {
    await message.reply("Amount must be a number.").catch(() => {});
    return;
  }

  // ensure row exists (Postgres version should still accept this pattern if db.js maps ? correctly)
  await run(
    `INSERT INTO user_xp (guild_id, user_id, xp, level, last_message_xp_at, last_reaction_xp_at)
     VALUES (?, ?, 0, 0, 0, 0)
     ON CONFLICT (guild_id, user_id) DO NOTHING`,
    [message.guild.id, target.id]
  );

  const row = await get(
    `SELECT xp FROM user_xp WHERE guild_id=? AND user_id=?`,
    [message.guild.id, target.id]
  );

  const oldXp = row?.xp ?? 0;
  const newXp = sub === "set" ? Math.max(0, amount) : Math.max(0, oldXp + amount);
  const newLevel = levelFromXp(newXp);

  await run(
    `UPDATE user_xp SET xp=?, level=? WHERE guild_id=? AND user_id=?`,
    [newXp, newLevel, message.guild.id, target.id]
  );

  await message.reply(
    `${sub === "set" ? "Set" : "Added"} XP for ${target} → XP **${newXp}**, Level **${newLevel}**`
  ).catch(() => {});
}

async function cmdRecalcLevels(message) {
  if (!message.guild) return;

  if (!isAdminOrManager(message.member)) {
    await message.reply("You need to be an admin/manager to use this.").catch(() => {});
    return;
  }

  const rows = await all(
    `SELECT user_id, xp FROM user_xp WHERE guild_id=?`,
    [message.guild.id]
  );

  let changed = 0;

  for (const r of rows) {
    const lvl = levelFromXp(r.xp || 0);
    await run(
      `UPDATE user_xp SET level=? WHERE guild_id=? AND user_id=?`,
      [lvl, message.guild.id, r.user_id]
    );
    changed++;
  }

  await message.reply(`Recalculated levels for **${changed}** users.`).catch(() => {});
}

async function cmdSyncRoles(message) {
  if (!message.guild) return;

  if (!isAdminOrManager(message.member)) {
    await message.reply("You need to be an admin/manager to use this.").catch(() => {});
    return;
  }

  const levelRoles = await getLevelRoles(message.guild.id);
  if (!levelRoles.length) {
    await message.reply("No level roles configured.").catch(() => {});
    return;
  }

  const users = await all(
    `SELECT user_id, level FROM user_xp WHERE guild_id=?`,
    [message.guild.id]
  );

  let assigned = 0;
  let removed = 0;

  for (const user of users) {
    const member = await message.guild.members.fetch(user.user_id).catch(() => null);
    if (!member) continue;

    // Determine roles the user should have: all roles for levels <= their level
    const shouldHave = levelRoles.filter(r => r.level <= user.level).map(r => r.role_id);

    // Roles they currently have that are level roles
    const currentLevelRoles = member.roles.cache.filter(role => 
      levelRoles.some(lr => lr.role_id === role.id)
    ).map(role => role.id);

    // Roles to add
    const toAdd = shouldHave.filter(id => !currentLevelRoles.includes(id));

    // Roles to remove (level roles they have but shouldn't)
    const toRemove = currentLevelRoles.filter(id => !shouldHave.includes(id));

    // Add roles
    for (const roleId of toAdd) {
      try {
        const role = await message.guild.roles.fetch(roleId);
        if (role) {
          await member.roles.add(role);
          assigned++;
        }
      } catch (e) {
        console.error(`Failed to add role ${roleId} to ${member.user.tag}:`, e);
      }
    }

    // Remove roles
    for (const roleId of toRemove) {
      try {
        const role = await message.guild.roles.fetch(roleId);
        if (role) {
          await member.roles.remove(role);
          removed++;
        }
      } catch (e) {
        console.error(`Failed to remove role ${roleId} from ${member.user.tag}:`, e);
      }
    }
  }

  await message.reply(`Synced roles: **${assigned}** assigned, **${removed}** removed.`).catch(() => {});
}

// ─────────────────────────────────────────────────────
// Private VC commands
// ─────────────────────────────────────────────────────

async function cmdVoiceLimit(message, args) {
  const check = await assertVoiceCmdAllowed(message);
  if (!check.ok) {
    await message.reply(check.reason).catch(() => {});
    return;
  }

  const limit = clampInt(args[0], 0, 99);
  if (limit === null) {
    await message.reply("Usage: `!voice-limit <0-99>`").catch(() => {});
    return;
  }

  const voice = await message.guild.channels.fetch(check.room.voice_channel_id).catch(() => null);
  if (!voice) {
    await message.reply("Voice channel not found.").catch(() => {});
    return;
  }

  await voice.setUserLimit(limit).catch((e) => console.error(e));
  await message.reply(`Set voice limit to **${limit}**.`).catch(() => {});
}

async function cmdVoiceLock(message) {
  const check = await assertVoiceCmdAllowed(message);
  if (!check.ok) {
    await message.reply(check.reason).catch(() => {});
    return;
  }

  const voice = await message.guild.channels.fetch(check.room.voice_channel_id).catch(() => null);
  if (!voice) {
    await message.reply("Voice channel not found.").catch(() => {});
    return;
  }

  // Everyone can VIEW, but not CONNECT when locked.
  await voice.permissionOverwrites.edit(message.guild.roles.everyone, {
    ViewChannel: true,
    Connect: false
  }).catch((e) => console.error(e));

  await message.reply("🔒 VC locked (everyone can still see it, but can’t join).").catch(() => {});
}

async function cmdVoiceUnlock(message) {
  const check = await assertVoiceCmdAllowed(message);
  if (!check.ok) {
    await message.reply(check.reason).catch(() => {});
    return;
  }

  const voice = await message.guild.channels.fetch(check.room.voice_channel_id).catch(() => null);
  if (!voice) {
    await message.reply("Voice channel not found.").catch(() => {});
    return;
  }

  // Restore connect for everyone
  await voice.permissionOverwrites.edit(message.guild.roles.everyone, {
    ViewChannel: true,
    Connect: true
  }).catch((e) => console.error(e));

  await message.reply("🔓 VC unlocked (everyone can join).").catch(() => {});
}

async function cmdVoiceRename(message, args) {
  const check = await assertVoiceCmdAllowed(message);
  if (!check.ok) {
    await message.reply(check.reason).catch(() => {});
    return;
  }

  const newName = args.join(" ").trim();
  if (!newName) {
    await message.reply("Usage: `!voice-rename <name>`").catch(() => {});
    return;
  }

  const voice = await message.guild.channels.fetch(check.room.voice_channel_id).catch(() => null);
  if (!voice) {
    await message.reply("Voice channel not found.").catch(() => {});
    return;
  }

  await voice.setName(newName.slice(0, 90)).catch((e) => console.error(e));
  await message.reply(`Renamed VC to **${voice.name}**.`).catch(() => {});
}

async function cmdVoiceBan(message) {
  const check = await assertVoiceCmdAllowed(message);
  if (!check.ok) {
    await message.reply(check.reason).catch(() => {});
    return;
  }

  const target = message.mentions.members.first();
  if (!target) {
    await message.reply("Usage: `!voice-ban @user`").catch(() => {});
    return;
  }

  const voice = await message.guild.channels.fetch(check.room.voice_channel_id).catch(() => null);
  if (!voice) {
    await message.reply("Voice channel not found.").catch(() => {});
    return;
  }

  // Deny connect (and optionally view) to target for THIS VC only.
  await voice.permissionOverwrites.edit(target.id, {
    ViewChannel: false,
    Connect: false
  }).catch((e) => console.error(e));

  // If they’re currently inside, kick them out of the VC
  if (target.voice?.channelId === voice.id) {
    await target.voice.setChannel(null).catch(() => {});
  }

  await message.reply(`🚫 Banned ${target} from joining this VC.`).catch(() => {});
}

// ─────────────────────────────────────────────────────
// MEE6 Import
// ─────────────────────────────────────────────────────

async function cmdImportMee6(message) {
  if (!isAdminOrManager(message.member)) {
    await message.reply("❌ No permission.").catch(() => {});
    return;
  }

  const fs = require("fs");
  const path = require("path");
  const SNAPSHOT_FILE = path.join(__dirname, "..", "data", "mee6_snapshot.json");

  if (!fs.existsSync(SNAPSHOT_FILE)) {
    await message.reply("❌ mee6_snapshot.json not found.").catch(() => {});
    return;
  }

  const raw = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, "utf8"));
  const entries = Array.isArray(raw) ? raw : raw.entries;

  if (!Array.isArray(entries)) {
    await message.reply("❌ Snapshot must be an array or { entries: [...] }").catch(() => {});
    return;
  }

  await run(`DELETE FROM mee6_snapshot WHERE guild_id=?`, [message.guild.id]);

  let inserted = 0;
  for (const e of entries) {
    if (!e.name || !Number.isFinite(e.xp)) continue;
    await run(
      `INSERT INTO mee6_snapshot (guild_id, snapshot_username, snapshot_xp, snapshot_level)
       VALUES (?, ?, ?, ?)`,
      [message.guild.id, e.name, e.xp, e.level || 0]
    );
    inserted++;
  }

  await message.reply(`✅ Imported **${inserted}** snapshot rows.`).catch(() => {});
}

// ─────────────────────────────────────────────────────
// Claim All
// ─────────────────────────────────────────────────────

async function cmdClaimAll(message) {
  if (!isAdminOrManager(message.member)) {
    await message.reply("❌ No permission.").catch(() => {});
    return;
  }

  const LOCK_CLAIM_ALL_AFTER_RUN = true;
  const guildId = message.guild.id;
  const force = message.content.toLowerCase().includes("force");

  if (LOCK_CLAIM_ALL_AFTER_RUN && !force) {
    const done = await get(`SELECT claim_all_done FROM guild_settings WHERE guild_id=?`, [guildId]);
    if (done && done.claim_all_done === 1) {
      await message.reply("❌ claim-all already used. Use `!claim-all force` to override.").catch(() => {});
      return;
    }
  }

  // Fetch members safely
  let members = message.guild.members.cache.filter(m => !m.user.bot);

  if (members.size === 0) {
    let lastId;
    while (true) {
      const batch = await message.guild.members.fetch({
        limit: 1000,
        after: lastId
      }).catch(() => null);

      if (!batch || batch.size === 0) break;
      lastId = batch.last().id;
      await new Promise(r => setTimeout(r, 1500));
    }
    members = message.guild.members.cache.filter(m => !m.user.bot);
  }

  const snapshots = await all(
    `SELECT snapshot_username, snapshot_xp FROM mee6_snapshot WHERE guild_id=?`,
    [guildId]
  );

  let applied = 0;

  for (const s of snapshots) {
    const key = normalizeName(s.snapshot_username);
    const match = members.find(m =>
      normalizeName(m.user.username) === key ||
      normalizeName(m.displayName) === key ||
      normalizeName(m.user.globalName) === key
    );
    if (!match) continue;

    await setUserXp(guildId, match.id, s.snapshot_xp);
    applied++;
  }

  if (LOCK_CLAIM_ALL_AFTER_RUN) {
    await run(`UPDATE guild_settings SET claim_all_done=1 WHERE guild_id=?`, [guildId]);
  }

  await message.reply(`✅ Applied XP to **${applied}** members.`).catch(() => {});
}

// ─────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────

async function handleCommands(message) {
  if (!message || !message.content) return false;

  const parsed = parseCommand(message.content);
  if (!parsed) return false;

  const { cmd, args } = parsed;

  // Debug log so you can see the handler is firing
  console.log("[CMD]", cmd, args.join(" "));

  // Help
  if (cmd === "help" || cmd === "commands") {
    await cmdHelp(message);
    return true;
  }

  // Levels
  if (cmd === "rank") {
    await cmdRank(message, args);
    return true;
  }

  if (cmd === "leaderboard" || cmd === "lb") {
    await cmdLeaderboard(message, args);
    return true;
  }

  if (cmd === "shame") {
    await cmdShame(message, args);
    return true;
  }

  // Admin XP
  if (cmd === "xp") {
    await cmdXp(message, args);
    return true;
  }

  if (cmd === "recalc-levels" || cmd === "recalclevels") {
    await cmdRecalcLevels(message);
    return true;
  }

  if (cmd === "sync-roles" || cmd === "syncroles") {
    await cmdSyncRoles(message);
    return true;
  }

  if (cmd === "import-mee6") {
    await cmdImportMee6(message);
    return true;
  }

  if (cmd === "claim-all" || cmd === "claimall") {
    await cmdClaimAll(message);
    return true;
  }

  // Private VC commands
  if (cmd === "voice-limit") {
    await cmdVoiceLimit(message, args);
    return true;
  }

  if (cmd === "voice-lock") {
    await cmdVoiceLock(message);
    return true;
  }

  if (cmd === "voice-unlock") {
    await cmdVoiceUnlock(message);
    return true;
  }

  if (cmd === "voice-rename") {
    await cmdVoiceRename(message, args);
    return true;
  }

  if (cmd === "voice-ban") {
    await cmdVoiceBan(message);
    return true;
  }

  return false;
}

module.exports = { handleCommands };
