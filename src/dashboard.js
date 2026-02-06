// Helper: check if user is admin/manager in any guild the bot is in
function isAdminOrManagerDiscord(user, client) {
  if (!user || !user.id) return false;
  for (const guild of client.guilds.cache.values()) {
    const member = guild.members.cache.get(user.id);
    if (member && (member.permissions.has("Administrator") || member.permissions.has("ManageGuild"))) {
      return true;
    }
  }
  // Bot manager override (set env var BOT_MANAGER_ID)
  if (process.env.BOT_MANAGER_ID && user.id === process.env.BOT_MANAGER_ID) return true;
  return false;
}

// Middleware: require Discord login
function requireDiscordLogin(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  return res.redirect("/login");
}

// Middleware: require admin/manager
function requireAdminOrManager(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated() && isAdminOrManagerDiscord(req.user, client)) return next();
  return res.status(403).send("You must be a Discord server admin or bot manager to access this page.");
}
const passport = require("passport");
const DiscordStrategy = require("passport-discord").Strategy;
// Discord OAuth2 config (set these in your environment)
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_CALLBACK_URL = process.env.DISCORD_CALLBACK_URL || "http://localhost:3000/auth/discord/callback";

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(new DiscordStrategy({
  clientID: DISCORD_CLIENT_ID,
  clientSecret: DISCORD_CLIENT_SECRET,
  callbackURL: DISCORD_CALLBACK_URL,
  scope: ["identify", "guilds"]
}, (accessToken, refreshToken, profile, done) => {
  process.nextTick(() => done(null, profile));
}));
const express = require("express");
const session = require("express-session");
const { createCanvas, loadImage, registerFont } = require("canvas");
const sharp = require("sharp");
const path = require("path");
const multer = require("multer");
const upload = multer({ dest: "uploads/" });
// In-memory store for user customizations (replace with DB in production)
const userRankCardPrefs = {};
const {
  getGuildSettings,
  updateGuildSettings,
  getLevelRoles,
  setLevelRole,
  deleteLevelRole,
  getIgnoredChannels,
  addIgnoredChannel,
  removeIgnoredChannel
} = require("./settings");

function htmlTemplate(content) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Bot Dashboard</title>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&display=swap" rel="stylesheet">
  <style>
    body {
      font-family: 'Playfair Display', serif;
      background: linear-gradient(135deg, #f5f5dc 0%, #ede0d4 50%, #f4e4bc 100%);
      margin: 0;
      padding: 20px;
      color: #333;
    }
    h2 {
      color: #8b4513;
      text-align: center;
    }
    h3 {
      color: #a0522d;
    }
    button {
      background-color: #daa520;
      color: white;
      border: none;
      padding: 10px 15px;
      cursor: pointer;
      font-family: 'Playfair Display', serif;
    }
    button:hover {
      background-color: #b8860b;
    }
    input, select {
      padding: 5px;
      border: 1px solid #daa520;
      border-radius: 4px;
    }
    ul {
      list-style-type: none;
      padding: 0;
    }
    li {
      margin: 5px 0;
    }
    a {
      color: #8b4513;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
    hr {
      border: 0;
      height: 1px;
      background: linear-gradient(to right, transparent, #daa520, transparent);
    }
    form {
      margin-bottom: 20px;
    }
  </style>
</head>
<body>
  ${content}
</body>
</html>`;
}

function mustBeLoggedIn(req, res, next) {
  if (req.session && req.session.ok) return next();
  return res.redirect("/login");
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function isTextChannelLike(ch) {
  return !!ch && typeof ch.isTextBased === "function" && ch.isTextBased();
}

function startDashboard(client) {
  const app = express();

  // Sessions (must be before passport.session())
  app.set("trust proxy", 1);
  app.use(
    session({
      name: "lop_dashboard_session",
      secret: process.env.DASHBOARD_SESSION_SECRET || "change-me",
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: false, // set true only when behind HTTPS and configured correctly
        maxAge: 7 * 24 * 60 * 60 * 1000
      }
    })
  );

  // Passport session setup (must be after session)
  app.use(passport.initialize());
  app.use(passport.session());

  // Discord OAuth2 login
  app.get("/login", passport.authenticate("discord"));
  app.get("/auth/discord", passport.authenticate("discord"));
  app.get("/auth/discord/callback",
    passport.authenticate("discord", { failureRedirect: "/login" }),
    (req, res) => {
      // Successful authentication, redirect home.
      res.redirect("/");
    }
  );
  app.get("/logout", (req, res) => {
    req.logout(() => {
      res.redirect("/");
    });
  });
    // Serve the user's customized rank card as an image, enforcing unlocks
    app.get("/lop/rankcard/image", async (req, res) => {
      const userKey = req.ip;
      const prefs = userRankCardPrefs[userKey] || {};
      // TODO: Replace with real user ID and guild ID if available
      const userId = req.user?.id || null;
      const guildId = null; // If you have a way to get the user's guild, set it here
      let userLevel = 1;
      let unlocks = null;
      if (guildId && userId) {
        // Fetch user level and unlocks from DB
        const { getCustomizationUnlocks, getCustomizationRequiredLevel } = require("./settings");
        const { get } = require("./db");
        unlocks = await getCustomizationUnlocks(guildId);
        const row = await get(
          `SELECT level FROM user_xp WHERE guild_id=? AND user_id=?`,
          [guildId, userId]
        );
        userLevel = row?.level ?? 1;
      } else {
        // Fallback: use defaults
        unlocks = {
          bgimage: 10,
          gradient: 5,
          bgcolor: 1,
          font: 3,
          border: 7,
          avatarframe: 15
        };
      }

      // Canvas setup
      const width = 600, height = 200;
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext("2d");

      // Helper to check if a feature is unlocked
      function isUnlocked(opt) {
        return userLevel >= (unlocks[opt] ?? 1);
      }

      // Background: image > gradient > color > default, but only if unlocked
      if (prefs.bgimage && isUnlocked("bgimage")) {
        try {
          const imgPath = path.resolve(prefs.bgimage);
          const img = await loadImage(imgPath);
          ctx.drawImage(img, 0, 0, width, height);
        } catch (e) {
          ctx.fillStyle = prefs.bgcolor && isUnlocked("bgcolor") ? prefs.bgcolor : "#23272A";
          ctx.fillRect(0, 0, width, height);
        }
      } else if (prefs.gradient && isUnlocked("gradient")) {
        const colors = prefs.gradient.split(",").map(s => s.trim()).filter(Boolean);
        if (colors.length > 1) {
          const grad = ctx.createLinearGradient(0, 0, width, height);
          colors.forEach((c, i) => grad.addColorStop(i / (colors.length - 1), c));
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, width, height);
        } else {
          ctx.fillStyle = prefs.bgcolor && isUnlocked("bgcolor") ? prefs.bgcolor : "#23272A";
          ctx.fillRect(0, 0, width, height);
        }
      } else {
        ctx.fillStyle = prefs.bgcolor && isUnlocked("bgcolor") ? prefs.bgcolor : "#23272A";
        ctx.fillRect(0, 0, width, height);
      }

      // Font (only if unlocked)
      let fontFamily = "OpenSans";
      if (prefs.font && isUnlocked("font")) {
        if (prefs.font === "Arial") fontFamily = "Arial";
        if (prefs.font === "ComicSansMS") fontFamily = "Comic Sans MS";
        if (prefs.font === "TimesNewRoman") fontFamily = "Times New Roman";
      }
      ctx.font = `bold 28px ${fontFamily}`;
      ctx.fillStyle = "#fff";
      ctx.fillText("Your Name", 170, 70);
      ctx.font = `bold 22px ${fontFamily}`;
      ctx.fillStyle = "#FFD700";
      ctx.fillText(`Level: ${userLevel}`, 170, 110);
      ctx.font = `16px ${fontFamily}`;
      ctx.fillStyle = "#aaa";
      ctx.fillText(`XP: 0 / 100`, 170, 140);

      // Progress bar
      const barX = 170, barY = 150, barW = 380, barH = 20;
      ctx.fillStyle = "#444";
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = "#43B581";
      ctx.fillRect(barX, barY, barW * 0.1, barH);
      ctx.strokeStyle = "#222";
      ctx.lineWidth = 2;
      ctx.strokeRect(barX, barY, barW, barH);
      ctx.font = `bold 16px ${fontFamily}`;
      ctx.fillStyle = "#fff";
      ctx.fillText(`0 / 100 XP this level`, barX + 10, barY + 16);

      // Profile pic placeholder (circle)
      ctx.save();
      ctx.beginPath();
      ctx.arc(90, 100, 60, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.fillStyle = "#555";
      ctx.fillRect(30, 40, 120, 120);
      ctx.font = `bold 40px ${fontFamily}`;
      ctx.fillStyle = "#fff";
      ctx.fillText("U", 80, 140);
      ctx.restore();

      // Output as PNG
      res.setHeader("Content-Type", "image/png");
      res.send(canvas.toBuffer());
    });
  // (removed duplicate app = express())

  // Render sets PORT; local uses DASHBOARD_PORT or 3000
  const port = parseInt(process.env.PORT || process.env.DASHBOARD_PORT || "3000", 10);

  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) {
    console.warn("DASHBOARD_PASSWORD not set; dashboard will not start.");
    return;
  }

  app.use(express.urlencoded({ extended: true }));

  // Sessions
  app.set("trust proxy", 1);
  app.use(
    session({
      name: "lop_dashboard_session",
      secret: process.env.DASHBOARD_SESSION_SECRET || "change-me",
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: false, // set true only when behind HTTPS and configured correctly
        maxAge: 7 * 24 * 60 * 60 * 1000
      }
    })
  );

  // Basic error logging (helps Render debugging)
  app.use((req, _res, next) => {
    // console.log(`[DASH] ${req.method} ${req.url}`);
    next();
  });

  // ─────────────────────────────────────────────
  // Auth
  // ─────────────────────────────────────────────
  app.get("/login", (req, res) => {
    res.send(htmlTemplate(`
      <h2>Bot Dashboard Login</h2>
      <form method="post" action="/login">
        <input type="password" name="password" placeholder="Password" />
        <button type="submit">Login</button>
      </form>
      <p style="color:#666;max-width:720px">
        Tip: always use the same host (localhost OR 127.0.0.1) locally, or cookies can break.
      </p>
    `));
  });

  app.post("/login", (req, res) => {
    if (req.body.password === password) {
      req.session.ok = true;
      return req.session.save(() => res.redirect("/"));
    }
    return res.status(403).send("Wrong password.");
  });

  app.get("/logout", (req, res) => {
    req.session.destroy(() => res.redirect("/login"));
  });

  // ─────────────────────────────────────────────
  // Home: list guilds
  // ─────────────────────────────────────────────
  app.get("/admin", (req, res) => {
    if (!req.session || !req.session.ok) return res.redirect("/login");
    return res.redirect("/");
  });

  // Public home page (optional: show info or redirect to /lop)
  app.get("/", (req, res) => {
    res.redirect("/lop");
  });

  // Public rank card customization UI (example, not full-featured)
  app.get("/lop", async (req, res) => {
    // TODO: Replace with real user ID and guild ID if available
    const userId = req.user?.id || null;
    const guildId = null; // If you have a way to get the user's guild, set it here
    let userLevel = 1;
    let unlocks = null;
    if (guildId && userId) {
      const { getCustomizationUnlocks } = require("./settings");
      const { get } = require("./db");
      unlocks = await getCustomizationUnlocks(guildId);
      const row = await get(
        `SELECT level FROM user_xp WHERE guild_id=? AND user_id=?`,
        [guildId, userId]
      );
      userLevel = row?.level ?? 1;
    } else {
      unlocks = {
        bgimage: 10,
        gradient: 5,
        bgcolor: 1,
        font: 3,
        border: 7,
        avatarframe: 15
      };
    }
    const customizationOptions = [
      { key: "bgimage", label: "Custom Background Image" },
      { key: "gradient", label: "Custom Gradient" },
      { key: "bgcolor", label: "Custom Background Color" },
      { key: "font", label: "Custom Font" },
      { key: "border", label: "Custom Border" },
      { key: "avatarframe", label: "Avatar Frame" }
    ];
    function isUnlocked(opt) {
      return userLevel >= (unlocks[opt] ?? 1);
    }
    res.send(htmlTemplate(`
      <h2>Customize Your Rank Card</h2>
      <p>Your Level: <b>${userLevel}</b></p>
      <table style="border-collapse:collapse;">
        <tr><th style="text-align:left;">Feature</th><th style="text-align:left;">Status</th><th style="text-align:left;">Unlocks At</th></tr>
        ${customizationOptions.map(opt => `
          <tr>
            <td>${escapeHtml(opt.label)}</td>
            <td>${isUnlocked(opt.key) ? '<span style="color:green">Unlocked</span>' : '<span style="color:#b8860b">Locked</span>'}</td>
            <td>Level ${unlocks[opt.key]}</td>
          </tr>
        `).join("")}
      </table>
      <p style="margin-top:20px;">(Customization form coming soon. Only unlocked features will be available for editing.)</p>
      <img src="/lop/rankcard/image" alt="Rank Card Preview" style="margin-top:20px;border:1px solid #ccc;max-width:100%;" />
    `));
  });

  // Admin dashboard (Discord admin/manager only)
  app.get("/dashboard", requireDiscordLogin, requireAdminOrManager, async (req, res) => {
    const guilds = client.guilds.cache
      .map((g) => ({ id: g.id, name: g.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    res.send(htmlTemplate(`
      <h2>Bot Dashboard</h2>
      <p>Logged in as: ${escapeHtml(req.user.username)}#${escapeHtml(req.user.discriminator)}</p>
      <p><a href="/logout">Logout</a></p>
      <h3>Servers</h3>
      <ul>
        ${guilds.map((g) => `<li><a href="/guild/${g.id}">${escapeHtml(g.name)}</a></li>`).join("")}
      </ul>
    `));
  });

  // ─────────────────────────────────────────────
  // Guild page
  // ─────────────────────────────────────────────
  app.get("/guild/:guildId", mustBeLoggedIn, async (req, res) => {
    const guildId = req.params.guildId;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.status(404).send("Bot is not in that guild.");

    const settings = await getGuildSettings(guildId);
    const levelRoles = await getLevelRoles(guildId);
    const ignoredChannels = await getIgnoredChannels(guildId);

    await guild.channels.fetch().catch(() => {});
    const textChannels = guild.channels.cache
      .filter((c) => isTextChannelLike(c))
      .map((c) => ({ id: c.id, name: c.name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // Customization unlocks UI
    const { getCustomizationUnlocks } = require("./settings");
    const unlocks = await getCustomizationUnlocks(guildId);
    const customizationOptions = [
      { key: "bgimage", label: "Custom Background Image" },
      { key: "gradient", label: "Custom Gradient" },
      { key: "bgcolor", label: "Custom Background Color" },
      { key: "font", label: "Custom Font" },
      { key: "border", label: "Custom Border" },
      { key: "avatarframe", label: "Avatar Frame" }
    ];

    res.send(htmlTemplate(`
      <h2>${escapeHtml(guild.name)}</h2>
      <p><a href="/">Back</a> | <a href="/logout">Logout</a></p>

      <hr/>

      <h3>XP Settings</h3>
      <form method="post" action="/guild/${guildId}/settings">
        <label>Message XP Min <input name="message_xp_min" value="${escapeHtml(settings.message_xp_min)}" /></label><br/>
        <label>Message XP Max <input name="message_xp_max" value="${escapeHtml(settings.message_xp_max)}" /></label><br/>
        <label>Message Cooldown Seconds <input name="message_cooldown_seconds" value="${escapeHtml(settings.message_cooldown_seconds)}" /></label><br/>
        <label>Reaction XP <input name="reaction_xp" value="${escapeHtml(settings.reaction_xp)}" /></label><br/>
        <label>Reaction Cooldown Seconds <input name="reaction_cooldown_seconds" value="${escapeHtml(settings.reaction_cooldown_seconds)}" /></label><br/>
        <label>Voice XP Per Minute <input name="voice_xp_per_minute" value="${escapeHtml(settings.voice_xp_per_minute)}" /></label><br/><br/>
        <button type="submit">Save XP Settings</button>
      </form>

      <hr/>

      <h3>Rank Card Customization Unlocks</h3>
      <form method="post" action="/guild/${guildId}/customization-unlocks">
        <table style="border-collapse:collapse;">
          <tr><th style="text-align:left;">Feature</th><th style="text-align:left;">Required Level</th></tr>
          ${customizationOptions.map(opt => `
            <tr>
              <td>${escapeHtml(opt.label)}</td>
              <td><input type="number" min="1" max="1000" name="${opt.key}" value="${unlocks[opt.key] ?? 1}" style="width:60px" /></td>
            </tr>
          `).join("")}
        </table>
        <button type="submit">Save Customization Unlocks</button>
      </form>

      <hr/>

      <h3>Level-up Messages</h3>
      <form method="post" action="/guild/${guildId}/levelup-settings">
        <label>Level-up Channel
          <select name="level_up_channel_id">
            <option value="" ${!settings.level_up_channel_id ? "selected" : ""}>Same channel as message</option>
            ${textChannels.map(ch => `
              <option value="${ch.id}" ${settings.level_up_channel_id === ch.id ? "selected" : ""}>
                #${escapeHtml(ch.name)}
              </option>
            `).join("")}
          </select>
        </label>
        <br/><br/>

        <label>
          Level-up Message (supports {user}, {level}, {xp})<br/>
          <input name="level_up_message"
                 value="${escapeHtml(settings.level_up_message || "")}"
                 style="width:520px" />
        </label>
        <br/><br/>

        <button type="submit">Save Level-up Settings</button>
      </form>

      <form method="post" action="/guild/${guildId}/test-levelup" style="margin-top:10px;">
        <button type="submit">Test Level-up Message</button>
      </form>

      <hr/>

      <h3>Level Roles</h3>
      <form method="post" action="/guild/${guildId}/level-roles">
        <label>Level <input name="level" /></label>
        <label>Role ID <input name="role_id" /></label>
        <button type="submit">Add/Update</button>
      </form>

      <ul>
        ${levelRoles.map((r) => `
          <li>
            Level ${r.level} → Role ID ${escapeHtml(r.role_id)}
            <form style="display:inline" method="post" action="/guild/${guildId}/level-roles/delete">
              <input type="hidden" name="level" value="${r.level}" />
              <button type="submit">Delete</button>
            </form>
          </li>
        `).join("")}
      </ul>

      <hr/>

      <h3>Ignored Channels (No XP)</h3>
      <form method="post" action="/guild/${guildId}/ignored-channels">
        <label>Channel ID <input name="channel_id" /></label>
        <label>Type 
          <select name="channel_type">
            <option value="text">Text</option>
            <option value="voice">Voice</option>
          </select>
        </label>
        <button type="submit">Add</button>
      </form>

      <ul>
        ${ignoredChannels.map((c) => `
          <li>
            ${escapeHtml(c.channel_type)} Channel ID ${escapeHtml(c.channel_id)}
            <form style="display:inline" method="post" action="/guild/${guildId}/ignored-channels/delete">
              <input type="hidden" name="channel_id" value="${c.channel_id}" />
              <button type="submit">Delete</button>
            </form>
          </li>
        `).join("")}
      </ul>
    `));
    // ─────────────────────────────────────────────
    // Save customization unlocks
    // ─────────────────────────────────────────────
    app.post("/guild/:guildId/customization-unlocks", mustBeLoggedIn, async (req, res) => {
      try {
        const guildId = req.params.guildId;
        const { setCustomizationUnlock } = require("./settings");
        const customizationOptions = [
          "bgimage", "gradient", "bgcolor", "font", "border", "avatarframe"
        ];
        for (const key of customizationOptions) {
          const val = parseInt(req.body[key], 10);
          if (Number.isInteger(val) && val > 0) {
            await setCustomizationUnlock(guildId, key, val);
          }
        }
        return res.redirect(`/guild/${guildId}`);
      } catch (e) {
        console.error("customization-unlocks save error:", e);
        return res.status(500).send("Internal Server Error");
      }
    });
  });

  // ─────────────────────────────────────────────
  // Save XP settings
  // ─────────────────────────────────────────────
  app.post("/guild/:guildId/settings", mustBeLoggedIn, async (req, res) => {
    try {
      const guildId = req.params.guildId;

      const patch = {
        message_xp_min: parseInt(req.body.message_xp_min, 10),
        message_xp_max: parseInt(req.body.message_xp_max, 10),
        message_cooldown_seconds: parseInt(req.body.message_cooldown_seconds, 10),
        reaction_xp: parseInt(req.body.reaction_xp, 10),
        reaction_cooldown_seconds: parseInt(req.body.reaction_cooldown_seconds, 10),
        voice_xp_per_minute: parseInt(req.body.voice_xp_per_minute, 10)
      };

      await updateGuildSettings(guildId, patch);
      return res.redirect(`/guild/${guildId}`);
    } catch (e) {
      console.error("settings save error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  // ─────────────────────────────────────────────
  // Save level-up settings (channel + message)
  // ─────────────────────────────────────────────
  app.post("/guild/:guildId/levelup-settings", mustBeLoggedIn, async (req, res) => {
    try {
      const guildId = req.params.guildId;

      const level_up_channel_id = String(req.body.level_up_channel_id || "").trim();
      const level_up_message = String(req.body.level_up_message || "").trim();

      await updateGuildSettings(guildId, {
        level_up_channel_id: level_up_channel_id || null,
        level_up_message
      });

      return res.redirect(`/guild/${guildId}`);
    } catch (e) {
      console.error("levelup-settings error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  // ─────────────────────────────────────────────
  // Test level-up message (decoy, no XP changes)
  // ─────────────────────────────────────────────
  app.post("/guild/:guildId/test-levelup", mustBeLoggedIn, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return res.status(404).send("Bot is not in that guild.");

      const settings = await getGuildSettings(guildId);

      let target = null;

      if (settings.level_up_channel_id) {
        target = await guild.channels.fetch(settings.level_up_channel_id).catch(() => null);
      }

      if (!isTextChannelLike(target)) {
        await guild.channels.fetch().catch(() => {});
        target = guild.channels.cache.find((c) => isTextChannelLike(c)) || null;
      }

      if (!isTextChannelLike(target)) {
        return res.status(400).send("No text channel available to send the test message.");
      }

      const template =
        settings.level_up_message ||
        "🎉 Congratulations {user}! you just advanced to the next **Lop Level {level}**! 🍪✨";

      const msg = String(template)
        .replaceAll("{user}", "TestUser")
        .replaceAll("{level}", "99")
        .replaceAll("{xp}", "999999");

      await target.send(`🧪 **Level-up Test**\n${msg}`).catch((err) => {
        console.error("Failed to send test message:", err);
      });

      return res.redirect(`/guild/${guildId}`);
    } catch (e) {
      console.error("test-levelup error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  // ─────────────────────────────────────────────
  // Level roles
  // ─────────────────────────────────────────────
  app.post("/guild/:guildId/level-roles", mustBeLoggedIn, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const level = parseInt(req.body.level, 10);
      const roleId = String(req.body.role_id || "").trim();

      if (!Number.isInteger(level) || level < 0) return res.status(400).send("Invalid level.");
      if (!roleId) return res.status(400).send("Role ID required.");

      await setLevelRole(guildId, level, roleId);
      return res.redirect(`/guild/${guildId}`);
    } catch (e) {
      console.error("level-roles save error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  app.post("/guild/:guildId/level-roles/delete", mustBeLoggedIn, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const level = parseInt(req.body.level, 10);
      if (!Number.isInteger(level)) return res.status(400).send("Invalid level.");

      await deleteLevelRole(guildId, level);
      return res.redirect(`/guild/${guildId}`);
    } catch (e) {
      console.error("level-roles delete error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  // Ignored channels
  // ─────────────────────────────────────────────
  app.post("/guild/:guildId/ignored-channels", mustBeLoggedIn, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const channelId = String(req.body.channel_id || "").trim();
      const channelType = String(req.body.channel_type || "").trim();

      if (!channelId) return res.status(400).send("Channel ID required.");
      if (!["text", "voice"].includes(channelType)) return res.status(400).send("Invalid channel type.");

      await addIgnoredChannel(guildId, channelId, channelType);
      return res.redirect(`/guild/${guildId}`);
    } catch (e) {
      console.error("ignored-channels add error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  app.post("/guild/:guildId/ignored-channels/delete", mustBeLoggedIn, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const channelId = String(req.body.channel_id || "").trim();

      if (!channelId) return res.status(400).send("Channel ID required.");

      await removeIgnoredChannel(guildId, channelId);
      return res.redirect(`/guild/${guildId}`);
    } catch (e) {
      console.error("ignored-channels delete error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  // Render needs 0.0.0.0
  app.listen(port, "0.0.0.0", () => {
    console.log(`Dashboard running on port ${port}`);
  });
}

module.exports = { startDashboard };