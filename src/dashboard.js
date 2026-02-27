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

    async function userCanManageGuild(user, guildId) {
      if (!user?.id || !guildId) return false;
      if (process.env.BOT_MANAGER_ID && user.id === process.env.BOT_MANAGER_ID) return true;

      const guild = client.guilds.cache.get(guildId);
      if (!guild) return false;

      let member = guild.members.cache.get(user.id);
      if (!member) {
        member = await guild.members.fetch(user.id).catch(() => null);
      }
      if (!member) return false;

      return (
        member.permissions.has("Administrator") ||
        member.permissions.has("ManageGuild") ||
        member.permissions.has("ManageChannels")
      );
    }

    async function requireGuildAdmin(req, res, next) {
      if (!(req.isAuthenticated && req.isAuthenticated())) {
        if (req.session) req.session.returnTo = req.originalUrl;
        return res.redirect("/login");
      }

      const guildId = req.params.guildId;
      const allowed = await userCanManageGuild(req.user, guildId);
      if (!allowed) return res.status(403).send("You are not allowed to manage this server.");
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
  app.get("/guild/:guildId", requireGuildAdmin, async (req, res) => {
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
    const eventConfigMap = new Map(eventConfigs.map((cfg) => [cfg.event_key, cfg]));
    const activeModule = String(req.query.module || "overview").toLowerCase();
    const moduleTabs = [
      { key: "overview", label: "Overview" },
      { key: "moderation", label: "Moderation" },
      { key: "welcome", label: "Welcome & Auto-Roles" },
      { key: "logging", label: "Logging" },
      { key: "xp", label: "XP" },
      { key: "tickets", label: "Tickets" },
      { key: "reactionroles", label: "Reaction Roles" },
      { key: "voice", label: "Voice" },
      { key: "customization", label: "Customization" }
    ];

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
        ${moduleTabs.map((tab) => `
          <a class="btn" style="padding:8px 12px;${activeModule === tab.key ? "opacity:1;font-weight:700;border-bottom:2px solid #7bc96f;" : "opacity:0.8;"}" href="/guild/${guildId}?module=${tab.key}">${escapeHtml(tab.label)}</a>
        `).join("")}
      </div>

      ${activeModule === "overview" ? `
      <div class="admin-section">
      <h3>Quick Overview</h3>
      <ul>
        <li>Members tracked by XP: <b>${trackedXpUsers}</b></li>
        <li>Configured mod role: <b>${settings.mod_role_id ? `@${escapeHtml(guild.roles.cache.get(settings.mod_role_id)?.name || "Unknown role")}` : "Not set"}</b></li>
        <li>Warnings stored: <b>${warningRows.length}</b></li>
        <li>Private VC rooms tracked: <b>${privateRooms.length}</b></li>
        <li>Claim-all lock: <b>${claimLocked ? "Locked" : "Unlocked"}</b></li>
      </ul>
      </div>
      ` : ""}

      ${activeModule === "moderation" ? `

      <h3>Moderation Settings</h3>
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
        <label>Log Channel
          <select name="log_channel_id">
            <option value="" ${!settings.log_channel_id ? "selected" : ""}>None</option>
            ${textChannels.map((c) => `<option value="${c.id}" ${settings.log_channel_id === c.id ? "selected" : ""}>#${escapeHtml(c.name)}</option>`).join("")}
          </select>
        </label>
        <br/><br/>
        <button type="submit">Save Moderation Settings</button>
      </form>

      <h3>Warnings</h3>
      <table>
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

      <h3>🤖 Auto-Moderation</h3>
      <form method="post" action="/guild/${guildId}/automod-settings">
        <label style="display:flex;align-items:center;gap:8px;">
          <input type="checkbox" name="spam_enabled" ${automodSettings?.spam_enabled ? "checked" : ""} />
          <span>Block Spam (repeated messages)</span>
        </label>
        <label style="margin-left:24px;">Messages in 10s:
          <input type="number" name="spam_threshold" value="${automodSettings?.spam_threshold || 5}" min="2" max="20" style="width:80px;" />
        </label>
        <br/><br/>

        <label style="display:flex;align-items:center;gap:8px;">
          <input type="checkbox" name="invites_enabled" ${automodSettings?.invites_enabled ? "checked" : ""} />
          <span>Block Discord Invite Links</span>
        </label>
        <br/>

        <label style="display:flex;align-items:center;gap:8px;">
          <input type="checkbox" name="links_enabled" ${automodSettings?.links_enabled ? "checked" : ""} />
          <span>Block External Links</span>
        </label>
        <br/>

        <label style="display:flex;align-items:center;gap:8px;">
          <input type="checkbox" name="caps_enabled" ${automodSettings?.caps_enabled ? "checked" : ""} />
          <span>Block Excessive Caps</span>
        </label>
        <label style="margin-left:24px;">Caps % threshold:
          <input type="number" name="caps_threshold" value="${automodSettings?.caps_threshold || 70}" min="50" max="100" style="width:80px;" />
        </label>
        <br/><br/>

        <label style="display:flex;align-items:center;gap:8px;">
          <input type="checkbox" name="mentions_enabled" ${automodSettings?.mentions_enabled ? "checked" : ""} />
          <span>Block Excessive Mentions</span>
        </label>
        <label style="margin-left:24px;">Max mentions:
          <input type="number" name="mentions_threshold" value="${automodSettings?.mentions_threshold || 5}" min="2" max="20" style="width:80px;" />
        </label>
        <br/><br/>

        <label style="display:flex;align-items:center;gap:8px;">
          <input type="checkbox" name="attachments_enabled" ${automodSettings?.attachments_enabled ? "checked" : ""} />
          <span>Block All Attachments</span>
        </label>
        <br/><br/>

        <button type="submit">Save Auto-Mod Settings</button>
      </form>
      ` : ""}

      ${activeModule === "welcome" ? `

      <h3>🎉 Welcome Messages</h3>
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
      <p style="opacity:0.8;">Roles automatically given to new members when they join.</p>
      
      <form method="post" action="/guild/${guildId}/auto-roles/add">
        <label>Add Auto-Role
          <select name="role_id" required>
            <option value="">Select a role...</option>
            ${roleOptions.map((r) => `<option value="${r.id}">@${escapeHtml(r.name)}</option>`).join("")}
          </select>
        </label>
        <button type="submit">Add Role</button>
      </form>
      <br/>
      
      ${autoRoles.length > 0 ? `
      <table>
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
      ` : "<p style=\"opacity:0.7;\">No auto-roles configured.</p>"}
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

      ${activeModule === "reactionroles" ? `
      <h3>Reaction Roles</h3>
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
        <label style="min-width:140px;flex:0 0 140px;">
          <span>Remove on unreact</span>
          <input type="checkbox" name="remove_on_unreact" checked />
        </label>
        <button type="submit">Save Reaction Role</button>
      </form>

      <ul>
        ${reactionRoleBindings.map((row) => {
          const channelName = guild.channels.cache.get(row.channel_id)?.name || row.channel_id;
          const roleName = guild.roles.cache.get(row.role_id)?.name || row.role_id;
          return `
            <li>
              #${escapeHtml(channelName)} • message ${escapeHtml(row.message_id)} • emoji ${escapeHtml(row.emoji_key)} → @${escapeHtml(roleName)} ${Number(row.remove_on_unreact) === 1 ? "(removes on unreact)" : ""}
              <form style="display:inline" method="post" action="/guild/${guildId}/reaction-roles/delete">
                <input type="hidden" name="message_id" value="${escapeHtml(row.message_id)}" />
                <input type="hidden" name="emoji_key" value="${escapeHtml(row.emoji_key)}" />
                <button type="submit">Delete</button>
              </form>
            </li>
          `;
        }).join("") || "<li>No reaction roles configured.</li>"}
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
        <button type="submit">Save Ticket Settings</button>
      </form>

      <form method="post" action="/guild/${guildId}/tickets/panel" style="margin-top:8px;">
        <button type="submit">Send Ticket Panel</button>
      </form>

      <table>
        <tr><th>Open Ticket Channel</th><th>Opened By</th><th>Created</th><th>Actions</th></tr>
        ${openTickets.map((t) => {
          const chName = guild.channels.cache.get(t.channel_id)?.name || t.channel_id;
          const opener = guild.members.cache.get(t.opener_id);
          const openerName = opener ? `${opener.displayName} (${opener.user.username})` : t.opener_id;
          const created = Number.isFinite(Number(t.created_at)) ? new Date(Number(t.created_at)).toLocaleString() : "-";
          return `
            <tr>
              <td>${escapeHtml(chName)}</td>
              <td>${escapeHtml(openerName)}</td>
              <td>${escapeHtml(created)}</td>
              <td>
                <form method="post" action="/guild/${guildId}/tickets/close" style="display:inline;">
                  <input type="hidden" name="channel_id" value="${escapeHtml(t.channel_id)}" />
                  <button type="submit">Close</button>
                </form>
              </td>
            </tr>
          `;
        }).join("") || `<tr><td colspan="4">No open tickets.</td></tr>`}
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
  });

  // ─────────────────────────────────────────────
  // Save customization unlocks
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
      const newAccountWarnDays = Number.isInteger(newAccountWarnDaysRaw) && newAccountWarnDaysRaw >= 0
        ? newAccountWarnDaysRaw
        : 1;
      const commandPrefix = (!commandPrefixRaw || commandPrefixRaw.length > 3 || /\s/.test(commandPrefixRaw))
        ? "!"
        : commandPrefixRaw;
      await updateGuildSettings(guildId, {
        mod_role_id: modRoleId,
        log_channel_id: logChannelId,
        command_prefix: commandPrefix,
        new_account_warn_days: newAccountWarnDays
      });
      return res.redirect(getModuleRedirect(guildId, 'moderation'));
    } catch (e) {
      console.error("mod-settings save error:", e);
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
      const spamEnabled = req.body.spam_enabled === "on" ? 1 : 0;
      const spamThreshold = parseInt(req.body.spam_threshold || "5", 10);
      const invitesEnabled = req.body.invites_enabled === "on" ? 1 : 0;
      const linksEnabled = req.body.links_enabled === "on" ? 1 : 0;
      const capsEnabled = req.body.caps_enabled === "on" ? 1 : 0;
      const capsThreshold = parseInt(req.body.caps_threshold || "70", 10);
      const mentionsEnabled = req.body.mentions_enabled === "on" ? 1 : 0;
      const mentionsThreshold = parseInt(req.body.mentions_threshold || "5", 10);
      const attachmentsEnabled = req.body.attachments_enabled === "on" ? 1 : 0;

      await run(`
        INSERT INTO automod_settings (
          guild_id, spam_enabled, spam_threshold, invites_enabled, links_enabled,
          caps_enabled, caps_threshold, mentions_enabled, mentions_threshold, attachments_enabled
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(guild_id) DO UPDATE SET
          spam_enabled=excluded.spam_enabled,
          spam_threshold=excluded.spam_threshold,
          invites_enabled=excluded.invites_enabled,
          links_enabled=excluded.links_enabled,
          caps_enabled=excluded.caps_enabled,
          caps_threshold=excluded.caps_threshold,
          mentions_enabled=excluded.mentions_enabled,
          mentions_threshold=excluded.mentions_threshold,
          attachments_enabled=excluded.attachments_enabled
      `, [
        guildId, spamEnabled, spamThreshold, invitesEnabled, linksEnabled,
        capsEnabled, capsThreshold, mentionsEnabled, mentionsThreshold, attachmentsEnabled
      ]);

      return res.redirect(getModuleRedirect(guildId, 'moderation'));
    } catch (e) {
      console.error("automod-settings save error:", e);
      return res.status(500).send("Internal Server Error");
    }
  });

  app.post("/guild/:guildId/logging-exclusions/add", requireGuildAdmin, async (req, res) => {
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

  app.post("/guild/:guildId/logging-exclusions/delete", requireGuildAdmin, async (req, res) => {
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

  app.post("/guild/:guildId/logging-events", requireGuildAdmin, async (req, res) => {
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

  app.post("/guild/:guildId/logging-actors/add", requireGuildAdmin, async (req, res) => {
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

  app.post("/guild/:guildId/logging-actors/delete", requireGuildAdmin, async (req, res) => {
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
      const removeOnUnreact = req.body.remove_on_unreact === "on";

      if (!channelId || !messageId || !emojiKey || !roleId) {
        return res.status(400).send("Channel, message ID, emoji, and role are required.");
      }

      await upsertReactionRoleBinding(guildId, channelId, messageId, emojiKey, roleId, removeOnUnreact);
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
      if (!messageId || !emojiKey) return res.status(400).send("Message ID and emoji are required.");

      await removeReactionRoleBinding(guildId, messageId, emojiKey);
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

      await upsertTicketSettings(guildId, {
        enabled,
        panel_channel_id: panelChannelId,
        category_id: categoryId,
        support_role_id: supportRoleId,
        ticket_prefix: ticketPrefix,
        ticket_log_channel_id: ticketLogChannelId,
        ticket_transcript_channel_id: ticketTranscriptChannelId,
        save_transcript: saveTranscript,
        delete_on_close: deleteOnClose
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
  app.post("/guild/:guildId/warnings/delete", requireGuildAdmin, async (req, res) => {
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

  app.post("/guild/:guildId/warnings/clear-user", requireGuildAdmin, async (req, res) => {
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
}

module.exports = { startDashboard };