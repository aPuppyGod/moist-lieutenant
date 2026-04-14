# Economy Slash Commands & Admin Guide - Implementation Summary

## Overview
This update adds complete slash command support for all economy commands, an editable economy guide system in the admin dashboard, and fixes white-box visibility issues in the dashboard UI.

## Changes Made

### 1. Database Schema (`src/db.js`)
- **Added migration**: `economy_guide TEXT DEFAULT ''` column to `economy_settings` table
- This allows admins to store and edit a custom guide explaining the economy system

### 2. Slash Command Registration (`src/commands.js`)

#### New Economy Slash Commands Added:
- `/balance [user]` - Check your or another user's balance
- `/daily` - Claim your daily reward
- `/weekly` - Claim your weekly reward
- `/pay <user> <amount>` - Send money to another user
- `/baltop` - View the richest members (leaderboard)
- `/deposit <amount>` - Deposit money to your bank
- `/withdraw <amount>` - Withdraw money from your bank
- `/rob <user>` - Rob another user
- `/bankrob` - Rob the bank (high risk, high reward)
- `/slots <bet>` - Play slots and try to win
- `/coinflip <bet> <heads|tails>` - Flip a coin for 2x winnings
- `/dice <bet> <guess>` - Guess the dice roll (1-6) for 6x winnings
- `/fish` - Go fishing for treasure
- `/dig` - Dig for treasure
- `/phone [service]` - Use phone services (police, taxi, takeout)
- `/adventure [story_id]` - Go on a swamp adventure
- `/explore` - Explore and find treasure
- `/shop` - View the economy shop
- `/buy <item>` - Buy an item from the shop
- `/inventory` - View your inventory
- `/job [action] [job_name]` - Manage your job (list, apply, quit)
- `/work` - Work at your job to earn money

#### Command Handler Updates:
- Updated `handleSlashCommand()` to parse all economy slash options and convert them to synthetic prefix commands
- All economy slash commands leverage existing command implementations for consistency

### 3. Admin Dashboard (`src/dashboard.js`)

#### Economy Settings UI Changes:
- **Added Economy Guide textarea**: 30+ line editable text area for admins to write/edit a guide
- **Persisted to database**: Guide text is saved with all other economy settings
- **Theme-safe styling**: New `.info-box` CSS class replaces hardcoded `#f8f9fa` boxes
  - Light mode: Uses `rgba(248, 249, 250, 0.95)` background
  - Dark mode: Uses `rgba(10, 30, 30, 0.85)` background
  - Both modes respect theme colors for borders and text

#### Dashboard CSS Improvements:
- **Added `.info-box` class** to `<style>` section
  - Automatically adapts to current theme (light/dark)
  - Replaces all hardcoded white backgrounds in command reference boxes
  - Ensures text visibility in both themes
- **Updated templates**: 
  - Giveaways commands section
  - Birthday commands section
  - Economy commands section

#### Dashboard Save Logic:
- `/guild/:guildId/economy-settings` POST handler now captures `economy_guide` textarea value
- Saves guide text alongside other economy settings (currency name, daily amount, etc.)

### 4. Default Economy Guide
A helpful default guide template is provided in `src/dashboard.js`:
```
Use this guide to explain your server's economy system and how members can earn and spend currency.

Example commands to highlight:
- `/balance [user]`
- `/daily`
- `/weekly`
- `/pay <user> <amount>`
- `/shop`
- `/buy <item_number>`
- `/fish`
- `/dig`
- `/phone <service>`
- `/adventure`
- `/explore`
```

## How It Works

### For Users:
1. **Slash Commands**: All economy commands are now accessible via Discord's `/` slash command UI
2. **Auto-completion**: Discord shows descriptions, required options, and choices for each command
3. **Same Experience**: Slash commands produce identical results to prefix commands (they use the same backend)

### For Admins:
1. Go to admin dashboard → Economy module
2. Scroll to "Economy Guide" textarea
3. Write/edit a custom guide explaining your server's economy system
4. Click "Save Economy Settings" to persist
5. The guide is stored in the database for easy reference and editing

### Dark/Light Theme Support:
- All info boxes (commands reference, economy guide section) automatically adapt to the current theme
- Text remains visible and properly contrasted in both modes
- No more white boxes with unreadable text

## Testing Checklist:
- [ ] All 21 economy slash commands are registered and appear in Discord's slash menu
- [ ] Slash commands execute correctly (e.g., `/daily`, `/pay <user> <amount>`)
- [ ] Economy guide textarea appears in admin dashboard
- [ ] Economy guide saves and persists after reload
- [ ] Info boxes display correctly in light theme
- [ ] Info boxes display correctly in dark theme
- [ ] Text in info boxes is readable in both themes

## Files Modified:
1. `src/db.js` - Added `economy_guide` column migration
2. `src/commands.js` - Added 21 economy slash command definitions + handler logic
3. `src/dashboard.js` - Added economy guide UI, theme-safe styling, save logic

## Backward Compatibility:
✅ All existing prefix commands (`!balance`, `!daily`, etc.) continue to work
✅ New `.info-box` CSS doesn't affect other dashboard elements
✅ Database migration (ALTER TABLE) is safe and non-destructive
