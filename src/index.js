require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  Events
} = require("discord.js");

const { initDb, get, run } = require("./db");
const { levelFromXp } = require("./xp");
const { handleCommands } = require("./commands");
const { onVoiceStateUpdate, cleanupPrivateRooms } = require("./voiceRooms");
const { getGuildSettings } = require("./settings");
const { startDashboard } = require("./dashboard");

// ─────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function formatLevelUpMessage(template, { user, level, xp }) {
  return String(
    template ||
      "🎉 Congratumalations {user}! you just advanced to the next **Lop Level {level}**! 🍪✨"
  )
    .replaceAll("{user}", user)
    .replaceAll("{level}", String(level))
    .replaceAll("{xp}", String(xp));
}

// ─────────────────────────────────────────────────────
// XP Helpers
// ─────────────────────────────────────────────────────

async function ensureUserRow(guildId, userId) {
  await run(
    `INSERT OR IGNORE INTO user_xp 
     (guild_id, user_id, xp, level, last_message_xp_at, last_reaction_xp_at)
     VALUES (?, ?, 0, 0, 0, 0)`,
    [guildId, userId]
  );
}

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

  startDashboard(client);

  // Cleanup private VCs
  setInterval(() => {
    cleanupPrivateRooms(client).catch(() => {});
  }, 30_000);

  // Voice XP every minute
  setInterval(async () => {
    const voiceXp = parseInt(process.env.VOICE_XP_PER_MINUTE || "5", 10);

    for (const [, guild] of client.guilds.cache) {
      await guild.members.fetch().catch(() => {});

      for (const [, member] of guild.members.cache) {
        if (member.user.bot) continue;
        if (!member.voice?.channelId) continue;

        await addXp(guild.id, member.id, voiceXp).catch(() => {});
      }
    }
  }, 60_000);
});

// ─────────────────────────────────────────────────────
// Message XP + Commands
// ─────────────────────────────────────────────────────

client.on(Events.MessageCreate, async (message) => {
  await handleCommands(message);

  if (!message.guild || message.author.bot) return;

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
    const settings = await getGuildSettings(guildId);

    const text = formatLevelUpMessage(settings.level_up_message, {
      user: `${message.author}`,
      level: res.newLevel,
      xp: res.newXp
    });

    let targetChannel = message.channel;

    if (settings.level_up_channel_id) {
      const ch = await message.guild.channels
        .fetch(settings.level_up_channel_id)
        .catch(() => null);

      if (ch && ch.isTextBased && ch.isTextBased()) {
        targetChannel = ch;
      }
    }

    await targetChannel.send(text).catch(() => {});
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

  await addXp(guildId, userId, gained);
  await run(
    `UPDATE user_xp SET last_reaction_xp_at=? WHERE guild_id=? AND user_id=?`,
    [now, guildId, userId]
  );
});

// ─────────────────────────────────────────────────────
// Private VC system
// ─────────────────────────────────────────────────────

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  await onVoiceStateUpdate(oldState, newState, client);
});

// ─────────────────────────────────────────────────────
// Login
// ─────────────────────────────────────────────────────

client.login(process.env.DISCORD_TOKEN);