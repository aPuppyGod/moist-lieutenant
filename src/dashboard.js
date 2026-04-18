const express = require("express");
const session = require("express-session");
const passport = require("passport");
const multer = require("multer");
const upload = multer({ dest: "uploads/" });

const { get, run, all } = require("./db");
const { levelFromXp, xpToNextLevel, totalXpForLevel } = require("./xp");

// Discord OAuth2 setup
const DiscordStrategy = require("passport-discord").Strategy;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_CALLBACK_URL = process.env.DISCORD_CALLBACK_URL || "http://localhost:8080/auth/discord/callback";
const HAS_DISCORD_OAUTH = Boolean(DISCORD_CLIENT_ID && DISCORD_CLIENT_SECRET);

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

if (HAS_DISCORD_OAUTH) {
  passport.use(new DiscordStrategy({
    clientID: DISCORD_CLIENT_ID,
    clientSecret: DISCORD_CLIENT_SECRET,
    callbackURL: DISCORD_CALLBACK_URL,
    scope: ["identify", "guilds"]
  }, (accessToken, refreshToken, profile, done) => {
    process.nextTick(() => done(null, profile));
  }));
} else {
  console.warn("[dashboard] DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET not set. Discord OAuth routes will be disabled.");
}

function htmlTemplate(content, opts = {}) {
  // opts: { user, isAdmin, active }
  const user = opts.user;
  const isAdmin = opts.isAdmin;
  const active = opts.active || "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Moist Lieutenant</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700&display=swap" rel="stylesheet">
  <style>
    /* Light mode (default) */
    body, body[data-theme="light"] {
      font-family: 'Montserrat', Arial, sans-serif;
      background: linear-gradient(135deg, #a8d5a8 0%, #8b7355 100%);
      margin: 0;
      padding: 0;
      color: #0a1e1e;
      min-height: 100vh;
    }
    nav, body[data-theme="light"] nav {
      background: linear-gradient(135deg, #7bc96f 0%, #7bc96f 100%);
      padding: 0 24px;
      display: flex;
      align-items: center;
      height: 56px;
      box-shadow: 0 2px 12px rgba(123, 201, 111, 0.3);
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
      color: #6b9b6b;
      border-bottom: 2px solid #6b9b6b;
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
      border: 2px solid #6b9b6b;
      background: #444;
    }

    /* Dark mode */
    body[data-theme="dark"] {
      background: linear-gradient(135deg, #0a1e1e 0%, #0d2626 100%);
      color: #f0f0f0;
    }
    body[data-theme="dark"] nav {
      background: linear-gradient(135deg, #a8d5a8 0%, #8b7355 100%);
      box-shadow: 0 2px 12px rgba(168, 213, 168, 0.3);
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
      box-shadow: 0 8px 32px rgba(123, 201, 111, 0.2);
      padding: 32px 24px 24px 24px;
      border: 2px solid rgba(123, 201, 111, 0.3);
    }
    body[data-theme="dark"] .container {
      background: rgba(13, 38, 38, 0.9);
      border: 2px solid rgba(168, 213, 168, 0.3);
      box-shadow: 0 8px 32px rgba(168, 213, 168, 0.1);
    }
    h2 {
      color: #7bc96f;
      text-align: center;
      margin-top: 0;
    }
    body[data-theme="dark"] h2 {
      color: #a8d5a8;
    }
    h3 {
      color: #6b9b6b;
      margin-bottom: 8px;
    }
    body[data-theme="dark"] h3 {
      color: #7bc96f;
    }
    button, .btn {
      background: linear-gradient(135deg, #7bc96f 0%, #6b9b6b 100%);
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
      box-shadow: 0 4px 12px rgba(123, 201, 111, 0.3);
    }
    button:hover, .btn:hover {
      background: linear-gradient(135deg, #6b9b6b 0%, #7bc96f 100%);
      transform: translateY(-3px);
      box-shadow: 0 6px 20px rgba(123, 201, 111, 0.5);
    }
    body[data-theme="dark"] button, body[data-theme="dark"] .btn {
      background: linear-gradient(135deg, #a8d5a8 0%, #8b7355 100%);
      color: #0a1e1e;
      box-shadow: 0 4px 12px rgba(168, 213, 168, 0.3);
    }
    body[data-theme="dark"] button:hover, body[data-theme="dark"] .btn:hover {
      background: linear-gradient(135deg, #8b7355 0%, #a8d5a8 100%);
      box-shadow: 0 6px 20px rgba(168, 213, 168, 0.5);
    }
    input, select {
      padding: 7px;
      border: 2px solid #7bc96f;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.8);
      color: #0a1e1e;
      margin-bottom: 8px;
    }
    input:focus, select:focus {
      outline: none;
      border-color: #6b9b6b;
      box-shadow: 0 0 12px rgba(123, 201, 111, 0.4);
      background: white;
    }
    body[data-theme="dark"] input, body[data-theme="dark"] select {
      border: 2px solid #a8d5a8;
      background: rgba(13, 38, 38, 0.8);
      color: #f0f0f0;
    }
    body[data-theme="dark"] input:focus, body[data-theme="dark"] select:focus {
      outline: none;
      border-color: #7bc96f;
      box-shadow: 0 0 12px rgba(168, 213, 168, 0.4);
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
      background: rgba(123, 201, 111, 0.2);
    }
    body[data-theme="dark"] th {
      color: #f0f0f0;
      background: rgba(168, 213, 168, 0.2);
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
    .info-box {
      margin-top: 20px;
      padding: 16px;
      border-radius: 10px;
      border: 1px solid rgba(123, 201, 111, 0.2);
      background: rgba(248, 249, 250, 0.95);
    }
    body[data-theme="dark"] .info-box {
      background: rgba(10, 30, 30, 0.85);
      border-color: rgba(168, 213, 168, 0.2);
      color: #c0d0c0;
    }
    a {
      color: #7bc96f;
      text-decoration: none;
      transition: color 0.2s;
    }
    a:hover {
      color: #6b9b6b;
      text-decoration: underline;
    }
    body[data-theme="dark"] a {
      color: #a8d5a8;
    }
    body[data-theme="dark"] a:hover {
      color: #7bc96f;
    }
    hr {
      border: 0;
      height: 2px;
      background: linear-gradient(90deg, transparent, #7bc96f 20%, #6b9b6b 50%, #7bc96f 80%, transparent);
      margin: 24px 0;
    }
    body[data-theme="dark"] hr {
      background: linear-gradient(90deg, transparent, #a8d5a8 20%, #7bc96f 50%, #a8d5a8 80%, transparent);
    }
    form {
      margin-bottom: 20px;
    }

    .admin-section {
      padding: 14px 0;
    }

    .admin-grid-form {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: flex-end;
    }

    .admin-grid-form label {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 180px;
      flex: 1;
    }

    .admin-grid-form input,
    .admin-grid-form select {
      width: 100%;
      margin-bottom: 0;
    }

    .admin-grid-form button {
      width: auto;
      margin: 0;
      align-self: flex-end;
    }

    .event-toggle-cell {
      text-align: center;
      width: 120px;
    }

    input.event-toggle {
      appearance: none;
      -webkit-appearance: none;
      width: 56px;
      height: 30px;
      border-radius: 999px;
      border: 2px solid #7bc96f;
      background: rgba(123, 201, 111, 0.15);
      cursor: pointer;
      position: relative;
      transition: all 0.25s ease;
      padding: 0;
      margin: 0;
      box-sizing: border-box;
    }

    input.event-toggle::after {
      content: "";
      position: absolute;
      top: 3px;
      left: 3px;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: #7bc96f;
      box-shadow: 0 2px 8px rgba(123, 201, 111, 0.5);
      transition: transform 0.25s ease, background 0.25s ease;
    }

    input.event-toggle:checked {
      border-color: #a8d5a8;
      background: linear-gradient(135deg, rgba(168, 213, 168, 0.9), rgba(123, 201, 111, 0.85));
      box-shadow: 0 0 10px rgba(168, 213, 168, 0.45);
    }

    input.event-toggle:checked::after {
      transform: translateX(26px);
      background: #0a1e1e;
    }

    input.event-toggle:focus-visible {
      outline: none;
      box-shadow: 0 0 0 3px rgba(123, 201, 111, 0.35), 0 0 12px rgba(168, 213, 168, 0.35);
    }

    body[data-theme="dark"] input.event-toggle {
      border-color: #a8d5a8;
      background: rgba(168, 213, 168, 0.12);
    }

    body[data-theme="dark"] input.event-toggle::after {
      background: #a8d5a8;
      box-shadow: 0 2px 8px rgba(168, 213, 168, 0.45);
    }

    body[data-theme="dark"] input.event-toggle:checked {
      border-color: #7bc96f;
      background: linear-gradient(135deg, rgba(123, 201, 111, 0.9), rgba(168, 213, 168, 0.85));
      box-shadow: 0 0 10px rgba(123, 201, 111, 0.45);
    }

    body[data-theme="dark"] input.event-toggle:checked::after {
      background: #0a1e1e;
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

      .admin-grid-form {
        flex-direction: column;
        align-items: stretch;
      }

      .admin-grid-form label {
        min-width: 100%;
      }

      .admin-grid-form button {
        width: 100%;
      }

      input.event-toggle {
        width: 50px !important;
        height: 28px;
      }

      input.event-toggle:checked::after {
        transform: translateX(22px);
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
      
      .modules-grid {
        grid-template-columns: 1fr !important;
      }
    }

    /* Module Card System */
    .modules-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 20px;
      margin: 24px 0;
    }

    .module-card {
      background: rgba(255, 255, 255, 0.95);
      border: 2px solid rgba(113, 250, 249, 0.4);
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 4px 16px rgba(113, 250, 249, 0.15);
      transition: all 0.3s ease;
      position: relative;
      overflow: visible;
    }

    body[data-theme="dark"] .module-card {
      background: rgba(13, 38, 38, 0.85);
      border-color: rgba(255, 221, 252, 0.4);
      box-shadow: 0 4px 16px rgba(255, 221, 252, 0.1);
    }

    .module-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 8px 24px rgba(113, 250, 249, 0.25);
      border-color: rgba(113, 250, 249, 0.6);
    }

    body[data-theme="dark"] .module-card:hover {
      box-shadow: 0 8px 24px rgba(255, 221, 252, 0.2);
      border-color: rgba(255, 221, 252, 0.6);
    }

    .module-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 12px;
      gap: 12px;
    }

    .module-title {
      font-size: 1.3em;
      font-weight: 700;
      color: #0a1e1e;
      margin: 0;
      flex: 1;
    }

    body[data-theme="dark"] .module-title {
      color: #f0f0f0;
    }

    .module-badges {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }

    .module-badge {
      font-size: 0.7em;
      padding: 4px 10px;
      border-radius: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      white-space: nowrap;
    }

    .module-badge.enabled {
      background: linear-gradient(135deg, #7bc96f 0%, #a8d5a8 100%);
      color: #0a1e1e;
      border: 1px solid #7bc96f;
    }

    .module-badge.disabled {
      background: rgba(139, 115, 85, 0.2);
      color: #8b7355;
      border: 1px solid #8b7355;
    }

    body[data-theme="dark"] .module-badge.enabled {
      background: linear-gradient(135deg, #7bc96f 0%, #5a9b4a 100%);
      color: #f0f0f0;
    }

    body[data-theme="dark"] .module-badge.disabled {
      background: rgba(139, 115, 85, 0.3);
      color: #b8a389;
    }

    .module-description {
      color: #2a4a4a;
      margin: 12px 0 16px 0;
      font-size: 0.95em;
      line-height: 1.5;
    }

    body[data-theme="dark"] .module-description {
      color: #b8d5d5;
    }

    .module-actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }

    .module-toggle-container {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid rgba(113, 250, 249, 0.2);
    }

    body[data-theme="dark"] .module-toggle-container {
      border-top-color: rgba(255, 221, 252, 0.2);
    }

    .module-toggle-label {
      font-weight: 600;
      font-size: 0.9em;
      color: #0a1e1e;
    }

    body[data-theme="dark"] .module-toggle-label {
      color: #f0f0f0;
    }

    .module-stats {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-top: 12px;
    }

    .module-stat {
      background: rgba(113, 250, 249, 0.1);
      padding: 10px;
      border-radius: 8px;
      border: 1px solid rgba(113, 250, 249, 0.3);
    }

    body[data-theme="dark"] .module-stat {
      background: rgba(255, 221, 252, 0.08);
      border-color: rgba(255, 221, 252, 0.3);
    }

    .module-stat-label {
      font-size: 0.8em;
      color: #2a4a4a;
      margin-bottom: 4px;
    }

    body[data-theme="dark"] .module-stat-label {
      color: #b8d5d5;
    }

    .module-stat-value {
      font-size: 1.2em;
      font-weight: 700;
      color: #0a1e1e;
    }

    body[data-theme="dark"] .module-stat-value {
      color: #f0f0f0;
    }

    .settings-btn {
      background: linear-gradient(135deg, #7bc96f 0%, #6b9b6b 100%);
      color: #0a1e1e;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-family: 'Montserrat', Arial, sans-serif;
      font-weight: 600;
      font-size: 0.9em;
      transition: all 0.2s;
      box-shadow: 0 2px 8px rgba(123, 201, 111, 0.3);
      text-decoration: none;
      display: inline-block;
    }

    .settings-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(123, 201, 111, 0.4);
    }

    body[data-theme="dark"] .settings-btn {
      background: linear-gradient(135deg, #a8d5a8 0%, #8b7355 100%);
      box-shadow: 0 2px 8px rgba(168, 213, 168, 0.3);
    }

    body[data-theme="dark"] .settings-btn:hover {
      box-shadow: 0 4px 12px rgba(168, 213, 168, 0.4);
    }

    .module-collapsed .module-content {
      display: none;
    }

    .module-expand-btn {
      background: none;
      border: none;
      color: #7bc96f;
      cursor: pointer;
      font-size: 1.2em;
      padding: 0;
      margin: 0;
      transition: transform 0.2s;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    body[data-theme="dark"] .module-expand-btn {
      color: #a8d5a8;
    }

    .module-collapsed .module-expand-btn {
      transform: rotate(-90deg);
    }

    .page-header {
      text-align: center;
      margin-bottom: 32px;
    }

    .page-header h2 {
      margin: 0 0 8px 0;
    }

    .page-header .guild-info {
      color: #2a4a4a;
      font-size: 0.95em;
    }

    body[data-theme="dark"] .page-header .guild-info {
      color: #b8d5d5;
    }

    .quick-actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      justify-content: center;
      margin-top: 16px;
    }
    
    /* Reaction Role Questions Styling */
    .reaction-question-card {
      border: 1px solid #c8e0c8;
      padding: 16px;
      border-radius: 6px;
      background: #f5f9f5;
    }
    body[data-theme="dark"] .reaction-question-card {
      border-color: #444;
      background: #2a2a2a;
    }
    
    .reaction-summary {
      cursor: pointer;
      padding: 8px;
      background: #e8f3e8;
      border-radius: 4px;
      margin-bottom: 8px;
    }
    body[data-theme="dark"] .reaction-summary {
      background: #333;
    }
    
    .reaction-option-form {
      border: 1px solid #c8e0c8;
      padding: 12px;
      border-radius: 4px;
      background: #ffffff;
    }
    body[data-theme="dark"] .reaction-option-form {
      border-color: #555;
      background: #222;
    }
    
    .reaction-option-item {
      padding: 8px;
      background: #e8f3e8;
      border-radius: 4px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    body[data-theme="dark"] .reaction-option-item {
      background: #333;
    }
    
    .reaction-send-form {
      border-top: 1px solid #c8e0c8;
      padding-top: 12px;
      margin-top: 12px;
    }
    body[data-theme="dark"] .reaction-send-form {
      border-top-color: #444;
    }

    /* Collapsible Section Styles */
    .collapsible-section {
      background: rgba(255, 255, 255, 0.6);
      border-radius: 10px;
      margin: 16px 0;
      border: 2px solid rgba(123, 201, 111, 0.25);
      overflow: hidden;
      transition: all 0.3s ease;
    }
    body[data-theme="dark"] .collapsible-section {
      background: rgba(13, 38, 38, 0.6);
      border-color: rgba(168, 213, 168, 0.25);
    }
    .collapsible-section:hover {
      border-color: rgba(123, 201, 111, 0.5);
      box-shadow: 0 4px 12px rgba(123, 201, 111, 0.15);
    }
    body[data-theme="dark"] .collapsible-section:hover {
      border-color: rgba(168, 213, 168, 0.5);
      box-shadow: 0 4px 12px rgba(168, 213, 168, 0.15);
    }
    
    .collapsible-header {
      padding: 16px 20px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 12px;
      background: rgba(123, 201, 111, 0.1);
      transition: all 0.3s ease;
      user-select: none;
    }
    body[data-theme="dark"] .collapsible-header {
      background: rgba(168, 213, 168, 0.1);
    }
    .collapsible-header:hover {
      background: rgba(123, 201, 111, 0.2);
    }
    body[data-theme="dark"] .collapsible-header:hover {
      background: rgba(168, 213, 168, 0.2);
    }
    
    .collapsible-header h3 {
      margin: 0;
      flex: 1;
      font-size: 1.15em;
      font-weight: 600;
    }
    
    .collapsible-toggle {
      font-size: 1.2em;
      transition: transform 0.3s ease;
      color: #7bc96f;
      font-weight: bold;
    }
    body[data-theme="dark"] .collapsible-toggle {
      color: #a8d5a8;
    }
    .collapsible-section.expanded .collapsible-toggle {
      transform: rotate(90deg);
    }
    
    .collapsible-content {
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.4s ease, padding 0.4s ease;
      padding: 0 20px;
    }
    .collapsible-section.expanded .collapsible-content {
      max-height: 5000px;
      padding: 20px;
    }
    
    .section-description {
      opacity: 0.75;
      font-size: 0.9em;
      margin: 8px 0 16px 0;
      font-style: italic;
    }

    /* Improved Form Layouts */
    .form-row {
      display: flex;
      gap: 12px;
      margin-bottom: 12px;
      flex-wrap: wrap;
      align-items: flex-end;
    }
    .form-row label {
      flex: 1;
      min-width: 200px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .form-row label span {
      font-weight: 600;
      font-size: 0.95em;
    }
    .form-row button {
      margin: 0;
      white-space: nowrap;
    }
    
    /* Better Table Styling */
    .enhanced-table {
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
    }
    .enhanced-table th {
      font-size: 0.9em;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 12px 8px;
    }
    .enhanced-table td {
      padding: 10px 8px;
    }
    .enhanced-table tr:hover {
      background: rgba(123, 201, 111, 0.05);
    }
    body[data-theme="dark"] .enhanced-table tr:hover {
      background: rgba(168, 213, 168, 0.05);
    }

    /* Badge Improvements */
    .status-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 0.85em;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .status-badge.active {
      background: rgba(123, 201, 111, 0.3);
      color: #4a7c4a;
      border: 1px solid #7bc96f;
    }
    .status-badge.inactive {
      background: rgba(139, 115, 85, 0.2);
      color: #8b7355;
      border: 1px solid #8b7355;
    }
    body[data-theme="dark"] .status-badge.active {
      background: rgba(168, 213, 168, 0.3);
      color: #a8d5a8;
    }

    /* Empty State Styling */
    .empty-state {
      text-align: center;
      padding: 32px 20px;
      opacity: 0.6;
      font-style: italic;
    }
    .empty-state::before {
      content: '📭';
      display: block;
      font-size: 2.5em;
      margin-bottom: 12px;
    }

    /* Quick Stats Grid */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin: 16px 0;
    }
    .stat-card {
      background: rgba(123, 201, 111, 0.15);
      padding: 16px;
      border-radius: 8px;
      border: 1px solid rgba(123, 201, 111, 0.3);
      text-align: center;
    }
    body[data-theme="dark"] .stat-card {
      background: rgba(168, 213, 168, 0.15);
      border-color: rgba(168, 213, 168, 0.3);
    }
    .stat-card .stat-value {
      font-size: 1.8em;
      font-weight: 700;
      color: #7bc96f;
      display: block;
    }
    body[data-theme="dark"] .stat-card .stat-value {
      color: #a8d5a8;
    }
    .stat-card .stat-label {
      font-size: 0.9em;
      opacity: 0.8;
      margin-top: 4px;
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
    
    // Collapsible section functionality
    function initCollapsible() {
      // Auto-convert existing h3 sections to collapsible
      autoConvertSections();
      
      const sections = document.querySelectorAll('.collapsible-section');
      
      // Load saved collapsed states from localStorage
      const savedStates = JSON.parse(localStorage.getItem('collapsedSections') || '{}');
      
      sections.forEach((section, index) => {
        const sectionId = section.dataset.sectionId || 'section-' + index;
        section.dataset.sectionId = sectionId;
        
        // Set initial state (expanded by default, or use saved state)
        const isExpanded = savedStates[sectionId] !== false;
        if (isExpanded) {
          section.classList.add('expanded');
          const content = section.querySelector('.collapsible-content');
          if (content) content.style.maxHeight = content.scrollHeight + 'px';
        }
        
        const header = section.querySelector('.collapsible-header');
        if (header) {
          header.addEventListener('click', function() {
            const content = section.querySelector('.collapsible-content');
            const isCurrentlyExpanded = section.classList.contains('expanded');
            
            if (isCurrentlyExpanded) {
              // Collapse
              section.classList.remove('expanded');
              content.style.maxHeight = '0';
              savedStates[sectionId] = false;
            } else {
              // Expand
              section.classList.add('expanded');
              content.style.maxHeight = content.scrollHeight + 'px';
              savedStates[sectionId] = true;
            }
            
            // Save state to localStorage
            localStorage.setItem('collapsedSections', JSON.stringify(savedStates));
          });
        }
      });
      
      // Add expand/collapse all buttons if there are multiple sections
      if (sections.length > 2) {
        addExpandCollapseButtons();
      }
    }
    
    // Auto-convert h3 sections to collapsible format
    function autoConvertSections() {
      const container = document.querySelector('.container');
      if (!container) return;
      
      const h3Elements = container.querySelectorAll('h3:not(.no-collapse)');
      
      h3Elements.forEach((h3, index) => {
        // Skip if already wrapped
        if (h3.closest('.collapsible-section')) return;
        
        // Get the section ID from h3 text for persistence
        const sectionId = h3.textContent.trim().replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
        
        // Create wrapper
        const wrapper = document.createElement('div');
        wrapper.className = 'collapsible-section';
        wrapper.dataset.sectionId = sectionId;
        
        // Create header
        const header = document.createElement('div');
        header.className = 'collapsible-header';
        header.innerHTML = '<span class="collapsible-toggle">▶</span><h3>' + h3.innerHTML + '</h3>';
        
        // Create content container
        const content = document.createElement('div');
        content.className = 'collapsible-content';
        
        // Find all content between this h3 and the next h3 (or end of container)
        let currentElement = h3.nextElementSibling;
        const elementsToMove = [];
        
        while (currentElement && currentElement.tagName !== 'H3' && currentElement.tagName !== 'H2') {
          elementsToMove.push(currentElement);
          currentElement = currentElement.nextElementSibling;
        }
        
        // Only create collapsible if there's content
        if (elementsToMove.length > 0) {
          // Insert wrapper before h3
          h3.parentNode.insertBefore(wrapper, h3);
          
          // Move elements into content
          elementsToMove.forEach(el => content.appendChild(el));
          
          // Remove original h3 and add new structure
          h3.remove();
          wrapper.appendChild(header);
          wrapper.appendChild(content);
        }
      });
    }
    
    function addExpandCollapseButtons() {
      const container = document.querySelector('.container');
      if (!container) return;
      
      const buttonContainer = document.createElement('div');
      buttonContainer.style.cssText = 'display: flex; gap: 8px; margin: 16px 0; justify-content: flex-end;';
      buttonContainer.innerHTML = '<button onclick="expandAllSections()" class="btn" style="padding: 6px 12px; margin: 0; font-size: 0.9em;">▼ Expand All</button>' +
        '<button onclick="collapseAllSections()" class="btn" style="padding: 6px 12px; margin: 0; font-size: 0.9em;">▲ Collapse All</button>';
      
      const firstSection = container.querySelector('.collapsible-section');
      if (firstSection) {
        firstSection.parentNode.insertBefore(buttonContainer, firstSection);
      }
    }
    
    function expandAllSections() {
      const sections = document.querySelectorAll('.collapsible-section');
      const savedStates = {};
      sections.forEach(section => {
        section.classList.add('expanded');
        const content = section.querySelector('.collapsible-content');
        if (content) content.style.maxHeight = content.scrollHeight + 'px';
        const sectionId = section.dataset.sectionId;
        if (sectionId) savedStates[sectionId] = true;
      });
      localStorage.setItem('collapsedSections', JSON.stringify(savedStates));
    }
    
    function collapseAllSections() {
      const sections = document.querySelectorAll('.collapsible-section');
      const savedStates = {};
      sections.forEach(section => {
        section.classList.remove('expanded');
        const content = section.querySelector('.collapsible-content');
        if (content) content.style.maxHeight = '0';
        const sectionId = section.dataset.sectionId;
        if (sectionId) savedStates[sectionId] = false;
      });
      localStorage.setItem('collapsedSections', JSON.stringify(savedStates));
    }

    function getScrollStorageKey() {
      const url = new URL(window.location.href);
      const module = url.searchParams.get('module') || 'default';
      return 'lop-scroll:' + url.pathname + ':' + module;
    }

    function saveCurrentScrollPosition() {
      try {
        sessionStorage.setItem(getScrollStorageKey(), String(window.scrollY || window.pageYOffset || 0));
      } catch {
        // Ignore storage errors.
      }
    }

    function restoreScrollPosition() {
      try {
        const raw = sessionStorage.getItem(getScrollStorageKey());
        const y = Number.parseInt(String(raw || ''), 10);
        if (!Number.isFinite(y) || y < 0) return;

        // Restore after layout settles (collapsible sections can shift height).
        requestAnimationFrame(() => window.scrollTo(0, y));
        setTimeout(() => window.scrollTo(0, y), 80);
      } catch {
        // Ignore storage errors.
      }
    }

    function initScrollPersistence() {
      if ('scrollRestoration' in history) {
        history.scrollRestoration = 'manual';
      }

      const forms = document.querySelectorAll('form');
      forms.forEach((form) => {
        form.addEventListener('submit', saveCurrentScrollPosition);
      });

      window.addEventListener('beforeunload', saveCurrentScrollPosition);
      restoreScrollPosition();
    }
    
    // Initialize on page load
    document.addEventListener('DOMContentLoaded', function() {
      initTheme();
      initCollapsible();
      initScrollPersistence();
    });
  </script>
</head>
<body data-theme="dark">
  <nav>
    <span class="logo">🐸 Moist Lieutenant</span>
    <div class="nav-links">
      <a href="/"${active==="home"?" class=active":""}>Home</a>
      <a href="/leaderboard"${active==="leaderboard"?" class=active":""}>Leaderboard</a>
      <a href="/lop"${active==="rankcard"?" class=active":""}>Rank Card</a>
      ${isAdmin?'<a href="/dashboard"'+(active==="admin"?' class=active':'')+'>Admin</a>':''}
    </div>
    <span class="nav-right">
      <button id="themeToggle" onclick="toggleTheme()">☀️ Light</button>
      ${user?`<span class="user"><img src="https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64" alt="avatar" />${escapeHtml(user.username)} <a href="/logout" class="btn" style="margin-left:10px;">Logout</a></span>`:`<a href="/login" class="btn">Login with Discord</a>`}
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

const DEFAULT_ECONOMY_GUIDE = "Use this guide to explain your server's economy system and how members can earn and spend currency.\n\nExample commands to highlight:\n- /balance [user]\n- /daily\n- /weekly\n- /pay <user> <amount>\n- /shop\n- /buy <item_number>\n- /fish\n- /dig\n- /phone <service>\n- /adventure\n- /explore";

const {
  getGuildSettings,
  getLevelRoles,
  getIgnoredChannels,
  updateGuildSettings,
  setLevelRole,
  deleteLevelRole,
  addIgnoredChannel,
  removeIgnoredChannel,
  getLoggingExclusions,
  addLoggingExclusion,
  removeLoggingExclusion,
  getLoggingEventConfigs,
  upsertLoggingEventConfig,
  getLoggingActorExclusions,
  addLoggingActorExclusion,
  removeLoggingActorExclusion,
  getAntiNukeExemptions,
  addAntiNukeExemption,
  removeAntiNukeExemption,
  getReactionRoleBindings,
  upsertReactionRoleBinding,
  removeReactionRoleBinding,
  getReactionRoleQuestions,
  getReactionRoleQuestion,
  createReactionRoleQuestion,
  updateReactionRoleQuestion,
  deleteReactionRoleQuestion,
  getReactionRoleOptions,
  createReactionRoleOption,
  updateReactionRoleOption,
  deleteReactionRoleOption,
  getTicketSettings,
  upsertTicketSettings,
  getOpenTickets
} = require("./settings");
const { LOG_EVENT_DEFS } = require("./loggingConfig");
const { ChannelType } = require("discord.js");
const { normalizeEmojiKey } = require("./reactionRoles");
const { sendTicketPanel, closeTicketChannel } = require("./tickets");
const {
  SOCIAL_PLATFORM_OPTIONS,
  SOCIAL_EVENT_LABELS,
  getSupportedEventsForPlatform,
  defaultTemplateForEvent,
  normalizePlatform,
  normalizeSocialExternalId,
  inferSourceUrl,
  inferDefaultLabel
} = require("./socials");

async function buildGuildConfigBackup(guildId) {
  const singleRowTables = [
    "guild_settings",
    "ticket_settings",
    "welcome_goodbye_settings",
    "automod_settings",
    "suggestion_settings",
    "starboard_settings",
    "economy_settings",
    "birthday_settings"
  ];
  const multiRowTables = [
    "level_roles",
    "ignored_channels",
    "logging_exclusions",
    "logging_event_configs",
    "logging_actor_exclusions",
    "reaction_role_bindings",
    "auto_roles",
    "customization_unlocks"
  ];

  const backup = {
    version: 1,
    created_at: Date.now(),
    guild_id: guildId,
    data: {}
  };

  for (const table of singleRowTables) {
    backup.data[table] = await get(`SELECT * FROM ${table} WHERE guild_id=?`, [guildId]);
  }
  for (const table of multiRowTables) {
    backup.data[table] = await all(`SELECT * FROM ${table} WHERE guild_id=?`, [guildId]);
  }

  const socialLinks = await all(
    `SELECT * FROM social_links WHERE guild_id=? ORDER BY created_at ASC`,
    [guildId]
  );
  const socialRules = await all(
    `SELECT * FROM social_link_rules WHERE guild_id=? ORDER BY link_id ASC, id ASC`,
    [guildId]
  );
  backup.data.social_links = socialLinks;
  backup.data.social_link_rules = socialRules;

  const reactionQuestions = await all(
    `SELECT * FROM reaction_role_questions WHERE guild_id=? ORDER BY created_at ASC, id ASC`,
    [guildId]
  );
  const questionIds = reactionQuestions.map((q) => q.id);
  let reactionOptions = [];
  if (questionIds.length) {
    const placeholders = questionIds.map(() => "?").join(", ");
    reactionOptions = await all(
      `SELECT * FROM reaction_role_options WHERE question_id IN (${placeholders}) ORDER BY question_id ASC, position ASC, id ASC`,
      questionIds
    );
  }
  backup.data.reaction_role_questions = reactionQuestions;
  backup.data.reaction_role_options = reactionOptions;

  return backup;
}

async function insertTableRow(tableName, row, opts = {}) {
  if (!row || typeof row !== "object") return;
  const payload = { ...row };
  if (opts.forceGuildId) payload.guild_id = opts.forceGuildId;
  for (const col of opts.omitColumns || []) {
    delete payload[col];
  }

  const columns = Object.keys(payload);
  if (!columns.length) return;

  const placeholders = columns.map(() => "?").join(", ");
  const sql = `INSERT INTO ${tableName} (${columns.join(", ")}) VALUES (${placeholders})`;
  await run(sql, columns.map((c) => payload[c]));
}

async function importGuildConfigBackup(guildId, payload) {
  const data = payload?.data && typeof payload.data === "object" ? payload.data : payload;
  if (!data || typeof data !== "object") {
    throw new Error("Backup payload is missing data.");
  }

  const singleRowTables = [
    "guild_settings",
    "ticket_settings",
    "welcome_goodbye_settings",
    "automod_settings",
    "suggestion_settings",
    "starboard_settings",
    "economy_settings",
    "birthday_settings"
  ];
  const multiRowTables = [
    "level_roles",
    "ignored_channels",
    "logging_exclusions",
    "logging_event_configs",
    "logging_actor_exclusions",
    "reaction_role_bindings",
    "auto_roles",
    "customization_unlocks"
  ];

  try {
    for (const table of singleRowTables) {
      await run(`DELETE FROM ${table} WHERE guild_id=?`, [guildId]);
    }
    for (const table of multiRowTables) {
      await run(`DELETE FROM ${table} WHERE guild_id=?`, [guildId]);
    }
    await run(`DELETE FROM social_link_rules WHERE guild_id=?`, [guildId]);
    await run(`DELETE FROM social_links WHERE guild_id=?`, [guildId]);
    await run(`DELETE FROM reaction_role_questions WHERE guild_id=?`, [guildId]);

    for (const table of singleRowTables) {
      const row = data[table] || null;
      if (row) {
        await insertTableRow(table, row, { forceGuildId: guildId });
      }
    }
    for (const table of multiRowTables) {
      const rows = Array.isArray(data[table]) ? data[table] : [];
      for (const row of rows) {
        await insertTableRow(table, row, { forceGuildId: guildId });
      }
    }

    const socialLinks = Array.isArray(data.social_links) ? data.social_links : [];
    const socialRules = Array.isArray(data.social_link_rules) ? data.social_link_rules : [];
    const socialLinkMap = new Map();
    for (const link of socialLinks) {
      const linkPayload = { ...link, guild_id: guildId };
      delete linkPayload.id;
      const columns = Object.keys(linkPayload);
      const inserted = await get(
        `INSERT INTO social_links (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")}) RETURNING id`,
        columns.map((c) => linkPayload[c])
      );
      if (link?.id && inserted?.id) socialLinkMap.set(Number(link.id), Number(inserted.id));
    }
    for (const rule of socialRules) {
      const mappedLinkId = socialLinkMap.get(Number(rule.link_id));
      if (!mappedLinkId) continue;
      const rulePayload = { ...rule, guild_id: guildId, link_id: mappedLinkId };
      delete rulePayload.id;
      await insertTableRow("social_link_rules", rulePayload);
    }

    const questions = Array.isArray(data.reaction_role_questions) ? data.reaction_role_questions : [];
    const options = Array.isArray(data.reaction_role_options) ? data.reaction_role_options : [];
    const questionMap = new Map();
    for (const question of questions) {
      const questionPayload = { ...question, guild_id: guildId };
      delete questionPayload.id;
      const columns = Object.keys(questionPayload);
      const inserted = await get(
        `INSERT INTO reaction_role_questions (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")}) RETURNING id`,
        columns.map((c) => questionPayload[c])
      );
      if (question?.id && inserted?.id) questionMap.set(Number(question.id), Number(inserted.id));
    }
    for (const option of options) {
      const mappedQuestionId = questionMap.get(Number(option.question_id));
      if (!mappedQuestionId) continue;
      const optionPayload = { ...option, question_id: mappedQuestionId };
      delete optionPayload.id;
      await insertTableRow("reaction_role_options", optionPayload);
    }

  } catch (error) {
    throw error;
  }
}

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
        if (member && member.permissions.has("Administrator")) {
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

    async function getGuildAccessLevel(user, guildId) {
      const result = {
        isManager: false,
        isAdmin: false,
        isModerator: false,
        member: null
      };

      if (!user?.id || !guildId) return result;

      if (process.env.BOT_MANAGER_ID && user.id === process.env.BOT_MANAGER_ID) {
        result.isManager = true;
        result.isAdmin = true;
        result.isModerator = true;
        return result;
      }

      const guild = client.guilds.cache.get(guildId);
      if (!guild) return result;

      let member = guild.members.cache.get(user.id);
      if (!member) {
        member = await guild.members.fetch(user.id).catch(() => null);
      }
      if (!member) return result;

      result.member = member;
      result.isAdmin = member.permissions.has("Administrator");
      if (result.isAdmin) {
        result.isModerator = true;
        return result;
      }

      const modRoleId = (await getGuildSettings(guildId).catch(() => null))?.mod_role_id || null;
      if (!modRoleId) return result;

      const modRole = guild.roles.cache.get(modRoleId) || await guild.roles.fetch(modRoleId).catch(() => null);
      if (!modRole) return result;

      const hasModRoleOrHigher = member.roles.cache.some((role) => role.position >= modRole.position);
      result.isModerator = hasModRoleOrHigher;
      return result;
    }

    async function requireGuildAdmin(req, res, next) {
      if (!(req.isAuthenticated && req.isAuthenticated())) {
        if (req.session) req.session.returnTo = req.originalUrl;
        return res.redirect("/login");
      }

      const guildId = req.params.guildId;
      const access = await getGuildAccessLevel(req.user, guildId);
      if (!(access.isAdmin || access.isManager)) {
        return res.status(403).send("Only server administrators or the configured manager can access admin features.");
      }
      return next();
    }

    async function requireGuildModerator(req, res, next) {
      if (!(req.isAuthenticated && req.isAuthenticated())) {
        if (req.session) req.session.returnTo = req.originalUrl;
        return res.redirect("/login");
      }

      const guildId = req.params.guildId;
      const access = await getGuildAccessLevel(req.user, guildId);
      if (!access.isModerator) {
        return res.status(403).send("Only moderators (mod role or higher), administrators, or the manager can access moderation features.");
      }
      return next();
    }

    // Helper: check if channel is text-like
    function isTextChannelLike(channel) {
      if (!channel) return false;
      return channel.isTextBased && channel.isTextBased();
    }

    // Helper: get redirect URL with module preserved
    function getModuleRedirect(guildId, module) {
      if (module) {
        return `/guild/${guildId}?module=${encodeURIComponent(module)}`;
      }
      return `/guild/${guildId}`;
    }

    function getPrimaryGuild() {
      return client.guilds.cache.first() || null;
    }

  // Sessions (must be before passport.session() and before routes that read req.user)
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
        secure: false,
        maxAge: 30 * 24 * 60 * 60 * 1000
      }
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

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
          const medalColor = i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : '#7bc96f';
          return `
            <tr class="lb-row" style="background: linear-gradient(90deg, ${medalColor}15 0%, transparent 100%);">
              <td class="lb-rank" style="font-weight:700;color:${medalColor};">${badge} #${i+1}</td>
              <td class="lb-user">
                ${avatarUrl ? `<img src="${avatarUrl}" alt="${displayName}" class="lb-avatar">` : '<div class="lb-avatar-placeholder">👤</div>'}
                <span>${escapeHtml(displayName)}</span>
              </td>
              <td class="lb-level"><span style="background:linear-gradient(135deg,#7bc96f,#a8d5a8);-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-weight:700;">Lvl ${r.level}</span></td>
              <td class="lb-xp"><span style="color:#7bc96f;font-weight:600;">${r.xp.toLocaleString()}</span></td>
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
              border: 2px solid #7bc96f;
              object-fit: cover;
              box-shadow: 0 2px 8px rgba(123, 201, 111, 0.4);
            }
            body[data-theme="dark"] .lb-avatar {
              border-color: #a8d5a8;
              box-shadow: 0 2px 8px rgba(168, 213, 168, 0.4);
            }
            .lb-avatar-placeholder {
              width: 48px;
              height: 48px;
              border-radius: 50%;
              background: gradient(135deg, #7bc96f, #a8d5a8);
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 1.8em;
              border: 2px solid #7bc96f;
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
                <tr style="background: linear-gradient(135deg, #7bc96f 0%, #a8d5a8 100%); color: #0a1e1e;">
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

  // Discord OAuth2 login
  if (HAS_DISCORD_OAUTH) {
    app.get("/login", passport.authenticate("discord"));
    app.get("/auth/discord", passport.authenticate("discord"));
    app.get("/auth/discord/callback",
      passport.authenticate("discord", { failureRedirect: "/login" }),
      (req, res) => {
        const redirectTo = req.session?.returnTo || "/";
        if (req.session) delete req.session.returnTo;
        res.redirect(redirectTo);
      }
    );
  } else {
    app.get("/auth/discord", (_req, res) => {
      res.status(503).send("Discord OAuth is not configured.");
    });
    app.get("/auth/discord/callback", (_req, res) => {
      res.status(503).send("Discord OAuth is not configured.");
    });
  }
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

      let rank = null;
      let displayName = user?.username || "Your Name";
      if (guild && userId) {
        const member = await guild.members.fetch(userId).catch(() => null);
        displayName = member?.displayName || displayName;
      }
      try {
        if (guildId && userId) {
          const leaderboard = await all(
            `SELECT user_id FROM user_xp WHERE guild_id=? ORDER BY xp DESC`,
            [guildId]
          );
          rank = leaderboard.findIndex(row => row.user_id === userId) + 1;
        }
      } catch (e) {
        rank = null;
      }
      const xpStart = totalXpForLevel(userLevel);
      const xpNext = xpStart + xpToNextLevel(userLevel);
      const xpIntoLevel = userXp - xpStart;
      const xpToNext = xpNext - userXp;
      
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

      if (bgMode === "image" && isUnlocked("bgimage")) {
        try {
          if (prefs.bgimage_data) {
            const img = await loadImage(prefs.bgimage_data);
            ctx.drawImage(img, 0, 0, width, height);
          } else if (prefs.bgimage) {
            let imgPath = path.resolve(prefs.bgimage);
            const img = await loadImage(imgPath);
            ctx.drawImage(img, 0, 0, width, height);
          } else {
            throw new Error("No background image data");
          }
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
      ctx.strokeText(displayName, 170, 50);
      ctx.fillText(displayName, 170, 50);
      
      ctx.font = `bold 22px ${fontFamily}`;
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "rgba(0,0,0,0.7)";
      ctx.lineWidth = 2;
      ctx.strokeText(`Level: ${userLevel}`, 170, 80);
      ctx.fillText(`Level: ${userLevel}`, 170, 80);
      
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
      ctx.strokeText(`XP: ${userXp} / ${xpNext} (+${xpToNext} to next)`, 170, 130);
      ctx.fillText(`XP: ${userXp} / ${xpNext} (+${xpToNext} to next)`, 170, 130);
      
      // Progress bar
      const barX = 170, barY = 145, barW = 380, barH = 20;
      ctx.fillStyle = "#444";
      ctx.fillRect(barX, barY, barW, barH);
      const progressDen = Math.max(1, (xpNext - xpStart));
      const progress = Math.max(0, Math.min(1, (userXp - xpStart) / progressDen));
      ctx.fillStyle = "#43B581";
      ctx.fillRect(barX, barY, barW * progress, barH);
      ctx.strokeStyle = "#222";
      ctx.lineWidth = 2;
      ctx.strokeRect(barX, barY, barW, barH);
      ctx.font = `bold 16px ${fontFamily}`;
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "rgba(0,0,0,0.7)";
      ctx.lineWidth = 2;
      ctx.strokeText(`${xpIntoLevel} / ${xpToNextLevel(userLevel)} XP this level`, barX + 10, barY + 16);
      ctx.fillText(`${xpIntoLevel} / ${xpToNextLevel(userLevel)} XP this level`, barX + 10, barY + 16);
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
          avatarbordercolor: req.body.avatarbordercolor || "#7bc96f",
          borderglow: req.body.borderglow || "none",
          avatarframe: req.body.avatarframe || "none"
        };

        let rank = null;
        let displayName = user?.username || "Your Name";
        if (guild && userId) {
          const member = await guild.members.fetch(userId).catch(() => null);
          displayName = member?.displayName || displayName;
        }
        try {
          if (guildId && userId) {
            const leaderboard = await all(
              `SELECT user_id FROM user_xp WHERE guild_id=? ORDER BY xp DESC`,
              [guildId]
            );
            rank = leaderboard.findIndex(row => row.user_id === userId) + 1;
          }
        } catch (e) {
          rank = null;
        }
        const xpStart = totalXpForLevel(userLevel);
        const xpNext = xpStart + xpToNextLevel(userLevel);
        const xpIntoLevel = userXp - xpStart;
        const xpToNext = xpNext - userXp;
        
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
          const borderColor = prefs.avatarbordercolor || '#7bc96f';
          const glowType = prefs.borderglow || 'none';
          const frameType = prefs.avatarframe || 'none';
          
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
        ctx.strokeText(displayName, 170, 50);
        ctx.fillText(displayName, 170, 50);
        
        ctx.font = `bold 22px ${fontFamily}`;
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "rgba(0,0,0,0.7)";
        ctx.lineWidth = 2;
        ctx.strokeText(`Level: ${userLevel}`, 170, 80);
        ctx.fillText(`Level: ${userLevel}`, 170, 80);
        
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
        ctx.strokeText(`XP: ${userXp} / ${xpNext} (+${xpToNext} to next)`, 170, 130);
        ctx.fillText(`XP: ${userXp} / ${xpNext} (+${xpToNext} to next)`, 170, 130);
        
        // Progress bar
        const barX = 170, barY = 145, barW = 380, barH = 20;
        ctx.fillStyle = "#444";
        ctx.fillRect(barX, barY, barW, barH);
        const progressDen = Math.max(1, (xpNext - xpStart));
        const progress = Math.max(0, Math.min(1, (userXp - xpStart) / progressDen));
        ctx.fillStyle = "#43B581";
        ctx.fillRect(barX, barY, barW * progress, barH);
        ctx.strokeStyle = "#222";
        ctx.lineWidth = 2;
        ctx.strokeRect(barX, barY, barW, barH);
        ctx.font = `bold 16px ${fontFamily}`;
        ctx.fillStyle = "#fff";
        ctx.strokeStyle = "rgba(0,0,0,0.7)";
        ctx.lineWidth = 2;
        ctx.strokeText(`${xpIntoLevel} / ${xpToNextLevel(userLevel)} XP this level`, barX + 10, barY + 16);
        ctx.fillText(`${xpIntoLevel} / ${xpToNextLevel(userLevel)} XP this level`, barX + 10, barY + 16);
        
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
  if (!HAS_DISCORD_OAUTH && !password) {
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
  if (!HAS_DISCORD_OAUTH) {
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
  }

  // ─────────────────────────────────────────────
  // Home: list guilds
  // ─────────────────────────────────────────────
  app.get("/admin", (req, res) => {
    return res.redirect("/dashboard");
  });

  // Public home page (optional: show info or redirect to /lop)
  app.get("/", (req, res) => {
    const opts = getTemplateOpts(req);
    res.send(htmlTemplate(`
      <h2>🐸 Welcome to Moist Lieutenant!</h2>
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
          color: #7bc96f;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        body[data-theme="dark"] .section-title {
          color: #a8d5a8;
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
          background: rgba(123,201,111,0.2);
          color: #7bc96f;
        }
        body[data-theme="dark"] .feature-badge {
          background: rgba(168,213,168,0.2);
          color: #a8d5a8;
        }
        .feature-badge.locked {
          background: rgba(184,134,11,0.2);
          color: #b8860b;
        }
        .customize-form input[type="color"] {
          width: 60px;
          height: 44px;
          padding: 2px;
          border: 2px solid rgba(123,201,111,0.5);
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .customize-form input[type="color"]:hover {
          border-color: #7bc96f;
          box-shadow: 0 0 12px rgba(123,201,111,0.5);
        }
        .customize-form input[type="text"],
        .customize-form select,
        .customize-form input[type="number"] {
          padding: 8px 12px;
          border: 2px solid rgba(123,201,111,0.3);
          border-radius: 6px;
          background: rgba(255,255,255,0.95);
          color: #0a1e1e;
          font-size: 0.95em;
          transition: all 0.2s;
        }
        body[data-theme="dark"] .customize-form input[type="color"] {
          border-color: rgba(168,213,168,0.5);
        }
        body[data-theme="dark"] .customize-form input[type="color"]:hover {
          border-color: #a8d5a8;
          box-shadow: 0 0 12px rgba(168,213,168,0.5);
        }
        body[data-theme="dark"] .customize-form input[type="text"],
        body[data-theme="dark"] .customize-form select,
        body[data-theme="dark"] .customize-form input[type="number"] {
          background: rgba(0,0,0,0.3);
          color: #f0f0f0;
          border-color: rgba(168,213,168,0.3);
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
          border-color: #7bc96f;
          box-shadow: 0 0 8px rgba(123,201,111,0.4);
        }
        body[data-theme="dark"] .customize-form input:focus,
        body[data-theme="dark"] .customize-form select:focus {
          border-color: #a8d5a8;
          box-shadow: 0 0 8px rgba(168,213,168,0.4);
        }
        .image-upload-area {
          border: 2px dashed rgba(123,201,111,0.4);
          border-radius: 8px;
          padding: 20px;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s;
          background: rgba(123,201,111,0.05);
        }
        body[data-theme="dark"] .image-upload-area {
          border-color: rgba(168,213,168,0.4);
          background: rgba(168,213,168,0.05);
        }
        .image-upload-area:hover {
          border-color: #7bc96f;
          background: rgba(123,201,111,0.1);
        }
        body[data-theme="dark"] .image-upload-area:hover {
          border-color: #a8d5a8;
          background: rgba(168,213,168,0.1);
        }
        .image-upload-area.dragover {
          border-color: #7bc96f;
          background: rgba(123,201,111,0.15);
          transform: scale(1.02);
        }
        #cropperContainer {
          margin-top: 16px;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 4px 12px rgba(0,0,0,0.2);
          padding: 16px;
          background: rgba(123, 201, 111, 0.05);
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
          background: linear-gradient(135deg, #7bc96f, #6b9b6b);
          color: #0a1e1e;
        }
        .crop-confirm-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(123, 201, 111, 0.4);
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
          color: #7bc96f;
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
          border-color: #7bc96f;
        }
        .customize-form button[type="submit"] {
          background: linear-gradient(135deg, #7bc96f, #a8d5a8);
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
                  <input type="color" id="gradColor1" class="grad-picker" value="${prefs.gradient?.split(',')[0] || '#a8d5a8'}" ${!isUnlocked('gradient') ? 'disabled' : ''}>
                </div>
                <div>
                  <input type="color" id="gradColor2" class="grad-picker" value="${prefs.gradient?.split(',')[1] || '#8b7355'}" ${!isUnlocked('gradient') ? 'disabled' : ''}>
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
                <div style="width:70px;height:70px;border-radius:50%;background:linear-gradient(135deg, #7bc96f, #a8d5a8);display:flex;align-items:center;justify-content:center;font-size:2em;box-shadow:inset 0 0 0 3px #7bc96f;">👤</div>
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
              <input type="color" name="avatarbordercolor" value="${prefs.avatarbordercolor || '#7bc96f'}" ${!isUnlocked('border') ? 'disabled' : ''}>
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
                img.style.border = '2px solid #7bc96f';
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
      const resizedBuffer = await sharp(req.file.path)
        .resize(600, 180, { fit: 'cover' })
        .png()
        .toBuffer();
      update.bgimage_data = resizedBuffer;
      update.bgimage = null;
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
    const guild = getPrimaryGuild();
    if (!guild) {
      const opts = getTemplateOpts(req);
      return res.send(htmlTemplate(`<h2>Bot Dashboard</h2><p>The bot is not in any servers.</p>`, { ...opts, active: "admin" }));
    }
    return res.redirect(`/guild/${guild.id}?module=overview`);
  });

  app.get("/dashboard/:module", requireDiscordLogin, requireAdminOrManager, async (req, res) => {
    const guild = getPrimaryGuild();
    if (!guild) {
      const opts = getTemplateOpts(req);
      return res.send(htmlTemplate(`<h2>Bot Dashboard</h2><p>The bot is not in any servers.</p>`, { ...opts, active: "admin" }));
    }
    const moduleName = String(req.params.module || "overview").toLowerCase();
    return res.redirect(`/guild/${guild.id}?module=${encodeURIComponent(moduleName)}`);
  });

  // ─────────────────────────────────────────────
  // Guild page
  // ─────────────────────────────────────────────
  app.get("/guild/:guildId", requireGuildModerator, async (req, res) => {
    const guildId = req.params.guildId;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.status(404).send("Bot is not in that guild.");
    const access = await getGuildAccessLevel(req.user, guildId);
    const canAccessAdminFeatures = access.isAdmin || access.isManager;

    const settings = await getGuildSettings(guildId);
    const levelRoles = await getLevelRoles(guildId);
    const ignoredChannels = await getIgnoredChannels(guildId);

    await guild.channels.fetch().catch(() => {});
    const textChannels = guild.channels.cache
      .filter((c) => c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement)
      .map((c) => ({ id: c.id, name: c.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const voiceChannels = guild.channels.cache
      .filter((c) => c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice)
      .map((c) => ({ id: c.id, name: c.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const categories = guild.channels.cache
      .filter((c) => c.type === ChannelType.GuildCategory)
      .map((c) => ({ id: c.id, name: c.name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    await guild.roles.fetch().catch(() => {});
    await guild.members.fetch().catch(() => {});

    const roleOptions = guild.roles.cache
      .filter((r) => !r.managed && r.id !== guild.id)
      .sort((a, b) => b.position - a.position)
      .map((r) => ({ id: r.id, name: r.name }));

    const modWarnings = await all(
      `SELECT id, user_id, moderator_id, reason, created_at
       FROM mod_warnings
       WHERE guild_id=?
       ORDER BY created_at DESC
       LIMIT 50`,
      [guildId]
    );
    const antiNukeTypeOptions = new Set([
      "all",
      "trigger",
      "manual_unlock",
      "auto_unlock",
      "history_cleared",
      "auto_unlock_canceled",
      "exemption_added",
      "exemption_removed"
    ]);
    const antiNukeTypeFilterRaw = String(req.query.anti_nuke_type || "all").trim().toLowerCase();
    const antiNukeTypeFilter = antiNukeTypeOptions.has(antiNukeTypeFilterRaw)
      ? antiNukeTypeFilterRaw
      : "all";
    const antiNukeSearch = String(req.query.anti_nuke_search || "").trim().slice(0, 80);
    const antiNukePageRaw = Number.parseInt(String(req.query.anti_nuke_page || "1"), 10);
    const antiNukePageSize = 25;

    const antiNukeWhere = ["guild_id=?"];
    const antiNukeParams = [guildId];

    if (antiNukeTypeFilter !== "all") {
      antiNukeWhere.push("incident_type=?");
      antiNukeParams.push(antiNukeTypeFilter);
    }

    if (antiNukeSearch) {
      const like = `%${antiNukeSearch}%`;
      antiNukeWhere.push(`(
        COALESCE(event_type, '') ILIKE ?
        OR COALESCE(actor_user_id, '') ILIKE ?
        OR COALESCE(initiated_by_user_id, '') ILIKE ?
        OR COALESCE(details, '') ILIKE ?
      )`);
      antiNukeParams.push(like, like, like, like);
    }

    const antiNukeCountRow = await get(
      `SELECT COUNT(*)::int AS count
       FROM anti_nuke_incidents
       WHERE ${antiNukeWhere.join(" AND ")}`,
      antiNukeParams
    );
    const antiNukeTotal = Number(antiNukeCountRow?.count || 0);
    const antiNukeTotalPages = Math.max(1, Math.ceil(antiNukeTotal / antiNukePageSize));
    const antiNukePage = Number.isInteger(antiNukePageRaw)
      ? Math.min(antiNukeTotalPages, Math.max(1, antiNukePageRaw))
      : 1;
    const antiNukeOffset = (antiNukePage - 1) * antiNukePageSize;

    const antiNukeIncidents = await all(
      `SELECT id, incident_type, event_type, actor_user_id, initiated_by_user_id, details, created_at
       FROM anti_nuke_incidents
       WHERE ${antiNukeWhere.join(" AND ")}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...antiNukeParams, antiNukePageSize, antiNukeOffset]
    );
    const pendingAntiNukeUnlockJobs = await all(
      `SELECT id, run_at, unlock_perms_json, created_at
       FROM anti_nuke_unlock_jobs
       WHERE guild_id=? AND executed_at IS NULL
       ORDER BY run_at ASC
       LIMIT 50`,
      [guildId]
    );
    const antiNukeExemptions = await getAntiNukeExemptions(guildId);
    const warningRows = modWarnings.map((w) => {
      const target = guild.members.cache.get(w.user_id);
      const moderator = guild.members.cache.get(w.moderator_id);
      const targetName = target ? `${target.displayName} (${target.user.username})` : w.user_id;
      const moderatorName = moderator ? `${moderator.displayName} (${moderator.user.username})` : w.moderator_id;
      const createdAt = Number.isFinite(Number(w.created_at)) ? new Date(Number(w.created_at)).toLocaleString() : "-";
      return {
        id: w.id,
        userId: w.user_id,
        targetName,
        moderatorName,
        reason: w.reason,
        createdAt
      };
    });
    const antiNukeRows = antiNukeIncidents.map((row) => {
      const actor = row.actor_user_id ? guild.members.cache.get(row.actor_user_id) : null;
      const initiator = row.initiated_by_user_id ? guild.members.cache.get(row.initiated_by_user_id) : null;
      const actorName = row.actor_user_id
        ? (actor ? `${actor.displayName} (${actor.user.username})` : row.actor_user_id)
        : "-";
      const initiatorName = row.initiated_by_user_id
        ? (initiator ? `${initiator.displayName} (${initiator.user.username})` : row.initiated_by_user_id)
        : "-";
      const createdAt = Number.isFinite(Number(row.created_at)) ? new Date(Number(row.created_at)).toLocaleString() : "-";
      let detailsText = "-";
      if (row.details) {
        try {
          const parsed = JSON.parse(row.details);
          if (parsed && typeof parsed === "object") {
            detailsText = Object.entries(parsed)
              .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(",") : String(v)}`)
              .join(" | ");
          } else {
            detailsText = String(row.details);
          }
        } catch {
          detailsText = String(row.details);
        }
      }
      return {
        id: row.id,
        incidentType: row.incident_type,
        eventType: row.event_type || "-",
        actorName,
        initiatorName,
        detailsText,
        createdAt
      };
    });
    const pendingAntiNukeJobRows = pendingAntiNukeUnlockJobs.map((row) => {
      let permissions = [];
      try {
        const parsed = JSON.parse(String(row.unlock_perms_json || "[]"));
        if (Array.isArray(parsed)) permissions = parsed;
      } catch {
        permissions = [];
      }

      const runAtTs = Number(row.run_at || 0);
      const createdAtTs = Number(row.created_at || 0);
      const etaMs = Math.max(0, runAtTs - Date.now());
      const etaMinutes = Math.ceil(etaMs / 60_000);

      return {
        id: row.id,
        runAt: Number.isFinite(runAtTs) && runAtTs > 0 ? new Date(runAtTs).toLocaleString() : "-",
        createdAt: Number.isFinite(createdAtTs) && createdAtTs > 0 ? new Date(createdAtTs).toLocaleString() : "-",
        eta: Number.isFinite(etaMinutes) && etaMinutes > 0 ? `${etaMinutes}m` : "due",
        permissions: permissions.length ? permissions.join(", ") : "-"
      };
    });
    const antiNukeExemptionRows = antiNukeExemptions.map((entry) => {
      const role = roleOptions.find((r) => r.id === entry.target_id);
      const member = guild.members.cache.get(entry.target_id);
      const label = entry.target_type === "role"
        ? `@${role?.name || entry.target_id}`
        : (member ? `${member.displayName} (${member.user.username})` : entry.target_id);
      const createdAt = Number.isFinite(Number(entry.created_at))
        ? new Date(Number(entry.created_at)).toLocaleString()
        : "-";
      return {
        targetId: entry.target_id,
        targetType: entry.target_type,
        label,
        createdAt
      };
    });
    const antiNukeTypeQuery = antiNukeTypeFilter !== "all"
      ? `&anti_nuke_type=${encodeURIComponent(antiNukeTypeFilter)}`
      : "";
    const antiNukeSearchQuery = antiNukeSearch
      ? `&anti_nuke_search=${encodeURIComponent(antiNukeSearch)}`
      : "";
    const antiNukeBaseQuery = `module=moderation${antiNukeTypeQuery}${antiNukeSearchQuery}`;
    const antiNukeHasPrevPage = antiNukePage > 1;
    const antiNukeHasNextPage = antiNukePage < antiNukeTotalPages;

    const claimLock = await get(`SELECT claim_all_done FROM guild_settings WHERE guild_id=?`, [guildId]);
    const claimLocked = claimLock?.claim_all_done === 1;
    const loggingExclusions = await getLoggingExclusions(guildId);
    const eventConfigs = await getLoggingEventConfigs(guildId);
    const actorExclusions = await getLoggingActorExclusions(guildId);
    const reactionRoleBindings = await getReactionRoleBindings(guildId);
    const reactionRoleQuestions = await getReactionRoleQuestions(guildId);
    const ticketSettings = await getTicketSettings(guildId);
    const openTickets = await getOpenTickets(guildId);
    const welcomeSettings = await get(`SELECT * FROM welcome_goodbye_settings WHERE guild_id=?`, [guildId]);
    const autoRoles = await all(`SELECT * FROM auto_roles WHERE guild_id=?`, [guildId]);
    const automodSettings = await get(`SELECT * FROM automod_settings WHERE guild_id=?`, [guildId]);
    const suggestionSettings = await get(`SELECT * FROM suggestion_settings WHERE guild_id=?`, [guildId]);
    const allSuggestions = await all(`SELECT * FROM suggestions WHERE guild_id=? ORDER BY created_at DESC`, [guildId]);
    const starboardSettings = await get(`SELECT * FROM starboard_settings WHERE guild_id=?`, [guildId]);
    
    // New systems data
    const giveaways = await all(`SELECT * FROM giveaways WHERE guild_id=? ORDER BY end_time DESC LIMIT 20`, [guildId]);
    const economySettings = await get(`SELECT * FROM economy_settings WHERE guild_id=?`, [guildId]);
    const topEconomy = await all(`SELECT user_id, balance, bank, (balance + bank) as total FROM user_economy WHERE guild_id=? ORDER BY total DESC LIMIT 10`, [guildId]);
    const reactionRolesConfig = await all(`SELECT * FROM reaction_roles WHERE guild_id=? ORDER BY created_at DESC`, [guildId]);
    const birthdaySettings = await get(`SELECT * FROM birthday_settings WHERE guild_id=?`, [guildId]);
    const upcomingBirthdays = await all(`SELECT * FROM birthdays WHERE guild_id=? ORDER BY birth_month, birth_day LIMIT 20`, [guildId]);
    const customCommands = await all(`SELECT * FROM custom_commands WHERE guild_id=? ORDER BY created_at DESC`, [guildId]);
    const autoReplies = await all(`SELECT * FROM auto_replies WHERE guild_id=? ORDER BY created_at DESC`, [guildId]);
    const socialLinks = await all(
      `SELECT id, platform, external_id, source_url, label, channel_id, enabled, created_at, last_checked_at
       FROM social_links
       WHERE guild_id=?
       ORDER BY created_at DESC`,
      [guildId]
    );
    const socialRules = await all(
      `SELECT id, link_id, event_type, enabled, channel_id, role_id, message_template
       FROM social_link_rules
       WHERE guild_id=?
       ORDER BY link_id, event_type`,
      [guildId]
    );
    const socialRulesByLink = new Map();
    for (const rule of socialRules) {
      if (!socialRulesByLink.has(rule.link_id)) socialRulesByLink.set(rule.link_id, []);
      socialRulesByLink.get(rule.link_id).push(rule);
    }
    
    const eventConfigMap = new Map(eventConfigs.map((cfg) => [cfg.event_key, cfg]));
    const requestedModule = String(req.query.module || "overview").toLowerCase();
    const moduleTabs = [
      { key: "overview", label: "Overview" },
      { key: "moderation", label: "Moderation" },
      { key: "welcome", label: "Welcome & Auto-Roles" },
      { key: "logging", label: "Logging" },
      { key: "socials", label: "Socials" },
      { key: "xp", label: "XP" },
      { key: "tickets", label: "Tickets" },
      { key: "reactionroles", label: "Reaction Roles" },
      { key: "voice", label: "Voice" },
      { key: "giveaways", label: "Giveaways" },
      { key: "economy", label: "Economy" },
      { key: "birthdays", label: "Birthdays" },
      { key: "customcommands", label: "Custom Commands" },
      { key: "autoreplies", label: "Auto Replies" },
      { key: "customization", label: "Customization" }
    ];
    const moderatorModules = new Set(["moderation", "logging"]);
    const visibleTabs = canAccessAdminFeatures
      ? moduleTabs
      : moduleTabs.filter((tab) => moderatorModules.has(tab.key));
    const fallbackModule = visibleTabs[0]?.key || "moderation";
    const activeModule = visibleTabs.some((tab) => tab.key === requestedModule)
      ? requestedModule
      : fallbackModule;

    const xpCountRow = await get(
      `SELECT COUNT(*)::int AS count FROM user_xp WHERE guild_id=?`,
      [guildId]
    );
    const trackedXpUsers = Number(xpCountRow?.count || 0);

    const privateRooms = await all(
      `SELECT owner_id, voice_channel_id, text_channel_id, created_at, last_active_at
       FROM private_voice_rooms
       WHERE guild_id=?
       ORDER BY last_active_at DESC
       LIMIT 50`,
      [guildId]
    );

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

      <div class="admin-section" style="display:flex;flex-wrap:wrap;gap:8px;">
        ${visibleTabs.map((tab) => `
          <a class="btn" style="padding:8px 12px;${activeModule === tab.key ? "opacity:1;font-weight:700;border-bottom:2px solid #7bc96f;" : "opacity:0.8;"}" href="/guild/${guildId}?module=${tab.key}">${escapeHtml(tab.label)}</a>
        `).join("")}
      </div>

      ${activeModule === "overview" ? `
      <div class="admin-section">
      <h3>Quick Overview</h3>
      <div class="stats-grid">
        <div class="stat-card">
          <span class="stat-value">${trackedXpUsers}</span>
          <span class="stat-label">Members Tracked by XP</span>
        </div>
        <div class="stat-card">
          <span class="stat-value">${warningRows.length}</span>
          <span class="stat-label">Warnings Stored</span>
        </div>
        <div class="stat-card">
          <span class="stat-value">${privateRooms.length}</span>
          <span class="stat-label">Private VC Rooms</span>
        </div>
        <div class="stat-card">
          <span class="stat-value">${claimLocked ? "🔒" : "🔓"}</span>
          <span class="stat-label">Claim-All ${claimLocked ? "Locked" : "Unlocked"}</span>
        </div>
      </div>
      <p style="margin-top: 16px; opacity: 0.8;">
        <strong>Mod Role:</strong> ${settings.mod_role_id ? `@${escapeHtml(guild.roles.cache.get(settings.mod_role_id)?.name || "Unknown role")}` : "<span style='opacity:0.7;'>Not configured</span>"}
      </p>
      </div>

      <h3>⭐ Starboard</h3>
      <p class="section-description">Highlight popular messages by reacting with stars</p>
      <form method="post" action="/guild/${guildId}/starboard-settings">
        <label style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
          <input type="checkbox" name="enabled" ${starboardSettings?.enabled ? "checked" : ""} />
          <span style="font-weight:600;">Enable Starboard</span>
        </label>
        
        <div class="form-row">
          <label>
            <span>Starboard Channel</span>
            <select name="channel_id">
              <option value="">None</option>
              ${textChannels.map((c) => `<option value="${c.id}" ${starboardSettings?.channel_id === c.id ? "selected" : ""}>#${escapeHtml(c.name)}</option>`).join("")}
            </select>
          </label>
          <label>
            <span>Star Emoji</span>
            <input name="emoji" value="${escapeHtml(starboardSettings?.emoji || "⭐")}" style="max-width:120px;" placeholder="⭐" />
          </label>
          <label>
            <span>Star Threshold</span>
            <input type="number" name="threshold" value="${starboardSettings?.threshold || 5}" min="1" max="50" style="max-width:120px;" />
          </label>
        </div>
        <label style="display:flex;align-items:center;gap:8px;margin-top:10px;">
          <input type="checkbox" name="self_star" ${starboardSettings?.self_star ? "checked" : ""} />
          <span>Allow users to star their own messages</span>
        </label>
        
        <button type="submit">Save Starboard Settings</button>
      </form>

      <h3 style="margin-top:20px;">Backup & Restore</h3>
      <p class="section-description">Export this guild's bot configuration to JSON, or import a previously exported backup.</p>
      <form method="get" action="/guild/${guildId}/config/export">
        <button type="submit">Download Config Backup</button>
      </form>
      <form method="post" action="/guild/${guildId}/config/import" style="margin-top:8px;">
        <label style="display:block;">
          <span>Backup JSON</span>
          <textarea name="backup_json" rows="10" style="width:100%;max-width:100%;font-family:monospace;" placeholder="Paste exported JSON here" required></textarea>
        </label>
        <label style="display:flex;align-items:center;gap:8px;margin-top:8px;">
          <input type="checkbox" name="confirm_replace" required />
          <span>I understand this will replace current configuration for this guild.</span>
        </label>
        <button type="submit" onclick="return confirm('Replace this guild\'s current config with imported backup?')">Import Config Backup</button>
      </form>
      ` : ""}

      ${activeModule === "moderation" ? `

      <h3>Moderation Settings</h3>
      <div style="padding:10px;border:1px solid rgba(123,201,111,0.35);border-radius:8px;max-width:620px;margin-bottom:12px;">
        <div style="font-weight:600;margin-bottom:6px;">Anti-Nuke Status</div>
        <div style="font-size:0.95em;line-height:1.5;">
          <div><b>Protection:</b> ${settings.anti_nuke_enabled ? "Enabled" : "Paused"}</div>
          <div><b>Pending Auto-Unlocks:</b> ${pendingAntiNukeJobRows.length}</div>
          <div><b>Next Auto-Unlock ETA:</b> ${pendingAntiNukeJobRows.length > 0 ? escapeHtml(pendingAntiNukeJobRows[0].eta) : "-"}</div>
          <div><b>Alert Destination:</b> ${settings.anti_nuke_alert_channel_id ? escapeHtml(`#${(textChannels.find((c) => c.id === settings.anti_nuke_alert_channel_id)?.name || settings.anti_nuke_alert_channel_id)}`) : "Log Channel"}</div>
          <div><b>Alert Ping Role:</b> ${settings.anti_nuke_alert_role_id ? escapeHtml(`@${(roleOptions.find((r) => r.id === settings.anti_nuke_alert_role_id)?.name || settings.anti_nuke_alert_role_id)}`) : "None"}</div>
        </div>
      </div>
      <form method="post" action="/guild/${guildId}/mod-settings">
        <label>Mod Role
          <select name="mod_role_id">
            <option value="" ${!settings.mod_role_id ? "selected" : ""}>None</option>
            ${roleOptions.map((r) => `
              <option value="${r.id}" ${settings.mod_role_id === r.id ? "selected" : ""}>@${escapeHtml(r.name)}</option>
            `).join("")}
          </select>
        </label>
        <br/><br/>
        <label>Moderation Command Prefix <span style="font-size:0.85em;opacity:0.8;">(Other commands use !)</span>
          <input name="command_prefix" value="${escapeHtml(settings.command_prefix || "!")}" style="max-width:80px;" />
        </label>
        <br/><br/>
        <label>New Account Warning Threshold (days)
          <input name="new_account_warn_days" value="${escapeHtml(settings.new_account_warn_days || 1)}" style="max-width:120px;" />
        </label>
        <br/><br/>
        <label style="display:flex;align-items:center;gap:8px;">
          <input type="checkbox" name="anti_nuke_enabled" ${settings.anti_nuke_enabled ? "checked" : ""} />
          <span>Enable Anti-Nuke Protection</span>
        </label>
        <br/><br/>
        <label>Auto-Unlock After (minutes, 0 = disabled)
          <input name="anti_nuke_auto_unlock_minutes" value="${escapeHtml(settings.anti_nuke_auto_unlock_minutes || 0)}" style="max-width:140px;" />
        </label>
        <br/><br/>
        <label>Anti-Nuke Window (seconds)
          <input name="anti_nuke_window_seconds" value="${escapeHtml(settings.anti_nuke_window_seconds || 30)}" style="max-width:120px;" />
        </label>
        <br/><br/>
        <label>Anti-Nuke Cooldown (minutes)
          <input name="anti_nuke_cooldown_minutes" value="${escapeHtml(settings.anti_nuke_cooldown_minutes || 10)}" style="max-width:120px;" />
        </label>
        <br/><br/>
        <label>Channel Delete Trigger Count (0 = disabled)
          <input name="anti_nuke_channel_delete_threshold" value="${escapeHtml(settings.anti_nuke_channel_delete_threshold ?? 3)}" style="max-width:120px;" />
        </label>
        <br/><br/>
        <label>Role Delete Trigger Count (0 = disabled)
          <input name="anti_nuke_role_delete_threshold" value="${escapeHtml(settings.anti_nuke_role_delete_threshold ?? 3)}" style="max-width:120px;" />
        </label>
        <br/><br/>
        <label>Ban Add Trigger Count (0 = disabled)
          <input name="anti_nuke_ban_add_threshold" value="${escapeHtml(settings.anti_nuke_ban_add_threshold ?? 4)}" style="max-width:120px;" />
        </label>
        <br/><br/>
        <label>Anti-Nuke Alert Channel Override
          <select name="anti_nuke_alert_channel_id">
            <option value="" ${!settings.anti_nuke_alert_channel_id ? "selected" : ""}>Use Log Channel</option>
            ${textChannels.map((c) => `<option value="${c.id}" ${settings.anti_nuke_alert_channel_id === c.id ? "selected" : ""}>#${escapeHtml(c.name)}</option>`).join("")}
          </select>
        </label>
        <br/><br/>
        <label>Anti-Nuke Alert Ping Role
          <select name="anti_nuke_alert_role_id">
            <option value="" ${!settings.anti_nuke_alert_role_id ? "selected" : ""}>None</option>
            ${roleOptions.map((r) => `
              <option value="${r.id}" ${settings.anti_nuke_alert_role_id === r.id ? "selected" : ""}>@${escapeHtml(r.name)}</option>
            `).join("")}
          </select>
        </label>
        <br/><br/>
        <div style="padding:10px;border:1px solid rgba(123,201,111,0.35);border-radius:8px;max-width:480px;">
          <div style="font-weight:600;margin-bottom:8px;">Anti-Nuke Lockdown Permissions</div>
          <label style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
            <input type="checkbox" name="anti_nuke_lock_manage_channels" ${settings.anti_nuke_lock_manage_channels ? "checked" : ""} />
            <span>Disable Manage Channels for @everyone</span>
          </label>
          <label style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
            <input type="checkbox" name="anti_nuke_lock_manage_roles" ${settings.anti_nuke_lock_manage_roles ? "checked" : ""} />
            <span>Disable Manage Roles for @everyone</span>
          </label>
          <label style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
            <input type="checkbox" name="anti_nuke_lock_ban_members" ${settings.anti_nuke_lock_ban_members ? "checked" : ""} />
            <span>Disable Ban Members for @everyone</span>
          </label>
          <label style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
            <input type="checkbox" name="anti_nuke_lock_kick_members" ${settings.anti_nuke_lock_kick_members ? "checked" : ""} />
            <span>Disable Kick Members for @everyone</span>
          </label>
          <label style="display:flex;align-items:center;gap:8px;">
            <input type="checkbox" name="anti_nuke_lock_manage_webhooks" ${settings.anti_nuke_lock_manage_webhooks ? "checked" : ""} />
            <span>Disable Manage Webhooks for @everyone</span>
          </label>
        </div>
        <br/><br/>
        <label>Log Channel
          <select name="log_channel_id">
            <option value="" ${!settings.log_channel_id ? "selected" : ""}>None</option>
            ${textChannels.map((c) => `<option value="${c.id}" ${settings.log_channel_id === c.id ? "selected" : ""}>#${escapeHtml(c.name)}</option>`).join("")}
          </select>
        </label>
        <br/><br/>
        <label style="display:flex;align-items:center;gap:8px;">
          <input type="checkbox" name="log_summary_cards_enabled" ${settings.log_summary_cards_enabled ? "checked" : ""} />
          <span>Enable log summary cards (Times New Roman image style)</span>
        </label>
        <label style="display:flex;align-items:center;gap:8px;">
          <input type="checkbox" name="log_quick_mod_actions_enabled" ${settings.log_quick_mod_actions_enabled ? "checked" : ""} />
          <span>Enable quick moderation buttons in logs</span>
        </label>
        <br/><br/>
        <button type="submit">Save Moderation Settings</button>
      </form>

      <form method="post" action="/guild/${guildId}/anti-nuke/unlock" style="margin-top:8px;" onsubmit="return confirm('Restore anti-nuke locked permissions for @everyone across channels?')">
        <button type="submit" style="background:#f0ad4e;">Emergency Unlock Anti-Nuke Lockdown</button>
      </form>

      <h3 style="margin-top:18px;">Anti-Nuke Exemptions (Trusted Actors)</h3>
      <p class="section-description">Exempt trusted users/roles from anti-nuke trigger counting.</p>
      ${antiNukeExemptionRows.length > 0 ? `
      <form method="get" action="/guild/${guildId}/anti-nuke-exemptions/export" style="margin-bottom:8px;display:inline-block;margin-right:8px;">
        <button type="submit">Export Anti-Nuke Exemptions (JSON)</button>
      </form>
      <form method="get" action="/guild/${guildId}/anti-nuke-exemptions/export.csv" style="margin-bottom:8px;display:inline-block;">
        <button type="submit">Export Anti-Nuke Exemptions (CSV)</button>
      </form>
      ` : ""}
      <form method="post" action="/guild/${guildId}/anti-nuke-exemptions/add">
        <label>User ID <input name="user_id" /></label>
        <label>Role
          <select name="role_id">
            <option value="">None</option>
            ${roleOptions.map((r) => `<option value="${r.id}">@${escapeHtml(r.name)}</option>`).join("")}
          </select>
        </label>
        <button type="submit">Add Anti-Nuke Exemption</button>
      </form>
      <ul>
        ${antiNukeExemptionRows.map((entry) => `
          <li>
            ${escapeHtml(entry.targetType)} -> ${escapeHtml(entry.label)} (added ${escapeHtml(entry.createdAt)})
            <form style="display:inline" method="post" action="/guild/${guildId}/anti-nuke-exemptions/delete">
              <input type="hidden" name="target_id" value="${escapeHtml(entry.targetId)}" />
              <button type="submit">Delete</button>
            </form>
          </li>
        `).join("") || `<li>No anti-nuke exemptions configured.</li>`}
      </ul>

      <h3 style="margin-top:18px;">Pending Anti-Nuke Auto-Unlocks</h3>
      <p class="section-description">Scheduled automatic unlock jobs waiting to run.</p>
      ${pendingAntiNukeJobRows.length > 0 ? `
      <form method="get" action="/guild/${guildId}/anti-nuke/unlock-jobs/export" style="margin-bottom:8px;display:inline-block;margin-right:8px;">
        <button type="submit">Export Pending Auto-Unlock Jobs (JSON)</button>
      </form>
      <form method="get" action="/guild/${guildId}/anti-nuke/unlock-jobs/export.csv" style="margin-bottom:8px;display:inline-block;">
        <button type="submit">Export Pending Auto-Unlock Jobs (CSV)</button>
      </form>
      ` : ""}
      ${pendingAntiNukeJobRows.length > 0 && canAccessAdminFeatures ? `
      <form method="post" action="/guild/${guildId}/anti-nuke/unlock-jobs/cancel-all" style="margin-bottom:8px;" onsubmit="return confirm('Cancel all pending anti-nuke auto-unlock jobs?')">
        <button type="submit" style="background:#d9534f;">Cancel All Pending Auto-Unlock Jobs</button>
      </form>
      ` : ""}
      ${pendingAntiNukeJobRows.length > 0 ? `
      <table class="enhanced-table">
        <tr><th>Job ID</th><th>ETA</th><th>Run At</th><th>Created</th><th>Permissions</th><th>Actions</th></tr>
        ${pendingAntiNukeJobRows.map((j) => `
          <tr>
            <td>${escapeHtml(String(j.id))}</td>
            <td>${escapeHtml(j.eta)}</td>
            <td>${escapeHtml(j.runAt)}</td>
            <td>${escapeHtml(j.createdAt)}</td>
            <td>${escapeHtml(j.permissions)}</td>
            <td>
              ${canAccessAdminFeatures ? `
              <form method="post" action="/guild/${guildId}/anti-nuke/unlock-jobs/cancel" style="display:inline;" onsubmit="return confirm('Cancel this pending auto-unlock job?')">
                <input type="hidden" name="job_id" value="${escapeHtml(String(j.id))}" />
                <button type="submit" style="background:#d9534f;">Cancel</button>
              </form>
              ` : "-"}
            </td>
          </tr>
        `).join("")}
      </table>
      ` : `<div class="empty-state">No pending auto-unlock jobs</div>`}

      <h3 style="margin-top:18px;">Anti-Nuke Incidents</h3>
      <p class="section-description">Recent anti-nuke triggers and manual unlock actions.</p>
      <form method="get" action="/guild/${guildId}" style="margin-bottom:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <input type="hidden" name="module" value="moderation" />
        <label>Type
          <select name="anti_nuke_type">
            <option value="all" ${antiNukeTypeFilter === "all" ? "selected" : ""}>All</option>
            <option value="trigger" ${antiNukeTypeFilter === "trigger" ? "selected" : ""}>trigger</option>
            <option value="manual_unlock" ${antiNukeTypeFilter === "manual_unlock" ? "selected" : ""}>manual_unlock</option>
            <option value="auto_unlock" ${antiNukeTypeFilter === "auto_unlock" ? "selected" : ""}>auto_unlock</option>
            <option value="history_cleared" ${antiNukeTypeFilter === "history_cleared" ? "selected" : ""}>history_cleared</option>
            <option value="auto_unlock_canceled" ${antiNukeTypeFilter === "auto_unlock_canceled" ? "selected" : ""}>auto_unlock_canceled</option>
            <option value="exemption_added" ${antiNukeTypeFilter === "exemption_added" ? "selected" : ""}>exemption_added</option>
            <option value="exemption_removed" ${antiNukeTypeFilter === "exemption_removed" ? "selected" : ""}>exemption_removed</option>
          </select>
        </label>
        <label>Search
          <input name="anti_nuke_search" value="${escapeHtml(antiNukeSearch)}" placeholder="actor id, details, event" style="min-width:220px;" />
        </label>
        <button type="submit">Apply</button>
        <a class="btn" href="/guild/${guildId}?module=moderation">Reset</a>
      </form>
      <form method="get" action="/guild/${guildId}/anti-nuke/incidents/export" style="margin-bottom:8px;">
        <input type="hidden" name="incident_type" value="${escapeHtml(antiNukeTypeFilter)}" />
        <input type="hidden" name="search" value="${escapeHtml(antiNukeSearch)}" />
        <button type="submit">Export Anti-Nuke Incidents (JSON)</button>
      </form>
      <form method="get" action="/guild/${guildId}/anti-nuke/incidents/export.csv" style="margin-bottom:8px;">
        <input type="hidden" name="incident_type" value="${escapeHtml(antiNukeTypeFilter)}" />
        <input type="hidden" name="search" value="${escapeHtml(antiNukeSearch)}" />
        <button type="submit">Export Anti-Nuke Incidents (CSV)</button>
      </form>
      <form method="post" action="/guild/${guildId}/anti-nuke/incidents/clear" style="margin-bottom:8px;" onsubmit="return confirm('Clear all anti-nuke incident history for this guild?')">
        <button type="submit" style="background:#d9534f;">Clear Anti-Nuke Incident History</button>
      </form>
      ${antiNukeRows.length > 0 ? `
      <table class="enhanced-table">
        <tr><th>Type</th><th>Event</th><th>Actor</th><th>Initiated By</th><th>Details</th><th>Date</th></tr>
        ${antiNukeRows.map((r) => `
          <tr>
            <td>${escapeHtml(r.incidentType)}</td>
            <td>${escapeHtml(r.eventType)}</td>
            <td>${escapeHtml(r.actorName)}</td>
            <td>${escapeHtml(r.initiatorName)}</td>
            <td>${escapeHtml(r.detailsText)}</td>
            <td>${escapeHtml(r.createdAt)}</td>
          </tr>
        `).join("")}
      </table>
      <div style="display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap;">
        <span>Page ${antiNukePage} of ${antiNukeTotalPages} (${antiNukeTotal} total)</span>
        ${antiNukeHasPrevPage ? `<a class="btn" href="/guild/${guildId}?${antiNukeBaseQuery}&anti_nuke_page=${antiNukePage - 1}">Previous</a>` : ""}
        ${antiNukeHasNextPage ? `<a class="btn" href="/guild/${guildId}?${antiNukeBaseQuery}&anti_nuke_page=${antiNukePage + 1}">Next</a>` : ""}
      </div>
      ` : `<div class="empty-state">No anti-nuke incidents logged yet</div>`}

      <h3>Warnings</h3>
      <p class="section-description">View and manage user warnings issued by moderators</p>
      ${warningRows.length > 0 ? `
      <table class="enhanced-table">
        <tr><th>Target</th><th>Moderator</th><th>Reason</th><th>Date</th><th>Actions</th></tr>
        ${warningRows.map((w) => `
          <tr>
            <td>${escapeHtml(w.targetName)}</td>
            <td>${escapeHtml(w.moderatorName)}</td>
            <td>${escapeHtml(w.reason)}</td>
            <td>${escapeHtml(w.createdAt)}</td>
            <td>
              <form method="post" action="/guild/${guildId}/warnings/delete" style="display:inline;">
                <input type="hidden" name="warning_id" value="${w.id}" />
                <button type="submit">Delete</button>
              </form>
              <form method="post" action="/guild/${guildId}/warnings/clear-user" style="display:inline;">
                <input type="hidden" name="user_id" value="${escapeHtml(w.userId)}" />
                <button type="submit">Clear User</button>
              </form>
            </td>
          </tr>
        `).join("")}
      </table>
      ` : `<div class="empty-state">No warnings issued yet</div>`}

      <h3>🤖 Auto-Moderation</h3>
      <p class="section-description">Automatically moderate spam, links, and unwanted content</p>
      <form method="post" action="/guild/${guildId}/automod-settings">
        <label style="display:flex;align-items:center;gap:8px;">
          <input type="checkbox" name="spam_enabled" ${automodSettings?.spam_enabled ? "checked" : ""} />
          <span>Block Spam (repeated messages)</span>
        </label>
        <label style="margin-left:24px;">Messages in 10s:
          <input type="number" name="spam_threshold" value="${automodSettings?.spam_messages || 5}" min="2" max="20" style="width:80px;" />
        </label>
        <label style="margin-left:24px;">Action:
          <select name="spam_action" style="width:120px;">
            <option value="delete" ${automodSettings?.spam_action === "delete" ? "selected" : ""}>Delete</option>
            <option value="warn" ${automodSettings?.spam_action === "warn" ? "selected" : ""}>Warn</option>
            <option value="timeout" ${automodSettings?.spam_action === "timeout" ? "selected" : ""}>Timeout 10m</option>
          </select>
        </label>
        <br/><br/>

        <label style="display:flex;align-items:center;gap:8px;">
          <input type="checkbox" name="invites_enabled" ${automodSettings?.invites_enabled ? "checked" : ""} />
          <span>Block Discord Invite Links</span>
        </label>
        <label style="margin-left:24px;">Allowed invite codes (comma-separated)
          <input name="invites_whitelist" value="${escapeHtml(automodSettings?.invites_whitelist || "")}" style="width:320px;" placeholder="mycode, partnercode" />
        </label>
        <label style="margin-left:24px;">Action:
          <select name="invites_action" style="width:120px;">
            <option value="delete" ${automodSettings?.invites_action === "delete" ? "selected" : ""}>Delete</option>
            <option value="warn" ${automodSettings?.invites_action === "warn" ? "selected" : ""}>Warn</option>
            <option value="timeout" ${automodSettings?.invites_action === "timeout" ? "selected" : ""}>Timeout 10m</option>
          </select>
        </label>
        <br/>

        <label style="display:flex;align-items:center;gap:8px;">
          <input type="checkbox" name="links_enabled" ${automodSettings?.links_enabled ? "checked" : ""} />
          <span>Block External Links</span>
        </label>
        <label style="margin-left:24px;">Allowed domains (comma-separated)
          <input name="links_whitelist" value="${escapeHtml(automodSettings?.links_whitelist || "")}" style="width:320px;" placeholder="example.com, docs.example.com" />
        </label>
        <label style="margin-left:24px;">Action:
          <select name="links_action" style="width:120px;">
            <option value="delete" ${automodSettings?.links_action === "delete" ? "selected" : ""}>Delete</option>
            <option value="warn" ${automodSettings?.links_action === "warn" ? "selected" : ""}>Warn</option>
            <option value="timeout" ${automodSettings?.links_action === "timeout" ? "selected" : ""}>Timeout 10m</option>
          </select>
        </label>
        <br/>

        <label style="display:flex;align-items:center;gap:8px;">
          <input type="checkbox" name="caps_enabled" ${automodSettings?.caps_enabled ? "checked" : ""} />
          <span>Block Excessive Caps</span>
        </label>
        <label style="margin-left:24px;">Caps % threshold:
          <input type="number" name="caps_threshold" value="${automodSettings?.caps_percentage || 70}" min="50" max="100" style="width:80px;" />
        </label>
        <label style="margin-left:24px;">Action:
          <select name="caps_action" style="width:120px;">
            <option value="delete" ${automodSettings?.caps_action === "delete" ? "selected" : ""}>Delete</option>
            <option value="warn" ${automodSettings?.caps_action === "warn" ? "selected" : ""}>Warn</option>
            <option value="timeout" ${automodSettings?.caps_action === "timeout" ? "selected" : ""}>Timeout 10m</option>
          </select>
        </label>
        <br/><br/>

        <label style="display:flex;align-items:center;gap:8px;">
          <input type="checkbox" name="mentions_enabled" ${automodSettings?.mentions_enabled ? "checked" : ""} />
          <span>Block Excessive Mentions</span>
        </label>
        <label style="margin-left:24px;">Max mentions:
          <input type="number" name="mentions_threshold" value="${automodSettings?.mentions_max || 5}" min="2" max="20" style="width:80px;" />
        </label>
        <label style="margin-left:24px;">Action:
          <select name="mentions_action" style="width:120px;">
            <option value="delete" ${automodSettings?.mentions_action === "delete" ? "selected" : ""}>Delete</option>
            <option value="warn" ${automodSettings?.mentions_action === "warn" ? "selected" : ""}>Warn</option>
            <option value="timeout" ${automodSettings?.mentions_action === "timeout" ? "selected" : ""}>Timeout 10m</option>
          </select>
        </label>
        <br/><br/>

        <label style="display:flex;align-items:center;gap:8px;">
          <input type="checkbox" name="attachments_enabled" ${automodSettings?.attach_spam_enabled ? "checked" : ""} />
          <span>Limit Attachments</span>
        </label>
        <label style="margin-left:24px;">Max attachments per message:
          <input type="number" name="attachments_max" value="${automodSettings?.attach_spam_max || 1}" min="1" max="10" style="width:80px;" />
        </label>
        <label style="margin-left:24px;">Action:
          <select name="attachments_action" style="width:120px;">
            <option value="delete" ${automodSettings?.attach_spam_action === "delete" ? "selected" : ""}>Delete</option>
            <option value="warn" ${automodSettings?.attach_spam_action === "warn" ? "selected" : ""}>Warn</option>
            <option value="timeout" ${automodSettings?.attach_spam_action === "timeout" ? "selected" : ""}>Timeout 10m</option>
          </select>
        </label>
        <br/><br/>

        <button type="submit">Save Auto-Mod Settings</button>
      </form>

      <h3>💡 Suggestions System</h3>
      <p class="section-description">Let members submit and vote on suggestions for your server</p>
      <form method="post" action="/guild/${guildId}/suggestions-settings">
        <label style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
          <input type="checkbox" name="suggestions_enabled" ${suggestionSettings?.enabled ? "checked" : ""} />
          <span style="font-weight:600;">Enable Suggestions</span>
        </label>
        
        <div class="form-row">
          <label>
            <span>Suggestions Channel</span>
            <select name="channel_id">
              <option value="">None</option>
              ${textChannels.map((c) => `<option value="${c.id}" ${suggestionSettings?.channel_id === c.id ? "selected" : ""}>#${escapeHtml(c.name)}</option>`).join("")}
            </select>
          </label>
          <label>
            <span>Review Channel (optional)</span>
            <select name="review_channel_id">
              <option value="">None</option>
              ${textChannels.map((c) => `<option value="${c.id}" ${suggestionSettings?.review_channel_id === c.id ? "selected" : ""}>#${escapeHtml(c.name)}</option>`).join("")}
            </select>
          </label>
          <label style="display:flex;align-items:center;gap:8px;">
            <input type="checkbox" name="require_review" ${suggestionSettings?.require_review ? "checked" : ""} />
            <span>Require staff review before publishing</span>
          </label>
          <button type="submit">Save Suggestions Settings</button>
        </div>
      </form>

      ${allSuggestions.length > 0 ? `
      <h4 style="margin-top:24px;">Recent Suggestions</h4>
      <table class="enhanced-table">
        <tr><th>ID</th><th>User</th><th>Suggestion</th><th>Votes</th><th>Status</th><th>Staff Note</th><th>Actions</th></tr>
        ${allSuggestions.slice(0, 10).map((s) => `
          <tr>
            <td>#${s.id}</td>
            <td>${escapeHtml(s.user_id)}</td>
            <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(s.content)}</td>
            <td>👍 ${s.upvotes || 0} | 👎 ${s.downvotes || 0}</td>
            <td>${s.status === "approved" ? "✅" : s.status === "denied" ? "❌" : s.status === "under_review" ? "🕵️" : "🟡"} ${escapeHtml(s.status)}</td>
            <td style="max-width:240px;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(s.staff_response || "-")}</td>
            <td>
              <form method="post" action="/guild/${guildId}/suggestions/update" style="display:inline;">
                <input type="hidden" name="suggestion_id" value="${s.id}" />
                <select name="status" style="padding:2px;">
                  <option value="pending" ${s.status === "pending" ? "selected" : ""}>Pending</option>
                  <option value="under_review" ${s.status === "under_review" ? "selected" : ""}>Under Review</option>
                  <option value="approved" ${s.status === "approved" ? "selected" : ""}>Approved</option>
                  <option value="denied" ${s.status === "denied" ? "selected" : ""}>Denied</option>
                </select>
                <input name="staff_response" value="${escapeHtml(s.staff_response || "")}" placeholder="Optional staff note" style="width:180px;" />
                <button type="submit">Update</button>
              </form>
            </td>
          </tr>
        `).join("")}
      </table>
      ` : ""}
      ` : ""}

      ${activeModule === "welcome" ? `

      <h3>🎉 Welcome Messages</h3>
      <p class="section-description">Greet new members with a custom message when they join your server</p>
      <form method="post" action="/guild/${guildId}/welcome-settings">
        <label style="display:flex;align-items:center;gap:8px;">
          <input type="checkbox" name="welcome_enabled" ${welcomeSettings?.welcome_enabled ? "checked" : ""} />
          <span>Enable Welcome Messages</span>
        </label>
        <br/>
        <label>Welcome Channel
          <select name="welcome_channel_id">
            <option value="">None</option>
            ${textChannels.map((c) => `<option value="${c.id}" ${welcomeSettings?.welcome_channel_id === c.id ? "selected" : ""}>#${escapeHtml(c.name)}</option>`).join("")}
          </select>
        </label>
        <br/><br/>
        <label>Welcome Message <span style="font-size:0.85em;opacity:0.8;">(Use {user}, {server}, {count} as placeholders)</span>
          <textarea name="welcome_message" rows="3" style="width:100%;max-width:600px;font-family:inherit;">${escapeHtml(welcomeSettings?.welcome_message || "Welcome {user} to {server}!")}</textarea>
        </label>
        <br/>
        <label style="display:flex;align-items:center;gap:8px;">
          <input type="checkbox" name="welcome_embed" ${welcomeSettings?.welcome_embed !== 0 ? "checked" : ""} />
          <span>Send as Embed</span>
        </label>
        <br/>
        <label>Embed Color
          <input type="color" name="welcome_embed_color" value="${welcomeSettings?.welcome_embed_color || "#7bc96f"}" style="height:32px;" />
        </label>
        <br/><br/>
        <button type="submit">Save Welcome Settings</button>
      </form>

      <h3>👋 Goodbye Messages</h3>
      <p class="section-description">Send a message when members leave your server</p>
      <form method="post" action="/guild/${guildId}/goodbye-settings">
        <label style="display:flex;align-items:center;gap:8px;">
          <input type="checkbox" name="goodbye_enabled" ${welcomeSettings?.goodbye_enabled ? "checked" : ""} />
          <span>Enable Goodbye Messages</span>
        </label>
        <br/>
        <label>Goodbye Channel
          <select name="goodbye_channel_id">
            <option value="">None</option>
            ${textChannels.map((c) => `<option value="${c.id}" ${welcomeSettings?.goodbye_channel_id === c.id ? "selected" : ""}>#${escapeHtml(c.name)}</option>`).join("")}
          </select>
        </label>
        <br/><br/>
        <label>Goodbye Message <span style="font-size:0.85em;opacity:0.8;">(Use {user}, {server}, {count} as placeholders)</span>
          <textarea name="goodbye_message" rows="3" style="width:100%;max-width:600px;font-family:inherit;">${escapeHtml(welcomeSettings?.goodbye_message || "Goodbye {user}!")}</textarea>
        </label>
        <br/>
        <label style="display:flex;align-items:center;gap:8px;">
          <input type="checkbox" name="goodbye_embed" ${welcomeSettings?.goodbye_embed !== 0 ? "checked" : ""} />
          <span>Send as Embed</span>
        </label>
        <br/>
        <label>Embed Color
          <input type="color" name="goodbye_embed_color" value="${welcomeSettings?.goodbye_embed_color || "#8b7355"}" style="height:32px;" />
        </label>
        <br/><br/>
        <button type="submit">Save Goodbye Settings</button>
      </form>

      <h3>🎭 Auto-Roles</h3>
      <p class="section-description">Roles automatically given to new members when they join</p>
      
      <form method="post" action="/guild/${guildId}/auto-roles/add">
        <div class="form-row">
          <label>
            <span>Add Auto-Role</span>
            <select name="role_id" required>
              <option value="">Select a role...</option>
              ${roleOptions.map((r) => `<option value="${r.id}">@${escapeHtml(r.name)}</option>`).join("")}
            </select>
          </label>
          <button type="submit">Add Role</button>
        </div>
      </form>
      <br/>
      
      ${autoRoles.length > 0 ? `
      <table class="enhanced-table">
        <tr><th>Role</th><th>Actions</th></tr>
        ${autoRoles.map((ar) => {
          const role = roleOptions.find(r => r.id === ar.role_id);
          return `
          <tr>
            <td>@${escapeHtml(role?.name || ar.role_id)}</td>
            <td>
              <form method="post" action="/guild/${guildId}/auto-roles/delete" style="display:inline;">
                <input type="hidden" name="role_id" value="${ar.role_id}" />
                <button type="submit">Remove</button>
              </form>
            </td>
          </tr>
          `;
        }).join("")}
      </table>
      ` : `<div class="empty-state">No auto-roles configured</div>`}
      ` : ""}

      ${activeModule === "logging" ? `

      <h3>Event Logging Controls</h3>
      <form method="post" action="/guild/${guildId}/logging-events">
        <table>
          <tr><th>Event</th><th>Enabled</th><th>Channel Override</th></tr>
          ${LOG_EVENT_DEFS.map((def) => {
            const cfg = eventConfigMap.get(def.key);
            const enabled = cfg ? Number(cfg.enabled) === 1 : true;
            const channelId = cfg?.channel_id || "";
            return `
              <tr>
                <td>${escapeHtml(def.label)}</td>
                <td class="event-toggle-cell"><input class="event-toggle" type="checkbox" name="enabled_${def.key}" ${enabled ? "checked" : ""} /></td>
                <td>
                  <select name="channel_${def.key}">
                    <option value="">Default log channel</option>
                    ${textChannels.map((c) => `<option value="${c.id}" ${channelId === c.id ? "selected" : ""}>#${escapeHtml(c.name)}</option>`).join("")}
                  </select>
                </td>
              </tr>
            `;
          }).join("")}
        </table>
        <button type="submit">Save Event Logging Controls</button>
      </form>

      <h3>Actor Exclusions (Users/Roles)</h3>
      <form method="post" action="/guild/${guildId}/logging-actors/add">
        <label>User ID <input name="user_id" /></label>
        <label>Role
          <select name="role_id">
            <option value="">None</option>
            ${roleOptions.map((r) => `<option value="${r.id}">@${escapeHtml(r.name)}</option>`).join("")}
          </select>
        </label>
        <button type="submit">Add Actor Exclusion</button>
      </form>

      <ul>
        ${actorExclusions.map((entry) => {
          const role = roleOptions.find((r) => r.id === entry.target_id);
          const label = entry.target_type === "role"
            ? `@${role?.name || entry.target_id}`
            : entry.target_id;
          return `
            <li>
              ${escapeHtml(entry.target_type)} → ${escapeHtml(label)}
              <form style="display:inline" method="post" action="/guild/${guildId}/logging-actors/delete">
                <input type="hidden" name="target_id" value="${escapeHtml(entry.target_id)}" />
                <button type="submit">Delete</button>
              </form>
            </li>
          `;
        }).join("")}
      </ul>

      <h3>Logging Exclusions</h3>
      <form method="post" action="/guild/${guildId}/logging-exclusions/add">
        <label>Channel
          <select name="channel_id">
            <option value="">None</option>
            ${textChannels.map((c) => `<option value="${c.id}">#${escapeHtml(c.name)}</option>`).join("")}
            ${voiceChannels.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("")}
          </select>
        </label>
        <label>Category
          <select name="category_id">
            <option value="">None</option>
            ${categories.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("")}
          </select>
        </label>
        <button type="submit">Add Exclusion</button>
      </form>
      <p style="margin-top:6px;opacity:0.8;">The log channel is always auto-excluded.</p>

      <ul>
        ${loggingExclusions.map((entry) => {
          const label = entry.target_type === "category"
            ? (categories.find((c) => c.id === entry.target_id)?.name || entry.target_id)
            : (guild.channels.cache.get(entry.target_id)?.name || entry.target_id);
          return `
            <li>
              ${escapeHtml(entry.target_type)} → ${escapeHtml(label)}
              <form style="display:inline" method="post" action="/guild/${guildId}/logging-exclusions/delete">
                <input type="hidden" name="target_id" value="${escapeHtml(entry.target_id)}" />
                <button type="submit">Delete</button>
              </form>
            </li>
          `;
        }).join("")}
      </ul>
      ` : ""}

      ${activeModule === "socials" ? `

      <h3>Social Link Integrations</h3>
      <p class="section-description">Link creator socials with just @username or username. The bot will auto-resolve URLs/feeds where possible.</p>

      <form method="post" action="/guild/${guildId}/social-links/add">
        <div class="form-row">
          <label>
            <span>Platform</span>
            <select name="platform" required>
              ${SOCIAL_PLATFORM_OPTIONS.map((platform) => `<option value="${platform.key}">${escapeHtml(platform.label)}</option>`).join("")}
            </select>
          </label>
          <label>
            <span>Username / Channel Handle</span>
            <input name="external_id" required placeholder="e.g. @name or name" />
          </label>
          <label>
            <span>Source URL / RSS (advanced optional)</span>
            <input name="source_url" placeholder="Leave blank for auto" />
          </label>
          <label>
            <span>Display Label (optional)</span>
            <input name="label" placeholder="Creator name" />
          </label>
          <label>
            <span>Linked Channel (optional)</span>
            <select name="channel_id">
              <option value="">Use default social channel</option>
              ${textChannels.map((c) => `<option value="${c.id}">#${escapeHtml(c.name)}</option>`).join("")}
            </select>
          </label>
          <button type="submit">Link Social</button>
        </div>
      </form>

      <br/>
      <h4>Default Social Notifications Channel</h4>
      <form method="post" action="/guild/${guildId}/socials/default-channel">
        <div class="form-row">
          <label>
            <span>Default Channel</span>
            <select name="social_default_channel_id">
              <option value="" ${!settings.social_default_channel_id ? "selected" : ""}>None</option>
              ${textChannels.map((c) => `<option value="${c.id}" ${settings.social_default_channel_id === c.id ? "selected" : ""}>#${escapeHtml(c.name)}</option>`).join("")}
            </select>
          </label>
          <button type="submit">Save Default Channel</button>
        </div>
      </form>

      <br/>
      <h4>Linked Social Accounts</h4>
      ${socialLinks.length ? socialLinks.map((link) => {
        const label = link.label || link.external_id;
        const rules = socialRulesByLink.get(link.id) || [];
        const eventTypes = getSupportedEventsForPlatform(link.platform);
        const eventRuleMap = new Map(rules.map((rule) => [rule.event_type, rule]));
        const linkedChannelName = link.channel_id ? (guild.channels.cache.get(link.channel_id)?.name || link.channel_id) : null;

        return `
          <div class="admin-section" style="margin-bottom:14px;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
              <div>
                <strong>${escapeHtml(SOCIAL_PLATFORM_OPTIONS.find((platform) => platform.key === link.platform)?.label || link.platform)}</strong>
                • ${escapeHtml(label)}
                ${linkedChannelName ? `• <span style="opacity:0.8;">#${escapeHtml(linkedChannelName)}</span>` : ""}
                ${link.source_url ? `• <a href="${escapeHtml(link.source_url)}" target="_blank" rel="noopener noreferrer">Source</a>` : ""}
                <div style="opacity:0.7;font-size:0.9em;">Last checked: ${link.last_checked_at ? new Date(Number(link.last_checked_at)).toLocaleString() : "never"}</div>
              </div>
              <div style="display:flex;gap:8px;">
                <form method="post" action="/guild/${guildId}/social-links/toggle" style="display:inline;">
                  <input type="hidden" name="link_id" value="${link.id}" />
                  <input type="hidden" name="enabled" value="${Number(link.enabled) === 1 ? "0" : "1"}" />
                  <button type="submit">${Number(link.enabled) === 1 ? "Disable" : "Enable"}</button>
                </form>
                <form method="post" action="/guild/${guildId}/social-links/delete" style="display:inline;">
                  <input type="hidden" name="link_id" value="${link.id}" />
                  <button type="submit">Delete</button>
                </form>
              </div>
            </div>

            <div style="margin-top:10px;">
              ${eventTypes.map((eventType) => {
                const rule = eventRuleMap.get(eventType);
                const roleDefault = rule?.role_id || "";
                const channelDefault = rule?.channel_id || "";
                const templateDefault = rule?.message_template || "";
                return `
                  <form method="post" action="/guild/${guildId}/social-rules/save" style="margin:8px 0;padding:10px;border:1px solid rgba(255,255,255,0.08);border-radius:10px;">
                    <input type="hidden" name="link_id" value="${link.id}" />
                    <input type="hidden" name="event_type" value="${eventType}" />
                    <label style="display:flex;align-items:center;gap:8px;">
                      <input type="checkbox" name="enabled" ${rule && Number(rule.enabled) === 1 ? "checked" : ""} />
                      <span><strong>${escapeHtml(SOCIAL_EVENT_LABELS[eventType] || eventType)}</strong> notifications enabled</span>
                    </label>
                    <div class="form-row" style="margin-top:8px;">
                      <label>
                        <span>Channel Override</span>
                        <select name="channel_id">
                          <option value="" ${!channelDefault ? "selected" : ""}>Use linked/default channel</option>
                          ${textChannels.map((c) => `<option value="${c.id}" ${channelDefault === c.id ? "selected" : ""}>#${escapeHtml(c.name)}</option>`).join("")}
                        </select>
                      </label>
                      <label>
                        <span>Role Mention</span>
                        <select name="role_id">
                          <option value="" ${!roleDefault ? "selected" : ""}>No role mention</option>
                          ${roleOptions.map((role) => `<option value="${role.id}" ${roleDefault === role.id ? "selected" : ""}>@${escapeHtml(role.name)}</option>`).join("")}
                        </select>
                      </label>
                    </div>
                    <label style="display:block;margin-top:8px;">
                      <span>Message Template</span>
                      <textarea name="message_template" rows="3" style="width:100%;max-width:100%;font-family:inherit;">${escapeHtml(templateDefault)}</textarea>
                    </label>
                    <div style="opacity:0.75;font-size:0.9em;margin-top:4px;">Available placeholders: {role} {platform} {handle} {title} {url} {event}</div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
                      <button type="submit">Save ${escapeHtml(SOCIAL_EVENT_LABELS[eventType] || eventType)} Rule</button>
                    </div>
                  </form>
                  <form method="post" action="/guild/${guildId}/social-rules/test" style="margin-top:6px;">
                    <input type="hidden" name="link_id" value="${link.id}" />
                    <input type="hidden" name="event_type" value="${eventType}" />
                    <button type="submit">Send Test ${escapeHtml(SOCIAL_EVENT_LABELS[eventType] || eventType)} Notification</button>
                  </form>
                `;
              }).join("")}
            </div>
          </div>
        `;
      }).join("") : `<div class="empty-state">No socials linked yet.</div>`}

      <p style="opacity:0.8;margin-top:10px;">Tip: If auto-detection fails for a platform, paste an RSS/Atom URL in Source URL (advanced).</p>
      ` : ""}

      ${activeModule === "reactionroles" ? `
      <h3>Reaction Roles</h3>
      <p class="section-description">Add or remove roles when members react to specific messages</p>
      <form class="admin-grid-form" method="post" action="/guild/${guildId}/reaction-roles/add">
        <label>Channel
          <select name="channel_id">
            <option value="">Select channel</option>
            ${textChannels.map((c) => `<option value="${c.id}">#${escapeHtml(c.name)}</option>`).join("")}
          </select>
        </label>
        <label>Message ID
          <input name="message_id" placeholder="Message ID to react on" />
        </label>
        <label>Emoji
          <input name="emoji_key" placeholder="😀 or <:name:id>" />
        </label>
        <label>Role
          <select name="role_id">
            <option value="">Select role</option>
            ${roleOptions.map((r) => `<option value="${r.id}">@${escapeHtml(r.name)}</option>`).join("")}
          </select>
        </label>
        <label style="min-width:180px;flex:0 0 180px;">
          <span>Reaction Mode</span>
          <select name="mode">
            <option value="toggle">Add & Remove (Toggle)</option>
            <option value="add">Add Only</option>
            <option value="remove">Remove Only</option>
          </select>
        </label>
        <button type="submit">Save Reaction Role</button>
      </form>

      <ul>
        ${reactionRoleBindings.map((row) => {
          const channelName = guild.channels.cache.get(row.channel_id)?.name || row.channel_id;
          const roleName = guild.roles.cache.get(row.role_id)?.name || row.role_id;
          const modeLabel = row.mode === 'add' ? '(add only)' : row.mode === 'remove' ? '(remove only)' : '(toggle)';
          return `
            <li>
              #${escapeHtml(channelName)} • message ${escapeHtml(row.message_id)} • emoji ${escapeHtml(row.emoji_key)} → @${escapeHtml(roleName)} ${modeLabel}
              <form style="display:inline" method="post" action="/guild/${guildId}/reaction-roles/delete">
                <input type="hidden" name="message_id" value="${escapeHtml(row.message_id)}" />
                <input type="hidden" name="emoji_key" value="${escapeHtml(row.emoji_key)}" />
                <input type="hidden" name="role_id" value="${escapeHtml(row.role_id)}" />
                <button type="submit">Delete</button>
              </form>
            </li>
          `;
        }).join("") || '<li class="empty-state" style="list-style:none;">No reaction roles configured</li>'}
      </ul>

      <hr/>

      <h3>Reaction Role Questions</h3>
      <p style="opacity:0.8;margin-bottom:12px;">Create dropdown selection menus for users to choose roles. Each question can have up to 25 options.</p>
      
      <form method="post" action="/guild/${guildId}/reaction-questions/create" style="margin-bottom:16px;">
        <label>Question Text
          <input name="question_text" placeholder="Select your roles" style="min-width:300px;" required />
        </label>
        <button type="submit">Create New Question</button>
      </form>

      ${reactionRoleQuestions.length > 0 ? `
        <div style="display:flex;flex-direction:column;gap:16px;">
          ${reactionRoleQuestions.map((question) => {
            const questionId = question.id;
            const channelName = question.channel_id ? (guild.channels.cache.get(question.channel_id)?.name || question.channel_id) : "Not sent";
            const isDeployed = !!question.channel_id;
            
            return `
              <div class="reaction-question-card">
                <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:12px;">
                  <div>
                    <h4 style="margin:0 0 4px 0;">${escapeHtml(question.question_text)}</h4>
                    <p style="margin:0;font-size:0.9em;opacity:0.7;">
                      ${isDeployed ? `Deployed to #${escapeHtml(channelName)}` : "Not deployed yet"}
                    </p>
                  </div>
                  <form method="post" action="/guild/${guildId}/reaction-questions/${questionId}/delete" style="display:inline;">
                    <button type="submit" onclick="return confirm('Delete this question and all its options?')" style="background:#d9534f;">Delete</button>
                  </form>
                </div>

                <details style="margin-bottom:12px;">
                  <summary class="reaction-summary">Manage Options</summary>
                  
                  <div id="question-${questionId}-options" style="margin:12px 0;">
                    <!-- Options will be loaded here -->
                  </div>

                  <form method="post" action="/guild/${guildId}/reaction-questions/${questionId}/options/create" class="reaction-option-form">
                    <h5 style="margin:0 0 8px 0;">Add New Option</h5>
                    <div style="display:grid;grid-template-columns:80px 1fr 1fr;gap:8px;margin-bottom:8px;">
                      <label style="display:flex;flex-direction:column;">
                        <span style="font-size:0.85em;margin-bottom:4px;">Emoji</span>
                        <input name="emoji" placeholder="😀" required />
                      </label>
                      <label style="display:flex;flex-direction:column;">
                        <span style="font-size:0.85em;margin-bottom:4px;">Label</span>
                        <input name="label" placeholder="Option name" required />
                      </label>
                      <label style="display:flex;flex-direction:column;">
                        <span style="font-size:0.85em;margin-bottom:4px;">Position</span>
                        <input name="position" type="number" value="0" style="max-width:80px;" />
                      </label>
                    </div>
                    <label style="display:flex;flex-direction:column;margin-bottom:8px;">
                      <span style="font-size:0.85em;margin-bottom:4px;">Description (optional)</span>
                      <input name="description" placeholder="Description shown in dropdown" />
                    </label>
                    <label style="display:flex;flex-direction:column;margin-bottom:8px;">
                      <span style="font-size:0.85em;margin-bottom:4px;">Role IDs (comma-separated)</span>
                      <input name="role_ids" placeholder="123456789,987654321" required />
                    </label>
                    <button type="submit">Add Option</button>
                  </form>
                </details>

                <form method="post" action="/guild/${guildId}/reaction-questions/${questionId}/send" class="reaction-send-form">
                  <div style="display:flex;gap:8px;align-items:end;">
                    <label style="flex:1;">
                      <span style="font-size:0.85em;margin-bottom:4px;display:block;">Send to Channel</span>
                      <select name="channel_id" required>
                        <option value="">Select channel</option>
                        ${textChannels.map((c) => `<option value="${c.id}" ${question.channel_id === c.id ? "selected" : ""}>#${escapeHtml(c.name)}</option>`).join("")}
                      </select>
                    </label>
                    <button type="submit" style="background:#5cb85c;">${isDeployed ? "Update" : "Send"} Message</button>
                  </div>
                </form>
              </div>
            `;
          }).join("")}
        </div>
      ` : `<p style="opacity:0.7;">No questions created yet.</p>`}

      <script>
        // Load options for each question
        ${reactionRoleQuestions.map((q) => `
          fetch('/guild/${guildId}/reaction-questions/${q.id}')
            .then(r => r.json())
            .then(data => {
              const container = document.getElementById('question-${q.id}-options');
              if (data.options && data.options.length > 0) {
                container.innerHTML = '<div style="display:flex;flex-direction:column;gap:8px;">' + data.options.map(opt => {
                  const roleNames = opt.role_ids.split(',').map(id => {
                    const role = ${JSON.stringify(roleOptions.map(r => ({ id: r.id, name: r.name })))};
                    const found = role.find(r => r.id === id.trim());
                    return found ? '@' + found.name : id;
                  }).join(', ');
                  return \`
                    <div class="reaction-option-item">
                      <div>
                        <span style="font-size:1.2em;margin-right:8px;">\${opt.emoji}</span>
                        <strong>\${opt.label}</strong>
                        \${opt.description ? '<span style="opacity:0.7;margin-left:8px;"> - ' + opt.description + '</span>' : ''}
                        <div style="font-size:0.85em;opacity:0.7;margin-top:4px;">Roles: \${roleNames} • Position: \${opt.position}</div>
                      </div>
                      <form method="post" action="/guild/${guildId}/reaction-questions/${q.id}/options/\${opt.id}/delete" style="display:inline;">
                        <button type="submit" style="background:#d9534f;padding:6px 12px;font-size:0.9em;">Delete</button>
                      </form>
                    </div>
                  \`;
                }).join('') + '</div>';
              } else {
                container.innerHTML = '<p style="opacity:0.7;font-style:italic;">No options yet. Add one below.</p>';
              }
            });
        `).join("")}
      </script>
      ` : ""}

      ${activeModule === "tickets" ? `
      <h3>Ticket System</h3>
      <form class="admin-grid-form" method="post" action="/guild/${guildId}/tickets/settings">
        <label style="min-width:120px;flex:0 0 120px;">
          <span>Enabled</span>
          <input type="checkbox" name="enabled" ${ticketSettings.enabled ? "checked" : ""} />
        </label>
        <label>Panel Channel
          <select name="panel_channel_id">
            <option value="">None</option>
            ${textChannels.map((c) => `<option value="${c.id}" ${ticketSettings.panel_channel_id === c.id ? "selected" : ""}>#${escapeHtml(c.name)}</option>`).join("")}
          </select>
        </label>
        <label>Category
          <select name="category_id">
            <option value="">None</option>
            ${categories.map((c) => `<option value="${c.id}" ${ticketSettings.category_id === c.id ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}
          </select>
        </label>
        <label>Support Role
          <select name="support_role_id">
            <option value="">None</option>
            ${roleOptions.map((r) => `<option value="${r.id}" ${ticketSettings.support_role_id === r.id ? "selected" : ""}>@${escapeHtml(r.name)}</option>`).join("")}
          </select>
        </label>
        <label>Ticket Prefix
          <input name="ticket_prefix" value="${escapeHtml(ticketSettings.ticket_prefix || "ticket")}" />
        </label>
        <label>Ticket Log Channel
          <select name="ticket_log_channel_id">
            <option value="">None</option>
            ${textChannels.map((c) => `<option value="${c.id}" ${ticketSettings.ticket_log_channel_id === c.id ? "selected" : ""}>#${escapeHtml(c.name)}</option>`).join("")}
          </select>
        </label>
        <label>Ticket Transcript Channel
          <select name="ticket_transcript_channel_id">
            <option value="">None</option>
            ${textChannels.map((c) => `<option value="${c.id}" ${ticketSettings.ticket_transcript_channel_id === c.id ? "selected" : ""}>#${escapeHtml(c.name)}</option>`).join("")}
          </select>
        </label>
        <label style="min-width:150px;flex:0 0 150px;">
          <span>Save Transcript</span>
          <input type="checkbox" name="save_transcript" ${ticketSettings.save_transcript ? "checked" : ""} />
        </label>
        <label style="min-width:150px;flex:0 0 150px;">
          <span>Delete on Close</span>
          <input type="checkbox" name="delete_on_close" ${ticketSettings.delete_on_close ? "checked" : ""} />
        </label>
        <label style="min-width:180px;flex:0 0 180px;">
          <span>SLA Reminder (minutes)</span>
          <input type="number" min="0" name="sla_first_response_minutes" value="${Number(ticketSettings.sla_first_response_minutes || 0)}" />
        </label>
        <label style="min-width:180px;flex:0 0 180px;">
          <span>SLA Escalation (minutes)</span>
          <input type="number" min="0" name="sla_escalation_minutes" value="${Number(ticketSettings.sla_escalation_minutes || 0)}" />
        </label>
        <label>SLA Escalation Role
          <select name="sla_escalation_role_id">
            <option value="">None</option>
            ${roleOptions.map((r) => `<option value="${r.id}" ${ticketSettings.sla_escalation_role_id === r.id ? "selected" : ""}>@${escapeHtml(r.name)}</option>`).join("")}
          </select>
        </label>
        <button type="submit">Save Ticket Settings</button>
      </form>

      <form method="post" action="/guild/${guildId}/tickets/panel" style="margin-top:8px;">
        <button type="submit">Send Ticket Panel</button>
      </form>

      <div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0;">
        <a href="/guild/${guildId}/tickets/open/export?format=json" style="display:inline-block;padding:8px 12px;border:1px solid rgba(255,255,255,0.2);border-radius:8px;text-decoration:none;">Export Open Tickets (JSON)</a>
        <a href="/guild/${guildId}/tickets/open/export?format=csv" style="display:inline-block;padding:8px 12px;border:1px solid rgba(255,255,255,0.2);border-radius:8px;text-decoration:none;">Export Open Tickets (CSV)</a>
      </div>

      <table>
        <tr><th>Open Ticket Channel</th><th>Opened By</th><th>Created</th><th>SLA Status</th><th>Actions</th></tr>
        ${openTickets.map((t) => {
          const chName = guild.channels.cache.get(t.channel_id)?.name || t.channel_id;
          const opener = guild.members.cache.get(t.opener_id);
          const openerName = opener ? `${opener.displayName} (${opener.user.username})` : t.opener_id;
          const created = Number.isFinite(Number(t.created_at)) ? new Date(Number(t.created_at)).toLocaleString() : "-";
          const now = Date.now();
          const lastActivity = Number(t.last_activity_at || t.created_at || now);
          const inactiveMinutes = Math.max(0, Math.floor((now - lastActivity) / 60000));
          const reminderTarget = Math.max(0, Number(ticketSettings.sla_first_response_minutes || 0));
          const escalationTarget = Math.max(0, Number(ticketSettings.sla_escalation_minutes || 0));
          const reminderSent = Number(t.sla_reminder_sent_at || 0) > 0;
          const escalated = Number(t.sla_escalated_at || 0) > 0;
          const slaStatus = [
            `Inactive: ${inactiveMinutes}m`,
            reminderTarget > 0 ? `Reminder: ${reminderSent ? "sent" : `${Math.max(0, reminderTarget - inactiveMinutes)}m left`}` : "Reminder: off",
            escalationTarget > 0 ? `Escalation: ${escalated ? "sent" : `${Math.max(0, escalationTarget - inactiveMinutes)}m left`}` : "Escalation: off"
          ].join(" | ");
          return `
            <tr>
              <td>${escapeHtml(chName)}</td>
              <td>${escapeHtml(openerName)}</td>
              <td>${escapeHtml(created)}</td>
              <td>${escapeHtml(slaStatus)}</td>
              <td>
                <form method="post" action="/guild/${guildId}/tickets/close" style="display:inline;">
                  <input type="hidden" name="channel_id" value="${escapeHtml(t.channel_id)}" />
                  <button type="submit">Close</button>
                </form>
              </td>
            </tr>
          `;
        }).join("") || `<tr><td colspan="5">No open tickets.</td></tr>`}
      </table>
      ` : ""}

      ${activeModule === "xp" ? `
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

      <h3>XP User Manager</h3>
      <form class="admin-grid-form" method="post" action="/guild/${guildId}/xp/manage">
        <label>User ID <input name="user_id" /></label>
        <label>Action
          <select name="action">
            <option value="add">Add</option>
            <option value="set">Set</option>
          </select>
        </label>
        <label>Amount <input name="amount" /></label>
        <button type="submit">Apply XP</button>
      </form>

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
      <form class="admin-grid-form" method="post" action="/guild/${guildId}/level-roles">
        <label>Level <input name="level" /></label>
        <label>Role
          <select name="role_id">
            <option value="">Select role</option>
            ${roleOptions.map((r) => `<option value="${r.id}">@${escapeHtml(r.name)}</option>`).join("")}
          </select>
        </label>
        <button type="submit">Add/Update</button>
      </form>

      <ul>
        ${levelRoles.map((r) => {
          const roleName = guild.roles.cache.get(r.role_id)?.name || "Unknown role";
          return `
          <li>
            Level ${r.level} → @${escapeHtml(roleName)}
            <form style="display:inline" method="post" action="/guild/${guildId}/level-roles/delete">
              <input type="hidden" name="level" value="${r.level}" />
              <button type="submit">Delete</button>
            </form>
          </li>
        `;
        }).join("")}
      </ul>

      <hr/>

      <h3>Ignored Channels (No XP)</h3>
      <form class="admin-grid-form" method="post" action="/guild/${guildId}/ignored-channels">
        <label>Text Channel
          <select name="text_channel_id">
            <option value="">None</option>
            ${textChannels.map((c) => `<option value="${c.id}">#${escapeHtml(c.name)}</option>`).join("")}
          </select>
        </label>
        <label>Voice Channel
          <select name="voice_channel_id">
            <option value="">None</option>
            ${voiceChannels.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("")}
          </select>
        </label>
        <label>Or Channel ID (advanced) <input name="channel_id" /></label>
        <label>Type 
          <select name="channel_type">
            <option value="text">Text</option>
            <option value="voice">Voice</option>
          </select>
        </label>
        <button type="submit">Add</button>
      </form>

      <ul>
        ${ignoredChannels.map((c) => {
          const channelName = guild.channels.cache.get(c.channel_id)?.name || c.channel_id;
          return `
          <li>
            ${escapeHtml(c.channel_type)} channel → ${escapeHtml(channelName)}
            <form style="display:inline" method="post" action="/guild/${guildId}/ignored-channels/delete">
              <input type="hidden" name="channel_id" value="${c.channel_id}" />
              <button type="submit">Delete</button>
            </form>
          </li>
        `;
        }).join("")}
      </ul>
      ` : ""}

      ${activeModule === "voice" ? `
      <h3>Claim-All Lock</h3>
      <p>Current status: <b>${claimLocked ? "Locked" : "Unlocked"}</b></p>
      <form method="post" action="/guild/${guildId}/claim-lock" style="display:inline;">
        <input type="hidden" name="claim_all_done" value="0" />
        <button type="submit">Unlock claim-all</button>
      </form>
      <form method="post" action="/guild/${guildId}/claim-lock" style="display:inline; margin-left: 8px;">
        <input type="hidden" name="claim_all_done" value="1" />
        <button type="submit">Lock claim-all</button>
      </form>

      <hr/>

      <h3>Private Voice Rooms</h3>
      <table>
        <tr><th>Owner</th><th>Voice Channel</th><th>Text Channel</th><th>Last Active</th><th>Actions</th></tr>
        ${privateRooms.map((r) => {
          const owner = guild.members.cache.get(r.owner_id);
          const ownerName = owner ? `${owner.displayName} (${owner.user.username})` : r.owner_id;
          const voiceName = guild.channels.cache.get(r.voice_channel_id)?.name || r.voice_channel_id;
          const textName = guild.channels.cache.get(r.text_channel_id)?.name || r.text_channel_id;
          const lastActive = Number.isFinite(Number(r.last_active_at)) ? new Date(Number(r.last_active_at)).toLocaleString() : "-";
          return `
            <tr>
              <td>${escapeHtml(ownerName)}</td>
              <td>${escapeHtml(voiceName)}</td>
              <td>${escapeHtml(textName)}</td>
              <td>${escapeHtml(lastActive)}</td>
              <td>
                <form method="post" action="/guild/${guildId}/private-rooms/delete" style="display:inline;">
                  <input type="hidden" name="voice_channel_id" value="${escapeHtml(r.voice_channel_id)}" />
                  <button type="submit">Remove Record</button>
                </form>
              </td>
            </tr>
          `;
        }).join("")}
      </table>
      ` : ""}

      ${activeModule === "giveaways" ? `
      <h3>🎉 Giveaways</h3>
      <p class="section-description">Create and manage server giveaways</p>
      
      ${giveaways.length > 0 ? `
      <h4>Active & Recent Giveaways</h4>
      <table>
        <tr>
          <th>Prize</th>
          <th>Winners</th>
          <th>Ends</th>
          <th>Status</th>
          <th>Host</th>
        </tr>
        ${giveaways.map(g => {
          const endDate = new Date(Number(g.end_time));
          const status = g.ended ? "Ended" : Date.now() > g.end_time ? "Ending..." : "Active";
          const statusColor = g.ended ? "#e74c3c" : Date.now() > g.end_time ? "#f39c12" : "#2ecc71";
          const winnersList = g.winner_ids ? g.winner_ids.split(",").map(id => `<@${id}>`).join(", ") : "TBD";
          return `
            <tr>
              <td>${escapeHtml(g.prize)}</td>
              <td>${g.winners_count}</td>
              <td>${endDate.toLocaleString()}</td>
              <td style="color:${statusColor};font-weight:bold;">${status}</td>
              <td><@${g.host_id}></td>
            </tr>
          `;
        }).join("")}
      </table>
      ` : `<p>No giveaways yet! Use <code>!giveaway start &lt;duration&gt; &lt;winners&gt; &lt;prize&gt;</code> to create one.</p>`}
      
      <div class="info-box">
        <strong>Commands:</strong>
        <ul style="margin:8px 0;">
          <li><code>!giveaway start &lt;duration&gt; &lt;winners&gt; &lt;prize&gt;</code> - Start a giveaway (e.g., <code>!giveaway start 1d 1 Discord Nitro</code>)</li>
          <li><code>!giveaway end &lt;message_id&gt;</code> - End a giveaway early</li>
          <li><code>!giveaway reroll &lt;message_id&gt;</code> - Reroll winners</li>
        </ul>
      </div>
      ` : ""}

      ${activeModule === "economy" ? `
      <h3>💰 Economy System</h3>
      <p class="section-description">Virtual currency system for your server</p>
      
      <form method="post" action="/guild/${guildId}/economy-settings">
        <div style="display:grid; gap:12px;">
          <label>
            <input type="checkbox" name="enabled" ${economySettings?.enabled ? "checked" : ""} />
            <span style="font-weight:600;">Enable Economy</span>
          </label>
          
          <label>
            <span>Currency Name</span>
            <input name="currency_name" value="${escapeHtml(economySettings?.currency_name || "coins")}" style="max-width:200px;" />
          </label>
          
          <label>
            <span>Currency Symbol</span>
            <input name="currency_symbol" value="${escapeHtml(economySettings?.currency_symbol || "🪙")}" style="max-width:100px;" />
          </label>
          
          <label>
            <span>Economy Prefix (for economy commands)</span>
            <input name="economy_prefix" value="${escapeHtml(economySettings?.economy_prefix || "$")}" style="max-width:100px;" />
          </label>
          
          <label>
            <span>Daily Reward Amount (base)</span>
            <input type="number" name="daily_amount" value="${economySettings?.daily_amount || 100}" min="1" max="100000" style="max-width:150px;" />
          </label>
          
          <label>
            <span>Daily Streak Bonus (per day)</span>
            <input type="number" name="daily_streak_bonus" value="${economySettings?.daily_streak_bonus || 10}" min="0" max="10000" style="max-width:150px;" />
          </label>
          
          <label>
            <span>Weekly Reward Amount</span>
            <input type="number" name="weekly_amount" value="${economySettings?.weekly_amount || 500}" min="1" max="500000" style="max-width:150px;" />
          </label>
          
          <label>
            <input type="checkbox" name="rob_enabled" ${economySettings?.rob_enabled ? "checked" : ""} />
            <span>Enable Robbing</span>
          </label>
          
          <label>
            <span>Rob Cooldown (seconds)</span>
            <input type="number" name="rob_cooldown" value="${economySettings?.rob_cooldown || 3600}" min="60" max="86400" style="max-width:150px;" />
          </label>
          <label>
            <span>Economy Guide</span>
            <textarea name="economy_guide" rows="10" style="width:100%;max-width:100%;font-family:inherit;">${escapeHtml(economySettings?.economy_guide || "")}</textarea>
            <small style="display:block;margin-top:6px;color:rgba(0,0,0,0.6);">This text is saved to your server economy settings and can be used as an editable admin guide.</small>
          </label>
        </div>
        <button type="submit" style="margin-top:16px;">Save Economy Settings</button>
      </form>

      ${topEconomy.length > 0 ? `
      <h4 style="margin-top:24px;">Top 10 Richest Members</h4>
      <table>
        <tr>
          <th>Rank</th>
          <th>User</th>
          <th>Balance</th>
        </tr>
        ${topEconomy.map((row, i) => {
          const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
          return `
            <tr>
              <td>${medal}</td>
              <td><@${row.user_id}></td>
              <td>${row.total} ${economySettings?.currency_name || "coins"}</td>
            </tr>
          `;
        }).join("")}
      </table>
      ` : ""}
      
      <div class="info-box">
        <strong>Commands:</strong>
        <ul style="margin:8px 0;">
          <li><code>!balance [@user]</code> or <code>!bal</code> - Check balance</li>
          <li><code>!daily</code> - Claim daily reward</li>
          <li><code>!weekly</code> - Claim weekly reward</li>
          <li><code>!pay &lt;user&gt; &lt;amount&gt;</code> - Send money to another user</li>
          <li><code>!baltop</code> or <code>!richest</code> - View leaderboard</li>
        </ul>
      </div>
      ` : ""}

      ${activeModule === "birthdays" ? `
      <h3>🎂 Birthday System</h3>
      <p class="section-description">Automatically celebrate member birthdays</p>
      
      <form method="post" action="/guild/${guildId}/birthday-settings">
        <div style="display:grid; gap:12px;">
          <label>
            <input type="checkbox" name="enabled" ${birthdaySettings?.enabled ? "checked" : ""} />
            <span style="font-weight:600;">Enable Birthday Announcements</span>
          </label>
          
          <label>
            <span>Birthday Channel</span>
            <select name="channel_id" style="max-width:300px;">
              <option value="">Select Channel</option>
              ${textChannels.map((c) => `<option value="${c.id}" ${birthdaySettings?.channel_id === c.id ? "selected" : ""}>#${escapeHtml(c.name)}</option>`).join("")}
            </select>
          </label>
          
          <label>
            <span>Birthday Message (use {user} for mention, {server} for server name)</span>
            <textarea name="message" rows="2" style="width:100%;max-width:500px;font-family:inherit;">${escapeHtml(birthdaySettings?.message || "Happy birthday {user}! 🎂🎉")}</textarea>
          </label>
          
          <label>
            <span>Birthday Role (optional - auto-removed after 24h)</span>
            <select name="role_id" style="max-width:300px;">
              <option value="">No Role</option>
              ${guild.roles.cache.sort((a, b) => b.position - a.position).filter(r => !r.managed && r.name !== "@everyone").map((r) => `<option value="${r.id}" ${birthdaySettings?.role_id === r.id ? "selected" : ""}>${escapeHtml(r.name)}</option>`).join("")}
            </select>
          </label>
        </div>
        <button type="submit" style="margin-top:16px;">Save Birthday Settings</button>
      </form>

      ${upcomingBirthdays.length > 0 ? `
      <h4 style="margin-top:24px;">Registered Birthdays</h4>
      <table>
        <tr>
          <th>User</th>
          <th>Birthday</th>
        </tr>
        ${upcomingBirthdays.map(b => {
          const date = `${b.birth_month}/${b.birth_day}${b.birth_year ? `/${b.birth_year}` : ""}`;
          return `
            <tr>
              <td><@${b.user_id}></td>
              <td>${date}</td>
            </tr>
          `;
        }).join("")}
      </table>
      ` : ""}
      
      <div class="info-box">
        <strong>Commands:</strong>
        <ul style="margin:8px 0;">
          <li><code>!birthday set &lt;MM/DD&gt;</code> or <code>!birthday set &lt;MM/DD/YYYY&gt;</code> - Set your birthday</li>
          <li><code>!birthday remove</code> - Remove your birthday</li>
          <li><code>!birthday list</code> - View all birthdays</li>
        </ul>
      </div>
      ` : ""}

      ${activeModule === "customcommands" ? (() => {
        return `
      <h3>⚙️ Custom Commands</h3>
      <p class="section-description">Create custom text commands that respond with embeds and optional GIFs. You can add multiple possible responses and the bot will randomly pick one.</p>
      
      <form method="post" action="/guild/${guildId}/custom-commands/create" enctype="multipart/form-data">
        <div style="display:grid; gap:12px;">
          <label>
            <span>Command Name (without prefix)</span>
            <input type="text" name="command_name" placeholder="hello" required style="max-width:200px;" />
          </label>
          
          <div style="display:flex; gap:16px; align-items:center;">
            <label style="display:flex; align-items:center; gap:8px;">
              <input type="checkbox" name="allow_target" value="true" />
              <span>Allow targeting users (!cmd @user)</span>
            </label>
            
            <label>
              <span>Usage Limit (optional, per user per day)</span>
              <input type="number" name="usage_limit" placeholder="10" min="1" style="max-width:100px;" />
            </label>
          </div>
          
          <div id="responses-container">
            <div class="response-item" style="border:1px solid #ddd; padding:12px; margin-bottom:12px; border-radius:6px;">
              <label>
                <span>Response Text (for the embed)</span>
                <textarea name="response_text_0" rows="3" placeholder="Hello! Welcome to our server!" required style="width:100%;max-width:100%;font-family:inherit;"></textarea>
              </label>
              
              <label style="margin-top:8px;">
                <span>GIF URLs (one per line, optional)</span>
                <textarea name="gifs_0" rows="2" placeholder="https://media.giphy.com/...\nhttps://media.giphy.com/..." style="width:100%;max-width:100%;font-family:monospace;font-size:0.9em;"></textarea>
              </label>
              
              <label style="margin-top:8px;">
                <span>Upload GIF Files (optional, multiple allowed)</span>
                <input type="file" name="uploaded_gifs_0" accept=".gif" multiple style="width:100%;" />
              </label>
              
              <button type="button" onclick="removeResponse(this)" style="margin-top:8px; background:#ff6b6b; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">Remove Response</button>
            </div>
          </div>
          
          <button type="button" onclick="addResponse()" style="background:#4CAF50; color:white; border:none; padding:8px 16px; border-radius:4px; cursor:pointer;">+ Add Another Response</button>
        </div>
        <button type="submit" style="margin-top:16px;">Create Custom Command</button>
      </form>

      <script>
        let responseCount = 1;
        
        function addResponse() {
          const container = document.getElementById('responses-container');
          const div = document.createElement('div');
          div.className = 'response-item';
          div.style.cssText = 'border:1px solid #ddd; padding:12px; margin-bottom:12px; border-radius:6px;';
          div.innerHTML = \`
            <label>
              <span>Response Text (for the embed)</span>
              <textarea name="response_text_\${responseCount}" rows="3" placeholder="Another response option..." required style="width:100%;max-width:100%;font-family:inherit;"></textarea>
            </label>
            
            <label style="margin-top:8px;">
              <span>GIF URLs (one per line, optional)</span>
              <textarea name="gifs_\${responseCount}" rows="2" placeholder="https://media.giphy.com/..." style="width:100%;max-width:100%;font-family:monospace;font-size:0.9em;"></textarea>
            </label>
            
            <label style="margin-top:8px;">
              <span>Upload GIF Files (optional, multiple allowed)</span>
              <input type="file" name="uploaded_gifs_\${responseCount}" accept=".gif" multiple style="width:100%;" />
            </label>
            
            <button type="button" onclick="removeResponse(this)" style="margin-top:8px; background:#ff6b6b; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">Remove Response</button>
          \`;
          container.appendChild(div);
          responseCount++;
        }
        
        function removeResponse(button) {
          if (document.querySelectorAll('.response-item').length > 1) {
            button.parentElement.remove();
          } else {
            alert('You must have at least one response!');
          }
        }
      </script>

      <h4 style="margin-top:24px;">Your Custom Commands</h4>
      \${customCommands.length > 0 ? \`
        <table>
          <tr>
            <th>Command</th>
            <th>Responses</th>
            <th>Actions</th>
          </tr>
          \${customCommands.map((cmd) => {
            const responses = JSON.parse(cmd.responses || '[]');
            const totalResponses = responses.length;
            const preview = responses.length > 0 ? responses[0].text?.slice(0, 50) + (responses[0].text?.length > 50 ? '...' : '') : 'No responses';
            return \`
              <tr>
                <td><code>\\\`\${escapeHtml(cmd.command_name)}\\\`</code></td>
                <td>\${totalResponses} response\${totalResponses !== 1 ? 's' : ''}<br><small>\${escapeHtml(preview)}</small></td>
                <td>
                  <form method="post" action="/guild/\${guildId}/custom-commands/delete/\${cmd.id}" style="display:inline;">
                    <button type="submit" onclick="return confirm('Delete this command?')" style="color:red;background:none;border:none;cursor:pointer;text-decoration:underline;">Delete</button>
                  </form>
                </td>
              </tr>
            \`;
          }).join("")}
        </table>
      ` : `<p style="opacity:0.7;">No custom commands yet. Create one to get started!</p>`}
      `;
      })() : ""}

      ${activeModule === "autoreplies" ? (() => {
        return `
      <h3>🤖 Auto Replies</h3>
      <p class="section-description">Set up automatic replies or reactions when users send specific trigger messages. The bot will randomly pick one response.</p>
      
      <form method="post" action="/guild/${guildId}/auto-replies/create" enctype="multipart/form-data">
        <div style="display:grid; gap:12px;">
          <label>
            <span>Trigger Message (what users say to trigger this)</span>
            <input type="text" name="trigger_message" placeholder="hello" required style="max-width:300px;" />
          </label>
          
          <label>
            <span>Response Type</span>
            <select name="response_type" onchange="toggleResponseFields(this.value)" required>
              <option value="reply">Reply with embed</option>
              <option value="react">React with emoji</option>
            </select>
          </label>
          
          <div id="reply-fields" style="display:block;">
            <div id="auto-responses-container">
              <div class="auto-response-item" style="border:1px solid #ddd; padding:12px; margin-bottom:12px; border-radius:6px;">
                <label>
                  <span>Response Text (for the embed)</span>
                  <textarea name="response_text_0" rows="3" placeholder="Hello! Welcome to our server!" required style="width:100%;max-width:100%;font-family:inherit;"></textarea>
                </label>
                
                <label style="margin-top:8px;">
                  <span>GIF URLs (one per line, optional)</span>
                  <textarea name="gifs_0" rows="2" placeholder="https://media.giphy.com/...\nhttps://media.giphy.com/..." style="width:100%;max-width:100%;font-family:monospace;font-size:0.9em;"></textarea>
                </label>
                
                <label style="margin-top:8px;">
                  <span>Upload GIF Files (optional, multiple allowed)</span>
                  <input type="file" name="uploaded_gifs_0" accept=".gif" multiple style="width:100%;" />
                </label>
                
                <button type="button" onclick="removeAutoResponse(this)" style="margin-top:8px; background:#ff6b6b; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">Remove Response</button>
              </div>
            </div>
            
            <button type="button" onclick="addAutoResponse()" style="background:#4CAF50; color:white; border:none; padding:8px 16px; border-radius:4px; cursor:pointer;">+ Add Another Response</button>
          </div>
          
          <div id="react-fields" style="display:none;">
            <label>
              <span>Reaction Emoji</span>
              <input type="text" name="reaction_emoji" placeholder="😊" style="max-width:100px;" />
            </label>
          </div>
        </div>
        <button type="submit" style="margin-top:16px;">Create Auto Reply</button>
      </form>

      <script>
        let autoResponseCount = 1;
        
        function toggleResponseFields(type) {
          document.getElementById('reply-fields').style.display = type === 'reply' ? 'block' : 'none';
          document.getElementById('react-fields').style.display = type === 'react' ? 'block' : 'none';
        }
        
        function addAutoResponse() {
          const container = document.getElementById('auto-responses-container');
          const div = document.createElement('div');
          div.className = 'auto-response-item';
          div.style.cssText = 'border:1px solid #ddd; padding:12px; margin-bottom:12px; border-radius:6px;';
          div.innerHTML = \`
            <label>
              <span>Response Text (for the embed)</span>
              <textarea name="response_text_\${autoResponseCount}" rows="3" placeholder="Hello! Welcome to our server!" required style="width:100%;max-width:100%;font-family:inherit;"></textarea>
            </label>
            
            <label style="margin-top:8px;">
              <span>GIF URLs (one per line, optional)</span>
              <textarea name="gifs_\${autoResponseCount}" rows="2" placeholder="https://media.giphy.com/..." style="width:100%;max-width:100%;font-family:monospace;font-size:0.9em;"></textarea>
            </label>
            
            <label style="margin-top:8px;">
              <span>Upload GIF Files (optional, multiple allowed)</span>
              <input type="file" name="uploaded_gifs_\${autoResponseCount}" accept=".gif" multiple style="width:100%;" />
            </label>
            
            <button type="button" onclick="removeAutoResponse(this)" style="margin-top:8px; background:#ff6b6b; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">Remove Response</button>
          \`;
          container.appendChild(div);
          autoResponseCount++;
        }
        
        function removeAutoResponse(button) {
          if (document.querySelectorAll('.auto-response-item').length > 1) {
            button.parentElement.remove();
          } else {
            alert('You must have at least one response!');
          }
        }
      </script>

      <h4 style="margin-top:24px;">Your Auto Replies</h4>
      \${autoReplies.length > 0 ? \`
        <table>
          <tr>
            <th>Trigger</th>
            <th>Type</th>
            <th>Responses</th>
            <th>Actions</th>
          </tr>
          \${autoReplies.map((reply) => {
            let responsesDisplay = '';
            if (reply.response_type === 'react') {
              responsesDisplay = reply.responses;
            } else {
              try {
                const parsed = JSON.parse(reply.responses);
                responsesDisplay = parsed.map(r => r.text).join(' | ');
              } catch (e) {
                responsesDisplay = 'Error parsing responses';
              }
            }
            return \`
            <tr>
              <td>\${escapeHtml(reply.trigger_message)}</td>
              <td>\${reply.response_type}</td>
              <td>\${escapeHtml(responsesDisplay)}</td>
              <td>
                <form method="post" action="/guild/\${guildId}/auto-replies/toggle/\${reply.id}" style="display:inline;">
                  <button type="submit" style="background:\${reply.enabled ? '#ff6b6b' : '#4CAF50'}; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">
                    \${reply.enabled ? 'Disable' : 'Enable'}
                  </button>
                </form>
                <form method="post" action="/guild/\${guildId}/auto-replies/delete/\${reply.id}" style="display:inline;">
                  <button type="submit" style="background:#ff6b6b; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">Delete</button>
                </form>
              </td>
            </tr>\`;
          }).join("")}
        </table>
      ` : `<p style="opacity:0.7;">No auto replies yet. Create one to get started!</p>`}
      `;
      })() : ""}

      ${activeModule === "customization" ? `
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
      ` : ""}
    `));
  // ─────────────────────────────────────────────
  app.post("/guild/:guildId/customization-unlocks", requireGuildAdmin, async (req, res) => {
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
      return res.redirect(getModuleRedirect(guildId, 'customization'));
    } catch (e) {
      console.error("customization-unlocks save error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  // ─────────────────────────────────────────────
  // Save moderation settings
  // ─────────────────────────────────────────────
  app.post("/guild/:guildId/mod-settings", requireGuildAdmin, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const modRoleId = String(req.body.mod_role_id || "").trim() || null;
      const logChannelId = String(req.body.log_channel_id || "").trim() || null;
      const commandPrefixRaw = String(req.body.command_prefix || "!").trim();
      const newAccountWarnDaysRaw = Number.parseInt(String(req.body.new_account_warn_days || "1"), 10);
      const antiNukeEnabled = req.body.anti_nuke_enabled === "on";
      const antiNukeAutoUnlockRaw = Number.parseInt(String(req.body.anti_nuke_auto_unlock_minutes || "0"), 10);
      const antiNukeWindowRaw = Number.parseInt(String(req.body.anti_nuke_window_seconds || "30"), 10);
      const antiNukeCooldownRaw = Number.parseInt(String(req.body.anti_nuke_cooldown_minutes || "10"), 10);
      const antiNukeChannelDeleteThresholdRaw = Number.parseInt(String(req.body.anti_nuke_channel_delete_threshold || "3"), 10);
      const antiNukeRoleDeleteThresholdRaw = Number.parseInt(String(req.body.anti_nuke_role_delete_threshold || "3"), 10);
      const antiNukeBanAddThresholdRaw = Number.parseInt(String(req.body.anti_nuke_ban_add_threshold || "4"), 10);
      const antiNukeAlertChannelId = String(req.body.anti_nuke_alert_channel_id || "").trim() || null;
      const antiNukeAlertRoleId = String(req.body.anti_nuke_alert_role_id || "").trim() || null;
      const antiNukeLockManageChannels = req.body.anti_nuke_lock_manage_channels === "on";
      const antiNukeLockManageRoles = req.body.anti_nuke_lock_manage_roles === "on";
      const antiNukeLockBanMembers = req.body.anti_nuke_lock_ban_members === "on";
      const antiNukeLockKickMembers = req.body.anti_nuke_lock_kick_members === "on";
      const antiNukeLockManageWebhooks = req.body.anti_nuke_lock_manage_webhooks === "on";
      const logSummaryCardsEnabled = req.body.log_summary_cards_enabled === "on";
      const logQuickModActionsEnabled = req.body.log_quick_mod_actions_enabled === "on";
      const newAccountWarnDays = Number.isInteger(newAccountWarnDaysRaw) && newAccountWarnDaysRaw >= 0
        ? newAccountWarnDaysRaw
        : 1;
      const antiNukeWindowSeconds = Number.isInteger(antiNukeWindowRaw) ? Math.min(300, Math.max(5, antiNukeWindowRaw)) : 30;
      const antiNukeAutoUnlockMinutes = Number.isInteger(antiNukeAutoUnlockRaw) ? Math.min(1440, Math.max(0, antiNukeAutoUnlockRaw)) : 0;
      const antiNukeCooldownMinutes = Number.isInteger(antiNukeCooldownRaw) ? Math.min(120, Math.max(1, antiNukeCooldownRaw)) : 10;
      const antiNukeChannelDeleteThreshold = Number.isInteger(antiNukeChannelDeleteThresholdRaw) ? Math.min(20, Math.max(0, antiNukeChannelDeleteThresholdRaw)) : 3;
      const antiNukeRoleDeleteThreshold = Number.isInteger(antiNukeRoleDeleteThresholdRaw) ? Math.min(20, Math.max(0, antiNukeRoleDeleteThresholdRaw)) : 3;
      const antiNukeBanAddThreshold = Number.isInteger(antiNukeBanAddThresholdRaw) ? Math.min(30, Math.max(0, antiNukeBanAddThresholdRaw)) : 4;
      const commandPrefix = (!commandPrefixRaw || commandPrefixRaw.length > 3 || /\s/.test(commandPrefixRaw))
        ? "!"
        : commandPrefixRaw;
      await updateGuildSettings(guildId, {
        mod_role_id: modRoleId,
        log_channel_id: logChannelId,
        log_summary_cards_enabled: logSummaryCardsEnabled,
        log_quick_mod_actions_enabled: logQuickModActionsEnabled,
        command_prefix: commandPrefix,
        new_account_warn_days: newAccountWarnDays,
        anti_nuke_enabled: antiNukeEnabled,
        anti_nuke_auto_unlock_minutes: antiNukeAutoUnlockMinutes,
        anti_nuke_window_seconds: antiNukeWindowSeconds,
        anti_nuke_cooldown_minutes: antiNukeCooldownMinutes,
        anti_nuke_channel_delete_threshold: antiNukeChannelDeleteThreshold,
        anti_nuke_role_delete_threshold: antiNukeRoleDeleteThreshold,
        anti_nuke_ban_add_threshold: antiNukeBanAddThreshold,
        anti_nuke_alert_channel_id: antiNukeAlertChannelId,
        anti_nuke_alert_role_id: antiNukeAlertRoleId,
        anti_nuke_lock_manage_channels: antiNukeLockManageChannels,
        anti_nuke_lock_manage_roles: antiNukeLockManageRoles,
        anti_nuke_lock_ban_members: antiNukeLockBanMembers,
        anti_nuke_lock_kick_members: antiNukeLockKickMembers,
        anti_nuke_lock_manage_webhooks: antiNukeLockManageWebhooks
      });
      return res.redirect(getModuleRedirect(guildId, 'moderation'));
    } catch (e) {
      console.error("mod-settings save error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  app.post("/guild/:guildId/anti-nuke/unlock", requireGuildAdmin, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) return res.status(404).send("Guild not found.");

      await guild.channels.fetch().catch(() => {});
      const settings = await getGuildSettings(guildId);
      const everyone = guild.roles.everyone;

      const unlockPerms = {};
      if (settings?.anti_nuke_lock_manage_channels !== false) unlockPerms.ManageChannels = null;
      if (settings?.anti_nuke_lock_manage_roles !== false) unlockPerms.ManageRoles = null;
      if (settings?.anti_nuke_lock_ban_members !== false) unlockPerms.BanMembers = null;
      if (settings?.anti_nuke_lock_kick_members !== false) unlockPerms.KickMembers = null;
      if (settings?.anti_nuke_lock_manage_webhooks !== false) unlockPerms.ManageWebhooks = null;

      if (!Object.keys(unlockPerms).length) {
        return res.redirect(getModuleRedirect(guildId, 'moderation'));
      }

      for (const [, channel] of guild.channels.cache) {
        if (!channel?.permissionOverwrites?.edit) continue;
        await channel.permissionOverwrites.edit(everyone, unlockPerms, {
          reason: "Manual anti-nuke unlock from dashboard"
        }).catch(() => {});
      }

      const cancelledJobs = await run(
        `UPDATE anti_nuke_unlock_jobs SET executed_at=? WHERE guild_id=? AND executed_at IS NULL`,
        [Date.now(), guildId]
      ).catch(() => null);

      await run(
        `INSERT INTO anti_nuke_incidents (guild_id, incident_type, event_type, actor_user_id, initiated_by_user_id, details, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          guildId,
          "manual_unlock",
          null,
          null,
          req.user?.id || null,
          JSON.stringify({
            unlocked_permissions: Object.keys(unlockPerms),
            cancelled_auto_unlock_jobs: Number(cancelledJobs?.rowCount || 0)
          }),
          Date.now()
        ]
      ).catch(() => {});

      return res.redirect(getModuleRedirect(guildId, 'moderation'));
    } catch (e) {
      console.error("anti-nuke unlock error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  app.post("/guild/:guildId/anti-nuke/incidents/clear", requireGuildAdmin, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const deleted = await run(
        `DELETE FROM anti_nuke_incidents WHERE guild_id=?`,
        [guildId]
      );

      await run(
        `INSERT INTO anti_nuke_incidents (guild_id, incident_type, event_type, actor_user_id, initiated_by_user_id, details, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          guildId,
          "history_cleared",
          null,
          null,
          req.user?.id || null,
          JSON.stringify({ deleted_count: Number(deleted?.rowCount || 0) }),
          Date.now()
        ]
      ).catch(() => {});

      return res.redirect(getModuleRedirect(guildId, 'moderation'));
    } catch (e) {
      console.error("anti-nuke incidents clear error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  app.post("/guild/:guildId/anti-nuke/unlock-jobs/cancel", requireGuildAdmin, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const jobId = Number.parseInt(String(req.body.job_id || "0"), 10);
      if (!Number.isInteger(jobId) || jobId <= 0) {
        return res.redirect(getModuleRedirect(guildId, 'moderation'));
      }

      const existing = await get(
        `SELECT id, run_at, unlock_perms_json, created_at
         FROM anti_nuke_unlock_jobs
         WHERE id=? AND guild_id=? AND executed_at IS NULL`,
        [jobId, guildId]
      );
      if (!existing) {
        return res.redirect(getModuleRedirect(guildId, 'moderation'));
      }

      await run(
        `UPDATE anti_nuke_unlock_jobs SET executed_at=? WHERE id=? AND guild_id=? AND executed_at IS NULL`,
        [Date.now(), jobId, guildId]
      );

      let unlockPerms = [];
      try {
        const parsed = JSON.parse(String(existing.unlock_perms_json || "[]"));
        if (Array.isArray(parsed)) unlockPerms = parsed;
      } catch {
        unlockPerms = [];
      }

      await run(
        `INSERT INTO anti_nuke_incidents (guild_id, incident_type, event_type, actor_user_id, initiated_by_user_id, details, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          guildId,
          "auto_unlock_canceled",
          null,
          null,
          req.user?.id || null,
          JSON.stringify({
            job_id: jobId,
            run_at: Number(existing.run_at || 0),
            created_at: Number(existing.created_at || 0),
            unlock_permissions: unlockPerms
          }),
          Date.now()
        ]
      ).catch(() => {});

      return res.redirect(getModuleRedirect(guildId, 'moderation'));
    } catch (e) {
      console.error("anti-nuke unlock-job cancel error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  app.post("/guild/:guildId/anti-nuke/unlock-jobs/cancel-all", requireGuildAdmin, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const now = Date.now();
      const pendingCountRow = await get(
        `SELECT COUNT(*)::int AS count
         FROM anti_nuke_unlock_jobs
         WHERE guild_id=? AND executed_at IS NULL`,
        [guildId]
      );
      const pendingCount = Number(pendingCountRow?.count || 0);
      if (pendingCount <= 0) {
        return res.redirect(getModuleRedirect(guildId, 'moderation'));
      }

      await run(
        `UPDATE anti_nuke_unlock_jobs
         SET executed_at=?
         WHERE guild_id=? AND executed_at IS NULL`,
        [now, guildId]
      );

      await run(
        `INSERT INTO anti_nuke_incidents (guild_id, incident_type, event_type, actor_user_id, initiated_by_user_id, details, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          guildId,
          "auto_unlock_canceled",
          null,
          null,
          req.user?.id || null,
          JSON.stringify({ cancel_all: true, canceled_count: pendingCount }),
          now
        ]
      ).catch(() => {});

      return res.redirect(getModuleRedirect(guildId, 'moderation'));
    } catch (e) {
      console.error("anti-nuke unlock-job cancel-all error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  app.get("/guild/:guildId/anti-nuke/unlock-jobs/export", requireGuildAdmin, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const jobs = await all(
        `SELECT id, guild_id, run_at, unlock_perms_json, created_at
         FROM anti_nuke_unlock_jobs
         WHERE guild_id=? AND executed_at IS NULL
         ORDER BY run_at ASC`,
        [guildId]
      );

      const payload = {
        version: 1,
        exported_at: Date.now(),
        guild_id: guildId,
        count: jobs.length,
        jobs
      };

      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="guild-${guildId}-pending-anti-nuke-unlock-jobs-${stamp}.json"`);
      return res.status(200).send(JSON.stringify(payload, null, 2));
    } catch (e) {
      console.error("anti-nuke unlock-jobs export error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  app.get("/guild/:guildId/anti-nuke/unlock-jobs/export.csv", requireGuildAdmin, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const jobs = await all(
        `SELECT id, guild_id, run_at, unlock_perms_json, created_at
         FROM anti_nuke_unlock_jobs
         WHERE guild_id=? AND executed_at IS NULL
         ORDER BY run_at ASC`,
        [guildId]
      );

      const escapeCsv = (value) => {
        const text = String(value ?? "");
        if (/[",\n]/.test(text)) {
          return `"${text.replace(/"/g, '""')}"`;
        }
        return text;
      };

      const header = ["id", "guild_id", "run_at", "unlock_perms_json", "created_at"];
      const lines = [header.join(",")];
      for (const row of jobs) {
        lines.push([
          row.id,
          row.guild_id,
          row.run_at,
          row.unlock_perms_json,
          row.created_at
        ].map(escapeCsv).join(","));
      }

      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="guild-${guildId}-pending-anti-nuke-unlock-jobs-${stamp}.csv"`);
      return res.status(200).send(lines.join("\n"));
    } catch (e) {
      console.error("anti-nuke unlock-jobs csv export error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  app.post("/guild/:guildId/anti-nuke-exemptions/add", requireGuildAdmin, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const userId = String(req.body.user_id || "").trim();
      const roleId = String(req.body.role_id || "").trim();
      const now = Date.now();
      if (userId) {
        await addAntiNukeExemption(guildId, userId, "user");
        await run(
          `INSERT INTO anti_nuke_incidents (guild_id, incident_type, event_type, actor_user_id, initiated_by_user_id, details, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            guildId,
            "exemption_added",
            null,
            userId,
            req.user?.id || null,
            JSON.stringify({ target_type: "user", target_id: userId }),
            now
          ]
        ).catch(() => {});
      }
      if (roleId) {
        await addAntiNukeExemption(guildId, roleId, "role");
        await run(
          `INSERT INTO anti_nuke_incidents (guild_id, incident_type, event_type, actor_user_id, initiated_by_user_id, details, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            guildId,
            "exemption_added",
            null,
            null,
            req.user?.id || null,
            JSON.stringify({ target_type: "role", target_id: roleId }),
            now
          ]
        ).catch(() => {});
      }
      return res.redirect(getModuleRedirect(guildId, 'moderation'));
    } catch (e) {
      console.error("anti-nuke exemptions add error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  app.post("/guild/:guildId/anti-nuke-exemptions/delete", requireGuildAdmin, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const targetId = String(req.body.target_id || "").trim();
      if (!targetId) return res.status(400).send("Target ID required.");

      const existing = await get(
        `SELECT target_id, target_type
         FROM anti_nuke_exemptions
         WHERE guild_id=? AND target_id=?`,
        [guildId, targetId]
      );

      await removeAntiNukeExemption(guildId, targetId);

      await run(
        `INSERT INTO anti_nuke_incidents (guild_id, incident_type, event_type, actor_user_id, initiated_by_user_id, details, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          guildId,
          "exemption_removed",
          null,
          existing?.target_type === "user" ? targetId : null,
          req.user?.id || null,
          JSON.stringify({ target_type: existing?.target_type || "unknown", target_id: targetId }),
          Date.now()
        ]
      ).catch(() => {});

      return res.redirect(getModuleRedirect(guildId, 'moderation'));
    } catch (e) {
      console.error("anti-nuke exemptions delete error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  app.get("/guild/:guildId/anti-nuke-exemptions/export", requireGuildAdmin, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const exemptions = await getAntiNukeExemptions(guildId);
      const payload = {
        version: 1,
        exported_at: Date.now(),
        guild_id: guildId,
        count: exemptions.length,
        exemptions
      };

      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="guild-${guildId}-anti-nuke-exemptions-${stamp}.json"`);
      return res.status(200).send(JSON.stringify(payload, null, 2));
    } catch (e) {
      console.error("anti-nuke exemptions export error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  app.get("/guild/:guildId/anti-nuke-exemptions/export.csv", requireGuildAdmin, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const exemptions = await getAntiNukeExemptions(guildId);

      const escapeCsv = (value) => {
        const text = String(value ?? "");
        if (/[",\n]/.test(text)) {
          return `"${text.replace(/"/g, '""')}"`;
        }
        return text;
      };

      const header = ["target_id", "target_type", "created_at"];
      const lines = [header.join(",")];
      for (const row of exemptions) {
        lines.push([
          row.target_id,
          row.target_type,
          row.created_at
        ].map(escapeCsv).join(","));
      }

      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="guild-${guildId}-anti-nuke-exemptions-${stamp}.csv"`);
      return res.status(200).send(lines.join("\n"));
    } catch (e) {
      console.error("anti-nuke exemptions csv export error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  app.get("/guild/:guildId/anti-nuke/incidents/export", requireGuildAdmin, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const filterTypeRaw = String(req.query.incident_type || "all").trim().toLowerCase();
      const allowedTypes = new Set(["all", "trigger", "manual_unlock", "auto_unlock", "history_cleared", "auto_unlock_canceled", "exemption_added", "exemption_removed"]);
      const filterType = allowedTypes.has(filterTypeRaw) ? filterTypeRaw : "all";
      const search = String(req.query.search || "").trim().slice(0, 80);

      const where = ["guild_id=?"];
      const params = [guildId];
      if (filterType !== "all") {
        where.push("incident_type=?");
        params.push(filterType);
      }
      if (search) {
        const like = `%${search}%`;
        where.push(`(
          COALESCE(event_type, '') ILIKE ?
          OR COALESCE(actor_user_id, '') ILIKE ?
          OR COALESCE(initiated_by_user_id, '') ILIKE ?
          OR COALESCE(details, '') ILIKE ?
        )`);
        params.push(like, like, like, like);
      }

      const incidents = await all(
        `SELECT id, incident_type, event_type, actor_user_id, initiated_by_user_id, details, created_at
         FROM anti_nuke_incidents
         WHERE ${where.join(" AND ")}
         ORDER BY created_at DESC`,
        params
      );

      const payload = {
        version: 1,
        exported_at: Date.now(),
        guild_id: guildId,
        count: incidents.length,
        incidents
      };

      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="guild-${guildId}-anti-nuke-incidents-${stamp}.json"`);
      return res.status(200).send(JSON.stringify(payload, null, 2));
    } catch (e) {
      console.error("anti-nuke incidents export error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  app.get("/guild/:guildId/anti-nuke/incidents/export.csv", requireGuildAdmin, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const filterTypeRaw = String(req.query.incident_type || "all").trim().toLowerCase();
      const allowedTypes = new Set(["all", "trigger", "manual_unlock", "auto_unlock", "history_cleared", "auto_unlock_canceled", "exemption_added", "exemption_removed"]);
      const filterType = allowedTypes.has(filterTypeRaw) ? filterTypeRaw : "all";
      const search = String(req.query.search || "").trim().slice(0, 80);

      const where = ["guild_id=?"];
      const params = [guildId];
      if (filterType !== "all") {
        where.push("incident_type=?");
        params.push(filterType);
      }
      if (search) {
        const like = `%${search}%`;
        where.push(`(
          COALESCE(event_type, '') ILIKE ?
          OR COALESCE(actor_user_id, '') ILIKE ?
          OR COALESCE(initiated_by_user_id, '') ILIKE ?
          OR COALESCE(details, '') ILIKE ?
        )`);
        params.push(like, like, like, like);
      }

      const incidents = await all(
        `SELECT id, incident_type, event_type, actor_user_id, initiated_by_user_id, details, created_at
         FROM anti_nuke_incidents
         WHERE ${where.join(" AND ")}
         ORDER BY created_at DESC`,
        params
      );

      const escapeCsv = (value) => {
        const text = String(value ?? "");
        if (/[",\n]/.test(text)) {
          return `"${text.replace(/"/g, '""')}"`;
        }
        return text;
      };

      const header = ["id", "incident_type", "event_type", "actor_user_id", "initiated_by_user_id", "details", "created_at"];
      const lines = [header.join(",")];
      for (const row of incidents) {
        lines.push([
          row.id,
          row.incident_type,
          row.event_type || "",
          row.actor_user_id || "",
          row.initiated_by_user_id || "",
          row.details || "",
          row.created_at
        ].map(escapeCsv).join(","));
      }

      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="guild-${guildId}-anti-nuke-incidents-${stamp}.csv"`);
      return res.status(200).send(lines.join("\n"));
    } catch (e) {
      console.error("anti-nuke incidents csv export error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  app.post("/guild/:guildId/socials/default-channel", requireGuildAdmin, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const socialDefaultChannelId = String(req.body.social_default_channel_id || "").trim() || null;
      await updateGuildSettings(guildId, {
        social_default_channel_id: socialDefaultChannelId
      });
      return res.redirect(getModuleRedirect(guildId, 'socials'));
    } catch (e) {
      console.error("social default channel save error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  app.post("/guild/:guildId/social-links/add", requireGuildAdmin, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const platform = normalizePlatform(req.body.platform);
      const externalIdRaw = String(req.body.external_id || "").trim();
      const externalId = normalizeSocialExternalId(platform, externalIdRaw);
      const sourceUrl = inferSourceUrl(platform, externalId, String(req.body.source_url || "").trim()) || null;
      const label = String(req.body.label || "").trim() || inferDefaultLabel(platform, externalId);
      const channelId = String(req.body.channel_id || "").trim() || null;
      const createdBy = req.user?.id || null;

      if (!externalId) {
        return res.redirect(getModuleRedirect(guildId, 'socials'));
      }

      const insert = await run(
        `INSERT INTO social_links (guild_id, platform, external_id, source_url, label, channel_id, enabled, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
         ON CONFLICT (guild_id, platform, external_id)
         DO UPDATE SET source_url=EXCLUDED.source_url, label=EXCLUDED.label, channel_id=EXCLUDED.channel_id
         RETURNING id`,
        [guildId, platform, externalId, sourceUrl, label, channelId, createdBy, Date.now()]
      );

      const linkId = insert?.rows?.[0]?.id || null;
      if (linkId) {
        const events = getSupportedEventsForPlatform(platform);
        for (const eventType of events) {
          await run(
            `INSERT INTO social_link_rules (guild_id, link_id, event_type, enabled, message_template, created_at, updated_at)
             VALUES (?, ?, ?, 1, ?, ?, ?)
             ON CONFLICT (link_id, event_type)
             DO NOTHING`,
            [guildId, linkId, eventType, defaultTemplateForEvent(eventType), Date.now(), Date.now()]
          );
        }
      }

      return res.redirect(getModuleRedirect(guildId, 'socials'));
    } catch (e) {
      console.error("social-links add error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  app.post("/guild/:guildId/social-links/toggle", requireGuildAdmin, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const linkId = Number.parseInt(String(req.body.link_id || "0"), 10);
      const enabled = String(req.body.enabled || "0") === "1" ? 1 : 0;
      if (!Number.isInteger(linkId) || linkId <= 0) {
        return res.redirect(getModuleRedirect(guildId, 'socials'));
      }

      await run(
        `UPDATE social_links SET enabled=? WHERE guild_id=? AND id=?`,
        [enabled, guildId, linkId]
      );

      return res.redirect(getModuleRedirect(guildId, 'socials'));
    } catch (e) {
      console.error("social-links toggle error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  app.post("/guild/:guildId/social-links/delete", requireGuildAdmin, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const linkId = Number.parseInt(String(req.body.link_id || "0"), 10);
      if (!Number.isInteger(linkId) || linkId <= 0) {
        return res.redirect(getModuleRedirect(guildId, 'socials'));
      }

      await run(`DELETE FROM social_link_rules WHERE guild_id=? AND link_id=?`, [guildId, linkId]);
      await run(`DELETE FROM social_announcements WHERE guild_id=? AND link_id=?`, [guildId, linkId]);
      await run(`DELETE FROM social_links WHERE guild_id=? AND id=?`, [guildId, linkId]);

      return res.redirect(getModuleRedirect(guildId, 'socials'));
    } catch (e) {
      console.error("social-links delete error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  app.post("/guild/:guildId/social-rules/save", requireGuildAdmin, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const linkId = Number.parseInt(String(req.body.link_id || "0"), 10);
      const eventType = String(req.body.event_type || "post").trim().toLowerCase();
      const enabled = req.body.enabled === "on" ? 1 : 0;
      const channelId = String(req.body.channel_id || "").trim() || null;
      const roleId = String(req.body.role_id || "").trim() || null;
      const messageTemplateRaw = String(req.body.message_template || "").trim();
      const messageTemplate = messageTemplateRaw || defaultTemplateForEvent(eventType);

      if (!Number.isInteger(linkId) || linkId <= 0) {
        return res.redirect(getModuleRedirect(guildId, 'socials'));
      }

      await run(
        `INSERT INTO social_link_rules (guild_id, link_id, event_type, enabled, channel_id, role_id, message_template, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (link_id, event_type)
         DO UPDATE SET enabled=EXCLUDED.enabled, channel_id=EXCLUDED.channel_id, role_id=EXCLUDED.role_id, message_template=EXCLUDED.message_template, updated_at=EXCLUDED.updated_at`,
        [guildId, linkId, eventType, enabled, channelId, roleId, messageTemplate, Date.now(), Date.now()]
      );

      return res.redirect(getModuleRedirect(guildId, 'socials'));
    } catch (e) {
      console.error("social-rules save error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  app.post("/guild/:guildId/social-rules/test", requireGuildAdmin, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const linkId = Number.parseInt(String(req.body.link_id || "0"), 10);
      const eventType = String(req.body.event_type || "post").trim().toLowerCase();

      if (!Number.isInteger(linkId) || linkId <= 0) {
        return res.redirect(getModuleRedirect(guildId, 'socials'));
      }

      const link = await get(
        `SELECT id, guild_id, platform, external_id, label, channel_id
         FROM social_links
         WHERE guild_id=? AND id=?`,
        [guildId, linkId]
      );
      if (!link) {
        return res.redirect(getModuleRedirect(guildId, 'socials'));
      }

      const rule = await get(
        `SELECT event_type, enabled, channel_id, role_id, message_template
         FROM social_link_rules
         WHERE guild_id=? AND link_id=? AND event_type=?`,
        [guildId, linkId, eventType]
      );
      const settings = await getGuildSettings(guildId);
      const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) {
        return res.redirect(getModuleRedirect(guildId, 'socials'));
      }

      const channelId =
        (rule?.channel_id && String(rule.channel_id))
        || (link?.channel_id && String(link.channel_id))
        || (settings?.social_default_channel_id && String(settings.social_default_channel_id))
        || null;

      if (!channelId) {
        return res.redirect(getModuleRedirect(guildId, 'socials'));
      }

      const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
      if (!channel || !channel.isTextBased || !channel.isTextBased()) {
        return res.redirect(getModuleRedirect(guildId, 'socials'));
      }

      const roleMention = rule?.role_id ? `<@&${rule.role_id}>` : "";
      const platformLabel = SOCIAL_PLATFORM_OPTIONS.find((platform) => platform.key === normalizePlatform(link.platform))?.label || link.platform;
      const template = rule?.message_template || defaultTemplateForEvent(eventType);
      const eventLabel = SOCIAL_EVENT_LABELS[eventType] || eventType;

      const testMessage = String(template || "")
        .replaceAll("{platform}", platformLabel)
        .replaceAll("{handle}", link.label || link.external_id)
        .replaceAll("{title}", `[TEST] ${eventLabel} title`)
        .replaceAll("{url}", "https://example.com/test-social-event")
        .replaceAll("{event}", eventLabel)
        .replaceAll("{role}", roleMention || "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

      await channel.send({
        content: testMessage || `${roleMention} [TEST] ${eventLabel} notification`,
        allowedMentions: {
          parse: [],
          roles: rule?.role_id ? [rule.role_id] : []
        }
      }).catch(() => {});

      return res.redirect(getModuleRedirect(guildId, 'socials'));
    } catch (e) {
      console.error("social-rules test error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  app.post("/guild/:guildId/welcome-settings", requireGuildAdmin, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const welcomeEnabled = req.body.welcome_enabled === "on" ? 1 : 0;
      const welcomeChannelId = String(req.body.welcome_channel_id || "").trim() || null;
      const welcomeMessage = String(req.body.welcome_message || "Welcome {user} to {server}!").trim();
      const welcomeEmbed = req.body.welcome_embed === "on" ? 1 : 0;
      const welcomeEmbedColor = String(req.body.welcome_embed_color || "#7bc96f").trim();

      await run(`
        INSERT INTO welcome_goodbye_settings (guild_id, welcome_enabled, welcome_channel_id, welcome_message, welcome_embed, welcome_embed_color)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(guild_id) DO UPDATE SET
          welcome_enabled=excluded.welcome_enabled,
          welcome_channel_id=excluded.welcome_channel_id,
          welcome_message=excluded.welcome_message,
          welcome_embed=excluded.welcome_embed,
          welcome_embed_color=excluded.welcome_embed_color
      `, [guildId, welcomeEnabled, welcomeChannelId, welcomeMessage, welcomeEmbed, welcomeEmbedColor]);

      return res.redirect(getModuleRedirect(guildId, 'welcome'));
    } catch (e) {
      console.error("welcome-settings save error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  app.post("/guild/:guildId/goodbye-settings", requireGuildAdmin, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const goodbyeEnabled = req.body.goodbye_enabled === "on" ? 1 : 0;
      const goodbyeChannelId = String(req.body.goodbye_channel_id || "").trim() || null;
      const goodbyeMessage = String(req.body.goodbye_message || "Goodbye {user}!").trim();
      const goodbyeEmbed = req.body.goodbye_embed === "on" ? 1 : 0;
      const goodbyeEmbedColor = String(req.body.goodbye_embed_color || "#8b7355").trim();

      await run(`
        INSERT INTO welcome_goodbye_settings (guild_id, goodbye_enabled, goodbye_channel_id, goodbye_message, goodbye_embed, goodbye_embed_color)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(guild_id) DO UPDATE SET
          goodbye_enabled=excluded.goodbye_enabled,
          goodbye_channel_id=excluded.goodbye_channel_id,
          goodbye_message=excluded.goodbye_message,
          goodbye_embed=excluded.goodbye_embed,
          goodbye_embed_color=excluded.goodbye_embed_color
      `, [guildId, goodbyeEnabled, goodbyeChannelId, goodbyeMessage, goodbyeEmbed, goodbyeEmbedColor]);

      return res.redirect(getModuleRedirect(guildId, 'welcome'));
    } catch (e) {
      console.error("goodbye-settings save error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  app.post("/guild/:guildId/auto-roles/add", requireGuildAdmin, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const roleId = String(req.body.role_id || "").trim();

      if (!roleId) {
        return res.status(400).send("Role ID required.");
      }

      const existing = await get(`SELECT * FROM auto_roles WHERE guild_id=? AND role_id=?`, [guildId, roleId]);
      if (!existing) {
        await run(`INSERT INTO auto_roles (guild_id, role_id) VALUES (?, ?)`, [guildId, roleId]);
      }

      return res.redirect(getModuleRedirect(guildId, 'welcome'));
    } catch (e) {
      console.error("auto-roles add error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  app.post("/guild/:guildId/auto-roles/delete", requireGuildAdmin, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const roleId = String(req.body.role_id || "").trim();

      if (!roleId) {
        return res.status(400).send("Role ID required.");
      }

      await run(`DELETE FROM auto_roles WHERE guild_id=? AND role_id=?`, [guildId, roleId]);

      return res.redirect(getModuleRedirect(guildId, 'welcome'));
    } catch (e) {
      console.error("auto-roles delete error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  app.post("/guild/:guildId/automod-settings", requireGuildAdmin, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const allowedActions = new Set(["delete", "warn", "timeout"]);
      const spamEnabled = req.body.spam_enabled === "on" ? 1 : 0;
      const spamMessagesRaw = parseInt(req.body.spam_threshold || "5", 10);
      const spamMessages = Number.isInteger(spamMessagesRaw) ? Math.min(20, Math.max(2, spamMessagesRaw)) : 5;
      const spamActionRaw = String(req.body.spam_action || "warn").trim().toLowerCase();
      const spamAction = allowedActions.has(spamActionRaw) ? spamActionRaw : "warn";
      const invitesEnabled = req.body.invites_enabled === "on" ? 1 : 0;
      const invitesActionRaw = String(req.body.invites_action || "delete").trim().toLowerCase();
      const invitesAction = allowedActions.has(invitesActionRaw) ? invitesActionRaw : "delete";
      const invitesWhitelist = String(req.body.invites_whitelist || "").trim().slice(0, 500) || null;
      const linksEnabled = req.body.links_enabled === "on" ? 1 : 0;
      const linksActionRaw = String(req.body.links_action || "delete").trim().toLowerCase();
      const linksAction = allowedActions.has(linksActionRaw) ? linksActionRaw : "delete";
      const linksWhitelist = String(req.body.links_whitelist || "").trim().slice(0, 500) || null;
      const capsEnabled = req.body.caps_enabled === "on" ? 1 : 0;
      const capsPercentageRaw = parseInt(req.body.caps_threshold || "70", 10);
      const capsPercentage = Number.isInteger(capsPercentageRaw) ? Math.min(100, Math.max(50, capsPercentageRaw)) : 70;
      const capsActionRaw = String(req.body.caps_action || "delete").trim().toLowerCase();
      const capsAction = allowedActions.has(capsActionRaw) ? capsActionRaw : "delete";
      const mentionsEnabled = req.body.mentions_enabled === "on" ? 1 : 0;
      const mentionsMaxRaw = parseInt(req.body.mentions_threshold || "5", 10);
      const mentionsMax = Number.isInteger(mentionsMaxRaw) ? Math.min(20, Math.max(2, mentionsMaxRaw)) : 5;
      const mentionsActionRaw = String(req.body.mentions_action || "warn").trim().toLowerCase();
      const mentionsAction = allowedActions.has(mentionsActionRaw) ? mentionsActionRaw : "warn";
      const attachSpamEnabled = req.body.attachments_enabled === "on" ? 1 : 0;
      const attachSpamMaxRaw = parseInt(req.body.attachments_max || "1", 10);
      const attachSpamMax = Number.isInteger(attachSpamMaxRaw) ? Math.min(10, Math.max(1, attachSpamMaxRaw)) : 1;
      const attachSpamActionRaw = String(req.body.attachments_action || "warn").trim().toLowerCase();
      const attachSpamAction = allowedActions.has(attachSpamActionRaw) ? attachSpamActionRaw : "warn";

      await run(`
        INSERT INTO automod_settings (
          guild_id, spam_enabled, spam_messages, spam_action,
          invites_enabled, invites_action, invites_whitelist,
          links_enabled, links_action, links_whitelist,
          caps_enabled, caps_percentage, caps_action,
          mentions_enabled, mentions_max, mentions_action,
          attach_spam_enabled, attach_spam_max, attach_spam_action
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(guild_id) DO UPDATE SET
          spam_enabled=excluded.spam_enabled,
          spam_messages=excluded.spam_messages,
          spam_action=excluded.spam_action,
          invites_enabled=excluded.invites_enabled,
          invites_action=excluded.invites_action,
          invites_whitelist=excluded.invites_whitelist,
          links_enabled=excluded.links_enabled,
          links_action=excluded.links_action,
          links_whitelist=excluded.links_whitelist,
          caps_enabled=excluded.caps_enabled,
          caps_percentage=excluded.caps_percentage,
          caps_action=excluded.caps_action,
          mentions_enabled=excluded.mentions_enabled,
          mentions_max=excluded.mentions_max,
          mentions_action=excluded.mentions_action,
          attach_spam_enabled=excluded.attach_spam_enabled,
          attach_spam_max=excluded.attach_spam_max,
          attach_spam_action=excluded.attach_spam_action
      `, [
        guildId,
        spamEnabled,
        spamMessages,
        spamAction,
        invitesEnabled,
        invitesAction,
        invitesWhitelist,
        linksEnabled,
        linksAction,
        linksWhitelist,
        capsEnabled,
        capsPercentage,
        capsAction,
        mentionsEnabled,
        mentionsMax,
        mentionsAction,
        attachSpamEnabled,
        attachSpamMax,
        attachSpamAction
      ]);

      return res.redirect(getModuleRedirect(guildId, 'moderation'));
    } catch (e) {
      console.error("automod-settings save error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  app.post("/guild/:guildId/suggestions-settings", requireGuildAdmin, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const enabled = req.body.suggestions_enabled === "on" ? 1 : 0;
      const channelId = String(req.body.channel_id || "").trim() || null;
      const reviewChannelId = String(req.body.review_channel_id || "").trim() || null;
      const requireReview = req.body.require_review === "on" ? 1 : 0;

      await run(`
        INSERT INTO suggestion_settings (guild_id, enabled, channel_id, review_channel_id, require_review)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(guild_id) DO UPDATE SET
          enabled=excluded.enabled,
          channel_id=excluded.channel_id,
          review_channel_id=excluded.review_channel_id,
          require_review=excluded.require_review
      `, [guildId, enabled, channelId, reviewChannelId, requireReview]);

      return res.redirect(getModuleRedirect(guildId, 'moderation'));
    } catch (e) {
      console.error("suggestions-settings save error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  app.post("/guild/:guildId/suggestions/update", requireGuildAdmin, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const suggestionId = parseInt(req.body.suggestion_id, 10);
      const statusRaw = String(req.body.status || "pending").trim().toLowerCase();
      const status = ["pending", "under_review", "approved", "denied"].includes(statusRaw) ? statusRaw : "pending";
      const staffResponse = String(req.body.staff_response || "").trim().slice(0, 300) || null;

      if (!suggestionId) {
        return res.status(400).send("Suggestion ID required.");
      }

      const suggestion = await get(`SELECT * FROM suggestions WHERE id=? AND guild_id=?`, [suggestionId, guildId]);
      if (!suggestion) {
        return res.status(404).send("Suggestion not found.");
      }

      const settings = await get(`SELECT * FROM suggestion_settings WHERE guild_id=?`, [guildId]);

      // Update status/note in database first.
      await run(
        `UPDATE suggestions
         SET status=?, staff_response=?
         WHERE id=? AND guild_id=?`,
        [status, staffResponse, suggestionId, guildId]
      );

      const guild = await client.guilds.fetch(guildId).catch(() => null);
      if (guild && settings?.channel_id && status === "approved" && !suggestion.message_id) {
        const publishChannel = guild.channels.cache.get(settings.channel_id) || await guild.channels.fetch(settings.channel_id).catch(() => null);
        if (publishChannel && publishChannel.isTextBased()) {
          const statusText = "✅ Approved";
          const embed = new EmbedBuilder()
            .setColor("#7bc96f")
            .setAuthor({ name: suggestion.user_id, iconURL: guild.iconURL() || undefined })
            .setTitle(`💡 Suggestion #${suggestion.id}`)
            .setDescription(suggestion.content)
            .addFields({ name: "Status", value: statusText, inline: true })
            .setFooter({ text: `👍 ${suggestion.upvotes || 0} | 👎 ${suggestion.downvotes || 0}` })
            .setTimestamp(Number(suggestion.created_at || Date.now()));

          if (staffResponse) {
            embed.addFields({ name: "Staff Response", value: staffResponse, inline: false });
          }

          const publishedMsg = await publishChannel.send({ embeds: [embed] }).catch(() => null);
          if (publishedMsg) {
            await publishedMsg.react("👍").catch(() => {});
            await publishedMsg.react("👎").catch(() => {});
            await run(
              `UPDATE suggestions
               SET message_id=?, published_message_id=?, upvotes=0, downvotes=0
               WHERE id=? AND guild_id=?`,
              [publishedMsg.id, publishedMsg.id, suggestionId, guildId]
            ).catch(() => {});
          }
        }
      }

      // Update review queue message (if any)
      if (guild && suggestion.review_message_id) {
        const reviewChannelId = settings?.review_channel_id || settings?.channel_id || null;
        const reviewChannel = reviewChannelId
          ? (guild.channels.cache.get(reviewChannelId) || await guild.channels.fetch(reviewChannelId).catch(() => null))
          : null;
        if (reviewChannel && reviewChannel.isTextBased()) {
          const reviewMsg = await reviewChannel.messages.fetch(suggestion.review_message_id).catch(() => null);
          if (reviewMsg && reviewMsg.embeds.length > 0) {
            const statusText = status === "approved"
              ? "✅ Approved"
              : status === "denied"
                ? "❌ Denied"
                : status === "under_review"
                  ? "🕵️ Under Review"
                  : "🟡 Pending";
            const statusColor = status === "approved"
              ? "#7bc96f"
              : status === "denied"
                ? "#ff4444"
                : status === "under_review"
                  ? "#5bc0de"
                  : "#ffaa00";
            const embed = EmbedBuilder.from(reviewMsg.embeds[0]);
            embed.setColor(statusColor);
            embed.data.fields = embed.data.fields || [];
            const statusFieldIndex = embed.data.fields.findIndex((f) => f.name === "Status");
            if (statusFieldIndex >= 0) {
              embed.data.fields[statusFieldIndex].value = statusText;
            } else {
              embed.addFields({ name: "Status", value: statusText, inline: true });
            }
            const responseFieldIndex = embed.data.fields.findIndex((f) => f.name === "Staff Response");
            if (staffResponse) {
              if (responseFieldIndex >= 0) embed.data.fields[responseFieldIndex].value = staffResponse;
              else embed.addFields({ name: "Staff Response", value: staffResponse, inline: false });
            } else if (responseFieldIndex >= 0) {
              embed.data.fields.splice(responseFieldIndex, 1);
            }
            await reviewMsg.edit({ embeds: [embed] }).catch(() => {});
          }
        }
      }

      // Update published suggestion message (if already published)
      const refreshed = await get(`SELECT * FROM suggestions WHERE id=? AND guild_id=?`, [suggestionId, guildId]);
      if (guild && settings?.channel_id && refreshed?.message_id) {
        const publishChannel = guild.channels.cache.get(settings.channel_id) || await guild.channels.fetch(settings.channel_id).catch(() => null);
        if (publishChannel && publishChannel.isTextBased()) {
          const message = await publishChannel.messages.fetch(refreshed.message_id).catch(() => null);
          if (message && message.embeds.length > 0) {
            const statusText = status === "approved"
              ? "✅ Approved"
              : status === "denied"
                ? "❌ Denied"
                : status === "under_review"
                  ? "🕵️ Under Review"
                  : "🟡 Pending";
            const statusColor = status === "approved"
              ? "#7bc96f"
              : status === "denied"
                ? "#ff4444"
                : status === "under_review"
                  ? "#5bc0de"
                  : "#ffaa00";
            const embed = EmbedBuilder.from(message.embeds[0]);
            embed.setColor(statusColor);
            embed.data.fields = embed.data.fields || [];
            const statusFieldIndex = embed.data.fields.findIndex((f) => f.name === "Status");
            if (statusFieldIndex >= 0) embed.data.fields[statusFieldIndex].value = statusText;
            else embed.addFields({ name: "Status", value: statusText, inline: true });
            const responseFieldIndex = embed.data.fields.findIndex((f) => f.name === "Staff Response");
            if (staffResponse) {
              if (responseFieldIndex >= 0) embed.data.fields[responseFieldIndex].value = staffResponse;
              else embed.addFields({ name: "Staff Response", value: staffResponse, inline: false });
            } else if (responseFieldIndex >= 0) {
              embed.data.fields.splice(responseFieldIndex, 1);
            }
            await message.edit({ embeds: [embed] }).catch(() => {});
          }
        }
      }

      return res.redirect(getModuleRedirect(guildId, 'moderation'));
    } catch (e) {
      console.error("suggestions update error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  app.post("/guild/:guildId/starboard-settings", requireGuildAdmin, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const enabled = req.body.enabled === "on" ? 1 : 0;
      const channelId = String(req.body.channel_id || "").trim() || null;
      const emoji = String(req.body.emoji || "⭐").trim();
      const threshold = parseInt(req.body.threshold || "5", 10);
      const selfStar = req.body.self_star === "on" ? 1 : 0;

      await run(`
        INSERT INTO starboard_settings (guild_id, enabled, channel_id, emoji, threshold, self_star)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(guild_id) DO UPDATE SET
          enabled=excluded.enabled,
          channel_id=excluded.channel_id,
          emoji=excluded.emoji,
          threshold=excluded.threshold,
          self_star=excluded.self_star
      `, [guildId, enabled, channelId, emoji, threshold, selfStar]);

      return res.redirect(getModuleRedirect(guildId, 'overview'));
    } catch (e) {
      console.error("starboard-settings save error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  // ─────────────────────────────────────────────
  // Economy Settings
  // ─────────────────────────────────────────────
  app.post("/guild/:guildId/economy-settings", requireGuildAdmin, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const enabled = req.body.enabled === "on" ? 1 : 0;
      const currencyName = String(req.body.currency_name || "coins").trim();
      const currencySymbol = String(req.body.currency_symbol || "🪙").trim();
      const dailyAmount = parseInt(req.body.daily_amount || "100", 10);
      const weeklyAmount = parseInt(req.body.weekly_amount || "500", 10);
      const economyPrefix = String(req.body.economy_prefix || "$").trim();
      const dailyStreakBonus = parseInt(req.body.daily_streak_bonus || "10", 10);
      const robEnabled = req.body.rob_enabled === "on" ? 1 : 0;
      const robCooldown = parseInt(req.body.rob_cooldown || "3600", 10);
      const economyGuide = String(req.body.economy_guide || "").trim();

      const existing = await get(`SELECT * FROM economy_settings WHERE guild_id=?`, [guildId]);

      await run(`
        INSERT INTO economy_settings (guild_id, enabled, currency_name, currency_symbol, daily_amount, weekly_amount, economy_prefix, daily_streak_bonus, rob_enabled, rob_cooldown, economy_guide)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(guild_id) DO UPDATE SET
          enabled=excluded.enabled,
          currency_name=excluded.currency_name,
          currency_symbol=excluded.currency_symbol,
          daily_amount=excluded.daily_amount,
          weekly_amount=excluded.weekly_amount,
          economy_prefix=excluded.economy_prefix,
          daily_streak_bonus=excluded.daily_streak_bonus,
          rob_enabled=excluded.rob_enabled,
          rob_cooldown=excluded.rob_cooldown,
          economy_guide=excluded.economy_guide
      `, [guildId, enabled, currencyName, currencySymbol, dailyAmount, weeklyAmount, economyPrefix, dailyStreakBonus, robEnabled, robCooldown, economyGuide]);

      // Add default jobs and shop items if this is the first time enabling economy
      if (!existing && enabled) {
        // Add default jobs
        await run(`INSERT INTO economy_jobs (guild_id, name, min_pay, max_pay, required_shifts, weekly_shifts_required) VALUES (?, ?, ?, ?, ?, ?)`,
          [guildId, "Street Cleaner", 50, 100, 0, 3]);
        await run(`INSERT INTO economy_jobs (guild_id, name, min_pay, max_pay, required_shifts, weekly_shifts_required) VALUES (?, ?, ?, ?, ?, ?)`,
          [guildId, "Cashier", 100, 200, 10, 4]);
        await run(`INSERT INTO economy_jobs (guild_id, name, min_pay, max_pay, required_shifts, weekly_shifts_required) VALUES (?, ?, ?, ?, ?, ?)`,
          [guildId, "Manager", 200, 400, 30, 5]);
        await run(`INSERT INTO economy_jobs (guild_id, name, min_pay, max_pay, required_shifts, weekly_shifts_required) VALUES (?, ?, ?, ?, ?, ?)`,
          [guildId, "Developer", 400, 800, 60, 5]);

        // Add default shop items
        await run(`INSERT INTO economy_shop_items (guild_id, item_id, name, description, price, item_type) VALUES (?, ?, ?, ?, ?, ?)`,
          [guildId, "padlock", "🔒 Padlock", "Protects your wallet from robberies (single use)", 250, "consumable"]);
        await run(`INSERT INTO economy_shop_items (guild_id, item_id, name, description, price, item_type) VALUES (?, ?, ?, ?, ?, ?)`,
          [guildId, "trophy", "🏆 Trophy", "Show off your wealth with this collectible", 1000, "collectible"]);
      }

      return res.redirect(getModuleRedirect(guildId, 'economy'));
    } catch (e) {
      console.error("economy-settings save error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  // ─────────────────────────────────────────────
  // Birthday Settings
  // ─────────────────────────────────────────────
  app.post("/guild/:guildId/birthday-settings", requireGuildAdmin, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const enabled = req.body.enabled === "on" ? 1 : 0;
      const channelId = String(req.body.channel_id || "").trim() || null;
      const message = String(req.body.message || "Happy birthday {user}! 🎂🎉").trim();
      const roleId = String(req.body.role_id || "").trim() || null;

      await run(`
        INSERT INTO birthday_settings (guild_id, enabled, channel_id, message, role_id)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(guild_id) DO UPDATE SET
          enabled=excluded.enabled,
          channel_id=excluded.channel_id,
          message=excluded.message,
          role_id=excluded.role_id
      `, [guildId, enabled, channelId, message, roleId]);

      return res.redirect(getModuleRedirect(guildId, 'birthdays'));
    } catch (e) {
      console.error("birthday-settings save error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  // ─────────────────────────────────────────────
  // Custom Commands
  // ─────────────────────────────────────────────
  app.post("/guild/:guildId/custom-commands/create", requireGuildAdmin, upload.fields([{ name: 'uploaded_gifs_0', maxCount: 10 }, { name: 'uploaded_gifs_1', maxCount: 10 }, { name: 'uploaded_gifs_2', maxCount: 10 }, { name: 'uploaded_gifs_3', maxCount: 10 }, { name: 'uploaded_gifs_4', maxCount: 10 }]), async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const commandName = String(req.body.command_name || "").trim().toLowerCase();
      const allowTarget = req.body.allow_target === 'true';
      const usageLimit = req.body.usage_limit ? parseInt(req.body.usage_limit, 10) : null;
      
      if (!commandName) {
        return res.status(400).send("Command name is required.");
      }

      // Collect all responses
      const responses = [];
      let index = 0;
      while (req.body[`response_text_${index}`] !== undefined) {
        const text = String(req.body[`response_text_${index}`] || "").trim();
        const gifsRaw = String(req.body[`gifs_${index}`] || "").trim();
        const gifs = gifsRaw ? gifsRaw.split("\n").map(url => url.trim()).filter(Boolean) : [];
        
        // Handle uploaded GIFs
        const uploadedGifs = [];
        const files = req.files && req.files[`uploaded_gifs_${index}`];
        if (files && Array.isArray(files)) {
          for (const file of files) {
            if (file.mimetype === 'image/gif') {
              // Convert to base64 for storage
              const fs = require('fs');
              const base64 = fs.readFileSync(file.path).toString('base64');
              uploadedGifs.push(`data:image/gif;base64,${base64}`);
              // Clean up temp file
              fs.unlinkSync(file.path);
            }
          }
        }
        
        if (text) {
          responses.push({ text, gifs, uploaded_gifs: uploadedGifs });
        }
        index++;
      }

      if (responses.length === 0) {
        return res.status(400).send("At least one response is required.");
      }

      await run(`
        INSERT INTO custom_commands (guild_id, command_name, responses, allow_target, usage_limit, uploaded_gifs, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(guild_id, command_name) DO UPDATE SET
          responses=excluded.responses,
          allow_target=excluded.allow_target,
          usage_limit=excluded.usage_limit,
          uploaded_gifs=excluded.uploaded_gifs
      `, [guildId, commandName, JSON.stringify(responses), allowTarget, usageLimit, JSON.stringify(responses.map(r => r.uploaded_gifs || [])), req.user?.id || "unknown"]);

      return res.redirect(getModuleRedirect(guildId, 'customcommands'));
    } catch (e) {
      console.error("custom-commands create error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  app.post("/guild/:guildId/custom-commands/delete/:id", requireGuildAdmin, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const id = parseInt(req.params.id, 10);

      await run(`DELETE FROM custom_commands WHERE guild_id=? AND id=?`, [guildId, id]);

      return res.redirect(getModuleRedirect(guildId, 'customcommands'));
    } catch (e) {
      console.error("custom-commands delete error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  // ─────────────────────────────────────────────
  // Auto Replies
  // ─────────────────────────────────────────────
  app.post("/guild/:guildId/auto-replies/create", requireGuildAdmin, upload.fields([{ name: 'uploaded_gifs_0', maxCount: 10 }, { name: 'uploaded_gifs_1', maxCount: 10 }, { name: 'uploaded_gifs_2', maxCount: 10 }, { name: 'uploaded_gifs_3', maxCount: 10 }, { name: 'uploaded_gifs_4', maxCount: 10 }]), async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const triggerMessage = String(req.body.trigger_message || "").trim().toLowerCase();
      const responseType = String(req.body.response_type || "").trim();
      
      if (!triggerMessage || !['reply', 'react'].includes(responseType)) {
        return res.status(400).send("Trigger message and valid response type are required.");
      }

      let responses;
      let uploadedGifs = [];
      if (responseType === 'reply') {
        // Collect all responses for replies
        const replyResponses = [];
        let index = 0;
        while (req.body[`response_text_${index}`] !== undefined) {
          const text = String(req.body[`response_text_${index}`] || "").trim();
          const gifsRaw = String(req.body[`gifs_${index}`] || "").trim();
          const gifs = gifsRaw ? gifsRaw.split("\n").map(url => url.trim()).filter(Boolean) : [];
          
          // Handle uploaded GIFs
          const responseUploadedGifs = [];
          const files = req.files && req.files[`uploaded_gifs_${index}`];
          if (files && Array.isArray(files)) {
            for (const file of files) {
              if (file.mimetype === 'image/gif') {
                // Convert to base64 for storage
                const fs = require('fs');
                const base64 = fs.readFileSync(file.path).toString('base64');
                responseUploadedGifs.push(`data:image/gif;base64,${base64}`);
                // Clean up temp file
                fs.unlinkSync(file.path);
              }
            }
          }
          
          if (text) {
            replyResponses.push({ text, gifs, uploaded_gifs: responseUploadedGifs });
            uploadedGifs.push(...responseUploadedGifs);
          }
          index++;
        }

        if (replyResponses.length === 0) {
          return res.status(400).send("At least one response is required for reply type.");
        }
        responses = JSON.stringify(replyResponses);
      } else if (responseType === 'react') {
        const emoji = String(req.body.reaction_emoji || "").trim();
        if (!emoji) {
          return res.status(400).send("Reaction emoji is required for react type.");
        }
        responses = emoji;
      }

      await run(`
        INSERT INTO auto_replies (guild_id, trigger_message, response_type, responses, uploaded_gifs, created_by)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [guildId, triggerMessage, responseType, responses, JSON.stringify(uploadedGifs), req.user?.id || "unknown"]);

      return res.redirect(getModuleRedirect(guildId, 'autoreplies'));
    } catch (e) {
      console.error("auto-replies create error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  app.post("/guild/:guildId/auto-replies/toggle/:id", requireGuildAdmin, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const id = parseInt(req.params.id, 10);

      // Get current status and toggle it
      const current = await get(`SELECT enabled FROM auto_replies WHERE guild_id=? AND id=?`, [guildId, id]);
      if (!current) {
        return res.status(404).send("Auto reply not found.");
      }

      const newStatus = current.enabled ? 0 : 1;
      await run(`UPDATE auto_replies SET enabled=? WHERE guild_id=? AND id=?`, [newStatus, guildId, id]);

      return res.redirect(getModuleRedirect(guildId, 'autoreplies'));
    } catch (e) {
      console.error("auto-replies toggle error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  app.post("/guild/:guildId/auto-replies/delete/:id", requireGuildAdmin, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const id = parseInt(req.params.id, 10);

      await run(`DELETE FROM auto_replies WHERE guild_id=? AND id=?`, [guildId, id]);

      return res.redirect(getModuleRedirect(guildId, 'autoreplies'));
    } catch (e) {
      console.error("auto-replies delete error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  app.post("/guild/:guildId/logging-exclusions/add", requireGuildModerator, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const channelId = String(req.body.channel_id || "").trim();
      const categoryId = String(req.body.category_id || "").trim();

      if (channelId) {
        await addLoggingExclusion(guildId, channelId, "channel");
      }
      if (categoryId) {
        await addLoggingExclusion(guildId, categoryId, "category");
      }

      return res.redirect(`/guild/${guildId}`);
    } catch (e) {
      console.error("logging-exclusions add error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  app.post("/guild/:guildId/logging-exclusions/delete", requireGuildModerator, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const targetId = String(req.body.target_id || "").trim();
      if (!targetId) return res.status(400).send("Target ID required.");
      await removeLoggingExclusion(guildId, targetId);
      return res.redirect(getModuleRedirect(guildId, 'logging'));
    } catch (e) {
      console.error("logging-exclusions delete error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  app.post("/guild/:guildId/logging-events", requireGuildModerator, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      for (const def of LOG_EVENT_DEFS) {
        const enabled = req.body[`enabled_${def.key}`] === "on";
        const channelId = String(req.body[`channel_${def.key}`] || "").trim() || null;
        await upsertLoggingEventConfig(guildId, def.key, enabled, channelId);
      }
      return res.redirect(getModuleRedirect(guildId, 'logging'));
    } catch (e) {
      console.error("logging-events save error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  app.post("/guild/:guildId/logging-actors/add", requireGuildModerator, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const userId = String(req.body.user_id || "").trim();
      const roleId = String(req.body.role_id || "").trim();
      if (userId) await addLoggingActorExclusion(guildId, userId, "user");
      if (roleId) await addLoggingActorExclusion(guildId, roleId, "role");
      return res.redirect(getModuleRedirect(guildId, 'logging'));
    } catch (e) {
      console.error("logging-actors add error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  app.post("/guild/:guildId/logging-actors/delete", requireGuildModerator, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const targetId = String(req.body.target_id || "").trim();
      if (!targetId) return res.status(400).send("Target ID required.");
      await removeLoggingActorExclusion(guildId, targetId);
      return res.redirect(getModuleRedirect(guildId, 'logging'));
    } catch (e) {
      console.error("logging-actors delete error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  app.post("/guild/:guildId/reaction-roles/add", requireGuildAdmin, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const channelId = String(req.body.channel_id || "").trim();
      const messageId = String(req.body.message_id || "").trim();
      const emojiKey = normalizeEmojiKey(String(req.body.emoji_key || "").trim());
      const roleId = String(req.body.role_id || "").trim();
      const mode = String(req.body.mode || "toggle").trim();

      if (!channelId || !messageId || !emojiKey || !roleId) {
        return res.status(400).send("Channel, message ID, emoji, and role are required.");
      }

      await upsertReactionRoleBinding(guildId, channelId, messageId, emojiKey, roleId, mode);
      return res.redirect(getModuleRedirect(guildId, 'reactionroles'));
    } catch (e) {
      console.error("reaction-roles add error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  app.post("/guild/:guildId/reaction-roles/delete", requireGuildAdmin, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const messageId = String(req.body.message_id || "").trim();
      const emojiKey = normalizeEmojiKey(String(req.body.emoji_key || "").trim());
      const roleId = String(req.body.role_id || "").trim() || null;
      if (!messageId || !emojiKey) return res.status(400).send("Message ID and emoji are required.");

      await removeReactionRoleBinding(guildId, messageId, emojiKey, roleId);
      return res.redirect(getModuleRedirect(guildId, 'reactionroles'));
    } catch (e) {
      console.error("reaction-roles delete error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  app.post("/guild/:guildId/tickets/settings", requireGuildAdmin, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const enabled = req.body.enabled === "on";
      const panelChannelId = String(req.body.panel_channel_id || "").trim() || null;
      const categoryId = String(req.body.category_id || "").trim() || null;
      const supportRoleId = String(req.body.support_role_id || "").trim() || null;
      const ticketPrefix = String(req.body.ticket_prefix || "ticket").trim() || "ticket";
      const ticketLogChannelId = String(req.body.ticket_log_channel_id || "").trim() || null;
      const ticketTranscriptChannelId = String(req.body.ticket_transcript_channel_id || "").trim() || null;
      const saveTranscript = req.body.save_transcript === "on";
      const deleteOnClose = req.body.delete_on_close === "on";
      const slaFirstResponseMinutes = Math.max(0, Number.parseInt(String(req.body.sla_first_response_minutes || "0"), 10) || 0);
      const slaEscalationMinutes = Math.max(0, Number.parseInt(String(req.body.sla_escalation_minutes || "0"), 10) || 0);
      const slaEscalationRoleId = String(req.body.sla_escalation_role_id || "").trim() || null;

      await upsertTicketSettings(guildId, {
        enabled,
        panel_channel_id: panelChannelId,
        category_id: categoryId,
        support_role_id: supportRoleId,
        ticket_prefix: ticketPrefix,
        ticket_log_channel_id: ticketLogChannelId,
        ticket_transcript_channel_id: ticketTranscriptChannelId,
        save_transcript: saveTranscript,
        delete_on_close: deleteOnClose,
        sla_first_response_minutes: slaFirstResponseMinutes,
        sla_escalation_minutes: slaEscalationMinutes,
        sla_escalation_role_id: slaEscalationRoleId
      });

      return res.redirect(getModuleRedirect(guildId, 'tickets'));
    } catch (e) {
      console.error("tickets settings save error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  app.post("/guild/:guildId/tickets/panel", requireGuildAdmin, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) return res.status(404).send("Guild not found.");

      const result = await sendTicketPanel(guild);
      if (!result.ok) return res.status(400).send(result.reason || "Could not send ticket panel.");

      return res.redirect(getModuleRedirect(guildId, 'tickets'));
    } catch (e) {
      console.error("tickets panel send error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  app.post("/guild/:guildId/tickets/close", requireGuildAdmin, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const channelId = String(req.body.channel_id || "").trim();
      if (!channelId) return res.status(400).send("Channel ID required.");

      const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) return res.status(404).send("Guild not found.");

      const result = await closeTicketChannel(guild, channelId, req.user?.id || null);
      if (!result.ok) return res.status(400).send(result.reason || "Could not close ticket.");

      return res.redirect(getModuleRedirect(guildId, 'tickets'));
    } catch (e) {
      console.error("tickets close error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  app.get("/guild/:guildId/tickets/open/export", requireGuildAdmin, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const format = String(req.query.format || "json").trim().toLowerCase() === "csv" ? "csv" : "json";
      const rows = await getOpenTickets(guildId);
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");

      const payload = rows.map((t) => ({
        channel_id: t.channel_id || null,
        opener_id: t.opener_id || null,
        status: t.status || "open",
        created_at: Number(t.created_at || 0) || null,
        last_activity_at: Number(t.last_activity_at || 0) || null,
        sla_reminder_sent_at: Number(t.sla_reminder_sent_at || 0) || null,
        sla_escalated_at: Number(t.sla_escalated_at || 0) || null
      }));

      if (format === "json") {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="guild-${guildId}-open-tickets-${stamp}.json"`);
        return res.status(200).send(JSON.stringify({
          guild_id: guildId,
          exported_at: Date.now(),
          count: payload.length,
          tickets: payload
        }, null, 2));
      }

      const escapeCsv = (value) => {
        if (value === null || value === undefined) return "";
        const s = String(value);
        if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
        return s;
      };

      const lines = [
        ["channel_id", "opener_id", "status", "created_at", "last_activity_at", "sla_reminder_sent_at", "sla_escalated_at"].join(",")
      ];
      for (const row of payload) {
        lines.push([
          row.channel_id,
          row.opener_id,
          row.status,
          row.created_at,
          row.last_activity_at,
          row.sla_reminder_sent_at,
          row.sla_escalated_at
        ].map(escapeCsv).join(","));
      }

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="guild-${guildId}-open-tickets-${stamp}.csv"`);
      return res.status(200).send(lines.join("\n"));
    } catch (e) {
      console.error("tickets open export error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  app.get("/guild/:guildId/config/export", requireGuildAdmin, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const backup = await buildGuildConfigBackup(guildId);
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="guild-${guildId}-config-backup-${stamp}.json"`);
      return res.status(200).send(JSON.stringify(backup, null, 2));
    } catch (e) {
      console.error("config export error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  app.post("/guild/:guildId/config/import", requireGuildAdmin, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const confirmReplace = req.body.confirm_replace === "on";
      if (!confirmReplace) return res.status(400).send("You must confirm replacement before importing.");

      const rawJson = String(req.body.backup_json || "").trim();
      if (!rawJson) return res.status(400).send("Backup JSON is required.");

      let parsed;
      try {
        parsed = JSON.parse(rawJson);
      } catch {
        return res.status(400).send("Invalid JSON payload.");
      }

      await importGuildConfigBackup(guildId, parsed);
      return res.redirect(getModuleRedirect(guildId, "overview"));
    } catch (e) {
      console.error("config import error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  // ─────────────────────────────────────────────
  // XP manager (add/set)
  // ─────────────────────────────────────────────
  app.post("/guild/:guildId/xp/manage", requireGuildAdmin, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const userId = String(req.body.user_id || "").trim();
      const action = String(req.body.action || "").trim().toLowerCase();
      const amount = Number.parseInt(String(req.body.amount || ""), 10);

      if (!/^\d{15,21}$/.test(userId)) return res.status(400).send("Invalid user ID.");
      if (!["add", "set"].includes(action)) return res.status(400).send("Invalid action.");
      if (!Number.isFinite(amount)) return res.status(400).send("Amount must be a number.");

      await run(
        `INSERT INTO user_xp
         (guild_id, user_id, xp, level, last_message_xp_at, last_reaction_xp_at)
         VALUES (?, ?, 0, 0, 0, 0)
         ON CONFLICT (guild_id, user_id) DO NOTHING`,
        [guildId, userId]
      );

      const row = await get(
        `SELECT xp FROM user_xp WHERE guild_id=? AND user_id=?`,
        [guildId, userId]
      );

      const currentXp = Number(row?.xp || 0);
      const newXp = action === "set" ? Math.max(0, amount) : Math.max(0, currentXp + amount);
      const newLevel = levelFromXp(newXp);

      await run(
        `UPDATE user_xp SET xp=?, level=? WHERE guild_id=? AND user_id=?`,
        [newXp, newLevel, guildId, userId]
      );

      return res.redirect(getModuleRedirect(guildId, 'xp'));
    } catch (e) {
      console.error("xp manage error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  // ─────────────────────────────────────────────
  // Warning management
  // ─────────────────────────────────────────────
  app.post("/guild/:guildId/warnings/delete", requireGuildModerator, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const warningId = Number.parseInt(String(req.body.warning_id || ""), 10);
      if (!Number.isFinite(warningId)) return res.status(400).send("Invalid warning ID.");

      await run(`DELETE FROM mod_warnings WHERE guild_id=? AND id=?`, [guildId, warningId]);
      return res.redirect(getModuleRedirect(guildId, 'moderation'));
    } catch (e) {
      console.error("warnings delete error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  app.post("/guild/:guildId/warnings/clear-user", requireGuildModerator, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const userId = String(req.body.user_id || "").trim();
      if (!/^\d{15,21}$/.test(userId)) return res.status(400).send("Invalid user ID.");

      await run(`DELETE FROM mod_warnings WHERE guild_id=? AND user_id=?`, [guildId, userId]);
      return res.redirect(getModuleRedirect(guildId, 'moderation'));
    } catch (e) {
      console.error("warnings clear-user error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  // ─────────────────────────────────────────────
  // Claim-all lock toggle
  // ─────────────────────────────────────────────
  app.post("/guild/:guildId/claim-lock", requireGuildAdmin, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const lockValue = Number.parseInt(String(req.body.claim_all_done || "0"), 10) === 1 ? 1 : 0;
      await run(
        `INSERT INTO guild_settings (guild_id, claim_all_done)
         VALUES (?, ?)
         ON CONFLICT (guild_id) DO UPDATE SET claim_all_done=EXCLUDED.claim_all_done`,
        [guildId, lockValue]
      );
      return res.redirect(getModuleRedirect(guildId, 'voice'));
    } catch (e) {
      console.error("claim-lock save error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  // ─────────────────────────────────────────────
  // Private room record cleanup
  // ─────────────────────────────────────────────
  app.post("/guild/:guildId/private-rooms/delete", requireGuildAdmin, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const voiceChannelId = String(req.body.voice_channel_id || "").trim();
      if (!voiceChannelId) return res.status(400).send("Voice channel ID required.");

      await run(
        `DELETE FROM private_voice_rooms WHERE guild_id=? AND voice_channel_id=?`,
        [guildId, voiceChannelId]
      );
      return res.redirect(getModuleRedirect(guildId, 'voice'));
    } catch (e) {
      console.error("private room delete error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  // ─────────────────────────────────────────────
  // Save XP settings
  // ─────────────────────────────────────────────
  app.post("/guild/:guildId/settings", requireGuildAdmin, async (req, res) => {
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
      return res.redirect(getModuleRedirect(guildId, 'xp'));
    } catch (e) {
      console.error("settings save error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  // ─────────────────────────────────────────────
  // Save level-up settings (channel + message)
  // ─────────────────────────────────────────────
  app.post("/guild/:guildId/levelup-settings", requireGuildAdmin, async (req, res) => {
    try {
      const guildId = req.params.guildId;

      const level_up_channel_id = String(req.body.level_up_channel_id || "").trim();
      const level_up_message = String(req.body.level_up_message || "").trim();

      await updateGuildSettings(guildId, {
        level_up_channel_id: level_up_channel_id || null,
        level_up_message
      });

      return res.redirect(getModuleRedirect(guildId, 'xp'));
    } catch (e) {
      console.error("levelup-settings error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  // ─────────────────────────────────────────────
  // Test level-up message (decoy, no XP changes)
  // ─────────────────────────────────────────────
  app.post("/guild/:guildId/test-levelup", requireGuildAdmin, async (req, res) => {
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

      return res.redirect(getModuleRedirect(guildId, 'xp'));
    } catch (e) {
      console.error("test-levelup error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  // ─────────────────────────────────────────────
  // Level roles
  // ─────────────────────────────────────────────
  app.post("/guild/:guildId/level-roles", requireGuildAdmin, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const level = parseInt(req.body.level, 10);
      const roleId = String(req.body.role_id || "").trim();

      if (!Number.isInteger(level) || level < 0) return res.status(400).send("Invalid level.");
      if (!roleId) return res.status(400).send("Role ID required.");

      await setLevelRole(guildId, level, roleId);
      return res.redirect(getModuleRedirect(guildId, 'xp'));
    } catch (e) {
      console.error("level-roles save error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  app.post("/guild/:guildId/level-roles/delete", requireGuildAdmin, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const level = parseInt(req.body.level, 10);
      if (!Number.isInteger(level)) return res.status(400).send("Invalid level.");

      await deleteLevelRole(guildId, level);
      return res.redirect(getModuleRedirect(guildId, 'xp'));
    } catch (e) {
      console.error("level-roles delete error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  // Ignored channels
  // ─────────────────────────────────────────────
  app.post("/guild/:guildId/ignored-channels", requireGuildAdmin, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const manualChannelId = String(req.body.channel_id || "").trim();
      const selectedTextChannelId = String(req.body.text_channel_id || "").trim();
      const selectedVoiceChannelId = String(req.body.voice_channel_id || "").trim();
      const channelType = String(req.body.channel_type || "").trim();

      let channelId = manualChannelId;
      if (!channelId && channelType === "text") channelId = selectedTextChannelId;
      if (!channelId && channelType === "voice") channelId = selectedVoiceChannelId;

      if (!channelId) return res.status(400).send("Channel ID required.");
      if (!["text", "voice"].includes(channelType)) return res.status(400).send("Invalid channel type.");

      await addIgnoredChannel(guildId, channelId, channelType);
      return res.redirect(getModuleRedirect(guildId, 'xp'));
    } catch (e) {
      console.error("ignored-channels add error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  app.post("/guild/:guildId/ignored-channels/delete", requireGuildAdmin, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const channelId = String(req.body.channel_id || "").trim();

      if (!channelId) return res.status(400).send("Channel ID required.");

      await removeIgnoredChannel(guildId, channelId);
      return res.redirect(getModuleRedirect(guildId, 'xp'));
    } catch (e) {
      console.error("ignored-channels delete error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  // ─────────────────────────────────────────────
  // Reaction Role Questions
  // ─────────────────────────────────────────────

  // List all reaction role questions
  app.get("/guild/:guildId/reaction-questions", requireGuildAdmin, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const questions = await getReactionRoleQuestions(guildId);
      return res.json({ questions });
    } catch (e) {
      console.error("reaction-questions list error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  // Create new reaction role question
  app.post("/guild/:guildId/reaction-questions/create", requireGuildAdmin, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const questionText = String(req.body.question_text || "").trim();

      if (!questionText) return res.status(400).send("Question text required.");

      const questionId = await createReactionRoleQuestion(guildId, questionText);
      return res.redirect(getModuleRedirect(guildId, 'reactionroles'));
    } catch (e) {
      console.error("reaction-questions create error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  // Get single question with options (for editing)
  app.get("/guild/:guildId/reaction-questions/:questionId", requireGuildAdmin, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const questionId = parseInt(req.params.questionId, 10);

      if (!Number.isInteger(questionId)) return res.status(400).send("Invalid question ID.");

      const question = await getReactionRoleQuestion(questionId);
      if (!question || question.guild_id !== guildId) {
        return res.status(404).send("Question not found.");
      }

      const options = await getReactionRoleOptions(questionId);
      return res.json({ question, options });
    } catch (e) {
      console.error("reaction-questions get error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  // Update reaction role question
  app.post("/guild/:guildId/reaction-questions/:questionId/update", requireGuildAdmin, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const questionId = parseInt(req.params.questionId, 10);
      const questionText = String(req.body.question_text || "").trim();

      if (!Number.isInteger(questionId)) return res.status(400).send("Invalid question ID.");
      if (!questionText) return res.status(400).send("Question text required.");

      const question = await getReactionRoleQuestion(questionId);
      if (!question || question.guild_id !== guildId) {
        return res.status(404).send("Question not found.");
      }

      await updateReactionRoleQuestion(questionId, questionText, question.channel_id, question.message_id);
      return res.redirect(getModuleRedirect(guildId, 'reactionroles'));
    } catch (e) {
      console.error("reaction-questions update error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  // Delete reaction role question
  app.post("/guild/:guildId/reaction-questions/:questionId/delete", requireGuildAdmin, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const questionId = parseInt(req.params.questionId, 10);

      if (!Number.isInteger(questionId)) return res.status(400).send("Invalid question ID.");

      const question = await getReactionRoleQuestion(questionId);
      if (!question || question.guild_id !== guildId) {
        return res.status(404).send("Question not found.");
      }

      await deleteReactionRoleQuestion(questionId);
      return res.redirect(getModuleRedirect(guildId, 'reactionroles'));
    } catch (e) {
      console.error("reaction-questions delete error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  // Create option for a question
  app.post("/guild/:guildId/reaction-questions/:questionId/options/create", requireGuildAdmin, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const questionId = parseInt(req.params.questionId, 10);
      const emoji = String(req.body.emoji || "").trim();
      const label = String(req.body.label || "").trim();
      const description = String(req.body.description || "").trim();
      const roleIds = String(req.body.role_ids || "").trim();
      const position = parseInt(req.body.position, 10) || 0;

      if (!Number.isInteger(questionId)) return res.status(400).send("Invalid question ID.");
      if (!emoji) return res.status(400).send("Emoji required.");
      if (!label) return res.status(400).send("Label required.");
      if (!roleIds) return res.status(400).send("At least one role ID required.");

      const question = await getReactionRoleQuestion(questionId);
      if (!question || question.guild_id !== guildId) {
        return res.status(404).send("Question not found.");
      }

      await createReactionRoleOption(questionId, emoji, label, description, roleIds, position);
      return res.redirect(getModuleRedirect(guildId, 'reactionroles'));
    } catch (e) {
      console.error("reaction-questions option create error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  // Update option
  app.post("/guild/:guildId/reaction-questions/:questionId/options/:optionId/update", requireGuildAdmin, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const questionId = parseInt(req.params.questionId, 10);
      const optionId = parseInt(req.params.optionId, 10);
      const emoji = String(req.body.emoji || "").trim();
      const label = String(req.body.label || "").trim();
      const description = String(req.body.description || "").trim();
      const roleIds = String(req.body.role_ids || "").trim();
      const position = parseInt(req.body.position, 10) || 0;

      if (!Number.isInteger(questionId)) return res.status(400).send("Invalid question ID.");
      if (!Number.isInteger(optionId)) return res.status(400).send("Invalid option ID.");
      if (!emoji) return res.status(400).send("Emoji required.");
      if (!label) return res.status(400).send("Label required.");
      if (!roleIds) return res.status(400).send("At least one role ID required.");

      const question = await getReactionRoleQuestion(questionId);
      if (!question || question.guild_id !== guildId) {
        return res.status(404).send("Question not found.");
      }

      await updateReactionRoleOption(optionId, emoji, label, description, roleIds, position);
      return res.redirect(getModuleRedirect(guildId, 'reactionroles'));
    } catch (e) {
      console.error("reaction-questions option update error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  // Delete option
  app.post("/guild/:guildId/reaction-questions/:questionId/options/:optionId/delete", requireGuildAdmin, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const questionId = parseInt(req.params.questionId, 10);
      const optionId = parseInt(req.params.optionId, 10);

      if (!Number.isInteger(questionId)) return res.status(400).send("Invalid question ID.");
      if (!Number.isInteger(optionId)) return res.status(400).send("Invalid option ID.");

      const question = await getReactionRoleQuestion(questionId);
      if (!question || question.guild_id !== guildId) {
        return res.status(404).send("Question not found.");
      }

      await deleteReactionRoleOption(optionId);
      return res.redirect(getModuleRedirect(guildId, 'reactionroles'));
    } catch (e) {
      console.error("reaction-questions option delete error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  // Send/deploy reaction role question to channel
  app.post("/guild/:guildId/reaction-questions/:questionId/send", requireGuildAdmin, async (req, res) => {
    try {
      const guildId = req.params.guildId;
      const questionId = parseInt(req.params.questionId, 10);
      const channelId = String(req.body.channel_id || "").trim();

      if (!Number.isInteger(questionId)) return res.status(400).send("Invalid question ID.");
      if (!channelId) return res.status(400).send("Channel ID required.");

      const question = await getReactionRoleQuestion(questionId);
      if (!question || question.guild_id !== guildId) {
        return res.status(404).send("Question not found.");
      }

      const guild = client.guilds.cache.get(guildId);
      if (!guild) return res.status(404).send("Bot is not in that guild.");

      const channel = await guild.channels.fetch(channelId).catch(() => null);
      if (!channel || !isTextChannelLike(channel)) {
        return res.status(400).send("Invalid text channel.");
      }

      const options = await getReactionRoleOptions(questionId);
      if (options.length === 0) {
        return res.status(400).send("Question must have at least one option.");
      }
      if (options.length > 25) {
        return res.status(400).send("Maximum 25 options allowed per question.");
      }

      // Build the embed
      const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
      
      const embed = new EmbedBuilder()
        .setTitle(`🎭 ${question.question_text}`)
        .setColor(0x7bc96f)
        .setDescription("**Choose your role from the dropdown menu below!**\n\n> Select an option to receive the corresponding roles. You can change your selection at any time.\n\n**Available Options:**")
        .setFooter({ text: "Moist Lieutenant • Role Selection", iconURL: guild.iconURL() || undefined })
        .setTimestamp();

      // Add fields for each option
      for (const option of options) {
        const optionEmoji = option.emoji || "•";
        const optionDesc = option.description || "No description provided";
        embed.addFields({
          name: `${optionEmoji} ${option.label}`,
          value: optionDesc,
          inline: true
        });
      }

      // Build the select menu
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`reaction_role_select_${questionId}`)
        .setPlaceholder("🎯 Select your role...");

      for (const option of options) {
        selectMenu.addOptions({
          label: option.label,
          description: option.description || undefined,
          emoji: option.emoji || undefined,
          value: String(option.id)
        });
      }

      const row = new ActionRowBuilder().addComponents(selectMenu);

      // Send or edit the message
      let message;
      if (question.message_id) {
        try {
          message = await channel.messages.fetch(question.message_id);
          await message.edit({ embeds: [embed], components: [row] });
        } catch (err) {
          // Message not found, send new one
          message = await channel.send({ embeds: [embed], components: [row] });
        }
      } else {
        message = await channel.send({ embeds: [embed], components: [row] });
      }

      // Update question with channel and message IDs
      await updateReactionRoleQuestion(questionId, question.question_text, channelId, message.id);

      return res.redirect(getModuleRedirect(guildId, 'reactionroles'));
    } catch (e) {
      console.error("reaction-questions send error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  // Render needs 0.0.0.0
  app.listen(port, "0.0.0.0", () => {
    console.log(`Dashboard running on port ${port}`);
  });

  return app;
}

module.exports = { startDashboard };