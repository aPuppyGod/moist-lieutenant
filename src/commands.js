// src/commands.js
const { PermissionsBitField, ChannelType, AttachmentBuilder, EmbedBuilder } = require("discord.js");
const { get, all, run } = require("./db");
const { levelFromXp, xpToNextLevel, totalXpForLevel } = require("./xp");
const { createCanvas, loadImage, registerFont } = require("canvas");
// Register bundled font
registerFont(require('path').join(__dirname, '..', 'assets', 'Open_Sans', 'static', 'OpenSans-Regular.ttf'), { family: 'OpenSans' });
const { getLevelRoles, getGuildSettings, upsertReactionRoleBinding, removeReactionRoleBinding, getReactionRoleBindings } = require("./settings");
const { normalizeEmojiKey } = require("./reactionRoles");
const { cmdFish, cmdDig, cmdRobBank, cmdPhone } = require("./economy");
const { recordModAction } = require("./modActionTracker");
const fs = require("fs");
const path = require("path");

const DEFAULT_PREFIX = "!";
const LEGACY_PREFIX = "?";
const BOT_MANAGER_ID = process.env.BOT_MANAGER_ID || "900758140499398676";

const MODERATION_PERMISSION = PermissionsBitField.Flags.ModerateMembers;
const DEFAULT_MOD_COMMAND_PERMISSION = PermissionsBitField.Flags.ManageMessages;

// ─────────────────────────────────────────────────────
// Permission helpers
// ─────────────────────────────────────────────────────

function isAdminOrManager(member) {
  if (!member) return false;
  if (member.id === BOT_MANAGER_ID) return true;
  return member.permissions.has(PermissionsBitField.Flags.Administrator);
}

async function getConfiguredModRoleId(guildId) {
  const settings = await getGuildSettings(guildId);
  return settings?.mod_role_id || null;
}

async function memberHasConfiguredModRoleOrHigher(member) {
  if (!member?.guild) return false;
  const modRoleId = await getConfiguredModRoleId(member.guild.id);
  if (!modRoleId) return false;

  const modRole = member.guild.roles.cache.get(modRoleId) || await member.guild.roles.fetch(modRoleId).catch(() => null);
  if (!modRole) return false;

  return member.roles?.cache?.some((role) => role.position >= modRole.position) || false;
}

async function isModerator(member) {
  if (!member) return false;
  if (isAdminOrManager(member)) return true;
  return await memberHasConfiguredModRoleOrHigher(member);
}

async function requireModerator(message) {
  const ok = await isModerator(message.member);
  if (ok) return true;
  await message.reply("You need mod permissions or the configured mod role.").catch(() => {});
  return false;
}

// ─────────────────────────────────────────────────────
// Private VC room lookup + auth
// ─────────────────────────────────────────────────────

async function getRoomByTextChannel(guildId, textChannelId) {
  return await get(
    `SELECT guild_id, owner_id, voice_channel_id, text_channel_id
     FROM private_voice_rooms
     WHERE guild_id=? AND text_channel_id=?`,
    [guildId, textChannelId]
  );
}

async function assertVoiceCmdAllowed(message) {
  if (!message.guild) return { ok: false, reason: "This command must be used in a server." };

  const room = await getRoomByTextChannel(message.guild.id, message.channel.id);
  if (!room) {
    return {
      ok: false,
      reason: "These VC commands only work in the **paired VC commands channel**."
    };
  }

  const isOwner = message.author.id === room.owner_id;
  const isStaff = isAdminOrManager(message.member);

  if (!isOwner && !isStaff) {
    return { ok: false, reason: "Only the VC owner + admins/managers can use these commands." };
  }

  return { ok: true, room };
}

// ─────────────────────────────────────────────────────
// Role hierarchy check for moderation
// ─────────────────────────────────────────────────────

function canModerate(executor, target) {
  if (!executor || !target) return false;
  if (executor.id === target.id) return false;
  if (target.guild.ownerId === target.id) return false; // Can't moderate server owner
  if (executor.guild.ownerId === executor.id) return true; // Server owner can moderate anyone
  
  const executorHighest = executor.roles.highest;
  const targetHighest = target.roles.highest;
  
  return executorHighest.position > targetHighest.position;
}

// ─────────────────────────────────────────────────────
// Parsing helpers
// ─────────────────────────────────────────────────────

function parseCommand(content, prefixes) {
  const matchedPrefix = prefixes.find((p) => content.startsWith(p));
  if (!matchedPrefix) return null;

  const without = content.slice(matchedPrefix.length).trim();
  if (!without) return null;

  const parts = without.split(/\s+/);
  const cmd = (parts.shift() || "").toLowerCase();
  const args = parts;

  return { cmd, args, prefix: matchedPrefix };
}

async function getActivePrefixes(message) {
  const prefix = DEFAULT_PREFIX;
  return [prefix];
}

async function getModPrefixes(message) {
  const configured = (await getGuildSettings(message.guild.id).catch(() => null))?.command_prefix || DEFAULT_PREFIX;
  const prefix = String(configured || DEFAULT_PREFIX).trim() || DEFAULT_PREFIX;
  return [prefix];
}

function trackModerationAction(message, action, data = {}) {
  if (!message?.guild?.id || !message?.author?.id) return;
  recordModAction({ guildId: message.guild.id, action, actorId: message.author.id, data });
}

async function logModAction(guildId, userId, moderatorId, action, reason = null, details = null) {
  await run(
    `INSERT INTO mod_logs (guild_id, user_id, moderator_id, action, reason, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [guildId, userId, moderatorId, action, reason, details, Date.now()]
  ).catch(err => console.error('Failed to log mod action:', err));
}


// Smart user picker: mention, ID, username, global name, nickname, fuzzy match
async function pickUserSmart(message, arg) {
  if (!message.guild) return null;
  await message.guild.members.fetch().catch(() => {});
  const members = message.guild.members.cache.filter(m => !m.user.bot);

  // 1. Mention
  const mention = message.mentions.users.first();
  if (mention) return { member: message.guild.members.cache.get(mention.id), ambiguous: false };

  // 2. ID
  if (/^\d{15,21}$/.test(arg)) {
    const byId = members.get(arg);
    if (byId) return { member: byId, ambiguous: false };
  }

  // 3. Exact username/global/nickname (case-insensitive)
  const norm = s => String(s || '').toLowerCase();
  let found = members.filter(m =>
    norm(m.user.username) === norm(arg) ||
    norm(m.displayName) === norm(arg) ||
    norm(m.user.globalName) === norm(arg)
  );
  if (found.size === 1) return { member: found.first(), ambiguous: false };
  if (found.size > 1) return { ambiguous: true, matches: found.map(m => m.user.tag) };

  // 4. Fuzzy/partial match (substring, case-insensitive)
  found = members.filter(m =>
    norm(m.user.username).includes(norm(arg)) ||
    norm(m.displayName).includes(norm(arg)) ||
    norm(m.user.globalName).includes(norm(arg))
  );
  if (found.size === 1) return { member: found.first(), ambiguous: false };
  if (found.size > 1) return { ambiguous: true, matches: found.map(m => m.user.tag) };

  // 5. No match
  return null;
}

function clampInt(n, min, max) {
  const x = Number.parseInt(String(n), 10);
  if (Number.isNaN(x)) return null;
  return Math.max(min, Math.min(max, x));
}

function trimText(value, max = 1000) {
  const text = String(value ?? "");
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}...`;
}

function normalizeName(s) {
  return String(s || "").trim().toLowerCase();
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

  if (!usable.length) return "";
  return usable[Math.floor(Math.random() * usable.length)] || "";
}

function extensionFromMime(mimeType) {
  const mime = String(mimeType || "").toLowerCase();
  if (mime.includes("gif")) return "gif";
  if (mime.includes("png")) return "png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  return "bin";
}

async function setUserXp(guildId, userId, xp) {
  await run(
    `INSERT OR IGNORE INTO user_xp 
     (guild_id, user_id, xp, level, last_message_xp_at, last_reaction_xp_at)
     VALUES (?, ?, 0, 0, 0, 0)`,
    [guildId, userId]
  );
  const lvl = levelFromXp(xp);
  await run(
    `UPDATE user_xp SET xp=?, level=? WHERE guild_id=? AND user_id=?`,
    [xp, lvl, guildId, userId]
  );
}

// ─────────────────────────────────────────────────────
// Command implementations
// ─────────────────────────────────────────────────────

// Draw avatar border and frame effects
function drawAvatarBorder(ctx, prefs) {
  const centerX = 90, centerY = 90, radius = 60;
  
  // Get border settings, with defaults
  const borderWidth = parseInt(prefs.avatarborder) || 3;
  const borderColor = prefs.avatarbordercolor || '#7bc96f';
  const glowType = prefs.borderglow || 'none';
  const frameType = prefs.avatarframe || 'none';
  
  // Draw frame style (outer decorative ring)
  if (frameType !== 'none') {
    ctx.save();
    ctx.strokeStyle = frameType === 'gold' ? '#FFD700' : 
                      frameType === 'silver' ? '#C0C0C0' :
                      frameType === 'bronze' ? '#CD7F32' :
                      frameType === 'neon' ? '#7bc96f' : '#7bc96f';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + 8, 0, Math.PI * 2);
    ctx.stroke();
    
    // Inner accent line for frame
    ctx.strokeStyle = ctx.strokeStyle;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  
  // Draw border (main ring)
  ctx.save();
  
  // Apply glow if enabled
  if (glowType !== 'none') {
    const glowRadius = glowType === 'subtle' ? 8 : glowType === 'medium' ? 16 : 24;
    ctx.shadowColor = borderColor + '80';  // 50% opacity
    ctx.shadowBlur = glowRadius;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }
  
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = borderWidth;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.stroke();
  
  ctx.restore();
}

function compactEmbed(title, lines) {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(lines.join("\n"))
    .setColor(0x2b2d31);
}

async function cmdPublicCommands(message) {
  const settings = await getGuildSettings(message.guild.id);
  const prefix = settings?.command_prefix || DEFAULT_PREFIX;
  const economySettings = await get(`SELECT * FROM economy_settings WHERE guild_id=?`, [message.guild.id]);
  const ecoPrefix = economySettings?.economy_prefix || "$";
  
  let economyCommands = "";
  if (economySettings?.enabled) {
    economyCommands = `\n**Economy Commands:**\n\`${ecoPrefix}balance\` \`${ecoPrefix}daily\` \`${ecoPrefix}weekly\` \`${ecoPrefix}pay\` \`${ecoPrefix}baltop\`\n\`${ecoPrefix}deposit\` \`${ecoPrefix}withdraw\` \`${ecoPrefix}rob\` \`${ecoPrefix}bankrob\`\n\`${ecoPrefix}slots\` \`${ecoPrefix}coinflip\` \`${ecoPrefix}dice\`\n\`${ecoPrefix}shop\` \`${ecoPrefix}buy\` \`${ecoPrefix}inventory\`\n**Minigames:**\n\`${ecoPrefix}fish\` \`${ecoPrefix}dig\` \`${ecoPrefix}phone\` \`${ecoPrefix}adventure\` \`${ecoPrefix}explore\``;
  }
  
  const embed = compactEmbed("Commands", [
    `\`${prefix}commands\` \`/commands\``,
    `\`${prefix}rank [user]\` \`/rank\``,
    `\`${prefix}leaderboard [page]\` \`/leaderboard\``,
    `\`${prefix}moist-lieutenant\` - Get website URL`,
    `\`${prefix}8ball <question>\``,
    `\`${prefix}flip\` - Flip a coin`,
    `\`${prefix}poll create <question> | <option1> | <option2> ...\``,
    `\`${prefix}poll end <message_id>\``,
    `\`${prefix}poll list\` - View active polls`,
    `\`${prefix}poll status <message_id>\``,
    `\`${prefix}choose <option1> <option2> ...\``,
    `\`${prefix}suggest <suggestion>\` - Submit a suggestion`,
    `\`${prefix}suggestions [mine|all] [limit]\` - View suggestion queue`,
    `\`${prefix}suggestion-status <id>\` - View one suggestion status`,
    `\`${prefix}suggestion-withdraw <id>\` - Remove your suggestion`,
    `\`${prefix}giveaway start <duration> <winners> <prize>\` - Start a giveaway`,
    `\`${prefix}giveaway list\` - View active giveaways`,
    `\`${prefix}giveaway status <message_id>\` - View giveaway details`,
    `\`${prefix}giveaway cancel <message_id> [reason]\` - Cancel without winners`,
    `\`${prefix}remindme <duration> <message>\` - Set a reminder`,
    `\`${prefix}reminders [limit]\` - List your pending reminders`,
    `\`${prefix}remindcancel <id>\` - Cancel one reminder`,
    `\`${prefix}remindsnooze <id> <duration>\` - Delay a reminder`,
    `\`${prefix}remindclear\` - Cancel all your pending reminders`,
    `\`${prefix}birthday set <MM/DD>\` - Register your birthday`,
    `\`${prefix}birthday list\` / \`${prefix}birthday remove\``,
    economyCommands
  ].filter(Boolean));
  await message.reply({ embeds: [embed] }).catch(() => {});
}

async function cmdModCommands(message) {
  const canUse = await isModerator(message.member);
  if (!canUse) {
    await message.reply("Only moderators (mod role or higher), administrators, or the manager can use this command list.").catch(() => {});
    return;
  }
  const settings = await getGuildSettings(message.guild.id);
  const prefix = settings.command_prefix || LEGACY_PREFIX;
  const embed = compactEmbed("Moderation Commands", [
    "`!mod-role <role-id>` `/mod-role`",
    `\`${prefix}ban <user> [reason]\` \`/ban\``,
    `\`${prefix}unban <user-id> [reason]\` \`/unban\``,
    `\`${prefix}kick <user> [reason]\` \`/kick\``,
    `\`${prefix}mute <user> [duration] [reason]\` \`/mute\``,
    `\`${prefix}unmute <user> [reason]\` \`/unmute\``,
    `\`${prefix}purge <count>\` \`/purge\``,
    `\`${prefix}warn <user> [reason]\` \`/warn\``,
    `\`${prefix}warnings <user>\` \`/warnings\``,
    `\`${prefix}clearwarns <user>\` \`/clearwarns\``,
    `\`${prefix}nick <user> <nick>\` \`/nick\``,
    `\`${prefix}role <user> <role-id>\` \`/role\``,
    `\`${prefix}softban <user> [reason]\` \`/softban\``,
    `\`${prefix}lock\` \`${prefix}unlock\` \`${prefix}slowmode <seconds>\` and matching \`/lock\` \`/unlock\` \`/slowmode\``
  ]);
  await message.reply({ embeds: [embed] }).catch(() => {});
}

async function cmdAdminCommands(message) {
  if (!isAdminOrManager(message.member)) return;
  const settings = await getGuildSettings(message.guild.id);
  const prefix = settings?.command_prefix || DEFAULT_PREFIX;
  const embed = compactEmbed("Admin Commands", [
    `\`${prefix}admin-commands\` \`/admin-commands\``,
    `\`${prefix}xp add/set <user> <amount>\` \`/xp\``,
    `\`${prefix}recalc-levels\` \`/recalc-levels\``,
    `\`${prefix}sync-roles\` \`/sync-roles\``,
    `\`${prefix}reactionrole add <msgId> <emoji> <roleId>\``,
    `\`${prefix}reactionrole remove <msgId> <emoji>\``,
    `\`${prefix}reactionrole list\``
  ]);
  await message.reply({ embeds: [embed] }).catch(() => {});
}

async function cmdSetModRole(message, args) {
  if (!isAdminOrManager(message.member)) {
    await message.reply("Only admins/managers can set the mod role.").catch(() => {});
    return;
  }

  const raw = (args[0] || "").replace(/[<@&>]/g, "");
  if (!/^\d{15,21}$/.test(raw)) {
    await message.reply("Usage: `!mod-role <role-id>`").catch(() => {});
    return;
  }

  const role = await message.guild.roles.fetch(raw).catch(() => null);
  if (!role) {
    await message.reply("I couldn't find that role. Double-check the role ID.").catch(() => {});
    return;
  }

  await run(
    `INSERT INTO guild_settings (guild_id, mod_role_id)
     VALUES (?, ?)
     ON CONFLICT (guild_id)
     DO UPDATE SET mod_role_id=excluded.mod_role_id`,
    [message.guild.id, role.id]
  );

  await message.reply(`✅ Mod role set to <@&${role.id}>.`).catch(() => {});
}

async function cmdRank(message, args) {
  if (!message.guild) return;

  // Use smart picker for !rank <user>
  let targetUser = message.mentions.users.first() || message.author;
  let targetMember = message.mentions.members?.first() || message.member;
  if (args[0]) {
    const pick = await pickUserSmart(message, args[0]);
    if (pick && !pick.ambiguous) {
      targetUser = pick.member.user;
      targetMember = pick.member;
    }
    if (pick && pick.ambiguous) {
      await message.reply(`Multiple users match: ${pick.matches.join(", ")}. Please be more specific or use their ID/username.`).catch(() => {});
      return;
    }
  }

  const row = await get(
    `SELECT xp, level FROM user_xp WHERE guild_id=? AND user_id=?`,
    [message.guild.id, targetUser.id]
  );

  const xp = row?.xp ?? 0;
  const level = row?.level ?? 0;
  const xpStart = totalXpForLevel(level);
  const xpNext = xpStart + xpToNextLevel(level);
  const xpIntoLevel = xp - xpStart;
  const xpToNext = xpNext - xp;

  // Load user prefs FIRST (before creating canvas)
  let prefs = {};
  try {
    prefs = await get(
      `SELECT * FROM user_rankcard_customizations WHERE guild_id = ? AND user_id = ?`,
      [message.guild.id, targetUser.id]
    ) || {};
  } catch {}

  // Rank card image
  const width = 600, height = 180;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Background - image, gradient, or solid color
  let bgMode = prefs.bgmode;
  if (!bgMode) {
    if (prefs.bgimage_data || prefs.bgimage) bgMode = "image";
    else if (prefs.gradient) bgMode = "gradient";
    else bgMode = "color";
  }

  if (bgMode === "image") {
    try {
      if (prefs.bgimage_data) {
        const bgImage = await loadImage(prefs.bgimage_data);
        ctx.drawImage(bgImage, 0, 0, width, height);
      } else if (prefs.bgimage) {
        const bgImage = await loadImage(prefs.bgimage);
        ctx.drawImage(bgImage, 0, 0, width, height);
      } else {
        throw new Error("No background image data");
      }
    } catch (bgErr) {
      bgMode = prefs.gradient ? "gradient" : "color";
    }
  }

  if (bgMode === "gradient") {
    const colors = (prefs.gradient || "").split(",").map(s => s.trim()).filter(Boolean);
    if (colors.length > 1) {
      const grad = ctx.createLinearGradient(0, 0, width, height);
      colors.forEach((c, i) => grad.addColorStop(i / (colors.length - 1), c));
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
    } else {
      ctx.fillStyle = prefs.bgcolor || "#1a2a2a";
      ctx.fillRect(0, 0, width, height);
    }
  } else if (bgMode === "color") {
    ctx.fillStyle = prefs.bgcolor || "#1a2a2a";
    ctx.fillRect(0, 0, width, height);
  }

  // Profile pic
  let avatarLoaded = false;
  // Always use PNG for Discord avatars (supported by node-canvas)
  const sharp = require('sharp');
  let avatarURL = targetUser.displayAvatarURL({ format: "png", size: 128, dynamic: false });
  console.log("Rank card avatar URL:", avatarURL);
  // Accept any avatar type, convert to PNG if needed
  try {
    let avatarBuffer = null;
    let fetchFn = (typeof fetch === 'function') ? fetch : require('node-fetch');
    let res = await fetchFn(avatarURL);
    if (res.ok) {
      let contentType = res.headers.get ? res.headers.get('content-type') : '';
      if (contentType.includes('image/png') || avatarURL.endsWith('.png')) {
        avatarBuffer = typeof res.buffer === 'function' ? await res.buffer() : Buffer.from(await res.arrayBuffer());
      } else {
        // Convert unsupported types to PNG
        let rawBuffer = typeof res.buffer === 'function' ? await res.buffer() : Buffer.from(await res.arrayBuffer());
        avatarBuffer = await sharp(rawBuffer).png().toBuffer();
      }
      const avatar = await loadImage(avatarBuffer);
      ctx.save();
      ctx.beginPath();
      ctx.arc(90, 90, 60, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(avatar, 30, 30, 120, 120);
      ctx.restore();
      
      // Draw avatar border and frame effects
      drawAvatarBorder(ctx, prefs);
    } else {
      throw new Error('Avatar fetch failed');
    }
  } catch (e1) {
    // Try default avatar (always PNG)
    let defaultAvatarURL = targetUser.defaultAvatarURL;
    console.log("Rank card default avatar URL:", defaultAvatarURL);
    try {
      let fetchFn = (typeof fetch === 'function') ? fetch : require('node-fetch');
      let res = await fetchFn(defaultAvatarURL);
      if (res.ok) {
        let avatarBuffer = typeof res.buffer === 'function' ? await res.buffer() : Buffer.from(await res.arrayBuffer());
        const avatar = await loadImage(avatarBuffer);
        ctx.save();
        ctx.beginPath();
        ctx.arc(90, 90, 60, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(avatar, 30, 30, 120, 120);
        ctx.restore();
        
        // Draw avatar border and frame effects
        drawAvatarBorder(ctx, prefs);
      } else {
        throw new Error('Default avatar fetch failed');
      }
    } catch (e2) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(90, 90, 60, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.fillStyle = "#555";
      ctx.fillRect(30, 30, 120, 120);
      ctx.font = "bold 40px OpenSans";
      ctx.fillStyle = "#fff";
      const initials = targetUser.username ? targetUser.username[0].toUpperCase() : "?";
      ctx.fillText(initials, 80, 120);
      ctx.restore();
      
      // Draw avatar border and frame effects
      drawAvatarBorder(ctx, prefs);
      console.error("Default avatar load failed for user:", targetUser.tag, e1, e2);
    }
  }
  // Calculate leaderboard rank
  let rank = null;
  try {
    const leaderboard = await all(
      `SELECT user_id FROM user_xp WHERE guild_id=? ORDER BY xp DESC`,
      [message.guild.id]
    );
    rank = leaderboard.findIndex(row => row.user_id === targetUser.id) + 1;
  } catch (e) {
    rank = null;
  }

  // Font family
  const fontKey = prefs.font || "OpenSans";
  const fontMap = {
    OpenSans: "'Open Sans',sans-serif",
    Arial: "Arial,sans-serif",
    ComicSansMS: "'Comic Sans MS',cursive",
    TimesNewRoman: "'Times New Roman',serif",
    Roboto: "'Roboto',sans-serif",
    Lobster: "'Lobster',cursive",
    Pacifico: "'Pacifico',cursive",
    Oswald: "'Oswald',sans-serif",
    Raleway: "'Raleway',sans-serif",
    BebasNeue: "'Bebas Neue',sans-serif",
    Merriweather: "'Merriweather',serif",
    Nunito: "'Nunito',sans-serif",
    Poppins: "'Poppins',sans-serif",
    Quicksand: "'Quicksand',sans-serif",
    SourceCodePro: "'Source Code Pro',monospace",
    Caveat: "'Caveat',cursive",
    IndieFlower: "'Indie Flower',cursive",
    FiraSans: "'Fira Sans',sans-serif",
    Lato: "'Lato',sans-serif",
    PlayfairDisplay: "'Playfair Display',serif",
    AbrilFatface: "'Abril Fatface',cursive",
    Anton: "'Anton',sans-serif",
    Bangers: "'Bangers',cursive",
    DancingScript: "'Dancing Script',cursive",
    PermanentMarker: "'Permanent Marker',cursive",
    PTSerif: "'PT Serif',serif",
    Rubik: "'Rubik',sans-serif",
    Satisfy: "'Satisfy',cursive",
    Teko: "'Teko',sans-serif",
    VarelaRound: "'Varela Round',sans-serif",
    ZillaSlab: "'Zilla Slab',serif"
  };
  let fontFamily = fontMap[fontKey] || "'Open Sans',sans-serif";
  let fontColor = prefs.fontcolor || "#fff";
  // Always use username to prevent rendering issues with special characters in display names
  let displayName = targetUser.username;
  ctx.font = `bold 28px ${fontFamily}`;
  ctx.fillStyle = fontColor;
  ctx.strokeStyle = "rgba(0,0,0,0.6)";
  ctx.lineWidth = 3;
  ctx.strokeText(displayName, 170, 50);
  ctx.fillText(displayName, 170, 50);

  ctx.font = `bold 22px ${fontFamily}`;
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "rgba(0,0,0,0.7)";
  ctx.lineWidth = 2;
  ctx.strokeText(`Level: ${level}`, 170, 80);
  ctx.fillText(`Level: ${level}`, 170, 80);

  ctx.font = `bold 22px ${fontFamily}`;
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "rgba(0,0,0,0.7)";
  ctx.lineWidth = 2;
  if (rank && rank > 0) ctx.strokeText(`Rank: #${rank}`, 170, 105);
  if (rank && rank > 0) ctx.fillText(`Rank: #${rank}`, 170, 105);

  ctx.font = `16px ${fontFamily}`;
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "rgba(0,0,0,0.7)";
  ctx.lineWidth = 2;
  ctx.strokeText(`XP: ${xp} / ${xpNext} (+${xpToNext} to next)`, 170, 130);
  ctx.fillText(`XP: ${xp} / ${xpNext} (+${xpToNext} to next)`, 170, 130);

  // Progress bar
  const barX = 170, barY = 145, barW = 380, barH = 20;
  ctx.fillStyle = "#444";
  ctx.fillRect(barX, barY, barW, barH);
  const progress = Math.max(0, Math.min(1, (xp - xpStart) / (xpNext - xpStart)));
  ctx.fillStyle = "#43B581";
  ctx.fillRect(barX, barY, barW * progress, barH);
  ctx.strokeStyle = "#222";
  ctx.lineWidth = 2;
  ctx.strokeRect(barX, barY, barW, barH);

  // Progress bar text
  ctx.font = `bold 16px ${fontFamily}`;
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "rgba(0,0,0,0.7)";
  ctx.lineWidth = 2;
  ctx.strokeText(`${xpIntoLevel} / ${xpToNextLevel(level)} XP this level`, barX + 10, barY + 16);
  ctx.fillText(`${xpIntoLevel} / ${xpToNextLevel(level)} XP this level`, barX + 10, barY + 16);

  // Attach only (no embed)
  const buffer = canvas.toBuffer();
  const attachment = new AttachmentBuilder(buffer, { name: "rank.png" });
  await message.reply({ files: [attachment] }).catch(() => {});
}

async function cmdLeaderboard(message, args) {
  if (!message.guild) return;

  const page = clampInt(args[0] ?? "1", 1, 999) ?? 1;
  const perPage = 10;
  const offset = (page - 1) * perPage;

  const rows = await all(
    `SELECT user_id, xp, level
     FROM user_xp
     WHERE guild_id=?
     ORDER BY xp DESC
     LIMIT ? OFFSET ?`,
    [message.guild.id, perPage, offset]
  );

  if (!rows || rows.length === 0) {
    await message.reply(`No leaderboard data yet (page ${page}).`).catch(() => {});
    return;
  }

  const lines = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rank = offset + i + 1;

    // Try to resolve a tag for nicer display
    let name = `<@${r.user_id}>`;
    const member = await message.guild.members.fetch(r.user_id).catch(() => null);
    if (member?.user?.tag) name = member.user.tag;

    // Medal emojis for top 3
    let medal = "";
    if (rank === 1) medal = "🥇";
    else if (rank === 2) medal = "🥈";
    else if (rank === 3) medal = "🥉";
    else medal = `\`${rank}\``;

    // Compact format: rank emoji • name • level • XP
    lines.push(
      `${medal} **${name}** • Lv.${r.level} • \`${r.xp.toLocaleString()} XP\``
    );
  }

  const embed = new EmbedBuilder()
    .setColor(0x7bc96f)
    .setTitle(`🏆 ${message.guild.name} Leaderboard`)
    .setDescription(lines.join("\n"))
    .setFooter({ text: `Page ${page} • Use !leaderboard <page> to view other pages` })
    .setTimestamp();

  await message.reply({ embeds: [embed] }).catch(() => {});
}

async function cmdXp(message, args) {
  if (!message.guild) return;

  if (!isAdminOrManager(message.member)) {
    await message.reply("You need to be an admin/manager to use `!xp` commands.").catch(() => {});
    return;
  }

  const sub = (args[0] || "").toLowerCase();
  const arg = args[1] || "";
  const pick = await pickUserSmart(message, arg);
  if (!sub || !["add", "set"].includes(sub) || !pick) {
    await message.reply(
      "Usage:\n• `!xp add <user> <amount>`\n• `!xp set <user> <amount>`"
    ).catch(() => {});
    return;
  }
  if (pick.ambiguous) {
    await message.reply(`Multiple users match: ${pick.matches.join(", ")}. Please be more specific or use their ID/username.`).catch(() => {});
    return;
  }
  const target = pick.member;
  const amount = Number.parseInt(args[2], 10);
  if (!Number.isFinite(amount)) {
    await message.reply("Amount must be a number.").catch(() => {});
    return;
  }
  // ensure row exists
  await run(
    `INSERT INTO user_xp (guild_id, user_id, xp, level, last_message_xp_at, last_reaction_xp_at)
     VALUES (?, ?, 0, 0, 0, 0)
     ON CONFLICT (guild_id, user_id) DO NOTHING`,
    [message.guild.id, target.id]
  );
  const row = await get(
    `SELECT xp FROM user_xp WHERE guild_id=? AND user_id=?`,
    [message.guild.id, target.id]
  );
  const oldXp = row?.xp ?? 0;
  const newXp = sub === "set" ? Math.max(0, amount) : Math.max(0, oldXp + amount);
  const newLevel = levelFromXp(newXp);
  await run(
    `UPDATE user_xp SET xp=?, level=? WHERE guild_id=? AND user_id=?`,
    [newXp, newLevel, message.guild.id, target.id]
  );
  await message.reply(
    `${sub === "set" ? "Set" : "Added"} XP for ${target} → XP **${newXp}**, Level **${newLevel}**`
  ).catch(() => {});
}

async function cmdRecalcLevels(message) {
  if (!message.guild) return;

  if (!isAdminOrManager(message.member)) {
    await message.reply("You need to be an admin/manager to use this.").catch(() => {});
    return;
  }

  const rows = await all(
    `SELECT user_id, xp FROM user_xp WHERE guild_id=?`,
    [message.guild.id]
  );

  let changed = 0;

  for (const r of rows) {
    const lvl = levelFromXp(r.xp || 0);
    await run(
      `UPDATE user_xp SET level=? WHERE guild_id=? AND user_id=?`,
      [lvl, message.guild.id, r.user_id]
    );
    changed++;
  }

  await message.reply(`Recalculated levels for **${changed}** users.`).catch(() => {});
}

async function cmdSyncRoles(message) {
  if (!message.guild) return;

  if (!isAdminOrManager(message.member)) {
    await message.reply("You need to be an admin/manager to use this.").catch(() => {});
    return;
  }

  const levelRoles = await getLevelRoles(message.guild.id);
  if (!levelRoles.length) {
    await message.reply("No level roles configured.").catch(() => {});
    return;
  }

  const users = await all(
    `SELECT user_id, level FROM user_xp WHERE guild_id=?`,
    [message.guild.id]
  );

  let assigned = 0;
  let removed = 0;

  for (const user of users) {
    const member = await message.guild.members.fetch(user.user_id).catch(() => null);
    if (!member) continue;

    // Determine roles the user should have: all roles for levels <= their level
    const shouldHave = levelRoles.filter(r => r.level <= user.level).map(r => r.role_id);

    // Roles they currently have that are level roles
    const currentLevelRoles = member.roles.cache.filter(role => 
      levelRoles.some(lr => lr.role_id === role.id)
    ).map(role => role.id);

    // Roles to add
    const toAdd = shouldHave.filter(id => !currentLevelRoles.includes(id));

    // Roles to remove (level roles they have but shouldn't)
    const toRemove = currentLevelRoles.filter(id => !shouldHave.includes(id));

    // Add roles
    for (const roleId of toAdd) {
      try {
        const role = await message.guild.roles.fetch(roleId);
        if (role) {
          await member.roles.add(role);
          assigned++;
        }
      } catch (e) {
        console.error(`Failed to add role ${roleId} to ${member.user.tag}:`, e);
      }
    }

    // Remove roles
    for (const roleId of toRemove) {
      try {
        const role = await message.guild.roles.fetch(roleId);
        if (role) {
          await member.roles.remove(role);
          removed++;
        }
      } catch (e) {
        console.error(`Failed to remove role ${roleId} from ${member.user.tag}:`, e);
      }
    }
  }

  await message.reply(`Synced roles: **${assigned}** assigned, **${removed}** removed.`).catch(() => {});
}

// ─────────────────────────────────────────────────────
// Fun commands
// ─────────────────────────────────────────────────────

async function cmd8Ball(message, args) {
  const question = args.join(" ").trim();
  if (!question) {
    await message.reply("❓ Ask me a question! Usage: `!8ball <question>`").catch(() => {});
    return;
  }

  const responses = [
    "It is certain.", "It is decidedly so.", "Without a doubt.", "Yes definitely.",
    "You may rely on it.", "As I see it, yes.", "Most likely.", "Outlook good.",
    "Yes.", "Signs point to yes.", "Reply hazy, try again.", "Ask again later.",
    "Better not tell you now.", "Cannot predict now.", "Concentrate and ask again.",
    "Don't count on it.", "My reply is no.", "My sources say no.",
    "Outlook not so good.", "Very doubtful."
  ];
  
  const answer = responses[Math.floor(Math.random() * responses.length)];
  
  const embed = new EmbedBuilder()
    .setColor(0x7bc96f)
    .setTitle("🎱 Magic 8-Ball")
    .addFields(
      { name: "Question", value: question, inline: false },
      { name: "Answer", value: answer, inline: false }
    )
    .setFooter({ text: `Asked by ${message.author.tag}` })
    .setTimestamp();
  
  await message.reply({ embeds: [embed] }).catch(() => {});
}

async function cmdCoinFlip(message) {
  const result = Math.random() < 0.5 ? "Heads" : "Tails";
  const emoji = result === "Heads" ? "🟡" : "⚪";
  
  const embed = new EmbedBuilder()
    .setColor(0x7bc96f)
    .setTitle("🪙 Coin Flip")
    .setDescription(`${emoji} **${result}**!`)
    .setTimestamp();
  
  await message.reply({ embeds: [embed] }).catch(() => {});
}

async function resolvePetPetTargetUser(message, args) {
  let targetUser = message.mentions?.users?.first?.() || null;

  if (!targetUser && args.length > 0 && message.guild) {
    const raw = String(args[0] || "").replace(/[<@!>]/g, "").trim();

    if (/^\d{15,21}$/.test(raw)) {
      const member = await message.guild.members.fetch(raw).catch(() => null);
      if (member?.user) {
        targetUser = member.user;
      }
    } else {
      const picked = await pickUserSmart(message, String(args[0] || ""));
      if (picked && !picked.ambiguous && picked.member?.user) {
        targetUser = picked.member.user;
      }
    }
  }

  return targetUser || message.author;
}

async function cmdPetPet(message, args) {
  try {
    const targetUser = await resolvePetPetTargetUser(message, args);
    const avatarUrl = targetUser.displayAvatarURL({ extension: "png", size: 256, forceStatic: true });
    const endpoint = `https://api.popcat.xyz/pet?image=${encodeURIComponent(avatarUrl)}`;

    const response = await fetch(endpoint);
    if (!response.ok) {
      throw new Error(`PetPet API returned HTTP ${response.status}`);
    }

    const petGif = Buffer.from(await response.arrayBuffer());
    const attachment = new AttachmentBuilder(petGif, { name: "petpet.gif" });

    await message.reply({
      content: `<@${message.author.id}> pets <@${targetUser.id}>`,
      files: [attachment],
      allowedMentions: { users: [message.author.id, targetUser.id] }
    }).catch(() => {});
  } catch (err) {
    console.error("petpet command failed:", err?.message || err);
    await message.reply("I couldn't generate the petpet GIF right now. Try again in a moment.").catch(() => {});
  }
}

async function cmdRoll(message, args) {
  let sides = 6;
  let count = 1;
  
  if (args.length > 0) {
    const parsed = parseInt(args[0], 10);
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= 1000) {
      sides = parsed;
    }
  }
  
  if (args.length > 1) {
    const parsedCount = parseInt(args[1], 10);
    if (Number.isFinite(parsedCount) && parsedCount > 0 && parsedCount <= 20) {
      count = parsedCount;
    }
  }
  
  const rolls = [];
  let total = 0;
  for (let i = 0; i < count; i++) {
    const roll = Math.floor(Math.random() * sides) + 1;
    rolls.push(roll);
    total += roll;
  }
  
  const embed = new EmbedBuilder()
    .setColor(0x7bc96f)
    .setTitle("🎲 Dice Roll")
    .addFields(
      { name: "Configuration", value: `${count} × d${sides}`, inline: true },
      { name: "Results", value: rolls.join(", "), inline: false }
    );
  
  if (count > 1) {
    embed.addFields({ name: "Total", value: String(total), inline: true });
  }
  
  embed.setTimestamp();
  
  await message.reply({ embeds: [embed] }).catch(() => {});
}

async function cmdChoose(message, args) {
  if (args.length < 2) {
    await message.reply("Usage: `!choose <option1> <option2> [option3...]`").catch(() => {});
    return;
  }
  
  const choice = args[Math.floor(Math.random() * args.length)];
  
  const embed = new EmbedBuilder()
    .setColor(0x7bc96f)
    .setTitle("🤔 I choose...")
    .setDescription(`**${choice}**`)
    .setTimestamp();
  
  await message.reply({ embeds: [embed] }).catch(() => {});
}

async function cmdSuggest(message, args) {
  if (args.length === 0) {
    await message.reply("Usage: `!suggest <your suggestion>`").catch(() => {});
    return;
  }

  const guild = message.guild;
  if (!guild) return;

  // Get suggestion settings
  const settings = await get(`SELECT * FROM suggestion_settings WHERE guild_id=?`, [guild.id]);
  if (!settings || !settings.enabled) {
    await message.reply("Suggestions are not enabled on this server.").catch(() => {});
    return;
  }

  const channel = guild.channels.cache.get(settings.channel_id)
    || await guild.channels.fetch(settings.channel_id).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    await message.reply("Suggestion channel not found or invalid.").catch(() => {});
    return;
  }

  const requireReview = Number(settings.require_review || 0) === 1;
  const reviewChannel = settings.review_channel_id
    ? (guild.channels.cache.get(settings.review_channel_id)
      || await guild.channels.fetch(settings.review_channel_id).catch(() => null))
    : null;
  const targetChannel = (requireReview && reviewChannel && reviewChannel.isTextBased())
    ? reviewChannel
    : channel;

  const suggestion = args.join(" ");
  const initialStatus = requireReview ? "under_review" : "pending";

  // Create suggestion in database
  const result = await run(`
    INSERT INTO suggestions (guild_id, user_id, content, status)
    VALUES (?, ?, ?, ?)
  `, [guild.id, message.author.id, suggestion, initialStatus]);

  const suggestionId = result.lastID;

  // Create embed
  const embed = new EmbedBuilder()
    .setColor("#7bc96f")
    .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
    .setTitle(`💡 Suggestion #${suggestionId}`)
    .setDescription(suggestion)
    .addFields({ name: "Status", value: requireReview ? "🕵️ Under Review" : "🟡 Pending", inline: true })
    .setFooter({ text: requireReview ? "Awaiting staff review" : `👍 0 | 👎 0` })
    .setTimestamp();

  const suggestionMsg = await targetChannel.send({ embeds: [embed] });

  if (requireReview) {
    await run(`UPDATE suggestions SET review_message_id=? WHERE id=?`, [suggestionMsg.id, suggestionId]);
  } else {
    // React with voting emojis only for directly published suggestions.
    await suggestionMsg.react("👍").catch(() => {});
    await suggestionMsg.react("👎").catch(() => {});
    await run(`UPDATE suggestions SET message_id=?, published_message_id=?, upvotes=0, downvotes=0 WHERE id=?`, [suggestionMsg.id, suggestionMsg.id, suggestionId]);
  }

  await message.react("✅").catch(() => {});
}

function renderSuggestionStatus(statusRaw) {
  const status = String(statusRaw || "pending").toLowerCase();
  if (status === "approved") return "✅ Approved";
  if (status === "denied") return "❌ Denied";
  if (status === "under_review") return "🕵️ Under Review";
  return "🟡 Pending";
}

async function cmdSuggestions(message, args) {
  const modeRaw = String(args[0] || "mine").trim().toLowerCase();
  const mode = modeRaw === "all" ? "all" : "mine";
  const limitRaw = Number.parseInt(String(args[1] || "10"), 10);
  const limit = Math.max(1, Math.min(25, Number.isFinite(limitRaw) ? limitRaw : 10));

  if (mode === "all" && !(await isModerator(message.member)) && !isAdminOrManager(message.member)) {
    await message.reply("Only moderators/admins can view all suggestions. Use `!suggestions mine`.").catch(() => {});
    return;
  }

  const params = [message.guild.id];
  let where = "guild_id=?";
  if (mode === "mine") {
    where += " AND user_id=?";
    params.push(message.author.id);
  }
  params.push(limit);

  const rows = await all(
    `SELECT id, user_id, content, status, upvotes, downvotes, staff_response, created_at
     FROM suggestions
     WHERE ${where}
     ORDER BY id DESC
     LIMIT ?`,
    params
  );

  if (!rows.length) {
    await message.reply(mode === "all" ? "No suggestions found for this server." : "You have no suggestions yet.").catch(() => {});
    return;
  }

  const lines = rows.map((s) => {
    const createdTs = Number(s.created_at || 0) > 0 ? Math.floor(Number(s.created_at) / 1000) : null;
    const createdText = createdTs ? `<t:${createdTs}:R>` : "unknown";
    const authorText = mode === "all" ? ` • by <@${s.user_id}>` : "";
    const preview = String(s.content || "").replace(/\n+/g, " ").slice(0, 120);
    const note = s.staff_response ? `\nStaff: ${String(s.staff_response).replace(/\n+/g, " ").slice(0, 90)}` : "";
    return `**#${s.id}** ${renderSuggestionStatus(s.status)}${authorText} • ${createdText}\n${preview || "(no content)"}${note}`;
  });

  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle(mode === "all" ? "💡 Server Suggestions" : "💡 Your Suggestions")
    .setDescription(lines.join("\n\n"))
    .setFooter({ text: "Use !suggestion-status <id> for full details." })
    .setTimestamp();

  await message.reply({ embeds: [embed] }).catch(() => {});
}

async function cmdSuggestionStatus(message, args) {
  const idRaw = String(args[0] || "").trim();
  const suggestionId = Number.parseInt(idRaw, 10);
  if (!Number.isFinite(suggestionId) || suggestionId <= 0) {
    await message.reply("Usage: `!suggestion-status <id>`").catch(() => {});
    return;
  }

  const suggestion = await get(
    `SELECT *
     FROM suggestions
     WHERE guild_id=? AND id=?`,
    [message.guild.id, suggestionId]
  );

  if (!suggestion) {
    await message.reply("❌ Suggestion not found for this server.").catch(() => {});
    return;
  }

  const createdTs = Number(suggestion.created_at || 0) > 0 ? Math.floor(Number(suggestion.created_at) / 1000) : null;
  const fields = [
    { name: "Status", value: renderSuggestionStatus(suggestion.status), inline: true },
    { name: "Author", value: `<@${suggestion.user_id}>`, inline: true },
    { name: "Votes", value: `👍 ${Number(suggestion.upvotes || 0)} | 👎 ${Number(suggestion.downvotes || 0)}`, inline: true }
  ];

  if (suggestion.staff_response) {
    fields.push({ name: "Staff Response", value: String(suggestion.staff_response).slice(0, 1024), inline: false });
  }

  if (suggestion.review_message_id) {
    fields.push({ name: "Review Message ID", value: `\`${suggestion.review_message_id}\``, inline: true });
  }

  if (suggestion.message_id) {
    fields.push({ name: "Published Message ID", value: `\`${suggestion.message_id}\``, inline: true });
  }

  const embed = new EmbedBuilder()
    .setColor(0x7bc96f)
    .setTitle(`💡 Suggestion #${suggestion.id}`)
    .setDescription(String(suggestion.content || "(no content)").slice(0, 4096))
    .addFields(fields)
    .setFooter({ text: createdTs ? `Created <t:${createdTs}:R>` : "Created time unknown" })
    .setTimestamp();

  await message.reply({ embeds: [embed] }).catch(() => {});
}

async function cmdSuggestionWithdraw(message, args) {
  const idRaw = String(args[0] || "").trim();
  const suggestionId = Number.parseInt(idRaw, 10);
  if (!Number.isFinite(suggestionId) || suggestionId <= 0) {
    await message.reply("Usage: `!suggestion-withdraw <id>`").catch(() => {});
    return;
  }

  const suggestion = await get(
    `SELECT *
     FROM suggestions
     WHERE guild_id=? AND id=?`,
    [message.guild.id, suggestionId]
  );

  if (!suggestion) {
    await message.reply("❌ Suggestion not found for this server.").catch(() => {});
    return;
  }

  const staff = isAdminOrManager(message.member) || await isModerator(message.member);
  const isOwner = String(suggestion.user_id) === String(message.author.id);
  if (!staff && !isOwner) {
    await message.reply("❌ You can only withdraw your own suggestions.").catch(() => {});
    return;
  }

  if (!staff && ["approved", "denied"].includes(String(suggestion.status || "").toLowerCase())) {
    await message.reply("❌ You can only withdraw pending or under-review suggestions.").catch(() => {});
    return;
  }

  const settings = await get(`SELECT * FROM suggestion_settings WHERE guild_id=?`, [message.guild.id]);

  if (suggestion.review_message_id) {
    const reviewChannelId = settings?.review_channel_id || settings?.channel_id || null;
    if (reviewChannelId) {
      const reviewChannel = message.guild.channels.cache.get(reviewChannelId)
        || await message.guild.channels.fetch(reviewChannelId).catch(() => null);
      if (reviewChannel && reviewChannel.isTextBased()) {
        const reviewMsg = await reviewChannel.messages.fetch(suggestion.review_message_id).catch(() => null);
        if (reviewMsg) await reviewMsg.delete().catch(() => {});
      }
    }
  }

  if (suggestion.message_id && settings?.channel_id) {
    const publishChannel = message.guild.channels.cache.get(settings.channel_id)
      || await message.guild.channels.fetch(settings.channel_id).catch(() => null);
    if (publishChannel && publishChannel.isTextBased()) {
      const publishedMsg = await publishChannel.messages.fetch(suggestion.message_id).catch(() => null);
      if (publishedMsg) await publishedMsg.delete().catch(() => {});
    }
  }

  await run(`DELETE FROM suggestions WHERE guild_id=? AND id=?`, [message.guild.id, suggestionId]);
  await message.reply(`✅ Suggestion #${suggestionId} has been withdrawn.`).catch(() => {});
}

// ─────────────────────────────────────────────────────
// Moderation commands
// ─────────────────────────────────────────────────────

function parseDurationMs(text) {
  if (!text) return null;
  const m = String(text).trim().match(/^(\d+)(s|m|h|d)$/i);
  if (!m) return null;
  const amount = Number.parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const unitMs = unit === "s" ? 1000 : unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : 86_400_000;
  return amount * unitMs;
}

async function cmdBan(message, args) {
  if (!(await requireModerator(message))) return;
  const arg = args[0];
  if (!arg) {
    await message.reply("Usage: `?ban <user> [reason]`").catch(() => {});
    return;
  }
  const pick = await pickUserSmart(message, arg);
  if (!pick || pick.ambiguous) {
    await message.reply("Usage: `?ban <user> [reason]`").catch(() => {});
    return;
  }

  const target = pick.member;
  
  if (!canModerate(message.member, target)) {
    await message.reply("❌ You cannot ban someone with a higher or equal role.").catch(() => {});
    return;
  }
  
  if (!target.bannable) {
    await message.reply("I can't ban that user.").catch(() => {});
    return;
  }

  const reason = args.slice(1).join(" ").trim() || "No reason provided";
  trackModerationAction(message, "ban_add", { targetUserId: target.id });
  await target.ban({ reason }).catch(() => {});
  await logModAction(message.guild.id, target.id, message.author.id, "ban", reason);
  await message.reply(`✅ Banned ${target.user.tag}.`).catch(() => {});
}

async function cmdTempBan(message, args) {
  if (!(await requireModerator(message))) return;
  const arg = args[0];
  if (!arg || !args[1]) {
    await message.reply("Usage: `?tempban <user> <duration like 1d> [reason]`").catch(() => {});
    return;
  }

  const pick = await pickUserSmart(message, arg);
  if (!pick || pick.ambiguous) {
    await message.reply("Usage: `?tempban <user> <duration like 1d> [reason]`").catch(() => {});
    return;
  }

  const target = pick.member;
  if (!canModerate(message.member, target)) {
    await message.reply("❌ You cannot temp-ban someone with a higher or equal role.").catch(() => {});
    return;
  }
  if (!target.bannable) {
    await message.reply("I can't temp-ban that user.").catch(() => {});
    return;
  }

  const durationMs = parseDurationMs(args[1]);
  if (!durationMs || durationMs < 60_000) {
    await message.reply("❌ Invalid duration. Use format like 10m, 1h, 1d (minimum 1m).").catch(() => {});
    return;
  }

  const reason = args.slice(2).join(" ").trim() || "No reason provided";
  const now = Date.now();
  const unbanAt = now + durationMs;

  trackModerationAction(message, "ban_add", { targetUserId: target.id });
  await target.ban({ reason: `[TEMP] ${reason}` }).catch(() => {});
  await run(
    `INSERT INTO temp_bans (guild_id, user_id, moderator_id, reason, ban_at, unban_at, completed)
     VALUES (?, ?, ?, ?, ?, ?, 0)`,
    [message.guild.id, target.id, message.author.id, reason, now, unbanAt]
  );
  await logModAction(message.guild.id, target.id, message.author.id, "tempban", reason, `Until: ${new Date(unbanAt).toISOString()}`);

  await message.reply(`✅ Temp-banned ${target.user.tag} until <t:${Math.floor(unbanAt / 1000)}:F> (<t:${Math.floor(unbanAt / 1000)}:R>).`).catch(() => {});
}

async function cmdUnban(message, args) {
  if (!(await requireModerator(message))) return;
  const userId = (args[0] || "").replace(/[<@!>]/g, "");
  if (!/^\d{15,21}$/.test(userId)) {
    await message.reply("Usage: `?unban <user-id> [reason]`").catch(() => {});
    return;
  }
  const reason = args.slice(1).join(" ").trim() || "No reason provided";
  trackModerationAction(message, "ban_remove", { targetUserId: userId });
  await message.guild.members.unban(userId, reason).catch(() => {});
  await logModAction(message.guild.id, userId, message.author.id, "unban", reason);
  await message.reply("✅ Unbanned user.").catch(() => {});
}

async function cmdKick(message, args) {
  if (!(await requireModerator(message))) return;
  const arg = args[0];
  if (!arg) {
    await message.reply("Usage: `?kick <user> [reason]`").catch(() => {});
    return;
  }
  const pick = await pickUserSmart(message, arg);
  if (!pick || pick.ambiguous) {
    await message.reply("Usage: `?kick <user> [reason]`").catch(() => {});
    return;
  }

  const target = pick.member;
  
  if (!canModerate(message.member, target)) {
    await message.reply("❌ You cannot kick someone with a higher or equal role.").catch(() => {});
    return;
  }
  
  if (!target.kickable) {
    await message.reply("I can't kick that user.").catch(() => {});
    return;
  }

  const reason = args.slice(1).join(" ").trim() || "No reason provided";
  trackModerationAction(message, "member_remove", { targetUserId: target.id });
  await target.kick(reason).catch(() => {});
  await logModAction(message.guild.id, target.id, message.author.id, "kick", reason);
  await message.reply(`✅ Kicked ${target.user.tag}.`).catch(() => {});
}

async function cmdMute(message, args) {
  if (!(await requireModerator(message))) return;
  const arg = args[0];
  if (!arg) {
    await message.reply("Usage: `?mute <user> [duration like 10m] [reason]`").catch(() => {});
    return;
  }
  const pick = await pickUserSmart(message, arg);
  if (!pick || pick.ambiguous) {
    await message.reply("Usage: `?mute <user> [duration like 10m] [reason]`").catch(() => {});
    return;
  }

  const target = pick.member;
  
  if (!canModerate(message.member, target)) {
    await message.reply("❌ You cannot mute someone with a higher or equal role.").catch(() => {});
    return;
  }
  
  const durationMs = parseDurationMs(args[1]) || 10 * 60_000;
  const reason = (parseDurationMs(args[1]) ? args.slice(2) : args.slice(1)).join(" ").trim() || "No reason provided";
  if (!target.moderatable) {
    await message.reply("I can't mute that user.").catch(() => {});
    return;
  }
  trackModerationAction(message, "member_timeout", { targetUserId: target.id, timedOut: true });
  await target.timeout(durationMs, reason).catch(() => {});
  await logModAction(message.guild.id, target.id, message.author.id, "mute", reason, `Duration: ${durationMs}ms`);
  await message.reply(`✅ Muted ${target.user.tag}.`).catch(() => {});
}

async function cmdUnmute(message, args) {
  if (!(await requireModerator(message))) return;
  const arg = args[0];
  if (!arg) {
    await message.reply("Usage: `?unmute <user> [reason]`").catch(() => {});
    return;
  }
  const pick = await pickUserSmart(message, arg);
  if (!pick || pick.ambiguous) {
    await message.reply("Usage: `?unmute <user> [reason]`").catch(() => {});
    return;
  }

  const target = pick.member;
  const reason = args.slice(1).join(" ").trim() || "No reason provided";
  if (!target.moderatable) {
    await message.reply("I can't unmute that user.").catch(() => {});
    return;
  }
  trackModerationAction(message, "member_timeout", { targetUserId: target.id, timedOut: false });
  await target.timeout(null, reason).catch(() => {});
  await logModAction(message.guild.id, target.id, message.author.id, "unmute", reason);
  await message.reply(`✅ Unmuted ${target.user.tag}.`).catch(() => {});
}

async function cmdPurge(message, args) {
  if (!(await requireModerator(message))) return;
  const amount = clampInt(args[0], 1, 100);
  if (amount === null) {
    await message.reply("Usage: `?purge <1-100>`").catch(() => {});
    return;
  }

  const isInteractionCommand = Boolean(message.isSyntheticInteraction);

  let commandDeleted = false;
  if (!isInteractionCommand && typeof message.delete === "function") {
    commandDeleted = await message.delete().then(() => true).catch(() => false);
  }

  const fetchCount = isInteractionCommand
    ? amount
    : Math.min(100, amount + (commandDeleted ? 0 : 1));
  const deleted = await message.channel.bulkDelete(fetchCount, true).catch(() => null);

  let purgedCount = deleted?.size || 0;
  if (!commandDeleted && deleted?.has?.(message.id)) {
    purgedCount = Math.max(0, purgedCount - 1);
  }

  trackModerationAction(message, "message_bulk_delete", { channelId: message.channel.id, count: purgedCount || amount });

  if (isInteractionCommand) {
    await message.reply(`✅ Purged ${purgedCount} messages.`).catch(() => {});
  }
}

async function cmdWarn(message, args) {
  if (!(await requireModerator(message))) return;
  const arg = args[0];
  if (!arg) {
    await message.reply("Usage: `?warn <user> [reason]`").catch(() => {});
    return;
  }
  const pick = await pickUserSmart(message, arg);
  if (!pick || pick.ambiguous) {
    await message.reply("Usage: `?warn <user> [reason]`").catch(() => {});
    return;
  }

  if (!canModerate(message.member, pick.member)) {
    await message.reply("❌ You cannot warn someone with a higher or equal role.").catch(() => {});
    return;
  }

  const reason = args.slice(1).join(" ").trim();
  if (!reason) {
    await message.reply("Usage: `?warn <user> <reason>` - A reason is required.").catch(() => {});
    return;
  }
  await run(
    `INSERT INTO mod_warnings (guild_id, user_id, moderator_id, reason, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [message.guild.id, pick.member.id, message.author.id, reason, Date.now()]
  );
  await logModAction(message.guild.id, pick.member.id, message.author.id, "warn", reason);
  await message.reply(`✅ Warned ${pick.member.user.tag}.`).catch(() => {});
}

async function cmdWarnings(message, args) {
  if (!(await requireModerator(message))) return;
  const arg = args[0];
  if (!arg) {
    await message.reply("Usage: `?warnings <user>`").catch(() => {});
    return;
  }
  const pick = await pickUserSmart(message, arg);
  if (!pick || pick.ambiguous) {
    await message.reply("Usage: `?warnings <user>`").catch(() => {});
    return;
  }

  const rows = await all(
    `SELECT id, moderator_id, reason, created_at FROM mod_warnings WHERE guild_id=? AND user_id=? ORDER BY created_at DESC LIMIT 15`,
    [message.guild.id, pick.member.id]
  );

  if (!rows.length) {
    await message.reply(`No warnings found for ${pick.member.user.tag}.`).catch(() => {});
    return;
  }

  const targetUser = pick.member.user;
  const avatarURL = targetUser.displayAvatarURL({ size: 128 });
  
  const embed = new EmbedBuilder()
    .setColor(0xffa500)
    .setAuthor({ name: `Warnings for ${targetUser.tag}`, iconURL: avatarURL })
    .setThumbnail(avatarURL)
    .setTimestamp();

  for (const row of rows) {
    const moderator = await message.guild.members.fetch(row.moderator_id).catch(() => null);
    const modTag = moderator ? moderator.user.tag : `User ${row.moderator_id}`;
    const timestamp = new Date(Number(row.created_at)).toLocaleString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    embed.addFields({
      name: `Warning #${row.id}`,
      value: `**Moderator:** ${modTag}\n**Reason:** ${row.reason}\n**Date:** ${timestamp}`,
      inline: false
    });
  }

  embed.setFooter({ text: `Total Warnings: ${rows.length}` });
  await message.reply({ embeds: [embed] }).catch(() => {});
}

async function cmdClearWarns(message, args) {
  if (!(await requireModerator(message))) return;
  const arg = args[0];
  if (!arg) {
    await message.reply("Usage: `?clearwarns <user>`").catch(() => {});
    return;
  }
  const pick = await pickUserSmart(message, arg);
  if (!pick || pick.ambiguous) {
    await message.reply("Usage: `?clearwarns <user>`").catch(() => {});
    return;
  }

  const result = await run(`DELETE FROM mod_warnings WHERE guild_id=? AND user_id=?`, [message.guild.id, pick.member.id]);
  const count = result?.changes || 0;
  await message.reply(`✅ Cleared ${count} warning(s) for ${pick.member.user.tag}.`).catch(() => {});
}

async function cmdClearWarn(message, args) {
  if (!(await requireModerator(message))) return;
  const warningId = args[0];
  if (!warningId || !/^\d+$/.test(warningId)) {
    await message.reply("Usage: `?clearwarn <warning-id>`\nUse `?warnings <user>` to see warning IDs.").catch(() => {});
    return;
  }

  const warning = await get(`SELECT user_id FROM mod_warnings WHERE guild_id=? AND id=?`, [message.guild.id, warningId]);
  if (!warning) {
    await message.reply("❌ Warning not found.").catch(() => {});
    return;
  }

  await run(`DELETE FROM mod_warnings WHERE guild_id=? AND id=?`, [message.guild.id, warningId]);
  await message.reply(`✅ Cleared warning #${warningId}.`).catch(() => {});
}

async function cmdModLogs(message, args) {
  if (!(await requireModerator(message))) return;
  const arg = args[0];
  if (!arg) {
    await message.reply("Usage: `?modlogs <user>`").catch(() => {});
    return;
  }
  const pick = await pickUserSmart(message, arg);
  if (!pick || pick.ambiguous) {
    await message.reply("Usage: `?modlogs <user>`").catch(() => {});
    return;
  }

  const rows = await all(
    `SELECT id, moderator_id, action, reason, details, created_at FROM mod_logs WHERE guild_id=? AND user_id=? ORDER BY created_at DESC LIMIT 20`,
    [message.guild.id, pick.member.id]
  );

  if (!rows.length) {
    await message.reply(`No moderation logs found for ${pick.member.user.tag}.`).catch(() => {});
    return;
  }

  const targetUser = pick.member.user;
  const avatarURL = targetUser.displayAvatarURL({ size: 128 });
  
  const embed = new EmbedBuilder()
    .setColor(0xff4444)
    .setAuthor({ name: `Moderation Logs for ${targetUser.tag}`, iconURL: avatarURL })
    .setThumbnail(avatarURL)
    .setTimestamp();

  const actionEmojis = {
    ban: "🔨",
    kick: "👢",
    mute: "🔇",
    unmute: "🔊",
    warn: "⚠️",
    timeout: "⏰",
    role_add: "➕",
    role_remove: "➖",
    nick_change: "✏️",
    softban: "🧹"
  };

  for (const row of rows) {
    const moderator = await message.guild.members.fetch(row.moderator_id).catch(() => null);
    const modTag = moderator ? moderator.user.tag : `User ${row.moderator_id}`;
    const timestamp = new Date(Number(row.created_at)).toLocaleString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    const emoji = actionEmojis[row.action] || "📋";
    const actionName = row.action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    
    let value = `**Moderator:** ${modTag}\n**Date:** ${timestamp}`;
    if (row.reason) value += `\n**Reason:** ${row.reason}`;
    if (row.details) value += `\n**Details:** ${row.details}`;
    
    embed.addFields({
      name: `${emoji} ${actionName} (#${row.id})`,
      value: value,
      inline: false
    });
  }

  embed.setFooter({ text: `Total Actions: ${rows.length}` });
  await message.reply({ embeds: [embed] }).catch(() => {});
}

function parseAuditSearchArgs(args) {
  const out = {
    action: null,
    userId: null,
    moderatorId: null,
    days: 7,
    limit: 20
  };

  for (const rawArg of args || []) {
    const arg = String(rawArg || "").trim();
    if (!arg) continue;

    const colonIdx = arg.indexOf(":");
    if (colonIdx > 0) {
      const key = arg.slice(0, colonIdx).toLowerCase();
      const value = arg.slice(colonIdx + 1).trim();
      if (!value) continue;

      if (key === "action") out.action = value.toLowerCase();
      if (key === "user") out.userId = value;
      if (key === "moderator" || key === "mod") out.moderatorId = value;
      if (key === "days") {
        const n = Number.parseInt(value, 10);
        if (Number.isInteger(n) && n > 0) out.days = Math.min(n, 90);
      }
      if (key === "limit") {
        const n = Number.parseInt(value, 10);
        if (Number.isInteger(n) && n > 0) out.limit = Math.min(n, 50);
      }
      continue;
    }

    if (/^\d+d$/i.test(arg)) {
      const n = Number.parseInt(arg, 10);
      if (Number.isInteger(n) && n > 0) out.days = Math.min(n, 90);
      continue;
    }

    if (/^\d+$/.test(arg) && !out.userId) {
      out.userId = arg;
      continue;
    }

    if (!out.action) {
      out.action = arg.toLowerCase();
    }
  }

  if (out.action === "all") out.action = null;
  return out;
}

async function cmdAuditSearch(message, args) {
  if (!(await requireModerator(message))) return;

  const parsed = parseAuditSearchArgs(args);
  const params = [message.guild.id, Date.now() - parsed.days * 24 * 60 * 60 * 1000];
  let sql = `SELECT id, user_id, moderator_id, action, reason, details, created_at
             FROM mod_logs
             WHERE guild_id=? AND created_at>=?`;

  if (parsed.action) {
    sql += ` AND LOWER(action)=?`;
    params.push(parsed.action);
  }
  if (parsed.userId) {
    sql += ` AND user_id=?`;
    params.push(parsed.userId);
  }
  if (parsed.moderatorId) {
    sql += ` AND moderator_id=?`;
    params.push(parsed.moderatorId);
  }

  sql += ` ORDER BY created_at DESC LIMIT ?`;
  params.push(parsed.limit);

  const rows = await all(sql, params);
  if (!rows.length) {
    await message.reply("No moderation log entries matched your search.").catch(() => {});
    return;
  }

  const lines = [];
  for (const row of rows) {
    const at = new Date(Number(row.created_at)).toLocaleString();
    const reason = row.reason ? ` | ${trimText(row.reason, 80)}` : "";
    lines.push(`#${row.id} ${row.action} | target:${row.user_id} | mod:${row.moderator_id} | ${at}${reason}`);
  }

  const embed = new EmbedBuilder()
    .setColor(0xffaa55)
    .setTitle("🔎 Audit Search Results")
    .setDescription(trimText(lines.join("\n"), 3900))
    .setFooter({ text: `Filters: action=${parsed.action || "any"}, days=${parsed.days}, limit=${parsed.limit}` })
    .setTimestamp();

  await message.reply({ embeds: [embed] }).catch(() => {});
}

async function cmdLock(message) {
  if (!(await requireModerator(message))) return;
  trackModerationAction(message, "channel_update", { channelId: message.channel.id });
  await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, {
    SendMessages: false
  }).catch(() => {});
  await message.reply("🔒 Channel locked.").catch(() => {});
}

async function cmdUnlock(message) {
  if (!(await requireModerator(message))) return;
  trackModerationAction(message, "channel_update", { channelId: message.channel.id });
  await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, {
    SendMessages: null
  }).catch(() => {});
  await message.reply("🔓 Channel unlocked.").catch(() => {});
}

async function cmdSlowmode(message, args) {
  if (!(await requireModerator(message))) return;
  const seconds = clampInt(args[0], 0, 21600);
  if (seconds === null) {
    await message.reply("Usage: `?slowmode <0-21600>`").catch(() => {});
    return;
  }
  trackModerationAction(message, "channel_update", { channelId: message.channel.id });
  await message.channel.setRateLimitPerUser(seconds).catch(() => {});
  await message.reply(`✅ Slowmode set to ${seconds}s.`).catch(() => {});
}

async function cmdNick(message, args) {
  if (!(await requireModerator(message))) return;
  const arg = args[0];
  if (!arg) {
    await message.reply("Usage: `?nick <user> <new-nickname>`").catch(() => {});
    return;
  }
  const pick = await pickUserSmart(message, arg);
  if (!pick || pick.ambiguous) {
    await message.reply("Usage: `?nick <user> <new-nickname>`").catch(() => {});
    return;
  }

  const nick = args.slice(1).join(" ").trim();
  if (!nick) {
    await message.reply("Usage: `?nick <user> <new-nickname>`").catch(() => {});
    return;
  }

  await pick.member.setNickname(nick.slice(0, 32)).catch(() => {});
  trackModerationAction(message, "member_nick_update", { targetUserId: pick.member.id });
  await logModAction(message.guild.id, pick.member.id, message.author.id, "nick_change", null, `New nickname: ${nick.slice(0, 32)}`);
  await message.reply(`✅ Updated nickname for ${pick.member.user.tag}.`).catch(() => {});
}

async function cmdRole(message, args) {
  if (!(await requireModerator(message))) return;
  const arg = args[0];
  if (!arg) {
    await message.reply("Usage: `?role <user> <role-id>`").catch(() => {});
    return;
  }
  const pick = await pickUserSmart(message, arg);
  if (!pick || pick.ambiguous) {
    await message.reply("Usage: `?role <user> <role-id>`").catch(() => {});
    return;
  }

  const roleId = (args[1] || "").replace(/[<@&>]/g, "");
  if (!/^\d{15,21}$/.test(roleId)) {
    await message.reply("Usage: `?role <user> <role-id>`").catch(() => {});
    return;
  }

  const role = await message.guild.roles.fetch(roleId).catch(() => null);
  if (!role) {
    await message.reply("Role not found.").catch(() => {});
    return;
  }

  if (pick.member.roles.cache.has(role.id)) {
    trackModerationAction(message, "member_role_update", { targetUserId: pick.member.id });
    await pick.member.roles.remove(role).catch(() => {});
    await logModAction(message.guild.id, pick.member.id, message.author.id, "role_remove", null, `Role: ${role.name}`);
    await message.reply(`✅ Removed ${role.name} from ${pick.member.user.tag}.`).catch(() => {});
    return;
  }

  trackModerationAction(message, "member_role_update", { targetUserId: pick.member.id });
  await pick.member.roles.add(role).catch(() => {});
  await logModAction(message.guild.id, pick.member.id, message.author.id, "role_add", null, `Role: ${role.name}`);
  await message.reply(`✅ Added ${role.name} to ${pick.member.user.tag}.`).catch(() => {});
}

async function cmdSoftban(message, args) {
  if (!(await requireModerator(message))) return;
  const arg = args[0];
  if (!arg) {
    await message.reply("Usage: `?softban <user> [reason]`").catch(() => {});
    return;
  }
  const pick = await pickUserSmart(message, arg);
  if (!pick || pick.ambiguous) {
    await message.reply("Usage: `?softban <user> [reason]`").catch(() => {});
    return;
  }

  const target = pick.member;
  
  if (!canModerate(message.member, target)) {
    await message.reply("❌ You cannot softban someone with a higher or equal role.").catch(() => {});
    return;
  }
  
  if (!target.bannable) {
    await message.reply("I can't softban that user.").catch(() => {});
    return;
  }
  const reason = args.slice(1).join(" ").trim() || "No reason provided";
  trackModerationAction(message, "ban_add", { targetUserId: target.id });
  await target.ban({ reason, deleteMessageSeconds: 24 * 60 * 60 }).catch(() => {});
  trackModerationAction(message, "ban_remove", { targetUserId: target.id });
  await message.guild.members.unban(target.id, "Softban release").catch(() => {});
  await logModAction(message.guild.id, target.id, message.author.id, "softban", reason);
  await message.reply(`✅ Softbanned ${target.user.tag}.`).catch(() => {});
}

// ─────────────────────────────────────────────────────
// Reaction Role commands
// ─────────────────────────────────────────────────────

async function cmdReactionRole(message, args) {
  if (!isAdminOrManager(message.member)) {
    await message.reply("❌ Only admins/managers can configure reaction roles.").catch(() => {});
    return;
  }

  const subcommand = (args[0] || "").toLowerCase();

  if (subcommand === "add") {
    await cmdReactionRoleAdd(message, args.slice(1));
  } else if (subcommand === "remove") {
    await cmdReactionRoleRemove(message, args.slice(1));
  } else if (subcommand === "list") {
    await cmdReactionRoleList(message);
  } else {
    await message.reply(
      "Usage:\n" +
      "`!reactionrole add <messageId> <emoji> <roleId>` - Add reaction role\n" +
      "`!reactionrole remove <messageId> <emoji>` - Remove reaction role\n" +
      "`!reactionrole list` - List all reaction roles"
    ).catch(() => {});
  }
}

async function cmdReactionRoleAdd(message, args) {
  if (args.length < 3) {
    await message.reply("Usage: `!reactionrole add <messageId> <emoji> <roleId>`").catch(() => {});
    return;
  }

  const messageId = args[0];
  const emojiRaw = args[1];
  const roleRaw = args[2];

  // Fetch the message to verify it exists
  let targetMessage;
  try {
    targetMessage = await message.channel.messages.fetch(messageId);
  } catch (e) {
    await message.reply("❌ Message not found in this channel. Make sure the message ID is correct and in this channel.").catch(() => {});
    return;
  }

  // Parse emoji
  const emojiKey = normalizeEmojiKey(emojiRaw);
  if (!emojiKey) {
    await message.reply("❌ Invalid emoji. Use a unicode emoji or a custom emoji like `:name:id` or `<:name:id>`.").catch(() => {});
    return;
  }

  console.log(`[ReactionRole] Saving binding: emoji input="${emojiRaw}" -> normalized key="${emojiKey}"`);

  // Parse role
  const roleId = roleRaw.replace(/[<@&>]/g, "");
  const role = message.guild.roles.cache.get(roleId) || await message.guild.roles.fetch(roleId).catch(() => null);
  if (!role) {
    await message.reply("❌ Role not found. Mention the role or use its ID.").catch(() => {});
    return;
  }

  // Save to database
  await upsertReactionRoleBinding(
    message.guild.id,
    message.channel.id,
    messageId,
    emojiKey,
    role.id,
    true // remove on unreact
  );

  console.log(`[ReactionRole] Saved: guild=${message.guild.id}, msg=${messageId}, emoji="${emojiKey}", role=${role.id}`);

  // React to the message with the emoji to show it's set up
  try {
    // For custom emojis, we need to use the format name:id
    if (emojiKey.includes(':')) {
      await targetMessage.react(emojiKey);
    } else {
      await targetMessage.react(emojiRaw);
    }
  } catch (e) {
    // Reaction failed, but binding is saved
    console.error("Failed to react to message:", e);
  }

  await message.reply(`✅ Reaction role added! Reacting with ${emojiRaw} will give the ${role.name} role.`).catch(() => {});
}

async function cmdReactionRoleRemove(message, args) {
  if (args.length < 2) {
    await message.reply("Usage: `!reactionrole remove <messageId> <emoji>`").catch(() => {});
    return;
  }

  const messageId = args[0];
  const emojiRaw = args[1];

  // Parse emoji
  const emojiKey = normalizeEmojiKey(emojiRaw);
  if (!emojiKey) {
    await message.reply("❌ Invalid emoji.").catch(() => {});
    return;
  }

  // Remove from database
  await removeReactionRoleBinding(message.guild.id, messageId, emojiKey);

  await message.reply(`✅ Reaction role removed for message ${messageId} with emoji ${emojiRaw}.`).catch(() => {});
}

async function cmdReactionRoleList(message) {
  const bindings = await getReactionRoleBindings(message.guild.id);

  if (!bindings || bindings.length === 0) {
    await message.reply("No reaction roles configured.").catch(() => {});
    return;
  }

  const lines = [];
  for (const binding of bindings) {
    const role = message.guild.roles.cache.get(binding.role_id);
    const roleName = role ? role.name : `Unknown (${binding.role_id})`;
    const channelLink = `<#${binding.channel_id}>`;
    lines.push(`• Message \`${binding.message_id}\` in ${channelLink}: \`${binding.emoji_key}\` → @${roleName}`);
  }

  const embed = new EmbedBuilder()
    .setTitle("Reaction Roles")
    .setDescription(lines.join("\n"))
    .setColor(0x7bc96f);

  await message.reply({ embeds: [embed] }).catch(() => {});
}

// ─────────────────────────────────────────────────────
// Private VC commands
// ─────────────────────────────────────────────────────

async function cmdVoiceLimit(message, args) {
  const check = await assertVoiceCmdAllowed(message);
  if (!check.ok) {
    await message.reply(check.reason).catch(() => {});
    return;
  }

  const limit = clampInt(args[0], 0, 99);
  if (limit === null) {
    await message.reply("Usage: `!voice-limit <0-99>`").catch(() => {});
    return;
  }

  const voice = await message.guild.channels.fetch(check.room.voice_channel_id).catch(() => null);
  if (!voice) {
    await message.reply("Voice channel not found.").catch(() => {});
    return;
  }

  await voice.setUserLimit(limit).catch((e) => console.error(e));
  await message.reply(`Set voice limit to **${limit}**.`).catch(() => {});
}

async function cmdVoiceLock(message) {
  const check = await assertVoiceCmdAllowed(message);
  if (!check.ok) {
    await message.reply(check.reason).catch(() => {});
    return;
  }

  const voice = await message.guild.channels.fetch(check.room.voice_channel_id).catch(() => null);
  if (!voice) {
    await message.reply("Voice channel not found.").catch(() => {});
    return;
  }

  // Everyone can VIEW, but not CONNECT when locked.
  await voice.permissionOverwrites.edit(message.guild.roles.everyone, {
    ViewChannel: true,
    Connect: false
  }).catch((e) => console.error(e));

  await message.reply("🔒 VC locked (everyone can still see it, but can’t join).").catch(() => {});
}

async function cmdVoiceUnlock(message) {
  const check = await assertVoiceCmdAllowed(message);
  if (!check.ok) {
    await message.reply(check.reason).catch(() => {});
    return;
  }

  const voice = await message.guild.channels.fetch(check.room.voice_channel_id).catch(() => null);
  if (!voice) {
    await message.reply("Voice channel not found.").catch(() => {});
    return;
  }

  // Restore connect for everyone
  await voice.permissionOverwrites.edit(message.guild.roles.everyone, {
    ViewChannel: true,
    Connect: true
  }).catch((e) => console.error(e));

  await message.reply("🔓 VC unlocked (everyone can join).").catch(() => {});
}

async function cmdVoiceRename(message, args) {
  const check = await assertVoiceCmdAllowed(message);
  if (!check.ok) {
    await message.reply(check.reason).catch(() => {});
    return;
  }

  const newName = args.join(" ").trim();
  if (!newName) {
    await message.reply("Usage: `!voice-rename <name>`").catch(() => {});
    return;
  }

  const voice = await message.guild.channels.fetch(check.room.voice_channel_id).catch(() => null);
  if (!voice) {
    await message.reply("Voice channel not found.").catch(() => {});
    return;
  }

  await voice.setName(newName.slice(0, 90)).catch((e) => console.error(e));
  await message.reply(`Renamed VC to **${voice.name}**.`).catch(() => {});
}

async function cmdVoiceBan(message, args = []) {
  const check = await assertVoiceCmdAllowed(message);
  if (!check.ok) {
    await message.reply(check.reason).catch(() => {});
    return;
  }

  const arg = args[0] || "";
  const target = message.mentions.members.first() || (await pickUserSmart(message, arg))?.member;
  if (!target) {
    await message.reply("Usage: `!voice-ban @user`").catch(() => {});
    return;
  }

  const voice = await message.guild.channels.fetch(check.room.voice_channel_id).catch(() => null);
  if (!voice) {
    await message.reply("Voice channel not found.").catch(() => {});
    return;
  }

  // Deny connect (and optionally view) to target for THIS VC only.
  await voice.permissionOverwrites.edit(target.id, {
    ViewChannel: false,
    Connect: false
  }).catch((e) => console.error(e));

  // If they’re currently inside, kick them out of the VC
  if (target.voice?.channelId === voice.id) {
    await target.voice.setChannel(null).catch(() => {});
  }

  await message.reply(`🚫 Banned ${target} from joining this VC.`).catch(() => {});
}

// ─────────────────────────────────────────────────────
// Member Count Channel
// ─────────────────────────────────────────────────────

async function cmdMemberCount(message, args) {
  if (!isAdminOrManager(message.member)) {
    await message.reply("❌ Only administrators can use this command.").catch(() => {});
    return;
  }

  const subcommand = (args[0] || "").toLowerCase();

  if (subcommand === "enable" || subcommand === "on") {
    // Check if already enabled
    const existingSettings = await get(`SELECT member_count_channel_id FROM guild_settings WHERE guild_id=?`, [message.guild.id]);
    if (existingSettings?.member_count_channel_id) {
      const existingChannel = message.guild.channels.cache.get(existingSettings.member_count_channel_id);
      if (existingChannel) {
        await message.reply(`❌ Member count channel is already enabled: ${existingChannel}`).catch(() => {});
        return;
      }
    }

    // Create the voice channel
    const memberCount = message.guild.memberCount;
    const channelName = `👥 Members: ${memberCount}`;

    try {
      const channel = await message.guild.channels.create({
        name: channelName,
        type: 2, // GUILD_VOICE
        position: 0, // Put it at the top
        permissionOverwrites: [
          {
            id: message.guild.roles.everyone.id,
            deny: ["Connect"], // Make it non-joinable
          }
        ]
      });

      await run(
        `UPDATE guild_settings SET member_count_channel_id=? WHERE guild_id=?`,
        [channel.id, message.guild.id]
      );

      await message.reply(`✅ Member count channel created: ${channel}\nWill update every 5 minutes.`).catch(() => {});
    } catch (err) {
      console.error("[members] Failed to create channel:", err);
      await message.reply("❌ Failed to create member count channel. Check bot permissions.").catch(() => {});
    }
    return;
  }

  if (subcommand === "disable" || subcommand === "off") {
    const settings = await get(`SELECT member_count_channel_id FROM guild_settings WHERE guild_id=?`, [message.guild.id]);
    if (!settings?.member_count_channel_id) {
      await message.reply("❌ Member count channel is not enabled.").catch(() => {});
      return;
    }

    const channel = message.guild.channels.cache.get(settings.member_count_channel_id);
    if (channel) {
      try {
        await channel.delete("Member count disabled");
      } catch (err) {
        console.error("[members] Failed to delete channel:", err);
      }
    }

    await run(
      `UPDATE guild_settings SET member_count_channel_id=NULL WHERE guild_id=?`,
      [message.guild.id]
    );

    await message.reply(`✅ Member count channel disabled and removed.`).catch(() => {});
    return;
  }

  await message.reply(`🔧 **Member Count Commands**\n\n\`!member-count enable\` - Create and enable member count channel\n\`!member-count disable\` - Disable and delete member count channel`).catch(() => {});
}

// ─────────────────────────────────────────────────────
// Giveaway Commands
// ─────────────────────────────────────────────────────

async function cmdGiveaway(message, args) {
  const subcommand = args[0]?.toLowerCase();
  const isStaff = isAdminOrManager(message.member) || await isModerator(message.member);

  if (subcommand === "start") {
    if (!isStaff) {
      await message.reply("❌ Only moderators/admins can start giveaways.").catch(() => {});
      return;
    }

    // !giveaway start <duration> <winners> <prize>
    // Example: !giveaway start 1d 1 Discord Nitro
    if (args.length < 4) {
      await message.reply("Usage: `!giveaway start <duration> <winners> <prize>`\nExample: `!giveaway start 1d 1 Discord Nitro`").catch(() => {});
      return;
    }

    const durationMs = parseDurationMs(args[1]);
    if (!durationMs) {
      await message.reply("❌ Invalid duration. Use format like: 1m, 1h, 1d (m=minutes, h=hours, d=days)").catch(() => {});
      return;
    }

    const winners = Number.parseInt(args[2], 10);
    if (!Number.isFinite(winners) || winners < 1 || winners > 10) {
      await message.reply("❌ Winners must be between 1 and 10.").catch(() => {});
      return;
    }

    const prize = args.slice(3).join(" ");
    const endTime = Date.now() + durationMs;

    const giveawayEmbed = {
      color: 0x00ff00,
      title: "🎉 GIVEAWAY 🎉",
      description: `**Prize:** ${prize}\n**Winners:** ${winners}\n**Ends:** <t:${Math.floor(endTime / 1000)}:R>\n\nReact with 🎉 to enter!`,
      footer: { text: `Hosted by ${message.author.tag}` },
      timestamp: new Date(endTime).toISOString()
    };

    const giveawayMsg = await message.channel.send({ embeds: [giveawayEmbed] }).catch(() => null);
    if (!giveawayMsg) {
      await message.reply("❌ Failed to create giveaway message.").catch(() => {});
      return;
    }

    await giveawayMsg.react("🎉").catch(() => {});

    const result = await run(`
      INSERT INTO giveaways (guild_id, channel_id, message_id, host_id, prize, winners_count, end_time)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [message.guild.id, message.channel.id, giveawayMsg.id, message.author.id, prize, winners, endTime]);

    await message.reply(`✅ Giveaway created! ID: ${result.lastID}`).catch(() => {});
  } else if (subcommand === "end") {
    // !giveaway end <message_id>
    if (!args[1]) {
      await message.reply("Usage: `!giveaway end <message_id>`").catch(() => {});
      return;
    }

    const giveaway = await get(`SELECT * FROM giveaways WHERE message_id=? AND guild_id=? AND ended=0`, [args[1], message.guild.id]);
    if (!giveaway) {
      await message.reply("❌ Giveaway not found or already ended.").catch(() => {});
      return;
    }

    if (!isStaff && String(giveaway.host_id) !== String(message.author.id)) {
      await message.reply("❌ Only the giveaway host or server staff can end this giveaway.").catch(() => {});
      return;
    }

    await endGiveaway(message.client, giveaway);
    await message.reply("✅ Giveaway ended!").catch(() => {});
  } else if (subcommand === "reroll") {
    // !giveaway reroll <message_id>
    if (!args[1]) {
      await message.reply("Usage: `!giveaway reroll <message_id>`").catch(() => {});
      return;
    }

    const giveaway = await get(`SELECT * FROM giveaways WHERE message_id=? AND guild_id=?`, [args[1], message.guild.id]);
    if (!giveaway) {
      await message.reply("❌ Giveaway not found.").catch(() => {});
      return;
    }

    if (!isStaff && String(giveaway.host_id) !== String(message.author.id)) {
      await message.reply("❌ Only the giveaway host or server staff can reroll this giveaway.").catch(() => {});
      return;
    }

    await rerollGiveaway(message.client, giveaway);
    await message.reply("✅ Giveaway rerolled!").catch(() => {});
  } else if (subcommand === "cancel") {
    if (!args[1]) {
      await message.reply("Usage: `!giveaway cancel <message_id> [reason]`").catch(() => {});
      return;
    }

    const giveaway = await get(`SELECT * FROM giveaways WHERE message_id=? AND guild_id=? AND ended=0`, [args[1], message.guild.id]);
    if (!giveaway) {
      await message.reply("❌ Active giveaway not found.").catch(() => {});
      return;
    }

    if (!isStaff && String(giveaway.host_id) !== String(message.author.id)) {
      await message.reply("❌ Only the giveaway host or server staff can cancel this giveaway.").catch(() => {});
      return;
    }

    const reason = args.slice(2).join(" ").trim() || "Canceled by staff.";
    await cancelGiveaway(message.client, giveaway, reason, message.author);
    await message.reply("✅ Giveaway canceled.").catch(() => {});
  } else if (subcommand === "list") {
    const activeGiveaways = await all(
      `SELECT id, channel_id, message_id, host_id, prize, winners_count, end_time
       FROM giveaways
       WHERE guild_id=? AND ended=0
       ORDER BY end_time ASC
       LIMIT 15`,
      [message.guild.id]
    );

    if (!activeGiveaways.length) {
      await message.reply("There are no active giveaways in this server.").catch(() => {});
      return;
    }

    const lines = activeGiveaways.map((g) => {
      const endsAtTs = Number(g.end_time || 0) > 0 ? Math.floor(Number(g.end_time) / 1000) : null;
      const endText = endsAtTs ? `<t:${endsAtTs}:R>` : "unknown";
      const link = `https://discord.com/channels/${message.guild.id}/${g.channel_id}/${g.message_id}`;
      return `**#${g.id}** • ${g.prize}\nWinners: ${g.winners_count} • Ends: ${endText} • Host: <@${g.host_id}>\n[Jump to giveaway](${link})`;
    });

    const embed = new EmbedBuilder()
      .setColor(0x00ff99)
      .setTitle("🎉 Active Giveaways")
      .setDescription(lines.join("\n\n"))
      .setFooter({ text: "Use !giveaway end|reroll|cancel <message_id>" })
      .setTimestamp();

    await message.reply({ embeds: [embed] }).catch(() => {});
  } else if (subcommand === "status") {
    if (!args[1]) {
      await message.reply("Usage: `!giveaway status <message_id>`").catch(() => {});
      return;
    }

    const giveaway = await get(
      `SELECT id, message_id, prize, host_id, winners_count, end_time, ended, winner_ids
       FROM giveaways
       WHERE guild_id=? AND message_id=?`,
      [message.guild.id, args[1]]
    );

    if (!giveaway) {
      await message.reply("❌ Giveaway not found.").catch(() => {});
      return;
    }

    const endTs = Number(giveaway.end_time || 0) > 0 ? Math.floor(Number(giveaway.end_time) / 1000) : null;
    const winnerMentions = String(giveaway.winner_ids || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
      .map((id) => `<@${id}>`);

    const embed = new EmbedBuilder()
      .setColor(Number(giveaway.ended || 0) === 1 ? 0x8b0000 : 0x00ff99)
      .setTitle(`🎉 Giveaway #${giveaway.id}`)
      .addFields(
        { name: "Prize", value: String(giveaway.prize || "Unknown"), inline: false },
        { name: "Status", value: Number(giveaway.ended || 0) === 1 ? "Ended" : "Active", inline: true },
        { name: "Host", value: `<@${giveaway.host_id}>`, inline: true },
        { name: "Winners", value: String(giveaway.winners_count || 0), inline: true },
        { name: "End Time", value: endTs ? `<t:${endTs}:F> (<t:${endTs}:R>)` : "Unknown", inline: false },
        { name: "Winner Results", value: winnerMentions.length ? winnerMentions.join(", ") : "Not selected yet", inline: false }
      )
      .setFooter({ text: `Message ID: ${giveaway.message_id}` })
      .setTimestamp();

    await message.reply({ embeds: [embed] }).catch(() => {});
  } else {
    await message.reply("Usage: `!giveaway <start|end|reroll|cancel|list|status> ...`").catch(() => {});
  }
}

async function cancelGiveaway(client, giveaway, reason = "Canceled by staff.", canceledBy = null) {
  const guild = client.guilds.cache.get(giveaway.guild_id);

  await run(`UPDATE giveaways SET ended=1, winner_ids=? WHERE id=?`, ["", giveaway.id]);

  if (!guild) return;
  const channel = guild.channels.cache.get(giveaway.channel_id)
    || await guild.channels.fetch(giveaway.channel_id).catch(() => null);
  if (!channel) return;

  const giveawayMsg = await channel.messages.fetch(giveaway.message_id).catch(() => null);
  if (!giveawayMsg) return;

  const cancelEmbed = {
    color: 0x808080,
    title: "🚫 GIVEAWAY CANCELED",
    description: `**Prize:** ${giveaway.prize}\n**Reason:** ${reason}`,
    footer: { text: canceledBy ? `Canceled by ${canceledBy.tag}` : `Hosted by ${giveaway.host_id}` }
  };

  await giveawayMsg.edit({ embeds: [cancelEmbed], components: [] }).catch(() => {});
}

async function endGiveaway(client, giveaway) {
  const guild = client.guilds.cache.get(giveaway.guild_id);
  if (!guild) return;

  const channel = guild.channels.cache.get(giveaway.channel_id)
    || await guild.channels.fetch(giveaway.channel_id).catch(() => null);
  if (!channel) return;

  const giveawayMsg = await channel.messages.fetch(giveaway.message_id).catch(() => null);
  if (!giveawayMsg) return;

  const reaction = giveawayMsg.reactions.cache.get("🎉");
  if (!reaction) {
    await run(`UPDATE giveaways SET ended=1 WHERE id=?`, [giveaway.id]);
    return;
  }

  const users = await reaction.users.fetch();
  const validEntries = users.filter(u => !u.bot);

  let winners = [];
  if (validEntries.size === 0) {
    await channel.send(`No valid entries for the giveaway: **${giveaway.prize}**`).catch(() => {});
  } else {
    const winnerCount = Math.min(giveaway.winners_count, validEntries.size);
    const entries = Array.from(validEntries.values());
    
    for (let i = 0; i < winnerCount; i++) {
      const randomIndex = Math.floor(Math.random() * entries.length);
      winners.push(entries[randomIndex]);
      entries.splice(randomIndex, 1);
    }

    const winnerMentions = winners.map(w => `<@${w.id}>`).join(", ");
    await channel.send(`🎉 Congratulations ${winnerMentions}! You won **${giveaway.prize}**!`).catch(() => {});
  }

  const winnerIds = winners.map(w => w.id).join(",");
  await run(`UPDATE giveaways SET ended=1, winner_ids=? WHERE id=?`, [winnerIds, giveaway.id]);

  const endEmbed = {
    color: 0xff0000,
    title: "🎉 GIVEAWAY ENDED 🎉",
    description: `**Prize:** ${giveaway.prize}\n**Winners:** ${winners.length > 0 ? winners.map(w => w.tag).join(", ") : "No winners"}`,
    footer: { text: `Hosted by ${giveaway.host_id}` }
  };

  await giveawayMsg.edit({ embeds: [endEmbed] }).catch(() => {});
}

async function rerollGiveaway(client, giveaway) {
  const guild = client.guilds.cache.get(giveaway.guild_id);
  if (!guild) return;

  const channel = guild.channels.cache.get(giveaway.channel_id)
    || await guild.channels.fetch(giveaway.channel_id).catch(() => null);
  if (!channel) return;

  const giveawayMsg = await channel.messages.fetch(giveaway.message_id).catch(() => null);
  if (!giveawayMsg) return;

  const reaction = giveawayMsg.reactions.cache.get("🎉");
  if (!reaction) return;

  const users = await reaction.users.fetch();
  const validEntries = users.filter(u => !u.bot);

  if (validEntries.size === 0) {
    await channel.send(`No valid entries to reroll for: **${giveaway.prize}**`).catch(() => {});
    return;
  }

  const winnerCount = Math.min(giveaway.winners_count, validEntries.size);
  const entries = Array.from(validEntries.values());
  const winners = [];

  for (let i = 0; i < winnerCount; i++) {
    const randomIndex = Math.floor(Math.random() * entries.length);
    winners.push(entries[randomIndex]);
    entries.splice(randomIndex, 1);
  }

  const winnerMentions = winners.map(w => `<@${w.id}>`).join(", ");
  await channel.send(`🎉 **REROLL!** Congratulations ${winnerMentions}! You won **${giveaway.prize}**!`).catch(() => {});
}

// ─────────────────────────────────────────────────────
// Advanced Poll Commands
// ─────────────────────────────────────────────────────

async function cmdAdvancedPoll(message, args) {
  // !poll create <question> | <option1> | <option2> | ...
  // !poll end <message_id>
  // !poll list
  // !poll status <message_id>
  
  const subcommand = args[0]?.toLowerCase();

  if (subcommand === "create") {
    const content = args.slice(1).join(" ");
    if (!content.includes("|")) {
      await message.reply("Usage: `!poll create <question> | <option1> | <option2> | ...`\nExample: `!poll create What's your favorite color? | Red | Blue | Green`").catch(() => {});
      return;
    }

    const parts = content.split("|").map(p => p.trim());
    if (parts.length < 3) {
      await message.reply("❌ You need at least a question and 2 options.").catch(() => {});
      return;
    }

    const question = parts[0];
    const options = parts.slice(1);

    if (options.length > 10) {
      await message.reply("❌ Maximum 10 options allowed.").catch(() => {});
      return;
    }

    const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
    
    const pollEmbed = {
      color: 0x3498db,
      title: "📊 Poll",
      description: `**${question}**\n\n${options.map((opt, i) => `${emojis[i]} ${opt}`).join("\n")}`,
      footer: { text: `Created by ${message.author.tag}` },
      timestamp: new Date().toISOString()
    };

    const pollMsg = await message.channel.send({ embeds: [pollEmbed] }).catch(() => null);
    if (!pollMsg) {
      await message.reply("❌ Failed to create poll.").catch(() => {});
      return;
    }

    for (let i = 0; i < options.length; i++) {
      await pollMsg.react(emojis[i]).catch(() => {});
    }

    const result = await run(`
      INSERT INTO polls (guild_id, channel_id, message_id, creator_id, question, options)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [message.guild.id, message.channel.id, pollMsg.id, message.author.id, question, JSON.stringify(options)]);

    await message.reply(`✅ Poll created! React to vote. ID: ${result.lastID}`).catch(() => {});
  } else if (subcommand === "end") {
    if (!args[1]) {
      await message.reply("Usage: `!poll end <message_id>`").catch(() => {});
      return;
    }

    const poll = await get(`SELECT * FROM polls WHERE message_id=? AND guild_id=? AND ended=0`, [args[1], message.guild.id]);
    if (!poll) {
      await message.reply("❌ Active poll not found.").catch(() => {});
      return;
    }

    const canManage = poll.creator_id === message.author.id || isAdminOrManager(message.member) || await isModerator(message.member);
    if (!canManage) {
      await message.reply("❌ Only the poll creator or server staff can end this poll.").catch(() => {});
      return;
    }

    await endPoll(message.client, poll);
    await message.reply("✅ Poll ended!").catch(() => {});
  } else if (subcommand === "list") {
    const polls = await all(
      `SELECT id, message_id, question, creator_id, created_at
       FROM polls
       WHERE guild_id=? AND ended=0
       ORDER BY created_at DESC
       LIMIT 15`,
      [message.guild.id]
    );

    if (!polls.length) {
      await message.reply("There are no active polls in this server.").catch(() => {});
      return;
    }

    const lines = polls.map((poll) => {
      const createdTs = Number(poll.created_at || 0) > 0 ? Math.floor(Number(poll.created_at) / 1000) : null;
      const createdText = createdTs ? `<t:${createdTs}:R>` : "unknown";
      const question = String(poll.question || "").slice(0, 140);
      return `**${question || "Untitled poll"}**\nMessage ID: \`${poll.message_id}\` • Creator: <@${poll.creator_id}> • Created: ${createdText}`;
    });

    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle("📊 Active Polls")
      .setDescription(lines.join("\n\n"))
      .setFooter({ text: "Use !poll end <message_id> to close one." })
      .setTimestamp();

    await message.reply({ embeds: [embed] }).catch(() => {});
  } else if (subcommand === "status") {
    if (!args[1]) {
      await message.reply("Usage: `!poll status <message_id>`").catch(() => {});
      return;
    }

    const poll = await get(
      `SELECT id, message_id, creator_id, question, options, created_at, ended
       FROM polls
       WHERE guild_id=? AND message_id=?`,
      [message.guild.id, args[1]]
    );

    if (!poll) {
      await message.reply("❌ Poll not found.").catch(() => {});
      return;
    }

    const createdTs = Number(poll.created_at || 0) > 0 ? Math.floor(Number(poll.created_at) / 1000) : null;
    const options = (() => {
      try {
        return JSON.parse(String(poll.options || "[]"));
      } catch {
        return [];
      }
    })();

    const embed = new EmbedBuilder()
      .setColor(Number(poll.ended || 0) === 1 ? 0x2ecc71 : 0x3498db)
      .setTitle(`📊 Poll #${poll.id}`)
      .setDescription(`**${poll.question || "Untitled poll"}**`)
      .addFields(
        { name: "Status", value: Number(poll.ended || 0) === 1 ? "Ended" : "Active", inline: true },
        { name: "Creator", value: `<@${poll.creator_id}>`, inline: true },
        { name: "Options", value: String(options.length || 0), inline: true },
        { name: "Message ID", value: `\`${poll.message_id}\``, inline: false }
      )
      .setFooter({ text: createdTs ? `Created <t:${createdTs}:R>` : "Created time unknown" })
      .setTimestamp();

    await message.reply({ embeds: [embed] }).catch(() => {});
  } else {
    await message.reply("Usage: `!poll <create|end|list|status> ...`").catch(() => {});
  }
}

async function endPoll(client, poll) {
  const guild = client.guilds.cache.get(poll.guild_id);
  if (!guild) return;

  const channel = guild.channels.cache.get(poll.channel_id)
    || await guild.channels.fetch(poll.channel_id).catch(() => null);
  if (!channel) return;

  const pollMsg = await channel.messages.fetch(poll.message_id).catch(() => null);
  if (!pollMsg) return;

  const options = JSON.parse(poll.options);
  const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
  
  const results = [];
  for (let i = 0; i < options.length; i++) {
    const reaction = pollMsg.reactions.cache.get(emojis[i]);
    const count = reaction ? reaction.count - 1 : 0; // -1 for bot reaction
    results.push({ option: options[i], votes: count });
  }

  results.sort((a, b) => b.votes - a.votes);
  const totalVotes = results.reduce((sum, r) => sum + r.votes, 0);

  const resultsEmbed = {
    color: 0x2ecc71,
    title: "📊 Poll Results",
    description: `**${poll.question}**\n\n${results.map((r, i) => `${i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "•"} **${r.option}**: ${r.votes} vote${r.votes !== 1 ? "s" : ""} (${totalVotes > 0 ? Math.round((r.votes / totalVotes) * 100) : 0}%)`).join("\n")}\n\n**Total Votes:** ${totalVotes}`,
    footer: { text: "Poll ended" },
    timestamp: new Date().toISOString()
  };

  await pollMsg.edit({ embeds: [resultsEmbed] }).catch(() => {});
  await run(`UPDATE polls SET ended=1 WHERE id=?`, [poll.id]);
}

// ─────────────────────────────────────────────────────
// Economy Commands
// ─────────────────────────────────────────────────────

async function cmdBalance(message, args) {
  const economySettings = await get(`SELECT * FROM economy_settings WHERE guild_id=?`, [message.guild.id]);
  if (!economySettings || !economySettings.enabled) {
    await message.reply("❌ Economy system is disabled on this server.").catch(() => {});
    return;
  }

  const targetUser = args[0] ? await pickUserSmart(message, args[0]) : null;
  const userId = targetUser?.member?.id || message.author.id;

  await run(`
    INSERT INTO user_economy (guild_id, user_id)
    VALUES (?, ?)
    ON CONFLICT (guild_id, user_id) DO NOTHING
  `, [message.guild.id, userId]);

  const economy = await get(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`, [message.guild.id, userId]);
  
  const embed = {
    color: 0xf1c40f,
    title: `${economySettings.currency_symbol} Balance`,
    description: `💰 **Wallet:** ${economy.balance} ${economySettings.currency_name}\n🏦 **Bank:** ${economy.bank} ${economySettings.currency_name}\n💎 **Total:** ${economy.balance + economy.bank} ${economySettings.currency_name}`,
    footer: { text: userId === message.author.id ? "Your balance" : `Balance of ${targetUser.member.user.tag}` }
  };

  await message.reply({ embeds: [embed] }).catch(() => {});
}

async function cmdDaily(message) {
  const economySettings = await get(`SELECT * FROM economy_settings WHERE guild_id=?`, [message.guild.id]);
  if (!economySettings || !economySettings.enabled) {
    await message.reply("❌ Economy system is disabled on this server.").catch(() => {});
    return;
  }

  await run(`
    INSERT INTO user_economy (guild_id, user_id)
    VALUES (?, ?)
    ON CONFLICT (guild_id, user_id) DO NOTHING
  `, [message.guild.id, message.author.id]);

  const economy = await get(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`, [message.guild.id, message.author.id]);
  
  const now = Date.now();
  const dayInMs = 86400000;
  
  if (economy.last_daily && (now - economy.last_daily) < dayInMs) {
    const timeLeft = dayInMs - (now - economy.last_daily);
    const hours = Math.floor(timeLeft / 3600000);
    const minutes = Math.floor((timeLeft % 3600000) / 60000);
    await message.reply(`⏰ You already claimed your daily reward! Come back in ${hours}h ${minutes}m.\n🔥 Current streak: **${economy.daily_streak || 0}** days`).catch(() => {});
    return;
  }

  // Check streak
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - dayInMs).toDateString();
  let newStreak = 1;
  
  if (economy.daily_streak_date === yesterday) {
    newStreak = (economy.daily_streak || 0) + 1;
  } else if (economy.daily_streak_date !== today) {
    newStreak = 1;
  }

  // Calculate reward with streak bonus
  const baseAmount = economySettings.daily_amount || 100;
  const streakBonus = Math.floor((newStreak - 1) * (economySettings.daily_streak_bonus || 10));
  const totalAmount = baseAmount + streakBonus;

  const newBalance = economy.balance + totalAmount;
  await run(`UPDATE user_economy SET balance=?, last_daily=?, daily_streak=?, daily_streak_date=? WHERE guild_id=? AND user_id=?`, 
    [newBalance, now, newStreak, today, message.guild.id, message.author.id]);
  
  await run(`INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
    [message.guild.id, message.author.id, "daily", totalAmount, `Daily reward (${newStreak} day streak)`]);

  const embed = {
    color: 0x2ecc71,
    title: `${economySettings.currency_symbol} Daily Reward`,
    description: `**Base:** ${baseAmount} ${economySettings.currency_name}\n**Streak Bonus:** ${streakBonus} ${economySettings.currency_name} (${newStreak} days)\n**Total:** ${totalAmount} ${economySettings.currency_name}`,
    fields: [
      { name: "🔥 Current Streak", value: `${newStreak} day${newStreak !== 1 ? "s" : ""}`, inline: true },
      { name: "💰 New Balance", value: `${newBalance} ${economySettings.currency_name}`, inline: true }
    ],
    footer: { text: `Keep your streak going! Come back tomorrow for ${baseAmount + (newStreak * (economySettings.daily_streak_bonus || 10))} ${economySettings.currency_name}` }
  };

  await message.reply({ embeds: [embed] }).catch(() => {});
}

async function cmdWeekly(message) {
  const economySettings = await get(`SELECT * FROM economy_settings WHERE guild_id=?`, [message.guild.id]);
  if (!economySettings || !economySettings.enabled) {
    await message.reply("❌ Economy system is disabled on this server.").catch(() => {});
    return;
  }

  await run(`
    INSERT INTO user_economy (guild_id, user_id)
    VALUES (?, ?)
    ON CONFLICT (guild_id, user_id) DO NOTHING
  `, [message.guild.id, message.author.id]);

  const economy = await get(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`, [message.guild.id, message.author.id]);
  
  const now = Date.now();
  const weekInMs = 604800000;
  
  if (economy.last_weekly && (now - economy.last_weekly) < weekInMs) {
    const timeLeft = weekInMs - (now - economy.last_weekly);
    const days = Math.floor(timeLeft / 86400000);
    const hours = Math.floor((timeLeft % 86400000) / 3600000);
    await message.reply(`⏰ You already claimed your weekly reward! Come back in ${days}d ${hours}h.`).catch(() => {});
    return;
  }

  const newBalance = economy.balance + economySettings.weekly_amount;
  await run(`UPDATE user_economy SET balance=?, last_weekly=? WHERE guild_id=? AND user_id=?`, [newBalance, now, message.guild.id, message.author.id]);
  
  await run(`INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
    [message.guild.id, message.author.id, "weekly", economySettings.weekly_amount, "Weekly reward"]);

  await message.reply(`✅ You claimed your weekly reward of ${economySettings.weekly_amount} ${economySettings.currency_name}! ${economySettings.currency_symbol}`).catch(() => {});
}

async function cmdPay(message, args) {
  const economySettings = await get(`SELECT * FROM economy_settings WHERE guild_id=?`, [message.guild.id]);
  if (!economySettings || !economySettings.enabled) {
    await message.reply("❌ Economy system is disabled on this server.").catch(() => {});
    return;
  }

  await run(`INSERT INTO user_economy (guild_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING`, [message.guild.id, message.author.id]);
  const senderEcon = await get(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`, [message.guild.id, message.author.id]);

  if (args.length < 2) {
    const ecoPrefix = economySettings.economy_prefix || "$";
    await message.reply(`💸 **Pay Another User**\n\nTransfer money from your wallet to another user.\n\n**Usage:** \`${ecoPrefix}pay @user <amount>\`\n**Example:** \`${ecoPrefix}pay @John 500\`\n\n**Your Balance:** ${senderEcon.balance} ${economySettings.currency_name}`).catch(() => {});
    return;
  }

  const target = await pickUserSmart(message, args[0]);
  if (!target || target.ambiguous || target.member.user.bot) {
    await message.reply("❌ Invalid user or cannot pay bots.").catch(() => {});
    return;
  }

  const amount = Number.parseInt(args[1], 10);
  if (!Number.isFinite(amount) || amount <= 0) {
    await message.reply("❌ Invalid amount.").catch(() => {});
    return;
  }

  await run(`INSERT INTO user_economy (guild_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING`, [message.guild.id, target.member.id]);
  
  if (senderEcon.balance < amount) {
    await message.reply(`❌ You don't have enough ${economySettings.currency_name}!`).catch(() => {});
    return;
  }

  await run(`UPDATE user_economy SET balance=balance-? WHERE guild_id=? AND user_id=?`, [amount, message.guild.id, message.author.id]);
  await run(`UPDATE user_economy SET balance=balance+? WHERE guild_id=? AND user_id=?`, [amount, message.guild.id, target.member.id]);

  await run(`INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
    [message.guild.id, message.author.id, "pay_sent", -amount, `Paid to ${target.member.user.tag}`]);
  await run(`INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
    [message.guild.id, target.member.id, "pay_received", amount, `Received from ${message.author.tag}`]);

  await message.reply(`✅ You paid ${amount} ${economySettings.currency_name} to ${target.member}! ${economySettings.currency_symbol}`).catch(() => {});
}

async function cmdEcoLeaderboard(message) {
  const economySettings = await get(`SELECT * FROM economy_settings WHERE guild_id=?`, [message.guild.id]);
  if (!economySettings || !economySettings.enabled) {
    await message.reply("❌ Economy system is disabled on this server.").catch(() => {});
    return;
  }

  const top = await all(`
    SELECT user_id, balance, bank, (balance + bank) as total
    FROM user_economy
    WHERE guild_id=?
    ORDER BY total DESC
    LIMIT 10
  `, [message.guild.id]);

  if (top.length === 0) {
    await message.reply("No economy data yet!").catch(() => {});
    return;
  }

  const embed = {
    color: 0xf1c40f,
    title: `${economySettings.currency_symbol} Economy Leaderboard`,
    description: top.map((row, i) => {
      const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
      return `${medal} <@${row.user_id}>: **${row.total}** ${economySettings.currency_name}`;
    }).join("\n"),
    footer: { text: `${message.guild.name}` }
  };

  await message.reply({ embeds: [embed] }).catch(() => {});
}

// ==================== ECONOMY: BANKING ====================
async function cmdDeposit(message, args) {
  const economySettings = await get(`SELECT * FROM economy_settings WHERE guild_id=?`, [message.guild.id]);
  if (!economySettings || !economySettings.enabled) {
    await message.reply("❌ Economy system is disabled on this server.").catch(() => {});
    return;
  }

  await run(`INSERT INTO user_economy (guild_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING`, [message.guild.id, message.author.id]);
  const economy = await get(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`, [message.guild.id, message.author.id]);

  if (!args[0]) {
    const ecoPrefix = economySettings.economy_prefix || "$";
    await message.reply(`💰 **Deposit Money to Bank**\n\nMove money from your wallet to your bank for safekeeping.\n\n**Usage:**\n\`${ecoPrefix}deposit <amount>\` - Deposit specific amount\n\`${ecoPrefix}deposit all\` - Deposit everything\n\n**Your Balance:**\n💵 Wallet: ${economy.balance} ${economySettings.currency_name}\n🏦 Bank: ${economy.bank} ${economySettings.currency_name}`).catch(() => {});
    return;
  }

  let amount;
  if (args[0]?.toLowerCase() === "all") {
    amount = economy.balance;
  } else {
    amount = parseInt(args[0]);
    if (isNaN(amount) || amount <= 0) {
      await message.reply("❌ Please specify a valid amount or 'all'.").catch(() => {});
      return;
    }
  }

  if (economy.balance < amount) {
    await message.reply(`❌ You only have ${economy.balance} ${economySettings.currency_name} in your wallet!`).catch(() => {});
    return;
  }

  await run(`UPDATE user_economy SET balance=?, bank=? WHERE guild_id=? AND user_id=?`,
    [economy.balance - amount, economy.bank + amount, message.guild.id, message.author.id]);
  await run(`INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
    [message.guild.id, message.author.id, "deposit", amount, "Bank deposit"]);

  await message.reply(`✅ Deposited ${amount} ${economySettings.currency_name} to your bank. 🏦`).catch(() => {});
}

async function cmdWithdraw(message, args) {
  const economySettings = await get(`SELECT * FROM economy_settings WHERE guild_id=?`, [message.guild.id]);
  if (!economySettings || !economySettings.enabled) {
    await message.reply("❌ Economy system is disabled on this server.").catch(() => {});
    return;
  }

  await run(`INSERT INTO user_economy (guild_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING`, [message.guild.id, message.author.id]);
  const economy = await get(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`, [message.guild.id, message.author.id]);

  if (!args[0]) {
    const ecoPrefix = economySettings.economy_prefix || "$";
    await message.reply(`💰 **Withdraw Money from Bank**\n\nMove money from your bank to your wallet.\n\n**Usage:**\n\`${ecoPrefix}withdraw <amount>\` - Withdraw specific amount\n\`${ecoPrefix}withdraw all\` - Withdraw everything\n\n**Your Balance:**\n💵 Wallet: ${economy.balance} ${economySettings.currency_name}\n🏦 Bank: ${economy.bank} ${economySettings.currency_name}`).catch(() => {});
    return;
  }

  let amount;
  if (args[0]?.toLowerCase() === "all") {
    amount = economy.bank;
  } else {
    amount = parseInt(args[0]);
    if (isNaN(amount) || amount <= 0) {
      await message.reply("❌ Please specify a valid amount or 'all'.").catch(() => {});
      return;
    }
  }

  if (economy.bank < amount) {
    await message.reply(`❌ You only have ${economy.bank} ${economySettings.currency_name} in your bank!`).catch(() => {});
    return;
  }

  await run(`UPDATE user_economy SET balance=?, bank=? WHERE guild_id=? AND user_id=?`,
    [economy.balance + amount, economy.bank - amount, message.guild.id, message.author.id]);
  await run(`INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
    [message.guild.id, message.author.id, "withdraw", amount, "Bank withdrawal"]);

  await message.reply(`✅ Withdrew ${amount} ${economySettings.currency_name} from your bank. 💵`).catch(() => {});
}

async function cmdRob(message, args) {
  const economySettings = await get(`SELECT * FROM economy_settings WHERE guild_id=?`, [message.guild.id]);
  if (!economySettings || !economySettings.enabled || !economySettings.rob_enabled) {
    await message.reply("❌ Robbing is disabled on this server.").catch(() => {});
    return;
  }

  if (!args[0]) {
    const ecoPrefix = economySettings.economy_prefix || "$";
    const cooldownMins = Math.floor((economySettings.rob_cooldown || 3600) / 60);
    await message.reply(`💰 **Rob Another User**\n\nAttempt to steal money from another user's wallet! (50% success rate)\n\n**Usage:** \`${ecoPrefix}rob @user\`\n\n**Rules:**\n• 50% chance to succeed\n• If caught, you pay a fine\n• Users with 🔒 Padlock are protected\n• Cooldown: ${cooldownMins} minutes\n• Target must have at least 50 ${economySettings.currency_name}\n\n**Tip:** Buy a padlock from the shop to protect yourself!`).catch(() => {});
    return;
  }

  const target = parseUserMention(message, args[0]);
  if (!target.found || target.member.user.bot || target.member.id === message.author.id) {
    await message.reply("❌ Please mention a valid user to rob.").catch(() => {});
    return;
  }

  await run(`INSERT INTO user_economy (guild_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING`, [message.guild.id, message.author.id]);
  await run(`INSERT INTO user_economy (guild_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING`, [message.guild.id, target.member.id]);

  const robber = await get(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`, [message.guild.id, message.author.id]);
  const victim = await get(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`, [message.guild.id, target.member.id]);

  const now = Date.now();
  const cooldown = (economySettings.rob_cooldown || 3600) * 1000;
  if (robber.last_normal_rob && (now - robber.last_normal_rob) < cooldown) {
    const timeLeft = cooldown - (now - robber.last_normal_rob);
    const minutes = Math.floor(timeLeft / 60000);
    await message.reply(`❌ You must wait ${minutes} minutes before robbing again!`).catch(() => {});
    return;
  }

  // Check for padlock
  const padlock = await get(`SELECT * FROM user_inventory WHERE guild_id=? AND user_id=? AND item_id='padlock' AND quantity > 0`, 
    [message.guild.id, target.member.id]);
  if (padlock) {
    await run(`UPDATE user_inventory SET quantity=quantity-1 WHERE guild_id=? AND user_id=? AND item_id='padlock'`,
      [message.guild.id, target.member.id]);
    await message.reply(`❌ ${target.member} had a 🔒 **Padlock** protecting their wallet! It broke when you tried to rob them.`).catch(() => {});
    await run(`UPDATE user_economy SET last_normal_rob=? WHERE guild_id=? AND user_id=?`, [now, message.guild.id, message.author.id]);
    return;
  }

  if (victim.balance < 50) {
    await message.reply(`❌ ${target.member} is too poor to rob! (less than 50 ${economySettings.currency_name})`).catch(() => {});
    return;
  }

  // 50% success rate
  const success = Math.random() < 0.5;
  if (!success) {
    const fine = Math.min(robber.balance, Math.floor(victim.balance * 0.3));
    await run(`UPDATE user_economy SET balance=?, last_normal_rob=? WHERE guild_id=? AND user_id=?`,
      [robber.balance - fine, now, message.guild.id, message.author.id]);
    await run(`INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
      [message.guild.id, message.author.id, "rob_failed", -fine, `Failed to rob ${target.member.user.tag}`]);
    await message.reply(`❌ You got caught trying to rob ${target.member}! You paid a fine of ${fine} ${economySettings.currency_name}.`).catch(() => {});
    return;
  }

  const stolen = Math.floor(victim.balance * (0.1 + Math.random() * 0.2)); // 10-30%
  await run(`UPDATE user_economy SET balance=?, last_normal_rob=? WHERE guild_id=? AND user_id=?`,
    [robber.balance + stolen, now, message.guild.id, message.author.id]);
  await run(`UPDATE user_economy SET balance=? WHERE guild_id=? AND user_id=?`,
    [victim.balance - stolen, message.guild.id, target.member.id]);
  await run(`INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
    [message.guild.id, message.author.id, "rob_success", stolen, `Robbed ${target.member.user.tag}`]);
  await run(`INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
    [message.guild.id, target.member.id, "robbed", -stolen, `Robbed by ${message.author.tag}`]);

  await message.reply(`✅ You successfully robbed ${stolen} ${economySettings.currency_name} from ${target.member}! 💰`).catch(() => {});
}

// ==================== ECONOMY: GAMBLING ====================
async function cmdSlots(message, args) {
  const economySettings = await get(`SELECT * FROM economy_settings WHERE guild_id=?`, [message.guild.id]);
  if (!economySettings || !economySettings.enabled) {
    await message.reply("❌ Economy system is disabled on this server.").catch(() => {});
    return;
  }

  await run(`INSERT INTO user_economy (guild_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING`, [message.guild.id, message.author.id]);
  const economy = await get(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`, [message.guild.id, message.author.id]);

  if (!args[0]) {
    const ecoPrefix = economySettings.economy_prefix || "$";
    await message.reply(`🎰 **Slot Machine**\n\nSpin the slots and win big!\n\n**Usage:** \`${ecoPrefix}slots <bet>\`\n\n**Payouts:**\n🎉 Triple Match: 3x\n💎 Triple Diamonds: 5x\n7️⃣ Triple Sevens: 10x (JACKPOT!)\n🎯 Double Match: 1.5x\n\n**Your Balance:** ${economy.balance} ${economySettings.currency_name}`).catch(() => {});
    return;
  }

  const bet = parseInt(args[0]);
  if (isNaN(bet) || bet <= 0) {
    await message.reply("❌ Please specify a valid bet amount.").catch(() => {});
    return;
  }

  if (economy.balance < bet) {
    await message.reply(`❌ You don't have enough ${economySettings.currency_name}!`).catch(() => {});
    return;
  }

  const symbols = ["🍒", "🍋", "🍊", "🍇", "💎", "7️⃣"];
  const reel1 = symbols[Math.floor(Math.random() * symbols.length)];
  const reel2 = symbols[Math.floor(Math.random() * symbols.length)];
  const reel3 = symbols[Math.floor(Math.random() * symbols.length)];

  let multiplier = 0;
  let result = "";

  if (reel1 === reel2 && reel2 === reel3) {
    if (reel1 === "7️⃣") {
      multiplier = 10;
      result = "🎰 JACKPOT!!! 🎰";
    } else if (reel1 === "💎") {
      multiplier = 5;
      result = "💎 Triple Diamonds! 💎";
    } else {
      multiplier = 3;
      result = "🎉 Triple Match! 🎉";
    }
  } else if (reel1 === reel2 || reel2 === reel3 || reel1 === reel3) {
    multiplier = 1.5;
    result = "🎯 Double Match!";
  } else {
    multiplier = 0;
    result = "❌ No match...";
  }

  const winnings = Math.floor(bet * multiplier) - bet;
  const newBalance = economy.balance + winnings;

  await run(`UPDATE user_economy SET balance=? WHERE guild_id=? AND user_id=?`, [newBalance, message.guild.id, message.author.id]);
  await run(`INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
    [message.guild.id, message.author.id, "slots", winnings, `Slots (bet ${bet})`]);

  const embed = {
    color: winnings > 0 ? 0x2ecc71 : 0xe74c3c,
    title: "🎰 Slot Machine",
    description: `${reel1} | ${reel2} | ${reel3}\n\n${result}`,
    fields: [
      { name: "Bet", value: `${bet} ${economySettings.currency_name}`, inline: true },
      { name: "Result", value: winnings > 0 ? `+${winnings} ${economySettings.currency_name}` : `${winnings} ${economySettings.currency_name}`, inline: true },
      { name: "Balance", value: `${newBalance} ${economySettings.currency_name}`, inline: true }
    ]
  };

  await message.reply({ embeds: [embed] }).catch(() => {});
}

async function cmdCoinflip(message, args) {
  const economySettings = await get(`SELECT * FROM economy_settings WHERE guild_id=?`, [message.guild.id]);
  if (!economySettings || !economySettings.enabled) {
    await message.reply("❌ Economy system is disabled on this server.").catch(() => {});
    return;
  }

  await run(`INSERT INTO user_economy (guild_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING`, [message.guild.id, message.author.id]);
  const economy = await get(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`, [message.guild.id, message.author.id]);

  if (!args[0] || !args[1]) {
    const ecoPrefix = economySettings.economy_prefix || "$";
    await message.reply(`🪙 **Coinflip**\n\nBet on heads or tails! Double your money or lose it all.\n\n**Usage:** \`${ecoPrefix}coinflip <bet> <heads/tails>\`\n**Example:** \`${ecoPrefix}coinflip 100 h\`\n\n**Choices:** heads, tails, h, t\n**Payout:** 2x your bet\n\n**Your Balance:** ${economy.balance} ${economySettings.currency_name}`).catch(() => {});
    return;
  }

  const bet = parseInt(args[0]);
  const choice = args[1]?.toLowerCase();
  
  if (isNaN(bet) || bet <= 0) {
    await message.reply("❌ Please specify a valid bet amount.").catch(() => {});
    return;
  }

  if (!["heads", "tails", "h", "t"].includes(choice)) {
    await message.reply("❌ Please choose heads (h) or tails (t).").catch(() => {});
    return;
  }

  if (economy.balance < bet) {
    await message.reply(`❌ You don't have enough ${economySettings.currency_name}!`).catch(() => {});
    return;
  }

  const flip = Math.random() < 0.5 ? "heads" : "tails";
  const userChoice = choice === "h" ? "heads" : choice === "t" ? "tails" : choice;
  const won = flip === userChoice;
  const winnings = won ? bet : -bet;
  const newBalance = economy.balance + winnings;

  await run(`UPDATE user_economy SET balance=? WHERE guild_id=? AND user_id=?`, [newBalance, message.guild.id, message.author.id]);
  await run(`INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
    [message.guild.id, message.author.id, "coinflip", winnings, `Coinflip ${flip} (bet ${bet})`]);

  const embed = {
    color: won ? 0x2ecc71 : 0xe74c3c,
    title: "🪙 Coinflip",
    description: `You chose **${userChoice}**\nThe coin landed on **${flip}**!\n\n${won ? "✅ You won!" : "❌ You lost!"}`,
    fields: [
      { name: "Bet", value: `${bet} ${economySettings.currency_name}`, inline: true },
      { name: "Result", value: won ? `+${bet} ${economySettings.currency_name}` : `-${bet} ${economySettings.currency_name}`, inline: true },
      { name: "Balance", value: `${newBalance} ${economySettings.currency_name}`, inline: true }
    ]
  };

  await message.reply({ embeds: [embed] }).catch(() => {});
}

async function cmdDice(message, args) {
  const economySettings = await get(`SELECT * FROM economy_settings WHERE guild_id=?`, [message.guild.id]);
  if (!economySettings || !economySettings.enabled) {
    await message.reply("❌ Economy system is disabled on this server.").catch(() => {});
    return;
  }

  await run(`INSERT INTO user_economy (guild_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING`, [message.guild.id, message.author.id]);
  const economy = await get(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`, [message.guild.id, message.author.id]);

  if (!args[0] || !args[1]) {
    const ecoPrefix = economySettings.economy_prefix || "$";
    await message.reply(`🎲 **Dice Roll**\n\nGuess the dice roll (1-6) and win 6x your bet!\n\n**Usage:** \`${ecoPrefix}dice <bet> <guess>\`\n**Example:** \`${ecoPrefix}dice 100 5\`\n\n**Payout:** 6x your bet if you guess correctly\n\n**Your Balance:** ${economy.balance} ${economySettings.currency_name}`).catch(() => {});
    return;
  }

  const bet = parseInt(args[0]);
  const guess = parseInt(args[1]);
  
  if (isNaN(bet) || bet <= 0) {
    await message.reply("❌ Please specify a valid bet amount.").catch(() => {});
    return;
  }

  if (isNaN(guess) || guess < 1 || guess > 6) {
    await message.reply("❌ Please guess a number between 1 and 6.").catch(() => {});
    return;
  }

  if (economy.balance < bet) {
    await message.reply(`❌ You don't have enough ${economySettings.currency_name}!`).catch(() => {});
    return;
  }

  const roll = Math.floor(Math.random() * 6) + 1;
  const won = roll === guess;
  const winnings = won ? bet * 5 : -bet; // 6x payout (5x profit + original bet)
  const newBalance = economy.balance + winnings;

  await run(`UPDATE user_economy SET balance=? WHERE guild_id=? AND user_id=?`, [newBalance, message.guild.id, message.author.id]);
  await run(`INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
    [message.guild.id, message.author.id, "dice", winnings, `Dice ${roll} (bet ${bet})`]);

  const embed = {
    color: won ? 0x2ecc71 : 0xe74c3c,
    title: "🎲 Dice Roll",
    description: `You guessed **${guess}**\nThe dice rolled **${roll}**!\n\n${won ? "🎉 You won 6x your bet!" : "❌ You lost!"}`,
    fields: [
      { name: "Bet", value: `${bet} ${economySettings.currency_name}`, inline: true },
      { name: "Result", value: won ? `+${bet * 5} ${economySettings.currency_name}` : `-${bet} ${economySettings.currency_name}`, inline: true },
      { name: "Balance", value: `${newBalance} ${economySettings.currency_name}`, inline: true }
    ]
  };

  await message.reply({ embeds: [embed] }).catch(() => {});
}

// ==================== ECONOMY: JOBS ====================
async function cmdJob(message, args) {
  const economySettings = await get(`SELECT * FROM economy_settings WHERE guild_id=?`, [message.guild.id]);
  if (!economySettings || !economySettings.enabled) {
    await message.reply("❌ Economy system is disabled on this server.").catch(() => {});
    return;
  }

  const subcommand = args[0]?.toLowerCase();

  if (!subcommand || subcommand === "list") {
    const jobs = await all(`SELECT * FROM economy_jobs WHERE guild_id=? ORDER BY min_pay ASC`, [message.guild.id]);
    if (jobs.length === 0) {
      await message.reply("❌ No jobs available! Ask an admin to add some.").catch(() => {});
      return;
    }

    const embed = {
      color: 0x3498db,
      title: "💼 Available Jobs",
      description: jobs.map(j => 
        `**${j.name}**\n💰 Pay: ${j.min_pay}-${j.max_pay} ${economySettings.currency_name}\n📊 Requires: ${j.required_shifts} total shifts\n⏰ Weekly: ${j.weekly_shifts_required} shifts/week`
      ).join("\n\n"),
      footer: { text: `Use job apply <jobname> to apply!` }
    };

    await message.reply({ embeds: [embed] }).catch(() => {});
    return;
  }

  await run(`INSERT INTO user_economy (guild_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING`, [message.guild.id, message.author.id]);
  const economy = await get(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`, [message.guild.id, message.author.id]);

  if (subcommand === "apply") {
    const jobName = args.slice(1).join(" ");
    if (!jobName) {
      await message.reply("❌ Please specify a job name.").catch(() => {});
      return;
    }

    const job = await get(`SELECT * FROM economy_jobs WHERE guild_id=? AND LOWER(name)=LOWER(?)`, [message.guild.id, jobName]);
    if (!job) {
      await message.reply("❌ That job doesn't exist! Use `job list` to see available jobs.").catch(() => {});
      return;
    }

    if (economy.job_id) {
      await message.reply("❌ You already have a job! Use `job quit` first.").catch(() => {});
      return;
    }

    if (economy.job_shifts_completed < job.required_shifts) {
      await message.reply(`❌ You need ${job.required_shifts} total shifts completed to apply for this job! (You have ${economy.job_shifts_completed})`).catch(() => {});
      return;
    }

    await run(`UPDATE user_economy SET job_id=?, job_weekly_shifts=0, job_week_reset=? WHERE guild_id=? AND user_id=?`,
      [job.id, Date.now(), message.guild.id, message.author.id]);

    await message.reply(`✅ Congratulations! You got the job as **${job.name}**! Start working with the \`work\` command.`).catch(() => {});
    return;
  }

  if (subcommand === "quit") {
    if (!economy.job_id) {
      await message.reply("❌ You don't have a job!").catch(() => {});
      return;
    }

    await run(`UPDATE user_economy SET job_id=NULL, job_weekly_shifts=0 WHERE guild_id=? AND user_id=?`, [message.guild.id, message.author.id]);
    await message.reply("✅ You quit your job.").catch(() => {});
    return;
  }

  if (subcommand === "info") {
    if (!economy.job_id) {
      await message.reply("❌ You don't have a job! Use `job list` to see available jobs.").catch(() => {});
      return;
    }

    const job = await get(`SELECT * FROM economy_jobs WHERE id=?`, [economy.job_id]);
    const weekInMs = 604800000;
    const weekProgress = Date.now() - economy.job_week_reset;
    const daysLeft = Math.max(0, Math.floor((weekInMs - weekProgress) / 86400000));

    const embed = {
      color: 0x3498db,
      title: `💼 Your Job: ${job.name}`,
      fields: [
        { name: "💰 Pay Range", value: `${job.min_pay}-${job.max_pay} ${economySettings.currency_name}`, inline: true },
        { name: "📊 Total Shifts", value: `${economy.job_shifts_completed}`, inline: true },
        { name: "⏰ This Week", value: `${economy.job_weekly_shifts}/${job.weekly_shifts_required}`, inline: true },
        { name: "📅 Week Resets In", value: `${daysLeft} days`, inline: true }
      ],
      footer: { text: `Use the work command to complete a shift!` }
    };

    await message.reply({ embeds: [embed] }).catch(() => {});
    return;
  }

  await message.reply("❌ Usage: `job list`, `job apply <name>`, `job quit`, or `job info`").catch(() => {});
}

async function cmdWork(message) {
  const economySettings = await get(`SELECT * FROM economy_settings WHERE guild_id=?`, [message.guild.id]);
  if (!economySettings || !economySettings.enabled) {
    await message.reply("❌ Economy system is disabled on this server.").catch(() => {});
    return;
  }

  await run(`INSERT INTO user_economy (guild_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING`, [message.guild.id, message.author.id]);
  const economy = await get(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`, [message.guild.id, message.author.id]);

  if (!economy.job_id) {
    await message.reply("❌ You don't have a job! Use `job apply <name>` to get one.").catch(() => {});
    return;
  }

  const now = Date.now();
  const shiftCooldown = 3600000; // 1 hour
  if (economy.job_last_shift && (now - economy.job_last_shift) < shiftCooldown) {
    const timeLeft = shiftCooldown - (now - economy.job_last_shift);
    const minutes = Math.floor(timeLeft / 60000);
    await message.reply(`❌ You're tired! Rest for ${minutes} more minutes before your next shift.`).catch(() => {});
    return;
  }

  const job = await get(`SELECT * FROM economy_jobs WHERE id=?`, [economy.job_id]);

  // Check weekly requirement and reset
  const weekInMs = 604800000;
  if (now - economy.job_week_reset > weekInMs) {
    if (economy.job_weekly_shifts < job.weekly_shifts_required) {
      // Fired for not meeting weekly requirement
      await run(`UPDATE user_economy SET job_id=NULL, job_weekly_shifts=0, job_week_reset=NULL WHERE guild_id=? AND user_id=?`,
        [message.guild.id, message.author.id]);
      await message.reply(`❌ You were fired from **${job.name}** for not completing ${job.weekly_shifts_required} shifts last week!`).catch(() => {});
      return;
    }
    // Reset week
    await run(`UPDATE user_economy SET job_weekly_shifts=0, job_week_reset=? WHERE guild_id=? AND user_id=?`,
      [now, message.guild.id, message.author.id]);
  }

  // Mini-game selection
  const games = ["typing", "emoji", "math"];
  const game = games[Math.floor(Math.random() * games.length)];

  if (game === "typing") {
    const words = ["javascript", "programming", "computer", "keyboard", "algorithm", "database", "function", "variable", "discord", "economy"];
    const word = words[Math.floor(Math.random() * words.length)];
    
    await message.reply(`⌨️ **Typing Challenge!**\nType the following word within 15 seconds:\n\`\`\`${word}\`\`\``).catch(() => {});

    const filter = m => m.author.id === message.author.id && m.content.toLowerCase() === word.toLowerCase();
    const collected = await message.channel.awaitMessages({ filter, max: 1, time: 15000, errors: ["time"] }).catch(() => null);

    if (!collected || collected.size === 0) {
      await message.reply("❌ Time's up! You failed the shift.").catch(() => {});
      return;
    }
  } else if (game === "emoji") {
    const emojis = ["😀", "😎", "🚀", "💎", "🔥", "⚡", "🎯", "🎮", "🎨", "🎭"];
    const target = emojis[Math.floor(Math.random() * emojis.length)];
    const options = [target];
    while (options.length < 5) {
      const random = emojis[Math.floor(Math.random() * emojis.length)];
      if (!options.includes(random)) options.push(random);
    }
    options.sort(() => Math.random() - 0.5);

    await message.reply(`🎯 **Emoji Challenge!**\nFind and type the **${target}** emoji within 15 seconds:\n${options.join(" ")}`).catch(() => {});

    const filter = m => m.author.id === message.author.id && m.content.includes(target);
    const collected = await message.channel.awaitMessages({ filter, max: 1, time: 15000, errors: ["time"] }).catch(() => null);

    if (!collected || collected.size === 0) {
      await message.reply("❌ Time's up! You failed the shift.").catch(() => {});
      return;
    }
  } else if (game === "math") {
    const num1 = Math.floor(Math.random() * 20) + 1;
    const num2 = Math.floor(Math.random() * 20) + 1;
    const operations = ["+", "-", "*"];
    const op = operations[Math.floor(Math.random() * operations.length)];
    let answer;
    if (op === "+") answer = num1 + num2;
    else if (op === "-") answer = num1 - num2;
    else answer = num1 * num2;

    await message.reply(`🔢 **Math Challenge!**\nSolve within 15 seconds:\n\`\`\`${num1} ${op} ${num2} = ?\`\`\``).catch(() => {});

    const filter = m => m.author.id === message.author.id && parseInt(m.content) === answer;
    const collected = await message.channel.awaitMessages({ filter, max: 1, time: 15000, errors: ["time"] }).catch(() => null);

    if (!collected || collected.size === 0) {
      await message.reply("❌ Time's up! You failed the shift.").catch(() => {});
      return;
    }
  }

  // Success!
  const pay = Math.floor(job.min_pay + Math.random() * (job.max_pay - job.min_pay));
  await run(`UPDATE user_economy SET balance=?, job_last_shift=?, job_shifts_completed=?, job_weekly_shifts=? WHERE guild_id=? AND user_id=?`,
    [economy.balance + pay, now, economy.job_shifts_completed + 1, economy.job_weekly_shifts + 1, message.guild.id, message.author.id]);
  await run(`INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
    [message.guild.id, message.author.id, "work", pay, `Worked as ${job.name}`]);

  await message.reply(`✅ Shift complete! You earned ${pay} ${economySettings.currency_name}. (${economy.job_weekly_shifts + 1}/${job.weekly_shifts_required} this week)`).catch(() => {});
}

// ==================== ECONOMY: SHOP ====================
async function cmdShop(message) {
  const economySettings = await get(`SELECT * FROM economy_settings WHERE guild_id=?`, [message.guild.id]);
  if (!economySettings || !economySettings.enabled) {
    await message.reply("❌ Economy system is disabled on this server.").catch(() => {});
    return;
  }

  const items = await all(`SELECT * FROM economy_shop_items WHERE guild_id=? ORDER BY price ASC`, [message.guild.id]);
  if (items.length === 0) {
    await message.reply("❌ The shop is empty! Ask an admin to add items.").catch(() => {});
    return;
  }

  const embed = {
    color: 0x9b59b6,
    title: "🛒 Shop",
    description: items.map((item, i) => 
      `**${i + 1}. ${item.name}** - ${item.price} ${economySettings.currency_name}\n${item.description}`
    ).join("\n\n"),
    footer: { text: `Use buy <item number> to purchase!` }
  };

  await message.reply({ embeds: [embed] }).catch(() => {});
}

async function cmdBuy(message, args) {
  const economySettings = await get(`SELECT * FROM economy_settings WHERE guild_id=?`, [message.guild.id]);
  if (!economySettings || !economySettings.enabled) {
    await message.reply("❌ Economy system is disabled on this server.").catch(() => {});
    return;
  }

  if (!args[0]) {
    // Show shop instead
    await cmdShop(message);
    return;
  }

  const itemIndex = parseInt(args[0]) - 1;
  if (isNaN(itemIndex)) {
    await message.reply("❌ Please specify an item number from the shop.").catch(() => {});
    return;
  }

  const items = await all(`SELECT * FROM economy_shop_items WHERE guild_id=? ORDER BY price ASC`, [message.guild.id]);
  const item = items[itemIndex];
  if (!item) {
    await message.reply("❌ Invalid item number!").catch(() => {});
    return;
  }

  await run(`INSERT INTO user_economy (guild_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING`, [message.guild.id, message.author.id]);
  const economy = await get(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`, [message.guild.id, message.author.id]);

  if (economy.balance < item.price) {
    await message.reply(`❌ You need ${item.price} ${economySettings.currency_name} to buy this! You have ${economy.balance}.`).catch(() => {});
    return;
  }

  // Check if already owned (for single-use items)
  if (item.item_type === "single") {
    const owned = await get(`SELECT * FROM user_inventory WHERE guild_id=? AND user_id=? AND item_id=?`,
      [message.guild.id, message.author.id, item.item_id]);
    if (owned && owned.quantity > 0) {
      await message.reply("❌ You already own this item!").catch(() => {});
      return;
    }
  }

  await run(`UPDATE user_economy SET balance=? WHERE guild_id=? AND user_id=?`, [economy.balance - item.price, message.guild.id, message.author.id]);
  await run(`INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
    [message.guild.id, message.author.id, "shop_purchase", -item.price, `Bought ${item.name}`]);
  
  await run(`
    INSERT INTO user_inventory (guild_id, user_id, item_id, quantity)
    VALUES (?, ?, ?, 1)
    ON CONFLICT (guild_id, user_id, item_id)
    DO UPDATE SET quantity = user_inventory.quantity + 1
  `, [message.guild.id, message.author.id, item.item_id]);

  await message.reply(`✅ You bought **${item.name}** for ${item.price} ${economySettings.currency_name}!`).catch(() => {});
}

async function cmdInventory(message) {
  const economySettings = await get(`SELECT * FROM economy_settings WHERE guild_id=?`, [message.guild.id]);
  if (!economySettings || !economySettings.enabled) {
    await message.reply("❌ Economy system is disabled on this server.").catch(() => {});
    return;
  }

  const items = await all(`
    SELECT ui.item_id, ui.quantity, si.name, si.description
    FROM user_inventory ui
    JOIN economy_shop_items si ON ui.item_id = si.item_id AND ui.guild_id = si.guild_id
    WHERE ui.guild_id=? AND ui.user_id=? AND ui.quantity > 0
  `, [message.guild.id, message.author.id]);

  if (items.length === 0) {
    await message.reply("🎒 Your inventory is empty!").catch(() => {});
    return;
  }

  const embed = {
    color: 0x9b59b6,
    title: "🎒 Your Inventory",
    description: items.map(item => 
      `**${item.name}** x${item.quantity}\n${item.description}`
    ).join("\n\n")
  };

  await message.reply({ embeds: [embed] }).catch(() => {});
}

// ─────────────────────────────────────────────────────
// Reminder Commands
// ─────────────────────────────────────────────────────

async function cmdRemindMe(message, args) {
  if (args.length < 2) {
    await message.reply("Usage: `!remindme <duration> <message>`\nExample: `!remindme 1h Take out the trash`").catch(() => {});
    return;
  }

  const durationMs = parseDurationMs(args[0]);
  if (!durationMs) {
    await message.reply("❌ Invalid duration. Use format like: 1m, 1h, 1d").catch(() => {});
    return;
  }

  const reminderText = args.slice(1).join(" ");
  const remindAt = Date.now() + durationMs;

  await run(`
    INSERT INTO reminders (user_id, guild_id, channel_id, reminder_text, remind_at)
    VALUES (?, ?, ?, ?, ?)
  `, [message.author.id, message.guild.id, message.channel.id, reminderText, remindAt]);

  await message.reply(`✅ I'll remind you in ${args[0]}: "${reminderText}"`).catch(() => {});
}

async function cmdReminders(message, args) {
  const limitRaw = Number.parseInt(String(args[0] || "10"), 10);
  const limit = Math.max(1, Math.min(25, Number.isFinite(limitRaw) ? limitRaw : 10));
  const now = Date.now();

  const reminders = await all(
    `SELECT id, reminder_text, remind_at, created_at
     FROM reminders
     WHERE user_id=? AND guild_id=? AND completed=0
     ORDER BY remind_at ASC
     LIMIT ?`,
    [message.author.id, message.guild.id, limit]
  );

  if (!reminders.length) {
    await message.reply("You have no pending reminders in this server.").catch(() => {});
    return;
  }

  const lines = reminders.map((reminder) => {
    const dueAt = Number(reminder.remind_at || 0);
    const dueTs = dueAt > 0 ? Math.floor(dueAt / 1000) : null;
    const status = dueAt > now
      ? (dueTs ? `<t:${dueTs}:R>` : "in the future")
      : "due now";
    const createdAt = Number(reminder.created_at || 0);
    const createdTs = createdAt > 0 ? Math.floor(createdAt / 1000) : null;
    const createdText = createdTs ? `<t:${createdTs}:R>` : "unknown";
    const text = String(reminder.reminder_text || "").replace(/\n+/g, " ").slice(0, 120);
    return `**#${reminder.id}** • ${status} • created ${createdText}\n${text || "(no text)"}`;
  });

  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle("⏰ Your Pending Reminders")
    .setDescription(lines.join("\n\n"))
    .setFooter({ text: `Use !remindcancel <id> to cancel one.` })
    .setTimestamp();

  await message.reply({ embeds: [embed] }).catch(() => {});
}

async function cmdRemindCancel(message, args) {
  const idRaw = String(args[0] || "").trim();
  const reminderId = Number.parseInt(idRaw, 10);
  if (!Number.isFinite(reminderId) || reminderId <= 0) {
    await message.reply("Usage: `!remindcancel <id>`\nFind IDs with `!reminders`.").catch(() => {});
    return;
  }

  const reminder = await get(
    `SELECT id, reminder_text, remind_at
     FROM reminders
     WHERE id=? AND user_id=? AND guild_id=? AND completed=0`,
    [reminderId, message.author.id, message.guild.id]
  );

  if (!reminder) {
    await message.reply("❌ Reminder not found (or already completed/canceled). Use `!reminders` to check active IDs.").catch(() => {});
    return;
  }

  await run(
    `UPDATE reminders
     SET completed=1
     WHERE id=? AND user_id=? AND guild_id=? AND completed=0`,
    [reminderId, message.author.id, message.guild.id]
  );

  const preview = String(reminder.reminder_text || "").replace(/\n+/g, " ").slice(0, 140);
  await message.reply(`✅ Canceled reminder #${reminderId}${preview ? `: "${preview}"` : ""}`).catch(() => {});
}

async function cmdRemindClear(message) {
  const pending = await get(
    `SELECT COUNT(*) AS count
     FROM reminders
     WHERE user_id=? AND guild_id=? AND completed=0`,
    [message.author.id, message.guild.id]
  );

  const count = Number(pending?.count || 0);
  if (count <= 0) {
    await message.reply("You have no pending reminders to clear.").catch(() => {});
    return;
  }

  await run(
    `UPDATE reminders
     SET completed=1
     WHERE user_id=? AND guild_id=? AND completed=0`,
    [message.author.id, message.guild.id]
  );

  await message.reply(`✅ Cleared ${count} pending reminder${count === 1 ? "" : "s"}.`).catch(() => {});
}

async function cmdRemindSnooze(message, args) {
  const reminderId = Number.parseInt(String(args[0] || "").trim(), 10);
  const durationText = String(args[1] || "").trim();
  if (!Number.isFinite(reminderId) || reminderId <= 0 || !durationText) {
    await message.reply("Usage: `!remindsnooze <id> <duration>`\nExample: `!remindsnooze 42 30m`").catch(() => {});
    return;
  }

  const durationMs = parseDurationMs(durationText);
  if (!durationMs) {
    await message.reply("❌ Invalid duration. Use format like: 10m, 1h, 1d").catch(() => {});
    return;
  }

  const reminder = await get(
    `SELECT id
     FROM reminders
     WHERE id=? AND user_id=? AND guild_id=? AND completed=0`,
    [reminderId, message.author.id, message.guild.id]
  );

  if (!reminder) {
    await message.reply("❌ Active reminder not found for that ID.").catch(() => {});
    return;
  }

  const newTime = Date.now() + durationMs;
  await run(
    `UPDATE reminders
     SET remind_at=?
     WHERE id=? AND user_id=? AND guild_id=? AND completed=0`,
    [newTime, reminderId, message.author.id, message.guild.id]
  );

  const ts = Math.floor(newTime / 1000);
  await message.reply(`✅ Snoozed reminder #${reminderId} to <t:${ts}:R>.`).catch(() => {});
}

// ─────────────────────────────────────────────────────
// Birthday Commands
// ─────────────────────────────────────────────────────

async function cmdBirthday(message, args) {
  const subcommand = args[0]?.toLowerCase();

  if (subcommand === "set") {
    // !birthday set <MM/DD> or <MM/DD/YYYY>
    if (!args[1]) {
      await message.reply("Usage: `!birthday set <MM/DD>` or `!birthday set <MM/DD/YYYY>`\nExample: `!birthday set 05/15`").catch(() => {});
      return;
    }

    const parts = args[1].split("/");
    if (parts.length < 2 || parts.length > 3) {
      await message.reply("❌ Invalid date format. Use MM/DD or MM/DD/YYYY").catch(() => {});
      return;
    }

    const month = Number.parseInt(parts[0], 10);
    const day = Number.parseInt(parts[1], 10);
    const year = parts[2] ? Number.parseInt(parts[2], 10) : null;

    if (!Number.isFinite(month) || month < 1 || month > 12 || !Number.isFinite(day) || day < 1 || day > 31) {
      await message.reply("❌ Invalid date.").catch(() => {});
      return;
    }

    await run(`
      INSERT INTO birthdays (guild_id, user_id, birth_month, birth_day, birth_year)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (guild_id, user_id) DO UPDATE SET birth_month=EXCLUDED.birth_month, birth_day=EXCLUDED.birth_day, birth_year=EXCLUDED.birth_year
    `, [message.guild.id, message.author.id, month, day, year]);

    await message.reply(`🎂 Your birthday has been set to ${month}/${day}${year ? `/${year}` : ""}!`).catch(() => {});
  } else if (subcommand === "remove") {
    await run(`DELETE FROM birthdays WHERE guild_id=? AND user_id=?`, [message.guild.id, message.author.id]);
    await message.reply("✅ Your birthday has been removed.").catch(() => {});
  } else if (subcommand === "list") {
    const birthdays = await all(`SELECT * FROM birthdays WHERE guild_id=? ORDER BY birth_month, birth_day`, [message.guild.id]);
    
    if (birthdays.length === 0) {
      await message.reply("No birthdays registered yet!").catch(() => {});
      return;
    }

    const embed = {
      color: 0xe91e63,
      title: "🎂 Birthday List",
      description: birthdays.map(b => `<@${b.user_id}>: ${b.birth_month}/${b.birth_day}${b.birth_year ? `/${b.birth_year}` : ""}`).join("\n"),
      footer: { text: `${birthdays.length} birthday${birthdays.length !== 1 ? "s" : ""} registered` }
    };

    await message.reply({ embeds: [embed] }).catch(() => {});
  } else {
    await message.reply("Usage: `!birthday <set|remove|list> ...`").catch(() => {});
  }
}

// ─────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────

async function handleCommands(message) {
  if (!message || !message.content) return false;

  if (!message.guild) return false;
  
  // List of economy commands that can use the economy prefix
  const economyCommands = ["balance", "bal", "daily", "weekly", "pay", "baltop", "richest",
    "deposit", "dep", "withdraw", "with", "rob", "bankrob", "bank-rob", "bankrobbery", "slots", "slot", "coinflip", "cf", 
    "dice", "roll", "job", "jobs", "work", "shift", "shop", "store", "buy", "purchase", 
    "inventory", "inv", "fish", "fishing", "dig", "digging", "phone", "call"];
  
  // Try economy prefix first for economy commands
  const economySettings = await get(`SELECT * FROM economy_settings WHERE guild_id=?`, [message.guild.id]);
  if (economySettings?.enabled && economySettings.economy_prefix) {
    const economyPrefix = economySettings.economy_prefix;
    const economyParsed = parseCommand(message.content, [economyPrefix]);
    if (economyParsed && economyCommands.includes(economyParsed.cmd)) {
      return await executeCommand(message, economyParsed.cmd, economyParsed.args, economyParsed.prefix);
    }
  }
  
  // List of moderation commands that use the configurable prefix
  const modCommands = ["ban", "unban", "kick", "mute", "unmute", "purge", "warn", "warnings", "clearwarns", "clearwarn", "modlogs", "auditsearch", "lock", "unlock", "slowmode", "nick", "role", "softban"];
  
  // Try moderation prefix first for mod commands
  const modPrefixes = await getModPrefixes(message);
  const modParsed = parseCommand(message.content, modPrefixes);
  if (modParsed && modCommands.includes(modParsed.cmd)) {
    return await executeCommand(message, modParsed.cmd, modParsed.args, modParsed.prefix);
  }
  
  // Try regular prefix for all other commands
  const activePrefixes = await getActivePrefixes(message);
  const parsed = parseCommand(message.content, activePrefixes);
  if (!parsed) return false;

  return await executeCommand(message, parsed.cmd, parsed.args, parsed.prefix);
}

async function executeCommand(message, cmd, args, prefix) {
  if (!message.guild) return false;

  // Initialize default shop items for economy-enabled guilds
  if ((cmd === "shop" || cmd === "store" || cmd === "buy" || cmd === "purchase" || cmd === "balance" || 
       cmd === "fish" || cmd === "dig" || cmd === "bankrob" || cmd === "phone") && message.author.id !== client?.user?.id) {
    const economySettings = await get(`SELECT * FROM economy_settings WHERE guild_id=?`, [message.guild.id]);
    if (economySettings?.enabled) {
      await ensureDefaultShopItems(message.guild.id).catch(() => {});
    }
  }

  if (cmd === "moist-lieutenant") {
    const publicUrl = process.env.BOT_PUBLIC_URL || process.env.DISCORD_CALLBACK_URL?.replace('/auth/discord/callback', '') || "http://localhost:8080";
    await message.reply(`🐸 **Moist Lieutenant Dashboard**\n\nView the leaderboard and customize your rank card: ${publicUrl}`).catch(() => {});
    return true;
  }

  console.log("[CMD]", prefix, cmd, args.join(" "));

  if (cmd === "help") {
    await message.reply("Use `!commands`, `!mod-commands`, or `!admin-commands`.").catch(() => {});
    return true;
  }

  if (cmd === "commands") {
    await cmdPublicCommands(message);
    return true;
  }

  if (cmd === "mod-commands") {
    await cmdModCommands(message);
    return true;
  }

  if (cmd === "admin-commands") {
    await cmdAdminCommands(message);
    return true;
  }

  if (cmd === "mod-role") {
    await cmdSetModRole(message, args);
    return true;
  }

  if (cmd === "prefix") {
    await cmdPrefix(message, args);
    return true;
  }

  if (cmd === "rank") {
    await cmdRank(message, args);
    return true;
  }

  if (cmd === "leaderboard" || cmd === "lb") {
    await cmdLeaderboard(message, args);
    return true;
  }

  if (cmd === "xp") {
    await cmdXp(message, args);
    return true;
  }

  if (cmd === "recalc-levels" || cmd === "recalclevels") {
    await cmdRecalcLevels(message);
    return true;
  }

  if (cmd === "sync-roles" || cmd === "syncroles") {
    await cmdSyncRoles(message);
    return true;
  }

  if (cmd === "reactionrole") {
    await cmdReactionRole(message, args);
    return true;
  }

  if (cmd === "voice-limit") {
    await cmdVoiceLimit(message, args);
    return true;
  }

  if (cmd === "voice-lock") {
    await cmdVoiceLock(message);
    return true;
  }

  if (cmd === "voice-unlock") {
    await cmdVoiceUnlock(message);
    return true;
  }

  if (cmd === "voice-rename") {
    await cmdVoiceRename(message, args);
    return true;
  }

  if (cmd === "voice-ban") {
    await cmdVoiceBan(message, args);
    return true;
  }

  // Fun commands
  if (cmd === "8ball") {
    await cmd8Ball(message, args);
    return true;
  }

  if (cmd === "flip") {
    await cmdCoinFlip(message);
    return true;
  }

  if (cmd === "petpet") {
    await cmdPetPet(message, args);
    return true;
  }

  if (cmd === "poll") {
    await cmdAdvancedPoll(message, args);
    return true;
  }

  if (cmd === "choose") {
    await cmdChoose(message, args);
    return true;
  }

  if (cmd === "suggest") {
    await cmdSuggest(message, args);
    return true;
  }

  if (cmd === "suggestions") {
    await cmdSuggestions(message, args);
    return true;
  }

  if (cmd === "suggestion-status" || cmd === "suggestionstatus") {
    await cmdSuggestionStatus(message, args);
    return true;
  }

  if (cmd === "suggestion-withdraw" || cmd === "suggestionwithdraw") {
    await cmdSuggestionWithdraw(message, args);
    return true;
  }

  if (cmd === "member-count" || cmd === "membercount") {
    await cmdMemberCount(message, args);
    return true;
  }

  if (cmd === "giveaway") {
    await cmdGiveaway(message, args);
    return true;
  }

  if (cmd === "balance" || cmd === "bal") {
    await cmdBalance(message, args);
    return true;
  }

  if (cmd === "daily") {
    await cmdDaily(message);
    return true;
  }

  if (cmd === "weekly") {
    await cmdWeekly(message);
    return true;
  }

  if (cmd === "pay") {
    await cmdPay(message, args);
    return true;
  }

  if (cmd === "baltop" || cmd === "richest") {
    await cmdEcoLeaderboard(message);
    return true;
  }

  if (cmd === "deposit" || cmd === "dep") {
    await cmdDeposit(message, args);
    return true;
  }

  if (cmd === "withdraw" || cmd === "with") {
    await cmdWithdraw(message, args);
    return true;
  }

  if (cmd === "rob") {
    await cmdRob(message, args);
    return true;
  }

  if (cmd === "bankrob" || cmd === "bank-rob" || cmd === "bankrobbery") {
    const economySettings = await get(`SELECT * FROM economy_settings WHERE guild_id=?`, [message.guild.id]);
    const ecoPrefix = economySettings?.economy_prefix || "$";
    const util = { economySettings, ecoPrefix, run, get };
    await cmdRobBank(message, args, util);
    return true;
  }

  if (cmd === "fish" || cmd === "fishing") {
    const economySettings = await get(`SELECT * FROM economy_settings WHERE guild_id=?`, [message.guild.id]);
    const ecoPrefix = economySettings?.economy_prefix || "$";
    const util = { economySettings, ecoPrefix, run, get };
    await cmdFish(message, args, util);
    return true;
  }

  if (cmd === "dig" || cmd === "digging") {
    const economySettings = await get(`SELECT * FROM economy_settings WHERE guild_id=?`, [message.guild.id]);
    const ecoPrefix = economySettings?.economy_prefix || "$";
    const util = { economySettings, ecoPrefix, run, get };
    await cmdDig(message, args, util);
    return true;
  }

  if (cmd === "phone" || cmd === "call") {
    const economySettings = await get(`SELECT * FROM economy_settings WHERE guild_id=?`, [message.guild.id]);
    const ecoPrefix = economySettings?.economy_prefix || "$";
    const util = { economySettings, ecoPrefix, run, get };
    await cmdPhone(message, args, util);
    return true;
  }

  if (cmd === "adventure" || cmd === "story") {
    const economySettings = await get(`SELECT * FROM economy_settings WHERE guild_id=?`, [message.guild.id]);
    const ecoPrefix = economySettings?.economy_prefix || "$";
    const util = { economySettings, ecoPrefix, run, get };
    await cmdAdventure(message, args, util);
    return true;
  }

  if (cmd === "explore" || cmd === "swamp") {
    const economySettings = await get(`SELECT * FROM economy_settings WHERE guild_id=?`, [message.guild.id]);
    const ecoPrefix = economySettings?.economy_prefix || "$";
    const util = { economySettings, ecoPrefix, run, get };
    await cmdExplore(message, args, util);
    return true;
  }

  if (cmd === "slots" || cmd === "slot") {
    await cmdSlots(message, args);
    return true;
  }

  if (cmd === "coinflip" || cmd === "cf") {
    await cmdCoinflip(message, args);
    return true;
  }

  if (cmd === "dice" || cmd === "roll") {
    await cmdDice(message, args);
    return true;
  }

  if (cmd === "job" || cmd === "jobs") {
    await cmdJob(message, args);
    return true;
  }

  if (cmd === "work" || cmd === "shift") {
    await cmdWork(message);
    return true;
  }

  if (cmd === "shop" || cmd === "store") {
    await cmdShop(message);
    return true;
  }

  if (cmd === "buy" || cmd === "purchase") {
    await cmdBuy(message, args);
    return true;
  }

  if (cmd === "inventory" || cmd === "inv") {
    await cmdInventory(message);
    return true;
  }

  if (cmd === "remindme" || cmd === "remind") {
    await cmdRemindMe(message, args);
    return true;
  }

  if (cmd === "reminders" || cmd === "reminderlist") {
    await cmdReminders(message, args);
    return true;
  }

  if (cmd === "remindcancel" || cmd === "cancelreminder") {
    await cmdRemindCancel(message, args);
    return true;
  }

  if (cmd === "remindclear" || cmd === "clearreminders") {
    await cmdRemindClear(message);
    return true;
  }

  if (cmd === "remindsnooze" || cmd === "snoozereminder") {
    await cmdRemindSnooze(message, args);
    return true;
  }

  if (cmd === "birthday" || cmd === "bday") {
    await cmdBirthday(message, args);
    return true;
  }

  if (cmd === "ban") {
    await cmdBan(message, args);
    return true;
  }

  if (cmd === "tempban") {
    await cmdTempBan(message, args);
    return true;
  }

  if (cmd === "unban") {
    await cmdUnban(message, args);
    return true;
  }

  if (cmd === "kick") {
    await cmdKick(message, args);
    return true;
  }

  if (cmd === "mute") {
    await cmdMute(message, args);
    return true;
  }

  if (cmd === "unmute") {
    await cmdUnmute(message, args);
    return true;
  }

  if (cmd === "purge") {
    await cmdPurge(message, args);
    return true;
  }

  if (cmd === "warn") {
    await cmdWarn(message, args);
    return true;
  }

  if (cmd === "warnings") {
    await cmdWarnings(message, args);
    return true;
  }

  if (cmd === "clearwarns") {
    await cmdClearWarns(message, args);
    return true;
  }

  if (cmd === "clearwarn") {
    await cmdClearWarn(message, args);
    return true;
  }

  if (cmd === "modlogs") {
    await cmdModLogs(message, args);
    return true;
  }

  if (cmd === "auditsearch") {
    await cmdAuditSearch(message, args);
    return true;
  }

  if (cmd === "lock") {
    await cmdLock(message);
    return true;
  }

  if (cmd === "unlock") {
    await cmdUnlock(message);
    return true;
  }

  if (cmd === "slowmode") {
    await cmdSlowmode(message, args);
    return true;
  }

  if (cmd === "nick") {
    await cmdNick(message, args);
    return true;
  }

  if (cmd === "role") {
    await cmdRole(message, args);
    return true;
  }

  if (cmd === "softban") {
    await cmdSoftban(message, args);
    return true;
  }

  // Check for custom commands
  const customCmd = await get(
    `SELECT * FROM custom_commands WHERE guild_id=? AND command_name=?`,
    [message.guild.id, cmd]
  );

  function replaceCustomCommandPlaceholders(text, message, targetMember = null) {
    if (!text || typeof text !== 'string') return text;
    const author = message.author;
    const member = message.member;
    let result = text
      .replace(/{user}/gi, `<@${author.id}>`)
      .replace(/{username}/gi, author.username)
      .replace(/{userid}/gi, author.id)
      .replace(/{usertag}/gi, author.tag)
      .replace(/{userdisplayname}/gi, member?.displayName || author.username)
      .replace(/{servername}/gi, message.guild?.name || 'Unknown')
      .replace(/{serverid}/gi, message.guild?.id || 'Unknown')
      .replace(/{channelname}/gi, message.channel?.name || 'Unknown')
      .replace(/{channelid}/gi, message.channel?.id || 'Unknown');
    if (targetMember) {
      result = result
        .replace(/{target}/gi, `<@${targetMember.id}>`)
        .replace(/{targetname}/gi, targetMember.user?.username || 'Unknown')
        .replace(/{targetid}/gi, targetMember.id)
        .replace(/{targettag}/gi, targetMember.user?.tag || 'Unknown')
        .replace(/{targetdisplayname}/gi, targetMember.displayName || targetMember.user?.username || 'Unknown');
    } else {
      result = result
        .replace(/{target}/gi, '')
        .replace(/{targetname}/gi, '')
        .replace(/{targetid}/gi, '')
        .replace(/{targettag}/gi, '')
        .replace(/{targetdisplayname}/gi, '');
    }
    return result;
  }

  function getCustomCommandTarget(message) {
    if (message.mentions?.members?.size > 0) {
      return message.mentions.members.first();
    }
    return null;
  }
  
  if (customCmd) {
    try {
      const targetMember = getCustomCommandTarget(message);
      let responses = JSON.parse(customCmd.responses || "[]");
      let targetMode = customCmd.target_mode || "none";

      if (!Array.isArray(responses)) {
        targetMode = responses.target_mode || targetMode;
        responses = responses.responses || [];
      }

      // Backward compatibility for old schema rows.
      if (!responses.length && customCmd.response_text) {
        let legacyGifs = [];
        try {
          legacyGifs = JSON.parse(customCmd.gifs || "[]");
          if (!Array.isArray(legacyGifs)) legacyGifs = [];
        } catch {
          legacyGifs = [];
        }
        responses = [{ text: customCmd.response_text, gifs: legacyGifs }];
      }

      if (responses.length > 0) {
        if (targetMode === "required" && !targetMember) {
          await message.reply({ content: "This command requires a target. Mention someone, for example !hug @user.", allowedMentions: { parse: [] } }).catch(() => {});
          return true;
        }

        const selectedResponse = responses[Math.floor(Math.random() * responses.length)] || {};
        const responseText = replaceCustomCommandPlaceholders(selectedResponse.text || "", message, targetMode === "none" ? null : targetMember);

        const embed = new EmbedBuilder()
          .setColor(0x7bc96f)
          .setDescription(responseText || " ")
          .setTimestamp();

        const replyPayload = { embeds: [embed] };
        if (Array.isArray(selectedResponse.gifs) && selectedResponse.gifs.length > 0) {
          const disabledGifSet = new Set(
            (Array.isArray(selectedResponse.disabled_gifs) ? selectedResponse.disabled_gifs : [])
              .map((item) => String(item || "").trim())
              .filter(Boolean)
          );
          const selectableGifs = selectedResponse.gifs
            .map((item) => String(item || "").trim())
            .filter((item) => item && !disabledGifSet.has(item));

          const gifPathValue = pickRandomUsableImage(selectableGifs);
          const isDbMedia = gifPathValue.startsWith("dbmedia:");
          const isUploaded = gifPathValue.startsWith("/uploads/") || gifPathValue.startsWith("uploads/");

          if (gifPathValue && isDbMedia) {
            const storageKey = gifPathValue.slice("dbmedia:".length).trim();
            const media = storageKey
              ? await get(`SELECT mime_type, data_base64 FROM uploaded_media WHERE storage_key=?`, [storageKey])
              : null;
            if (media?.data_base64) {
              const ext = extensionFromMime(media.mime_type);
              const fileName = `${storageKey}.${ext}`;
              const attachment = new AttachmentBuilder(Buffer.from(String(media.data_base64), "base64"), { name: fileName });
              embed.setImage(`attachment://${fileName}`);
              replyPayload.files = [attachment];
            }
          } else if (gifPathValue && isUploaded) {
            const relativePath = gifPathValue.replace(/^\/+/, "");
            const absolutePath = path.join(process.cwd(), relativePath);
            if (fs.existsSync(absolutePath)) {
              const fileName = `${path.basename(absolutePath)}.gif`;
              const attachment = new AttachmentBuilder(absolutePath, { name: fileName });
              embed.setImage(`attachment://${fileName}`);
              replyPayload.files = [attachment];
            }
          } else if (gifPathValue) {
            embed.setImage(gifPathValue);
          }
        }

        await message.reply(replyPayload).catch(() => {});
        return true;
      }
    } catch (e) {
      console.error("Error parsing custom command responses:", e);
    }
  }

  return false;
}

function slashPerm(flag) {
  return String(BigInt(flag));
}

function buildSlashCommands() {
  return [
    { name: "commands", description: "Public commands list" },
    { name: "mod-commands", description: "Moderation commands list", default_member_permissions: slashPerm(DEFAULT_MOD_COMMAND_PERMISSION) },
    { name: "admin-commands", description: "Admin commands list", default_member_permissions: slashPerm(PermissionsBitField.Flags.Administrator) },
    { name: "mod-role", description: "Set mod role", default_member_permissions: slashPerm(PermissionsBitField.Flags.Administrator), options: [{ type: 8, name: "role", description: "Role", required: true }] },
    { name: "prefix", description: "Set command prefix", default_member_permissions: slashPerm(PermissionsBitField.Flags.Administrator), options: [{ type: 3, name: "value", description: "New prefix (1-3 chars)", required: true }] },
    { name: "moist-lieutenant", description: "Get dashboard URL" },
    { name: "rank", description: "Show rank", options: [{ type: 6, name: "user", description: "User", required: false }] },
    { name: "leaderboard", description: "Show leaderboard", options: [{ type: 4, name: "page", description: "Page", required: false }] },
    { name: "xp", description: "Manage XP", default_member_permissions: slashPerm(PermissionsBitField.Flags.ManageGuild), options: [{ type: 3, name: "action", description: "add or set", required: true, choices: [{ name: "add", value: "add" }, { name: "set", value: "set" }] }, { type: 6, name: "user", description: "User", required: true }, { type: 4, name: "amount", description: "Amount", required: true }] },
    { name: "recalc-levels", description: "Recalculate levels", default_member_permissions: slashPerm(PermissionsBitField.Flags.ManageGuild) },
    { name: "sync-roles", description: "Sync level roles", default_member_permissions: slashPerm(PermissionsBitField.Flags.ManageGuild) },
    { name: "voice-limit", description: "Set private voice limit", options: [{ type: 4, name: "limit", description: "0-99", required: true }] },
    { name: "voice-lock", description: "Lock private voice" },
    { name: "voice-unlock", description: "Unlock private voice" },
    { name: "voice-rename", description: "Rename private voice", options: [{ type: 3, name: "name", description: "New name", required: true }] },
    { name: "voice-ban", description: "Ban user from private voice", options: [{ type: 6, name: "user", description: "User", required: true }] },
    // Fun commands
    { name: "8ball", description: "Ask the magic 8-ball", options: [{ type: 3, name: "question", description: "Your question", required: true }] },
    { name: "flip", description: "Flip a coin" },
    { name: "petpet", description: "Generate a petpet GIF from a user's avatar", options: [{ type: 6, name: "user", description: "User to pet", required: false }] },
    { name: "roll", description: "Roll dice", options: [{ type: 4, name: "sides", description: "Number of sides (default: 6)", required: false }, { type: 4, name: "count", description: "Number of dice (default: 1)", required: false }] },
    { name: "poll", description: "Create, end, list, or inspect polls", options: [{ type: 3, name: "action", description: "create, end, list, or status", required: true, choices: [{ name: "create", value: "create" }, { name: "end", value: "end" }, { name: "list", value: "list" }, { name: "status", value: "status" }] }, { type: 3, name: "question", description: "Poll question (for create)", required: false }, { type: 3, name: "options", description: "Options separated by | (for create)", required: false }, { type: 3, name: "message_id", description: "Poll message ID (for end/status)", required: false }] },
    { name: "choose", description: "Choose from options", options: [{ type: 3, name: "options", description: "Options separated by spaces", required: true }] },
    { name: "suggest", description: "Submit a suggestion", options: [{ type: 3, name: "suggestion", description: "Your suggestion", required: true }] },
    { name: "suggestions", description: "List suggestions", options: [{ type: 3, name: "scope", description: "mine or all", required: false, choices: [{ name: "mine", value: "mine" }, { name: "all", value: "all" }] }, { type: 4, name: "limit", description: "How many to show (1-25)", required: false }] },
    { name: "suggestion-status", description: "View a suggestion by ID", options: [{ type: 4, name: "id", description: "Suggestion ID", required: true }] },
    { name: "suggestion-withdraw", description: "Withdraw a suggestion by ID", options: [{ type: 4, name: "id", description: "Suggestion ID", required: true }] },
    { name: "member-count", description: "Enable/disable member count channel", default_member_permissions: slashPerm(PermissionsBitField.Flags.Administrator), options: [{ type: 3, name: "action", description: "enable or disable", required: true, choices: [{ name: "enable", value: "enable" }, { name: "disable", value: "disable" }] }] },
    { name: "giveaway", description: "Start/end/reroll/cancel/list/status giveaways", options: [{ type: 3, name: "action", description: "start, end, reroll, cancel, list, or status", required: true, choices: [{ name: "start", value: "start" }, { name: "end", value: "end" }, { name: "reroll", value: "reroll" }, { name: "cancel", value: "cancel" }, { name: "list", value: "list" }, { name: "status", value: "status" }] }, { type: 3, name: "duration", description: "e.g. 10m, 2h, 1d (for start)", required: false }, { type: 4, name: "winners", description: "Number of winners (for start)", required: false }, { type: 3, name: "prize", description: "Giveaway prize (for start)", required: false }, { type: 3, name: "message_id", description: "Giveaway message ID (for end/reroll/cancel/status)", required: false }, { type: 3, name: "reason", description: "Cancel reason (for cancel)", required: false }] },
    { name: "remindme", description: "Set a reminder", options: [{ type: 3, name: "duration", description: "e.g. 10m, 2h, 1d", required: true }, { type: 3, name: "message", description: "What to remind you about", required: true }] },
    { name: "reminders", description: "List your pending reminders", options: [{ type: 4, name: "limit", description: "How many reminders to show (1-25)", required: false }] },
    { name: "remindcancel", description: "Cancel one pending reminder", options: [{ type: 4, name: "id", description: "Reminder ID from /reminders", required: true }] },
    { name: "remindsnooze", description: "Delay one pending reminder", options: [{ type: 4, name: "id", description: "Reminder ID", required: true }, { type: 3, name: "duration", description: "e.g. 10m, 1h, 1d", required: true }] },
    { name: "remindclear", description: "Cancel all your pending reminders" },
    { name: "birthday", description: "Manage your birthday", options: [{ type: 3, name: "action", description: "set, list, or remove", required: true, choices: [{ name: "set", value: "set" }, { name: "list", value: "list" }, { name: "remove", value: "remove" }] }, { type: 3, name: "date", description: "MM/DD or MM/DD/YYYY (required for set)", required: false }] },
    // Economy commands
    { name: "balance", description: "Check your or another user's balance", options: [{ type: 6, name: "user", description: "User", required: false }] },
    { name: "daily", description: "Claim your daily reward" },
    { name: "weekly", description: "Claim your weekly reward" },
    { name: "pay", description: "Send money to another user", options: [{ type: 6, name: "user", description: "User", required: true }, { type: 4, name: "amount", description: "Amount", required: true }] },
    { name: "baltop", description: "View the richest members" },
    { name: "deposit", description: "Deposit money to your bank", options: [{ type: 4, name: "amount", description: "Amount (or 'all')", required: true }] },
    { name: "withdraw", description: "Withdraw money from your bank", options: [{ type: 4, name: "amount", description: "Amount (or 'all')", required: true }] },
    { name: "rob", description: "Rob another user", options: [{ type: 6, name: "user", description: "User", required: true }] },
    { name: "bankrob", description: "Rob the bank (high risk, high reward)" },
    { name: "slots", description: "Play slots (bet currency)", options: [{ type: 4, name: "bet", description: "Bet amount", required: true }] },
    { name: "coinflip", description: "Flip a coin and win 2x", options: [{ type: 4, name: "bet", description: "Bet amount", required: true }, { type: 3, name: "choice", description: "heads or tails", required: true, choices: [{ name: "heads", value: "heads" }, { name: "tails", value: "tails" }] }] },
    { name: "dice", description: "Roll dice and guess the result", options: [{ type: 4, name: "bet", description: "Bet amount", required: true }, { type: 4, name: "guess", description: "Guess (1-6)", required: true }] },
    { name: "fish", description: "Go fishing for treasure" },
    { name: "dig", description: "Dig for treasure" },
    { name: "phone", description: "Use phone services", options: [{ type: 3, name: "service", description: "Service (police, taxi, takeout)", required: false }] },
    { name: "adventure", description: "Go on a swamp adventure", options: [{ type: 4, name: "story_id", description: "Story ID", required: false }] },
    { name: "explore", description: "Explore and find treasure" },
    { name: "shop", description: "View the economy shop" },
    { name: "buy", description: "Buy an item from the shop", options: [{ type: 4, name: "item", description: "Item number", required: true }] },
    { name: "inventory", description: "View your inventory" },
    { name: "job", description: "Manage your job", options: [{ type: 3, name: "action", description: "list, apply, or quit", required: false }, { type: 3, name: "job_name", description: "Job name (for apply)", required: false }] },
    { name: "work", description: "Work at your job to earn money" },
    // Moderation commands
    { name: "ban", description: "Ban member", default_member_permissions: slashPerm(DEFAULT_MOD_COMMAND_PERMISSION), options: [{ type: 6, name: "user", description: "User", required: true }, { type: 3, name: "reason", description: "Reason", required: false }] },
    { name: "tempban", description: "Temporarily ban member", default_member_permissions: slashPerm(DEFAULT_MOD_COMMAND_PERMISSION), options: [{ type: 6, name: "user", description: "User", required: true }, { type: 3, name: "duration", description: "e.g. 10m, 1h, 1d", required: true }, { type: 3, name: "reason", description: "Reason", required: false }] },
    { name: "unban", description: "Unban member", default_member_permissions: slashPerm(DEFAULT_MOD_COMMAND_PERMISSION), options: [{ type: 3, name: "user_id", description: "User ID", required: true }, { type: 3, name: "reason", description: "Reason", required: false }] },
    { name: "kick", description: "Kick member", default_member_permissions: slashPerm(DEFAULT_MOD_COMMAND_PERMISSION), options: [{ type: 6, name: "user", description: "User", required: true }, { type: 3, name: "reason", description: "Reason", required: false }] },
    { name: "mute", description: "Mute (timeout) member", default_member_permissions: slashPerm(MODERATION_PERMISSION), options: [{ type: 6, name: "user", description: "User", required: true }, { type: 3, name: "duration", description: "e.g. 10m", required: false }, { type: 3, name: "reason", description: "Reason", required: false }] },
    { name: "unmute", description: "Unmute member", default_member_permissions: slashPerm(MODERATION_PERMISSION), options: [{ type: 6, name: "user", description: "User", required: true }, { type: 3, name: "reason", description: "Reason", required: false }] },
    { name: "purge", description: "Delete recent messages", default_member_permissions: slashPerm(DEFAULT_MOD_COMMAND_PERMISSION), options: [{ type: 4, name: "count", description: "1-100", required: true }] },
    { name: "warn", description: "Warn a user", default_member_permissions: slashPerm(DEFAULT_MOD_COMMAND_PERMISSION), options: [{ type: 6, name: "user", description: "User", required: true }, { type: 3, name: "reason", description: "Reason", required: false }] },
    { name: "auditsearch", description: "Search moderation audit logs", default_member_permissions: slashPerm(DEFAULT_MOD_COMMAND_PERMISSION), options: [{ type: 3, name: "action", description: "Action filter (warn/ban/kick/etc)", required: false }, { type: 6, name: "user", description: "Target user filter", required: false }, { type: 6, name: "moderator", description: "Moderator filter", required: false }, { type: 4, name: "days", description: "Lookback days (1-90)", required: false }, { type: 4, name: "limit", description: "Result limit (1-50)", required: false }] },
    { name: "warnings", description: "View user warnings", default_member_permissions: slashPerm(DEFAULT_MOD_COMMAND_PERMISSION), options: [{ type: 6, name: "user", description: "User", required: true }] },
    { name: "clearwarns", description: "Clear user warnings", default_member_permissions: slashPerm(DEFAULT_MOD_COMMAND_PERMISSION), options: [{ type: 6, name: "user", description: "User", required: true }] },
    { name: "nick", description: "Set nickname", default_member_permissions: slashPerm(DEFAULT_MOD_COMMAND_PERMISSION), options: [{ type: 6, name: "user", description: "User", required: true }, { type: 3, name: "name", description: "Nickname", required: true }] },
    { name: "role", description: "Toggle role on user", default_member_permissions: slashPerm(DEFAULT_MOD_COMMAND_PERMISSION), options: [{ type: 6, name: "user", description: "User", required: true }, { type: 8, name: "role", description: "Role", required: true }] },
    { name: "softban", description: "Softban member", default_member_permissions: slashPerm(DEFAULT_MOD_COMMAND_PERMISSION), options: [{ type: 6, name: "user", description: "User", required: true }, { type: 3, name: "reason", description: "Reason", required: false }] },
    { name: "lock", description: "Lock channel", default_member_permissions: slashPerm(DEFAULT_MOD_COMMAND_PERMISSION) },
    { name: "unlock", description: "Unlock channel", default_member_permissions: slashPerm(DEFAULT_MOD_COMMAND_PERMISSION) },
    { name: "slowmode", description: "Set channel slowmode", default_member_permissions: slashPerm(DEFAULT_MOD_COMMAND_PERMISSION), options: [{ type: 4, name: "seconds", description: "0-21600", required: true }] },
    // Message context menu command
    { name: "Purge Until Here", type: 3, default_member_permissions: slashPerm(DEFAULT_MOD_COMMAND_PERMISSION) }
  ];
}

function optionValue(interaction, key) {
  const option = interaction.options?.data?.find((entry) => entry.name === key);
  if (!option) return "";
  if (option.value === null || option.value === undefined) return "";
  return option.value;
}

function buildSyntheticMessage(interaction, cmdName, args) {
  return {
    guild: interaction.guild,
    member: interaction.member,
    channel: interaction.channel,
    author: interaction.user,
    client: interaction.client,
    isSyntheticInteraction: true,
    content: `!${cmdName} ${args.join(" ")}`.trim(),
    mentions: {
      users: { first: () => null },
      members: { first: () => null }
    },
    reply: async (payload) => {
      const body = typeof payload === "string" ? { content: payload, ephemeral: true } : { ...payload, ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        return await interaction.followUp(body);
      }
      return await interaction.reply(body);
    },
    delete: async () => {}
  };
}

async function handleSlashCommand(interaction) {
  // Handle message context menu commands
  if (interaction.isMessageContextMenuCommand()) {
    const name = interaction.commandName;
    
    if (name === "Purge Until Here") {
      // Check permissions
      if (!(await isModerator(interaction.member))) {
        await interaction.reply({ content: "You need mod permissions to use this command.", ephemeral: true });
        return true;
      }

      const targetMessage = interaction.targetMessage;
      if (!targetMessage) {
        await interaction.reply({ content: "❌ Could not find the target message.", ephemeral: true });
        return true;
      }

      await interaction.deferReply({ ephemeral: true });

      try {
        // Fetch messages after the target message
        const messages = await interaction.channel.messages.fetch({ 
          after: targetMessage.id,
          limit: 100 
        });

        if (messages.size === 0) {
          await interaction.editReply({ content: "⚠️ No messages found after the selected message." });
          return true;
        }

        // Filter out messages older than 14 days (Discord API limitation)
        const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
        const deletableMessages = messages.filter(msg => msg.createdTimestamp > twoWeeksAgo);

        if (deletableMessages.size === 0) {
          await interaction.editReply({ content: "⚠️ All messages are older than 14 days and cannot be bulk deleted." });
          return true;
        }

        // Bulk delete the messages
        const deleted = await interaction.channel.bulkDelete(deletableMessages, true);
        
        // Track moderation action
        trackModerationAction(
          { 
            guild: interaction.guild, 
            author: interaction.user,
            member: interaction.member,
            channel: interaction.channel
          }, 
          "message_bulk_delete", 
          { channelId: interaction.channel.id, count: deleted.size }
        );

        await interaction.editReply({ 
          content: `✅ Purged ${deleted.size} message(s) from after the selected message.` 
        });
      } catch (err) {
        console.error("Purge Until Here error:", err);
        await interaction.editReply({ 
          content: "❌ An error occurred while purging messages. Some messages may be too old or I may lack permissions." 
        });
      }

      return true;
    }
    
    return false;
  }

  // Handle chat input commands
  if (!interaction.isChatInputCommand()) return false;

  const name = interaction.commandName;

  const userOption = interaction.options.getUser("user");
  const moderatorOption = interaction.options.getUser("moderator");
  const roleOption = interaction.options.getRole("role");
  const args = [];

  if (name === "xp") {
    args.push(String(optionValue(interaction, "action")));
    if (userOption) args.push(userOption.id);
    args.push(String(optionValue(interaction, "amount")));
  } else if (name === "mute") {
    if (userOption) args.push(userOption.id);
    const duration = optionValue(interaction, "duration");
    const reason = optionValue(interaction, "reason");
    if (duration) args.push(String(duration));
    if (reason) args.push(...String(reason).split(/\s+/));
  } else if (name === "unmute") {
    if (userOption) args.push(userOption.id);
    const reason = optionValue(interaction, "reason");
    if (reason) args.push(...String(reason).split(/\s+/));
  } else if (name === "ban" || name === "kick" || name === "warn" || name === "softban") {
    if (userOption) args.push(userOption.id);
    const reason = optionValue(interaction, "reason");
    if (reason) args.push(...String(reason).split(/\s+/));
  } else if (name === "tempban") {
    if (userOption) args.push(userOption.id);
    const duration = optionValue(interaction, "duration");
    const reason = optionValue(interaction, "reason");
    if (duration) args.push(String(duration));
    if (reason) args.push(...String(reason).split(/\s+/));
  } else if (name === "role") {
    if (userOption) args.push(userOption.id);
    if (roleOption) args.push(roleOption.id);
  } else if (name === "unban") {
    args.push(String(optionValue(interaction, "user_id")));
    const reason = optionValue(interaction, "reason");
    if (reason) args.push(...String(reason).split(/\s+/));
  } else if (name === "warnings" || name === "clearwarns" || name === "voice-ban") {
    if (userOption) args.push(userOption.id);
  } else if (name === "auditsearch") {
    const action = optionValue(interaction, "action");
    const days = optionValue(interaction, "days");
    const limit = optionValue(interaction, "limit");
    if (action) args.push(`action:${String(action)}`);
    if (userOption) args.push(`user:${userOption.id}`);
    if (moderatorOption) args.push(`moderator:${moderatorOption.id}`);
    if (days) args.push(`days:${String(days)}`);
    if (limit) args.push(`limit:${String(limit)}`);
  } else if (name === "nick") {
    if (userOption) args.push(userOption.id);
    const nick = optionValue(interaction, "name");
    if (nick) args.push(...String(nick).split(/\s+/));
  } else if (name === "mod-role") {
    if (roleOption) args.push(roleOption.id);
  } else if (name === "prefix") {
    const value = optionValue(interaction, "value");
    if (value) args.push(String(value));
  } else if (name === "8ball") {
    const question = optionValue(interaction, "question");
    if (question) args.push(...String(question).split(/\s+/));
  } else if (name === "petpet") {
    if (userOption) args.push(userOption.id);
  } else if (name === "roll") {
    const sides = optionValue(interaction, "sides");
    const count = optionValue(interaction, "count");
    if (sides) args.push(String(sides));
    if (count) args.push(String(count));
  } else if (name === "poll") {
    const action = String(optionValue(interaction, "action") || "").toLowerCase();
    const question = optionValue(interaction, "question");
    const options = optionValue(interaction, "options");
    const messageId = optionValue(interaction, "message_id");
    if (action === "create") {
      args.push("create");
      if (question && options) args.push(`${question} | ${options}`);
    } else if (action === "end") {
      args.push("end");
      if (messageId) args.push(String(messageId));
    } else if (action === "status") {
      args.push("status");
      if (messageId) args.push(String(messageId));
    } else if (action === "list") {
      args.push("list");
    }
  } else if (name === "choose") {
    const options = optionValue(interaction, "options");
    if (options) args.push(...String(options).split(/\s+/));
  } else if (name === "suggest") {
    const suggestion = optionValue(interaction, "suggestion");
    if (suggestion) args.push(...String(suggestion).split(/\s+/));
  } else if (name === "suggestions") {
    const scope = optionValue(interaction, "scope");
    const limit = optionValue(interaction, "limit");
    if (scope) {
      args.push(String(scope));
      if (limit !== "") args.push(String(limit));
    } else if (limit !== "") {
      args.push("mine", String(limit));
    }
  } else if (name === "suggestion-status") {
    const id = optionValue(interaction, "id");
    if (id !== "") args.push(String(id));
  } else if (name === "suggestion-withdraw") {
    const id = optionValue(interaction, "id");
    if (id !== "") args.push(String(id));
  } else if (name === "member-count") {
    const action = String(optionValue(interaction, "action") || "").toLowerCase();
    if (action) args.push(action);
  } else if (name === "giveaway") {
    const action = String(optionValue(interaction, "action") || "").toLowerCase();
    const duration = optionValue(interaction, "duration");
    const winners = optionValue(interaction, "winners");
    const prize = optionValue(interaction, "prize");
    const messageId = optionValue(interaction, "message_id");
    const reason = optionValue(interaction, "reason");
    if (action) args.push(action);
    if (action === "start") {
      if (duration) args.push(String(duration));
      if (winners !== "") args.push(String(winners));
      if (prize) args.push(...String(prize).split(/\s+/));
    } else if (action === "end" || action === "reroll" || action === "status") {
      if (messageId) args.push(String(messageId));
    } else if (action === "cancel") {
      if (messageId) args.push(String(messageId));
      if (reason) args.push(...String(reason).split(/\s+/));
    }
  } else if (name === "remindme") {
    const duration = optionValue(interaction, "duration");
    const reminderMessage = optionValue(interaction, "message");
    if (duration) args.push(String(duration));
    if (reminderMessage) args.push(...String(reminderMessage).split(/\s+/));
  } else if (name === "remindcancel") {
    const id = optionValue(interaction, "id");
    if (id !== "") args.push(String(id));
  } else if (name === "remindsnooze") {
    const id = optionValue(interaction, "id");
    const duration = optionValue(interaction, "duration");
    if (id !== "") args.push(String(id));
    if (duration) args.push(String(duration));
  } else if (name === "birthday") {
    const action = optionValue(interaction, "action");
    const date = optionValue(interaction, "date");
    if (action) args.push(String(action));
    if (date) args.push(String(date));
  } else if (name === "balance") {
    if (userOption) args.push(userOption.id);
  } else if (name === "pay") {
    if (userOption) args.push(userOption.id);
    const amount = optionValue(interaction, "amount");
    if (amount !== "") args.push(String(amount));
  } else if (name === "deposit" || name === "withdraw") {
    const amount = optionValue(interaction, "amount");
    if (amount !== "") args.push(String(amount));
  } else if (name === "rob") {
    if (userOption) args.push(userOption.id);
  } else if (name === "slots") {
    const bet = optionValue(interaction, "bet");
    if (bet !== "") args.push(String(bet));
  } else if (name === "coinflip") {
    const bet = optionValue(interaction, "bet");
    const choice = optionValue(interaction, "choice");
    if (bet !== "") args.push(String(bet));
    if (choice) args.push(String(choice));
  } else if (name === "dice") {
    const bet = optionValue(interaction, "bet");
    const guess = optionValue(interaction, "guess");
    if (bet !== "") args.push(String(bet));
    if (guess !== "") args.push(String(guess));
  } else if (name === "phone") {
    const service = optionValue(interaction, "service");
    if (service) args.push(String(service));
  } else if (name === "adventure") {
    const storyId = optionValue(interaction, "story_id");
    if (storyId !== "") args.push(String(storyId));
  } else if (name === "buy") {
    const item = optionValue(interaction, "item");
    if (item !== "") args.push(String(item));
  } else if (name === "job") {
    const action = optionValue(interaction, "action");
    const jobName = optionValue(interaction, "job_name");
    if (action) args.push(String(action));
    if (jobName) args.push(...String(jobName).split(/\s+/));
  } else {
    const keys = ["page", "limit", "name", "count", "seconds", "id"];
    for (const key of keys) {
      const value = optionValue(interaction, key);
      if (value !== "" && value !== null && value !== undefined) {
        args.push(String(value));
      }
    }
  }

  const synthetic = buildSyntheticMessage(interaction, name, args);
  return await executeCommand(synthetic, name, args, "/");
}

async function registerSlashCommands(client) {
  const defs = buildSlashCommands();
  await client.application.commands.set([]);

  let guildSynced = 0;
  for (const [, guild] of client.guilds.cache) {
    try {
      await guild.commands.set(defs);
      guildSynced++;
    } catch (err) {
      console.error(`[slash] Failed guild sync for ${guild.id}:`, err?.message || err);
    }
  }

  console.log(`[slash] Registered ${defs.length} commands (guild-only sync across ${guildSynced} guilds)`);
}

async function ensureDefaultShopItems(guildId) {
  // Setup default economy shop items for minigames and features
  const defaultItems = [
    // Tools (durable, single equipment pieces)
    { id: 'fishing_rod', name: '🎣 Fishing Rod', description: 'Essential tool for fishing. Use /fish to catch treasure from the sea!', price: 200, type: 'tool' },
    { id: 'shovel', name: '⛏️ Shovel', description: 'Dig for treasures underground. Use /dig to start digging!', price: 200, type: 'tool' },
    { id: 'padlock', name: '🔒 Padlock', description: 'Protects your wallet from robberies (single use)', price: 100, type: 'single' },
    { id: 'phone', name: '📱 Phone', description: 'Call services - police (protection), taxi (explore), takeout (food)', price: 150, type: 'single' },
    
    // Consumables
    { id: 'treasure_map', name: '🗺️ Treasure Map', description: 'Doubles rewards for your next /dig or increases /fish success!', price: 80, type: 'consumable' },
    { id: 'food', name: '🍔 Food Item', description: 'A basic food item. Collect different types from takeout!', price: 25, type: 'consumable' },
    
    // Special Items
    { id: 'lucky_charm', name: '✨ Lucky Charm', description: 'Increases luck in minigames by 10%', price: 300, type: 'cosmetic' },
    { id: 'vip_pass', name: '🎫 VIP Pass', description: 'Unlock exclusive minigames and higher rewards', price: 500, type: 'single' }
  ];

  for (const item of defaultItems) {
    const exists = await get(`SELECT id FROM economy_shop_items WHERE guild_id=? AND item_id=?`, [guildId, item.id]);
    if (!exists) {
      await run(
        `INSERT INTO economy_shop_items (id, guild_id, name, description, price, item_type)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [`${guildId}-${item.id}`, guildId, item.name, item.description, item.price, item.type]
      );
    }
  }
}

module.exports = { handleCommands, handleSlashCommand, registerSlashCommands, endGiveaway, ensureDefaultShopItems };
