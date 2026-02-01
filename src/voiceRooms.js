// src/voiceRooms.js
const { ChannelType, PermissionsBitField } = require("discord.js");
const { get, run, all } = require("./db");

function minutesToMs(m) {
  return m * 60 * 1000;
}

async function onVoiceStateUpdate(oldState, newState, client) {
  const guild = newState.guild || oldState.guild;
  if (!guild) return;

  const createName = (process.env.CREATE_VC_NAME || "create a private vc").toLowerCase();
  const emptyMinutes = parseInt(process.env.PRIVATE_VC_EMPTY_MINUTES || "5", 10);
  const now = Date.now();

  // ─────────────────────────────────────────────
  // 1) User joined a VC: if it's the "create" VC, create private VC + paired text channel
  // ─────────────────────────────────────────────
  if (!oldState.channelId && newState.channelId) {
    const joined = newState.channel;
    if (joined && joined.name.toLowerCase() === createName) {
      const owner = newState.member;
      if (!owner) return;

      // Pick category: env > create-channel parent > none
      const categoryId = process.env.PRIVATE_VC_CATEGORY_ID || joined.parentId || null;

      const baseName = `${owner.user.username}'s VC`.slice(0, 90);

      // Voice channel permissions
      const voiceOverwrites = [
        {
          id: guild.roles.everyone.id,
          allow: [PermissionsBitField.Flags.ViewChannel],
          // by default allow connect; lock command can disable Connect later
        },
        {
          id: owner.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.Connect,
            PermissionsBitField.Flags.Speak
          ]
        }
      ];

      // Create voice channel
      const voiceChannel = await guild.channels.create({
        name: baseName,
        type: ChannelType.GuildVoice,
        parent: categoryId || undefined,
        permissionOverwrites: voiceOverwrites
      });

      // Paired text channel permissions (private)
      const textOverwrites = [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionsBitField.Flags.ViewChannel]
        },
        {
          id: owner.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory
          ]
        }
      ];

      const textChannel = await guild.channels.create({
        name: `${owner.user.username}-vc-commands`.slice(0, 90),
        type: ChannelType.GuildText,
        parent: categoryId || undefined,
        permissionOverwrites: textOverwrites
      });

      // Save to DB (THIS was failing before)
      await run(
        `INSERT OR REPLACE INTO private_voice_rooms
         (guild_id, owner_id, voice_channel_id, text_channel_id, created_at, last_active_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [guild.id, owner.id, voiceChannel.id, textChannel.id, now, now]
      );

      // Move the user into their new VC
      // NOTE: bot must have "Move Members" permission in that category/server
      await owner.voice.setChannel(voiceChannel).catch((e) => {
        console.error("Failed to move member into private VC:", e);
      });

      // Send command list message
      await textChannel.send(
        `This channel controls **${voiceChannel.name}**.\n` +
          `Commands (owner/admin/manager only):\n` +
          `• \`!voice-limit <0-99>\`\n` +
          `• \`!voice-lock\` / \`!voice-unlock\`\n` +
          `• \`!voice-rename <name>\`\n` +
          `• \`!voice-ban @user\`\n\n` +
          `When the VC stays empty for **${emptyMinutes} minutes**, both channels will auto-delete.`
      );

      return;
    }
  }

  // ─────────────────────────────────────────────
  // 2) Track activity for private rooms
  // ─────────────────────────────────────────────

  // If someone left a channel, and it becomes empty: mark last_active_at to "now" and let cleanup handle it
  if (oldState.channelId && oldState.channelId !== newState.channelId) {
    const room = await get(
      `SELECT voice_channel_id FROM private_voice_rooms WHERE guild_id=? AND voice_channel_id=?`,
      [guild.id, oldState.channelId]
    );

    if (room) {
      const ch = oldState.channel;
      if (ch && ch.members.size === 0) {
        await run(
          `UPDATE private_voice_rooms SET last_active_at=? WHERE guild_id=? AND voice_channel_id=?`,
          [now, guild.id, ch.id]
        );
      }
    }
  }

  // If someone joined a private VC: update last_active_at
  if (newState.channelId) {
    const room = await get(
      `SELECT voice_channel_id FROM private_voice_rooms WHERE guild_id=? AND voice_channel_id=?`,
      [guild.id, newState.channelId]
    );

    if (room) {
      await run(
        `UPDATE private_voice_rooms SET last_active_at=? WHERE guild_id=? AND voice_channel_id=?`,
        [now, guild.id, newState.channelId]
      );
    }
  }
}

async function cleanupPrivateRooms(client) {
  const emptyMinutes = parseInt(process.env.PRIVATE_VC_EMPTY_MINUTES || "5", 10);
  const threshold = minutesToMs(emptyMinutes);
  const now = Date.now();

  const rooms = await all(
    `SELECT guild_id, voice_channel_id, text_channel_id, last_active_at
     FROM private_voice_rooms`,
    []
  );

  for (const r of rooms) {
    const guild = await client.guilds.fetch(r.guild_id).catch(() => null);
    if (!guild) continue;

    const voice = await guild.channels.fetch(r.voice_channel_id).catch(() => null);
    const text = await guild.channels.fetch(r.text_channel_id).catch(() => null);

    // If voice channel is gone, clean DB + text (if exists)
    if (!voice) {
      if (text) await text.delete("Orphaned private VC text channel").catch(() => {});
      await run(
        `DELETE FROM private_voice_rooms WHERE guild_id=? AND voice_channel_id=?`,
        [r.guild_id, r.voice_channel_id]
      );
      continue;
    }

    // Only delete if empty AND has been empty/inactive long enough
    const isEmpty = voice.members?.size === 0;
    if (!isEmpty) continue;

    if (now - (r.last_active_at || now) < threshold) continue;

    await voice.delete("Temp private VC expired").catch(() => {});
    if (text) await text.delete("Temp private VC expired").catch(() => {});

    await run(
      `DELETE FROM private_voice_rooms WHERE guild_id=? AND voice_channel_id=?`,
      [r.guild_id, r.voice_channel_id]
    );
  }
}

module.exports = { onVoiceStateUpdate, cleanupPrivateRooms };