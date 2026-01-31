// src/commands.js
// Lop Bot — Commands (XP, MEE6 import, claim-all, leaderboard, private VC)

const fs = require("fs");
const path = require("path");

const { get, all, run } = require("./db");
const { levelFromXp, progressFromTotalXp } = require("./xp");

// ─────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────
const PREFIX = "!";
const MANAGER_ID = "900758140499398676"; // YOU
const LOCK_CLAIM_ALL_AFTER_RUN = true;

const SNAPSHOT_FILE = path.join(__dirname, "..", "data", "mee6_snapshot.json");

// ─────────────────────────────────────────────
// PERMISSIONS
// ─────────────────────────────────────────────
function isManager(id) {
  return id === MANAGER_ID;
}

function hasAdminPerms(member) {
  if (!member) return false;
  if (isManager(member.id)) return true;
  if (member.guild?.ownerId === member.id) return true;
  return member.permissions?.has("Administrator");
}

function hasModPerms(member) {
  if (!member) return false;
  if (isManager(member.id)) return true;
  return (
    member.permissions?.has("ModerateMembers") ||
    member.permissions?.has("ManageGuild") ||
    member.permissions?.has("Administrator")
  );
}

// ─────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────
function parseArgs(str) {
  const out = [];
  let cur = "";
  let quoted = false;

  for (const ch of str) {
    if (ch === '"') {
      quoted = !quoted;
      continue;
    }
    if (!quoted && /\s/.test(ch)) {
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
  const u = member.user;
  return member.displayName || u.globalName || u.username;
}

// ─────────────────────────────────────────────
// DB HELPERS
// ─────────────────────────────────────────────
async function ensureUserRow(guildId, userId) {
  await run(
    `INSERT OR IGNORE INTO user_xp 
     (guild_id, user_id, xp, level, last_message_xp_at, last_reaction_xp_at)
     VALUES (?, ?, 0, 0, 0, 0)`,
    [guildId, userId]
  );
}

async function setUserXp(guildId, userId, xp) {
  await ensureUserRow(guildId, userId);
  const lvl = levelFromXp(xp);
  await run(
    `UPDATE user_xp SET xp=?, level=? WHERE guild_id=? AND user_id=?`,
    [xp, lvl, guildId, userId]
  );
}

async function addUserXp(guildId, userId, delta) {
  await ensureUserRow(guildId, userId);
  const row = await get(
    `SELECT xp, level FROM user_xp WHERE guild_id=? AND user_id=?`,
    [guildId, userId]
  );
  const newXp = row.xp + delta;
  const newLevel = levelFromXp(newXp);

  await run(
    `UPDATE user_xp SET xp=?, level=? WHERE guild_id=? AND user_id=?`,
    [newXp, newLevel, guildId, userId]
  );

  return { oldLevel: row.level, newLevel, newXp };
}

async function getRankPosition(guildId, userId) {
  const rows = await all(
    `SELECT user_id FROM user_xp WHERE guild_id=? ORDER BY xp DESC`,
    [guildId]
  );
  const idx = rows.findIndex(r => r.user_id === userId);
  return idx === -1 ? null : idx + 1;
}

// ─────────────────────────────────────────────
// CLAIM-ALL LOCK
// ─────────────────────────────────────────────
async function ensureClaimColumn() {
  try {
    await run(`ALTER TABLE guild_settings ADD COLUMN claim_all_done INTEGER DEFAULT 0`);
  } catch {}
}

async function getClaimDone(guildId) {
  await ensureClaimColumn();
  await run(`INSERT OR IGNORE INTO guild_settings (guild_id) VALUES (?)`, [guildId]);
  const r = await get(`SELECT claim_all_done FROM guild_settings WHERE guild_id=?`, [guildId]);
  return r?.claim_all_done === 1;
}

async function setClaimDone(guildId) {
  await ensureClaimColumn();
  await run(`UPDATE guild_settings SET claim_all_done=1 WHERE guild_id=?`, [guildId]);
}

// ─────────────────────────────────────────────
// COMMANDS
// ─────────────────────────────────────────────
async function cmdRank(message) {
  const row = await get(
    `SELECT xp, level FROM user_xp WHERE guild_id=? AND user_id=?`,
    [message.guild.id, message.author.id]
  );
  if (!row) return message.reply("No XP data yet.");

  const pos = await getRankPosition(message.guild.id, message.author.id);
  const prog = progressFromTotalXp(row.xp);

  await message.channel.send(
    `🏅 **Rank**\n` +
    `• Rank: **#${pos}**\n` +
    `• Level: **${prog.level}**\n` +
    `• XP: **${prog.xpIntoLevel}/${prog.xpToNext}** (Total ${prog.totalXp})`
  );
}

async function cmdLeaderboard(message, args) {
  const page = clamp(parseInt(args[0] || "1"), 1, 999);
  const limit = 10;
  const offset = (page - 1) * limit;

  const rows = await all(
    `SELECT user_id, xp FROM user_xp WHERE guild_id=? ORDER BY xp DESC LIMIT ? OFFSET ?`,
    [message.guild.id, limit, offset]
  );

  if (!rows.length) return message.reply("Leaderboard empty.");

  const lines = [];
  for (let i = 0; i < rows.length; i++) {
    const m = await message.guild.members.fetch(rows[i].user_id).catch(() => null);
    const name = m ? bestDisplayName(m) : "Unknown";
    lines.push(`${offset + i + 1}. **${name}** — ${rows[i].xp} XP`);
  }

  await message.channel.send(`🏆 **Leaderboard (Page ${page})**\n` + lines.join("\n"));
}

// ─────────────────────────────────────────────
// MEE6 IMPORT
// ─────────────────────────────────────────────
async function cmdImportMee6(message) {
  if (!hasAdminPerms(message.member)) return message.reply("❌ No permission.");

  if (!fs.existsSync(SNAPSHOT_FILE)) {
    return message.reply("❌ mee6_snapshot.json not found.");
  }

  const raw = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, "utf8"));
  const entries = Array.isArray(raw) ? raw : raw.entries;

  if (!Array.isArray(entries)) {
    return message.reply("❌ Snapshot must be an array or { entries: [...] }");
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

  await message.reply(`✅ Imported **${inserted}** snapshot rows.`);
}

// ─────────────────────────────────────────────
// CLAIM ALL (RATE LIMIT SAFE)
// ─────────────────────────────────────────────
async function cmdClaimAll(message) {
  if (!hasAdminPerms(message.member)) return;

  const guildId = message.guild.id;

  if (LOCK_CLAIM_ALL_AFTER_RUN) {
    const done = await getClaimDone(guildId);
    if (done && !isManager(message.author.id)) {
      return message.reply("❌ claim-all already used.");
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
    await setClaimDone(guildId);
  }

  await message.reply(`✅ Applied XP to **${applied}** members.`);
}

// ─────────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────────
async function handleCommands(message) {
  try {
    if (!message.guild || message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;

    const args = parseArgs(message.content.slice(PREFIX.length));
    const cmd = args.shift()?.toLowerCase();
    if (!cmd) return;

    if (cmd === "rank") return cmdRank(message);
    if (cmd === "leaderboard" || cmd === "lb") return cmdLeaderboard(message, args);
    if (cmd === "import-mee6") return cmdImportMee6(message);
    if (cmd === "claim-all") return cmdClaimAll(message);
  } catch (e) {
    console.error("Command error:", e);
  }
}

module.exports = { handleCommands };