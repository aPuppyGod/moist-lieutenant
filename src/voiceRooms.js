// src/voiceRooms.js
const { ChannelType, PermissionsBitField } = require("discord.js");
const { get, run, all } = require("./db");

// In-memory tracking for voice-chat cleanup sessions.
// Key format: `${guildId}:${channelId}`
const vcSessionStartedAt = new Map();
const vcEmptyCleanupTimers = new Map();

function minutesToMs(m) {
  return m * 60 * 1000;
}

function vcKey(guildId, channelId) {
  return `${guildId}:${channelId}`;
}

function isVoiceLikeChannel(channel) {
  if (!channel) return false;
  return channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice;
}

async function purgeVcSessionChat(channel, sessionStartedAt) {
  // Text-in-voice exists only when the channel is text-based with a messages manager.
  if (!channel || typeof channel.isTextBased !== "function" || !channel.isTextBased() || !channel.messages) {
    return;
  }

  const cutoff = Number(sessionStartedAt || 0);
  if (!cutoff) return;

  let before;
  let scanned = 0;

  // Walk message history in chunks and delete only the current session's chat.
  while (true) {
    const batch = await channel.messages
      .fetch({ limit: 100, ...(before ? { before } : {}) })
      .catch(() => null);
    if (!batch || batch.size === 0) break;

    const messages = [...batch.values()];
    scanned += messages.length;
    before = messages[messages.length - 1]?.id;

    const toDelete = messages.filter((msg) => Number(msg.createdTimestamp || 0) >= cutoff);

    if (toDelete.length) {
      // Bulk delete recent messages when possible; fallback to per-message delete.
      const youngerThan14Days = toDelete.every((msg) => Date.now() - Number(msg.createdTimestamp || 0) < 14 * 24 * 60 * 60 * 1000);
      if (youngerThan14Days && typeof channel.bulkDelete === "function") {
        await channel.bulkDelete(toDelete.map((m) => m.id), true).catch(() => {});
      } else {
        for (const msg of toDelete) {
          await msg.delete().catch(() => {});
        }
      }
    }

    // Once we've reached messages older than the session start, stop scanning.
    const oldestInBatchTs = Number(messages[messages.length - 1]?.createdTimestamp || 0);
    if (!oldestInBatchTs || oldestInBatchTs < cutoff) break;

    // Safety guard to avoid scanning excessive history if timestamps are odd.
    if (scanned >= 1000) break;
  }
}

function cancelVcEmptyCleanup(guildId, channelId) {
  const key = vcKey(guildId, channelId);
  const existing = vcEmptyCleanupTimers.get(key);
  if (existing) {
    clearTimeout(existing);
    vcEmptyCleanupTimers.delete(key);
  }
}

function scheduleVcEmptyCleanup(guild, channel, minutes) {
  const key = vcKey(guild.id, channel.id);
  cancelVcEmptyCleanup(guild.id, channel.id);

  const timer = setTimeout(async () => {
    vcEmptyCleanupTimers.delete(key);

    const fresh = await guild.channels.fetch(channel.id).catch(() => null);
    if (!fresh || !isVoiceLikeChannel(fresh)) {
      vcSessionStartedAt.delete(key);
      return;
    }

    // Abort cleanup if anyone joined back.
    if ((fresh.members?.size || 0) > 0) return;

    const sessionStartedAt = vcSessionStartedAt.get(key);
    await purgeVcSessionChat(fresh, sessionStartedAt).catch(() => {});

    // Session ended and cleaned.
    vcSessionStartedAt.delete(key);
  }, minutesToMs(minutes));

  vcEmptyCleanupTimers.set(key, timer);
}

function updateVcSessionState(guild, channel) {
  if (!isVoiceLikeChannel(channel)) return;

  const key = vcKey(guild.id, channel.id);
  const memberCount = channel.members?.size || 0;

  if (memberCount > 0) {
    // Session starts when first user is present and no active session exists.
    if (!vcSessionStartedAt.has(key)) {
      vcSessionStartedAt.set(key, Date.now());
    }
    cancelVcEmptyCleanup(guild.id, channel.id);
    return;
  }

  // Channel is empty: schedule session chat cleanup if we had an active session.
  if (vcSessionStartedAt.has(key)) {
    const emptyMinutes = parseInt(process.env.VC_CHAT_EMPTY_CLEANUP_MINUTES || "5", 10);
    scheduleVcEmptyCleanup(guild, channel, Math.max(1, emptyMinutes));
  }
}

async function onVoiceStateUpdate(oldState, newState, client) {
  const guild = newState.guild || oldState.guild;
  if (!guild) return;

  const createChannelId = process.env.CREATE_VC_CHANNEL_ID || "1475639255899570306";
  const emptyMinutes = parseInt(process.env.PRIVATE_VC_EMPTY_MINUTES || "5", 10);
  const now = Date.now();

  const botId = client.user?.id;
  if (!botId) return;

  // Keep generic voice-session state for VC chat cleanup.
  if (oldState.channelId && oldState.channelId !== newState.channelId && oldState.channel) {
    updateVcSessionState(guild, oldState.channel);
  }
  if (newState.channelId && newState.channel) {
    updateVcSessionState(guild, newState.channel);
  }

  // ─────────────────────────────────────────────
  // 1) If user joined the "create a private vc" channel, create VC + paired text channel
  // ─────────────────────────────────────────────
  if (!oldState.channelId && newState.channelId) {
    const joined = newState.channel;

    if (joined && joined.id === createChannelId) {
      const owner = newState.member;
      if (!owner) return;

      // Pick category: env > create-channel parent > none
      const categoryId = process.env.PRIVATE_VC_CATEGORY_ID || joined.parentId || null;

      const baseName = `${owner.user.username}'s VC`.slice(0, 90);

      // ✅ VC is public: everyone can view/join/speak
      // ✅ Owner is allowed as well
      // ✅ Bot is explicitly allowed to manage/move
      const voiceOverwrites = [
        {
          id: guild.roles.everyone.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.Connect,
            PermissionsBitField.Flags.Speak
          ]
        },
        {
          id: owner.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.Connect,
            PermissionsBitField.Flags.Speak
          ]
        },
        {
          id: botId,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.Connect,
            PermissionsBitField.Flags.Speak,
            PermissionsBitField.Flags.ManageChannels,
            PermissionsBitField.Flags.MoveMembers
          ]
        }
      ];

      const voiceChannel = await guild.channels.create({
        name: baseName,
        type: ChannelType.GuildVoice,
        parent: categoryId || undefined,
        permissionOverwrites: voiceOverwrites
      });

      // ✅ Command channel: only owner, admins, and managers can view
      // ✅ Owner can send messages
      // ✅ Admins/Managers can send due to server perms
      // ✅ Bot can send/read/manage
      const textOverwrites = [
        {
          id: guild.roles.everyone.id,
          deny: [
            PermissionsBitField.Flags.ViewChannel
          ]
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

      // Allow roles with admin/manager permissions to view
      for (const [, role] of guild.roles.cache) {
        if (role.permissions.has(PermissionsBitField.Flags.Administrator) ||
            role.permissions.has(PermissionsBitField.Flags.ManageGuild) ||
            role.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
          textOverwrites.push({
            id: role.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory
            ]
          });
        }
      }

      // Bot permissions
      textOverwrites.push({
        id: botId,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.ManageChannels
        ]
      });

      const textChannel = await guild.channels.create({
        name: `${owner.user.username}-vc-commands`.slice(0, 90),
        type: ChannelType.GuildText,
        parent: categoryId || undefined,
        permissionOverwrites: textOverwrites
      });

      // Save to DB
      await run(
        `INSERT INTO private_voice_rooms
         (guild_id, owner_id, voice_channel_id, text_channel_id, created_at, last_active_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (guild_id, voice_channel_id)
         DO UPDATE SET
           owner_id = EXCLUDED.owner_id,
           text_channel_id = EXCLUDED.text_channel_id,
           created_at = EXCLUDED.created_at,
           last_active_at = EXCLUDED.last_active_at`,
        [guild.id, owner.id, voiceChannel.id, textChannel.id, now, now]
      );

      // Move creator into their new VC
      try {
        await owner.voice.setChannel(voiceChannel);
      } catch (e) {
        console.error("Failed to move member into private VC. Check Move Members permission:", e);
      }

      // Send command list message
      try {
        await textChannel.send(
          `This channel controls **${voiceChannel.name}**.\n` +
            `Commands (owner/admin/manager only):\n` +
            `• \`!voice-limit <0-99>\`\n` +
            `• \`!voice-lock\` / \`!voice-unlock\`\n` +
            `• \`!voice-rename <name>\`\n` +
            `• \`!voice-ban @user\`\n\n` +
            `When the VC stays empty for **${emptyMinutes} minutes**, both channels will auto-delete.`
        );
      } catch (e) {
        console.error("Failed to send command list into the VC text channel:", e);
      }

      return;
    }
  }

  // ─────────────────────────────────────────────
  // 2) Track activity for cleanup
  // ─────────────────────────────────────────────

  // If someone left a tracked VC and it became empty, mark last_active_at
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

  // If someone joined a tracked VC, update last_active_at
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

    // If voice channel is gone, clean DB + text
    if (!voice) {
      if (text) await text.delete("Orphaned private VC text channel").catch(() => {});
      await run(
        `DELETE FROM private_voice_rooms WHERE guild_id=? AND voice_channel_id=?`,
        [r.guild_id, r.voice_channel_id]
      );
      continue;
    }

    // Only delete if empty long enough
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