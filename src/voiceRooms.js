// src/voiceRooms.js
const { ChannelType, PermissionsBitField } = require("discord.js");
const { get, run, all } = require("./db");

function minutesToMs(m) {
  return m * 60 * 1000;
}

function getEmptyMinutes() {
  // ✅ radix must be 10
  return parseInt(process.env.PRIVATE_VC_EMPTY_MINUTES || "5", 10);
}

function getCreateChannelName() {
  return (process.env.CREATE_VC_NAME || "create a private vc").toLowerCase();
}

async function onVoiceStateUpdate(oldState, newState, client) {
  const guild = newState.guild || oldState.guild;
  if (!guild) return;

  const createName = getCreateChannelName();
  const emptyMinutes = getEmptyMinutes();

  // 1) User joined a voice channel (from no channel -> some channel)
  if (!oldState.channelId && newState.channelId) {
    const joined = newState.channel;
    if (joined && joined.name && joined.name.toLowerCase() === createName) {
      const owner = newState.member;
      if (!owner) return;

      // Choose category: env override > same parent as create channel > none
      const categoryId = process.env.PRIVATE_VC_CATEGORY_ID || joined.parentId || null;

      const baseName = `${owner.user.username}'s VC`.slice(0, 90);

      // Create voice channel
      const voiceChannel = await guild.channels.create({
        name: baseName,
        type: ChannelType.GuildVoice,
        parent: categoryId || undefined,
        permissionOverwrites: [
          // Hide from everyone by default; owner can view/connect/speak.
          // If you want everyone to see but not join, change ViewChannel to allow for everyone.
          {
            id: guild.roles.everyone.id,
            deny: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect],
          },
          {
            id: owner.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.Connect,
              PermissionsBitField.Flags.Speak,
              PermissionsBitField.Flags.Stream,
            ],
          },
        ],
      });

      // Create paired text channel for commands
      const textChannel = await guild.channels.create({
        name: `${owner.user.username}-vc-commands`.slice(0, 90),
        type: ChannelType.GuildText,
        parent: categoryId || undefined,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionsBitField.Flags.ViewChannel],
          },
          {
            id: owner.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory,
            ],
          },
        ],
      });

      // Store in DB (✅ correct table/column names)
      await run(
        `INSERT OR REPLACE INTO private_voice_rooms
         (guild_id, owner_id, voice_channel_id, text_channel_id, empty_since)
         VALUES (?, ?, ?, ?, NULL)`,
        [guild.id, owner.id, voiceChannel.id, textChannel.id]
      );

      // Move user into the VC
      await owner.voice.setChannel(voiceChannel).catch(() => {});

      await textChannel.send(
        `This channel controls **${voiceChannel.name}**.\n` +
          `Commands (owner/admin/manager only) — **ONLY here**:\n` +
          `• \`!voice-limit <0-99>\`\n` +
          `• \`!voice-lock\` / \`!voice-unlock\`\n` +
          `• \`!voice-rename <name>\`\n` +
          `• \`!voice-ban @user\`\n\n` +
          `When the VC stays empty for **${emptyMinutes} minutes**, both channels will auto-delete.`
      );

      return;
    }
  }

  // 2) Mark empty/active state for cleanup

  // Someone left a voice channel (or switched channels)
  if (oldState.channelId && oldState.channelId !== newState.channelId) {
    const room = await get(
      `SELECT voice_channel_id FROM private_voice_rooms WHERE guild_id=? AND voice_channel_id=?`,
      [guild.id, oldState.channelId]
    );

    if (room) {
      const ch = oldState.channel;
      if (ch && ch.members.size === 0) {
        await run(
          `UPDATE private_voice_rooms SET empty_since=? WHERE guild_id=? AND voice_channel_id=?`,
          [Date.now(), guild.id, ch.id]
        );
      }
    }
  }

  // Someone joined a voice channel (or switched into it)
  if (newState.channelId) {
    const room = await get(
      `SELECT voice_channel_id FROM private_voice_rooms WHERE guild_id=? AND voice_channel_id=?`,
      [guild.id, newState.channelId]
    );

    if (room) {
      await run(
        `UPDATE private_voice_rooms SET empty_since=NULL WHERE guild_id=? AND voice_channel_id=?`,
        [guild.id, newState.channelId]
      );
    }
  }
}

async function cleanupPrivateRooms(client) {
  const emptyMinutes = getEmptyMinutes();
  const threshold = minutesToMs(emptyMinutes);
  const now = Date.now();

  const rooms = await all(
    `SELECT guild_id, voice_channel_id, text_channel_id, empty_since
     FROM private_voice_rooms`,
    []
  );

  for (const r of rooms) {
    if (!r.empty_since) continue;
    if (now - r.empty_since < threshold) continue;

    const guild = await client.guilds.fetch(r.guild_id).catch(() => null);
    if (!guild) continue;

    const voice = await guild.channels.fetch(r.voice_channel_id).catch(() => null);
    const text = await guild.channels.fetch(r.text_channel_id).catch(() => null);

    // Double-check still empty
    if (voice && voice.members && voice.members.size > 0) {
      await run(
        `UPDATE private_voice_rooms SET empty_since=NULL WHERE guild_id=? AND voice_channel_id=?`,
        [r.guild_id, r.voice_channel_id]
      );
      continue;
    }

    if (voice) await voice.delete("Temp private VC expired").catch(() => {});
    if (text) await text.delete("Temp private VC expired").catch(() => {});

    await run(
      `DELETE FROM private_voice_rooms WHERE guild_id=? AND voice_channel_id=?`,
      [r.guild_id, r.voice_channel_id]
    );
  }
}

module.exports = { onVoiceStateUpdate, cleanupPrivateRooms };