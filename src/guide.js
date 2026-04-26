// src/guide.js
// The Murk — Server Lore & How-To-Play Guide
// Run with: !postguide  (admin only)
// Posts a sequence of rich embeds into the current channel covering
// lore, economy, classes, crafting, prestige, tips.

const { EmbedBuilder } = require("discord.js");

// ─────────────────────────────────────────────────────
// Lore & guide embed pages
// ─────────────────────────────────────────────────────

const GUIDE_PAGES = [

  // ── Page 1: World Lore ─────────────────────────────
  new EmbedBuilder()
    .setColor(0x2c3e50)
    .setTitle("📜 The Murk — A World Drowned in Shadow")
    .setDescription(
      `*There was a time before the Murk. Nobody remembers it clearly — only fragments remain: the smell of clean rain, the warmth of open skies, the sound of birds that didn't rot mid-flight.*

The **Murk** is what came after. A vast, half-submerged wetland that swallowed the old world whole. Fog rolls in thick from the bogs. The trees are black and waterlogged. The only lights are the lanterns of scavengers, the glow of alchemical brews, and the occasional cursed fire that shouldn't be burning at all.

People still live here — stubborn, desperate, or stupid enough to stay. They trade in **Murk Coins** 🪙, scavenge what the bog gives up, and try not to become something that crawls out of the water at night.

The settlement at the edge of the deep Murk has no official name. Locals call it **The Stump**. It's built on the remains of a great tree that fell centuries ago. It smells like wet leather and copper. You'll learn to love it.

> *"You came to the Murk looking for something. Gold, glory, a fresh start, or maybe just an escape from wherever you were before. Doesn't matter. The bog has a way of reminding you what you're really worth."*
> — Old Mirna, The Stump's only remaining physician`
    )
    .setFooter({ text: "The Murk — Chapter I: Arrival" })
    .setTimestamp(),

  // ── Page 2: Getting Started ────────────────────────
  new EmbedBuilder()
    .setColor(0x1a5276)
    .setTitle("🗺️ How To Survive — Getting Started")
    .setDescription(
      `**Welcome to The Stump. Here's how to not die on your first day.**

> The economy uses **Murk Coins** 🪙. You start with nothing. That's tradition.

**📋 Your First Steps:**
\`\`\`
1.  Claim your daily coins     →  $daily
2.  Check your balance         →  $balance
3.  Browse the Bazaar          →  $shop
4.  Buy a Fishing Rod or Shovel
5.  Start earning              →  $fish  or  $dig
\`\`\`

**⏰ Recurring Income:**
| Command | Reward | Cooldown |
|---------|--------|----------|
| \`$daily\` | Base coins + streak bonus | 24h |
| \`$weekly\` | Large coin dump | 7 days |
| \`$fish\` | Catch fish, earn coins | 30m |
| \`$dig\` | Dig up relics, earn coins | 30m |
| \`$work\` | Complete a mini-game shift | 1h |

**🔥 Daily Streaks** — Your \`$daily\` reward grows every consecutive day you claim. Miss a day and the streak resets. Committed swamp-dwellers earn significantly more.`
    )
    .setFooter({ text: "The Murk — How To Play: Basics" }),

  // ── Page 3: Classes ───────────────────────────────
  new EmbedBuilder()
    .setColor(0x6c3483)
    .setTitle("⚔️ Murk Classes — Who Are You In The Bog?")
    .setDescription(
      `Every survivor of the Murk falls into one of four archetypes. Choose with \`$class <name>\`.

─────────────────────────────

🗡️ **Brigand**
*"Take what you need. Leave what you can't carry."*
Masters of theft and direct confrontation. Rob more, lose less.
**Perks:** +30% steal on \`$rob\`, reduced fines when caught, stronger \`$bankrob\` returns.

─────────────────────────────

⚙️ **Artificer**
*"If you can't find it, build it. If you can't build it, salvage it."*
Crafters and engineers. Every invention starts with a blueprint and ends with a boom.
**Perks:** Reduced crafting costs, bonus loot from \`$dig\`, access to exclusive crafted items.

─────────────────────────────

📚 **Scholar**
*"The Murk has patterns. Most people are too busy surviving to notice."*
Researchers and alchemists. Turn knowledge and patience into power.
**Perks:** Bonus XP from all activities, enhanced item effects when using consumables, better \`$adventure\` outcomes.

─────────────────────────────

🏛️ **Merchant**
*"Every transaction is a negotiation. I always win."*
Traders and deal-makers. Move coins like water through the bog.
**Perks:** Reduced shop prices, bonus coins from \`$work\` and \`$daily\`, better pay rates from jobs.

─────────────────────────────

> Use \`$class\` to see your current class or pick a new one. Your class shapes how the Murk treats you.`
    )
    .setFooter({ text: "The Murk — Classes & Builds" }),

  // ── Page 4: Economy Deep Dive ─────────────────────
  new EmbedBuilder()
    .setColor(0x1a7a4a)
    .setTitle("💰 Economy Deep Dive — Making It In The Murk")
    .setDescription(
      `**The full breakdown of how coins flow through The Stump.**

**🏦 Banking**
Your wallet is exposed. Robbers can target it. Your bank is safe.
- \`$deposit <amount|all>\` — Move coins to the bank
- \`$withdraw <amount|all>\` — Take coins out

**💸 Transfers**
- \`$pay @user <amount>\` — Send coins to another person

**🎰 Gambling** *(The bog giveth, the bog taketh)*
| Game | Command | How To Win |
|------|---------|------------|
| Slots | \`$slots <bet>\` | Match symbols. 7️⃣7️⃣7️⃣ = 10x |
| Coinflip | \`$coinflip <bet> <h/t>\` | Guess the flip. 2x payout |
| Dice | \`$dice <bet> <1-6>\` | Guess the roll. 6x payout |

**🔪 Robbery**
- \`$rob @user\` — Steal from someone's wallet (50% success, 30min cooldown)
- \`$bankrob\` — Organized heist for bigger rewards (risky, uses crew items)
- Buy a 🔒 **Padlock** from the shop to protect your wallet

**📊 Leaderboard**
\`$baltop\` — See who's winning in The Stump`
    )
    .setFooter({ text: "The Murk — Economy Guide" }),

  // ── Page 5: Exploration ───────────────────────────
  new EmbedBuilder()
    .setColor(0x154360)
    .setTitle("🌿 Into The Deep — Exploration & Adventure")
    .setDescription(
      `The Murk rewards those brave (or foolish) enough to venture beyond The Stump.

**🎣 Fishing** — \`$fish\`
*Cast your line into the brackish water. What comes back up isn't always fish.*
Requires a **Fishing Rod** from the shop. Catch fish worth varying coin amounts. Sometimes you pull up something that shouldn't exist.

**⛏️ Digging** — \`$dig\`
*The bog buries things for a reason. That's never stopped anyone.*
Requires a **Shovel** from the shop. Unearth relics, materials, and occasionally something cursed.

**🗺️ Adventure** — \`$adventure\`
*A story-driven encounter deep in the Murk. Choices matter.*
Follow a narrative path. Your class and inventory items affect outcomes. Some paths reward, others punish.

**🌑 Explore** — \`$explore\`
*Open-ended swamp wandering. Anything can happen.*
Random events: ambushes, discoveries, fog-phantoms, and stranger things. No guaranteed outcome.

**📞 The Phone** — \`$phone\`
*Someone left a phone in the bog. It still works, somehow.*
Make calls into the dark. Sometimes information, sometimes just static.

> **Tip:** Stock up on consumables before long excursions. A **Swamp Tonic** can mean the difference between a profit and a corpse.`
    )
    .setFooter({ text: "The Murk — Exploration Guide" }),

  // ── Page 6: Shop & Items ──────────────────────────
  new EmbedBuilder()
    .setColor(0x1f8b4c)
    .setTitle("🛒 The Murk Grand Bazaar — Items & What They Do")
    .setDescription(
      `*Old Regis runs the Bazaar from a converted funeral barge. He sells everything. He asks no questions. He remembers all debts.*

Use \`$shop\` to browse. Use \`$buy <number>\` to purchase. Use \`$inventory\` to check what you're carrying.

**🛠️ Tools** — Required for certain activities
- **Fishing Rod** — Needed for \`$fish\`
- **Shovel** — Needed for \`$dig\`

**🧪 Consumables** — Use with \`$use <item_id>\`
- **Swamp Tonic** 🧪 — Heal after a bad adventure. Restores health/status.
- **Witch's Brew** 🫧 — Double your next earning activity. Volatile.
- **Gambler's Dice** 🎲 — Guaranteed win on your next dice roll. One use.
- **Fog Lantern** 🏮 — Illuminates hidden paths in exploration events.

**🧱 Materials** — Used in crafting recipes
Bones, bog iron, relic shards, alchemical components, and stranger things.

**🏆 Collectibles & Special Items**
- **Padlock** 🔒 — Absorbs one rob attempt. Consumed on trigger.
- **Murk Map** 🗺️ — Grants bonus loot in exploration.
- **Cursed Coin** 💀 — *Nobody knows what this does. Buy it and find out.*

> Use \`$item <name>\` to inspect any item for full lore + stats before purchasing.`
    )
    .setFooter({ text: "The Murk — Items & Shop Guide" }),

  // ── Page 7: Crafting ──────────────────────────────
  new EmbedBuilder()
    .setColor(0x784212)
    .setTitle("⚙️ Crafting — Build What The Bog Won't Give You")
    .setDescription(
      `*The Artificer's guild charges high rates. Smart survivors learn to make their own.*

**How Crafting Works:**
\`\`\`
$craft list              — See all available recipes
$craft <item_name>       — Attempt to craft an item
\`\`\`

Crafting requires **materials** in your inventory. Materials are found through:
- \`$dig\` — most common material source
- \`$explore\` — rare material events
- \`$shop\` — some materials available for purchase

**Recipe Tiers:**
| Tier | Difficulty | Examples |
|------|------------|---------|
| Common | Easy | Basic tools, simple tonics |
| Uncommon | Moderate | Enhanced gear, fog lanterns |
| Rare | Hard | Legendary items, forbidden relics |
| Prestige | Post-prestige only | Ancient artifacts |

**Artificer Bonus:** Members of the Artificer class pay reduced material costs and unlock exclusive recipes unavailable to other classes.

> The recipe list changes. Some recipes require specific classes. Some appear only under the right conditions.
> *The bog doesn't give its secrets up easily.*`
    )
    .setFooter({ text: "The Murk — Crafting Guide" }),

  // ── Page 8: Jobs ──────────────────────────────────
  new EmbedBuilder()
    .setColor(0x2e86c1)
    .setTitle("💼 Jobs — Honest Work In A Dishonest Place")
    .setDescription(
      `*Not everyone robs or fishes. Some people just... work. They're usually the ones who survive longest.*

**The Job System:**
\`\`\`
$job list                — Browse available positions
$job apply <name>        — Apply for a job
$job info                — Check your current position
$job quit                — Walk off the site
$work                    — Complete a shift (1h cooldown)
\`\`\`

**Shifts** are interactive mini-games:
- **Typing challenge** — Type a word before the timer runs out
- **Emoji search** — Find the target emoji in a list
- **Math problem** — Solve a calculation under pressure

Complete the challenge → earn your pay. Fail → unpaid shift.

**Weekly Requirements:**
Each job requires a minimum number of shifts per week. Miss the quota and you're fired. Simple as that.

**Pay Scales:**
Jobs at The Stump range from bog-water-hauler (low pay, easy entry) to relic broker (high pay, requires experience). Higher positions require completed shift history.

**Merchant Bonus:** Merchant class members receive higher base pay on every shift.`
    )
    .setFooter({ text: "The Murk — Jobs Guide" }),

  // ── Page 9: Prestige ──────────────────────────────
  new EmbedBuilder()
    .setColor(0x7d3c98)
    .setTitle("⭐ Prestige — Beyond Survival")
    .setDescription(
      `*Most people in the Murk just survive. A few — a very few — transcend it.*

**What Is Prestige?**
Prestige is a voluntary reset of your economy stats in exchange for a permanent bonus multiplier and a prestige-tier mark that shows on your profile.

**How To Prestige:**
\`\`\`
$prestige               — Check your eligibility
$prestige confirm       — Execute the reset
\`\`\`

**Requirements:**
- Minimum balance threshold (set by server admins)
- Minimum prestige level unlocks (varies per tier)

**What You Keep:**
- Your class
- Your crafting recipes
- Prestige-exclusive items in inventory
- Your reputation

**What Resets:**
- Coin balance
- Bank balance
- Job progress

**What You Gain:**
- Permanent % multiplier on all earnings
- Prestige badge (visible in \`$balance\`)
- Access to prestige-only crafting recipes
- Increased daily/weekly base rewards

> *"Those who've done it once call it liberation. Those who've done it twice call it addiction. Nobody talks about what happens on the third time."*
> — Posted on the wall at The Stump tavern`
    )
    .setFooter({ text: "The Murk — Prestige Guide" }),

  // ── Page 10: Tips & Tricks ─────────────────────────
  new EmbedBuilder()
    .setColor(0xc0392b)
    .setTitle("🧠 Survivor's Codex — Tips From Those Still Breathing")
    .setDescription(
      `Hard-won knowledge from the veterans of The Stump.

**💡 Beginner Tips**
- Claim \`$daily\` every day without fail. The streak bonus compounds fast.
- Deposit coins to the bank before logging off. Robbers target wallets.
- Buy a **Fishing Rod** first — it's the most reliable early income.
- Read item descriptions with \`$item <name>\` before spending coins.

**📈 Intermediate Strategies**
- Pick a class that matches your playstyle early. Switching is possible but not free.
- The \`$explore\` command feeds into crafting. Explore regularly even without a goal.
- \`$adventure\` outcomes scale with your inventory — go prepared.
- Keep a **Padlock** stocked if you're building wealth. Replace it after it breaks.

**🏆 Advanced Plays**
- Brigands who coordinate \`$bankrob\` with friends clean out serious coin.
- Scholars with the right consumables can loop \`$adventure\` for huge returns.
- Artificers who maintain material stocks can gate-keep rare crafted items.
- Prestige multipliers stack — committed players diverge from casual ones rapidly.

**⚠️ Things To Avoid**
- Don't gamble your entire wallet. Odds are slightly against you.
- Don't rob someone with a **Padlock** — you'll break it and waste the cooldown.
- Don't skip weekly shifts if you have a high-paying job. Getting fired hurts.
- Don't underestimate the fog.

> *The Murk doesn't care about your plans. Make them anyway.*`
    )
    .setFooter({ text: "The Murk — Survivor's Codex | Good luck out there." })
    .setTimestamp(),

];

// ─────────────────────────────────────────────────────
// cmdPostGuide — admin command to post all guide pages
// ─────────────────────────────────────────────────────

async function cmdPostGuide(message, isAdmin) {
  if (!isAdmin) {
    await message.reply("❌ Only admins can post the server guide.").catch(() => {});
    return;
  }

  await message.reply("📖 Posting The Murk guide — this will take a moment...").catch(() => {});

  for (const page of GUIDE_PAGES) {
    await message.channel.send({ embeds: [page] }).catch(() => {});
    // Small delay between pages to avoid rate limiting
    await new Promise(r => setTimeout(r, 800));
  }
}

// ─────────────────────────────────────────────────────
// cmdGuide — quick single-page summary for users
// ─────────────────────────────────────────────────────

async function cmdGuide(message, args) {
  const page = parseInt(args[0]);
  if (!isNaN(page) && page >= 1 && page <= GUIDE_PAGES.length) {
    await message.reply({ embeds: [GUIDE_PAGES[page - 1]] }).catch(() => {});
    return;
  }

  // Default: show index
  const index = new EmbedBuilder()
    .setColor(0x2c3e50)
    .setTitle("📖 The Murk — Server Guide")
    .setDescription(
      `Welcome to **The Murk**. Use \`$guide <page>\` to read a specific section.\n\n` +
      GUIDE_PAGES.map((p, i) => {
        const titleMatch = p.data.title || `Page ${i + 1}`;
        return `**${i + 1}.** ${titleMatch}`;
      }).join("\n") +
      `\n\n*Admins: use \`$postguide\` to post all pages to this channel.*`
    )
    .setFooter({ text: "The Murk — Use $guide <number> to read a section" });

  await message.reply({ embeds: [index] }).catch(() => {});
}

module.exports = { cmdGuide, cmdPostGuide, GUIDE_PAGES };
