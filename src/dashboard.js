// src/dashboard.js
const express = require("express");
const session = require("express-session");

const {
  getGuildSettings,
  updateGuildSettings,
  getLevelRoles,
  setLevelRole,
  deleteLevelRole
} = require("./settings");

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
  // discord.js v14: text channels + threads are "text based"
  return !!ch && typeof ch.isTextBased === "function" && ch.isTextBased();
}

function startDashboard(client) {
  const app = express();

  const port = parseInt(process.env.DASHBOARD_PORT || "3000", 10);
  const password = process.env.DASHBOARD_PASSWORD;

  if (!password) {
    console.warn("DASHBOARD_PASSWORD not set; dashboard will not start.");
    return;
  }

  app.use(express.urlencoded({ extended: true }));

  // Sessions: keep cookies stable so POST actions don't kick you back to /login
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
        secure: false, // must be false for http://localhost
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      }
    })
  );

  // --- Auth ---
  app.get("/login", (req, res) => {
    res.send(`
      <h2>Bot Dashboard Login</h2>
      <form method="post" action="/login">
        <input type="password" name="password" placeholder="Password" />
        <button type="submit">Login</button>
      </form>
      <p style="color:#666;max-width:720px">
        Tip: use the same URL consistently (either <code>http://localhost:${port}</code> or
        <code>http://127.0.0.1:${port}</code>). Mixing them can break cookies.
      </p>
    `);
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

  // --- Home: list guilds ---
  app.get("/", mustBeLoggedIn, async (req, res) => {
    const guilds = client.guilds.cache
      .map((g) => ({ id: g.id, name: g.name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    res.send(`
      <h2>Dashboard</h2>
      <p><a href="/logout">Logout</a></p>

      <h3>Servers</h3>
      <ul>
        ${guilds
          .map(
            (g) =>
              `<li><a href="/guild/${g.id}">${escapeHtml(g.name)}</a></li>`
          )
          .join("")}
      </ul>
    `);
  });

  // --- Guild page ---
  app.get("/guild/:guildId", mustBeLoggedIn, async (req, res) => {
    const guildId = req.params.guildId;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.status(404).send("Bot is not in that guild.");

    const settings = await getGuildSettings(guildId);
    const levelRoles = await getLevelRoles(guildId);

    await guild.channels.fetch().catch(() => {});
    const textChannels = guild.channels.cache
      .filter((c) => isTextChannelLike(c))
      .map((c) => ({ id: c.id, name: c.name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    res.send(`
      <h2>${escapeHtml(guild.name)}</h2>
      <p><a href="/">Back</a> | <a href="/logout">Logout</a></p>

      <hr/>

      <h3>XP Settings</h3>
      <form method="post" action="/guild/${guildId}/settings">
        <label>Message XP Min
          <input name="message_xp_min" value="${escapeHtml(
            settings.message_xp_min
          )}" />
        </label><br/>

        <label>Message XP Max
          <input name="message_xp_max" value="${escapeHtml(
            settings.message_xp_max
          )}" />
        </label><br/>

        <label>Message Cooldown Seconds
          <input name="message_cooldown_seconds" value="${escapeHtml(
            settings.message_cooldown_seconds
          )}" />
        </label><br/>

        <label>Reaction XP
          <input name="reaction_xp" value="${escapeHtml(
            settings.reaction_xp
          )}" />
        </label><br/>

        <label>Reaction Cooldown Seconds
          <input name="reaction_cooldown_seconds" value="${escapeHtml(
            settings.reaction_cooldown_seconds
          )}" />
        </label><br/>

        <label>Voice XP Per Minute
          <input name="voice_xp_per_minute" value="${escapeHtml(
            settings.voice_xp_per_minute
          )}" />
        </label><br/><br/>

        <button type="submit">Save XP Settings</button>
      </form>

      <hr/>

      <h3>Level-up Messages</h3>
      <form method="post" action="/guild/${guildId}/levelup-settings">
        <label>Level-up Channel
          <select name="level_up_channel_id">
            <option value="" ${
              !settings.level_up_channel_id ? "selected" : ""
            }>
              Same channel as message
            </option>
            ${textChannels
              .map(
                (ch) => `
                <option value="${ch.id}" ${
                  settings.level_up_channel_id === ch.id ? "selected" : ""
                }>
                  #${escapeHtml(ch.name)}
                </option>
              `
              )
              .join("")}
          </select>
        </label>
        <br/><br/>

        <label>
          Level-up Message (supports {user}, {level}, {xp})<br/>
          <input
            name="level_up_message"
            value="${escapeHtml(settings.level_up_message || "")}"
            style="width: 520px;"
          />
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
        ${levelRoles
          .map(
            (r) => `
            <li>
              Level ${r.level} → Role ID ${escapeHtml(r.role_id)}
              <form style="display:inline" method="post" action="/guild/${guildId}/level-roles/delete">
                <input type="hidden" name="level" value="${r.level}" />
                <button type="submit">Delete</button>
              </form>
            </li>
          `
          )
          .join("")}
      </ul>
    `);
  });

  // --- Save XP settings ---
  app.post("/guild/:guildId/settings", mustBeLoggedIn, async (req, res) => {
    const guildId = req.params.guildId;

    const patch = {
      message_xp_min: parseInt(req.body.message_xp_min, 10),
      message_xp_max: parseInt(req.body.message_xp_max, 10),
      message_cooldown_seconds: parseInt(req.body.message_cooldown_seconds, 10),
      reaction_xp: parseInt(req.body.reaction_xp, 10),
      reaction_cooldown_seconds: parseInt(
        req.body.reaction_cooldown_seconds,
        10
      ),
      voice_xp_per_minute: parseInt(req.body.voice_xp_per_minute, 10)
    };

    if (
      !Number.isInteger(patch.message_xp_min) ||
      patch.message_xp_min < 0 ||
      !Number.isInteger(patch.message_xp_max) ||
      patch.message_xp_max < patch.message_xp_min
    ) {
      return res.status(400).send("Invalid message XP range.");
    }

    if (
      !Number.isInteger(patch.message_cooldown_seconds) ||
      patch.message_cooldown_seconds < 0
    ) {
      return res.status(400).send("Invalid message cooldown.");
    }

    if (!Number.isInteger(patch.reaction_xp) || patch.reaction_xp < 0) {
      return res.status(400).send("Invalid reaction XP.");
    }

    if (
      !Number.isInteger(patch.reaction_cooldown_seconds) ||
      patch.reaction_cooldown_seconds < 0
    ) {
      return res.status(400).send("Invalid reaction cooldown.");
    }

    if (
      !Number.isInteger(patch.voice_xp_per_minute) ||
      patch.voice_xp_per_minute < 0
    ) {
      return res.status(400).send("Invalid voice XP per minute.");
    }

    await updateGuildSettings(guildId, patch);
    return res.redirect(`/guild/${guildId}`);
  });

  // --- Save level-up settings (channel + message template) ---
  app.post(
    "/guild/:guildId/levelup-settings",
    mustBeLoggedIn,
    async (req, res) => {
      const guildId = req.params.guildId;

      const level_up_channel_id = String(
        req.body.level_up_channel_id || ""
      ).trim();

      const level_up_message = String(req.body.level_up_message || "").trim();

      await updateGuildSettings(guildId, {
        level_up_channel_id: level_up_channel_id || null,
        level_up_message
      });

      return res.redirect(`/guild/${guildId}`);
    }
  );

  // --- Test level-up message (decoy, no XP changes) ---
  app.post("/guild/:guildId/test-levelup", mustBeLoggedIn, async (req, res) => {
    const guildId = req.params.guildId;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.status(404).send("Bot is not in that guild.");

    const settings = await getGuildSettings(guildId);

    // Choose channel: configured channel or first text-based channel
    let target = null;

    if (settings.level_up_channel_id) {
      target = await guild.channels
        .fetch(settings.level_up_channel_id)
        .catch(() => null);
    }

    if (!isTextChannelLike(target)) {
      await guild.channels.fetch().catch(() => {});
      target =
        guild.channels.cache.find((c) => isTextChannelLike(c)) || null;
    }

    if (!isTextChannelLike(target)) {
      return res
        .status(400)
        .send("No text channel available to send the test message.");
    }

    const template =
      settings.level_up_message ||
      "🎉 Congratulations {user}! you just advanced to the next **Lop Level {level}**! 🍪✨";

    const msg = String(template)
      .replaceAll("{user}", "TestUser")
      .replaceAll("{level}", "99")
      .replaceAll("{xp}", "999999");

    await target.send(`🧪 **Level-up Test**\n${msg}`).catch(() => {});
    return res.redirect(`/guild/${guildId}`);
  });

  // --- Level roles CRUD ---
  app.post("/guild/:guildId/level-roles", mustBeLoggedIn, async (req, res) => {
    const guildId = req.params.guildId;
    const level = parseInt(req.body.level, 10);
    const roleId = String(req.body.role_id || "").trim();

    if (!Number.isInteger(level) || level < 0) {
      return res.status(400).send("Invalid level.");
    }
    if (!roleId) return res.status(400).send("Role ID required.");

    await setLevelRole(guildId, level, roleId);
    return res.redirect(`/guild/${guildId}`);
  });

  app.post(
    "/guild/:guildId/level-roles/delete",
    mustBeLoggedIn,
    async (req, res) => {
      const guildId = req.params.guildId;
      const level = parseInt(req.body.level, 10);
      if (!Number.isInteger(level)) return res.status(400).send("Invalid level.");

      await deleteLevelRole(guildId, level);
      return res.redirect(`/guild/${guildId}`);
    }
  );

  app.listen(port, "0.0.0.0", () => {
    console.log(`Dashboard running on http://localhost:${port}`);
    console.log(
      `Tip: always use the same host (localhost OR 127.0.0.1) so cookies don't break.`
    );
  });
}

module.exports = { startDashboard };