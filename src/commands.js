// src/commands.js
const { PermissionsBitField, ChannelType, AttachmentBuilder, EmbedBuilder } = require("discord.js");
const { get, all, run } = require("./db");
const { levelFromXp, xpToNextLevel, totalXpForLevel } = require("./xp");
const { createCanvas, loadImage, registerFont } = require("canvas");
// Register bundled font
registerFont(require('path').join(__dirname, '..', 'assets', 'Open_Sans', 'static', 'OpenSans-Regular.ttf'), { family: 'OpenSans' });
const { getLevelRoles, getGuildSettings } = require("./settings");
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
  // "manager" is ambiguous; the closest practical perms are ManageGuild / ManageChannels.
  // Admin also works.
  return (
    member.permissions.has(PermissionsBitField.Flags.Administrator) ||
    member.permissions.has(PermissionsBitField.Flags.ManageGuild) ||
    member.permissions.has(PermissionsBitField.Flags.ManageChannels)
  );
}

async function getConfiguredModRoleId(guildId) {
  const settings = await getGuildSettings(guildId);
  return settings?.mod_role_id || null;
}

async function memberHasConfiguredModRole(member) {
  if (!member?.guild) return false;
  const modRoleId = await getConfiguredModRoleId(member.guild.id);
  if (!modRoleId) return false;
  return member.roles?.cache?.has(modRoleId) || false;
}

async function isModerator(member) {
  if (!member) return false;
  if (isAdminOrManager(member)) return true;
  return await memberHasConfiguredModRole(member);
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
  const configured = (await getGuildSettings(message.guild.id).catch(() => null))?.command_prefix || DEFAULT_PREFIX;
  const prefix = String(configured || DEFAULT_PREFIX).trim() || DEFAULT_PREFIX;
  const list = [prefix];
  if (prefix !== LEGACY_PREFIX) list.push(LEGACY_PREFIX);
  return list;
}

function trackModerationAction(message, action, data = {}) {
  if (!message?.guild?.id || !message?.author?.id) return;
  recordModAction({ guildId: message.guild.id, action, actorId: message.author.id, data });
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
  const embed = compactEmbed("Commands", [
    "`!commands` `/commands`",
    "`!rank [user]` `/rank`",
    "`!leaderboard [page]` `/leaderboard`",
    "`!moist-lieutenant` - Get website URL",
    "`!voice-limit/lock/unlock/rename/ban` and matching `/voice-*`"
  ]);
  await message.reply({ embeds: [embed] }).catch(() => {});
}

async function cmdModCommands(message) {
  const hasModRole = await memberHasConfiguredModRole(message.member);
  const isManager = message.member?.id === BOT_MANAGER_ID;
  if (!hasModRole && !isManager) {
    await message.reply("Only the configured mod role can use this command list.").catch(() => {});
    return;
  }
  const embed = compactEmbed("Moderation Commands", [
    "`!mod-role <role-id>` `/mod-role`",
    "`?ban <user> [reason]` `/ban`",
    "`?unban <user-id> [reason]` `/unban`",
    "`?kick <user> [reason]` `/kick`",
    "`?mute <user> [duration] [reason]` `/mute`",
    "`?unmute <user> [reason]` `/unmute`",
    "`?purge <count>` `/purge`",
    "`?warn <user> [reason]` `/warn`",
    "`?warnings <user>` `/warnings`",
    "`?clearwarns <user>` `/clearwarns`",
    "`?nick <user> <nick>` `/nick`",
    "`?role <user> <role-id>` `/role`",
    "`?softban <user> [reason]` `/softban`",
    "`?lock` `?unlock` `?slowmode <seconds>` and matching `/lock` `/unlock` `/slowmode`"
  ]);
  await message.reply({ embeds: [embed] }).catch(() => {});
}

async function cmdAdminCommands(message) {
  if (!isAdminOrManager(message.member)) return;
  const embed = compactEmbed("Admin Commands", [
    "`!admin-commands` `/admin-commands`",
    "`!xp add/set <user> <amount>` `/xp`",
    "`!recalc-levels` `/recalc-levels`",
    "`!sync-roles` `/sync-roles`"
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
    await message.reply("Role not found.").catch(() => {});
    return;
  }

  await run(`INSERT INTO guild_settings (guild_id) VALUES (?) ON CONFLICT (guild_id) DO NOTHING`, [message.guild.id]);
  await run(`UPDATE guild_settings SET mod_role_id=? WHERE guild_id=?`, [role.id, message.guild.id]);
  await message.reply(`✅ Mod role set to ${role}.`).catch(() => {});
}

async function cmdPrefix(message, args) {
  if (!isAdminOrManager(message.member)) {
    await message.reply("Only admins/managers can change the prefix.").catch(() => {});
    return;
  }

  const raw = (args[0] || "").trim();
  if (!raw || raw.length > 3 || /\s/.test(raw)) {
    await message.reply("Usage: `prefix <new-prefix>` (1-3 chars, no spaces)").catch(() => {});
    return;
  }

  await run(`INSERT INTO guild_settings (guild_id) VALUES (?) ON CONFLICT (guild_id) DO NOTHING`, [message.guild.id]);
  await run(`UPDATE guild_settings SET command_prefix=? WHERE guild_id=?`, [raw, message.guild.id]);
  await message.reply(`✅ Prefix updated to \`${raw}\``).catch(() => {});
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
  // Nickname or username
  let displayName = targetMember?.displayName || targetUser.username;
  // Check if displayName is renderable in font (basic check: all chars in ASCII or fallback)
  function isRenderable(str, font) {
    // For simplicity, fallback if non-ASCII and font is not OpenSans
    return font === "OpenSans" || /^[\x00-\x7F]*$/.test(str);
  }
  if (!isRenderable(displayName, fontKey)) displayName = targetUser.username;
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
  const arg = args[0] || "";
  const pick = await pickUserSmart(message, arg);
  if (!pick || pick.ambiguous) {
    await message.reply("Usage: `?ban <user> [reason]`").catch(() => {});
    return;
  }

  const target = pick.member;
  if (!target.bannable) {
    await message.reply("I can't ban that user.").catch(() => {});
    return;
  }

  const reason = args.slice(1).join(" ").trim() || "No reason provided";
  trackModerationAction(message, "ban_add", { targetUserId: target.id });
  await target.ban({ reason }).catch(() => {});
  await message.reply(`✅ Banned ${target.user.tag}.`).catch(() => {});
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
  await message.reply("✅ Unbanned user.").catch(() => {});
}

async function cmdKick(message, args) {
  if (!(await requireModerator(message))) return;
  const arg = args[0] || "";
  const pick = await pickUserSmart(message, arg);
  if (!pick || pick.ambiguous) {
    await message.reply("Usage: `?kick <user> [reason]`").catch(() => {});
    return;
  }

  const target = pick.member;
  if (!target.kickable) {
    await message.reply("I can't kick that user.").catch(() => {});
    return;
  }

  const reason = args.slice(1).join(" ").trim() || "No reason provided";
  trackModerationAction(message, "member_remove", { targetUserId: target.id });
  await target.kick(reason).catch(() => {});
  await message.reply(`✅ Kicked ${target.user.tag}.`).catch(() => {});
}

async function cmdMute(message, args) {
  if (!(await requireModerator(message))) return;
  const arg = args[0] || "";
  const pick = await pickUserSmart(message, arg);
  if (!pick || pick.ambiguous) {
    await message.reply("Usage: `?mute <user> [duration like 10m] [reason]`").catch(() => {});
    return;
  }

  const target = pick.member;
  const durationMs = parseDurationMs(args[1]) || 10 * 60_000;
  const reason = (parseDurationMs(args[1]) ? args.slice(2) : args.slice(1)).join(" ").trim() || "No reason provided";
  if (!target.moderatable) {
    await message.reply("I can't mute that user.").catch(() => {});
    return;
  }
  trackModerationAction(message, "member_timeout", { targetUserId: target.id, timedOut: true });
  await target.timeout(durationMs, reason).catch(() => {});
  await message.reply(`✅ Muted ${target.user.tag}.`).catch(() => {});
}

async function cmdUnmute(message, args) {
  if (!(await requireModerator(message))) return;
  const arg = args[0] || "";
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
  const arg = args[0] || "";
  const pick = await pickUserSmart(message, arg);
  if (!pick || pick.ambiguous) {
    await message.reply("Usage: `?warn <user> [reason]`").catch(() => {});
    return;
  }

  const reason = args.slice(1).join(" ").trim() || "No reason provided";
  await run(
    `INSERT INTO mod_warnings (guild_id, user_id, moderator_id, reason, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [message.guild.id, pick.member.id, message.author.id, reason, Date.now()]
  );

  await message.reply(`✅ Warned ${pick.member.user.tag}.`).catch(() => {});
}

async function cmdWarnings(message, args) {
  if (!(await requireModerator(message))) return;
  const arg = args[0] || "";
  const pick = await pickUserSmart(message, arg);
  if (!pick || pick.ambiguous) {
    await message.reply("Usage: `?warnings <user>`").catch(() => {});
    return;
  }

  const rows = await all(
    `SELECT reason, created_at FROM mod_warnings WHERE guild_id=? AND user_id=? ORDER BY created_at DESC LIMIT 10`,
    [message.guild.id, pick.member.id]
  );
  const lines = rows.length
    ? rows.map((r, i) => `${i + 1}. ${r.reason}`).join("\n")
    : "No warnings.";

  const embed = compactEmbed(`Warnings for ${pick.member.user.username}`, [lines]);
  await message.reply({ embeds: [embed] }).catch(() => {});
}

async function cmdClearWarns(message, args) {
  if (!(await requireModerator(message))) return;
  const arg = args[0] || "";
  const pick = await pickUserSmart(message, arg);
  if (!pick || pick.ambiguous) {
    await message.reply("Usage: `?clearwarns <user>`").catch(() => {});
    return;
  }

  await run(`DELETE FROM mod_warnings WHERE guild_id=? AND user_id=?`, [message.guild.id, pick.member.id]);
  await message.reply(`✅ Cleared warnings for ${pick.member.user.tag}.`).catch(() => {});
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
    SendMessages: true
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
  const arg = args[0] || "";
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
  await message.reply(`✅ Updated nickname for ${pick.member.user.tag}.`).catch(() => {});
}

async function cmdRole(message, args) {
  if (!(await requireModerator(message))) return;
  const arg = args[0] || "";
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
    await message.reply(`✅ Removed ${role.name} from ${pick.member.user.tag}.`).catch(() => {});
    return;
  }

  trackModerationAction(message, "member_role_update", { targetUserId: pick.member.id });
  await pick.member.roles.add(role).catch(() => {});
  await message.reply(`✅ Added ${role.name} to ${pick.member.user.tag}.`).catch(() => {});
}

async function cmdSoftban(message, args) {
  if (!(await requireModerator(message))) return;
  const arg = args[0] || "";
  const pick = await pickUserSmart(message, arg);
  if (!pick || pick.ambiguous) {
    await message.reply("Usage: `?softban <user> [reason]`").catch(() => {});
    return;
  }

  const target = pick.member;
  if (!target.bannable) {
    await message.reply("I can't softban that user.").catch(() => {});
    return;
  }
  const reason = args.slice(1).join(" ").trim() || "No reason provided";
  trackModerationAction(message, "ban_add", { targetUserId: target.id });
  await target.ban({ reason, deleteMessageSeconds: 24 * 60 * 60 }).catch(() => {});
  trackModerationAction(message, "ban_remove", { targetUserId: target.id });
  await message.guild.members.unban(target.id, "Softban release").catch(() => {});
  await message.reply(`✅ Softbanned ${target.user.tag}.`).catch(() => {});
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
// Main handler
// ─────────────────────────────────────────────────────

async function handleCommands(message) {
  if (!message || !message.content) return false;

  if (!message.guild) return false;
  const activePrefixes = await getActivePrefixes(message);
  const parsed = parseCommand(message.content, activePrefixes);
  if (!parsed) return false;

  return await executeCommand(message, parsed.cmd, parsed.args, parsed.prefix);
}

async function executeCommand(message, cmd, args, prefix) {
  if (!message.guild) return false;

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

  if (cmd === "ban") {
    await cmdBan(message, args);
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
    { name: "ban", description: "Ban member", default_member_permissions: slashPerm(DEFAULT_MOD_COMMAND_PERMISSION), options: [{ type: 6, name: "user", description: "User", required: true }, { type: 3, name: "reason", description: "Reason", required: false }] },
    { name: "unban", description: "Unban member", default_member_permissions: slashPerm(DEFAULT_MOD_COMMAND_PERMISSION), options: [{ type: 3, name: "user_id", description: "User ID", required: true }, { type: 3, name: "reason", description: "Reason", required: false }] },
    { name: "kick", description: "Kick member", default_member_permissions: slashPerm(DEFAULT_MOD_COMMAND_PERMISSION), options: [{ type: 6, name: "user", description: "User", required: true }, { type: 3, name: "reason", description: "Reason", required: false }] },
    { name: "mute", description: "Mute (timeout) member", default_member_permissions: slashPerm(MODERATION_PERMISSION), options: [{ type: 6, name: "user", description: "User", required: true }, { type: 3, name: "duration", description: "e.g. 10m", required: false }, { type: 3, name: "reason", description: "Reason", required: false }] },
    { name: "unmute", description: "Unmute member", default_member_permissions: slashPerm(MODERATION_PERMISSION), options: [{ type: 6, name: "user", description: "User", required: true }, { type: 3, name: "reason", description: "Reason", required: false }] },
    { name: "purge", description: "Delete recent messages", default_member_permissions: slashPerm(DEFAULT_MOD_COMMAND_PERMISSION), options: [{ type: 4, name: "count", description: "1-100", required: true }] },
    { name: "warn", description: "Warn a user", default_member_permissions: slashPerm(DEFAULT_MOD_COMMAND_PERMISSION), options: [{ type: 6, name: "user", description: "User", required: true }, { type: 3, name: "reason", description: "Reason", required: false }] },
    { name: "warnings", description: "View user warnings", default_member_permissions: slashPerm(DEFAULT_MOD_COMMAND_PERMISSION), options: [{ type: 6, name: "user", description: "User", required: true }] },
    { name: "clearwarns", description: "Clear user warnings", default_member_permissions: slashPerm(DEFAULT_MOD_COMMAND_PERMISSION), options: [{ type: 6, name: "user", description: "User", required: true }] },
    { name: "nick", description: "Set nickname", default_member_permissions: slashPerm(DEFAULT_MOD_COMMAND_PERMISSION), options: [{ type: 6, name: "user", description: "User", required: true }, { type: 3, name: "name", description: "Nickname", required: true }] },
    { name: "role", description: "Toggle role on user", default_member_permissions: slashPerm(DEFAULT_MOD_COMMAND_PERMISSION), options: [{ type: 6, name: "user", description: "User", required: true }, { type: 8, name: "role", description: "Role", required: true }] },
    { name: "softban", description: "Softban member", default_member_permissions: slashPerm(DEFAULT_MOD_COMMAND_PERMISSION), options: [{ type: 6, name: "user", description: "User", required: true }, { type: 3, name: "reason", description: "Reason", required: false }] },
    { name: "lock", description: "Lock channel", default_member_permissions: slashPerm(DEFAULT_MOD_COMMAND_PERMISSION) },
    { name: "unlock", description: "Unlock channel", default_member_permissions: slashPerm(DEFAULT_MOD_COMMAND_PERMISSION) },
    { name: "slowmode", description: "Set channel slowmode", default_member_permissions: slashPerm(DEFAULT_MOD_COMMAND_PERMISSION), options: [{ type: 4, name: "seconds", description: "0-21600", required: true }] }
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
  if (!interaction.isChatInputCommand()) return false;

  const name = interaction.commandName;

  const userOption = interaction.options.getUser("user");
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
  } else if (name === "role") {
    if (userOption) args.push(userOption.id);
    if (roleOption) args.push(roleOption.id);
  } else if (name === "unban") {
    args.push(String(optionValue(interaction, "user_id")));
    const reason = optionValue(interaction, "reason");
    if (reason) args.push(...String(reason).split(/\s+/));
  } else if (name === "warnings" || name === "clearwarns" || name === "voice-ban") {
    if (userOption) args.push(userOption.id);
  } else if (name === "nick") {
    if (userOption) args.push(userOption.id);
    const nick = optionValue(interaction, "name");
    if (nick) args.push(...String(nick).split(/\s+/));
  } else if (name === "mod-role") {
    if (roleOption) args.push(roleOption.id);
  } else if (name === "prefix") {
    const value = optionValue(interaction, "value");
    if (value) args.push(String(value));
  } else {
    const keys = ["page", "limit", "name", "count", "seconds"];
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

module.exports = { handleCommands, handleSlashCommand, registerSlashCommands };
