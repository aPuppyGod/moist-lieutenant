require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  AuditLogEvent,
  ChannelType,
  EmbedBuilder,
  AttachmentBuilder
} = require("discord.js");
const { createCanvas } = require("canvas");

const { initDb, get, run, all } = require("./db");
const { levelFromXp } = require("./xp");
const { handleCommands, handleSlashCommand, registerSlashCommands } = require("./commands");
const { onVoiceStateUpdate, cleanupPrivateRooms } = require("./voiceRooms");
const { getGuildSettings } = require("./settings");
const { getLevelRoles } = require("./settings");
const { getIgnoredChannels } = require("./settings");
const { getLoggingExclusions } = require("./settings");
const { getLoggingEventConfigs } = require("./settings");
const { getLoggingActorExclusions } = require("./settings");
const { getReactionRoleQuestion, getReactionRoleOptions } = require("./settings");
const { findRecentModAction } = require("./modActionTracker");
const { startDashboard } = require("./dashboard");
const { startSocialFeedNotifier } = require("./socials");
const { applyReactionRoleOnAdd, applyReactionRoleOnRemove } = require("./reactionRoles");
const { handleTicketInteraction } = require("./tickets");
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

const LOG_THEME = {
  info: 0x7bc96f,
  warn: 0x8b7355,
  mod: 0xa8d5a8,
  neutral: 0x0a1e1e
};

function trimText(value, max = 1000) {
  const text = String(value ?? "");
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
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

  if (eventKey) {
    const eventConfigs = await getLoggingEventConfigs(guild.id).catch(() => []);
    const eventConfig = eventConfigs.find((cfg) => cfg.event_key === eventKey);
    if (eventConfig && Number(eventConfig.enabled) !== 1) return;
    if (eventConfig?.channel_id) channelId = eventConfig.channel_id;
  }

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

  await channel.send({
    embeds: [embed],
    files,
    allowedMentions: { parse: [] }
  }).catch(() => {});
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
    startSocialFeedNotifier(client);

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
          const user = await client.users.fetch(reminder.user_id).catch(() => null);
          if (user) {
            const embed = {
              color: 0x3498db,
              title: "⏰ Reminder",
              description: reminder.reminder_text,
              footer: { text: `Set ${new Date(reminder.created_at).toLocaleString()}` }
            };
            await user.send({ embeds: [embed] }).catch(() => {});
          }
          await run(`UPDATE reminders SET completed=1 WHERE id=?`, [reminder.id]);
        }
      } catch (err) {
        console.error("Reminder check failed:", err);
      }
    }, 15_000);

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
          
          const member = await guild.members.fetch(birthday.user_id).catch(() => null);
          if (!member) continue;
          
          const message = settings.message
            .replace(/{user}/g, `<@${birthday.user_id}>`)
            .replace(/{server}/g, guild.name);
          
          await channel.send(message).catch(() => {});
          
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

  // ─── Auto-Moderation ───
  const automodSettings = await get(`SELECT * FROM automod_settings WHERE guild_id=?`, [message.guild.id]);
  if (automodSettings) {
    let violationReason = null;

    // Check spam (repeated messages)
    if (automodSettings.spam_enabled) {
      const spamThreshold = automodSettings.spam_threshold || 5;
      const recentMessages = [...message.channel.messages.cache.values()]
        .filter(m => m.author.id === message.author.id && Date.now() - m.createdTimestamp < 10000)
        .slice(0, 20);
      
      if (recentMessages.length >= spamThreshold) {
        const sameContent = recentMessages.filter(m => m.content === message.content).length;
        if (sameContent >= 3) {
          violationReason = "spam (repeated messages)";
        }
      }
    }

    // Check invite links
    if (!violationReason && automodSettings.invites_enabled) {
      const inviteRegex = /discord\.gg\/[a-zA-Z0-9]+|discord\.com\/invite\/[a-zA-Z0-9]+|discordapp\.com\/invite\/[a-zA-Z0-9]+/gi;
      if (inviteRegex.test(message.content)) {
        violationReason = "Discord invite link";
      }
    }

    // Check external links
    if (!violationReason && automodSettings.links_enabled) {
      const linkRegex = /https?:\/\/[^\s]+/gi;
      if (linkRegex.test(message.content)) {
        violationReason = "external link";
      }
    }

    // Check excessive caps
    if (!violationReason && automodSettings.caps_enabled) {
      const capsThreshold = automodSettings.caps_threshold || 70;
      if (message.content.length > 10) {
        const upperCount = (message.content.match(/[A-Z]/g) || []).length;
        const letterCount = (message.content.match(/[A-Za-z]/g) || []).length;
        if (letterCount > 0 && (upperCount / letterCount) * 100 > capsThreshold) {
          violationReason = "excessive caps";
        }
      }
    }

    // Check excessive mentions
    if (!violationReason && automodSettings.mentions_enabled) {
      const mentionThreshold = automodSettings.mentions_threshold || 5;
      const mentionCount = (message.mentions.users.size || 0) + (message.mentions.roles.size || 0);
      if (mentionCount >= mentionThreshold) {
        violationReason = "excessive mentions";
      }
    }

    // Check attachments
    if (!violationReason && automodSettings.attachments_enabled) {
      if (message.attachments.size > 0) {
        violationReason = "attachments not allowed";
      }
    }

    // If violation found, delete message and warn user
    if (violationReason) {
      try {
        await message.delete();
        const warningEmbed = new EmbedBuilder()
          .setColor("#ff4444")
          .setTitle("⚠️ Auto-Moderation")
          .setDescription(`${message.author}, your message was deleted: **${violationReason}**`)
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
  // Logging
  await sendGuildLog(member.guild, {
    eventKey: "member_join",
    actorUserId: member.id,
    renderSummaryImage: true,
    color: LOG_THEME.info,
    title: "📥 Member Joined",
    description: `${userLabel(member.user)} joined the server.`,
    fields: [{ name: "User", value: userLabel(member.user), inline: true }]
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
        description: `${userLabel(member.user)} joined with a recently created account.`,
        fields: [
          { name: "User", value: userLabel(member.user), inline: true },
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
          .replace(/{count}/g, String(member.guild.memberCount));
        
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
          .replace(/{count}/g, String(member.guild.memberCount));
        
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
  await sendGuildLog(ban.guild, {
    eventKey: "ban_add",
    actorUserId: tracked?.actorId || executor?.id || null,
    color: LOG_THEME.mod,
    title: "⛔ Member Banned",
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
  
  await sendGuildLog(channel.guild, {
    eventKey: "channel_delete",
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
    changes.push({ name: "Permissions", value: "Changed", inline: true });
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