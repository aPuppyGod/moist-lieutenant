const { PermissionsBitField } = require("discord.js");
const { get, run } = require("./db");
const { xpIntoLevel, levelFromXp } = require("./xp");

function isAdmin(member) {
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

async function handleCommands(message) {
  if (!message.guild || message.author.bot) return;
  if (!message.content.startsWith("!")) return;

  const [cmd, ...args] = message.content.slice(1).trim().split(/\s+/);
  const guildId = message.guild.id;

  // !rank
  if (cmd === "rank") {
    await ensureUserRow(guildId, message.author.id);
    const row = await get(`SELECT xp, level FROM user_xp WHERE guild_id=? AND user_id=?`, [guildId, message.author.id]);
    const p = xpIntoLevel(row.xp);
    return message.reply(`Level **${p.level}** — XP: **${p.into}/${p.need}** (Total: ${row.xp})`);
  }

  // !claim [mee6_name]
  if (cmd === "claim") {
    const mee6Name = args.join(" ").trim() || null;

    // Try auto name if not supplied
    const candidates = [];
    if (!mee6Name) {
      candidates.push(message.author.username);
      if (message.member?.displayName) candidates.push(message.member.displayName);
    } else {
      candidates.push(mee6Name);
    }

    let found = null;
    for (const name of candidates) {
      found = await get(
        `SELECT mee6_name, xp, level, claimed_user_id FROM mee6_snapshot WHERE guild_id=? AND lower(mee6_name)=lower(?)`,
        [guildId, name]
      );
      if (found) break;
    }

    if (!found) {
      return message.reply(
        `Couldn't find a MEE6 entry for that name. Try: \`!claim exactMee6Name\``
      );
    }

    if (found.claimed_user_id && found.claimed_user_id !== message.author.id) {
      return message.reply(`That MEE6 entry has already been claimed.`);
    }

    // Set XP directly to imported total XP
    await ensureUserRow(guildId, message.author.id);
    await setUserXp(guildId, message.author.id, found.xp);

    await run(
      `UPDATE mee6_snapshot SET claimed_user_id=? WHERE guild_id=? AND mee6_name=?`,
      [message.author.id, guildId, found.mee6_name]
    );

    return message.reply(`Claimed **${found.mee6_name}** → imported **Level ${found.level}** (XP ${found.xp}).`);
  }

  // VOICE COMMANDS: must be used in the paired private text channel
  if (cmd.startsWith("voice-")) {
    const room = await get(
      `SELECT owner_id, voice_id, text_id FROM private_rooms WHERE guild_id=? AND text_id=?`,
      [guildId, message.channel.id]
    );

    if (!room) {
      return message.reply(`These commands only work inside a private VC's command text channel.`);
    }

    const member = message.member;
    if (!member) return;

    if (!isAdmin(member) && member.id !== room.owner_id) {
      return message.reply(`Only the VC owner or admins can use these commands.`);
    }

    const voiceChannel = await message.guild.channels.fetch(room.voice_id).catch(() => null);
    if (!voiceChannel) {
      return message.reply(`That private VC no longer exists.`);
    }

    // !voice-limit <num>
    if (cmd === "voice-limit") {
      const n = parseInt(args[0], 10);
      if (!Number.isInteger(n) || n < 0 || n > 99) return message.reply(`Usage: \`!voice-limit 0-99\``);
      await voiceChannel.setUserLimit(n);
      return message.reply(`Set user limit to **${n}**.`);
    }

    // !voice-lock
    if (cmd === "voice-lock") {
      await voiceChannel.permissionOverwrites.edit(message.guild.roles.everyone, { Connect: false });
      return message.reply(`Locked the VC (everyone can't connect).`);
    }

    // !voice-unlock
    if (cmd === "voice-unlock") {
      await voiceChannel.permissionOverwrites.edit(message.guild.roles.everyone, { Connect: null });
      return message.reply(`Unlocked the VC.`);
    }

    // !voice-rename <name...>
    if (cmd === "voice-rename") {
      const name = args.join(" ").trim();
      if (!name) return message.reply(`Usage: \`!voice-rename New Name\``);
      await voiceChannel.setName(name.slice(0, 100));
      return message.reply(`Renamed VC to **${name}**.`);
    }

    // !voice-ban @user
    if (cmd === "voice-ban") {
      const target = message.mentions.members.first();
      if (!target) return message.reply(`Usage: \`!voice-ban @user\``);

      await voiceChannel.permissionOverwrites.edit(target.id, { Connect: false });

      // If they are currently in the VC, move them out (disconnect)
      if (target.voice?.channelId === voiceChannel.id) {
        await target.voice.disconnect().catch(() => {});
      }

      return message.reply(`Banned **${target.user.username}** from the VC.`);
    }

    // !voice-unban @user
    if (cmd === "voice-unban") {
      const target = message.mentions.members.first();
      if (!target) return message.reply(`Usage: \`!voice-unban @user\``);
      await voiceChannel.permissionOverwrites.edit(target.id, { Connect: null });
      return message.reply(`Unbanned **${target.user.username}** from the VC.`);
    }

    return message.reply(`Unknown voice command.`);
  }
}

module.exports = { handleCommands };
