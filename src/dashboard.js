const express = require("express");
const session = require("express-session");
const passport = require("passport");
const multer = require("multer");
const upload = multer({ dest: "uploads/" });

const { get, run } = require("./db");

// Discord OAuth2 setup
const DiscordStrategy = require("passport-discord").Strategy;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_CALLBACK_URL = process.env.DISCORD_CALLBACK_URL || "https://lop-bot-clean-production.up.railway.app";

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

function htmlTemplate(content, opts = {}) {
  // opts: { user, isAdmin, active }
  const user = opts.user;
  const isAdmin = opts.isAdmin;
  const active = opts.active || "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Lop-Bot</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700&display=swap" rel="stylesheet">
  <style>
    /* Light mode (default) */
    body, body[data-theme="light"] {
      font-family: 'Montserrat', Arial, sans-serif;
      background: linear-gradient(135deg, #ffddfc 0%, #edd7ae 100%);
      margin: 0;
      padding: 0;
      color: #0a1e1e;
      min-height: 100vh;
    }
    nav, body[data-theme="light"] nav {
      background: linear-gradient(135deg, #71faf9 0%, #71faf9 100%);
      padding: 0 24px;
      display: flex;
      align-items: center;
      height: 56px;
      box-shadow: 0 2px 12px rgba(113, 250, 249, 0.3);
    }
    .nav-links {
      display: flex;
      align-items: center;
      gap: 0;
    }
    nav .logo, body[data-theme="light"] nav .logo {
      font-weight: 700;
      font-size: 1.3em;
      color: #0a1e1e;
      margin-right: 32px;
      letter-spacing: 1px;
    }
    nav a, body[data-theme="light"] nav a {
      color: #0a1e1e;
      text-decoration: none;
      margin-right: 24px;
      font-weight: 600;
      transition: color 0.2s;
      padding: 4px 0;
      border-bottom: 2px solid transparent;
    }
    nav a.active, nav a:hover, body[data-theme="light"] nav a.active, body[data-theme="light"] nav a:hover {
      color: #ffddfc;
      border-bottom: 2px solid #ffddfc;
    }
    nav .nav-right, body[data-theme="light"] nav .nav-right {
      margin-left: auto;
      display: flex;
      align-items: center;
    }
    nav .user, body[data-theme="light"] nav .user {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.97em;
      color: #0a1e1e;
    }
    nav .user img, body[data-theme="light"] nav .user img {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      border: 2px solid #ffddfc;
      background: #444;
    }

    /* Dark mode */
    body[data-theme="dark"] {
      background: linear-gradient(135deg, #0a1e1e 0%, #0d2626 100%);
      color: #f0f0f0;
    }
    body[data-theme="dark"] nav {
      background: linear-gradient(135deg, #ffddfc 0%, #edd7ae 100%);
      box-shadow: 0 2px 12px rgba(255, 221, 252, 0.3);
    }
    body[data-theme="dark"] nav .logo {
      color: #0a1e1e;
    }
    body[data-theme="dark"] nav a {
      color: #0a1e1e;
    }
    body[data-theme="dark"] nav a.active, body[data-theme="dark"] nav a:hover {
      color: #0d2626;
      border-bottom-color: #0d2626;
    }
    body[data-theme="dark"] nav .user {
      color: #0a1e1e;
    }
    body[data-theme="dark"] nav .user img {
      border-color: #0d2626;
    }
    body[data-theme="dark"] #themeToggle {
      background: transparent;
      border: 2px solid #f0f0f0;
      color: #f0f0f0;
      cursor: pointer;
      padding: 6px 12px;
      border-radius: 4px;
      font-family: 'Montserrat', Arial, sans-serif;
      font-weight: 600;
      margin-right: 16px;
      transition: all 0.2s;
    }
    body[data-theme="dark"] #themeToggle:hover {
      background: rgba(240, 240, 240, 0.1);
    }
    body[data-theme="light"] #themeToggle {
      background: transparent;
      border: 2px solid #0a1e1e;
      color: #0a1e1e;
      cursor: pointer;
      padding: 6px 12px;
      border-radius: 4px;
      font-family: 'Montserrat', Arial, sans-serif;
      font-weight: 600;
      margin-right: 16px;
      transition: all 0.2s;
    }
    body[data-theme="light"] #themeToggle:hover {
      background: rgba(10, 30, 30, 0.1);
    }
    .container {
      max-width: 900px;
      margin: 32px auto 0 auto;
      background: rgba(255, 255, 255, 0.95);
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(113, 250, 249, 0.2);
      padding: 32px 24px 24px 24px;
      border: 2px solid rgba(113, 250, 249, 0.3);
    }
    body[data-theme="dark"] .container {
      background: rgba(13, 38, 38, 0.9);
      border: 2px solid rgba(255, 221, 252, 0.3);
      box-shadow: 0 8px 32px rgba(255, 221, 252, 0.1);
    }
    h2 {
      color: #71faf9;
      text-align: center;
      margin-top: 0;
    }
    body[data-theme="dark"] h2 {
      color: #ffddfc;
    }
    h3 {
      color: #ffddfc;
      margin-bottom: 8px;
    }
    body[data-theme="dark"] h3 {
      color: #71faf9;
    }
    button, .btn {
      background: linear-gradient(135deg, #71faf9 0%, #5fe8f7 100%);
      color: #0a1e1e;
      border: none;
      padding: 10px 18px;
      border-radius: 5px;
      cursor: pointer;
      font-family: 'Montserrat', Arial, sans-serif;
      font-weight: 600;
      font-size: 1em;
      margin: 8px 0;
      transition: all 0.3s;
      box-shadow: 0 4px 12px rgba(113, 250, 249, 0.3);
    }
    button:hover, .btn:hover {
      background: linear-gradient(135deg, #5fe8f7 0%, #71faf9 100%);
      transform: translateY(-3px);
      box-shadow: 0 6px 20px rgba(113, 250, 249, 0.5);
    }
    body[data-theme="dark"] button, body[data-theme="dark"] .btn {
      background: linear-gradient(135deg, #ffddfc 0%, #edd7ae 100%);
      color: #0a1e1e;
      box-shadow: 0 4px 12px rgba(255, 221, 252, 0.3);
    }
    body[data-theme="dark"] button:hover, body[data-theme="dark"] .btn:hover {
      background: linear-gradient(135deg, #edd7ae 0%, #ffddfc 100%);
      box-shadow: 0 6px 20px rgba(255, 221, 252, 0.5);
    }
    input, select {
      padding: 7px;
      border: 2px solid #71faf9;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.8);
      color: #0a1e1e;
      margin-bottom: 8px;
    }
    input:focus, select:focus {
      outline: none;
      border-color: #ffddfc;
      box-shadow: 0 0 12px rgba(113, 250, 249, 0.4);
      background: white;
    }
    body[data-theme="dark"] input, body[data-theme="dark"] select {
      border: 2px solid #ffddfc;
      background: rgba(13, 38, 38, 0.8);
      color: #f0f0f0;
    }
    body[data-theme="dark"] input:focus, body[data-theme="dark"] select:focus {
      outline: none;
      border-color: #71faf9;
      box-shadow: 0 0 12px rgba(255, 221, 252, 0.4);
      background: rgba(13, 38, 38, 0.95);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 18px;
    }
    th, td {
      padding: 8px 6px;
      border-bottom: 1px solid #e0e0e0;
      text-align: left;
    }
    body[data-theme="dark"] th, body[data-theme="dark"] td {
      border-bottom-color: #1a3a3a;
    }
    th {
      color: #0a1e1e;
      font-weight: 700;
      background: rgba(113, 250, 249, 0.2);
    }
    body[data-theme="dark"] th {
      color: #f0f0f0;
      background: rgba(255, 221, 252, 0.2);
    }
    tr:last-child td {
      border-bottom: none;
    }
    ul {
      list-style-type: none;
      padding: 0;
    }
    li {
      margin: 5px 0;
    }
    a {
      color: #71faf9;
      text-decoration: none;
      transition: color 0.2s;
    }
    a:hover {
      color: #ffddfc;
      text-decoration: underline;
    }
    body[data-theme="dark"] a {
      color: #ffddfc;
    }
    body[data-theme="dark"] a:hover {
      color: #71faf9;
    }
    hr {
      border: 0;
      height: 2px;
      background: linear-gradient(90deg, transparent, #71faf9 20%, #ffddfc 50%, #71faf9 80%, transparent);
      margin: 24px 0;
    }
    body[data-theme="dark"] hr {
      background: linear-gradient(90deg, transparent, #ffddfc 20%, #71faf9 50%, #ffddfc 80%, transparent);
    }
    form {
      margin-bottom: 20px;
    }
    
    /* Mobile Responsive Styles */
    @media (max-width: 768px) {
      body {
        font-size: 14px;
      }
      
      nav {
        padding: 12px;
        height: auto;
        flex-wrap: wrap;
        gap: 8px;
        justify-content: center;
      }
      
      body[data-theme="light"] nav {
        padding: 12px;
        height: auto;
      }
      
      nav .logo, body[data-theme="light"] nav .logo {
        width: 100%;
        text-align: center;
        margin: 0 0 8px 0;
        font-size: 1.2em;
      }
      
      .nav-links {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 8px;
        width: 100%;
      }
      
      nav a, body[data-theme="light"] nav a {
        margin: 0 8px;
        font-size: 0.9em;
        white-space: nowrap;
      }
      
      nav .nav-right, body[data-theme="light"] nav .nav-right {
        width: 100%;
        margin: 8px 0 0 0;
        justify-content: center;
        flex-wrap: wrap;
        gap: 8px;
      }
      
      nav .user, body[data-theme="light"] nav .user {
        flex-wrap: wrap;
        justify-content: center;
        font-size: 0.85em;
      }
      
      nav .user img, body[data-theme="light"] nav .user img {
        width: 28px;
        height: 28px;
      }
      
      #themeToggle {
        padding: 6px 10px;
        font-size: 0.85em;
        margin: 0;
      }
      
      body[data-theme="light"] #themeToggle {
        padding: 6px 10px;
        font-size: 0.85em;
      }
      
      .container {
        margin: 16px 8px;
        padding: 16px 12px;
        border-radius: 8px;
      }
      
      h2 {
        font-size: 1.4em;
      }
      
      h3 {
        font-size: 1.1em;
      }
      
      table {
        font-size: 0.85em;
        display: block;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
      }
      
      th, td {
        padding: 6px 4px;
        white-space: nowrap;
      }
      
      button, .btn {
        padding: 8px 14px;
        font-size: 0.9em;
        width: 100%;
        max-width: 300px;
        margin: 6px auto;
        display: block;
      }
      
      input, select {
        font-size: 16px; /* Prevents zoom on iOS */
        width: 100%;
        box-sizing: border-box;
      }
      
      /* Leaderboard mobile fixes */
      .leaderboard-container {
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
      }
      
      .lb-user {
        padding: 10px 6px !important;
      }
      
      .lb-avatar {
        width: 40px !important;
        height: 40px !important;
      }
      
      .lb-rank {
        font-size: 0.9em;
        width: 60px;
      }
      
      .lb-level, .lb-xp {
        width: 100px;
        font-size: 0.85em;
      }
    }
    
    @media (max-width: 480px) {
      nav .logo, body[data-theme="light"] nav .logo {
        font-size: 1.1em;
      }
      
      nav a, body[data-theme="light"] nav a {
        font-size: 0.85em;
        margin: 0 4px;
      }
      
      .container {
        margin: 12px 4px;
        padding: 12px 8px;
      }
      
      h2 {
        font-size: 1.3em;
      }
      
      table {
        font-size: 0.75em;
      }
      
      th, td {
        padding: 4px 2px;
      }
      
      .lb-avatar {
        width: 32px !important;
        height: 32px !important;
      }
      
      .lb-user span {
        font-size: 0.9em;
      }
      
      .lb-rank {
        width: 50px;
        padding-left: 2px !important;
      }
    }
  </style>
  <script>
    // Initialize theme from localStorage or dark mode default
    function initTheme() {
      const savedTheme = localStorage.getItem('lop-theme') || 'dark';
      document.body.setAttribute('data-theme', savedTheme);
      updateThemeButton(savedTheme);
    }
    
    // Update button text and icon based on current theme
    function updateThemeButton(theme) {
      const btn = document.getElementById('themeToggle');
      if (btn) {
        if (theme === 'dark') {
          btn.textContent = '☀️ Light';
        } else {
          btn.textContent = '🌙 Dark';
        }
      }
    }
    
    // Toggle between dark and light themes
    function toggleTheme() {
      const currentTheme = document.body.getAttribute('data-theme') || 'dark';
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      document.body.setAttribute('data-theme', newTheme);
      localStorage.setItem('lop-theme', newTheme);
      updateThemeButton(newTheme);
    }
    
    // Initialize on page load
    document.addEventListener('DOMContentLoaded', initTheme);
  </script>
</head>
<body data-theme="dark">
  <nav>
    <span class="logo">Lop-Bot</span>
    <div class="nav-links">
      <a href="/"${active==="home"?" class=active":""}>Home</a>
      <a href="/leaderboard"${active==="leaderboard"?" class=active":""}>Leaderboard</a>
      <a href="/lop"${active==="rankcard"?" class=active":""}>Rank Card</a>
      ${isAdmin?'<a href="/dashboard"'+(active==="admin"?' class=active':'')+'>Admin</a>':''}
    </div>
    <span class="nav-right">
      <button id="themeToggle" onclick="toggleTheme()">☀️ Light</button>
      ${user?`<span class="user"><img src="https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64" alt="avatar" />${escapeHtml(user.username)}#${escapeHtml(user.discriminator)} <a href="/logout" class="btn" style="margin-left:10px;">Logout</a></span>`:`<a href="/login" class="btn">Login with Discord</a>`}
    </span>
  </nav>
  <div class="container">
    ${content}
  </div>
</body>
</html>`;
}

function mustBeLoggedIn(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  // Store original URL for redirect after login
  if (req.session) req.session.returnTo = req.originalUrl;
  return res.redirect("/login");
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const { getGuildSettings, getLevelRoles, getIgnoredChannels } = require("./settings");
const { ChannelType } = require("discord.js");

function startDashboard(client) {
    const app = express();
    app.locals.client = client;
    // Helper: get user and admin info for templates
    function getTemplateOpts(req) {
      const user = req.user || null;
      let isAdmin = false;
      if (user && typeof isAdminOrManagerDiscord === 'function' && req.app && req.app.locals && req.app.locals.client) {
        isAdmin = isAdminOrManagerDiscord(user, req.app.locals.client);
      } else if (user && typeof isAdminOrManagerDiscord === 'function') {
        // fallback for direct calls
        isAdmin = isAdminOrManagerDiscord(user, client);
      }
      return { user, isAdmin };
    }

    // Helper: check if user is admin/manager in any guild the bot is in
    function isAdminOrManagerDiscord(user, client) {
      if (!user || !user.id) return false;
      if (process.env.BOT_MANAGER_ID && user.id === process.env.BOT_MANAGER_ID) return true;
      for (const guild of client.guilds.cache.values()) {
        const member = guild.members.cache.get(user.id);
        if (member && (member.permissions.has("Administrator") || member.permissions.has("ManageGuild"))) {
          return true;
        }
      }
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

    // Leaderboard page
    app.get("/leaderboard", async (req, res) => {
      try {
        // For now, use the first guild the bot is in
        const guild = client.guilds.cache.first();
        if (!guild) {
          return res.send(htmlTemplate(`<h2>Leaderboard</h2><p>The bot is not in any servers.</p>`, { ...getTemplateOpts(req), active: "leaderboard" }));
        }
        // Fetch all users by XP
        const { all } = require("./db");
        const rows = await all(
          `SELECT user_id, xp, level FROM user_xp WHERE guild_id=? ORDER BY xp DESC`,
          [guild.id]
        );
        // Try to resolve usernames
        await guild.members.fetch().catch(() => {});
        const leaderboard = rows.map((r, i) => {
          const member = guild.members.cache.get(r.user_id);
          const displayName = member?.nickname || member?.user?.username || `User ${r.user_id}`;
          const avatarUrl = member?.user?.displayAvatarURL({ extension: 'png', size: 64 }) || '';
          const badge = i === 0 ? '👑 ' : i === 1 ? '🥈 ' : i === 2 ? '🥉 ' : '';
          const medalColor = i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : '#71faf9';
          return `
            <tr class="lb-row" style="background: linear-gradient(90deg, ${medalColor}15 0%, transparent 100%);">
              <td class="lb-rank" style="font-weight:700;color:${medalColor};">${badge} #${i+1}</td>
              <td class="lb-user">
                ${avatarUrl ? `<img src="${avatarUrl}" alt="${displayName}" class="lb-avatar">` : '<div class="lb-avatar-placeholder">👤</div>'}
                <span>${escapeHtml(displayName)}</span>
              </td>
              <td class="lb-level"><span style="background:linear-gradient(135deg,#71faf9,#ffddfc);-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-weight:700;">Lvl ${r.level}</span></td>
              <td class="lb-xp"><span style="color:#71faf9;font-weight:600;">${r.xp.toLocaleString()}</span></td>
            </tr>
          `;
        }).join("");
        res.send(htmlTemplate(`
          <h2>Leaderboard</h2>
          <style>
            .leaderboard-container {
              background: rgba(255, 255, 255, 0.05);
              border-radius: 12px;
              overflow: hidden;
              backdrop-filter: blur(10px);
              box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
            }
            body[data-theme="dark"] .leaderboard-container {
              background: rgba(0, 0, 0, 0.2);
            }
            .leaderboard-container table {
              width: 100%;
            }
            .lb-row {
              transition: all 0.2s ease;
              border-bottom: 1px solid rgba(113, 250, 249, 0.2);
            }
            body[data-theme="dark"] .lb-row {
              border-bottom-color: rgba(255, 221, 252, 0.15);
            }
            .lb-row:hover {
              background: linear-gradient(90deg, rgba(113, 250, 249, 0.1) 0%, rgba(255, 221, 252, 0.05) 100%) !important;
              transform: translateX(4px);
            }
            .lb-rank {
              text-align: center;
              width: 80px;
              font-size: 1.1em;
            }
            .lb-user {
              display: flex;
              align-items: center;
              gap: 12px;
              padding: 14px 12px !important;
            }
            .lb-avatar {
              width: 48px;
              height: 48px;
              border-radius: 50%;
              border: 2px solid #71faf9;
              object-fit: cover;
              box-shadow: 0 2px 8px rgba(113, 250, 249, 0.4);
            }
            body[data-theme="dark"] .lb-avatar {
              border-color: #ffddfc;
              box-shadow: 0 2px 8px rgba(255, 221, 252, 0.4);
            }
            .lb-avatar-placeholder {
              width: 48px;
              height: 48px;
              border-radius: 50%;
              background: gradient(135deg, #71faf9, #ffddfc);
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 1.8em;
              border: 2px solid #71faf9;
            }
            .lb-level, .lb-xp {
              text-align: right;
              width: 140px;
            }
            .lb-level {
              font-size: 0.95em;
            }
          </style>
          <div class="leaderboard-container">
            <table style="border-collapse: collapse;">
              <thead>
                <tr style="background: linear-gradient(135deg, #71faf9 0%, #ffddfc 100%); color: #0a1e1e;">
                  <th style="text-align:center;width:80px;padding:12px;">Rank</th>
                  <th style="padding:12px;">Player</th>
                  <th style="text-align:right;width:140px;padding:12px;">Level</th>
                  <th style="text-align:right;width:140px;padding:12px;">XP</th>
                </tr>
              </thead>
              <tbody>
                ${leaderboard}
              </tbody>
            </table>
          </div>
        `, { ...getTemplateOpts(req), active: "leaderboard" }));
      } catch (err) {
        console.error("/leaderboard error:", err);
        res.status(500).send(htmlTemplate(`<h2>Leaderboard</h2><p style="color:red;">Error loading leaderboard: ${escapeHtml(err.message)}</p>`, { ...getTemplateOpts(req), active: "leaderboard" }));
      }
    });

  // Sessions (must be before passport.session())
  app.set("trust proxy", 1);
  app.use(
    session({
      name: "lop_dashboard_session",
      secret: process.env.DASHBOARD_SESSION_SECRET || "change-me",
      resave: true,
      saveUninitialized: true,
      rolling: true,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: false, // set true only when behind HTTPS and configured correctly
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days instead of 7 days
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
      // Redirect to original URL if present, else home
      const redirectTo = req.session?.returnTo || "/";
      if (req.session) delete req.session.returnTo;
      res.redirect(redirectTo);
    }
  );
  app.get("/logout", (req, res) => {
    req.logout(() => {
      res.redirect("/");
    });
  });
    // Serve the user's customized rank card as an image, enforcing unlocks
    app.get("/lop/rankcard/image", async (req, res) => {
      const sharp = require('sharp');
      const path = require('path');
      const { createCanvas, loadImage, registerFont } = require('canvas');
      const { getCustomizationUnlocks, getCustomizationRequiredLevel } = require("./settings");
      const { get } = require("./db");
      const user = req.user;
      const userId = user?.id || null;
      // Use the first guild the bot is in
      const guild = client.guilds.cache.first();
      const guildId = guild?.id || null;
      let userLevel = 1;
      let userXp = 0;
      let unlocks = null;
      if (guildId && userId) {
        unlocks = await getCustomizationUnlocks(guildId);
        const row = await get(
          `SELECT level, xp FROM user_xp WHERE guild_id=? AND user_id=?`,
          [guildId, userId]
        );
        userLevel = row?.level ?? 1;
        userXp = row?.xp ?? 0;
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
      function isUnlocked(opt) {
        return userLevel >= (unlocks[opt] ?? 1);
      }
      // Load prefs from DB or query params (for preview)
      let prefs = {};
      try {
        const dbPrefs = await get(
          `SELECT * FROM user_rankcard_customizations WHERE guild_id = ? AND user_id = ?`,
          [guildId, userId]
        );
        if (dbPrefs) prefs = dbPrefs;
      } catch (e) {}
      let resolvedBgMode = prefs.bgmode;
      if (!resolvedBgMode) {
        if (prefs.bgimage) resolvedBgMode = "image";
        else if (prefs.gradient) resolvedBgMode = "gradient";
        else resolvedBgMode = "color";
      }
      if (resolvedBgMode === "image" && !isUnlocked("bgimage")) {
        resolvedBgMode = isUnlocked("gradient") && prefs.gradient ? "gradient" : "color";
      }
      if (resolvedBgMode === "gradient" && !isUnlocked("gradient")) {
        resolvedBgMode = "color";
      }
      prefs.bgmode = resolvedBgMode;
      
      // Override with query params for live preview (if provided)
      if (req.query.preview === 'true') {
        if (req.query.bgcolor) prefs.bgcolor = req.query.bgcolor;
        if (req.query.gradient) prefs.gradient = req.query.gradient;
        if (req.query.bgmode) prefs.bgmode = req.query.bgmode;
        if (req.query.font) prefs.font = req.query.font;
        if (req.query.fontcolor) prefs.fontcolor = req.query.fontcolor;
        if (req.query.avatarborder) prefs.avatarborder = req.query.avatarborder;
        if (req.query.avatarbordercolor) prefs.avatarbordercolor = req.query.avatarbordercolor;
        if (req.query.borderglow) prefs.borderglow = req.query.borderglow;
        if (req.query.avatarframe) prefs.avatarframe = req.query.avatarframe;
      }
      
      // Canvas size unified with Discord bot: 600x180
      const width = 600, height = 180;
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext("2d");
      let bgMode = prefs.bgmode;
      if (!bgMode) {
        if (prefs.bgimage) bgMode = "image";
        else if (prefs.gradient) bgMode = "gradient";
        else bgMode = "color";
      }
      if (bgMode === "image" && !isUnlocked("bgimage")) {
        bgMode = isUnlocked("gradient") && prefs.gradient ? "gradient" : "color";
      }
      if (bgMode === "gradient" && !isUnlocked("gradient")) {
        bgMode = "color";
      }

      if (bgMode === "image" && prefs.bgimage && isUnlocked("bgimage")) {
        try {
          let imgPath = path.resolve(prefs.bgimage);
          const img = await loadImage(imgPath);
          ctx.drawImage(img, 0, 0, width, height);
        } catch (e) {
          bgMode = isUnlocked("gradient") && prefs.gradient ? "gradient" : "color";
        }
      }

      if (bgMode === "gradient") {
        if (prefs.gradient && isUnlocked("gradient")) {
          const colors = prefs.gradient.split(",").map(s => s.trim()).filter(Boolean);
          if (colors.length > 1) {
            const grad = ctx.createLinearGradient(0, 0, width, height);
            colors.forEach((c, i) => grad.addColorStop(i / (colors.length - 1), c));
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, width, height);
          } else {
            ctx.fillStyle = prefs.bgcolor && isUnlocked("bgcolor") ? prefs.bgcolor : "#1a2a2a";
            ctx.fillRect(0, 0, width, height);
          }
        } else {
          ctx.fillStyle = prefs.bgcolor && isUnlocked("bgcolor") ? prefs.bgcolor : "#1a2a2a";
          ctx.fillRect(0, 0, width, height);
        }
      } else if (bgMode === "color") {
        ctx.fillStyle = prefs.bgcolor && isUnlocked("bgcolor") ? prefs.bgcolor : "#1a2a2a";
        ctx.fillRect(0, 0, width, height);
      }
      // Font (only if unlocked)
      let fontFamily = "OpenSans";
      if (prefs.font && isUnlocked("font")) {
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
        fontFamily = fontMap[prefs.font] || "'Open Sans',sans-serif";
      }
      
      // Helper function to draw avatar border and frame effects
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
      
      // Draw profile pic (circle)
      ctx.save();
      ctx.beginPath();
      ctx.arc(90, 90, 60, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      try {
        let avatarURL = user?.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128` : null;
        if (avatarURL) {
          let fetchFn = (typeof fetch === 'function') ? fetch : require('node-fetch');
          let res = await fetchFn(avatarURL);
          if (res.ok) {
            let avatarBuffer = typeof res.buffer === 'function' ? await res.buffer() : Buffer.from(await res.arrayBuffer());
            const avatar = await loadImage(avatarBuffer);
            ctx.drawImage(avatar, 30, 30, 120, 120);
          } else {
            throw new Error('Avatar fetch failed');
          }
        } else {
          ctx.fillStyle = "#555";
          ctx.fillRect(30, 30, 120, 120);
          ctx.font = `bold 40px ${fontFamily}`;
          ctx.fillStyle = "#fff";
          ctx.fillText(user?.username ? user.username[0].toUpperCase() : "?", 80, 120);
        }
      } catch (e) {
        ctx.fillStyle = "#555";
        ctx.fillRect(30, 30, 120, 120);
        ctx.font = `bold 40px ${fontFamily}`;
        ctx.fillStyle = "#fff";
        ctx.fillText(user?.username ? user.username[0].toUpperCase() : "?", 80, 120);
      }
      ctx.restore();
      
      // Draw avatar border and frame effects if unlocked
      if (isUnlocked('border') || isUnlocked('avatarframe')) {
        drawAvatarBorder(ctx, prefs);
      }
      
      // Draw text with outline for visibility
      ctx.font = `bold 28px ${fontFamily}`;
      ctx.fillStyle = prefs.fontcolor || "#fff";
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.lineWidth = 3;
      ctx.strokeText(user?.tag || "Your Name", 170, 70);
      ctx.fillText(user?.tag || "Your Name", 170, 70);
      
      ctx.font = `bold 22px ${fontFamily}`;
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "rgba(0,0,0,0.7)";
      ctx.lineWidth = 2;
      ctx.strokeText(`Level: ${userLevel}`, 170, 110);
      ctx.fillText(`Level: ${userLevel}`, 170, 110);
      
      ctx.font = `16px ${fontFamily}`;
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "rgba(0,0,0,0.7)";
      ctx.lineWidth = 2;
      ctx.strokeText(`XP: ${userXp} / ${userXp + 100}`, 170, 140);
      ctx.fillText(`XP: ${userXp} / ${userXp + 100}`, 170, 140);
      // Progress bar
      const barX = 170, barY = 150, barW = 380, barH = 20;
      ctx.fillStyle = "#e8f8f8";
      ctx.fillRect(barX, barY, barW, barH);
      const progressGrad = ctx.createLinearGradient(barX, barY, barX + barW * 0.1, barY);
      progressGrad.addColorStop(0, "#71faf9");
      progressGrad.addColorStop(1, "#2ab3b0");
      ctx.fillStyle = progressGrad;
      ctx.fillRect(barX, barY, barW * 0.1, barH);
      ctx.strokeStyle = "#71faf9";
      ctx.lineWidth = 2;
      ctx.strokeRect(barX, barY, barW, barH);
      ctx.font = `bold 16px ${fontFamily}`;
      ctx.fillStyle = "#0a1e1e";
      ctx.fillText(`0 / 100 XP this level`, barX + 10, barY + 16);
      // Output as PNG
      res.setHeader("Content-Type", "image/png");
      res.send(canvas.toBuffer());
    });

    // POST endpoint for previewing with uploaded image (for cropped image preview)
    app.post("/lop/rankcard/preview", upload.single("bgimage"), async (req, res) => {
      try {
        const sharp = require('sharp');
        const path = require('path');
        const { createCanvas, loadImage, registerFont } = require('canvas');
        const { getCustomizationUnlocks } = require("./settings");
        const { get } = require("./db");
        const user = req.user;
        const userId = user?.id || null;
        const guild = client.guilds.cache.first();
        const guildId = guild?.id || null;
        let userLevel = 1;
        let userXp = 0;
        let unlocks = null;
        
        if (guildId && userId) {
          unlocks = await getCustomizationUnlocks(guildId);
          const row = await get(
            `SELECT level, xp FROM user_xp WHERE guild_id=? AND user_id=?`,
            [guildId, userId]
          );
          userLevel = row?.level ?? 1;
          userXp = row?.xp ?? 0;
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
        
        function isUnlocked(opt) {
          return userLevel >= (unlocks[opt] ?? 1);
        }
        
        // Load prefs from form body (for preview)
        let prefs = {
          bgcolor: req.body.bgcolor || "#1a2a2a",
          gradient: req.body.gradient || "",
          bgmode: req.body.bgmode || "",
          font: req.body.font || "OpenSans",
          fontcolor: req.body.fontcolor || "#ffffff",
          avatarborder: parseInt(req.body.avatarborder) || 3,
          avatarbordercolor: req.body.avatarbordercolor || "#71faf9",
          borderglow: req.body.borderglow || "none",
          avatarframe: req.body.avatarframe || "none"
        };
        
        const width = 600, height = 180;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext("2d");
        
        let bgMode = prefs.bgmode;
        if (!bgMode) {
          if (req.file) bgMode = "image";
          else if (prefs.gradient) bgMode = "gradient";
          else bgMode = "color";
        }
        if (bgMode === "image" && !isUnlocked("bgimage")) {
          bgMode = isUnlocked("gradient") && prefs.gradient ? "gradient" : "color";
        }
        if (bgMode === "gradient" && !isUnlocked("gradient")) {
          bgMode = "color";
        }

        if (bgMode === "image" && req.file && isUnlocked("bgimage")) {
          try {
            const img = await loadImage(req.file.path);
            ctx.drawImage(img, 0, 0, width, height);
          } catch (e) {
            bgMode = isUnlocked("gradient") && prefs.gradient ? "gradient" : "color";
          }
        }

        if (bgMode === "gradient") {
          if (prefs.gradient && isUnlocked("gradient")) {
            const colors = prefs.gradient.split(",").map(s => s.trim()).filter(Boolean);
            if (colors.length > 1) {
              const grad = ctx.createLinearGradient(0, 0, width, height);
              colors.forEach((c, i) => grad.addColorStop(i / (colors.length - 1), c));
              ctx.fillStyle = grad;
              ctx.fillRect(0, 0, width, height);
            } else {
              ctx.fillStyle = prefs.bgcolor;
              ctx.fillRect(0, 0, width, height);
            }
          } else {
            ctx.fillStyle = prefs.bgcolor;
            ctx.fillRect(0, 0, width, height);
          }
        } else if (bgMode === "color") {
          ctx.fillStyle = prefs.bgcolor;
          ctx.fillRect(0, 0, width, height);
        }
        
        // Font
        let fontFamily = "OpenSans";
        if (prefs.font && isUnlocked("font")) {
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
          fontFamily = fontMap[prefs.font] || "'Open Sans',sans-serif";
        }
        
        // Draw avatar
        ctx.save();
        ctx.beginPath();
        ctx.arc(90, 90, 60, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        try {
          let avatarURL = user?.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128` : null;
          if (avatarURL) {
            let fetchFn = (typeof fetch === 'function') ? fetch : require('node-fetch');
            let res2 = await fetchFn(avatarURL);
            if (res2.ok) {
              let avatarBuffer = typeof res2.buffer === 'function' ? await res2.buffer() : Buffer.from(await res2.arrayBuffer());
              const avatar = await loadImage(avatarBuffer);
              ctx.drawImage(avatar, 30, 30, 120, 120);
            } else {
              throw new Error('Avatar fetch failed');
            }
          } else {
            ctx.fillStyle = "#555";
            ctx.fillRect(30, 30, 120, 120);
            ctx.font = `bold 40px ${fontFamily}`;
            ctx.fillStyle = "#fff";
            ctx.fillText(user?.username ? user.username[0].toUpperCase() : "?", 80, 120);
          }
        } catch (e) {
          ctx.fillStyle = "#555";
          ctx.fillRect(30, 30, 120, 120);
          ctx.font = `bold 40px ${fontFamily}`;
          ctx.fillStyle = "#fff";
          ctx.fillText(user?.username ? user.username[0].toUpperCase() : "?", 80, 120);
        }
        ctx.restore();
        
        // Draw avatar border and frame
        function drawAvatarBorder(ctx, prefs) {
          const centerX = 90, centerY = 90, radius = 60;
          const borderWidth = parseInt(prefs.avatarborder) || 3;
          const borderColor = prefs.avatarbordercolor || '#71faf9';
          const glowType = prefs.borderglow || 'none';
          const frameType = prefs.avatarframe || 'none';
          
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
            ctx.strokeStyle = ctx.strokeStyle;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius + 14, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }
          
          ctx.save();
          if (glowType !== 'none') {
            const glowRadius = glowType === 'subtle' ? 8 : glowType === 'medium' ? 16 : 24;
            ctx.shadowColor = borderColor + '80';
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
        
        if (isUnlocked('border') || isUnlocked('avatarframe')) {
          drawAvatarBorder(ctx, prefs);
        }
        
        // Draw text with outline for visibility
        ctx.font = `bold 28px ${fontFamily}`;
        ctx.fillStyle = prefs.fontcolor || "#fff";
        ctx.strokeStyle = "rgba(0,0,0,0.6)";
        ctx.lineWidth = 3;
        ctx.strokeText(user?.tag || "Your Name", 170, 70);
        ctx.fillText(user?.tag || "Your Name", 170, 70);
        
        ctx.font = `bold 22px ${fontFamily}`;
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "rgba(0,0,0,0.7)";
        ctx.lineWidth = 2;
        ctx.strokeText(`Level: ${userLevel}`, 170, 110);
        ctx.fillText(`Level: ${userLevel}`, 170, 110);
        
        ctx.font = `16px ${fontFamily}`;
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "rgba(0,0,0,0.7)";
        ctx.lineWidth = 2;
        ctx.strokeText(`XP: ${userXp} / ${userXp + 100}`, 170, 140);
        ctx.fillText(`XP: ${userXp} / ${userXp + 100}`, 170, 140);
        
        // Progress bar
        const barX = 170, barY = 150, barW = 380, barH = 20;
        ctx.fillStyle = "#e8f8f8";
        ctx.fillRect(barX, barY, barW, barH);
        const progressGrad = ctx.createLinearGradient(barX, barY, barX + barW * 0.1, barY);
        progressGrad.addColorStop(0, "#71faf9");
        progressGrad.addColorStop(1, "#2ab3b0");
        ctx.fillStyle = progressGrad;
        ctx.fillRect(barX, barY, barW * 0.1, barH);
        ctx.strokeStyle = "#71faf9";
        ctx.lineWidth = 2;
        ctx.strokeRect(barX, barY, barW, barH);
        ctx.font = `bold 16px ${fontFamily}`;
        ctx.fillStyle = "#0a1e1e";
        ctx.fillText(`0 / 100 XP this level`, barX + 10, barY + 16);
        
        res.setHeader("Content-Type", "image/png");
        res.send(canvas.toBuffer());
      } catch (err) {
        console.error("/lop/rankcard/preview error:", err);
        res.status(500).send("Failed to generate preview");
      }
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
    const opts = getTemplateOpts(req);
    res.send(htmlTemplate(`
      <h2>Welcome to Lop-Bot!</h2>
      <p>Track your XP, level up, and customize your rank card. Compete on the leaderboard and unlock new features as you level up!</p>
      <ul>
        <li>View the <a href="/leaderboard">Leaderboard</a></li>
        <li>Customize your <a href="/lop">Rank Card</a></li>
        <li>${opts.isAdmin ? 'Access the <a href="/dashboard">Admin Dashboard</a>' : (opts.user ? 'You are not a server admin/manager.' : 'Login to access more features')}</li>
      </ul>
    `, { ...opts, active: "home" }));
  });

  // Public rank card customization UI (example, not full-featured)
  app.get("/lop", async (req, res) => {
    const user = req.user;
    const userId = user?.id || null;
    // Use the first guild the bot is in
    const guild = client.guilds.cache.first();
    const guildId = guild?.id || null;
    let userLevel = 1;
    let userXp = 0;
    let unlocks = null;
    if (guildId && userId) {
      const { getCustomizationUnlocks } = require("./settings");
      const { get } = require("./db");
      unlocks = await getCustomizationUnlocks(guildId);
      const row = await get(
        `SELECT level, xp FROM user_xp WHERE guild_id=? AND user_id=?`,
        [guildId, userId]
      );
      userLevel = row?.level ?? 1;
      userXp = row?.xp ?? 0;
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
    // In-memory user prefs (replace with DB in production)
      // Load prefs from DB
      let prefs = {};
      try {
        const dbPrefs = await get(
          `SELECT * FROM user_rankcard_customizations WHERE guild_id = ? AND user_id = ?`,
          [guildId, userId]
        );
        if (dbPrefs) prefs = dbPrefs;
      } catch (e) {}
    // Render customization form if logged in
    let formHtml = "";
    if (user) {
      formHtml = `
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.13/cropper.min.css" />
      <link href="https://fonts.googleapis.com/css?family=Montserrat:400,700|Open+Sans:400,700|Arial|Comic+Sans+MS|Times+New+Roman|Roboto|Lobster|Pacifico|Oswald|Raleway|Bebas+Neue|Merriweather|Nunito|Poppins|Quicksand|Source+Code+Pro|Caveat|Indie+Flower|Fira+Sans|Lato|Playfair+Display|Abril+Fatface|Anton|Bangers|Dancing+Script|Permanent+Marker|PT+Serif|Rubik|Satisfy|Teko|Varela+Round|Zilla+Slab&display=swap" rel="stylesheet">
      <style>
        .customize-form {
          background: rgba(255,255,255,0.05);
          border-radius: 12px;
          padding: 24px;
          margin-top: 20px;
          backdrop-filter: blur(10px);
        }
        body[data-theme="dark"] .customize-form {
          background: rgba(0,0,0,0.2);
        }
        .customize-section {
          margin-bottom: 28px;
          padding-bottom: 20px;
          border-bottom: 1px solid rgba(113,250,249,0.2);
        }
        body[data-theme="dark"] .customize-section {
          border-bottom-color: rgba(255,221,252,0.15);
        }
        .customize-section:last-child {
          border-bottom: none;
          margin-bottom: 0;
          padding-bottom: 0;
        }
        .section-title {
          font-weight: 700;
          font-size: 1.1em;
          margin-bottom: 14px;
          color: #71faf9;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        body[data-theme="dark"] .section-title {
          color: #ffddfc;
        }
        .customize-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 16px;
          align-items: end;
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .form-group label {
          font-weight: 600;
          font-size: 0.95em;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .feature-badge {
          font-size: 0.75em;
          padding: 2px 8px;
          border-radius: 4px;
          background: rgba(113,250,249,0.2);
          color: #71faf9;
        }
        body[data-theme="dark"] .feature-badge {
          background: rgba(255,221,252,0.2);
          color: #ffddfc;
        }
        .feature-badge.locked {
          background: rgba(184,134,11,0.2);
          color: #b8860b;
        }
        .customize-form input[type="color"] {
          width: 60px;
          height: 44px;
          padding: 2px;
          border: 2px solid rgba(113,250,249,0.5);
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .customize-form input[type="color"]:hover {
          border-color: #71faf9;
          box-shadow: 0 0 12px rgba(113,250,249,0.5);
        }
        .customize-form input[type="text"],
        .customize-form select,
        .customize-form input[type="number"] {
          padding: 8px 12px;
          border: 2px solid rgba(113,250,249,0.3);
          border-radius: 6px;
          background: rgba(255,255,255,0.95);
          color: #0a1e1e;
          font-size: 0.95em;
          transition: all 0.2s;
        }
        body[data-theme="dark"] .customize-form input[type="color"] {
          border-color: rgba(255,221,252,0.5);
        }
        body[data-theme="dark"] .customize-form input[type="color"]:hover {
          border-color: #ffddfc;
          box-shadow: 0 0 12px rgba(255,221,252,0.5);
        }
        body[data-theme="dark"] .customize-form input[type="text"],
        body[data-theme="dark"] .customize-form select,
        body[data-theme="dark"] .customize-form input[type="number"] {
          background: rgba(0,0,0,0.3);
          color: #f0f0f0;
          border-color: rgba(255,221,252,0.3);
        }
        .customize-form input[type="color"]:disabled,
        .customize-form select:disabled,
        .customize-form input:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .customize-form input:focus,
        .customize-form select:focus {
          outline: none;
          border-color: #71faf9;
          box-shadow: 0 0 8px rgba(113,250,249,0.4);
        }
        body[data-theme="dark"] .customize-form input:focus,
        body[data-theme="dark"] .customize-form select:focus {
          border-color: #ffddfc;
          box-shadow: 0 0 8px rgba(255,221,252,0.4);
        }
        .image-upload-area {
          border: 2px dashed rgba(113,250,249,0.4);
          border-radius: 8px;
          padding: 20px;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s;
          background: rgba(113,250,249,0.05);
        }
        body[data-theme="dark"] .image-upload-area {
          border-color: rgba(255,221,252,0.4);
          background: rgba(255,221,252,0.05);
        }
        .image-upload-area:hover {
          border-color: #71faf9;
          background: rgba(113,250,249,0.1);
        }
        body[data-theme="dark"] .image-upload-area:hover {
          border-color: #ffddfc;
          background: rgba(255,221,252,0.1);
        }
        .image-upload-area.dragover {
          border-color: #71faf9;
          background: rgba(113,250,249,0.15);
          transform: scale(1.02);
        }
        #cropperContainer {
          margin-top: 16px;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 4px 12px rgba(0,0,0,0.2);
          padding: 16px;
          background: rgba(113, 250, 249, 0.05);
        }
        #cropperContainer img {
          border-radius: 8px;
          max-width: 100%;
          display: block;
        }
        .crop-actions {
          display: flex;
          gap: 12px;
          margin-top: 12px;
          justify-content: flex-end;
        }
        .crop-actions button {
          padding: 10px 20px;
          border: none;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .crop-confirm-btn {
          background: linear-gradient(135deg, #71faf9, #2ab3b0);
          color: #0a1e1e;
        }
        .crop-confirm-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(113, 250, 249, 0.4);
        }
        .crop-cancel-btn {
          background: #555;
          color: #fff;
        }
        .crop-cancel-btn:hover {
          background: #666;
        }
        #cropPreviewText {
          font-size: 0.9em;
          color: #71faf9;
          margin-top: 8px;
          font-style: italic;
        }
        .preset-colors {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-top: 8px;
        }
        .preset-btn {
          width: 40px;
          height: 40px;
          border-radius: 6px;
          border: 2px solid #ccc;
          cursor: pointer;
          transition: all 0.2s;
          padding: 0;
          font-size: 0;
        }
        .preset-btn:hover {
          transform: scale(1.1);
          border-color: #71faf9;
        }
        .customize-form button[type="submit"] {
          background: linear-gradient(135deg, #71faf9, #ffddfc);
          color: #0a1e1e;
          border: none;
          padding: 12px 28px;
          border-radius: 8px;
          font-weight: 700;
          cursor: pointer;
          font-size: 1em;
          transition: all 0.2s;
          box-shadow: 0 4px 12px rgba(113,250,249,0.3);
          margin-top: 24px;
        }
        .customize-form button[type="submit"]:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(113,250,249,0.5);
        }
        .customize-form button[type="submit"]:active {
          transform: translateY(0);
        }
        .reset-btn {
          background: rgba(184,134,11,0.2);
          color: #b8860b;
          border: 1px solid #b8860b;
          padding: 8px 16px;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
          font-size: 0.9em;
          transition: all 0.2s;
        }
        .reset-btn:hover {
          background: rgba(184,134,11,0.3);
        }
        
        /* Mobile styles for customization form */
        @media (max-width: 768px) {
          .customize-form {
            padding: 16px;
          }
          
          .customize-section {
            margin-bottom: 20px;
            padding-bottom: 16px;
          }
          
          .section-title {
            font-size: 1em;
            flex-wrap: wrap;
            gap: 4px;
          }
          
          .customize-grid {
            grid-template-columns: 1fr;
            gap: 12px;
          }
          
          .form-group label {
            font-size: 0.9em;
          }
          
          .customize-form input[type="color"],
          .customize-form input[type="text"],
          .customize-form select,
          .customize-form input[type="number"] {
            font-size: 16px;
            width: 100%;
            box-sizing: border-box;
          }
          
          .image-upload-area {
            padding: 16px;
          }
          
          #cropperContainer {
            max-width: 100%;
          }
          
          #cropperContainer img {
            max-width: 100%;
            height: auto;
          }
          
          .customize-form button[type="submit"],
          .reset-btn {
            width: 100%;
            max-width: none;
            padding: 10px 20px;
          }
        }
        
        @media (max-width: 480px) {
          .customize-form {
            padding: 12px;
          }
          
          .section-title {
            font-size: 0.95em;
          }
          
          .feature-badge {
            font-size: 0.7em;
            padding: 2px 6px;
          }
          
          .form-group label {
            font-size: 0.85em;
          }
          
          .image-upload-area {
            padding: 12px;
          }
          
          .avatar-frame-grid label {
            padding: 8px !important;
          }
          
          .avatar-frame-grid label > div {
            width: 50px !important;
            height: 50px !important;
            font-size: 1.5em !important;
          }
          
          .avatar-frame-grid label > span {
            font-size: 0.75em !important;
          }
          
          #cropperContainer {
            padding: 12px;
          }
          
          #cropperContainer img {
            max-height: 200px;
          }
          
          .crop-actions {
            flex-direction: column;
          }
          
          .crop-actions button {
            width: 100%;
          }
          
          .customize-form input[type="color"] {
            width: 50px;
            height: 40px;
          }
        }
        
        .avatar-frame-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
          gap: 12px;
        }
        
        @media (max-width: 768px) {
          .avatar-frame-grid {
            grid-template-columns: repeat(3, 1fr);
            gap: 8px;
          }
        }
        
        @media (max-width: 480px) {
          .avatar-frame-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 8px;
          }
        }

        .bgmode-options {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }

        .bgmode-option {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 10px;
          border-radius: 6px;
          border: 1px solid rgba(113,250,249,0.3);
          background: rgba(113,250,249,0.08);
          cursor: pointer;
        }

        .bgmode-option.disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        body[data-theme="dark"] .bgmode-option {
          border-color: rgba(255,221,252,0.3);
          background: rgba(255,221,252,0.08);
        }
        
        .form-actions {
          display: flex;
          gap: 12px;
          margin-top: 24px;
          justify-content: space-between;
        }
        
        .form-actions > div:last-child {
          display: flex;
          gap: 12px;
        }
        
        @media (max-width: 768px) {
          .form-actions {
            flex-direction: column;
            gap: 8px;
          }
          
          .form-actions > div:last-child {
            flex-direction: column;
            width: 100%;
          }
        }
      </style>
      <form id="customizeForm" class="customize-form" method="post" action="/lop/customize" enctype="multipart/form-data">
        
        <!-- Colors Section -->
        <div class="customize-section">
          <div class="section-title">
            🎨 Colors & Background
            ${!isUnlocked('bgcolor') && !isUnlocked('gradient') ? '<span class="feature-badge locked">Locked at Lvl 1</span>' : '<span class="feature-badge">Unlocked</span>'}
          </div>
          <div class="customize-grid">
            <div class="form-group" style="grid-column: 1/-1;">
              <label>Background Type</label>
              <div class="bgmode-options">
                <label class="bgmode-option">
                  <input type="radio" name="bgmode" value="color" ${prefs.bgmode === 'color' ? 'checked' : ''}>
                  <span>Single Color</span>
                </label>
                <label class="bgmode-option ${!isUnlocked('gradient') ? 'disabled' : ''}">
                  <input type="radio" name="bgmode" value="gradient" ${prefs.bgmode === 'gradient' ? 'checked' : ''} ${!isUnlocked('gradient') ? 'disabled' : ''}>
                  <span>Gradient</span>
                </label>
                <label class="bgmode-option ${!isUnlocked('bgimage') ? 'disabled' : ''}">
                  <input type="radio" name="bgmode" value="image" ${prefs.bgmode === 'image' ? 'checked' : ''} ${!isUnlocked('bgimage') ? 'disabled' : ''}>
                  <span>Image</span>
                </label>
              </div>
            </div>
            <div class="form-group">
              <label>Background Color</label>
              <input type="color" name="bgcolor" value="${prefs.bgcolor || '#1a2a2a'}" ${!isUnlocked('bgcolor') ? 'disabled' : ''}>
            </div>
            <div style="grid-column: 1/-1;">
              <label style="font-weight:600;margin-bottom:8px;display:block;">Gradient Colors <span class="feature-badge">${isUnlocked('gradient') ? 'Lvl ' + unlocks.gradient : 'Locked'}</span></label>
              <div style="display:grid;grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));gap:8px;">
                <div>
                  <input type="color" id="gradColor1" class="grad-picker" value="${prefs.gradient?.split(',')[0] || '#ffddfc'}" ${!isUnlocked('gradient') ? 'disabled' : ''}>
                </div>
                <div>
                  <input type="color" id="gradColor2" class="grad-picker" value="${prefs.gradient?.split(',')[1] || '#edd7ae'}" ${!isUnlocked('gradient') ? 'disabled' : ''}>
                </div>
              </div>
              <input type="hidden" name="gradient" id="gradientInput" value="${prefs.gradient || ''}">
            </div>
          </div>
        </div>

        <!-- Font Section -->
        <div class="customize-section">
          <div class="section-title">
            ✏️ Text Styling
            ${!isUnlocked('font') ? '<span class="feature-badge locked">Locked at Lvl ' + unlocks.font + '</span>' : '<span class="feature-badge">Lvl ' + unlocks.font + '+</span>'}
          </div>
          <div class="customize-grid">
            <div class="form-group">
              <label>Font Family</label>
              <select name="font" id="fontSelect" ${!isUnlocked('font') ? 'disabled' : ''}>
                <option value="OpenSans" style="font-family:'Open Sans',sans-serif;"${prefs.font==='OpenSans'?' selected':''}>Open Sans</option>
                <option value="Arial" style="font-family:Arial;"${prefs.font==='Arial'?' selected':''}>Arial</option>
                <option value="ComicSansMS" style="font-family:'Comic Sans MS',cursive;"${prefs.font==='ComicSansMS'?' selected':''}>Comic Sans MS</option>
                <option value="TimesNewRoman" style="font-family:'Times New Roman',serif;"${prefs.font==='TimesNewRoman'?' selected':''}>Times New Roman</option>
                <option value="Roboto" style="font-family:'Roboto',sans-serif;"${prefs.font==='Roboto'?' selected':''}>Roboto</option>
                <option value="Lobster" style="font-family:'Lobster',cursive;"${prefs.font==='Lobster'?' selected':''}>Lobster</option>
                <option value="Pacifico" style="font-family:'Pacifico',cursive;"${prefs.font==='Pacifico'?' selected':''}>Pacifico</option>
                <option value="Oswald" style="font-family:'Oswald',sans-serif;"${prefs.font==='Oswald'?' selected':''}>Oswald</option>
                <option value="Raleway" style="font-family:'Raleway',sans-serif;"${prefs.font==='Raleway'?' selected':''}>Raleway</option>
                <option value="BebasNeue" style="font-family:'Bebas Neue',sans-serif;"${prefs.font==='BebasNeue'?' selected':''}>Bebas Neue</option>
                <option value="Merriweather" style="font-family:'Merriweather',serif;"${prefs.font==='Merriweather'?' selected':''}>Merriweather</option>
                <option value="Nunito" style="font-family:'Nunito',sans-serif;"${prefs.font==='Nunito'?' selected':''}>Nunito</option>
                <option value="Poppins" style="font-family:'Poppins',sans-serif;"${prefs.font==='Poppins'?' selected':''}>Poppins</option>
                <option value="Quicksand" style="font-family:'Quicksand',sans-serif;"${prefs.font==='Quicksand'?' selected':''}>Quicksand</option>
                <option value="SourceCodePro" style="font-family:'Source Code Pro',monospace;"${prefs.font==='SourceCodePro'?' selected':''}>Source Code Pro</option>
                <option value="Caveat" style="font-family:'Caveat',cursive;"${prefs.font==='Caveat'?' selected':''}>Caveat</option>
                <option value="IndieFlower" style="font-family:'Indie Flower',cursive;"${prefs.font==='IndieFlower'?' selected':''}>Indie Flower</option>
                <option value="FiraSans" style="font-family:'Fira Sans',sans-serif;"${prefs.font==='FiraSans'?' selected':''}>Fira Sans</option>
                <option value="Lato" style="font-family:'Lato',sans-serif;"${prefs.font==='Lato'?' selected':''}>Lato</option>
                <option value="PlayfairDisplay" style="font-family:'Playfair Display',serif;"${prefs.font==='PlayfairDisplay'?' selected':''}>Playfair Display</option>
                <option value="AbrilFatface" style="font-family:'Abril Fatface',cursive;"${prefs.font==='AbrilFatface'?' selected':''}>Abril Fatface</option>
                <option value="Anton" style="font-family:'Anton',sans-serif;"${prefs.font==='Anton'?' selected':''}>Anton</option>
                <option value="Bangers" style="font-family:'Bangers',cursive;"${prefs.font==='Bangers'?' selected':''}>Bangers</option>
                <option value="DancingScript" style="font-family:'Dancing Script',cursive;"${prefs.font==='DancingScript'?' selected':''}>Dancing Script</option>
                <option value="PermanentMarker" style="font-family:'Permanent Marker',cursive;"${prefs.font==='PermanentMarker'?' selected':''}>Permanent Marker</option>
                <option value="PTSerif" style="font-family:'PT Serif',serif;"${prefs.font==='PTSerif'?' selected':''}>PT Serif</option>
                <option value="Rubik" style="font-family:'Rubik',sans-serif;"${prefs.font==='Rubik'?' selected':''}>Rubik</option>
                <option value="Satisfy" style="font-family:'Satisfy',cursive;"${prefs.font==='Satisfy'?' selected':''}>Satisfy</option>
                <option value="Teko" style="font-family:'Teko',sans-serif;"${prefs.font==='Teko'?' selected':''}>Teko</option>
                <option value="VarelaRound" style="font-family:'Varela Round',sans-serif;"${prefs.font==='VarelaRound'?' selected':''}>Varela Round</option>
                <option value="ZillaSlab" style="font-family:'Zilla Slab',serif;"${prefs.font==='ZillaSlab'?' selected':''}>Zilla Slab</option>
              </select>
            </div>
            <div class="form-group">
              <label>Font Color</label>
              <input type="color" name="fontcolor" value="${prefs.fontcolor || '#ffffff'}" ${!isUnlocked('font') ? 'disabled' : ''}>
            </div>
          </div>
        </div>

        <!-- Image Section -->
        <div class="customize-section">
          <div class="section-title">
            🖼️ Background Image
            ${!isUnlocked('bgimage') ? '<span class="feature-badge locked">Locked at Lvl ' + unlocks.bgimage + '</span>' : '<span class="feature-badge">Lvl ' + unlocks.bgimage + '+</span>'}
          </div>
          <div class="form-group" style="grid-column: 1/-1;">
            <label>Upload Image (600x180 pixels recommended)</label>
            <div class="image-upload-area" id="dropArea" ${!isUnlocked('bgimage') ? 'style="opacity:0.5;cursor:not-allowed;"' : ''}>
              <div style="font-size:2em;margin-bottom:8px;">📤</div>
              <div><strong>Drag & drop your image here</strong></div>
              <div style="font-size:0.85em;opacity:0.7;margin-top:4px;">or click to browse</div>
              <input type="file" id="bgimageInput" name="bgimage" accept="image/*" style="display:none;" ${!isUnlocked('bgimage') ? 'disabled' : ''}>
            </div>
            <div id="cropperContainer" style="margin-top:16px;display:none;">
              <label style="font-weight:600;display:block;margin-bottom:8px;">Crop & Adjust Image:</label>
              <img id="cropperImage" />
              <div class="crop-actions">
                <button type="button" class="crop-cancel-btn" onclick="cancelCrop()">✖ Cancel</button>
                <button type="button" class="crop-confirm-btn" onclick="confirmCrop()">✓ Confirm Crop</button>
              </div>
              <div id="cropPreviewText" style="display:none;">✓ Image cropped and ready to save</div>
            </div>
            <input type="hidden" name="cropX" id="cropX">
            <input type="hidden" name="cropY" id="cropY">
            <input type="hidden" name="cropW" id="cropW">
            <input type="hidden" name="cropH" id="cropH">
          </div>
        </div>

        <!-- Avatar Frame Section -->
        <div class="customize-section">
          <div class="section-title">
            ✨ Avatar Frame
            ${!isUnlocked('avatarframe') ? '<span class="feature-badge locked">Locked at Lvl ' + unlocks.avatarframe + '</span>' : '<span class="feature-badge">Lvl ' + unlocks.avatarframe + '+</span>'}
          </div>
          <div class="form-group" style="grid-column: 1/-1;">
            <label style="font-weight:600;margin-bottom:12px;display:block;">Choose a frame style:</label>
            <div class="avatar-frame-grid">
              <label style="display:flex;flex-direction:column;align-items:center;cursor:pointer;gap:6px;padding:12px;border-radius:8px;border:2px solid transparent;transition:all 0.2s;${!isUnlocked('avatarframe') ? 'opacity:0.5;cursor:not-allowed;' : ''}">
                <div style="width:70px;height:70px;border-radius:50%;background:#999;display:flex;align-items:center;justify-content:center;font-size:2em;">👤</div>
                <span style="font-weight:600;font-size:0.85em;">None</span>
                <input type="radio" name="avatarframe" value="none" ${prefs.avatarframe === 'none' || !prefs.avatarframe ? 'checked' : ''} ${!isUnlocked('avatarframe') ? 'disabled' : ''} style="display:none;">
              </label>
              <label style="display:flex;flex-direction:column;align-items:center;cursor:pointer;gap:6px;padding:12px;border-radius:8px;border:2px solid transparent;transition:all 0.2s;${!isUnlocked('avatarframe') ? 'opacity:0.5;cursor:not-allowed;' : ''}">
                <div style="width:70px;height:70px;border-radius:50%;background:linear-gradient(135deg, #FFD700, #FFA500);display:flex;align-items:center;justify-content:center;font-size:2em;box-shadow:inset 0 0 0 3px #FFD700;">👤</div>
                <span style="font-weight:600;font-size:0.85em;">Gold Ring</span>
                <input type="radio" name="avatarframe" value="gold" ${prefs.avatarframe === 'gold' ? 'checked' : ''} ${!isUnlocked('avatarframe') ? 'disabled' : ''} style="display:none;">
              </label>
              <label style="display:flex;flex-direction:column;align-items:center;cursor:pointer;gap:6px;padding:12px;border-radius:8px;border:2px solid transparent;transition:all 0.2s;${!isUnlocked('avatarframe') ? 'opacity:0.5;cursor:not-allowed;' : ''}">
                <div style="width:70px;height:70px;border-radius:50%;background:linear-gradient(135deg, #C0C0C0, #A8A9AD);display:flex;align-items:center;justify-content:center;font-size:2em;box-shadow:inset 0 0 0 3px #C0C0C0;">👤</div>
                <span style="font-weight:600;font-size:0.85em;">Silver Ring</span>
                <input type="radio" name="avatarframe" value="silver" ${prefs.avatarframe === 'silver' ? 'checked' : ''} ${!isUnlocked('avatarframe') ? 'disabled' : ''} style="display:none;">
              </label>
              <label style="display:flex;flex-direction:column;align-items:center;cursor:pointer;gap:6px;padding:12px;border-radius:8px;border:2px solid transparent;transition:all 0.2s;${!isUnlocked('avatarframe') ? 'opacity:0.5;cursor:not-allowed;' : ''}">
                <div style="width:70px;height:70px;border-radius:50%;background:linear-gradient(135deg, #CD7F32, #B87333);display:flex;align-items:center;justify-content:center;font-size:2em;box-shadow:inset 0 0 0 3px #CD7F32;">👤</div>
                <span style="font-weight:600;font-size:0.85em;">Bronze Ring</span>
                <input type="radio" name="avatarframe" value="bronze" ${prefs.avatarframe === 'bronze' ? 'checked' : ''} ${!isUnlocked('avatarframe') ? 'disabled' : ''} style="display:none;">
              </label>
              <label style="display:flex;flex-direction:column;align-items:center;cursor:pointer;gap:6px;padding:12px;border-radius:8px;border:2px solid transparent;transition:all 0.2s;${!isUnlocked('avatarframe') ? 'opacity:0.5;cursor:not-allowed;' : ''}">
                <div style="width:70px;height:70px;border-radius:50%;background:linear-gradient(135deg, #71faf9, #ffddfc);display:flex;align-items:center;justify-content:center;font-size:2em;box-shadow:inset 0 0 0 3px #71faf9;">👤</div>
                <span style="font-weight:600;font-size:0.85em;">Neon</span>
                <input type="radio" name="avatarframe" value="neon" ${prefs.avatarframe === 'neon' ? 'checked' : ''} ${!isUnlocked('avatarframe') ? 'disabled' : ''} style="display:none;">
              </label>
            </div>
          </div>
        </div>

        <!-- Border Section -->
        <div class="customize-section">
          <div class="section-title">
            🛑 Avatar Border
            ${!isUnlocked('border') ? '<span class="feature-badge locked">Locked at Lvl ' + unlocks.border + '</span>' : '<span class="feature-badge">Lvl ' + unlocks.border + '+</span>'}
          </div>
          <div class="customize-grid">
            <div class="form-group">
              <label>Border Width (px)</label>
              <input type="number" name="avatarborder" min="0" max="20" value="${prefs.avatarborder || '3'}" ${!isUnlocked('border') ? 'disabled' : ''}>
            </div>
            <div class="form-group">
              <label>Border Color</label>
              <input type="color" name="avatarbordercolor" value="${prefs.avatarbordercolor || '#71faf9'}" ${!isUnlocked('border') ? 'disabled' : ''}>
            </div>
            <div class="form-group">
              <label>Glow Effect</label>
              <select name="borderglow" ${!isUnlocked('border') ? 'disabled' : ''}>
                <option value="none" ${prefs.borderglow === 'none' ? 'selected' : ''}>None</option>
                <option value="subtle" ${prefs.borderglow === 'subtle' ? 'selected' : ''}>Subtle</option>
                <option value="medium" ${prefs.borderglow === 'medium' ? 'selected' : ''}>Medium</option>
                <option value="intense" ${prefs.borderglow === 'intense' ? 'selected' : ''}>Intense</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="form-actions">
          <div></div>
          <div>
            <button type="button" class="reset-btn" onclick="if(confirm('Reset to default customization?')) {document.getElementById('customizeForm').reset(); location.reload();}">↻ Reset to Defaults</button>
            <button type="submit">💾 Save Customization</button>
          </div>
        </div>
      </form>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.13/cropper.min.js"></script>
      <script>
        let cropper;
        let croppedImageData = null;
        
        // Cancel crop
        function cancelCrop() {
          if (cropper) {
            cropper.destroy();
            cropper = null;
          }
          document.getElementById('cropperContainer').style.display = 'none';
          document.getElementById('bgimageInput').value = '';
          document.getElementById('cropPreviewText').style.display = 'none';
          croppedImageData = null;
        }
        
        // Confirm crop
        function confirmCrop() {
          if (!cropper) return;
          
          try {
            // Get the cropped canvas
            const canvas = cropper.getCroppedCanvas({
              width: 600,
              height: 180,
              imageSmoothingQuality: 'high'
            });
            
            // Convert canvas to blob and create a file
            canvas.toBlob(function(blob) {
            // Create a file from the blob
              const file = new File([blob], 'cropped-background.png', { type: 'image/png' });
              
              // Set the file in the file input
              const dataTransfer = new DataTransfer();
              dataTransfer.items.add(file);
              document.getElementById('bgimageInput').files = dataTransfer.files;
              
              // Store binary data for preview
              const reader = new FileReader();
              reader.onload = function(e) {
                croppedImageData = e.target.result;
                
                // Show confirmation message
                document.getElementById('cropPreviewText').style.display = 'block';
                
                // Destroy cropper UI
                if (cropper) {
                  cropper.destroy();
                  cropper = null;
                }
                
                // Show the cropped result in the cropper image display
                const img = document.getElementById('cropperImage');
                img.src = croppedImageData;
                img.style.maxWidth = '100%';
                img.style.border = '2px solid #71faf9';
                img.style.borderRadius = '6px';
                
                // Update preview with the cropped image showing
                updatePreviewWithCroppedImage();
              };
              reader.readAsDataURL(blob);
            }, 'image/png');
          } catch (e) {
            console.error('Error confirming crop:', e);
            alert('Failed to crop image. Please try again.');
          }
        }
        
        // Gradient color pickers
        const gradColor1 = document.getElementById('gradColor1');
        const gradColor2 = document.getElementById('gradColor2');
        const gradientInput = document.getElementById('gradientInput');
        
        function updateGradientInput() {
          gradientInput.value = gradColor1.value + ',' + gradColor2.value;
        }
        
        gradColor1?.addEventListener('input', updateGradientInput);
        gradColor2?.addEventListener('input', updateGradientInput);
        
        gradientInput?.addEventListener('input', function() {
          const parts = this.value.split(',');
          if (parts[0]) gradColor1.value = parts[0];
          if (parts[1]) gradColor2.value = parts[1];
        });
        
        // Font preview
        document.getElementById('fontSelect')?.addEventListener('change', function() {
          this.style.fontFamily = this.options[this.selectedIndex].style.fontFamily;
        });
        
        // Drag and drop file upload
        const dropArea = document.getElementById('dropArea');
        const bgimageInput = document.getElementById('bgimageInput');
        
        if (dropArea && bgimageInput && !bgimageInput.disabled) {
          dropArea.addEventListener('click', () => bgimageInput.click());
          
          ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropArea.addEventListener(eventName, preventDefaults, false);
          });
          
          function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
          }
          
          ['dragenter', 'dragover'].forEach(eventName => {
            dropArea.addEventListener(eventName, () => {
              dropArea.classList.add('dragover');
            });
          });
          
          ['dragleave', 'drop'].forEach(eventName => {
            dropArea.addEventListener(eventName, () => {
              dropArea.classList.remove('dragover');
            });
          });
          
          dropArea.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            bgimageInput.files = files;
            handleImageUpload({ target: { files } });
          });
        }
        
        bgimageInput?.addEventListener('change', handleImageUpload);
        
        function handleImageUpload(e) {
          const file = e.target.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = function(ev) {
            const img = document.getElementById('cropperImage');
            img.src = ev.target.result;
            document.getElementById('cropperContainer').style.display = 'block';
            if (cropper) cropper.destroy();
            cropper = new Cropper(img, {
              aspectRatio: 600/180,
              viewMode: 1,
              autoCropArea: 1,
              movable: true,
              zoomable: true,
              rotatable: false,
              scalable: false,
              crop(event) {
                document.getElementById('cropX').value = Math.round(event.detail.x);
                document.getElementById('cropY').value = Math.round(event.detail.y);
                document.getElementById('cropW').value = Math.round(event.detail.width);
                document.getElementById('cropH').value = Math.round(event.detail.height);
              }
            });
          };
          reader.readAsDataURL(file);
        }
        
        // Live preview update
        function updatePreview() {
          const form = document.getElementById('customizeForm');
          if (!form) return;
          if (typeof updateGradientInput === 'function') updateGradientInput();
          
          const params = new URLSearchParams();
          params.set('preview', 'true');
          params.set('_t', Date.now()); // Cache buster
          
          // Get all form values
          const bgcolor = form.querySelector('[name="bgcolor"]')?.value;
          if (bgcolor) params.set('bgcolor', bgcolor);
          
          const gradient = form.querySelector('[name="gradient"]')?.value;
          if (gradient) params.set('gradient', gradient);

          const bgmode = form.querySelector('[name="bgmode"]:checked')?.value;
          if (bgmode) params.set('bgmode', bgmode);
          
          const font = form.querySelector('[name="font"]')?.value;
          if (font) params.set('font', font);
          
          const fontcolor = form.querySelector('[name="fontcolor"]')?.value;
          if (fontcolor) params.set('fontcolor', fontcolor);
          
          const avatarborder = form.querySelector('[name="avatarborder"]')?.value;
          if (avatarborder) params.set('avatarborder', avatarborder);
          
          const avatarbordercolor = form.querySelector('[name="avatarbordercolor"]')?.value;
          if (avatarbordercolor) params.set('avatarbordercolor', avatarbordercolor);
          
          const borderglow = form.querySelector('[name="borderglow"]')?.value;
          if (borderglow) params.set('borderglow', borderglow);
          
          const avatarframe = form.querySelector('[name="avatarframe"]:checked')?.value;
          if (avatarframe) params.set('avatarframe', avatarframe);
          
            // Update preview image
          const previewImg = document.getElementById('rankcardPreview');
          if (previewImg) {
            previewImg.src = '/lop/rankcard/image?' + params.toString();
          }
        }
        
        // Update preview with cropped image
        let lastCroppedObjectUrl = null;
        function updatePreviewWithCroppedImage() {
          const bgImageInput = document.getElementById('bgimageInput');
          const previewImg = document.getElementById('rankcardPreview');
          if (typeof updateGradientInput === 'function') updateGradientInput();
          
          if (!previewImg || !bgImageInput || !bgImageInput.files || bgImageInput.files.length === 0) {
            // No cropped image, use server preview
            updatePreview();
            return;
          }
          
          // There's a cropped image - show it via FormData POST to preview
          const file = bgImageInput.files[0];
          const formData = new FormData();
          formData.append('bgimage', file);
          
          // Get all the form values
          const form = document.getElementById('customizeForm');
          if (form) {
            const bgcolor = form.querySelector('[name="bgcolor"]')?.value;
            if (bgcolor) formData.append('bgcolor', bgcolor);
            
            const gradient = form.querySelector('[name="gradient"]')?.value;
            if (gradient) formData.append('gradient', gradient);

            const bgmode = form.querySelector('[name="bgmode"]:checked')?.value;
            if (bgmode) formData.append('bgmode', bgmode);
            
            const font = form.querySelector('[name="font"]')?.value;
            if (font) formData.append('font', font);
            
            const fontcolor = form.querySelector('[name="fontcolor"]')?.value;
            if (fontcolor) formData.append('fontcolor', fontcolor);
            
            const avatarborder = form.querySelector('[name="avatarborder"]')?.value;
            if (avatarborder) formData.append('avatarborder', avatarborder);
            
            const avatarbordercolor = form.querySelector('[name="avatarbordercolor"]')?.value;
            if (avatarbordercolor) formData.append('avatarbordercolor', avatarbordercolor);
            
            const borderglow = form.querySelector('[name="borderglow"]')?.value;
            if (borderglow) formData.append('borderglow', borderglow);
            
            const avatarframe = form.querySelector('[name="avatarframe"]:checked')?.value;
            if (avatarframe) formData.append('avatarframe', avatarframe);
          }
          
          formData.append('preview', 'true');
          formData.append('_t', Date.now());
          
          // POST to get preview with cropped image
          fetch('/lop/rankcard/preview', {
            method: 'POST',
            body: formData
          })
          .then(response => response.blob())
          .then(blob => {
            if (lastCroppedObjectUrl) {
              URL.revokeObjectURL(lastCroppedObjectUrl);
            }
            lastCroppedObjectUrl = URL.createObjectURL(blob);
            previewImg.src = lastCroppedObjectUrl;
          })
          .catch(err => {
            console.error('Failed to get preview:', err);
            updatePreview(); // Fallback to regular preview
          });
        }
        
        // localStorage persistence
        const STORAGE_KEY = 'lop_rankcard_draft_' + (window.location.hostname || 'local');
        
        function saveFormToLocalStorage() {
          const form = document.getElementById('customizeForm');
          if (!form) return;
          
          const draft = {
            bgcolor: form.querySelector('[name="bgcolor"]')?.value || '',
            gradient: form.querySelector('[name="gradient"]')?.value || '',
            bgmode: form.querySelector('[name="bgmode"]:checked')?.value || '',
            font: form.querySelector('[name="font"]')?.value || '',
            fontcolor: form.querySelector('[name="fontcolor"]')?.value || '',
            avatarborder: form.querySelector('[name="avatarborder"]')?.value || '',
            avatarbordercolor: form.querySelector('[name="avatarbordercolor"]')?.value || '',
            borderglow: form.querySelector('[name="borderglow"]')?.value || '',
            avatarframe: form.querySelector('[name="avatarframe"]:checked')?.value || '',
            timestamp: Date.now()
          };
          
          localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
        }
        
        function loadFormFromLocalStorage() {
          try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (!stored) return;
            
            const draft = JSON.parse(stored);
            const form = document.getElementById('customizeForm');
            if (!form) return;
            
            // Restore form values
            if (draft.bgcolor) {
              const bgcolorInput = form.querySelector('[name="bgcolor"]');
              if (bgcolorInput) bgcolorInput.value = draft.bgcolor;
            }
            if (draft.gradient) {
              form.querySelector('[name="gradient"]').value = draft.gradient;
              const parts = draft.gradient.split(',');
              if (parts[0]) form.querySelector('#gradColor1').value = parts[0];
              if (parts[1]) form.querySelector('#gradColor2').value = parts[1];
            }
            if (draft.bgmode) {
              const bgmodeRadio = form.querySelector('input[name="bgmode"][value="' + draft.bgmode + '"]');
              if (bgmodeRadio && !bgmodeRadio.disabled) bgmodeRadio.checked = true;
            }
            if (draft.font) {
              const fontSelect = form.querySelector('[name="font"]');
              if (fontSelect) fontSelect.value = draft.font;
            }
            if (draft.fontcolor) {
              const fontcolorInput = form.querySelector('[name="fontcolor"]');
              if (fontcolorInput) fontcolorInput.value = draft.fontcolor;
            }
            if (draft.avatarborder) {
              const borderInput = form.querySelector('[name="avatarborder"]');
              if (borderInput) borderInput.value = draft.avatarborder;
            }
            if (draft.avatarbordercolor) {
              const borderColorInput = form.querySelector('[name="avatarbordercolor"]');
              if (borderColorInput) borderColorInput.value = draft.avatarbordercolor;
            }
            if (draft.borderglow) {
              const glowSelect = form.querySelector('[name="borderglow"]');
              if (glowSelect) glowSelect.value = draft.borderglow;
            }
            if (draft.avatarframe) {
              const frameRadio = form.querySelector('input[name="avatarframe"][value="' + draft.avatarframe + '"]');
              if (frameRadio) frameRadio.checked = true;
            }
            
            // Trigger preview update with restored values
            updatePreview();
          } catch (e) {
            console.warn('Failed to load draft from localStorage:', e);
          }
        }
        
        function clearFormLocalStorage() {
          localStorage.removeItem(STORAGE_KEY);
        }
        
        // Attach live preview listeners
        setTimeout(() => {
          const form = document.getElementById('customizeForm');
          if (!form) return;
          
          // Load draft on page load
          loadFormFromLocalStorage();
          
          // Listen to all relevant inputs
          form.querySelectorAll('input[type="color"], select, input[type="number"], input[type="radio"]').forEach(input => {
            input.addEventListener('change', function() {
              saveFormToLocalStorage();
              updatePreview();
            });
            input.addEventListener('input', function() {
              saveFormToLocalStorage();
              updatePreview();
            });
          });
          
          // Ensure gradient pickers trigger preview update
          const gradColor1 = document.getElementById('gradColor1');
          const gradColor2 = document.getElementById('gradColor2');
          
          if (gradColor1) {
            gradColor1.addEventListener('input', function() {
              updateGradientInput();
              saveFormToLocalStorage();
              updatePreview();
            });
          }
          if (gradColor2) {
            gradColor2.addEventListener('input', function() {
              updateGradientInput();
              saveFormToLocalStorage();
              updatePreview();
            });
          }
          
          // Clear localStorage on successful form submit
          form.addEventListener('submit', function() {
            clearFormLocalStorage();
          });

        }, 100);
      </script>
      `;
    }
    res.send(htmlTemplate(`
      <h2>Customize Your Rank Card</h2>
      ${user ? `<p>Your Level: <b>${userLevel}</b> &mdash; XP: <b>${userXp}</b></p>` : `<p><a href="/login" class="btn">Login with Discord to see your level and customize your card</a></p>`}
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
      ${formHtml}
      <img id="rankcardPreview" src="/lop/rankcard/image" alt="Rank Card Preview" style="margin-top:20px;border:1px solid #ccc;max-width:100%;" />
    `, { ...getTemplateOpts(req), active: "rankcard" }));
  });

  // Handle customization form POST
app.post("/lop/customize", upload.single("bgimage"), async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.redirect("/lop");
    const userId = user.id;
    // Only allow unlocked features
    const guild = client.guilds.cache.first();
    const guildId = guild?.id || null;
    const { run, get } = require("./db");
    let userLevel = 1;
    if (guildId && userId) {
      try {
        const row = await get(
          `SELECT level FROM user_xp WHERE guild_id=? AND user_id=?`,
          [guildId, userId]
        );
        userLevel = row?.level ?? 1;
      } catch (e) {
        userLevel = 1;
      }
    }
    const unlocks = {
      bgimage: 10,
      gradient: 5,
      bgcolor: 1,
      font: 3,
      border: 7,
      avatarframe: 15
    };
    function isUnlocked(opt) {
      return userLevel >= (unlocks[opt] ?? 1);
    }
    // Save prefs to DB
    const sharp = require('sharp');
    let update = {};
    if (isUnlocked('bgcolor') && req.body.bgcolor) update.bgcolor = req.body.bgcolor;
    if (isUnlocked('gradient') && req.body.gradient) update.gradient = req.body.gradient;
    if (req.body.bgmode) {
      let bgmode = req.body.bgmode;
      if (bgmode === 'gradient' && !isUnlocked('gradient')) bgmode = 'color';
      if (bgmode === 'image' && !isUnlocked('bgimage')) bgmode = 'color';
      update.bgmode = bgmode;
    }
    if (isUnlocked('font') && req.body.font) update.font = req.body.font;
    if (isUnlocked('font') && req.body.fontcolor) update.fontcolor = req.body.fontcolor;
    if (isUnlocked('bgimage') && req.file) {
      // Image is already cropped by frontend cropper, just resize to exact dimensions
      const croppedPath = req.file.path + '_cropped.png';
      await sharp(req.file.path)
        .resize(600, 180, { fit: 'cover' })
        .toFile(croppedPath);
      update.bgimage = croppedPath;
    }
    // Save border and avatar frame if unlocked
    if (isUnlocked('border') && req.body.avatarborder) update.avatarborder = parseInt(req.body.avatarborder) || 3;
    if (isUnlocked('border') && req.body.avatarbordercolor) update.avatarbordercolor = req.body.avatarbordercolor;
    if (isUnlocked('border') && req.body.borderglow) update.borderglow = req.body.borderglow;
    if (isUnlocked('avatarframe') && req.body.avatarframe) update.avatarframe = req.body.avatarframe;
    // Upsert prefs
    const keys = Object.keys(update);
    if (keys.length > 0) {
      const fields = keys.join(', ');
      const values = keys.map(k => update[k]);
        // Use PostgreSQL upsert
        const updateAssignments = keys.map((k, i) => `${k} = EXCLUDED.${k}`).join(', ');
        await run(
          `INSERT INTO user_rankcard_customizations (guild_id, user_id, ${fields}) VALUES ($1, $2, ${keys.map((_, i) => `$${i+3}`).join(', ')})
          ON CONFLICT (guild_id, user_id) DO UPDATE SET ${updateAssignments}`,
          [guildId, userId, ...values]
        );
    }
    res.redirect("/lop");
  } catch (e) {
    console.error("/lop/customize error:", e);
    res.status(500).send("Failed to save customization. Please try again.");
  }
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
      .filter((c) => c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement)
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
                 style="max-width:520px;width:100%;box-sizing:border-box;" />
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