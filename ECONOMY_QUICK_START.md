# Quick Start Guide: Economy Slash Commands & Admin Guide

## For Server Members: Using Slash Commands

### Economy Commands - Now Available with `/`

Try any of these by typing `/` and selecting from the menu:

**Checking Wealth:**
- `/balance` or `/balance @user` - See your wallet + bank balance
- `/baltop` - See the richest members (leaderboard)

**Getting Free Money:**
- `/daily` - Claim your daily reward (builds streaks for bonuses!)
- `/weekly` - Claim your weekly reward (bigger payout)

**Transferring Money:**
- `/pay @user 100` - Send 100 coins to another user
- `/deposit 500` - Deposit money to your bank (safe storage)
- `/withdraw 200` - Withdraw from your bank to your wallet

**Minigames (Earn/Lose Money):**
- `/fish` - Go fishing for treasure
- `/dig` - Dig for underground treasure
- `/phone [service]` - Use phone services:
  - `/phone police` - Call police (1h robbery protection)
  - `/phone taxi` - Order a taxi (fun stories)
  - `/phone takeout` - Order food (costs 50 coins)
- `/adventure [story_id]` - Go on text-based adventures
- `/explore` - Explore for treasure (cooldown-based)

**Gambling (High Risk/Reward):**
- `/slots 100` - Play slots with a 100 coin bet (3x-10x payout or lose)
- `/coinflip 50 heads` - Flip a coin (2x payout or lose)
- `/dice 100 4` - Guess a 1-6 roll (6x payout or lose)
- `/rob @user` - Steal from another user (risky!)
- `/bankrob` - Rob the bank itself (very risky, big reward)

**Jobs & Career:**
- `/job list` - See available jobs
- `/job apply Street Cleaner` - Apply for a job
- `/job quit` - Quit your current job
- `/work` - Work your job to earn money

**Shopping:**
- `/shop` - See available items to buy
- `/buy 1` - Buy item #1 from the shop
- `/inventory` - See what you own

---

## For Server Admins: Setting Up the Economy

### Access Admin Dashboard

1. Go to the dashboard URL (usually http://localhost:8080 or your bot's configured URL)
2. Login with Discord OAuth
3. Select your guild (server)
4. Click **Economy** tab in the left menu

### Configure Economy Settings

You'll see these fields:

- **Enable Economy** - Checkbox to turn economy on/off
- **Currency Name** - What to call your currency (default: "coins")
- **Currency Symbol** - Emoji or character (default: 🪙)
- **Economy Prefix** - Prefix for prefix commands (default: $)
- **Daily Reward Amount** - Base coins earned per daily claim (default: 100)
- **Daily Streak Bonus** - Bonus coins per consecutive day (default: 10)
- **Weekly Reward Amount** - Coins earned per weekly claim (default: 500)
- **Enable Robbing** - Allow players to rob each other
- **Rob Cooldown** - Seconds between robbery attempts
- **Economy Guide** (NEW!) - Your custom guide text

### Create Your Custom Economy Guide

Scroll to the **Economy Guide** textarea at the bottom. This is where you explain your server's economy to members!

**What to include:**
- How to earn money (daily, weekly, jobs, minigames)
- Recommended spending/saving strategy
- List of minigames available
- Warning about high-risk gambling games
- Links to help or support

**Example guide:**

```
🪙 WELCOME TO [SERVER NAME] ECONOMY! 🪙

**START HERE:**
Use /balance to check your wallet and bank.
Use /daily every day for free coins!

**EARN MONEY:**
✅ /daily (100 base coins + streak bonus)
✅ /weekly (500 coins)
✅ /work (if you have a job)
✅ Minigames like /fish or /dig

**TOP MINIGAMES:**
🎣 /fish - Relaxing, steady income
⛏️  /dig - Good rewards
📱 /phone - Story encounters
🎰 /slots, /coinflip, /dice - GAMBLING (risky!)

**JOBS:**
/job list to see available positions
/job apply [job_name] to start working
/work to earn per shift (limited shifts/week)

**MY RULES:**
⚠️  Rob attempts fail 60% of the time - use at your own risk!
⚠️  Bank robberies have a 1-hour cooldown
⚠️  Weekly 100 coin tax on accounts over 10k coins
✅ You can deposit money for safekeeping

Questions? Ask a mod!
```

**Tips:**
- Keep it short and friendly
- Highlight your unique rules
- Warn about risky activities
- Use emojis to make it visually appealing
- Update it if you change economy settings

### Save Your Settings

Click **Save Economy Settings** at the bottom. Everything saves:
- All economy configuration
- Your custom guide text
- Current top 10 richest member leaderboard

That's it! Your economy is ready.

---

## Theme Support

### Light vs Dark Mode

All dashboard elements now properly support both themes:

**Light Mode** (Default)
- White/light backgrounds with dark text  
- Easy to read on any device

**Dark Mode**
- Dark backgrounds with light text
- Reduces eye strain during evening use
- Toggle with the **Theme** button in top-right

The info boxes (commands, guide sections) automatically adapt. No more invisible text!

---

## Slash Command Benefits

✅ No more typing prefix + command name
✅ Built-in help text and auto-complete
✅ Easier for new users to discover commands
✅ Works exactly like prefix commands
✅ Can mix and match: use `/daily` or `$daily` (both work)

---

## File Reference

For developers who need to modify the economy:

- **Commands**: `src/commands.js` - Handler logic
- **Minigames**: `src/economy.js` - Fish, dig, phone, adventure, explore
- **Database**: `src/db.js` - Schema and migrations
- **Dashboard**: `src/dashboard.js` - Admin UI

All slash commands are registered in `buildSlashCommands()` and handled by `handleSlashCommand()`.

---

## Troubleshooting

**Q: Why don't I see slash commands?**
A: Make sure the bot has restarted after deployment. Slash commands are registered on bot startup.

**Q: My guide isn't saving!**
A: Check that you're logged in as a guild admin. Only admins can edit economy settings.

**Q: The dashboard looks weird in dark mode!**
A: Try refreshing the page. The dark mode CSS should load automatically.

**Q: Can I switch economy on/off without losing settings?**
A: Yes! Un-checking "Enable Economy" disables earning/spending, but all settings are preserved.

---

## Next Steps

1. **Login to dashboard** and enable economy
2. **Customize your guide** with server-specific rules
3. **Announce `/balance` command** to members
4. **Watch members use: `/daily`** to start playing!

Enjoy your server's new economy! 🎉
