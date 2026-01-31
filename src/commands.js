// src/commands.js
// Lop Bot - commands (XP + MEE6 import/migration + Private VC controls)

const fs = require("fs");
const path = require("path");

const { get, all, run } = require("./db");
const { levelFromXp, progressFromTotalXp } = require("./xp");

// ====== CONFIG ======
const PREFIX = "!";
const MANAGER_ID = "900758140499398676"; // you (manager override)

// Optional one-time lock for claim-all
const LOCK_CLAIM_ALL_AFTER_RUN = true;

// Snapshot file used for Render import
const SNAPSHOT_FILE = path.join(__dirname, "..", "data", "mee6_snapshot.json");

// ====== PERMS ======
function isManager(userId) {
  return userId === MANAGER_ID;
}

function hasAdminPerms(member) {
  if (!member) return false;
  if (isManager(member.id)) return true;
  if (member.guild && member.guild.ownerId === member.id) return true;
  return member.permissions?.has?.("Administrator") || false;
}

function hasModPerms(member) {
  if (!member) return false;
  if (isManager(member.id)) return true;
  return (
    member.permissions?.has?.("ModerateMembers") ||
    member.permissions?.has?.("ManageGuild") ||
    member.permissions?.has?.("Administrator")
  ) || false;
}

// ====== UTIL ======
function parseArgs(content) {
  // Splits by spaces while keeping quoted strings
  const out = [];
  let cur = "";
  let inQ = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (ch === '"') {
      inQ = !inQ;
      continue;
    }
    if (!inQ && /\s/.test(ch)) {
      if (cur.length) out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.length) out.push(cur);
  return out;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function normalizeName(s) {
  return String(s || "").trim().toLowerCase();
}

function bestDisplayName(member) {
  const u = member.user;
  return member.displayName || u.globalName || u.username || "";
}

// ====== DB helpers ======
async function ensureUserRow(guildId, userId) {
  await run(
    `INSERT OR IGNORE INTO user_xp (guild_id, user_id, xp, level, last_message_xp_at, last_reaction_xp_at)
     VALUES (?, ?, 0, 0, 0, 0)`,
    [guildId, userId]
  );
}

async function setUserXp(guildId, userId, totalXp) {
  await ensureUserRow(guildId, userId);
  const lvl = levelFromXp(totalXp);
  await run(
    `UPDATE user_xp SET xp=?, level=? WHERE guild_id=? AND user_id=?`,
    [totalXp, lvl, guildId, userId]
  );
  return { xp: totalXp, level: lvl };
}

async function addUserXp(guildId, userId, deltaXp) {
  await ensureUserRow(guildId, userId);
  const row = await get(
    `SELECT xp, level FROM user_xp WHERE guild_id=? AND user_id=?`,
    [guildId, userId]
  );
  const newXp = (row?.xp || 0) + deltaXp;
  const newLevel = levelFromXp(newXp);
  await run(
    `UPDATE user_xp SET xp=?, level=? WHERE guild_id=? AND user_id=?`,
    [newXp, newLevel, guildId, userId]
  );
  return { oldLevel: row?.level || 0, newLevel, newXp };
}

async function getRankPosition(guildId, userId) {
  const rows = await all(
    `SELECT user_id FROM user_xp WHERE guild_id=? ORDER BY xp DESC, user_id ASC`,
    [guildId]
  );
  const idx = rows.findIndex((r) => r.user_id === userId);
  return idx === -1 ? null : idx + 1;
}

async function getUserRow(guildId, userId) {
  await ensureUserRow(guildId, userId);
  return await get(
    `SELECT xp, level FROM user_xp WHERE guild_id=? AND user_id=?`,
    [guildId, userId]
  );
}

// ====== Claim-all lock flag stored in guild_settings ======
async function ensureClaimFlagColumn() {
  try {
    await run(`ALTER TABLE guild_settings ADD COLUMN claim_all_done INTEGER DEFAULT 0`);
  } catch (_) {}
}

async function getClaimAllDone(guildId) {
  await ensureClaimFlagColumn();
  await run(`INSERT OR IGNORE INTO guild_settings (guild_id) VALUES (?)`, [guildId]);
  const row = await get(`SELECT claim_all_done FROM guild_settings WHERE guild_id=?`, [guildId]);
  return (row?.claim_all_done || 0) === 1;
}

async function setClaimAllDone(guildId, done) {
  await ensureClaimFlagColumn();
  await run(`UPDATE guild_settings SET claim_all_done=? WHERE guild_id=?`, [done ? 1 : 0, guildId]);
}

// ====== PRIVATE VC HELPERS ======
async function getRoomByTextChannel(guildId, textChannelId) {
  return await get(
    `SELECT * FROM private_voice_rooms WHERE guild_id=? AND text_channel_id=?`,
    [guildId, textChannelId]
  );
}

async function fetchVoiceChannel(guild, channelId) {
  return await guild.channels.fetch(channelId).catch(() => null);
}

// ====== COMMANDS ======
async function cmdHelp(message) {
  const lines = [
    `**Lop Bot Commands**`,
    `• \`!rank [@user]\` — show rank info`,
    `• \`!leaderboard [page]\` — XP leaderboard`,
    ``,
    `**Admin / Manager**`,
    `• \`!import-mee6\` — import \`data/mee6_snapshot.json\` into DB`,
    `• \`!claim-all\` — apply imported XP to members (one-time)`,
    `• \`!xp set @user <totalXP>\``,
    `• \`!xp add @user <amount>\``,
    `• \`!recalc-levels\` — recompute levels from XP`,
    ``,
    `**Private VC (ONLY in the temp VC text channel)**`,
    `• \`!voice-limit <num>\``,
    `• \`!voice-lock\` / \`!voice-unlock\``,
    `• \`!voice-rename "new name"\``,
    `• \`!voice-ban @user\``
  ];
  await message.channel.send(lines.join("\n"));
}

async function cmdRank(message, args) {
  const guildId = message.guild.id;
  const target = message.mentions.users.first() || message.author;

  const row = await getUserRow(guildId, target.id);
  const pos = await getRankPosition(guildId, target.id);

  const prog = progressFromTotalXp(row.xp);

  await message.channel.send(
    `🏅 **Rank for ${target.username}**\n` +
    `• Rank: **#${pos ?? "?"}**\n` +
    `• Level: **${prog.level}**\n` +
    `• XP: **${prog.xpIntoLevel} / ${prog.xpToNext}** (Total: **${prog.totalXp}**)`
  );
}

async function cmdLeaderboard(message, args) {
  const guildId = message.guild.id;
  const page = clamp(parseInt(args[0] || "1", 10) || 1, 1, 999);

  const perPage = 10;
  const offset = (page - 1) * perPage;

  const rows = await all(
    `SELECT user_id, xp FROM user_xp WHERE guild_id=? ORDER BY xp DESC, user_id ASC LIMIT ? OFFSET ?`,
    [guildId, perPage, offset]
  );

  if (!rows.length) return message.channel.send("No leaderboard data yet.");

  const lines = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const member = await message.guild.members.fetch(r.user_id).catch(() => null);
    const name = member ? bestDisplayName(member) : `User ${r.user_id}`;
    const lvl = levelFromXp(r.xp);
    lines.push(`${offset + i + 1}. **${name}** — Level **${lvl}** (${r.xp} XP)`);
  }

  await message.channel.send(`🏆 **Leaderboard (Page ${page})**\n` + lines.join("\n"));
}

async function cmdXp(message, args) {
  if (!hasAdminPerms(message.member)) {
    return message.reply("❌ You don't have permission to use that.");
  }

  const guildId = message.guild.id;
  const sub = (args[0] || "").toLowerCase();

  if (sub !== "set" && sub !== "add") {
    return message.channel.send(
      `Usage:\n` +
      `• \`!xp set @user <totalXP>\`\n` +
      `• \`!xp add @user <amount>\``
    );
  }

  const user = message.mentions.users.first();
  if (!user) return message.reply("Tag a user: `!xp set @user 5000`");

  const amount = parseInt(args[2], 10);
  if (!Number.isFinite(amount) || amount < 0) return message.reply("Enter a valid number.");

  if (sub === "set") {
    const res = await setUserXp(guildId, user.id, amount);
    return message.channel.send(`✅ Set ${user} to **${res.xp} XP** (Level **${res.level}**).`);
  } else {
    const res = await addUserXp(guildId, user.id, amount);
    return message.channel.send(
      `✅ Added **${amount} XP** to ${user}. Total: **${res.newXp}** (Level **${res.newLevel}**).`
    );
  }
}

// ----- Render import: snapshot json -> mee6_snapshot table -----
async function cmdImportMee6(message) {
  if (!hasAdminPerms(message.member)) {
    return message.reply("❌ You don't have permission to do this.");
  }

  if (!fs.existsSync(SNAPSHOT_FILE)) {
    return message.reply("❌ mee6_snapshot.json not found.");
  }

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, "utf8"));
  } catch {
    return message.reply("❌ Snapshot JSON is invalid.");
  }

  // ✅ ACCEPT YOUR FORMAT
  let entries;
  if (Array.isArray(raw)) {
    entries = raw;
  } else if (Array.isArray(raw.entries)) {
    entries = raw.entries;
  } else {
    return message.reply("❌ Snapshot must be an array or { entries: [...] }");
  }

  // Clear old snapshot rows
  await run(`DELETE FROM mee6_snapshot WHERE guild_id=?`, [
    message.guild.id
  ]);

  let inserted = 0;

  for (const e of entries) {
    const username = e.username ?? e.name;
    const xp = Number(e.xp);
    const level = Number(e.level ?? 0);

    if (!username || !Number.isFinite(xp)) continue;

    await run(
      `INSERT INTO mee6_snapshot
       (guild_id, snapshot_username, snapshot_xp, snapshot_level)
       VALUES (?, ?, ?, ?)`,
      [message.guild.id, username, xp, level]
    );

    inserted++;
  }

  if (inserted === 0) {
    return message.reply("⚠️ Snapshot loaded, but no valid rows were found.");
  }

  await message.channel.send(
    `✅ Imported **${inserted}** MEE6 snapshot rows.\n` +
    `Next: run \`!claim-all\` to apply XP to members.`
  );
}

async function cmdClaimAll(message) {
  if (!hasAdminPerms(message.member)) {
    return message.reply("❌ You don't have permission to use that.");
  }

  const guildId = message.guild.id;

  // Optional one-time lock
  if (LOCK_CLAIM_ALL_AFTER_RUN) {
    const done = await getClaimAllDone(guildId);
    if (done && !isManager(message.author.id)) {
      return message.reply("❌ `!claim-all` has already been run once on this server.");
    }
  }

  await message.guild.members.fetch().catch(() => {});

  const snapshots = await all(
    `SELECT snapshot_username, snapshot_xp, claimed_user_id
     FROM mee6_snapshot WHERE guild_id=?`,
    [guildId]
  );

  if (!snapshots.length) {
    return message.reply("No MEE6 snapshot found in DB. Run `!import-mee6` first.");
  }

  let matched = 0;
  let skipped = 0;
  let already = 0;

  const members = Array.from(message.guild.members.cache.values()).filter((m) => !m.user.bot);

  const byUsername = new Map();
  const byDisplay = new Map();
  const byGlobal = new Map();

  for (const m of members) {
    const u = m.user;
    const un = normalizeName(u.username);
    const dn = normalizeName(m.displayName);
    const gn = normalizeName(u.globalName);

    if (un) (byUsername.get(un) ?? byUsername.set(un, []).get(un)).push(m);
    if (dn) (byDisplay.get(dn) ?? byDisplay.set(dn, []).get(dn)).push(m);
    if (gn) (byGlobal.get(gn) ?? byGlobal.set(gn, []).get(gn)).push(m);
  }

  await message.channel.send(
    `⏳ Starting \`!claim-all\`...\n` +
    `This matches snapshot usernames to members by username/globalName/nickname.\n` +
    `If a name matches multiple people or nobody, it will be skipped.`
  );

  for (const s of snapshots) {
    if (s.claimed_user_id) {
      already++;
      continue;
    }

    const key = normalizeName(s.snapshot_username);
    const candidates =
      (byUsername.get(key) || [])
        .concat(byGlobal.get(key) || [])
        .concat(byDisplay.get(key) || []);

    const uniq = new Map();
    for (const c of candidates) uniq.set(c.id, c);
    const list = Array.from(uniq.values());

    if (list.length !== 1) {
      skipped++;
      continue;
    }

    const member = list[0];

    await setUserXp(guildId, member.id, Number(s.snapshot_xp));

    await run(
      `UPDATE mee6_snapshot SET claimed_user_id=?, claimed_at=? WHERE guild_id=? AND snapshot_username=?`,
      [member.id, Date.now(), guildId, s.snapshot_username]
    );

    matched++;
  }

  if (LOCK_CLAIM_ALL_AFTER_RUN) {
    await setClaimAllDone(guildId, true);
  }

  await message.channel.send(
    `✅ Claim-all finished.\n` +
    `• Matched & applied: **${matched}**\n` +
    `• Skipped (no/ambiguous match): **${skipped}**\n` +
    `• Already claimed rows: **${already}**\n\n` +
    `Tip: If some were skipped, temporarily set nicknames to match snapshot usernames and run again.\n` +
    `(Manager can rerun even if locked.)`
  );
}

async function cmdRecalcLevels(message) {
  if (!hasAdminPerms(message.member)) {
    return message.reply("❌ You don't have permission to use that.");
  }

  const guildId = message.guild.id;
  const rows = await all(`SELECT user_id, xp FROM user_xp WHERE guild_id=?`, [guildId]);

  for (const r of rows) {
    const lvl = levelFromXp(r.xp);
    await run(`UPDATE user_xp SET level=? WHERE guild_id=? AND user_id=?`, [lvl, guildId, r.user_id]);
  }

  await message.channel.send(`✅ Recalculated levels for **${rows.length}** users.`);
}

// ====== PRIVATE VC COMMANDS ======
async function ensureRoomCommandContext(message) {
  const guildId = message.guild.id;

  const room = await getRoomByTextChannel(guildId, message.channel.id);
  if (!room) {
    return { ok: false, room: null, error: "This command can only be used in the private VC text channel." };
  }

  const isOwner = message.author.id === room.owner_id;
  const can = isOwner || hasAdminPerms(message.member) || hasModPerms(message.member);
  if (!can) {
    return { ok: false, room, error: "Only the room owner, admins, or the manager can use this here." };
  }

  const voiceChannel = await fetchVoiceChannel(message.guild, room.voice_channel_id);
  if (!voiceChannel) return { ok: false, room, error: "Voice channel no longer exists." };

  return { ok: true, room, voiceChannel };
}

async function cmdVoiceLimit(message, args) {
  const ctx = await ensureRoomCommandContext(message);
  if (!ctx.ok) return message.reply(`❌ ${ctx.error}`);

  const n = parseInt(args[0], 10);
  if (!Number.isInteger(n) || n < 0 || n > 99) {
    return message.reply("Usage: `!voice-limit <0-99>` (0 = no limit)");
  }

  await ctx.voiceChannel.setUserLimit(n).catch(() => null);
  await message.reply(`✅ Voice user limit set to **${n}**.`);
}

async function cmdVoiceLock(message) {
  const ctx = await ensureRoomCommandContext(message);
  if (!ctx.ok) return message.reply(`❌ ${ctx.error}`);

  const everyone = message.guild.roles.everyone;
  await ctx.voiceChannel.permissionOverwrites.edit(everyone, { Connect: false }).catch(() => null);
  await message.reply("🔒 VC locked (everyone can’t connect).");
}

async function cmdVoiceUnlock(message) {
  const ctx = await ensureRoomCommandContext(message);
  if (!ctx.ok) return message.reply(`❌ ${ctx.error}`);

  const everyone = message.guild.roles.everyone;
  await ctx.voiceChannel.permissionOverwrites.edit(everyone, { Connect: null }).catch(() => null);
  await message.reply("🔓 VC unlocked (everyone can connect).");
}

async function cmdVoiceRename(message, args) {
  const ctx = await ensureRoomCommandContext(message);
  if (!ctx.ok) return message.reply(`❌ ${ctx.error}`);

  const name = args.join(" ").trim();
  if (!name) return message.reply('Usage: `!voice-rename "new name"`');

  await ctx.voiceChannel.setName(name.slice(0, 100)).catch(() => null);
  await message.reply(`✅ VC renamed to **${name.slice(0, 100)}**.`);
}

async function cmdVoiceBan(message) {
  const ctx = await ensureRoomCommandContext(message);
  if (!ctx.ok) return message.reply(`❌ ${ctx.error}`);

  const target = message.mentions.members.first();
  if (!target) return message.reply("Usage: `!voice-ban @user`");

  await ctx.voiceChannel.permissionOverwrites.edit(target.id, { Connect: false }).catch(() => null);

  if (target.voice?.channelId === ctx.voiceChannel.id) {
    await target.voice.disconnect().catch(() => null);
  }

  await message.reply(`⛔ Banned ${target} from connecting to this VC.`);
}

// ====== MAIN HANDLER ======
async function handleCommands(message) {
  try {
    if (!message.guild) return;
    if (message.author.bot) return;

    const content = message.content || "";
    if (!content.startsWith(PREFIX)) return;

    const raw = content.slice(PREFIX.length).trim();
    if (!raw) return;

    const args = parseArgs(raw);

    // ✅ IMPORTANT FIX: define cmd BEFORE any checks
    const cmd = (args.shift() || "").toLowerCase();
    if (!cmd) return;

    if (cmd === "help" || cmd === "commands") return await cmdHelp(message);

    if (cmd === "rank") return await cmdRank(message, args);
    if (cmd === "leaderboard" || cmd === "lb") return await cmdLeaderboard(message, args);

    // Admin/manager tools
    if (cmd === "xp") return await cmdXp(message, args);
    if (cmd === "import-mee6") return await cmdImportMee6(message);
    if (cmd === "claim-all" || cmd === "claimall") return await cmdClaimAll(message);
    if (cmd === "recalc-levels" || cmd === "recalclevels") return await cmdRecalcLevels(message);

    // Private VC commands
    if (cmd === "voice-limit") return await cmdVoiceLimit(message, args);
    if (cmd === "voice-lock") return await cmdVoiceLock(message);
    if (cmd === "voice-unlock") return await cmdVoiceUnlock(message);
    if (cmd === "voice-rename") return await cmdVoiceRename(message, args);
    if (cmd === "voice-ban") return await cmdVoiceBan(message);

    return; // unknown command: ignore
  } catch (e) {
    console.error("handleCommands error:", e);
  }
}

module.exports = { handleCommands };