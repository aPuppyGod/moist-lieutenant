require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  AuditLogEvent,
  ChannelType,
  EmbedBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");
const { createCanvas } = require("canvas");

const { initDb, get, run, all } = require("./db");
const { levelFromXp } = require("./xp");
const { handleCommands, handleSlashCommand, registerSlashCommands, ensureDefaultShopItems } = require("./commands");
const { onVoiceStateUpdate, cleanupPrivateRooms } = require("./voiceRooms");
const { getGuildSettings } = require("./settings");
const { getLevelRoles } = require("./settings");
const { getIgnoredChannels } = require("./settings");
const { getLoggingExclusions } = require("./settings");
const { getLoggingEventConfigs } = require("./settings");
const { getLoggingActorExclusions } = require("./settings");
const { getAntiNukeExemptions } = require("./settings");
const { getReactionRoleQuestion, getReactionRoleOptions } = require("./settings");
const { touchTicketActivity } = require("./settings");
const { findRecentModAction } = require("./modActionTracker");
const { startDashboard } = require("./dashboard");
const { startSocialFeedNotifier } = require("./socials");
const { applyReactionRoleOnAdd, applyReactionRoleOnRemove } = require("./reactionRoles");
const { handleTicketInteraction } = require("./tickets");
const unidecode = require('unidecode');
const fs = require("fs");
const path = require("path");

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

function replaceAutoReplyPlaceholders(text, message) {
  return String(text || "")
    .replace(/{user}/gi, `<@${message.author.id}>`)
    .replace(/{username}/gi, message.author.username || "")
    .replace(/{userid}/gi, message.author.id || "")
    .replace(/{usertag}/gi, message.author.tag || "")
    .replace(/{servername}/gi, message.guild?.name || "")
    .replace(/{serverid}/gi, message.guild?.id || "")
    .replace(/{channelname}/gi, message.channel?.name || "")
    .replace(/{channelid}/gi, message.channel?.id || "")
    .replace(/{role:(\d+)}/gi, (_, id) => `<@&${id}>`)
    .replace(/{channel:(\d+)}/gi, (_, id) => `<#${id}>`);
}

function pickRandomItem(items) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)] || null;
}

function isUsableImageValue(value) {
  const image = String(value || "").trim();
  if (!image) return false;

  if (image.startsWith("dbmedia:")) return true;

  const isUploaded = image.startsWith("/uploads/") || image.startsWith("uploads/");
  if (!isUploaded) return true;

  const relativePath = image.replace(/^\/+/, "");
  const absolutePath = path.join(process.cwd(), relativePath);
  return fs.existsSync(absolutePath);
}

function pickRandomUsableImage(items) {
  const usable = (Array.isArray(items) ? items : [])
    .map((item) => String(item || "").trim())
    .filter((item) => isUsableImageValue(item));

  return pickRandomItem(usable) || "";
}

function extensionFromMime(mimeType) {
  const mime = String(mimeType || "").toLowerCase();
  if (mime.includes("gif")) return "gif";
  if (mime.includes("png")) return "png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  return "bin";
}

async function sendAutoReplyWithImage(message, textValue, imageValue) {
  const text = String(textValue || "").trim();
  const image = String(imageValue || "").trim();

  if (!image) {
    if (text) {
      await message.reply({ content: text, allowedMentions: { parse: [] } }).catch(() => {});
    }
    return;
  }

  if (image.startsWith("dbmedia:")) {
    const storageKey = image.slice("dbmedia:".length).trim();
    const media = storageKey
      ? await get(`SELECT mime_type, data_base64 FROM uploaded_media WHERE storage_key=?`, [storageKey])
      : null;

    if (!media?.data_base64) {
      if (text) {
        await message.reply({ content: text, allowedMentions: { parse: [] } }).catch(() => {});
      }
      return;
    }

    const ext = extensionFromMime(media.mime_type);
    const fileName = `${storageKey}.${ext}`;
    const attachment = new AttachmentBuilder(Buffer.from(String(media.data_base64), "base64"), { name: fileName });
    if (text) {
      await message.reply({ content: text, files: [attachment], allowedMentions: { parse: [] } }).catch(() => {});
    } else {
      await message.reply({ files: [attachment], allowedMentions: { parse: [] } }).catch(() => {});
    }
    return;
  }

  const isUploaded = image.startsWith("/uploads/") || image.startsWith("uploads/");
  if (!isUploaded) {
    const content = text ? `${text}\n${image}` : image;
    await message.reply({ content, allowedMentions: { parse: [] } }).catch(() => {});
    return;
  }

  const relativePath = image.replace(/^\/+/, "");
  const absolutePath = path.join(process.cwd(), relativePath);
  if (!fs.existsSync(absolutePath)) {
    if (text) {
      await message.reply({ content: text, allowedMentions: { parse: [] } }).catch(() => {});
    }
    return;
  }

  const fileName = `${path.basename(absolutePath)}.gif`;
  const attachment = new AttachmentBuilder(absolutePath, { name: fileName });
  if (text) {
    await message.reply({ content: text, files: [attachment], allowedMentions: { parse: [] } }).catch(() => {});
  } else {
    await message.reply({ files: [attachment], allowedMentions: { parse: [] } }).catch(() => {});
  }
}

async function processAutoReplies(message) {
  const content = String(message.content || "").trim().toLowerCase();
  if (!content) return;

  const replies = await all(
    `SELECT id, trigger_message, response_type, responses, enabled
     FROM auto_replies
     WHERE guild_id=? AND enabled=1
     ORDER BY id DESC`,
    [message.guild.id]
  );

  const matched = replies
    .filter((row) => {
      const trigger = String(row.trigger_message || "").trim().toLowerCase();
      return trigger && content.includes(trigger);
    })
    .sort((a, b) => String(b.trigger_message || "").length - String(a.trigger_message || "").length);

  const selected = matched[0];
  if (!selected) return;

  const type = String(selected.response_type || "text").toLowerCase();
  if (type === "emoji") {
    const emoji = String(selected.responses || "").trim();
    if (emoji) {
      await message.react(emoji).catch(() => {});
    }
    return;
  }

  let payload = { text: "", gifs: [], disabled_gifs: [] };
  try {
    const parsed = JSON.parse(selected.responses || "{}");
    if (Array.isArray(parsed)) {
      const first = parsed[0] || {};
      payload = {
        text: String(first.text || ""),
        gifs: Array.isArray(first.gifs) ? first.gifs : [],
        disabled_gifs: Array.isArray(first.disabled_gifs) ? first.disabled_gifs : []
      };
    } else {
      payload = {
        text: String(parsed.text || ""),
        gifs: Array.isArray(parsed.gifs) ? parsed.gifs : [],
        disabled_gifs: Array.isArray(parsed.disabled_gifs) ? parsed.disabled_gifs : []
      };
    }
  } catch {
    payload = { text: String(selected.responses || ""), gifs: [], disabled_gifs: [] };
  }

  const text = replaceAutoReplyPlaceholders(payload.text, message).trim();
  const disabledGifSet = new Set(
    (Array.isArray(payload.disabled_gifs) ? payload.disabled_gifs : [])
      .map((item) => String(item || "").trim())
      .filter(Boolean)
  );
  const selectableGifs = (Array.isArray(payload.gifs) ? payload.gifs : [])
    .map((item) => String(item || "").trim())
    .filter((item) => item && !disabledGifSet.has(item));
  const chosenImage = pickRandomUsableImage(selectableGifs);

  if (type === "text") {
    if (text) {
      await message.reply({ content: text, allowedMentions: { parse: [] } }).catch(() => {});
    }
    return;
  }

  if (type === "text_image") {
    await sendAutoReplyWithImage(message, text, chosenImage);
    return;
  }

  if (type === "image") {
    await sendAutoReplyWithImage(message, "", chosenImage);
    return;
  }

  if (text) {
    await message.reply({ content: text, allowedMentions: { parse: [] } }).catch(() => {});
  }
}

function formatDurationCompact(ms) {
  const totalSeconds = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function attachmentsToJson(message) {
  if (!message?.attachments?.size) return "[]";
  return JSON.stringify(
    [...message.attachments.values()].map((att) => ({
      name: att.name || "attachment",
      url: att.url || att.proxyURL || ""
    }))
  );
}

function readAttachmentsJson(raw) {
  try {
    const parsed = JSON.parse(String(raw || "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function formatAttachmentsList(raw) {
  const items = readAttachmentsJson(raw);
  if (!items.length) return "";
  return items
    .map((item) => {
      const name = String(item?.name || "attachment");
      const url = String(item?.url || "");
      return url ? `${name}: ${url}` : name;
    })
    .join("\n");
}

async function getOpenModmailThreadByUser(guildId, userId) {
  return await get(
    `SELECT id, guild_id, user_id, channel_id, status, created_at, last_message_at
     FROM modmail_threads
     WHERE guild_id=? AND user_id=? AND status='open'
     ORDER BY created_at DESC
     LIMIT 1`,
    [guildId, userId]
  );
}

async function getOpenModmailThreadByChannel(guildId, channelId) {
  return await get(
    `SELECT id, guild_id, user_id, channel_id, status, created_at, last_message_at
     FROM modmail_threads
     WHERE guild_id=? AND channel_id=? AND status='open'
     ORDER BY created_at DESC
     LIMIT 1`,
    [guildId, channelId]
  );
}

async function findModmailGuildForUser(userId) {
  const rows = await all(
    `SELECT guild_id, modmail_channel_id, modmail_category_id, modmail_support_role_id
     FROM guild_settings
     WHERE modmail_enabled=1 AND modmail_channel_id IS NOT NULL`
  ).catch(() => []);

  for (const row of rows) {
    const guild = client.guilds.cache.get(row.guild_id) || await client.guilds.fetch(row.guild_id).catch(() => null);
    if (!guild) continue;
    const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
    if (member) return { guild, settings: row, member };
  }

  return null;
}

async function ensureModmailThread(guild, user) {
  const settings = await getGuildSettings(guild.id).catch(() => null);
  if (!settings?.modmail_enabled || !settings.modmail_channel_id) {
    return { ok: false, reason: "Modmail is not configured for this server." };
  }

  const existing = await getOpenModmailThreadByUser(guild.id, user.id);
  if (existing?.channel_id) {
    const existingChannel = guild.channels.cache.get(existing.channel_id) || await guild.channels.fetch(existing.channel_id).catch(() => null);
    if (existingChannel) {
      return { ok: true, thread: existing, channel: existingChannel, reused: true };
    }
  }

  const inboxChannel = guild.channels.cache.get(settings.modmail_channel_id) || await guild.channels.fetch(settings.modmail_channel_id).catch(() => null);
  if (!inboxChannel) {
    return { ok: false, reason: "Configured modmail channel was not found." };
  }

  const parentId = settings.modmail_category_id || inboxChannel.parentId || undefined;
  const safeUser = String(user.username || user.id).toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 32) || user.id;
  const channelName = `modmail-${safeUser}-${String(Date.now()).slice(-4)}`.slice(0, 95);
  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionsBitField.Flags.ViewChannel]
    },
    {
      id: client.user.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.ManageChannels,
        PermissionsBitField.Flags.AttachFiles
      ]
    }
  ];

  if (settings.modmail_support_role_id) {
    overwrites.push({
      id: settings.modmail_support_role_id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.AttachFiles
      ]
    });
  }

  for (const [, role] of guild.roles.cache) {
    if (role.permissions.has(PermissionsBitField.Flags.Administrator)) {
      overwrites.push({
        id: role.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.AttachFiles
        ]
      });
    }
  }

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: parentId,
    permissionOverwrites: overwrites
  }).catch(() => null);

  if (!channel) {
    return { ok: false, reason: "Failed to create modmail channel." };
  }

  const inserted = await get(
    `INSERT INTO modmail_threads (guild_id, user_id, channel_id, status, created_at, last_message_at)
     VALUES (?, ?, ?, 'open', ?, ?)
     RETURNING id, guild_id, user_id, channel_id, status, created_at, last_message_at`,
    [guild.id, user.id, channel.id, Date.now(), Date.now()]
  );

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x7bc96f)
        .setTitle("𝕄𝕠𝕕𝕞𝕒𝕚𝕝 𝕆𝕡𝕖𝕟𝕖𝕕")
        .setDescription(`DM bridge opened for ${user.tag}. Staff messages in this channel are forwarded to the user.`)
        .addFields(
          { name: "User", value: `${user.tag} (${user.id})`, inline: true },
          { name: "Close", value: "Use `!modmail close` in this channel to close the thread.", inline: false }
        )
        .setTimestamp(new Date())
    ]
  }).catch(() => {});

  return { ok: true, thread: inserted, channel, reused: false };
}

async function forwardUserDmToModmail(message) {
  const target = await findModmailGuildForUser(message.author.id);
  if (!target) {
    await message.reply("Modmail is not enabled for any shared server.").catch(() => {});
    return true;
  }

  const threadResult = await ensureModmailThread(target.guild, message.author);
  if (!threadResult.ok || !threadResult.channel) {
    await message.reply(threadResult.reason || "I could not open modmail.").catch(() => {});
    return true;
  }

  const attachmentText = formatAttachmentsList(attachmentsToJson(message));
  const content = String(message.content || "").trim() || "(no text)";
  await threadResult.channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle(threadResult.reused ? "𝕄𝕠𝕕𝕞𝕒𝕚𝕝 ℝ𝕖𝕡𝕝𝕪" : "ℕ𝕖𝕨 𝕄𝕠𝕕𝕞𝕒𝕚𝕝 𝕄𝕖𝕤𝕤𝕒𝕘𝕖")
        .setDescription(content)
        .addFields(
          { name: "From", value: `${message.author.tag} (${message.author.id})`, inline: true },
          ...(attachmentText ? [{ name: "Attachments", value: attachmentText }] : [])
        )
        .setTimestamp(new Date())
    ]
  }).catch(() => {});

  await run(`UPDATE modmail_threads SET last_message_at=? WHERE id=?`, [Date.now(), threadResult.thread.id]).catch(() => {});
  await message.react("📨").catch(() => {});
  return true;
}

async function relayModmailChannelMessage(message) {
  if (!message?.guild || !message.channelId) return false;
  const thread = await getOpenModmailThreadByChannel(message.guild.id, message.channelId);
  if (!thread) return false;

  const settings = await getGuildSettings(message.guild.id).catch(() => null);
  const isSupport = Boolean(settings?.modmail_support_role_id && message.member?.roles?.cache?.has(settings.modmail_support_role_id));
  const isAdmin = Boolean(message.member?.permissions?.has(PermissionsBitField.Flags.Administrator));
  if (!isSupport && !isAdmin) return false;

  const prefix = String(settings?.command_prefix || "!").trim() || "!";
  if (String(message.content || "").startsWith(prefix)) return true;

  const user = await client.users.fetch(thread.user_id).catch(() => null);
  if (!user) return true;

  const attachmentText = formatAttachmentsList(attachmentsToJson(message));
  const content = String(message.content || "").trim() || "(no text)";
  await user.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0xa8d5a8)
        .setTitle(`Reply from ${message.guild.name}`)
        .setDescription(content)
        .addFields(
          { name: "Staff", value: `${message.author.tag}`, inline: true },
          ...(attachmentText ? [{ name: "Attachments", value: attachmentText }] : [])
        )
        .setTimestamp(new Date())
    ]
  }).catch(() => {});

  await run(`UPDATE modmail_threads SET last_message_at=? WHERE id=?`, [Date.now(), thread.id]).catch(() => {});
  return true;
}

async function closeModmailThread(guild, channelId) {
  const thread = await getOpenModmailThreadByChannel(guild.id, channelId);
  if (!thread) return { ok: false, reason: "This channel is not an open modmail thread." };

  await run(`UPDATE modmail_threads SET status='closed', closed_at=?, last_message_at=? WHERE id=?`, [Date.now(), Date.now(), thread.id]);
  const user = await client.users.fetch(thread.user_id).catch(() => null);
  if (user) {
    await user.send(`Your modmail thread for **${guild.name}** has been closed.`).catch(() => {});
  }
  return { ok: true, thread };
}

async function storeDeletedMessageForSnipe(message) {
  const settings = await getGuildSettings(message.guild.id).catch(() => null);
  if (!settings?.snipe_enabled) return;

  await run(
    `INSERT INTO snipe_messages (guild_id, channel_id, message_id, author_id, content, attachments_json, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      message.guild.id,
      message.channel.id,
      message.id,
      message.author?.id || null,
      String(message.content || ""),
      attachmentsToJson(message),
      Date.now()
    ]
  ).catch(() => {});
}

async function storeEditedMessageForSnipe(oldMessage, newMessage) {
  const settings = await getGuildSettings(newMessage.guild.id).catch(() => null);
  if (!settings?.snipe_enabled) return;

  await run(
    `INSERT INTO edit_snipes (guild_id, channel_id, message_id, author_id, before_content, after_content, attachments_json, edited_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newMessage.guild.id,
      newMessage.channel.id,
      newMessage.id,
      newMessage.author?.id || null,
      String(oldMessage.content || ""),
      String(newMessage.content || ""),
      attachmentsToJson(newMessage),
      Date.now()
    ]
  ).catch(() => {});
}

function permissionDiffLines(oldPermissions, newPermissions) {
  const oldSet = new PermissionsBitField(oldPermissions);
  const newSet = new PermissionsBitField(newPermissions);
  const added = [];
  const removed = [];
  for (const [name, bit] of Object.entries(PermissionsBitField.Flags)) {
    const hadOld = oldSet.has(bit);
    const hasNew = newSet.has(bit);
    if (hadOld === hasNew) continue;
    if (hasNew) added.push(name);
    else removed.push(name);
  }

  const lines = [];
  if (added.length) lines.push(`Added: ${added.join(", ")}`);
  if (removed.length) lines.push(`Removed: ${removed.join(", ")}`);
  return lines;
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
    .replaceAll("{xp}", String(xp))
    .replace(/{role:(\d+)}/gi, (_, id) => `<@&${id}>`)
    .replace(/{channel:(\d+)}/gi, (_, id) => `<#${id}>`);
}

const LOG_THEME = {
  info: 0x7bc96f,
  warn: 0x8b7355,
  mod: 0xa8d5a8,
  neutral: 0x0a1e1e
};

const BOT_MANAGER_ID = process.env.BOT_MANAGER_ID || "900758140499398676";
const QUICK_MUTE_MS = 10 * 60_000;
const DEFAULT_ANTI_NUKE_WINDOW_MS = 30_000;
const DEFAULT_ANTI_NUKE_COOLDOWN_MS = 10 * 60_000;
const ANTI_NUKE_UNLOCK_INTERVAL_MS = 60_000;
const TICKET_SLA_INTERVAL_MS = 2 * 60_000;
const DEFAULT_ANTI_NUKE_THRESHOLDS = {
  channel_delete: 3,
  role_delete: 3,
  ban_add: 4
};
const antiNukeBuckets = new Map();
const antiNukeCooldowns = new Map();

function trimText(value, max = 1000) {
  const text = String(value ?? "");
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function scoreJoinRisk(member) {
  const user = member?.user;
  if (!user) {
    return { score: 0, reasons: ["No user data"] };
  }

  const reasons = [];
  let score = 0;

  const accountAgeMs = Date.now() - Number(user.createdTimestamp || 0);
  const ageDays = accountAgeMs / (24 * 60 * 60 * 1000);
  if (ageDays < 1) {
    score += 50;
    reasons.push("Account age under 1 day");
  } else if (ageDays < 3) {
    score += 35;
    reasons.push("Account age under 3 days");
  } else if (ageDays < 7) {
    score += 20;
    reasons.push("Account age under 7 days");
  } else if (ageDays < 30) {
    score += 10;
    reasons.push("Account age under 30 days");
  }

  if (!user.avatar) {
    score += 15;
    reasons.push("Default profile avatar");
  }

  const username = String(user.username || "");
  const digits = (username.match(/\d/g) || []).length;
  if (digits >= 5) {
    score += 10;
    reasons.push("Username has many digits");
  }

  if (!user.globalName) {
    score += 5;
    reasons.push("No global display name");
  }

  if (username.length <= 3) {
    score += 10;
    reasons.push("Very short username");
  }

  return {
    score: Math.min(100, score),
    reasons: reasons.length ? reasons : ["No risk signals"]
  };
}

async function triggerAntiNukeIfNeeded(guild, eventType, actorUserId) {
  if (!guild || !eventType || !actorUserId) return;
  if (actorUserId === BOT_MANAGER_ID) return;

  const settings = await getGuildSettings(guild.id).catch(() => null);
  if (settings?.anti_nuke_enabled === false) return;

  const antiNukeExemptions = await getAntiNukeExemptions(guild.id).catch(() => []);
  if (antiNukeExemptions.length) {
    const exemptUsers = new Set(antiNukeExemptions.filter((e) => e.target_type === "user").map((e) => e.target_id));
    if (exemptUsers.has(actorUserId)) return;

    const exemptRoles = new Set(antiNukeExemptions.filter((e) => e.target_type === "role").map((e) => e.target_id));
    if (exemptRoles.size) {
      const actorMember = guild.members.cache.get(actorUserId) || await guild.members.fetch(actorUserId).catch(() => null);
      if (actorMember && actorMember.roles.cache.some((role) => exemptRoles.has(role.id))) return;
    }
  }

  const autoUnlockMinutes = Math.min(1440, Math.max(0, Number(settings?.anti_nuke_auto_unlock_minutes ?? 0)));
  const configuredWindowSeconds = Number(settings?.anti_nuke_window_seconds ?? 30);
  const configuredCooldownMinutes = Number(settings?.anti_nuke_cooldown_minutes ?? 10);
  const windowMs = Number.isFinite(configuredWindowSeconds)
    ? Math.min(300_000, Math.max(5_000, configuredWindowSeconds * 1000))
    : DEFAULT_ANTI_NUKE_WINDOW_MS;
  const cooldownMs = Number.isFinite(configuredCooldownMinutes)
    ? Math.min(7_200_000, Math.max(60_000, configuredCooldownMinutes * 60_000))
    : DEFAULT_ANTI_NUKE_COOLDOWN_MS;

  const thresholds = {
    channel_delete: Math.min(20, Math.max(0, Number(settings?.anti_nuke_channel_delete_threshold ?? DEFAULT_ANTI_NUKE_THRESHOLDS.channel_delete))),
    role_delete: Math.min(20, Math.max(0, Number(settings?.anti_nuke_role_delete_threshold ?? DEFAULT_ANTI_NUKE_THRESHOLDS.role_delete))),
    ban_add: Math.min(30, Math.max(0, Number(settings?.anti_nuke_ban_add_threshold ?? DEFAULT_ANTI_NUKE_THRESHOLDS.ban_add)))
  };

  const threshold = thresholds[eventType];
  if (!threshold) return;

  const now = Date.now();
  const bucketKey = `${guild.id}:${eventType}:${actorUserId}`;
  const old = antiNukeBuckets.get(bucketKey) || [];
  const recent = old.filter((ts) => now - ts < windowMs);
  recent.push(now);
  antiNukeBuckets.set(bucketKey, recent);

  if (recent.length < threshold) return;

  const cooldownKey = `${guild.id}:${eventType}`;
  const last = antiNukeCooldowns.get(cooldownKey) || 0;
  if (now - last < cooldownMs) return;
  antiNukeCooldowns.set(cooldownKey, now);

  const everyone = guild.roles.everyone;
  const lockdownPerms = {};
  const lockedNames = [];
  if (settings?.anti_nuke_lock_manage_channels !== false) {
    lockdownPerms.ManageChannels = false;
    lockedNames.push("Manage Channels");
  }
  if (settings?.anti_nuke_lock_manage_roles !== false) {
    lockdownPerms.ManageRoles = false;
    lockedNames.push("Manage Roles");
  }
  if (settings?.anti_nuke_lock_ban_members !== false) {
    lockdownPerms.BanMembers = false;
    lockedNames.push("Ban Members");
  }
  if (settings?.anti_nuke_lock_kick_members !== false) {
    lockdownPerms.KickMembers = false;
    lockedNames.push("Kick Members");
  }
  if (settings?.anti_nuke_lock_manage_webhooks !== false) {
    lockdownPerms.ManageWebhooks = false;
    lockedNames.push("Manage Webhooks");
  }

  if (Object.keys(lockdownPerms).length) {
    for (const [, channel] of guild.channels.cache) {
      if (!channel?.permissionOverwrites?.edit) continue;
      await channel.permissionOverwrites.edit(everyone, lockdownPerms, {
        reason: `Anti-nuke lockdown: ${eventType}`
      }).catch(() => {});
    }

    if (autoUnlockMinutes > 0) {
      const runAt = now + autoUnlockMinutes * 60_000;
      await run(
        `UPDATE anti_nuke_unlock_jobs SET executed_at=? WHERE guild_id=? AND executed_at IS NULL`,
        [now, guild.id]
      ).catch(() => {});
      await run(
        `INSERT INTO anti_nuke_unlock_jobs (guild_id, run_at, unlock_perms_json, created_at, executed_at)
         VALUES (?, ?, ?, ?, NULL)`,
        [guild.id, runAt, JSON.stringify(Object.keys(lockdownPerms)), now]
      ).catch(() => {});
    }
  }

  await run(
    `INSERT INTO anti_nuke_incidents (guild_id, incident_type, event_type, actor_user_id, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      guild.id,
      "trigger",
      eventType,
      actorUserId,
      JSON.stringify({
        trigger_count: recent.length,
        window_seconds: Math.floor(windowMs / 1000),
        locked_permissions: lockedNames,
        auto_unlock_minutes: autoUnlockMinutes
      }),
      now
    ]
  ).catch(() => {});

  const actorLabel = await labelFromUserId(guild, actorUserId);
  const alertRoleId = settings?.anti_nuke_alert_role_id ? String(settings.anti_nuke_alert_role_id).trim() : "";
  await sendGuildLog(guild, {
    eventKey: "anti_nuke_trigger",
    forceChannelId: settings?.anti_nuke_alert_channel_id || settings?.log_channel_id || null,
    content: alertRoleId ? `<@&${alertRoleId}>` : undefined,
    allowedRoleMentions: alertRoleId ? [alertRoleId] : [],
    actorUserId,
    color: LOG_THEME.warn,
    title: "🚨 Anti-Nuke Triggered",
    description: `Protective lockdown activated after suspicious ${eventType.replaceAll("_", " ")} activity.`,
    fields: [
      { name: "Actor", value: actorLabel || actorUserId, inline: true },
      { name: "Trigger", value: `${eventType} x${recent.length} in ${Math.floor(windowMs / 1000)}s`, inline: true },
      {
        name: "Action",
        value: lockedNames.length
          ? `Disabled for @everyone: ${lockedNames.join(", ")}${autoUnlockMinutes > 0 ? ` | Auto-unlock in ${autoUnlockMinutes}m` : ""}`
          : "No lockdown permissions are enabled in settings."
      }
    ]
  });
}

function sanitizeAttachmentName(name, fallback = "log-file") {
  const safe = String(name || fallback)
    .replace(/[\\/:*?"<>|\x00-\x1F]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70);
  return safe || fallback;
}

function extensionFromContentType(contentType) {
  const map = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/bmp": "bmp",
    "image/svg+xml": "svg",
    "video/mp4": "mp4",
    "video/webm": "webm"
  };
  return map[String(contentType || "").toLowerCase()] || null;
}

function extensionFromUrl(url, fallback = "bin") {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\.([a-zA-Z0-9]{2,6})$/);
    return match ? match[1].toLowerCase() : fallback;
  } catch {
    return fallback;
  }
}

function isImageMedia(item) {
  const contentType = String(item?.contentType || "").toLowerCase();
  const name = String(item?.name || "");
  const url = String(item?.url || "");
  if (contentType.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name) || /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(url);
}

function stripLogMarkdown(value) {
  return String(value || "")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, "$1")
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function roundRectPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

async function buildLogSummaryImage(guild, payload, actorUserId) {
  if (!guild || !actorUserId) return null;
  const member = guild.members.cache.get(actorUserId) || await guild.members.fetch(actorUserId).catch(() => null);
  const user = member?.user || await guild.client.users.fetch(actorUserId).catch(() => null);
  if (!user) return null;

  const displayName = member?.displayName || user.globalName || user.username || "Unknown";
  const canvas = createCanvas(980, 230);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#111318";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#20242d";
  roundRectPath(ctx, 18, 18, canvas.width - 36, canvas.height - 36, 16);
  ctx.fill();

  const title = stripLogMarkdown(payload?.title || "Server Log");
  const detail = trimText(stripLogMarkdown(payload?.description || ""), 180);

  ctx.fillStyle = "#f2f3f5";
  ctx.font = "bold 38px Times New Roman";
  ctx.fillText(title, 44, 78);

  const mentionText = `@${displayName}`;
  ctx.font = "28px Times New Roman";
  const mentionWidth = Math.min(ctx.measureText(mentionText).width + 36, canvas.width - 110);
  roundRectPath(ctx, 44, 98, mentionWidth, 44, 12);
  ctx.fillStyle = "#3d4f7f";
  ctx.fill();
  ctx.fillStyle = "#e6eeff";
  ctx.fillText(mentionText, 60, 128);

  ctx.fillStyle = "#d0d7e2";
  ctx.font = "26px Times New Roman";
  const detailText = detail || "No additional details.";
  ctx.fillText(detailText, 44, 178);

  return new AttachmentBuilder(canvas.toBuffer("image/png"), { name: "log-summary.png" });
}

async function downloadMediaAttachment(item, index) {
  if (!item?.url) return null;
  try {
    const response = await fetch(item.url);
    if (!response.ok) return null;

    const contentType = String(item.contentType || response.headers.get("content-type") || "").toLowerCase();
    const data = await response.arrayBuffer();
    const buffer = Buffer.from(data);
    if (!buffer.length) return null;

    let name = sanitizeAttachmentName(item.name || `log-media-${index + 1}`, `log-media-${index + 1}`);
    if (!/\.[a-z0-9]{2,6}$/i.test(name)) {
      const ext = extensionFromContentType(contentType) || extensionFromUrl(item.url, "bin");
      name = `${name}.${ext}`;
    }

    return {
      attachment: new AttachmentBuilder(buffer, { name }),
      name,
      isImage: isImageMedia({ ...item, contentType, name })
    };
  } catch {
    return null;
  }
}

function customEmojiLinksFromText(text) {
  const raw = String(text || "");
  const regex = /<(a?):([a-zA-Z0-9_]+):(\d+)>/g;
  const result = [];
  let match;

  while ((match = regex.exec(raw)) !== null) {
    const animated = match[1] === "a";
    const name = match[2];
    const emojiId = match[3];
    const extension = animated ? "gif" : "png";
    const emojiUrl = `https://cdn.discordapp.com/emojis/${emojiId}.${extension}?size=128&quality=lossless`;
    result.push({ name, emojiId, animated, emojiUrl });
  }

  return result;
}

function stickerUrl(sticker) {
  if (!sticker?.id) return null;
  if (sticker.url) return sticker.url;
  return `https://cdn.discordapp.com/stickers/${sticker.id}.png`;
}

function formatMessageLogContent(message) {
  if (!message) return "(no message data)";

  const text = String(message.content || "").trim();
  const lines = [];

  lines.push(`Text: ${text || "(no text)"}`);

  const attachments = message.attachments ? [...message.attachments.values()] : [];
  if (attachments.length) {
    lines.push(`Attachments (${attachments.length}):`);
    for (const attachment of attachments.slice(0, 8)) {
      const kind = attachment.contentType?.startsWith("image/") ? "image" : "file";
      const sizeKb = typeof attachment.size === "number" ? ` (${Math.max(1, Math.round(attachment.size / 1024))} KB)` : "";
      lines.push(`- [${kind}] ${attachment.name || "attachment"}${sizeKb}`);
    }
  }

  const stickers = message.stickers ? [...message.stickers.values()] : [];
  if (stickers.length) {
    lines.push(`Stickers (${stickers.length}):`);
    for (const sticker of stickers.slice(0, 8)) {
      lines.push(`- ${sticker.name || "sticker"} (${sticker.id})`);
    }
  }

  const customEmojis = customEmojiLinksFromText(message.content || "");
  if (customEmojis.length) {
    lines.push(`Custom Emojis (${customEmojis.length}):`);
    for (const emoji of customEmojis.slice(0, 12)) {
      lines.push(`- ${emoji.animated ? "animated" : "static"} :${emoji.name}: (${emoji.emojiId})`);
    }
  }

  return trimText(lines.join("\n"), 3500);
}

function collectRenderableMediaItems(message) {
  if (!message) return [];
  const items = [];

  const attachments = message.attachments ? [...message.attachments.values()] : [];
  for (const attachment of attachments) {
    if (!attachment?.url) continue;
    items.push({
      url: attachment.url,
      name: attachment.name || "attachment",
      contentType: attachment.contentType || null
    });
  }

  const stickers = message.stickers ? [...message.stickers.values()] : [];
  for (const sticker of stickers) {
    const url = stickerUrl(sticker);
    if (!url) continue;
    const stickerName = sanitizeAttachmentName(sticker.name || `sticker-${sticker.id}`, `sticker-${sticker.id}`);
    items.push({
      url,
      name: `${stickerName}.${extensionFromUrl(url, "png")}`,
      contentType: "image/png"
    });
  }

  const deduped = [];
  const seen = new Set();
  for (const item of items) {
    if (!item?.url || seen.has(item.url)) continue;
    seen.add(item.url);
    deduped.push(item);
  }

  return deduped.slice(0, 9);
}

function userLabel(userLike) {
  if (!userLike) return "Unknown";
  const user = userLike.user || userLike;
  const tag = user.tag || user.username || "Unknown";
  const userId = user.id || "no-id";
  const displayName = user.displayName || user.globalName || user.username || tag;
  if (!userId || userId === "no-id") return `@${displayName} (${tag})`;
  return `<@${userId}> (\`${tag}\`)`;
}

function channelLabel(channel) {
  if (!channel) return "Unknown channel";
  const name = channel.name || channel.id || "unknown";
  const channelId = channel.id;
  const guildId = channel.guild?.id || channel.guildId;
  if (!guildId || !channelId) return `#${name}`;
  return `[#${name}](https://discord.com/channels/${guildId}/${channelId})`;
}

function channelLinkFromId(guild, channelId) {
  if (!guild || !channelId) return "unknown channel";
  const ch = guild.channels.cache.get(channelId);
  const name = ch?.name || channelId;
  return `[#${name}](https://discord.com/channels/${guild.id}/${channelId})`;
}

function roleLabel(guild, roleId) {
  if (!guild || !roleId) return "Unknown role";
  const role = guild.roles.cache.get(roleId);
  return role ? `@${role.name}` : `role:${roleId}`;
}

async function labelFromUserId(guild, userId) {
  if (!guild || !userId) return null;
  const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
  const user = member?.user || (await guild.client.users.fetch(userId).catch(() => null));
  return user ? userLabel(user) : `[User ${userId}](https://discord.com/users/${userId})`;
}

async function resolveActionActorLabel(guild, auditExecutor, trackedActorId) {
  if (trackedActorId && (!auditExecutor || auditExecutor.bot)) {
    const tracked = await labelFromUserId(guild, trackedActorId);
    if (tracked) return tracked;
  }
  if (auditExecutor) return userLabel(auditExecutor);
  if (trackedActorId) return await labelFromUserId(guild, trackedActorId);
  return "Unknown";
}

async function getAuditExecutor(guild, type, targetId) {
  try {
    const logs = await guild.fetchAuditLogs({ type, limit: 6 });
    const entry = logs.entries.find((e) => {
      if (!e) return false;
      if (targetId && e.target?.id && e.target.id !== targetId) return false;
      const age = Date.now() - Number(e.createdTimestamp || 0);
      return age < 20_000;
    });
    return entry?.executor || null;
  } catch {
    return null;
  }
}

async function sendGuildLog(guild, payload) {
  if (!guild) return;
  const settings = await getGuildSettings(guild.id).catch(() => null);
  if (!settings?.log_channel_id) return;

  const eventKey = String(payload?.eventKey || "").trim();
  let channelId = settings.log_channel_id;
  const forcedChannelId = payload?.forceChannelId ? String(payload.forceChannelId).trim() : "";

  if (eventKey) {
    const eventConfigs = await getLoggingEventConfigs(guild.id).catch(() => []);
    const eventConfig = eventConfigs.find((cfg) => cfg.event_key === eventKey);
    if (eventConfig && Number(eventConfig.enabled) !== 1) return;
    if (eventConfig?.channel_id) channelId = eventConfig.channel_id;
  }
  if (forcedChannelId) channelId = forcedChannelId;

  const actorUserId = payload?.actorUserId ? String(payload.actorUserId) : null;
  if (actorUserId) {
    const actorExclusions = await getLoggingActorExclusions(guild.id).catch(() => []);
    if (actorExclusions.length) {
      const excludedUsers = new Set(actorExclusions.filter((e) => e.target_type === "user").map((e) => e.target_id));
      const excludedRoles = new Set(actorExclusions.filter((e) => e.target_type === "role").map((e) => e.target_id));
      if (excludedUsers.has(actorUserId)) return;

      const actorMember = guild.members.cache.get(actorUserId) || await guild.members.fetch(actorUserId).catch(() => null);
      if (actorMember && actorMember.roles.cache.some((role) => excludedRoles.has(role.id))) return;
    }
  }

  const sourceIdsRaw = Array.isArray(payload?.sourceChannelIds)
    ? payload.sourceChannelIds
    : payload?.sourceChannelId
      ? [payload.sourceChannelId]
      : [];
  const sourceIds = sourceIdsRaw.filter(Boolean);

  if (sourceIds.includes(channelId)) return;

  const exclusions = await getLoggingExclusions(guild.id).catch(() => []);
  if (exclusions.length && sourceIds.length) {
    const excludedChannels = new Set(exclusions.filter((e) => e.target_type === "channel").map((e) => e.target_id));
    const excludedCategories = new Set(exclusions.filter((e) => e.target_type === "category").map((e) => e.target_id));

    for (const sourceId of sourceIds) {
      if (excludedChannels.has(sourceId)) return;
      const sourceChannel = await guild.channels.fetch(sourceId).catch(() => null);
      if (sourceChannel?.parentId && excludedCategories.has(sourceChannel.parentId)) return;
    }
  }

  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased || !channel.isTextBased()) return;
  const summaryCardsEnabled = Number(settings?.log_summary_cards_enabled ?? 1) === 1;
  const quickModActionsEnabled = Number(settings?.log_quick_mod_actions_enabled ?? 1) === 1;

  const embed = new EmbedBuilder()
    .setColor(payload.color || LOG_THEME.info)
    .setAuthor({
      name: payload.title || "Server Log",
      iconURL: guild.iconURL({ size: 128 }) || undefined
    })
    .setDescription(trimText(payload.description || "", 3800))
    .setFooter({ text: `${guild.name} • Logging` })
    .setTimestamp(new Date());

  // Add user avatar if actorUserId is provided
  if (actorUserId) {
    const actorUser = guild.members.cache.get(actorUserId)?.user || await guild.client.users.fetch(actorUserId).catch(() => null);
    if (actorUser) {
      const avatarURL = actorUser.displayAvatarURL({ size: 128 });
      embed.setThumbnail(avatarURL);
    }
  }

  if (Array.isArray(payload.fields) && payload.fields.length) {
    embed.addFields(payload.fields.slice(0, 10).map((f) => ({
      name: trimText(f.name || "Field", 200),
      value: trimText(f.value || "-", 1024),
      inline: Boolean(f.inline)
    })));
  }

  const mediaItems = Array.isArray(payload.mediaItems)
    ? payload.mediaItems.filter((item) => item?.url).slice(0, 9)
    : Array.isArray(payload.mediaUrls)
      ? payload.mediaUrls.filter(Boolean).slice(0, 9).map((url, index) => ({
          url,
          name: `media-${index + 1}`
        }))
      : [];

  const downloadedMedia = [];
  for (let index = 0; index < mediaItems.length; index += 1) {
    const downloaded = await downloadMediaAttachment(mediaItems[index], index);
    if (downloaded) downloadedMedia.push(downloaded);
  }

  const files = downloadedMedia.map((item) => item.attachment);
  const components = [];
  const content = payload?.content ? trimText(String(payload.content), 1800) : undefined;
  const allowedRoleMentions = Array.isArray(payload?.allowedRoleMentions)
    ? payload.allowedRoleMentions.map((id) => String(id || "").trim()).filter(Boolean).slice(0, 5)
    : [];

  let summaryImage = null;
  if (summaryCardsEnabled && payload?.renderSummaryImage === true && actorUserId) {
    summaryImage = await buildLogSummaryImage(guild, payload, actorUserId);
    if (summaryImage) {
      files.push(summaryImage);
    }
  }

  if (downloadedMedia.length) {
    embed.addFields([
      {
        name: "Attachments",
        value: downloadedMedia.map((item) => `• ${item.name}`).join("\n")
      }
    ]);
  }

  if (quickModActionsEnabled && payload?.enableModActions && payload?.targetUserId) {
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`modact:warn:${payload.targetUserId}`)
          .setLabel("Warn")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`modact:mute:${payload.targetUserId}`)
          .setLabel("Mute 10m")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`modact:kick:${payload.targetUserId}`)
          .setLabel("Kick")
          .setStyle(ButtonStyle.Danger)
      )
    );
  }

  await channel.send({
    content,
    embeds: [embed],
    files,
    components,
    allowedMentions: allowedRoleMentions.length
      ? { parse: [], roles: allowedRoleMentions }
      : { parse: [] }
  }).catch(() => {});
}

async function memberHasConfiguredModRoleOrHigher(member) {
  if (!member?.guild) return false;
  const settings = await getGuildSettings(member.guild.id).catch(() => null);
  const modRoleId = settings?.mod_role_id;
  if (!modRoleId) return false;

  const modRole = member.guild.roles.cache.get(modRoleId) || await member.guild.roles.fetch(modRoleId).catch(() => null);
  if (!modRole) return false;

  return member.roles?.cache?.some((role) => role.position >= modRole.position) || false;
}

async function canUseModeratorActions(member) {
  if (!member) return false;
  if (member.id === BOT_MANAGER_ID) return true;
  if (member.permissions?.has(PermissionsBitField.Flags.Administrator)) return true;
  return await memberHasConfiguredModRoleOrHigher(member);
}

function canModerateMember(executor, target) {
  if (!executor || !target) return false;
  if (executor.id === target.id) return false;
  if (target.guild.ownerId === target.id) return false;
  if (executor.guild.ownerId === executor.id) return true;
  return executor.roles.highest.position > target.roles.highest.position;
}

function parseModActionCustomId(customId) {
  const parts = String(customId || "").split(":");
  if (parts.length < 3) return null;
  const [, action, targetUserId] = parts;
  if (!["warn", "mute", "kick"].includes(action)) return null;
  if (!/^\d{15,21}$/.test(String(targetUserId || ""))) return null;
  return { action, targetUserId };
}

async function resolveModActionContext(interaction, targetUserId) {
  if (!interaction.guild || !interaction.member) {
    return { ok: false, message: "This action can only be used in a server." };
  }

  const actor = interaction.member;
  if (!(await canUseModeratorActions(actor))) {
    return { ok: false, message: "You do not have permission to use this moderation action." };
  }

  const targetMember = await interaction.guild.members.fetch(targetUserId).catch(() => null);
  if (!targetMember) {
    return { ok: false, message: "Target member is no longer in this server." };
  }

  if (!canModerateMember(actor, targetMember)) {
    return { ok: false, message: "You cannot moderate this member due to role hierarchy." };
  }

  return { ok: true, actor, targetMember };
}

async function maybeRunTicketSlaChecks(client) {
  const now = Date.now();
  const openTickets = await all(
    `SELECT t.guild_id, t.channel_id, t.opener_id, t.created_at, t.last_activity_at, t.sla_reminder_sent_at, t.sla_escalated_at,
            ts.support_role_id, ts.sla_first_response_minutes, ts.sla_escalation_minutes, ts.sla_escalation_role_id
     FROM tickets t
     INNER JOIN ticket_settings ts ON ts.guild_id=t.guild_id
     WHERE t.status='open'
       AND ts.enabled=1
       AND (
         COALESCE(ts.sla_first_response_minutes, 0) > 0
         OR COALESCE(ts.sla_escalation_minutes, 0) > 0
       )`
  ).catch(() => []);

  for (const row of openTickets) {
    const guild = client.guilds.cache.get(row.guild_id) || await client.guilds.fetch(row.guild_id).catch(() => null);
    if (!guild) continue;
    const channel = guild.channels.cache.get(row.channel_id) || await guild.channels.fetch(row.channel_id).catch(() => null);
    if (!channel || !channel.isTextBased || !channel.isTextBased()) continue;

    const baseTs = Number(row.last_activity_at || row.created_at || now);
    const elapsedMs = Math.max(0, now - baseTs);
    const reminderMs = Math.max(0, Number(row.sla_first_response_minutes || 0)) * 60_000;
    const escalationMs = Math.max(0, Number(row.sla_escalation_minutes || 0)) * 60_000;
    const hasReminder = Number(row.sla_reminder_sent_at || 0) > 0;
    const hasEscalated = Number(row.sla_escalated_at || 0) > 0;

    if (reminderMs > 0 && elapsedMs >= reminderMs && !hasReminder) {
      const supportPing = row.support_role_id ? `<@&${row.support_role_id}>` : "Support team";
      const sent = await channel.send({
        content: `⏱️ SLA reminder: this ticket has been inactive for ${Math.floor(elapsedMs / 60_000)} minute(s). ${supportPing}`,
        allowedMentions: { roles: row.support_role_id ? [row.support_role_id] : [], parse: [] }
      }).catch(() => null);

      if (sent) {
        await run(
          `UPDATE tickets SET sla_reminder_sent_at=? WHERE guild_id=? AND channel_id=? AND status='open'`,
          [now, row.guild_id, row.channel_id]
        ).catch(() => {});
      }
    }

    if (escalationMs > 0 && elapsedMs >= escalationMs && !hasEscalated) {
      const escalationRoleId = row.sla_escalation_role_id || row.support_role_id || null;
      const escalationPing = escalationRoleId ? `<@&${escalationRoleId}>` : "Staff";
      const sent = await channel.send({
        content: `🚨 SLA escalation: this ticket exceeded escalation target (${Math.floor(elapsedMs / 60_000)} minute(s) inactive). ${escalationPing}`,
        allowedMentions: { roles: escalationRoleId ? [escalationRoleId] : [], parse: [] }
      }).catch(() => null);

      if (sent) {
        await run(
          `UPDATE tickets SET sla_escalated_at=? WHERE guild_id=? AND channel_id=? AND status='open'`,
          [now, row.guild_id, row.channel_id]
        ).catch(() => {});
      }
    }
  }
}

async function maybeRunAntiNukeUnlockJobs(client) {
  const now = Date.now();
  const dueJobs = await all(
    `SELECT id, guild_id, run_at, unlock_perms_json
     FROM anti_nuke_unlock_jobs
     WHERE executed_at IS NULL AND run_at <= ?
     ORDER BY run_at ASC
     LIMIT 50`,
    [now]
  ).catch(() => []);

  for (const job of dueJobs) {
    const guild = client.guilds.cache.get(job.guild_id) || await client.guilds.fetch(job.guild_id).catch(() => null);
    if (!guild) continue;

    await guild.channels.fetch().catch(() => {});

    let unlockKeys = [];
    try {
      const parsed = JSON.parse(String(job.unlock_perms_json || "[]"));
      if (Array.isArray(parsed)) unlockKeys = parsed;
    } catch {
      unlockKeys = [];
    }

    const unlockPerms = {};
    if (unlockKeys.includes("ManageChannels")) unlockPerms.ManageChannels = null;
    if (unlockKeys.includes("ManageRoles")) unlockPerms.ManageRoles = null;
    if (unlockKeys.includes("BanMembers")) unlockPerms.BanMembers = null;
    if (unlockKeys.includes("KickMembers")) unlockPerms.KickMembers = null;
    if (unlockKeys.includes("ManageWebhooks")) unlockPerms.ManageWebhooks = null;

    if (Object.keys(unlockPerms).length) {
      const everyone = guild.roles.everyone;
      for (const [, channel] of guild.channels.cache) {
        if (!channel?.permissionOverwrites?.edit) continue;
        await channel.permissionOverwrites.edit(everyone, unlockPerms, {
          reason: "Anti-nuke auto-unlock"
        }).catch(() => {});
      }
    }

    await run(`UPDATE anti_nuke_unlock_jobs SET executed_at=? WHERE id=?`, [now, job.id]).catch(() => {});
    await run(
      `INSERT INTO anti_nuke_incidents (guild_id, incident_type, event_type, actor_user_id, initiated_by_user_id, details, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        guild.id,
        "auto_unlock",
        null,
        null,
        null,
        JSON.stringify({ unlocked_permissions: unlockKeys, job_id: job.id }),
        now
      ]
    ).catch(() => {});
  }
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

  // Economy reward on level-up
  try {
    const ecoSettings = await get(`SELECT enabled, currency_name, currency_symbol FROM economy_settings WHERE guild_id=?`, [guild.id]);
    if (ecoSettings?.enabled) {
      const reward = newLevel * 50;
      // Ensure economy row exists
      await run(`INSERT INTO user_economy (guild_id, user_id, balance) VALUES (?, ?, 0) ON CONFLICT (guild_id, user_id) DO NOTHING`, [guild.id, userId]);
      await run(`UPDATE user_economy SET balance=balance+? WHERE guild_id=? AND user_id=?`, [reward, guild.id, userId]);
      // Notify in level-up channel or message channel
      if (message) {
        const sym = ecoSettings.currency_symbol || "🪙";
        const name = ecoSettings.currency_name || "coins";
        await message.channel.send({ embeds: [{ color: 0xf1c40f, description: `${sym} <@${userId}> reached **Level ${newLevel}** and earned **${reward} ${name}** as a level-up bonus!` }] }).catch(() => {});
      }
    }
  } catch (e) {
    console.error("Level-up economy reward failed:", e);
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

async function updateMemberCountChannels(client) {
  const guildSettings = await all(
    `SELECT guild_id, member_count_channel_id FROM guild_settings WHERE member_count_channel_id IS NOT NULL`
  );

  for (const settings of guildSettings) {
    try {
      const guild = client.guilds.cache.get(settings.guild_id);
      if (!guild) continue;

      const channel = guild.channels.cache.get(settings.member_count_channel_id);
      if (!channel) continue;

      const memberCount = guild.memberCount;
      const newName = `👥 Members: ${memberCount}`;

      if (channel.name !== newName) {
        await channel.setName(newName).catch((err) => {
          if (err.code !== 50013) {
            console.error(`[members] Failed to update channel name for ${settings.guild_id}:`, err.message);
          }
        });
      }
    } catch (err) {
      console.error(`[members] Error updating member count for guild ${settings.guild_id}:`, err);
    }
  }
}

// ─────────────────────────────────────────────────────
// Client
// ─────────────────────────────────────────────────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
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

    const dashboardApp = startDashboard(client);
    startSocialFeedNotifier(client, dashboardApp);

    setInterval(() => {
      cleanupPrivateRooms(client).catch((err) => {
        console.error("cleanupPrivateRooms failed:", err);
      });
    }, 30_000);

    // Check for ended giveaways every 30 seconds
    setInterval(async () => {
      try {
        const now = Date.now();
        const endedGiveaways = await all(`SELECT * FROM giveaways WHERE ended=0 AND end_time <= ?`, [now]);
        for (const giveaway of endedGiveaways) {
          const { endGiveaway } = require("./commands");
          await endGiveaway(client, giveaway);
        }
      } catch (err) {
        console.error("Giveaway check failed:", err);
      }
    }, 30_000);

    // Check for due reminders every 15 seconds
    setInterval(async () => {
      try {
        const now = Date.now();
        const dueReminders = await all(`SELECT * FROM reminders WHERE completed=0 AND remind_at <= ?`, [now]);
        for (const reminder of dueReminders) {
          const embed = {
            color: 0x3498db,
            title: "⏰ Reminder",
            description: reminder.reminder_text,
            footer: { text: `Set ${new Date(reminder.created_at).toLocaleString()}` }
          };

          let delivered = false;

          const user = await client.users.fetch(reminder.user_id).catch(() => null);
          if (user) {
            const dm = await user.send({ embeds: [embed] }).catch(() => null);
            if (dm) delivered = true;
          }

          // Fallback to original guild channel if DM fails.
          if (!delivered && reminder.guild_id && reminder.channel_id) {
            const guild = client.guilds.cache.get(reminder.guild_id)
              || await client.guilds.fetch(reminder.guild_id).catch(() => null);
            const channel = guild
              ? (guild.channels.cache.get(reminder.channel_id)
                || await guild.channels.fetch(reminder.channel_id).catch(() => null))
              : null;

            if (channel && channel.isTextBased && channel.isTextBased()) {
              const sent = await channel.send({
                content: `<@${reminder.user_id}>`,
                embeds: [embed],
                allowedMentions: { users: [reminder.user_id] }
              }).catch(() => null);
              if (sent) delivered = true;
            }
          }

          if (delivered) {
            await run(`UPDATE reminders SET completed=1 WHERE id=?`, [reminder.id]);
          }
        }
      } catch (err) {
        console.error("Reminder check failed:", err);
      }
    }, 15_000);

    setInterval(async () => {
      try {
        const now = Date.now();
        const dueRoles = await all(`SELECT * FROM temp_roles WHERE completed=0 AND expires_at <= ? ORDER BY expires_at ASC LIMIT 50`, [now]);
        for (const row of dueRoles) {
          const guild = client.guilds.cache.get(row.guild_id) || await client.guilds.fetch(row.guild_id).catch(() => null);
          if (!guild) {
            await run(`UPDATE temp_roles SET completed=1, completed_at=? WHERE id=?`, [now, row.id]).catch(() => {});
            continue;
          }
          const member = guild.members.cache.get(row.user_id) || await guild.members.fetch(row.user_id).catch(() => null);
          const role = guild.roles.cache.get(row.role_id) || await guild.roles.fetch(row.role_id).catch(() => null);
          if (member && role && member.roles.cache.has(role.id)) {
            await member.roles.remove(role, "Temporary role expired").catch(() => {});
            await sendGuildLog(guild, {
              eventKey: "member_role_update",
              actorUserId: row.moderator_id || null,
              color: LOG_THEME.info,
              title: "⏳ Temporary Role Expired",
              description: `${userLabel(member.user)} lost @${role.name} because the temporary role expired.`,
              fields: [{ name: "Duration Ended", value: new Date(Number(row.expires_at || now)).toLocaleString(), inline: true }]
            });
          }
          await run(`UPDATE temp_roles SET completed=1, completed_at=? WHERE id=?`, [now, row.id]).catch(() => {});
        }
      } catch (err) {
        console.error("Temp role expiry check failed:", err);
      }
    }, 30_000);

    setInterval(async () => {
      try {
        const now = Date.now();
        const guildSettingsRows = await all(`SELECT guild_id, snipe_retention_minutes FROM guild_settings WHERE snipe_enabled=1`);
        for (const row of guildSettingsRows) {
          const retentionMs = Math.max(1, Number(row.snipe_retention_minutes || 1440)) * 60_000;
          const cutoff = now - retentionMs;
          await run(`DELETE FROM snipe_messages WHERE guild_id=? AND deleted_at < ?`, [row.guild_id, cutoff]).catch(() => {});
          await run(`DELETE FROM edit_snipes WHERE guild_id=? AND edited_at < ?`, [row.guild_id, cutoff]).catch(() => {});
        }
      } catch (err) {
        console.error("Snipe cleanup failed:", err);
      }
    }, 10 * 60_000);

    // Check for birthdays once a day at midnight (or on startup)
    const checkBirthdays = async () => {
      try {
        const now = new Date();
        const month = now.getMonth() + 1;
        const day = now.getDate();
        
        const birthdays = await all(`SELECT * FROM birthdays WHERE birth_month=? AND birth_day=?`, [month, day]);
        
        for (const birthday of birthdays) {
          const guild = client.guilds.cache.get(birthday.guild_id);
          if (!guild) continue;
          
          const settings = await get(`SELECT * FROM birthday_settings WHERE guild_id=?`, [birthday.guild_id]);
          if (!settings || !settings.enabled || !settings.channel_id) continue;
          
          const channel = guild.channels.cache.get(settings.channel_id);
          if (!channel) continue;
          
          // Skip if we already sent this birthday message this calendar year
          const currentYear = now.getFullYear();
          if (birthday.last_wished_year === currentYear) continue;

          const member = await guild.members.fetch(birthday.user_id).catch(() => null);
          if (!member) continue;
          
          const message = settings.message
            .replace(/{user}/g, `<@${birthday.user_id}>`)
            .replace(/{server}/g, guild.name)
            .replace(/{role:(\d+)}/g, (_, id) => `<@&${id}>`)
            .replace(/{channel:(\d+)}/g, (_, id) => `<#${id}>`);
          
          await channel.send(message).catch(() => {});
          await run(`UPDATE birthdays SET last_wished_year=? WHERE guild_id=? AND user_id=?`,
            [currentYear, birthday.guild_id, birthday.user_id]).catch(() => {});
          
          if (settings.role_id) {
            const role = guild.roles.cache.get(settings.role_id);
            if (role && !member.roles.cache.has(settings.role_id)) {
              await member.roles.add(role).catch(() => {});
              
              setTimeout(async () => {
                await member.roles.remove(role).catch(() => {});
              }, 86400000);
            }
          }
        }
      } catch (err) {
        console.error("Birthday check failed:", err);
      }
    };
    
    checkBirthdays();
    setInterval(checkBirthdays, 3600000);

    // Auto-unban expired temporary bans
    setInterval(async () => {
      try {
        const now = Date.now();
        const expired = await all(
          `SELECT id, guild_id, user_id
           FROM temp_bans
           WHERE completed=0 AND unban_at <= ?
           ORDER BY unban_at ASC
           LIMIT 100`,
          [now]
        );

        for (const row of expired) {
          const guild = client.guilds.cache.get(row.guild_id)
            || await client.guilds.fetch(row.guild_id).catch(() => null);
          if (!guild) continue;

          // Unban can fail if already manually unbanned; either way mark completed.
          await guild.members.unban(row.user_id, "Temporary ban expired").catch(() => {});
          await run(
            `UPDATE temp_bans
             SET completed=1, completed_at=?
             WHERE id=?`,
            [Date.now(), row.id]
          );
        }
      } catch (err) {
        console.error("Temp-ban scheduler failed:", err);
      }
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

    setInterval(async () => {
      try {
        await maybeRunTicketSlaChecks(client);
      } catch (err) {
        console.error("Ticket SLA interval failed:", err);
      }
    }, TICKET_SLA_INTERVAL_MS);

    setInterval(async () => {
      try {
        await maybeRunAntiNukeUnlockJobs(client);
      } catch (err) {
        console.error("Anti-nuke auto-unlock interval failed:", err);
      }
    }, ANTI_NUKE_UNLOCK_INTERVAL_MS);

    setInterval(async () => {
      try {
        await updateMemberCountChannels(client);
      } catch (err) {
        console.error("Member count update interval failed:", err);
      }
    }, 300000); // 5 minutes

    // ─── Scheduled Messages ───
    setInterval(async () => {
      try {
        const now = Date.now();
        const due = await all(
          `SELECT id, guild_id, channel_id, content, interval_minutes
           FROM scheduled_messages
           WHERE enabled=1 AND next_run_at <= ?`,
          [now]
        );
        for (const row of due) {
          const guild = client.guilds.cache.get(row.guild_id) || await client.guilds.fetch(row.guild_id).catch(() => null);
          if (!guild) continue;
          const channel = guild.channels.cache.get(row.channel_id) || await guild.channels.fetch(row.channel_id).catch(() => null);
          if (!channel || !channel.isTextBased || !channel.isTextBased()) continue;
          await channel.send({ content: String(row.content), allowedMentions: { parse: [] } }).catch(() => {});
          const nextRun = now + Number(row.interval_minutes) * 60_000;
          await run(`UPDATE scheduled_messages SET next_run_at=? WHERE id=?`, [nextRun, row.id]).catch(() => {});
        }
      } catch (err) {
        console.error("Scheduled messages interval failed:", err);
      }
    }, 60_000); // check every minute

    // ─── Passive income tick ───────────────────────────────────────────────────
    setInterval(async () => {
      try {
        const now = Date.now();
        // Find all users with active passive_regen buffs and their last regen timestamp
        const regenBuffs = await all(
          `SELECT b.guild_id, b.user_id, b.buff_id,
                  COALESCE(e.last_passive_regen_at, 0) AS last_passive_regen_at
           FROM user_buffs b
           JOIN user_economy e ON e.guild_id=b.guild_id AND e.user_id=b.user_id
           WHERE b.buff_id IN ('passive_regen_50','passive_regen_600') AND b.expires_at > ?`,
          [now]
        );
        // Aggregate per user (they may have both buffs)
        const byUser = new Map();
        for (const row of regenBuffs) {
          const key = `${row.guild_id}:${row.user_id}`;
          if (!byUser.has(key)) {
            byUser.set(key, { guild_id: row.guild_id, user_id: row.user_id, last: Number(row.last_passive_regen_at) || 0, rate: 0 });
          }
          const entry = byUser.get(key);
          if (row.buff_id === 'passive_regen_50')  entry.rate += 50;
          if (row.buff_id === 'passive_regen_600') entry.rate += 600;
        }
        for (const entry of byUser.values()) {
          // On first tick after startup/activation, seed the timestamp without granting coins
          if (entry.last === 0) {
            await run(`UPDATE user_economy SET last_passive_regen_at=? WHERE guild_id=? AND user_id=?`, [now, entry.guild_id, entry.user_id]);
            continue;
          }
          const elapsedHours = (now - entry.last) / 3_600_000;
          if (elapsedHours < 0.05) continue; // less than ~3 min – skip
          const coins = Math.floor(entry.rate * elapsedHours);
          if (coins <= 0) continue;
          await run(
            `UPDATE user_economy SET balance=balance+?, last_passive_regen_at=? WHERE guild_id=? AND user_id=?`,
            [coins, now, entry.guild_id, entry.user_id]
          );
        }
      } catch (err) {
        console.error("Passive income interval failed:", err);
      }
    }, 300_000); // every 5 minutes

    // ─── Lottery auto-draw (weekly) ────────────────────────────────────────────
    setInterval(async () => {
      try {
        const now = Date.now();
        const weekMs = 7 * 24 * 3_600_000;
        const pools = await all(
          `SELECT lp.guild_id, lp.pot, lp.last_draw_at,
                  es.currency_symbol, es.currency_name
           FROM lottery_pool lp
           LEFT JOIN economy_settings es ON es.guild_id = lp.guild_id
           WHERE lp.pot > 0 AND (lp.last_draw_at IS NULL OR lp.last_draw_at < ?)`,
          [now - weekMs]
        );
        for (const pool of pools) {
          const tickets = await all(`SELECT user_id, count FROM lottery_tickets WHERE guild_id=?`, [pool.guild_id]);
          if (!tickets.length) {
            // No tickets sold — rollover: keep pot, reset timer
            await run(`UPDATE lottery_pool SET last_draw_at=? WHERE guild_id=?`, [now, pool.guild_id]);
            const g = client.guilds.cache.get(pool.guild_id);
            if (g) {
              const sym = pool.currency_symbol || "🪙";
              const ch = g.channels.cache.filter(c => c.isTextBased?.() && c.permissionsFor?.(g.members.me)?.has?.('SendMessages')).first();
              if (ch) await ch.send({ embeds: [{ color: 0xf1c40f, title: "🎟️ Lottery Rollover!", description: `No tickets were sold this week! The **${sym}${pool.pot.toLocaleString()} ${pool.currency_name || "coins"}** pot rolls over to next week. 🎉` }] }).catch(() => {});
            }
            continue;
          }
          // Build weighted pool and pick winner
          const pool_arr = [];
          for (const t of tickets) {
            for (let i = 0; i < t.count; i++) pool_arr.push(t.user_id);
          }
          const winnerId = pool_arr[Math.floor(Math.random() * pool_arr.length)];
          await run(`INSERT INTO user_economy (guild_id, user_id, balance) VALUES (?, ?, 0) ON CONFLICT (guild_id, user_id) DO NOTHING`, [pool.guild_id, winnerId]);
          await run(`UPDATE user_economy SET balance=balance+? WHERE guild_id=? AND user_id=?`, [pool.pot, pool.guild_id, winnerId]);
          await run(`UPDATE lottery_pool SET pot=0, last_draw_at=? WHERE guild_id=?`, [now, pool.guild_id]);
          await run(`DELETE FROM lottery_tickets WHERE guild_id=?`, [pool.guild_id]);
          // Announce
          const g = client.guilds.cache.get(pool.guild_id);
          if (g) {
            const sym = pool.currency_symbol || "🪙";
            const ch = g.channels.cache.filter(c => c.isTextBased?.() && c.permissionsFor?.(g.members.me)?.has?.('SendMessages')).first();
            if (ch) {
              await ch.send({ embeds: [{ color: 0xf1c40f, title: "🎉 Weekly Lottery Draw!", description: `**Winner: <@${winnerId}>** 🎟️\n\n💰 Prize: **${sym}${pool.pot.toLocaleString()} ${pool.currency_name || "coins"}**\n\nCongratulations! The lottery resets for next week.` }] }).catch(() => {});
            }
          }
        }
      } catch (err) {
        console.error("Lottery auto-draw failed:", err);
      }
    }, 3_600_000); // every hour

    // ─── Bounty expiry ─────────────────────────────────────────────────────────
    setInterval(async () => {
      try {
        const now = Date.now();
        const expired = await all(`SELECT * FROM bounties WHERE status='active' AND expires_at <= ?`, [now]);
        for (const bounty of expired) {
          // Refund amount to poster
          await run(`UPDATE user_economy SET balance=balance+? WHERE guild_id=? AND user_id=?`, [bounty.amount, bounty.guild_id, bounty.poster_id]);
          await run(`UPDATE bounties SET status='expired' WHERE id=?`, [bounty.id]);
          // DM the poster
          const posterUser = await client.users.fetch(bounty.poster_id).catch(() => null);
          if (posterUser) {
            await posterUser.send({ embeds: [{ color: 0xe67e22, title: "⏰ Bounty Expired", description: `Your bounty of **${bounty.amount} coins** on <@${bounty.target_id}> expired unclaimed.\n\n✅ **${bounty.amount} coins** have been refunded to your wallet.` }] }).catch(() => {});
          }
        }
      } catch (err) {
        console.error("Bounty expiry interval failed:", err);
      }
    }, 1_800_000); // every 30 minutes

    // ─── Active bankrob & heist resolution ─────────────────────────────────────
    setInterval(async () => {
      try {
        const now = Date.now();

        // ── Bank robberies ──────────────────────────────────────────────────────
        const finishedRobs = await all(`SELECT * FROM active_bankrobs WHERE finish_at <= ? AND status != 'done'`, [now]);
        for (const rob of finishedRobs) {
          const crew = JSON.parse(rob.crew || '[]');
          let successRate = 0.40 + Math.min(0.25, (crew.length - 1) * 0.05);
          if (rob.police_called) successRate = Math.max(0, successRate - 0.20);
          const success = Math.random() < successRate;
          const channel = await client.channels.fetch(rob.channel_id).catch(() => null);

          if (success) {
            const totalPayout = Math.floor(2000 + Math.random() * 6000);
            const cut = Math.floor(totalPayout / crew.length);
            for (const uid of crew) {
              await run(`UPDATE user_economy SET balance=balance+? WHERE guild_id=? AND user_id=?`, [cut, rob.guild_id, uid]);
            }
            const crewMentions = crew.map(id => `<@${id}>`).join(", ");
            if (channel) {
              await channel.send({ embeds: [{ color: 0x2ecc71, title: "💰 Bank Robbery — SUCCESS!", description: `🚨 **The crew made it out!**\n\n👥 Crew: ${crewMentions}\n💵 Total stolen: **${totalPayout} coins** (${cut} each)\n\n*They vanish into the shadows...*` }] }).catch(() => {});
            }
          } else {
            for (const uid of crew) {
              const member = await get(`SELECT balance FROM user_economy WHERE guild_id=? AND user_id=?`, [rob.guild_id, uid]);
              if (member) {
                const fine = Math.floor(member.balance * 0.40);
                await run(`UPDATE user_economy SET balance=MAX(0, balance-?) WHERE guild_id=? AND user_id=?`, [fine, rob.guild_id, uid]);
              }
            }
            const crewMentions = crew.map(id => `<@${id}>`).join(", ");
            if (channel) {
              await channel.send({ embeds: [{ color: 0xe74c3c, title: "🚔 Bank Robbery — BUSTED!", description: `🚔 **The police were waiting!**\n\n👥 Crew: ${crewMentions}\n💸 Each crew member fined **40% of their wallet**.\n\n${rob.police_called ? "📞 *Someone called the police...*" : ""}` }] }).catch(() => {});
            }
          }
          await run(`DELETE FROM active_bankrobs WHERE guild_id=?`, [rob.guild_id]);
        }

        // ── Heists ──────────────────────────────────────────────────────────────
        const finishedHeists = await all(`SELECT * FROM active_heists WHERE execute_at <= ? AND status != 'done'`, [now]);
        for (const heist of finishedHeists) {
          const crew = JSON.parse(heist.crew || '[]');
          const successRate = Math.min(0.65, 0.40 + (crew.length - 1) * 0.05);
          const success = Math.random() < successRate;
          const channel = await client.channels.fetch(heist.channel_id).catch(() => null);

          if (success) {
            const totalPayout = Math.floor(2000 + Math.random() * 8000);
            const cut = Math.floor(totalPayout / crew.length);
            for (const uid of crew) {
              await run(`UPDATE user_economy SET balance=balance+? WHERE guild_id=? AND user_id=?`, [cut, heist.guild_id, uid]);
            }
            const crewMentions = crew.map(id => `<@${id}>`).join(", ");
            if (channel) {
              await channel.send({ embeds: [{ color: 0x2ecc71, title: `💰 Heist — SUCCESS: ${heist.scenario}`, description: `✅ The crew pulled it off!\n\n👥 ${crewMentions}\n💵 Total: **${totalPayout} coins** (${cut} each)` }] }).catch(() => {});
            }
          } else {
            for (const uid of crew) {
              const member = await get(`SELECT balance FROM user_economy WHERE guild_id=? AND user_id=?`, [heist.guild_id, uid]);
              if (member) {
                const fine = Math.floor(member.balance * 0.30);
                await run(`UPDATE user_economy SET balance=MAX(0, balance-?) WHERE guild_id=? AND user_id=?`, [fine, heist.guild_id, uid]);
              }
            }
            const crewMentions = crew.map(id => `<@${id}>`).join(", ");
            if (channel) {
              await channel.send({ embeds: [{ color: 0xe74c3c, title: `🚔 Heist — FAILED: ${heist.scenario}`, description: `❌ Everything went wrong!\n\n👥 ${crewMentions}\n💸 Each crew member fined **30% of their wallet**.` }] }).catch(() => {});
            }
          }
          await run(`DELETE FROM active_heists WHERE guild_id=?`, [heist.guild_id]);
        }

      } catch (err) {
        console.error("Bankrob/heist resolution interval failed:", err);
      }
    }, 30_000); // every 30 seconds

  } catch (err) {
    console.error("ClientReady startup failed:", err);
  }
});



// ─────────────────────────────────────────────────────
// Message XP + Commands
// ─────────────────────────────────────────────────────

client.on(Events.MessageCreate, async (message) => {
  if (!message.guild && !message.author?.bot) {
    await forwardUserDmToModmail(message).catch((err) => {
      console.error("Direct modmail handling failed:", err);
    });
    return;
  }

  // Commands first (important)
  await handleCommands(message);

  if (!message.guild || message.author.bot) return;

  const guildSettings = await getGuildSettings(message.guild.id).catch(() => null);
  const commandPrefix = String(guildSettings?.command_prefix || "!").trim() || "!";
  const lowerContent = String(message.content || "").trim().toLowerCase();

  if (await relayModmailChannelMessage(message).catch(() => false)) {
    return;
  }

  if (guildSettings?.afk_enabled) {
    const isAfkCommand = lowerContent.startsWith(`${commandPrefix}afk`);
    if (!isAfkCommand) {
      const existingAfk = await get(`SELECT reason, afk_at FROM user_afk_status WHERE guild_id=? AND user_id=?`, [message.guild.id, message.author.id]).catch(() => null);
      if (existingAfk) {
        await run(`DELETE FROM user_afk_status WHERE guild_id=? AND user_id=?`, [message.guild.id, message.author.id]).catch(() => {});
        const awayFor = formatDurationCompact(Date.now() - Number(existingAfk.afk_at || Date.now()));
        await message.reply({ content: `Welcome back. Your AFK status was cleared after ${awayFor}.`, allowedMentions: { parse: [] } }).catch(() => {});
      }
    }

    const mentionIds = [...new Set(message.mentions.users.map((user) => user.id).filter((id) => id !== message.author.id))];
    if (mentionIds.length) {
      const rows = await all(
        `SELECT user_id, reason, afk_at FROM user_afk_status WHERE guild_id=? AND user_id = ANY($2)`,
        [message.guild.id, mentionIds]
      ).catch(() => []);
      if (rows.length) {
        const afkLines = [];
        for (const row of rows) {
          const user = message.guild.members.cache.get(row.user_id)?.user || await client.users.fetch(row.user_id).catch(() => null);
          const name = user ? user.tag : row.user_id;
          const awayFor = formatDurationCompact(Date.now() - Number(row.afk_at || Date.now()));
          const reason = String(row.reason || "AFK").trim();
          afkLines.push(`• ${name} is AFK (${awayFor})${reason ? `: ${reason}` : ""}`);
        }
        if (afkLines.length) {
          await message.reply({ content: afkLines.join("\n"), allowedMentions: { parse: [] } }).catch(() => {});
        }
      }
    }
  }

  await processAutoReplies(message).catch((err) => {
    console.error("Auto-reply handler failed:", err?.message || err);
  });

  await touchTicketActivity(message.guild.id, message.channel.id).catch(() => {});

  console.log("[MSG]", message.guild?.id, message.channel?.id, message.author?.tag, message.content);

  // Check if channel is ignored
  const ignoredChannels = await getIgnoredChannels(message.guild.id);
  const isIgnored = ignoredChannels.some(c => c.channel_id === message.channel.id && c.channel_type === "text");
  if (isIgnored) return;

  // ─── Word Filter ───
  if (!(await canUseModeratorActions(message.member))) {
    const wordFilterRows = await all(`SELECT word, action FROM word_filter WHERE guild_id=?`, [message.guild.id]).catch(() => []);
    if (wordFilterRows.length) {
      const contentLower = String(message.content || "").toLowerCase();
      const hit = wordFilterRows.find(r => contentLower.includes(String(r.word || "").toLowerCase()));
      if (hit) {
        try {
          await message.delete().catch(() => {});
          const actorId = message.client?.user?.id || BOT_MANAGER_ID;
          const filterAction = hit.action || "delete";

          if (filterAction === "warn") {
            await run(
              `INSERT INTO mod_warnings (guild_id, user_id, moderator_id, reason, created_at)
               VALUES (?, ?, ?, ?, ?)`,
              [message.guild.id, message.author.id, actorId, `[WordFilter] Filtered word: ${hit.word}`, Date.now()]
            ).catch(() => {});
          }

          if (filterAction === "timeout") {
            const botMember = message.guild.members.me || await message.guild.members.fetchMe().catch(() => null);
            if (botMember && message.member && canModerateMember(botMember, message.member)) {
              await message.member.timeout(10 * 60 * 1000, `[WordFilter] Filtered word`).catch(() => {});
            }
          }

          await sendGuildLog(message.guild, {
            eventKey: "message_delete",
            actorUserId: actorId,
            color: LOG_THEME.warn,
            title: "🚫 Word Filter",
            sourceChannelId: message.channel?.id,
            description: `Word filter triggered for ${message.author} (action: **${filterAction}**).`,
            fields: [
              { name: "Word", value: `\`${hit.word}\``, inline: true },
              { name: "User", value: `${message.author.tag}`, inline: true },
              { name: "Channel", value: `<#${message.channel.id}>`, inline: true }
            ]
          });

          const warnMsg = await message.channel.send({
            content: `${message.author}, your message was removed by the word filter.`
          }).catch(() => null);
          if (warnMsg) setTimeout(() => warnMsg.delete().catch(() => {}), 5000);
        } catch (err) {
          console.error("[WordFilter] enforcement error:", err);
        }
        return;
      }
    }
  }

  // ─── Auto-Moderation ───
  const automodSettings = await get(`SELECT * FROM automod_settings WHERE guild_id=?`, [message.guild.id]);
  if (automodSettings) {
    if (await canUseModeratorActions(message.member)) {
      // Skip automod for trusted moderators/admins.
    } else {
    let violationReason = null;
    let violationAction = "delete";

    const parseCsvSet = (value) => new Set(
      String(value || "")
        .split(",")
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean)
    );

    const normalizeAction = (value, fallback) => {
      const action = String(value || fallback).trim().toLowerCase();
      if (["delete", "warn", "timeout"].includes(action)) return action;
      return fallback;
    };

    // Check spam (repeated messages)
    if (automodSettings.spam_enabled) {
      const spamThreshold = Math.max(2, Number(automodSettings.spam_messages || 5));
      const recentMessages = [...message.channel.messages.cache.values()]
        .filter(m => m.author.id === message.author.id && Date.now() - m.createdTimestamp < 10000)
        .slice(0, 20);
      
      if (recentMessages.length >= spamThreshold) {
        const sameContent = recentMessages.filter(m => m.content === message.content).length;
        if (sameContent >= 3) {
          violationReason = "spam (repeated messages)";
          violationAction = normalizeAction(automodSettings.spam_action, "warn");
        }
      }
    }

    // Check invite links
    if (!violationReason && automodSettings.invites_enabled) {
      const inviteWhitelist = parseCsvSet(automodSettings.invites_whitelist);
      const inviteRegex = /discord\.gg\/[a-zA-Z0-9]+|discord\.com\/invite\/[a-zA-Z0-9]+|discordapp\.com\/invite\/[a-zA-Z0-9]+/gi;
      const inviteMatches = [...message.content.matchAll(inviteRegex)];
      const hasBlockedInvite = inviteMatches.some((m) => {
        const raw = String(m[0] || "").toLowerCase();
        const code = raw.split("/").pop() || "";
        return !inviteWhitelist.has(code);
      });
      if (hasBlockedInvite) {
        violationReason = "Discord invite link";
        violationAction = normalizeAction(automodSettings.invites_action, "delete");
      }
    }

    // Check external links
    if (!violationReason && automodSettings.links_enabled) {
      const whitelistDomains = parseCsvSet(automodSettings.links_whitelist);
      const linkRegex = /https?:\/\/[^\s]+/gi;
      const links = message.content.match(linkRegex) || [];
      const hasBlockedLink = links.some((url) => {
        try {
          const hostname = new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
          if (!whitelistDomains.size) return true;
          for (const domain of whitelistDomains) {
            if (hostname === domain || hostname.endsWith(`.${domain}`)) return false;
          }
          return true;
        } catch {
          return true;
        }
      });
      if (hasBlockedLink) {
        violationReason = "external link";
        violationAction = normalizeAction(automodSettings.links_action, "delete");
      }
    }

    // Check excessive caps
    if (!violationReason && automodSettings.caps_enabled) {
      const capsThreshold = Math.max(50, Number(automodSettings.caps_percentage || 70));
      if (message.content.length > 10) {
        const upperCount = (message.content.match(/[A-Z]/g) || []).length;
        const letterCount = (message.content.match(/[A-Za-z]/g) || []).length;
        if (letterCount > 0 && (upperCount / letterCount) * 100 > capsThreshold) {
          violationReason = "excessive caps";
          violationAction = normalizeAction(automodSettings.caps_action, "delete");
        }
      }
    }

    // Check excessive mentions
    if (!violationReason && automodSettings.mentions_enabled) {
      const mentionThreshold = Math.max(2, Number(automodSettings.mentions_max || 5));
      const mentionCount = (message.mentions.users.size || 0) + (message.mentions.roles.size || 0);
      if (mentionCount >= mentionThreshold) {
        violationReason = "excessive mentions";
        violationAction = normalizeAction(automodSettings.mentions_action, "warn");
      }
    }

    // Check attachments
    if (!violationReason && automodSettings.attach_spam_enabled) {
      const attachMax = Math.max(1, Number(automodSettings.attach_spam_max || 1));
      if (message.attachments.size > attachMax) {
        violationReason = "attachments not allowed";
        violationAction = normalizeAction(automodSettings.attach_spam_action, "warn");
      }
    }

    // If violation found, enforce selected action.
    if (violationReason) {
      try {
        await message.delete();
        const actorId = message.client?.user?.id || BOT_MANAGER_ID;

        if (violationAction === "warn") {
          await run(
            `INSERT INTO mod_warnings (guild_id, user_id, moderator_id, reason, created_at)
             VALUES (?, ?, ?, ?, ?)`,
            [message.guild.id, message.author.id, actorId, `[AutoMod] ${violationReason}`, Date.now()]
          ).catch(() => {});
        }

        if (violationAction === "timeout") {
          const botMember = message.guild.members.me || await message.guild.members.fetchMe().catch(() => null);
          if (botMember && message.member && canModerateMember(botMember, message.member)) {
            await message.member.timeout(10 * 60 * 1000, `[AutoMod] ${violationReason}`).catch(() => {});
          }
        }

        await run(
          `INSERT INTO mod_logs (guild_id, user_id, moderator_id, action, reason, details, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            message.guild.id,
            message.author.id,
            actorId,
            `automod_${violationAction}`,
            `[AutoMod] ${violationReason}`,
            `channel:${message.channel.id}`,
            Date.now()
          ]
        ).catch(() => {});

        await sendGuildLog(message.guild, {
          eventKey: "message_delete",
          actorUserId: actorId,
          color: LOG_THEME.warn,
          title: "🛡️ AutoMod Action",
          sourceChannelId: message.channel?.id,
          description: `AutoMod enforced **${violationAction}** for ${message.author}.`,
          fields: [
            { name: "Reason", value: violationReason, inline: true },
            { name: "User", value: userLabel(message.author), inline: true },
            { name: "Channel", value: channelLabel(message.channel), inline: true }
          ]
        });

        const warningEmbed = new EmbedBuilder()
          .setColor("#ff4444")
          .setTitle("⚠️ 𝔸𝕦𝕥𝕠-𝕄𝕠𝕕𝕖𝕣𝕒𝕥𝕚𝕠𝕟")
          .setDescription(`${message.author}, your message was moderated: **${violationReason}** (action: **${violationAction}**)`)
          .setTimestamp();
        
        const warningMsg = await message.channel.send({ embeds: [warningEmbed] });
        setTimeout(() => warningMsg.delete().catch(() => {}), 5000);
        
        console.log(`[AUTOMOD] Deleted message from ${message.author.tag} in ${message.guild.name}: ${violationReason}`);
        return; // Don't process XP for deleted messages
      } catch (err) {
        console.error("Auto-mod deletion error:", err);
      }
    }
    }
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

  // Fetch partial reaction (needed when message already has reactions)
  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch (err) {
      console.error('Failed to fetch reaction:', err);
      return;
    }
  }

  const msg = reaction.message.partial
    ? await reaction.message.fetch().catch(() => null)
    : reaction.message;

  if (!msg || !msg.guild) return;

  // ─── Suggestion Voting ───
  const suggestion = await get(`SELECT * FROM suggestions WHERE message_id=?`, [msg.id]);
  if (suggestion && (reaction.emoji.name === "👍" || reaction.emoji.name === "👎")) {
    const upvotes = msg.reactions.cache.get("👍")?.count || 0;
    const downvotes = msg.reactions.cache.get("👎")?.count || 0;
    
    // Subtract bot reactions
    const actualUpvotes = Math.max(0, upvotes - 1);
    const actualDownvotes = Math.max(0, downvotes - 1);
    
    await run(`UPDATE suggestions SET upvotes=?, downvotes=? WHERE id=?`, [actualUpvotes, actualDownvotes, suggestion.id]);
    
    // Update embed footer with new counts
    if (msg.embeds.length > 0) {
      const embed = EmbedBuilder.from(msg.embeds[0]);
      embed.setFooter({ text: `👍 ${actualUpvotes} | 👎 ${actualDownvotes}` });
      await msg.edit({ embeds: [embed] }).catch(() => {});
    }
  }

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

  // ─── Starboard ───
  if (reaction.emoji.name === "⭐") {
    const starboardSettings = await get(`SELECT * FROM starboard_settings WHERE guild_id=?`, [msg.guild.id]);
    if (starboardSettings && starboardSettings.enabled) {
      if (!Number(starboardSettings.self_star || 0) && msg.author?.id === user.id) {
        return;
      }
      const starCount = reaction.count || 0;
      const threshold = starboardSettings.threshold || 5;
      
      if (starCount >= threshold) {
        const starboardChannel = msg.guild.channels.cache.get(starboardSettings.channel_id);
        if (starboardChannel && starboardChannel.isTextBased()) {
          // Check if already posted
          const existing = await get(`SELECT * FROM starboard_messages WHERE source_message_id=?`, [msg.id]);
          
          if (!existing) {
            // Create starboard embed
            const embed = new EmbedBuilder()
              .setColor("#ffaa00")
              .setAuthor({ name: msg.author.tag, iconURL: msg.author.displayAvatarURL() })
              .setDescription(msg.content || "*No text content*")
              .addFields({ name: "Channel", value: `<#${msg.channel.id}>`, inline: true })
              .addFields({ name: "Stars", value: `⭐ ${starCount}`, inline: true })
              .setFooter({ text: `ID: ${msg.id}` })
              .setTimestamp(msg.createdAt);
            
            // Add image if present
            const attachment = msg.attachments.first();
            if (attachment && attachment.contentType?.startsWith("image/")) {
              embed.setImage(attachment.url);
            }
            
            const starboardMsg = await starboardChannel.send({
              content: `⭐ **${starCount}** ${msg.url}`,
              embeds: [embed]
            });
            
            // Track in database
            await run(`
              INSERT INTO starboard_messages (guild_id, source_message_id, starboard_message_id, star_count)
              VALUES (?, ?, ?, ?)
            `, [msg.guild.id, msg.id, starboardMsg.id, starCount]);
          } else {
            // Update star count
            await run(`UPDATE starboard_messages SET star_count=? WHERE source_message_id=?`, [starCount, msg.id]);
            
            // Update starboard message
            const starboardMsg = await starboardChannel.messages.fetch(existing.starboard_message_id).catch(() => null);
            if (starboardMsg) {
              const updatedContent = `⭐ **${starCount}** ${msg.url}`;
              const embed = starboardMsg.embeds[0];
              if (embed) {
                const updatedEmbed = EmbedBuilder.from(embed);
                updatedEmbed.data.fields = updatedEmbed.data.fields || [];
                const starFieldIndex = updatedEmbed.data.fields.findIndex(f => f.name === "Stars");
                if (starFieldIndex >= 0) {
                  updatedEmbed.data.fields[starFieldIndex].value = `⭐ ${starCount}`;
                }
                await starboardMsg.edit({ content: updatedContent, embeds: [updatedEmbed] }).catch(() => {});
              }
            }
          }
        }
      }
    }
  }

  // Check for new reaction role system
  const reactionRole = await get(`SELECT * FROM reaction_roles WHERE message_id=? AND emoji=?`, [msg.id, reaction.emoji.name || reaction.emoji.id]);
  if (reactionRole && msg.guild) {
    const member = await msg.guild.members.fetch(user.id).catch(() => null);
    const role = msg.guild.roles.cache.get(reactionRole.role_id);
    if (member && role) {
      await member.roles.add(role).catch(() => {});
    }
  }

  await applyReactionRoleOnAdd(reaction, user).catch((err) => {
    console.error("Reaction role add failed:", err);
  });
});

client.on(Events.MessageReactionRemove, async (reaction, user) => {
  if (user.bot) return;
  
  // Fetch partial reaction (needed when message already has reactions)
  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch (err) {
      console.error('Failed to fetch reaction:', err);
      return;
    }
  }
  
  const msg = reaction.message.partial
    ? await reaction.message.fetch().catch(() => null)
    : reaction.message;
  
  if (!msg) return;
  
  // ─── Suggestion Voting (removal) ───
  const suggestion = await get(`SELECT * FROM suggestions WHERE message_id=?`, [msg.id]);
  if (suggestion && (reaction.emoji.name === "👍" || reaction.emoji.name === "👎")) {
    const upvotes = msg.reactions.cache.get("👍")?.count || 0;
    const downvotes = msg.reactions.cache.get("👎")?.count || 0;
    
    // Subtract bot reactions
    const actualUpvotes = Math.max(0, upvotes - 1);
    const actualDownvotes = Math.max(0, downvotes - 1);
    
    await run(`UPDATE suggestions SET upvotes=?, downvotes=? WHERE id=?`, [actualUpvotes, actualDownvotes, suggestion.id]);
    
    // Update embed footer with new counts
    if (msg.embeds.length > 0) {
      const embed = EmbedBuilder.from(msg.embeds[0]);
      embed.setFooter({ text: `👍 ${actualUpvotes} | 👎 ${actualDownvotes}` });
      await msg.edit({ embeds: [embed] }).catch(() => {});
    }
  }
  
  // ─── Starboard (removal) ───
  if (reaction.emoji.name === "⭐") {
    const starboardSettings = await get(`SELECT * FROM starboard_settings WHERE guild_id=?`, [msg.guild.id]);
    if (starboardSettings && starboardSettings.enabled) {
      const starCount = reaction.count || 0;
      const threshold = starboardSettings.threshold || 5;
      
      const existing = await get(`SELECT * FROM starboard_messages WHERE source_message_id=?`, [msg.id]);
      
      if (existing) {
        if (starCount < threshold) {
          // Remove from starboard if below threshold
          const starboardChannel = msg.guild.channels.cache.get(starboardSettings.channel_id);
          if (starboardChannel && starboardChannel.isTextBased()) {
            const starboardMsg = await starboardChannel.messages.fetch(existing.starboard_message_id).catch(() => null);
            if (starboardMsg) {
              await starboardMsg.delete().catch(() => {});
            }
          }
          await run(`DELETE FROM starboard_messages WHERE source_message_id=?`, [msg.id]);
        } else {
          // Update star count
          await run(`UPDATE starboard_messages SET star_count=? WHERE source_message_id=?`, [starCount, msg.id]);
          
          const starboardChannel = msg.guild.channels.cache.get(starboardSettings.channel_id);
          if (starboardChannel && starboardChannel.isTextBased()) {
            const starboardMsg = await starboardChannel.messages.fetch(existing.starboard_message_id).catch(() => null);
            if (starboardMsg) {
              const updatedContent = `⭐ **${starCount}** ${msg.url}`;
              const embed = starboardMsg.embeds[0];
              if (embed) {
                const updatedEmbed = EmbedBuilder.from(embed);
                updatedEmbed.data.fields = updatedEmbed.data.fields || [];
                const starFieldIndex = updatedEmbed.data.fields.findIndex(f => f.name === "Stars");
                if (starFieldIndex >= 0) {
                  updatedEmbed.data.fields[starFieldIndex].value = `⭐ ${starCount}`;
                }
                await starboardMsg.edit({ content: updatedContent, embeds: [updatedEmbed] }).catch(() => {});
              }
            }
          }
        }
      }
    }
  }

  // Check for new reaction role system removal
  const reactionRole = await get(`SELECT * FROM reaction_roles WHERE message_id=? AND emoji=?`, [msg.id, reaction.emoji.name || reaction.emoji.id]);
  if (reactionRole && msg.guild) {
    const member = await msg.guild.members.fetch(user.id).catch(() => null);
    const role = msg.guild.roles.cache.get(reactionRole.role_id);
    if (member && role) {
      await member.roles.remove(role).catch(() => {});
    }
  }
  
  await applyReactionRoleOnRemove(reaction, user).catch((err) => {
    console.error("Reaction role remove failed:", err);
  });
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
// Reaction Role Questions Handler
// ─────────────────────────────────────────────────────

async function handleReactionRoleSelection(interaction) {
  if (!interaction.isStringSelectMenu()) return false;
  if (!interaction.customId.startsWith("reaction_role_select_")) return false;

  try {
    const questionId = parseInt(interaction.customId.replace("reaction_role_select_", ""), 10);
    if (!Number.isInteger(questionId)) {
      await interaction.reply({ content: "❌ Invalid question ID.", ephemeral: true });
      return true;
    }

    const optionId = parseInt(interaction.values[0], 10);
    if (!Number.isInteger(optionId)) {
      await interaction.reply({ content: "❌ Invalid option ID.", ephemeral: true });
      return true;
    }

    // Fetch all options for this question
    const options = await getReactionRoleOptions(questionId);
    // PostgreSQL returns BIGINT as strings, so compare as integers
    const selectedOption = options.find((opt) => parseInt(opt.id, 10) === optionId);

    if (!selectedOption) {
      await interaction.reply({ content: "❌ Option not found.", ephemeral: true });
      return true;
    }

    // Parse role IDs for selected option
    const selectedRoleIds = selectedOption.role_ids.split(",").map((id) => id.trim()).filter(Boolean);

    if (selectedRoleIds.length === 0) {
      await interaction.reply({ content: "❌ No roles configured for this option.", ephemeral: true });
      return true;
    }

    const member = interaction.member;
    const removedRoles = [];
    const addedRoles = [];
    const failedRoles = [];

    // First, remove roles from all OTHER options
    for (const option of options) {
      if (parseInt(option.id, 10) === optionId) continue; // Skip the selected option
      
      const otherRoleIds = option.role_ids.split(",").map((id) => id.trim()).filter(Boolean);
      for (const roleId of otherRoleIds) {
        try {
          const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
          if (role && member.roles.cache.has(roleId)) {
            await member.roles.remove(role);
            removedRoles.push(role.name);
          }
        } catch (err) {
          console.error(`Failed to remove role ${roleId}:`, err);
        }
      }
    }

    // Now add roles from the selected option
    for (const roleId of selectedRoleIds) {
      try {
        const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
        if (role) {
          if (!member.roles.cache.has(roleId)) {
            await member.roles.add(role);
            addedRoles.push(role.name);
          } else {
            addedRoles.push(`${role.name} (already had)`);
          }
        } else {
          failedRoles.push(roleId);
        }
      } catch (err) {
        console.error(`Failed to grant role ${roleId}:`, err);
        failedRoles.push(roleId);
      }
    }

    // Build detailed response message
    let responseMessage = `✅ **Selected:** ${selectedOption.label}`;
    
    if (addedRoles.length > 0) {
      responseMessage += `\n\n**Added roles:** ${addedRoles.join(", ")}`;
    }
    
    if (removedRoles.length > 0) {
      responseMessage += `\n**Removed roles from other options:** ${removedRoles.join(", ")}`;
    }
    
    if (failedRoles.length > 0) {
      responseMessage += `\n\n⚠️ **Failed to process some roles:** ${failedRoles.join(", ")}`;
    }

    await interaction.reply({
      content: responseMessage,
      ephemeral: true
    });

    return true;
  } catch (err) {
    console.error("Reaction role selection error:", err);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: "❌ An error occurred while granting roles.", ephemeral: true });
    } else {
      await interaction.reply({ content: "❌ An error occurred while granting roles.", ephemeral: true });
    }
    return true;
  }
}

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
    if (interaction.isButton() && interaction.customId.startsWith("modact:")) {
      const parsed = parseModActionCustomId(interaction.customId);
      if (!parsed) {
        await interaction.reply({ content: "Unknown moderation action.", ephemeral: true }).catch(() => {});
        return;
      }

      const context = await resolveModActionContext(interaction, parsed.targetUserId);
      if (!context.ok) {
        await interaction.reply({ content: context.message, ephemeral: true }).catch(() => {});
        return;
      }

      const modal = new ModalBuilder()
        .setCustomId(`modact_modal:${parsed.action}:${parsed.targetUserId}`)
        .setTitle(`Confirm ${parsed.action.toUpperCase()} action`);

      const reasonInput = new TextInputBuilder()
        .setCustomId("reason")
        .setLabel("Reason")
        .setStyle(TextInputStyle.Paragraph)
        .setMinLength(3)
        .setMaxLength(300)
        .setRequired(true)
        .setPlaceholder("Enter moderation reason...");

      modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
      await interaction.showModal(modal).catch(() => {});
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith("modact_modal:")) {
      const parsed = parseModActionCustomId(interaction.customId.replace("modact_modal:", "modact:"));
      if (!parsed) {
        await interaction.reply({ content: "Unknown moderation action.", ephemeral: true }).catch(() => {});
        return;
      }

      const context = await resolveModActionContext(interaction, parsed.targetUserId);
      if (!context.ok) {
        await interaction.reply({ content: context.message, ephemeral: true }).catch(() => {});
        return;
      }

      const reasonRaw = interaction.fields.getTextInputValue("reason");
      const reason = trimText(String(reasonRaw || "").trim(), 300);
      if (!reason) {
        await interaction.reply({ content: "A moderation reason is required.", ephemeral: true }).catch(() => {});
        return;
      }

      const { actor, targetMember } = context;

      if (parsed.action === "warn") {
        await run(
          `INSERT INTO mod_warnings (guild_id, user_id, moderator_id, reason, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          [interaction.guild.id, targetMember.id, actor.id, reason, Date.now()]
        );
        await run(
          `INSERT INTO mod_logs (guild_id, user_id, moderator_id, action, reason, details, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [interaction.guild.id, targetMember.id, actor.id, "warn", reason, "Triggered from log action button", Date.now()]
        );
        await interaction.reply({ content: `Warned ${targetMember.user.tag}.`, ephemeral: true }).catch(() => {});
        return;
      }

      if (parsed.action === "mute") {
        const until = Date.now() + QUICK_MUTE_MS;
        const muted = await targetMember.timeout(QUICK_MUTE_MS, reason).catch(() => null);
        if (!muted) {
          await interaction.reply({ content: "I could not mute that member (check role hierarchy and permissions).", ephemeral: true }).catch(() => {});
          return;
        }
        await run(
          `INSERT INTO mod_logs (guild_id, user_id, moderator_id, action, reason, details, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [interaction.guild.id, targetMember.id, actor.id, "mute", reason, `Muted until ${new Date(until).toISOString()}`, Date.now()]
        );
        await interaction.reply({ content: `Muted ${targetMember.user.tag} for 10 minutes.`, ephemeral: true }).catch(() => {});
        return;
      }

      if (parsed.action === "kick") {
        const kicked = await targetMember.kick(reason).catch(() => null);
        if (!kicked) {
          await interaction.reply({ content: "I could not kick that member (check role hierarchy and permissions).", ephemeral: true }).catch(() => {});
          return;
        }
        await run(
          `INSERT INTO mod_logs (guild_id, user_id, moderator_id, action, reason, details, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [interaction.guild.id, parsed.targetUserId, actor.id, "kick", reason, "Triggered from log action button", Date.now()]
        );
        await interaction.reply({ content: `Kicked ${targetMember.user.tag}.`, ephemeral: true }).catch(() => {});
        return;
      }

      await interaction.reply({ content: "Unknown moderation action.", ephemeral: true }).catch(() => {});
      return;
    }

    const handledTicket = await handleTicketInteraction(interaction);
    if (handledTicket) return;

    const handledReactionRole = await handleReactionRoleSelection(interaction);
    if (handledReactionRole) return;

    await handleSlashCommand(interaction);
  } catch (err) {
    console.error("Interaction handler failed:", err);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "Command failed.", ephemeral: true }).catch(() => {});
    }
  }
});

client.on(Events.GuildCreate, async (guild) => {
  try {
    await registerSlashCommands(client);
    console.log(`[slash] Synced commands after joining guild ${guild.id}`);
  } catch (err) {
    console.error("[slash] GuildCreate sync failed:", err);
  }
});

client.on(Events.MessageDelete, async (message) => {
  if (!message?.guild || message.author?.bot) return;
  if (message.partial) {
    await message.fetch().catch(() => {});
  }

  await storeDeletedMessageForSnipe(message).catch(() => {});

  const deleter = await getAuditExecutor(message.guild, AuditLogEvent.MessageDelete, message.author?.id);
  const deletedBy = deleter
    ? userLabel(deleter)
    : message.author
      ? `${userLabel(message.author)} (self-delete)`
      : "Unknown";
  const actorUserId = deleter?.id || message.author?.id || null;
  const mediaItems = collectRenderableMediaItems(message);
  await sendGuildLog(message.guild, {
    eventKey: "message_delete",
    actorUserId,
    renderSummaryImage: false,
    mediaItems,
    color: LOG_THEME.warn,
    title: "🗑️ Message Deleted",
    sourceChannelId: message.channel?.id,
    description: `A message was deleted in ${message.channel ? channelLabel(message.channel) : "unknown channel"}.`,
    enableModActions: true,
    targetUserId: message.author?.id || null,
    fields: [
      { name: "Author", value: userLabel(message.author), inline: true },
      { name: "Deleted By", value: deletedBy, inline: true },
      { name: "Content", value: formatMessageLogContent(message) }
    ]
  });
});

client.on(Events.MessageBulkDelete, async (messages, channel) => {
  const guild = channel?.guild;
  if (!guild) return;

  const executor = await getAuditExecutor(guild, AuditLogEvent.MessageBulkDelete, null);
  const tracked = findRecentModAction({
    guildId: guild.id,
    action: "message_bulk_delete",
    matcher: (data) => data?.channelId === channel?.id,
    ttlMs: 60_000
  });
  const actorLabel = await resolveActionActorLabel(guild, executor, tracked?.actorId);
  const actorUserId = tracked?.actorId || executor?.id || null;
  const preview = messages
    .first(5)
    .map((msg) => `${msg.author ? msg.author.username : "Unknown"}: ${trimText(formatMessageLogContent(msg), 180)}`)
    .join("\n");

  await sendGuildLog(guild, {
    eventKey: "message_bulk_delete",
    actorUserId,
    color: LOG_THEME.warn,
    title: "🧹 Bulk Purge",
    sourceChannelId: channel?.id,
    description: `${messages.size} messages were purged in ${channel ? channelLabel(channel) : "unknown channel"}.`,
    fields: [
      { name: "Purged By", value: actorLabel, inline: true },
      { name: "Message Count", value: String(messages.size), inline: true },
      { name: "Sample", value: preview || "No message preview available." }
    ]
  });
});

client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
  if (!newMessage?.guild) return;
  if (oldMessage.partial) await oldMessage.fetch().catch(() => {});
  if (newMessage.partial) await newMessage.fetch().catch(() => {});
  if ((oldMessage.content || "") === (newMessage.content || "")) return;
  if (newMessage.author?.bot) return;

  await storeEditedMessageForSnipe(oldMessage, newMessage).catch(() => {});

  const beforeMediaItems = collectRenderableMediaItems(oldMessage);
  const afterMediaItems = collectRenderableMediaItems(newMessage);
  const mediaItems = [];
  const mediaSeen = new Set();
  for (const item of [...afterMediaItems, ...beforeMediaItems]) {
    if (!item?.url || mediaSeen.has(item.url)) continue;
    mediaSeen.add(item.url);
    mediaItems.push(item);
  }

  await sendGuildLog(newMessage.guild, {
    eventKey: "message_edit",
    actorUserId: newMessage.author?.id,
    renderSummaryImage: false,
    mediaItems,
    color: LOG_THEME.info,
    title: "✏️ Message Edited",
    sourceChannelId: newMessage.channel?.id,
    description: `**Message Edited in** ${newMessage.channel ? channelLabel(newMessage.channel) : "unknown channel"}`,
    enableModActions: true,
    targetUserId: newMessage.author?.id || null,
    fields: [
      { name: "Author", value: userLabel(newMessage.author), inline: true },
      { name: "User ID", value: `\`${newMessage.author?.id}\``, inline: true },
      { name: "Before", value: formatMessageLogContent(oldMessage) },
      { name: "After", value: formatMessageLogContent(newMessage) },
      { name: "Jump to Message", value: `[Click here](https://discord.com/channels/${newMessage.guild.id}/${newMessage.channel.id}/${newMessage.id})` }
    ]
  });
});

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  const guild = newState.guild || oldState.guild;
  if (!guild || newState.member?.user?.bot) return;

  if (!oldState.channelId && newState.channelId) {
    await sendGuildLog(guild, {
      eventKey: "voice_join",
      actorUserId: newState.member?.id,
      color: LOG_THEME.info,
      title: "🔊 Voice Join",
      sourceChannelId: newState.channel?.id,
      description: `${userLabel(newState.member?.user)} joined ${channelLabel(newState.channel)}.`
    });
    return;
  }

  if (oldState.channelId && !newState.channelId) {
    await sendGuildLog(guild, {
      eventKey: "voice_leave",
      actorUserId: oldState.member?.id,
      color: LOG_THEME.info,
      title: "🔇 Voice Leave",
      sourceChannelId: oldState.channel?.id,
      description: `${userLabel(oldState.member?.user)} left ${channelLabel(oldState.channel)}.`
    });
    return;
  }

  if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
    await sendGuildLog(guild, {
      eventKey: "voice_move",
      actorUserId: newState.member?.id,
      color: LOG_THEME.info,
      title: "🔁 Voice Move",
      sourceChannelIds: [oldState.channel?.id, newState.channel?.id],
      description: `${userLabel(newState.member?.user)} moved from ${channelLabel(oldState.channel)} to ${channelLabel(newState.channel)}.`
    });
  }
});

client.on(Events.GuildMemberAdd, async (member) => {
  const risk = scoreJoinRisk(member);

  // Logging
  await sendGuildLog(member.guild, {
    eventKey: "member_join",
    actorUserId: member.id,
    renderSummaryImage: true,
    color: LOG_THEME.info,
    title: "📥 Member Joined",
    enableModActions: true,
    targetUserId: member.id,
    description: `${userLabel(member.user)} joined the server.`,
    fields: [
      { name: "User", value: userLabel(member.user), inline: true },
      { name: "Risk Score", value: `${risk.score}/100`, inline: true },
      { name: "Risk Signals", value: trimText(risk.reasons.join("; "), 900), inline: false }
    ]
  });

  const settings = await getGuildSettings(member.guild.id).catch(() => null);
  const thresholdDays = Number(settings?.new_account_warn_days ?? 1);
  if (thresholdDays > 0) {
    const accountAgeMs = Date.now() - Number(member.user?.createdTimestamp || 0);
    const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;
    if (accountAgeMs <= thresholdMs) {
      const accountAgeDays = Math.max(0, Math.floor(accountAgeMs / (24 * 60 * 60 * 1000)));
      await sendGuildLog(member.guild, {
        eventKey: "member_join_new_account",
        actorUserId: member.id,
        renderSummaryImage: true,
        color: LOG_THEME.warn,
        title: "⚠️ New Account Joined",
        enableModActions: true,
        targetUserId: member.id,
        description: `${userLabel(member.user)} joined with a recently created account.`,
        fields: [
          { name: "User", value: userLabel(member.user), inline: true },
          { name: "Risk Score", value: `${risk.score}/100`, inline: true },
          { name: "Account Age", value: `${accountAgeDays} day(s)`, inline: true },
          { name: "Threshold", value: `${thresholdDays} day(s)`, inline: true }
        ]
      });
    }
  }

  // Welcome message
  try {
    const welcomeSettings = await get(
      `SELECT * FROM welcome_goodbye_settings WHERE guild_id=?`,
      [member.guild.id]
    );
    if (welcomeSettings?.welcome_enabled && welcomeSettings?.welcome_channel_id) {
      const channel = member.guild.channels.cache.get(welcomeSettings.welcome_channel_id);
      if (channel?.isTextBased()) {
        let message = (welcomeSettings.welcome_message || 'Welcome {user} to {server}!')
          .replace(/{user}/g, `<@${member.id}>`)
          .replace(/{server}/g, member.guild.name)
          .replace(/{count}/g, String(member.guild.memberCount))
          .replace(/{role:(\d+)}/g, (_, id) => `<@&${id}>`)
          .replace(/{channel:(\d+)}/g, (_, id) => `<#${id}>`);
        
        if (welcomeSettings.welcome_embed) {
          const embed = new EmbedBuilder()
            .setColor(welcomeSettings.welcome_embed_color || '#7bc96f')
            .setDescription(message)
            .setThumbnail(member.user.displayAvatarURL({ size: 128 }))
            .setFooter({ text: `Member #${member.guild.memberCount}` })
            .setTimestamp();
          await channel.send({ embeds: [embed] }).catch(() => {});
        } else {
          await channel.send(message).catch(() => {});
        }
      }
    }
  } catch (err) {
    console.error('Welcome message error:', err);
  }

  // Auto-roles
  try {
    const autoRoles = await all(
      `SELECT role_id FROM auto_roles WHERE guild_id=?`,
      [member.guild.id]
    ).catch(() => []);
    
    const roles = await member.guild.roles.fetch();
    for (const row of autoRoles) {
      const role = roles.get(row.role_id);
      if (role && !member.roles.cache.has(role.id)) {
        await member.roles.add(role).catch(() => {});
      }
    }
  } catch (err) {
    // Auto-roles might not be set up yet
  }
});

client.on(Events.GuildMemberRemove, async (member) => {
  const executor = await getAuditExecutor(member.guild, AuditLogEvent.MemberKick, member.id)
    || await getAuditExecutor(member.guild, AuditLogEvent.MemberBanAdd, member.id);
  const tracked = findRecentModAction({
    guildId: member.guild.id,
    action: "member_remove",
    matcher: (data) => data?.targetUserId === member.id,
    ttlMs: 60_000
  });
  const actorLabel = await resolveActionActorLabel(member.guild, executor, tracked?.actorId);
  const actorUserId = tracked?.actorId || executor?.id || member.id || null;

  await sendGuildLog(member.guild, {
    eventKey: "member_leave",
    actorUserId,
    color: LOG_THEME.warn,
    title: "📤 Member Left",
    description: `${userLabel(member.user)} left or was removed.`,
    fields: [
      { name: "User", value: userLabel(member.user), inline: true },
      { name: "Action By", value: actorLabel, inline: true }
    ]
  });

  // Goodbye message
  try {
    const goodbyeSettings = await get(
      `SELECT * FROM welcome_goodbye_settings WHERE guild_id=?`,
      [member.guild.id]
    );
    if (goodbyeSettings?.goodbye_enabled && goodbyeSettings?.goodbye_channel_id) {
      const channel = member.guild.channels.cache.get(goodbyeSettings.goodbye_channel_id);
      if (channel?.isTextBased()) {
        let message = (goodbyeSettings.goodbye_message || 'Goodbye {user}!')
          .replace(/{user}/g, member.user.tag)
          .replace(/{server}/g, member.guild.name)
          .replace(/{count}/g, String(member.guild.memberCount))
          .replace(/{role:(\d+)}/g, (_, id) => `<@&${id}>`)
          .replace(/{channel:(\d+)}/g, (_, id) => `<#${id}>`);
        
        if (goodbyeSettings.goodbye_embed) {
          const embed = new EmbedBuilder()
            .setColor(goodbyeSettings.goodbye_embed_color || '#8b7355')
            .setDescription(message)
            .setThumbnail(member.user.displayAvatarURL({ size: 128 }))
            .setFooter({ text: `Members: ${member.guild.memberCount}` })
            .setTimestamp();
          await channel.send({ embeds: [embed] }).catch(() => {});
        } else {
          await channel.send(message).catch(() => {});
        }
      }
    }
  } catch (err) {
    console.error('Goodbye message error:', err);
  }
});

client.on(Events.GuildBanAdd, async (ban) => {
  const executor = await getAuditExecutor(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
  const tracked = findRecentModAction({
    guildId: ban.guild.id,
    action: "ban_add",
    matcher: (data) => data?.targetUserId === ban.user.id,
    ttlMs: 60_000
  });
  const actorLabel = await resolveActionActorLabel(ban.guild, executor, tracked?.actorId);
  const actorUserId = tracked?.actorId || executor?.id || null;
  await triggerAntiNukeIfNeeded(ban.guild, "ban_add", actorUserId);
  await sendGuildLog(ban.guild, {
    eventKey: "ban_add",
    actorUserId,
    color: LOG_THEME.mod,
    title: "⛔ Member Banned",
    enableModActions: true,
    targetUserId: ban.user.id,
    description: `${userLabel(ban.user)} was banned.`,
    fields: [{ name: "Moderator", value: actorLabel, inline: true }]
  });
});

client.on(Events.GuildBanRemove, async (ban) => {
  const executor = await getAuditExecutor(ban.guild, AuditLogEvent.MemberBanRemove, ban.user.id);
  const tracked = findRecentModAction({
    guildId: ban.guild.id,
    action: "ban_remove",
    matcher: (data) => data?.targetUserId === ban.user.id,
    ttlMs: 60_000
  });
  const actorLabel = await resolveActionActorLabel(ban.guild, executor, tracked?.actorId);
  await sendGuildLog(ban.guild, {
    eventKey: "ban_remove",
    actorUserId: tracked?.actorId || executor?.id || null,
    color: LOG_THEME.mod,
    title: "✅ Member Unbanned",
    enableModActions: true,
    targetUserId: ban.user.id,
    description: `${userLabel(ban.user)} was unbanned.`,
    fields: [{ name: "Moderator", value: actorLabel, inline: true }]
  });
});

client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  if (oldMember.user?.bot) return;

  const oldRoles = new Set(oldMember.roles.cache.keys());
  const newRoles = new Set(newMember.roles.cache.keys());
  const added = [...newRoles].filter((id) => !oldRoles.has(id));
  const removed = [...oldRoles].filter((id) => !newRoles.has(id));

  if (added.length || removed.length) {
    const executor = await getAuditExecutor(newMember.guild, AuditLogEvent.MemberRoleUpdate, newMember.id);
    const tracked = findRecentModAction({
      guildId: newMember.guild.id,
      action: "member_role_update",
      matcher: (data) => data?.targetUserId === newMember.id,
      ttlMs: 60_000
    });
    const actorLabel = await resolveActionActorLabel(newMember.guild, executor, tracked?.actorId);
    await sendGuildLog(newMember.guild, {
      eventKey: "member_role_update",
      actorUserId: tracked?.actorId || executor?.id || null,
      color: LOG_THEME.mod,
      title: "🧩 Roles Updated",
      enableModActions: true,
      targetUserId: newMember.id,
      description: `${userLabel(newMember.user)} role membership changed.`,
      fields: [
        { name: "Added", value: added.length ? added.map((id) => roleLabel(newMember.guild, id)).join(", ") : "None" },
        { name: "Removed", value: removed.length ? removed.map((id) => roleLabel(newMember.guild, id)).join(", ") : "None" },
        { name: "Updated By", value: actorLabel, inline: true }
      ]
    });
  }

  if ((oldMember.nickname || "") !== (newMember.nickname || "")) {
    const nickExecutor = await getAuditExecutor(newMember.guild, AuditLogEvent.MemberUpdate, newMember.id);
    const tracked = findRecentModAction({
      guildId: newMember.guild.id,
      action: "member_nick_update",
      matcher: (data) => data?.targetUserId === newMember.id,
      ttlMs: 60_000
    });
    const actorLabel = await resolveActionActorLabel(newMember.guild, nickExecutor, tracked?.actorId);
    await sendGuildLog(newMember.guild, {
      eventKey: "member_nick_update",
      actorUserId: tracked?.actorId || nickExecutor?.id || newMember.id,
      color: LOG_THEME.info,
      title: "📝 Nickname Changed",
      enableModActions: true,
      targetUserId: newMember.id,
      description: `${userLabel(newMember.user)} nickname updated.`,
      fields: [
        { name: "Before", value: oldMember.nickname || "(none)", inline: true },
        { name: "After", value: newMember.nickname || "(none)", inline: true },
        { name: "Updated By", value: actorLabel || "Unknown", inline: true }
      ]
    });
  }

  const oldTimeout = oldMember.communicationDisabledUntilTimestamp || null;
  const newTimeout = newMember.communicationDisabledUntilTimestamp || null;
  if (oldTimeout !== newTimeout) {
    const tracked = findRecentModAction({
      guildId: newMember.guild.id,
      action: "member_timeout",
      matcher: (data) => data?.targetUserId === newMember.id && data?.timedOut === Boolean(newTimeout),
      ttlMs: 60_000
    });
    const actorLabel = tracked?.actorId ? await labelFromUserId(newMember.guild, tracked.actorId) : "Unknown";
    await sendGuildLog(newMember.guild, {
      eventKey: "member_timeout",
      actorUserId: tracked?.actorId || null,
      color: LOG_THEME.mod,
      title: newTimeout ? "🔇 Member Muted" : "🔊 Member Unmuted",
      enableModActions: true,
      targetUserId: newMember.id,
      description: `${userLabel(newMember.user)} ${newTimeout ? "was muted (timed out)" : "was unmuted"}.`,
      fields: [
        ...(newTimeout ? [{ name: "Until", value: `<t:${Math.floor(newTimeout / 1000)}:F>` }] : []),
        { name: "Moderator", value: actorLabel || "Unknown", inline: true }
      ]
    });
  }
});

client.on(Events.ChannelCreate, async (channel) => {
  if (!channel.guild) return;
  
  // Skip logging private VC channels to reduce log spam
  const isPrivateVC = await get(
    `SELECT 1 FROM private_voice_rooms WHERE guild_id=? AND (voice_channel_id=? OR text_channel_id=?)`,
    [channel.guild.id, channel.id, channel.id]
  );
  if (isPrivateVC) return;
  
  await sendGuildLog(channel.guild, {
    eventKey: "channel_create",
    color: LOG_THEME.info,
    title: "➕ Channel Created",
    sourceChannelId: channel.id,
    description: `${channelLabel(channel)} was created.`
  });
});

client.on(Events.ChannelDelete, async (channel) => {
  if (!channel.guild) return;
  
  // Skip logging private VC channels to reduce log spam
  const isPrivateVC = await get(
    `SELECT 1 FROM private_voice_rooms WHERE guild_id=? AND (voice_channel_id=? OR text_channel_id=?)`,
    [channel.guild.id, channel.id, channel.id]
  );
  if (isPrivateVC) return;

  const executor = await getAuditExecutor(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
  await triggerAntiNukeIfNeeded(channel.guild, "channel_delete", executor?.id || null);
  
  await sendGuildLog(channel.guild, {
    eventKey: "channel_delete",
    actorUserId: executor?.id || null,
    color: LOG_THEME.warn,
    title: "➖ Channel Deleted",
    sourceChannelId: channel.id,
    description: `${channelLabel(channel)} was deleted.`
  });
});

client.on(Events.ChannelUpdate, async (oldChannel, newChannel) => {
  if (!newChannel.guild) return;
  const nameChanged = oldChannel.name !== newChannel.name;
  const topicChanged = oldChannel.topic !== newChannel.topic;
  const nsfwChanged = oldChannel.nsfw !== newChannel.nsfw;
  const slowmodeChanged = oldChannel.rateLimitPerUser !== newChannel.rateLimitPerUser;
  const permsChanged = JSON.stringify(oldChannel.permissionOverwrites.cache.map((o) => [o.id, o.allow.bitfield.toString(), o.deny.bitfield.toString()]))
    !== JSON.stringify(newChannel.permissionOverwrites.cache.map((o) => [o.id, o.allow.bitfield.toString(), o.deny.bitfield.toString()]));
  if (!nameChanged && !slowmodeChanged && !permsChanged && !topicChanged && !nsfwChanged) return;

  // Skip logging private VC channels to reduce log spam
  const isPrivateVC = await get(
    `SELECT 1 FROM private_voice_rooms WHERE guild_id=? AND (voice_channel_id=? OR text_channel_id=?)`,
    [newChannel.guild.id, newChannel.id, newChannel.id]
  );
  if (isPrivateVC) return;

  const executor = await getAuditExecutor(newChannel.guild, AuditLogEvent.ChannelUpdate, newChannel.id);
  const tracked = findRecentModAction({
    guildId: newChannel.guild.id,
    action: "channel_update",
    matcher: (data) => data?.channelId === newChannel.id,
    ttlMs: 60_000
  });
  const actorLabel = await resolveActionActorLabel(newChannel.guild, executor, tracked?.actorId);

  const changeLines = [];
  if (nameChanged) changeLines.push(`**Name:** \`${oldChannel.name || "(unknown)"}\` → \`${newChannel.name || "(unknown)"}\``);
  if (topicChanged) {
    const oldTopic = oldChannel.topic ? (oldChannel.topic.length > 50 ? oldChannel.topic.slice(0, 50) + "..." : oldChannel.topic) : "(none)";
    const newTopic = newChannel.topic ? (newChannel.topic.length > 50 ? newChannel.topic.slice(0, 50) + "..." : newChannel.topic) : "(none)";
    changeLines.push(`**Topic:** ${oldTopic} → ${newTopic}`);
  }
  if (nsfwChanged) changeLines.push(`**NSFW:** ${oldChannel.nsfw ? "Yes" : "No"} → ${newChannel.nsfw ? "Yes" : "No"}`);
  if (slowmodeChanged) changeLines.push(`**Slowmode:** ${oldChannel.rateLimitPerUser || 0}s → ${newChannel.rateLimitPerUser || 0}s`);
  if (permsChanged) changeLines.push(`**Permissions:** Modified (view audit log for details)`);

  await sendGuildLog(newChannel.guild, {
    eventKey: "channel_update",
    actorUserId: tracked?.actorId || executor?.id || null,
    color: LOG_THEME.info,
    title: "🛠️ Channel Updated",
    sourceChannelId: newChannel.id,
    description: `${channelLabel(newChannel)} was updated by ${actorLabel}.`,
    fields: [
      { name: "Changes", value: changeLines.join("\n") || "Updated" },
      { name: "Updated By", value: actorLabel, inline: true }
    ]
  });
});

client.on(Events.RoleCreate, async (role) => {
  const executor = await getAuditExecutor(role.guild, AuditLogEvent.RoleCreate, role.id);
  await sendGuildLog(role.guild, {
    eventKey: "role_create",
    actorUserId: executor?.id || null,
    color: LOG_THEME.mod,
    title: "🏷️ Role Created",
    description: `Role @${role.name} was created.`,
    fields: executor ? [{ name: "Created By", value: userLabel(executor), inline: true }] : []
  });
});

client.on(Events.RoleDelete, async (role) => {
  const executor = await getAuditExecutor(role.guild, AuditLogEvent.RoleDelete, role.id);
  await triggerAntiNukeIfNeeded(role.guild, "role_delete", executor?.id || null);
  await sendGuildLog(role.guild, {
    eventKey: "role_delete",
    actorUserId: executor?.id || null,
    color: LOG_THEME.warn,
    title: "🗑️ Role Deleted",
    description: `Role @${role.name} was deleted.`,
    fields: executor ? [{ name: "Deleted By", value: userLabel(executor), inline: true }] : []
  });
});

client.on(Events.RoleUpdate, async (oldRole, newRole) => {
  const changes = [];
  if (oldRole.name !== newRole.name) {
    changes.push({ name: "Name", value: `${oldRole.name} → ${newRole.name}`, inline: true });
  }
  if (oldRole.hexColor !== newRole.hexColor) {
    changes.push({ name: "Color", value: `${oldRole.hexColor} → ${newRole.hexColor}`, inline: true });
  }
  if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) {
    changes.push({ name: "Permissions", value: permissionDiffLines(oldRole.permissions.bitfield, newRole.permissions.bitfield).join("\n") || "Changed", inline: false });
  }
  if (oldRole.hoist !== newRole.hoist) {
    changes.push({ name: "Display Separately", value: `${oldRole.hoist} → ${newRole.hoist}`, inline: true });
  }
  if (oldRole.mentionable !== newRole.mentionable) {
    changes.push({ name: "Mentionable", value: `${oldRole.mentionable} → ${newRole.mentionable}`, inline: true });
  }
  
  if (!changes.length) return;
  
  const executor = await getAuditExecutor(newRole.guild, AuditLogEvent.RoleUpdate, newRole.id);
  if (executor) {
    changes.push({ name: "Updated By", value: userLabel(executor), inline: true });
  }
  
  await sendGuildLog(newRole.guild, {
    eventKey: "role_update",
    actorUserId: executor?.id || null,
    color: LOG_THEME.mod,
    title: "🎨 Role Updated",
    description: `Role @${newRole.name} was updated.`,
    fields: changes
  });
});

client.on(Events.GuildUpdate, async (oldGuild, newGuild) => {
  if (!newGuild) return;

  const changes = [];
  if (oldGuild.name !== newGuild.name) {
    changes.push(`Name: ${oldGuild.name} → ${newGuild.name}`);
  }
  if (oldGuild.description !== newGuild.description) {
    changes.push(`Description: ${oldGuild.description || "(none)"} → ${newGuild.description || "(none)"}`);
  }
  if (oldGuild.icon !== newGuild.icon) {
    changes.push("Server icon changed");
  }
  if (oldGuild.banner !== newGuild.banner) {
    changes.push("Server banner changed");
  }
  if (oldGuild.splash !== newGuild.splash) {
    changes.push("Invite splash changed");
  }
  if (oldGuild.vanityURLCode !== newGuild.vanityURLCode) {
    changes.push(`Vanity URL: ${oldGuild.vanityURLCode || "(none)"} → ${newGuild.vanityURLCode || "(none)"}`);
  }
  if (oldGuild.verificationLevel !== newGuild.verificationLevel) {
    changes.push(`Verification level: ${oldGuild.verificationLevel} → ${newGuild.verificationLevel}`);
  }
  if (oldGuild.explicitContentFilter !== newGuild.explicitContentFilter) {
    changes.push(`Explicit content filter: ${oldGuild.explicitContentFilter} → ${newGuild.explicitContentFilter}`);
  }
  if (oldGuild.defaultMessageNotifications !== newGuild.defaultMessageNotifications) {
    const oldNotif = oldGuild.defaultMessageNotifications === 0 ? "All Messages" : "Only Mentions";
    const newNotif = newGuild.defaultMessageNotifications === 0 ? "All Messages" : "Only Mentions";
    changes.push(`Default notifications: ${oldNotif} → ${newNotif}`);
  }
  if (oldGuild.mfaLevel !== newGuild.mfaLevel) {
    const oldMfa = oldGuild.mfaLevel === 0 ? "None" : "Elevated";
    const newMfa = newGuild.mfaLevel === 0 ? "None" : "Elevated";
    changes.push(`2FA requirement: ${oldMfa} → ${newMfa}`);
  }
  if (oldGuild.afkChannelId !== newGuild.afkChannelId) {
    changes.push(`AFK channel: ${oldGuild.afkChannelId ? channelLinkFromId(newGuild, oldGuild.afkChannelId) : "none"} → ${newGuild.afkChannelId ? channelLinkFromId(newGuild, newGuild.afkChannelId) : "none"}`);
  }
  if (oldGuild.afkTimeout !== newGuild.afkTimeout) {
    changes.push(`AFK timeout: ${oldGuild.afkTimeout}s → ${newGuild.afkTimeout}s`);
  }
  if (oldGuild.systemChannelId !== newGuild.systemChannelId) {
    changes.push(`System channel: ${oldGuild.systemChannelId ? channelLinkFromId(newGuild, oldGuild.systemChannelId) : "none"} → ${newGuild.systemChannelId ? channelLinkFromId(newGuild, newGuild.systemChannelId) : "none"}`);
  }
  if (oldGuild.rulesChannelId !== newGuild.rulesChannelId) {
    changes.push(`Rules channel: ${oldGuild.rulesChannelId ? channelLinkFromId(newGuild, oldGuild.rulesChannelId) : "none"} → ${newGuild.rulesChannelId ? channelLinkFromId(newGuild, newGuild.rulesChannelId) : "none"}`);
  }
  if (oldGuild.publicUpdatesChannelId !== newGuild.publicUpdatesChannelId) {
    changes.push(`Updates channel: ${oldGuild.publicUpdatesChannelId ? channelLinkFromId(newGuild, oldGuild.publicUpdatesChannelId) : "none"} → ${newGuild.publicUpdatesChannelId ? channelLinkFromId(newGuild, newGuild.publicUpdatesChannelId) : "none"}`);
  }
  if (oldGuild.preferredLocale !== newGuild.preferredLocale) {
    changes.push(`Language: ${oldGuild.preferredLocale} → ${newGuild.preferredLocale}`);
  }

  if (!changes.length) return;

  const executor = await getAuditExecutor(newGuild, AuditLogEvent.GuildUpdate, newGuild.id);
  await sendGuildLog(newGuild, {
    eventKey: "guild_update",
    actorUserId: executor?.id || null,
    color: LOG_THEME.mod,
    title: "🏰 Server Updated",
    description: `${newGuild.name} server settings changed.`,
    fields: [
      { name: "Updated By", value: executor ? userLabel(executor) : "Unknown", inline: true },
      { name: "Changes", value: trimText(changes.join("\n"), 1024) }
    ]
  });
});