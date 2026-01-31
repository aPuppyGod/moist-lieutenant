// src/commands.js
// Lop Bot - commands (XP + MEE6 import/migration + Private VC controls)

const fs = require("fs");
const path = require("path");

const { get, all, run } = require("./db");
const { levelFromXp, progressFromTotalXp } = require("./xp");

// ====== CONFIG ======
const PREFIX = "!";
const MANAGER_ID = "900758140499398676"; // manager override (you)
const LOCK_CLAIM_ALL_AFTER_RUN = true;
const SNAPSHOT_FILE = path.join(__dirname, "..", "data", "mee6_snapshot.json");

// ====== PERMS ======
function isManager(userId) {
  return userId === MANAGER_ID;
}

function hasAdminPerms(member) {
  if (!member) return false;
  if (isManager(member.user?.id || member.id)) return true;
  if (member.guild && member.guild.ownerId === member.id) return true;
  return member.permissions?.has?.("Administrator") || false;
}

function hasModPerms(member) {
  if (!member) return false;
  if (isManager(member.user?.id || member.id)) return true;
  return (
    member.permissions?.has?.("ModerateMembers") ||
    member.permissions?.has?.("ManageGuild") ||
    member.permissions?.has?.("Administrator")
  );
}

// ====== UTIL ======
function parseArgs(content) {
  const out = [];
  let cur = "";
  let inQ = false;

  for (const ch of content) {
    if (ch === '"') {
      inQ = !inQ;
      continue;
    }
    if (!inQ && /\s/.test(ch)) {
      if (cur) out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur) out.push(cur);
  return out;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function normalizeName(s) {
  return String(s || "").trim().toLowerCase();
}

function bestDisplayName(member) {
  return member.displayName || member.user.globalName || member.user.username;
}

// ====== DB helpers ======
async function ensureUserRow(guildId, userId) {
  await run(
    `INSERT OR IGNORE INTO user_xp
     (guild_id, user_id, xp, level, last_message_xp_at, last_reaction_xp_at)
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
}

async function getUserRow(guildId, userId) {
  await ensureUserRow(guildId, userId);
  return get(
    `SELECT xp, level FROM user_xp WHERE guild_id=? AND user_id=?`,
    [guildId, userId]
  );
}

async function getRankPosition(guildId, userId) {
  const rows = await all(
    `SELECT user_id FROM user_xp WHERE guild_id=? ORDER BY xp DESC`,
    [guildId]
  );
  const idx = rows.findIndex(r => r.user_id === userId);
  return idx === -1 ? null : idx + 1;
}

// ====== claim-all lock ======
async function ensureClaimColumn() {
  try {
    await run(`ALTER TABLE guild_settings ADD COLUMN claim_all_done INTEGER DEFAULT 0`);
  } catch (_) {}
}

async function getClaimAllDone(guildId) {
  await ensureClaimColumn();
  await run(`INSERT OR IGNORE INTO guild_settings (guild_id) VALUES (?)`, [guildId]);
  const row = await get(`SELECT claim_all_done FROM guild_settings WHERE guild_id=?`, [guildId]);
  return row?.claim_all_done === 1;
}

async function setClaimAllDone(guildId) {
  await ensureClaimColumn();
  await run(`UPDATE guild_settings SET claim_all_done=1 WHERE guild_id=?`, [guildId]);
}

// ====== PRIVATE VC HELPERS ======
async function getRoomByTextChannel(guildId, textId) {
  return get(
    `SELECT * FROM private_voice_rooms WHERE guild_id=? AND text_channel_id=?`,
    [guildId, textId]
  );
}

// ====== COMMANDS ======
async function cmdHelp(message) {
  await message.channel.send(
`**Lop Bot Commands**

• !rank [@user]
• !leaderboard [page]

**Admin / Manager**
• !import-mee6
• !claim-all
• !xp set @user <xp>
• !xp add @user <xp>
• !recalc-levels

**Private VC (ONLY in VC text channel)**
• !voice-limit <0-99>
• !voice-lock / !voice-unlock
• !voice-rename <name>
• !voice-ban @user`
  );
}

async function cmdRank(message) {
  const target = message.mentions.users.first() || message.author;
  const row = await getUserRow(message.guild.id, target.id);
  const pos = await getRankPosition(message.guild.id, target.id);
  const prog = progressFromTotalXp(row.xp);

  await message.channel.send(
    `🏅 **${target.username}**\n` +
    `Rank: **#${pos ?? "?"}**\n` +
    `Level: **${prog.level}**\n` +
    `XP: **${prog.xpIntoLevel}/${prog.xpToNext}** (Total ${prog.totalXp})`
  );
}

async function cmdLeaderboard(message, args) {
  const page = clamp(parseInt(args[0] || "1", 10), 1, 999);
  const offset = (page - 1) * 10;

  const rows = await all(
    `SELECT user_id, xp FROM user_xp
     WHERE guild_id=? ORDER BY xp DESC LIMIT 10 OFFSET ?`,
    [message.guild.id, offset]
  );

  if (!rows.length) return message.channel.send("No leaderboard data.");

  const lines = [];
  for (let i = 0; i < rows.length; i++) {
    const m = await message.guild.members.fetch(rows[i].user_id).catch(() => null);
    const name = m ? bestDisplayName(m) : "Unknown";
    lines.push(`${offset + i + 1}. **${name}** — ${rows[i].xp} XP`);
  }

  await message.channel.send(`🏆 **Leaderboard (Page ${page})**\n` + lines.join("\n"));
}

// ====== IMPORT MEE6 ======
async function cmdImportMee6(message) {
  if (!hasAdminPerms(message.member)) {
  return message.reply("❌ You need **Administrator** (or be the bot manager) to use this.");
}

  if (!fs.existsSync(SNAPSHOT_FILE)) {
    return message.reply("mee6_snapshot.json not found.");
  }

  const raw = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, "utf8"));
  const entries = Array.isArray(raw) ? raw : raw.entries;
  if (!Array.isArray(entries)) {
    return message.reply("Invalid snapshot format.");
  }

  await run(`DELETE FROM mee6_snapshot WHERE guild_id=?`, [message.guild.id]);

  let inserted = 0;
  for (const e of entries) {
    const username = e.username ?? e.name;
    const xp = Number(e.xp);
    if (!username || !Number.isFinite(xp)) continue;

    await run(
      `INSERT INTO mee6_snapshot
       (guild_id, snapshot_username, snapshot_xp, snapshot_level)
       VALUES (?, ?, ?, ?)`,
      [message.guild.id, username, xp, Number(e.level ?? 0)]
    );
    inserted++;
  }

  await message.channel.send(`✅ Imported **${inserted}** snapshot rows.`);
}

// ====== CLAIM ALL ======
async function cmdClaimAll(message) {
  if (!hasAdminPerms(message.member)) {
  return message.reply("❌ You need **Administrator** (or be the bot manager) to use this.");
}

  if (LOCK_CLAIM_ALL_AFTER_RUN) {
    const done = await getClaimAllDone(message.guild.id);
    if (done && !isManager(message.author.id)) {
      return message.reply("claim-all already used.");
    }
  }

  // Fetch only currently cached members first
const members = message.guild.members.cache.filter(m => !m.user.bot);

// If cache is empty (Render cold start), fetch in chunks
if (members.size === 0) {
  let lastId;
  while (true) {
    const batch = await message.guild.members.fetch({
      limit: 1000,
      after: lastId
    }).catch(() => null);

    if (!batch || batch.size === 0) break;

    lastId = batch.last().id;

    // IMPORTANT: wait to avoid rate limits
    await new Promise(r => setTimeout(r, 1200));
  }
}

  const members = message.guild.members.cache.filter(m => !m.user.bot);

  const byUsername = new Map();
  const byDisplay = new Map();
  const byGlobal = new Map();

  for (const m of members.values()) {
    const u = m.user;
    const un = normalizeName(u.username);
    const dn = normalizeName(m.displayName);
    const gn = normalizeName(u.globalName);

    if (un) { if (!byUsername.has(un)) byUsername.set(un, []); byUsername.get(un).push(m); }
    if (dn) { if (!byDisplay.has(dn)) byDisplay.set(dn, []); byDisplay.get(dn).push(m); }
    if (gn) { if (!byGlobal.has(gn)) byGlobal.set(gn, []); byGlobal.get(gn).push(m); }
  }

  let matched = 0, skipped = 0;

  for (const s of snapshots) {
    if (s.claimed_user_id) continue;

    const key = normalizeName(s.snapshot_username);
    const candidates = [
      ...(byUsername.get(key) || []),
      ...(byDisplay.get(key) || []),
      ...(byGlobal.get(key) || [])
    ];

    const uniq = [...new Map(candidates.map(m => [m.id, m])).values()];
    if (uniq.length !== 1) { skipped++; continue; }

    await setUserXp(message.guild.id, uniq[0].id, s.snapshot_xp);
    await run(
      `UPDATE mee6_snapshot SET claimed_user_id=?, claimed_at=?
       WHERE guild_id=? AND snapshot_username=?`,
      [uniq[0].id, Date.now(), message.guild.id, s.snapshot_username]
    );
    matched++;
  }

  if (LOCK_CLAIM_ALL_AFTER_RUN) await setClaimAllDone(message.guild.id);

  await message.channel.send(
    `✅ Claim complete\nMatched: ${matched}\nSkipped: ${skipped}`
  );
}

// ====== PRIVATE VC COMMANDS ======
async function ensureRoom(message) {
  const room = await getRoomByTextChannel(message.guild.id, message.channel.id);
  if (!room) return null;
  if (room.owner_id !== message.author.id && !hasAdminPerms(message.member)) return null;
  return room;
}

async function cmdVoiceLimit(message, args) {
  const room = await ensureRoom(message);
  if (!room) return;

  const n = parseInt(args[0], 10);
  if (!Number.isInteger(n) || n < 0 || n > 99) return;

  const vc = await message.guild.channels.fetch(room.voice_channel_id);
  await vc.setUserLimit(n);
}

// ====== MAIN HANDLER ======
async function handleCommands(message) {
  try {
    if (!message.guild || message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;

    const args = parseArgs(message.content.slice(PREFIX.length));
    const cmd = (args.shift() || "").toLowerCase();
    if (!cmd) return;

    if (cmd === "help") return cmdHelp(message);
    if (cmd === "rank") return cmdRank(message);
    if (cmd === "leaderboard" || cmd === "lb") return cmdLeaderboard(message, args);

    if (cmd === "import-mee6") return cmdImportMee6(message);
    if (cmd === "claim-all" || cmd === "claimall") return cmdClaimAll(message);

    if (cmd === "voice-limit") return cmdVoiceLimit(message, args);
  } catch (e) {
    console.error("Command error:", e);
  }
}

module.exports = { handleCommands };