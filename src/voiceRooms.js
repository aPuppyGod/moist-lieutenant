const { ChannelType, PermissionsBitField } = require("discord.js");
const { get, run, all } = require("./db");

function minutesToMs(m) { return m * 60 * 1000; }

async function onVoiceStateUpdate(oldState, newState, client) {
  const guild = newState.guild || oldState.guild;
  if (!guild) return;

  const createName = (process.env.CREATE_VC_NAME || "create a private vc").toLowerCase();
  const emptyMinutes = parseInt(process.env.PRIVATE_VC_EMPTY_MINUTES || "10", 10);

  // 1) If user joined the "create" channel, create a private VC + text channel and move them
  if (!oldState.channelId && newState.channelId) {
    const joined = newState.channel;
    if (joined && joined.name.toLowerCase() === createName) {
      const owner = newState.member;
      if (!owner) return;

      // Choose category
      const categoryId =
        process.env.PRIVATE_VC_CATEGORY_ID ||
        joined.parentId ||
        null;

      const baseName = `${owner.user.username}'s VC`.slice(0, 90);

      // Create voice channel
      const voiceChannel = await guild.channels.create({
        name: baseName,
        type: ChannelType.GuildVoice,
        parent: categoryId || undefined,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            allow: [PermissionsBitField.Flags.ViewChannel],
            deny: []
          },
          {
            id: owner.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.Connect,
              PermissionsBitField.Flags.Speak
            ]
          }
        ]
      });

      // Create paired text channel for commands
      const textChannel = await guild.channels.create({
        name: `${owner.user.username}-vc-commands`.slice(0, 90),
        type: ChannelType.GuildText,
        parent: categoryId || undefined,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionsBitField.Flags.ViewChannel]
          },
          {
            id: owner.id,
            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory]
          }
        ]
      });

      // Ensure admins can see it too
      // (Admins already can due to permissions, but overwrites can block them if "ViewChannel" is denied for @everyone.
      // So we explicitly allow administrators role(s) if you want. We'll just allow guild.owner and rely on admin perms.
      // If your server has admin roles, add them here.)

      await run(
        `INSERT OR REPLACE INTO private_rooms (guild_id, owner_id, voice_id, text_id, empty_since) VALUES (?, ?, ?, ?, NULL)`,
        [guild.id, owner.id, voiceChannel.id, textChannel.id]
      );

      // Move user
      await owner.voice.setChannel(voiceChannel).catch(() => {});

      await textChannel.send(
        `This channel controls **${voiceChannel.name}**.\n` +
        `Commands (owner/admin only):\n` +
        `• \`!voice-limit <0-99>\`\n` +
        `• \`!voice-lock\` / \`!voice-unlock\`\n` +
        `• \`!voice-rename <name>\`\n` +
        `• \`!voice-ban @user\` / \`!voice-unban @user\`\n\n` +
        `When the VC stays empty for **${emptyMinutes} minutes**, both channels will auto-delete.`
      );

      return;
    }
  }

  // 2) Track empty / active state for cleanup
  // If someone left a tracked private VC -> possibly mark empty_since
  if (oldState.channelId && oldState.channelId !== newState.channelId) {
    const room = await get(`SELECT voice_id FROM private_rooms WHERE guild_id=? AND voice_id=?`, [guild.id, oldState.channelId]);
    if (room) {
      const ch = oldState.channel;
      if (ch && ch.members.size === 0) {
        await run(`UPDATE private_rooms SET empty_since=? WHERE guild_id=? AND voice_id=?`, [Date.now(), guild.id, ch.id]);
      }
    }
  }

  // If someone joined a tracked private VC -> clear empty_since
  if (newState.channelId) {
    const room = await get(`SELECT voice_id FROM private_rooms WHERE guild_id=? AND voice_id=?`, [guild.id, newState.channelId]);
    if (room) {
      await run(`UPDATE private_rooms SET empty_since=NULL WHERE guild_id=? AND voice_id=?`, [guild.id, newState.channelId]);
    }
  }
}

async function cleanupPrivateRooms(client) {
  const emptyMinutes = parseInt(process.env.PRIVATE_VC_EMPTY_MINUTES || "10", 10);
  const threshold = minutesToMs(emptyMinutes);

  const rooms = await all(`SELECT guild_id, voice_id, text_id, empty_since FROM private_rooms`, []);
  const now = Date.now();

  for (const r of rooms) {
    if (!r.empty_since) continue;
    if (now - r.empty_since < threshold) continue;

    const guild = await client.guilds.fetch(r.guild_id).catch(() => null);
    if (!guild) continue;

    const voice = await guild.channels.fetch(r.voice_id).catch(() => null);
    const text = await guild.channels.fetch(r.text_id).catch(() => null);

    // Double-check still empty
    if (voice && voice.members && voice.members.size > 0) {
      await run(`UPDATE private_rooms SET empty_since=NULL WHERE guild_id=? AND voice_id=?`, [r.guild_id, r.voice_id]);
      continue;
    }

    if (voice) await voice.delete("Temp private VC expired").catch(() => {});
    if (text) await text.delete("Temp private VC expired").catch(() => {});

    await run(`DELETE FROM private_rooms WHERE guild_id=? AND voice_id=?`, [r.guild_id, r.voice_id]);
  }
}

module.exports = { onVoiceStateUpdate, cleanupPrivateRooms };
