// src/commands.js
const { PermissionsBitField, ChannelType, AttachmentBuilder, EmbedBuilder } = require("discord.js");
const { get, all, run } = require("./db");
const { levelFromXp, xpToNextLevel, totalXpForLevel } = require("./xp");
const { createCanvas, loadImage, registerFont } = require("canvas");
// Register bundled font
registerFont(require('path').join(__dirname, '..', 'assets', 'Open_Sans', 'static', 'OpenSans-Regular.ttf'), { family: 'OpenSans' });
const { getLevelRoles } = require("./settings");
const fs = require("fs");
const path = require("path");

// Change if you want another prefix
const PREFIX = "!";

// ─────────────────────────────────────────────────────
// Permission helpers
// ─────────────────────────────────────────────────────

function isAdminOrManager(member) {
  if (!member) return false;
  // "manager" is ambiguous; the closest practical perms are ManageGuild / ManageChannels.
  // Admin also works.
  return (
    member.permissions.has(PermissionsBitField.Flags.Administrator) ||
    member.permissions.has(PermissionsBitField.Flags.ManageGuild) ||
    member.permissions.has(PermissionsBitField.Flags.ManageChannels)
  );
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
// Parsing helpers
// ─────────────────────────────────────────────────────

function parseCommand(content) {
  if (!content.startsWith(PREFIX)) return null;

  const without = content.slice(PREFIX.length).trim();
  if (!without) return null;

  const parts = without.split(/\s+/);
  const cmd = (parts.shift() || "").toLowerCase();
  const args = parts;

  return { cmd, args };
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

function normalizeName(s) {
  return String(s || "").trim().toLowerCase();
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
  const borderColor = prefs.avatarbordercolor || '#71faf9';
  const glowType = prefs.borderglow || 'none';
  const frameType = prefs.avatarframe || 'none';
  
  // Draw frame style (outer decorative ring)
  if (frameType !== 'none') {
    ctx.save();
    ctx.strokeStyle = frameType === 'gold' ? '#FFD700' : 
                      frameType === 'silver' ? '#C0C0C0' :
                      frameType === 'bronze' ? '#CD7F32' :
                      frameType === 'neon' ? '#71faf9' : '#71faf9';
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

async function cmdHelp(message) {
  const embed = new EmbedBuilder()
    .setColor(0x7bc96f)
    .setTitle("🐸 Commands - Moist Lieutenant")
    .setDescription("Available commands for Moist Lieutenant")
    .addFields(
      {
        name: "📊 Levels",
        value: "`!rank [@user]` - Show XP and level\n`!leaderboard [page]` / `!lb [page]` - Show top XP rankings",
        inline: false
      },
      {
        name: "🎤 Private Voice Channels",
        value: "*Use these commands only inside your VC's paired text channel:*\n`!voice-limit <0-99>` - Set user limit\n`!voice-lock` / `!voice-unlock` - Lock/unlock channel\n`!voice-rename <name>` - Rename your voice channel\n`!voice-ban @user` - Ban user from your VC",
        inline: false
      },
      {
        name: "⚙️ Admin/Manager Commands",
        value: "`!xp add @user <amount>` - Add XP to user\n`!xp set @user <amount>` - Set user XP\n`!recalc-levels` - Recalculate all levels\n`!sync-roles` - Sync level roles\n\n*For detailed admin help, use `!admin-commands`*",
        inline: false
      },
      {
        name: "🌐 Web Dashboard",
        value: "`!moist-lieutenant` - Get link to configure XP settings, level roles, rank cards, and more",
        inline: false
      }
    )
    .setFooter({ text: "Use !admin-commands for detailed admin help" })
    .setTimestamp();

  await message.reply({ embeds: [embed] }).catch(() => {});
}
async function cmdAdminHelp(message) {
  if (!isAdminOrManager(message.member)) {
    await message.reply("This command is only for admins/managers. Use `!help` for general commands.").catch(() => {});
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0x8b7355)
    .setTitle("⚙️ Admin Commands - Moist Lieutenant")
    .setDescription("Administrator and Manager commands")
    .addFields(
      {
        name: "💎 XP Management",
        value: "`!xp add @user <amount>` - Add XP to a user\n`!xp set @user <amount>` - Set user's XP to exact amount\n\n**Examples:**\n`!xp add @ToadKing 500`\n`!xp set @Froglet 1000`",
        inline: false
      },
      {
        name: "🔄 System Maintenance",
        value: "`!recalc-levels` - Recalculate all user levels based on current XP\n`!sync-roles` - Sync level roles to all users\n\n*Use these after changing XP settings or level roles*",
        inline: false
      },
      {
        name: "🌐 Web Dashboard",
        value: "Use `!moist-lieutenant` to get the dashboard link where you can:\n• Configure XP settings (min/max, cooldowns)\n• Set up level-up messages and channels\n• Configure level roles\n• Customize rank cards\n• View detailed leaderboards\n• Manage ignored channels",
        inline: false
      }
    )
    .setFooter({ text: "Need help? Contact the bot owner" })
    .setTimestamp();

  await message.reply({ embeds: [embed] }).catch(() => {});
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
      ctx.drawImage(avatar, 30, 20, 120, 120);
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
  
  // Sanitize display name to prevent ToFU boxes - use whitelist approach
  function sanitizeName(str) {
    if (!str) return "";
    // Only keep characters that OpenSans can reliably render:
    // - Basic Latin (ASCII printable): \x20-\x7E
    // - Latin-1 Supplement: \xA0-\xFF
    // - Latin Extended-A: \u0100-\u017F
    // - Latin Extended-B (partial): \u0180-\u024F
    // Remove everything else (emojis, special symbols, etc.)
    return str
      .replace(/[^\x20-\x7E\xA0-\xFF\u0100-\u024F]/g, '')
      .trim();
  }
  
  // Get display name and sanitize it
  let rawDisplayName = targetMember?.displayName || targetUser.username;
  let displayName = sanitizeName(rawDisplayName);
  
  // If sanitization removed everything or left very little, use username
  if (!displayName || displayName.length < 2) {
    displayName = sanitizeName(targetUser.username);
  }
  
  // Final fallback: if still empty, use user ID
  if (!displayName) {
    displayName = `User ${targetUser.id.slice(0, 8)}`;
  }
  
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

    lines.push(
      `**#${rank}** — ${name} — Level **${r.level}** — XP **${r.xp}**`
    );
  }

  await message.reply(`**Leaderboard (page ${page})**\n` + lines.join("\n")).catch(() => {});
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

async function cmdVoiceBan(message) {
  const check = await assertVoiceCmdAllowed(message);
  if (!check.ok) {
    await message.reply(check.reason).catch(() => {});
    return;
  }

  const target = message.mentions.members.first();
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
// Main handler
// ─────────────────────────────────────────────────────

async function handleCommands(message) {
  if (!message || !message.content) return false;

  const parsed = parseCommand(message.content);
  if (!parsed) return false;

  const { cmd, args } = parsed;

  // Moist Lieutenant public site command
  if (cmd === "moist-lieutenant") {
    // You can change this URL to your actual public site URL
    const publicUrl = process.env.BOT_PUBLIC_URL || "https://lop-bot-clean-production.up.railway.app";
    await message.reply(`View the Moist Lieutenant web dashboard here: ${publicUrl}`).catch(() => {});
    return true;
  }

  // Debug log so you can see the handler is firing
  console.log("[CMD]", cmd, args.join(" "));

  // Help
  if (cmd === "help" || cmd === "commands") {
    await cmdHelp(message);
    return true;
  }

  // Admin Help
  if (cmd === "admin-commands" || cmd === "admin-help") {
    await cmdAdminHelp(message);
    return true;
  }

  // Levels
  if (cmd === "rank") {
    await cmdRank(message, args);
    return true;
  }

  if (cmd === "leaderboard" || cmd === "lb") {
    await cmdLeaderboard(message, args);
    return true;
  }

  // Admin XP
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

  // Private VC commands
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
    await cmdVoiceBan(message);
    return true;
  }

  return false;
}

module.exports = { handleCommands };
