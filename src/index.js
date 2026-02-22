require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  AuditLogEvent,
  ChannelType
} = require("discord.js");

const { initDb, get, run } = require("./db");
const { levelFromXp } = require("./xp");
const { handleCommands, handleSlashCommand, registerSlashCommands } = require("./commands");
const { onVoiceStateUpdate, cleanupPrivateRooms } = require("./voiceRooms");
const { getGuildSettings } = require("./settings");
const { getLevelRoles } = require("./settings");
const { getIgnoredChannels } = require("./settings");
const { startDashboard } = require("./dashboard");
const unidecode = require('unidecode');

process.on("unhandledRejection", (reason) => {
  console.error("[process] Unhandled promise rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("[process] Uncaught exception:", error);
});

// ─────────────────────────────────────────────────────
// Helper functions
// ─────────────────────────────────────────────────────

function normalizeText(text) {
  // Custom map for special characters and symbols that resemble letters
  const customMap = {
    // Circled letters
    'Ⓐ': 'a', 'Ⓑ': 'b', 'Ⓒ': 'c', 'Ⓓ': 'd', 'Ⓔ': 'e', 'Ⓕ': 'f', 'Ⓖ': 'g', 'Ⓗ': 'h', 'Ⓘ': 'i', 'Ⓙ': 'j',
    'Ⓚ': 'k', 'Ⓛ': 'l', 'Ⓜ': 'm', 'Ⓝ': 'n', 'Ⓞ': 'o', 'Ⓟ': 'p', 'Ⓠ': 'q', 'Ⓡ': 'r', 'Ⓢ': 's', 'Ⓣ': 't',
    'Ⓤ': 'u', 'Ⓥ': 'v', 'Ⓦ': 'w', 'Ⓧ': 'x', 'Ⓨ': 'y', 'Ⓩ': 'z',
    'ⓐ': 'a', 'ⓑ': 'b', 'ⓒ': 'c', 'ⓓ': 'd', 'ⓔ': 'e', 'ⓕ': 'f', 'ⓖ': 'g', 'ⓗ': 'h', 'ⓘ': 'i', 'ⓙ': 'j',
    'ⓚ': 'k', 'ⓛ': 'l', 'ⓜ': 'm', 'ⓝ': 'n', 'ⓞ': 'o', 'ⓟ': 'p', 'ⓠ': 'q', 'ⓡ': 'r', 'ⓢ': 's', 'ⓣ': 't',
    'ⓤ': 'u', 'ⓥ': 'v', 'ⓦ': 'w', 'ⓧ': 'x', 'ⓨ': 'y', 'ⓩ': 'z',
    // Fullwidth
    'ａ': 'a', 'ｂ': 'b', 'ｃ': 'c', 'ｄ': 'd', 'ｅ': 'e', 'ｆ': 'f', 'ｇ': 'g', 'ｈ': 'h', 'ｉ': 'i', 'ｊ': 'j',
    'ｋ': 'k', 'ｌ': 'l', 'ｍ': 'm', 'ｎ': 'n', 'ｏ': 'o', 'ｐ': 'p', 'ｑ': 'q', 'ｒ': 'r', 'ｓ': 's', 'ｔ': 't',
    'ｕ': 'u', 'ｖ': 'v', 'ｗ': 'w', 'ｘ': 'x', 'ｙ': 'y', 'ｚ': 'z',
    // Parenthesized
    '⒜': 'a', '⒝': 'b', '⒞': 'c', '⒟': 'd', '⒠': 'e', '⒡': 'f', '⒢': 'g', '⒣': 'h', '⒤': 'i', '⒥': 'j',
    '⒦': 'k', '⒧': 'l', '⒨': 'm', '⒩': 'n', '⒪': 'o', '⒫': 'p', '⒬': 'q', '⒭': 'r', '⒮': 's', '⒯': 't',
    '⒰': 'u', '⒱': 'v', '⒲': 'w', '⒳': 'x', '⒴': 'y', '⒵': 'z',
    // Squared
    '🄰': 'a', '🄱': 'b', '🄲': 'c', '🄳': 'd', '🄴': 'e', '🄵': 'f', '🄶': 'g', '🄷': 'h', '🄸': 'i', '🄹': 'j',
    '🄺': 'k', '🄻': 'l', '🄼': 'm', '🄽': 'n', '🄾': 'o', '🄿': 'p', '🅀': 'q', '🅁': 'r', '🅂': 's', '🅃': 't',
    '🅄': 'u', '🅅': 'v', '🅆': 'w', '🅇': 'x', '🅈': 'y', '🅉': 'z',
    // Negative circled
    '🅐': 'a', '🅑': 'b', '🅒': 'c', '🅓': 'd', '🅔': 'e', '🅕': 'f', '🅖': 'g', '🅗': 'h', '🅘': 'i', '🅙': 'j',
    '🅚': 'k', '🅛': 'l', '🅜': 'm', '🅝': 'n', '🅞': 'o', '🅟': 'p', '🅠': 'q', '🅡': 'r', '🅢': 's', '🅣': 't',
    '🅤': 'u', '🅥': 'v', '🅦': 'w', '🅧': 'x', '🅨': 'y', '🅩': 'z',
    // Regional indicator (but those are flags)
    // Add specific examples if known
    '⊑': 'l', '⍜': 'o', '⌿': 'p',  // Assuming these represent l, o, p based on context
    '↳': 'l', '✺': 'o', '℘': 'p',  // New examples
    // Add more symbol mappings that resemble letters
    '↴': 'l', '↓': 'l', '←': 'l', '→': 'l', '↑': 'l',  // Arrows for l/i
    '★': 'o', '☆': 'o', '✦': 'o', '✧': 'o', '✩': 'o', '✪': 'o', '✫': 'o', '✬': 'o', '✭': 'o', '✮': 'o',  // Stars for o
    'ρ': 'p', 'π': 'p', 'φ': 'p', 'ψ': 'p',  // Greek letters resembling p
    'ι': 'i', 'ι': 'i', 'ι': 'i',  // Greek iota for i
    'α': 'a', 'β': 'b', 'γ': 'c', 'δ': 'd', 'ε': 'e', 'ζ': 'z', 'η': 'h', 'θ': 'o', 'κ': 'k', 'λ': 'l', 'μ': 'm', 'ν': 'n', 'ξ': 'x', 'ο': 'o', 'π': 'p', 'ρ': 'p', 'σ': 's', 'τ': 't', 'υ': 'u', 'φ': 'p', 'χ': 'x', 'ψ': 'p', 'ω': 'o',  // Greek letters
    'а': 'a', 'б': 'b', 'в': 'b', 'г': 'r', 'д': 'd', 'е': 'e', 'ё': 'e', 'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'i', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'h', 'о': 'o', 'п': 'p', 'р': 'p', 'с': 'c', 'т': 't', 'у': 'y', 'ф': 'f', 'х': 'x', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sh', 'ъ': 'hard', 'ы': 'y', 'ь': 'soft', 'э': 'e', 'ю': 'yu', 'я': 'ya',  // Cyrillic
    // Add more as needed
  };

  // First apply custom map, then unidecode for remaining
  let normalized = text.replace(/./g, char => customMap[char] || char);
  return unidecode(normalized);
}

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
  try {
    await initDb();
    console.log(`Logged in as ${client.user.tag}`);

    await registerSlashCommands(client).catch((err) => {
      console.error("Slash command registration failed:", err);
    });

    startDashboard(client);

    setInterval(() => {
      cleanupPrivateRooms(client).catch((err) => {
        console.error("cleanupPrivateRooms failed:", err);
      });
    }, 30_000);

    setInterval(async () => {
      try {
        const voiceXp = parseInt(process.env.VOICE_XP_PER_MINUTE || "5", 10);

        for (const [, guild] of client.guilds.cache) {
          const ignoredChannels = await getIgnoredChannels(guild.id);
          await guild.members.fetch().catch(() => {});

          for (const [, member] of guild.members.cache) {
            if (member.user.bot) continue;
            if (!member.voice?.channelId) continue;

            const isIgnored = ignoredChannels.some(c => c.channel_id === member.voice.channelId && c.channel_type === "voice");
            if (isIgnored) continue;

            const res = await addXp(guild.id, member.id, voiceXp);
            if (res.newLevel > res.oldLevel) {
              await handleLevelUp(guild, member.id, res.oldLevel, res.newLevel);
            }
          }
        }
      } catch (err) {
        console.error("Voice XP interval failed:", err);
      }
    }, 60_000);
  } catch (err) {
    console.error("ClientReady startup failed:", err);
  }
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

  // React to special words
  const content = message.content.toLowerCase();
  const normalizedContent = normalizeText(content);
  if (content.includes('riley')) {
    await message.react('🍪').catch(() => {});
  }
  if (content.includes('blebber')) {
    await message.react('🐢').catch(() => {});
  }
  if (content.includes('goodnight') || content.includes('good night')) {
    await message.react('<:eepy:1374218096209821757>').catch(() => {});
  }
  if (content.includes('good morning') || content.includes('goodmorning')) {
    await message.react('<:happi:1377138319049232384>').catch(() => {});
  }
  if (content.includes('bean')) {
    await message.react(':Cheesecake:').catch(() => {});
  }
  if (normalizedContent.includes('mido') || normalizedContent.includes('midory') || normalizedContent.includes('midoryi') || normalizedContent.includes('seka') || normalizedContent.includes('midoryiseka') || normalizedContent.includes('lop') || normalizedContent.includes('loppy') || normalizedContent.includes('loptube') || normalizedContent.includes('antoine')) {
    await message.react('🦝').catch(() => {});
  }

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
// Timeout Warning for Manager
// ─────────────────────────────────────────────────────

client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  const MANAGER_ID = "900758140499398676"; // From commands.js
  if (newMember.id !== MANAGER_ID) return;

  // Check if timed out
  if (!oldMember.communicationDisabledUntil && newMember.communicationDisabledUntil) {
    // Manager got timed out
    try {
      const auditLogs = await newMember.guild.fetchAuditLogs({
        type: AuditLogEvent.MemberUpdate,
        limit: 1
      });
      const log = auditLogs.entries.first();
      if (log && log.target.id === MANAGER_ID && log.executor && !log.executor.bot) {
        const executor = log.executor;
        // Send warning to a channel
        const channel = await newMember.guild.channels.fetch('1419429328592310333').catch(() => null);
        if (channel) {
          try {
            await channel.send(`<@${executor.id}> YOU HAVE JUST TIMED OUT A BOT MANAGER mind you this person will NOT be able to work on the bot while timed out`);
            console.log(`✓ Manager timeout warning sent to ${channel.name}`);
          } catch (sendErr) {
            console.error("Error sending manager timeout message:", sendErr);
          }
        } else {
          console.error("Channel 1419429328592310333 not found");
        }
      }
    } catch (err) {
      console.error("Error handling manager timeout:", err);
    }
  }
});

// ─────────────────────────────────────────────────────
// Login
// ─────────────────────────────────────────────────────

if (!process.env.DISCORD_TOKEN) {
  console.error("DISCORD_TOKEN is not set. Bot login aborted.");
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN).catch((err) => {
  console.error("Discord login failed:", err);
  process.exit(1);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    await handleSlashCommand(interaction);
  } catch (err) {
    console.error("Interaction handler failed:", err);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "Command failed.", ephemeral: true }).catch(() => {});
    }
  }
});