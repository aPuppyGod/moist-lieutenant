// src/commands.js
const { PermissionsBitField } = require("discord.js");
const { get, run, all } = require("./db");
const { xpIntoLevel, levelFromXp } = require("./xp");
const BOT_MANAGER_ID = process.env.BOT_MANAGER_ID || "";

function isBotManager(member) {
  return member?.id === BOT_MANAGER_ID;
}

function isAdminOrManager(member) {
  if (!member) return false;
  if (isBotManager(member)) return true;
  return member.permissions.has(PermissionsBitField.Flags.Administrator);
}

async function ensureUserRow(guildId, userId) {
  await run(
    `INSERT OR IGNORE INTO user_xp (guild_id, user_id, xp, level) VALUES (?, ?, 0, 0)`,
    [guildId, userId]
  );
}

async function setUserXp(guildId, userId, xp) {
  const lvl = levelFromXp(xp);
  await run(
    `UPDATE user_xp SET xp = ?, level = ? WHERE guild_id = ? AND user_id = ?`,
    [xp, lvl, guildId, userId]
  );
}

function normalizeName(s) {
  return (s || "").trim().toLowerCase();
}



// Match MEE6 username to exactly one guild member (safe mode: no guessing)
async function findUniqueMemberMatch(guild, mee6Name) {
  const target = normalizeName(mee6Name);

  // Populate cache (needed for reliable matching)
  await guild.members.fetch().catch(() => {});

  const matches = [];
  for (const [, m] of guild.members.cache) {
    if (!m || m.user?.bot) continue;

    const username = normalizeName(m.user.username);
    const displayName = normalizeName(m.displayName);

    if (username === target || displayName === target) matches.push(m);
  }

  if (matches.length === 1) return { member: matches[0], matchesCount: 1 };
  return { member: null, matchesCount: matches.length };
}

async function handleCommands(message) {
  if (!message.guild || message.author.bot) return;
  if (!message.content.startsWith("!")) return;

  const [cmdRaw, ...args] = message.content.slice(1).trim().split(/\s+/);
  const cmd = (cmdRaw || "").toLowerCase();

  const guildId = message.guild.id;

  // =========================
  // BASIC: !rank
  // =========================
  if (cmd === "rank") {
    await ensureUserRow(guildId, message.author.id);

    const row = await get(
      `SELECT xp, level FROM user_xp WHERE guild_id=? AND user_id=?`,
      [guildId, message.author.id]
    );

    const p = xpIntoLevel(row.xp);
    return message.reply(
      `Level **${p.level}** — XP: **${p.into}/${p.need}** (Total: ${row.xp})`
    );
  }

  // !leaderboard [page]
if (cmd === "leaderboard" || cmd === "lb") {
  const page = Math.max(1, parseInt(args[0] || "1", 10) || 1);
  const perPage = 10;
  const offset = (page - 1) * perPage;

  const rows = await all(
    `SELECT user_id, xp, level
     FROM user_xp
     WHERE guild_id = ?
     ORDER BY xp DESC
     LIMIT ? OFFSET ?`,
    [guildId, perPage, offset]
  );

  if (!rows.length) {
    return message.reply("No leaderboard data yet.");
  }

  // Try to resolve usernames
  await message.guild.members.fetch().catch(() => {});
  const lines = rows.map((r, i) => {
    const rank = offset + i + 1;
    const member = message.guild.members.cache.get(r.user_id);
    const name = member ? member.user.username : `Unknown (${r.user_id})`;
    return `${rank}. **${name}** — Level ${r.level} (${r.xp} XP)`;
  });

  return message.reply(
    `🏆 **Leaderboard (Page ${page})**\n` + lines.join("\n")
  );
}

  // =========================
  // ADMIN: !claim-all (one-time migration)
  // =========================
  if (cmd === "claim-all") {
    if (!message.member || !isAdminOrManager(message.member)) {
      return message.reply("Admin only.");
    }


    const guild = message.guild;

    // Only process entries that haven't been assigned yet
    const entries = await all(
      `SELECT mee6_name, xp, level, claimed_user_id
       FROM mee6_snapshot
       WHERE guild_id = ?
         AND (claimed_user_id IS NULL OR claimed_user_id = '')`,
      [guildId]
    );

    if (!entries.length) {
      return message.reply("No unclaimed MEE6 entries found.");
    }

    let imported = 0;
    let missing = 0;
    let ambiguous = 0;

    const missingList = [];
    const ambiguousList = [];

    // Optional: tell admin we started (helpful if many users)
    await message.reply(
      `Starting claim-all for **${entries.length}** MEE6 entries... (this may take a moment)`
    );

    for (const e of entries) {
      const { member, matchesCount } = await findUniqueMemberMatch(
        guild,
        e.mee6_name
      );

      if (!member) {
        if (matchesCount === 0) {
          missing++;
          missingList.push(e.mee6_name);
        } else {
          ambiguous++;
          ambiguousList.push(`${e.mee6_name} (${matchesCount} matches)`);
        }
        continue;
      }

      await ensureUserRow(guildId, member.id);
      await setUserXp(guildId, member.id, e.xp);

      // Lock this mee6_name to this Discord user id so it can't be re-used
      await run(
        `UPDATE mee6_snapshot SET claimed_user_id=? WHERE guild_id=? AND mee6_name=?`,
        [member.id, guildId, e.mee6_name]
      );

      imported++;
    }

    let summary =
      `✅ Claim-all finished.\n` +
      `Imported (unique matches): **${imported}**\n` +
      `Missing (no match): **${missing}**\n` +
      `Ambiguous (duplicates): **${ambiguous}**`;

    // Avoid huge spam: show examples only
    if (missingList.length) {
      summary +=
        `\n\nMissing examples: ${missingList.slice(0, 15).join(", ")}${
          missingList.length > 15 ? " ..." : ""
        }`;
    }

    if (ambiguousList.length) {
      summary +=
        `\n\nAmbiguous examples: ${ambiguousList.slice(0, 15).join(", ")}${
          ambiguousList.length > 15 ? " ..." : ""
        }`;
    }

    summary +=
      `\n\nTip: for the missing/ambiguous ones, you can either rename-match them temporarily or manually edit the DB (recommended if only a few).`;

    return message.reply(summary);
  }

  // =========================
  // VOICE OWNER/ADMIN COMMANDS
  // (ONLY inside paired private text channel)
  // =========================
  if (cmd.startsWith("voice-")) {
    const room = await get(
      `SELECT owner_id, voice_id, text_id FROM private_rooms WHERE guild_id=? AND text_id=?`,
      [guildId, message.channel.id]
    );

    if (!room) {
      return message.reply(
        "These commands only work inside a private VC's command text channel."
      );
    }

    const member = message.member;
    if (!member) return;

    if (!isAdminOrManager(member) && member.id !== room.owner_id) {
      return message.reply("Only the VC owner, bot manager, or admins can use these commands.");
    }


    const voiceChannel = await message.guild.channels
      .fetch(room.voice_id)
      .catch(() => null);

    if (!voiceChannel) {
      return message.reply("That private VC no longer exists.");
    }

    // !voice-limit <num>
    if (cmd === "voice-limit") {
      const n = parseInt(args[0], 10);
      if (!Number.isInteger(n) || n < 0 || n > 99) {
        return message.reply("Usage: `!voice-limit 0-99`");
      }
      await voiceChannel.setUserLimit(n);
      return message.reply(`Set user limit to **${n}**.`);
    }

    // !voice-lock
    if (cmd === "voice-lock") {
      await voiceChannel.permissionOverwrites.edit(
        message.guild.roles.everyone,
        { Connect: false }
      );
      return message.reply("Locked the VC (everyone can't connect).");
    }

    // !voice-unlock
    if (cmd === "voice-unlock") {
      await voiceChannel.permissionOverwrites.edit(
        message.guild.roles.everyone,
        { Connect: null }
      );
      return message.reply("Unlocked the VC.");
    }

    // !voice-rename <name...>
    if (cmd === "voice-rename") {
      const name = args.join(" ").trim();
      if (!name) return message.reply("Usage: `!voice-rename New Name`");
      await voiceChannel.setName(name.slice(0, 100));
      return message.reply(`Renamed VC to **${name}**.`);
    }

    // !voice-ban @user
    if (cmd === "voice-ban") {
      const target = message.mentions.members.first();
      if (!target) return message.reply("Usage: `!voice-ban @user`");

      await voiceChannel.permissionOverwrites.edit(target.id, {
        Connect: false,
        ViewChannel: true
      });

      if (target.voice?.channelId === voiceChannel.id) {
        await target.voice.disconnect().catch(() => {});
      }

      return message.reply(`Banned **${target.user.username}** from the VC.`);
    }

    // !voice-unban @user
    if (cmd === "voice-unban") {
      const target = message.mentions.members.first();
      if (!target) return message.reply("Usage: `!voice-unban @user`");

      await voiceChannel.permissionOverwrites.edit(target.id, {
        Connect: null,
        ViewChannel: null
      });

      return message.reply(`Unbanned **${target.user.username}** from the VC.`);
    }

    return message.reply("Unknown voice command.");
  }
}
module.exports = { handleCommands };
