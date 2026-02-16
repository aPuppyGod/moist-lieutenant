require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  ChannelType
} = require("discord.js");

const { initDb, get, run } = require("./db");
const { levelFromXp } = require("./xp");
const { handleCommands } = require("./commands");
const { onVoiceStateUpdate, cleanupPrivateRooms } = require("./voiceRooms");
const { getGuildSettings } = require("./settings");
const { getLevelRoles } = require("./settings");
const { getIgnoredChannels } = require("./settings");
const { startDashboard } = require("./dashboard");

// ─────────────────────────────────────────────────────
// Helper functions
// ─────────────────────────────────────────────────────

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function formatLevelUpMessage(template, { user, level, xp }) {
  // ⚠️ MESSAGE KEPT *EXACTLY* AS REQUESTED
  return String(
    template ||
      "🎉 Congratumalations {user}! you just advanced to the next **Lop Level {level}**! 🍪✨"
  )
    .replaceAll("{user}", user)
    .replaceAll("{level}", String(level))
    .replaceAll("{xp}", String(xp));
}

async function handleLevelUp(guild, userId, oldLevel, newLevel, message = null) {
  const settings = await getGuildSettings(guild.id);

  // Announcement if message provided
  if (message) {
    const text = formatLevelUpMessage(settings.level_up_message, {
      user: `${message.author}`,
      level: newLevel,
      xp: await get(`SELECT xp FROM user_xp WHERE guild_id=? AND user_id=?`, [guild.id, userId]).then(r => r.xp)
    });

    let targetChannel = message.channel;

    if (settings.level_up_channel_id) {
      const ch = await guild.channels
        .fetch(settings.level_up_channel_id)
        .catch(() => null);

      if (ch && typeof ch.isTextBased === "function" && ch.isTextBased()) {
        targetChannel = ch;
      }
    }

    await targetChannel.send(text).catch(() => {});
  }

  // Assign all level roles for levels <= newLevel
  const levelRoles = await getLevelRoles(guild.id);
  if (levelRoles.length) {
    try {
      const member = await guild.members.fetch(userId);
      // All roles for levels <= newLevel
      const eligibleRoles = levelRoles.filter(r => r.level <= newLevel).map(r => r.role_id);
      for (const roleId of eligibleRoles) {
        const role = await guild.roles.fetch(roleId).catch(() => null);
        if (role && !member.roles.cache.has(role.id)) {
          await member.roles.add(role);
        }
      }
    } catch (e) {
      console.error("Failed to assign level roles:", e);
    }
  }
}

// ─────────────────────────────────────────────────────
// XP Helpers
// ─────────────────────────────────────────────────────

async function ensureUserRow(guildId, userId) {
  await run(
    `INSERT INTO user_xp
     (guild_id, user_id, xp, level, last_message_xp_at, last_reaction_xp_at)
     VALUES (?, ?, 0, 0, 0, 0)
     ON CONFLICT (guild_id, user_id) DO NOTHING`,
    [guildId, userId]
  );
} // ✅ THIS was missing

async function addXp(guildId, userId, amount) {
  await ensureUserRow(guildId, userId);

  const row = await get(
    `SELECT xp, level FROM user_xp WHERE guild_id=? AND user_id=?`,
    [guildId, userId]
  );

  const newXp = row.xp + amount;
  const newLevel = levelFromXp(newXp);

  await run(
    `UPDATE user_xp SET xp=?, level=? WHERE guild_id=? AND user_id=?`,
    [newXp, newLevel, guildId, userId]
  );

  return {
    oldLevel: row.level,
    newLevel,
    newXp
  };
}

// ─────────────────────────────────────────────────────
// Client
// ─────────────────────────────────────────────────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// ─────────────────────────────────────────────────────
// Ready
// ─────────────────────────────────────────────────────

client.once(Events.ClientReady, async () => {
  await initDb();
  console.log(`Logged in as ${client.user.tag}`);

  // Dashboard
  startDashboard(client);

  // Cleanup private VCs
  setInterval(() => {
    cleanupPrivateRooms(client).catch(() => {});
  }, 30_000);

  // Voice XP every minute
  setInterval(async () => {
    const voiceXp = parseInt(process.env.VOICE_XP_PER_MINUTE || "5", 10);

    for (const [, guild] of client.guilds.cache) {
      const ignoredChannels = await getIgnoredChannels(guild.id);
      await guild.members.fetch().catch(() => {});

      for (const [, member] of guild.members.cache) {
        if (member.user.bot) continue;
        if (!member.voice?.channelId) continue;

        // Check if voice channel is ignored
        const isIgnored = ignoredChannels.some(c => c.channel_id === member.voice.channelId && c.channel_type === "voice");
        if (isIgnored) continue;

        const res = await addXp(guild.id, member.id, voiceXp);
        if (res.newLevel > res.oldLevel) {
          await handleLevelUp(guild, member.id, res.oldLevel, res.newLevel);
        }
      }
    }
  }, 60_000);
});



// ─────────────────────────────────────────────────────
// Message XP + Commands
// ─────────────────────────────────────────────────────

client.on(Events.MessageCreate, async (message) => {
  // Commands first (important)
  await handleCommands(message);

  if (!message.guild || message.author.bot) return;

  console.log("[MSG]", message.guild?.id, message.channel?.id, message.author?.tag, message.content);

  // Check if channel is ignored
  const ignoredChannels = await getIgnoredChannels(message.guild.id);
  const isIgnored = ignoredChannels.some(c => c.channel_id === message.channel.id && c.channel_type === "text");
  if (isIgnored) return;

  const guildId = message.guild.id;
  const userId = message.author.id;

  const cooldownMs =
    parseInt(process.env.MESSAGE_XP_COOLDOWN_SECONDS || "60", 10) * 1000;
  const minXp = parseInt(process.env.MESSAGE_XP_MIN || "15", 10);
  const maxXp = parseInt(process.env.MESSAGE_XP_MAX || "25", 10);

  await ensureUserRow(guildId, userId);

  const row = await get(
    `SELECT last_message_xp_at FROM user_xp WHERE guild_id=? AND user_id=?`,
    [guildId, userId]
  );

  const now = Date.now();
  if (now - row.last_message_xp_at < cooldownMs) return;

  const gained = randInt(minXp, maxXp);
  const res = await addXp(guildId, userId, gained);

  await run(
    `UPDATE user_xp SET last_message_xp_at=? WHERE guild_id=? AND user_id=?`,
    [now, guildId, userId]
  );

  // ── Level-up announcement ──
  if (res.newLevel > res.oldLevel) {
    await handleLevelUp(message.guild, message.author.id, res.oldLevel, res.newLevel, message);
  }
});

// ─────────────────────────────────────────────────────
// Reaction XP
// ─────────────────────────────────────────────────────

client.on(Events.MessageReactionAdd, async (reaction, user) => {
  if (user.bot) return;

  const msg = reaction.message.partial
    ? await reaction.message.fetch().catch(() => null)
    : reaction.message;

  if (!msg || !msg.guild) return;

  const guildId = msg.guild.id;
  const userId = user.id;

  const cooldownMs =
    parseInt(process.env.REACTION_XP_COOLDOWN_SECONDS || "30", 10) * 1000;
  const gained = parseInt(process.env.REACTION_XP || "3", 10);

  await ensureUserRow(guildId, userId);

  const row = await get(
    `SELECT last_reaction_xp_at FROM user_xp WHERE guild_id=? AND user_id=?`,
    [guildId, userId]
  );

  const now = Date.now();
  if (now - row.last_reaction_xp_at < cooldownMs) return;

  const res = await addXp(guildId, userId, gained);
  await run(
    `UPDATE user_xp SET last_reaction_xp_at=? WHERE guild_id=? AND user_id=?`,
    [now, guildId, userId]
  );

  if (res.newLevel > res.oldLevel) {
    await handleLevelUp(msg.guild, userId, res.oldLevel, res.newLevel);
  }
});

// ─────────────────────────────────────────────────────
// Private VC system
// ─────────────────────────────────────────────────────

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  onVoiceStateUpdate(oldState, newState, client).catch((err) => {
    console.error("VoiceStateUpdate handler error:", err);
  });
});

// ─────────────────────────────────────────────────────
// Error Handling
// ─────────────────────────────────────────────────────

process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

client.on('error', (error) => {
  console.error('Discord client error:', error);
});

// ─────────────────────────────────────────────────────
// Login
// ─────────────────────────────────────────────────────

client.login(process.env.DISCORD_TOKEN).catch((error) => {
  console.error('Failed to login to Discord:', error);
  process.exit(1);
});