const { all, get, run } = require("./db");
const { EmbedBuilder } = require("discord.js");

/**
 * ============ MURK ECONOMY: LORE-DRIVEN DEEP ECONOMY ============
 * 
 * THE MURK LORE:
 * ───────────────────────────────────────────────────────────────
 * Deep beneath the fetid swamp lies THE MURK—a sunken civilization built by
 * ancient traders and alchemists. Once it thrived, but a great catastrophe
 * sealed it underwater. Now YOU are a Murk Adept, scrounging through its ruins
 * for wealth, forbidden knowledge, and power.
 * 
 * CLASS SYSTEM (Murk Archetypes):
 *   • BRIGAND: Stealth, theft, high-risk robberies (25% faster cooldowns)
 *   • ARTIFICER: Crafting, item creation, dark bazaar discount (20% shop discount)
 *   • SCHOLAR: Lore collection, expedition bonuses (25% more loot from explore/fish)
 *   • MERCHANT: Trading, bounty posting, profit margins (10% bank interest daily)
 * 
 * KEY MECHANICS:
 *   1. Daily Stock → Dark Bazaar refreshes daily with new items
 *   2. Bounty Board → Post & claim bounties for coins
 *   3. Crafting → Combine items into powerful artifacts & buffs
 *   4. Prestige System → Ascend to godhood, reset for multiplicative power
 *   5. Lore Collection → Unlock story & secrets
 */

// ==================== MURK CLASSES ==================

const MURK_CLASSES = {
  brigand: {
    name: "🗡️ Brigand",
    icon: "🗡️",
    description: "Master of stealth and high-risk crimes. 25% faster robbery cooldowns.",
    passive: "robbery_speedup",
    passive_value: 0.75  // multiply cooldown by 0.75
  },
  artificer: {
    name: "⚙️ Artificer",
    icon: "⚙️",
    description: "Craftsperson of the Murk. 20% discount at Dark Bazaar.",
    passive: "bazaar_discount",
    passive_value: 0.8
  },
  scholar: {
    name: "📖 Scholar",
    icon: "📖",
    description: "Collector of forbidden knowledge. 25% more loot from expeditions.",
    passive: "expedition_bonus",
    passive_value: 1.25
  },
  merchant: {
    name: "💼 Merchant",
    icon: "💼",
    description: "Trader extraordinaire. 10% daily bank interest.",
    passive: "daily_interest",
    passive_value: 0.1
  }
};

// ==================== DARK BAZAAR (Daily Shop) ==================

const BAZAAR_POOL = [
  { id: "murk_shard", name: "🔮 Murk Shard", price: 150, description: "Fragment of Murk power. Sell for +50%." },
  { id: "swamp_tonic", name: "🧪 Swamp Tonic", price: 200, description: "Grants +25% earnings for 1 hour." },
  { id: "ancient_coin", name: "💎 Ancient Coin", price: 100, description: "Worth 1.5x normal coins at bank." },
  { id: "trap_kit", name: "🪤 Trap Kit", price: 250, description: "Defend against robberies—one-time use." },
  { id: "fortune_scroll", name: "📜 Fortune Scroll", price: 300, description: "Reroll next dig/fish for better loot." },
  { id: "murk_map", name: "🗺️ Murk Map", price: 500, description: "Find hidden Murk zones for 24hrs." },
  { id: "void_essence", name: "✨ Void Essence", price: 800, description: "Increases max wallet capacity +500." }
];

function generateDailyBazaar() {
  const picked = [];
  const shuffled = [...BAZAAR_POOL].sort(() => Math.random() - 0.5);
  for (let i = 0; i < 5; i++) {
    picked.push(shuffled[i]);
  }
  return picked;
}

// ==================== CRAFTING RECIPES ==================

const RECIPES = {
  // Simple combos
  "murk_elixir": {
    name: "🔮 Murk Elixir (Master)",
    inputs: [
      { item: "swamp_tonic", qty: 2 },
      { item: "murk_shard", qty: 1 },
      { item: "ancient_coin", qty: 3 }
    ],
    output: { item: "murk_elixir", qty: 1 },
    reward_coins: 500,
    buff: { buff_id: "super_luck", duration: 7200000 }  // 2 hours: +30% rewards
  },
  "prestige_token": {
    name: "👑 Prestige Token",
    inputs: [
      { item: "void_essence", qty: 2 },
      { item: "murk_elixir", qty: 1 },
      { item: "fortune_scroll", qty: 5 }
    ],
    output: null,
    reward_coins: 0,
    effect: "prestige_unlock"  // unlocks prestige mode
  }
};

// ==================== BOUNTY SYSTEM ==================

async function cmdBounty(message, args, util) {
  const { economySettings, ecoPrefix, run: runCmd, get: getCmd } = util;
  
  if (!economySettings?.enabled) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Economy system is disabled." }] }).catch(() => {});
    return;
  }

  const subcommand = (args[0] || "").toLowerCase();

  if (subcommand === "list") {
    const bounties = await all(
      `SELECT * FROM bounties WHERE guild_id=? AND status='active' ORDER BY amount DESC LIMIT 10`,
      [message.guild.id]
    );

    if (bounties.length === 0) {
      await message.reply({ embeds: [{ color: 0x95a5a6, description: `📋 No active bounties. Use \`${ecoPrefix}bounty post @user <amount>\` to create one!` }] }).catch(() => {});
      return;
    }

    const list = bounties.map((b, i) => 
      `**${i + 1}.** <@${b.target_id}> — **${b.amount}** ${economySettings.currency_name}\nPosted by <@${b.poster_id}>`
    ).join("\n\n");

    await message.reply({ embeds: [{ color: 0xff6b6b, title: "💀 Bounty Board", description: list, footer: { text: `Use '${ecoPrefix}bounty claim <number>' to claim a bounty!` } }] }).catch(() => {});
    return;
  }

  if (subcommand === "post") {
    if (args.length < 2) {
      await message.reply({ embeds: [{ color: 0x9b59b6, title: "💀 Post a Bounty", description: `**Usage:** \`${ecoPrefix}bounty post @user <amount>\`\n\nPost a bounty on someone for coins! Anyone can claim it by targeting that user.` }] }).catch(() => {});
      return;
    }

    const target = message.mentions.users.first();
    if (!target) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Please mention a user to bounty." }] }).catch(() => {});
      return;
    }

    const amount = parseInt(args[2]);
    if (isNaN(amount) || amount < 50) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Minimum bounty is **50** coins." }] }).catch(() => {});
      return;
    }

    const poster = await getCmd(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`,
      [message.guild.id, message.author.id]);

    if (!poster || poster.balance < amount) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: `❌ You need **${amount}** ${economySettings.currency_name} to post this bounty!` }] }).catch(() => {});
      return;
    }

    await runCmd(`UPDATE user_economy SET balance=balance-? WHERE guild_id=? AND user_id=?`,
      [amount, message.guild.id, message.author.id]);

    const expiresAt = Date.now() + 604800000;
    await runCmd(
      `INSERT INTO bounties (guild_id, poster_id, target_id, amount, expires_at) VALUES (?, ?, ?, ?, ?)`,
      [message.guild.id, message.author.id, target.id, amount, expiresAt]
    );

    await message.reply({ embeds: [{ color: 0xff6b6b, title: "💀 Bounty Posted!", description: `**Target:** ${target}\n**Reward:** ${amount} ${economySettings.currency_name}\n**Expires:** <t:${Math.floor(expiresAt/1000)}:R>` }] }).catch(() => {});
    return;
  }

  if (subcommand === "claim") {
    const bountyId = parseInt(args[1]);
    if (isNaN(bountyId)) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Invalid bounty ID." }] }).catch(() => {});
      return;
    }

    const bounty = await getCmd(`SELECT * FROM bounties WHERE id=? AND status='active' AND guild_id=?`,
      [bountyId, message.guild.id]);

    if (!bounty) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Bounty not found or already claimed." }] }).catch(() => {});
      return;
    }

    if (message.author.id === bounty.target_id) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ You can't claim a bounty on yourself!" }] }).catch(() => {});
      return;
    }

    await runCmd(`UPDATE bounties SET claimed_by=?, claimed_at=?, status='claimed' WHERE id=?`,
      [message.author.id, Date.now(), bountyId]);
    await runCmd(`UPDATE user_economy SET balance=balance+? WHERE guild_id=? AND user_id=?`,
      [bounty.amount, message.guild.id, message.author.id]);

    await message.reply({ embeds: [{ color: 0x2ecc71, title: "💀 Bounty Claimed!", description: `You earned **${bounty.amount}** ${economySettings.currency_name}!\n**Target was:** <@${bounty.target_id}>` }] }).catch(() => {});
    return;
  }

  await message.reply({ embeds: [{ color: 0x9b59b6, title: "💀 Bounty Board", description: `\`${ecoPrefix}bounty list\` — See all active bounties\n\`${ecoPrefix}bounty post @user <amount>\` — Post a bounty\n\`${ecoPrefix}bounty claim <id>\` — Claim reward` }] }).catch(() => {});
}

// ==================== CRAFTING SYSTEM ==================

async function cmdCraft(message, args, util) {
  const { economySettings, ecoPrefix, run: runCmd, get: getCmd } = util;
  
  if (!economySettings?.enabled) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Economy system is disabled." }] }).catch(() => {});
    return;
  }

  if (!args[0]) {
    const recipes = Object.entries(RECIPES).map(([key, recipe]) =>
      `**${recipe.name}**\nInputs: ${recipe.inputs.map(i => `${i.qty}x ${i.item}`).join(", ")}`
    ).join("\n\n");

    await message.reply({ embeds: [{
      color: 0x7b68ee,
      title: "⚙️ ℂ𝕣𝕒𝕗𝕥𝕚𝕟𝕘 ℝ𝕖𝕔𝕚𝕡𝕖𝕤",
      description: recipes,
      footer: { text: `Use craft <recipe> to craft!` }
    }] }).catch(() => {});
    return;
  }

  const recipeName = args[0].toLowerCase();
  const recipe = RECIPES[recipeName];

  if (!recipe) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Recipe not found. Use `craft` to see available recipes." }] }).catch(() => {});
    return;
  }

  // Check inputs
  for (const input of recipe.inputs) {
    const inv = await getCmd(
      `SELECT * FROM user_inventory WHERE guild_id=? AND user_id=? AND item_id=?`,
      [message.guild.id, message.author.id, input.item]
    );

    if (!inv || inv.quantity < input.qty) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: `❌ You need **${input.qty}x ${input.item}** to craft this!` }] }).catch(() => {});
      return;
    }
  }

  // Consume inputs
  for (const input of recipe.inputs) {
    await runCmd(
      `UPDATE user_inventory SET quantity=quantity-? WHERE guild_id=? AND user_id=? AND item_id=?`,
      [input.qty, message.guild.id, message.author.id, input.item]
    );
  }

  // Give output
  if (recipe.output) {
    await runCmd(
      `INSERT INTO user_inventory (guild_id, user_id, item_id, quantity) VALUES (?, ?, ?, ?)
       ON CONFLICT (guild_id, user_id, item_id) DO UPDATE SET quantity = user_inventory.quantity + ?`,
      [message.guild.id, message.author.id, recipe.output.item, recipe.output.qty, recipe.output.qty]
    );
  }

  // Apply buff if present
  if (recipe.buff) {
    await runCmd(
      `INSERT INTO user_buffs (guild_id, user_id, buff_id, expires_at) VALUES (?, ?, ?, ?)`,
      [message.guild.id, message.author.id, recipe.buff.buff_id, Date.now() + recipe.buff.duration]
    );
  }

  // Give coins
  if (recipe.reward_coins > 0) {
    await runCmd(
      `UPDATE user_economy SET balance=balance+? WHERE guild_id=? AND user_id=?`,
      [recipe.reward_coins, message.guild.id, message.author.id]
    );
  }

  // Special: prestige unlock
  if (recipe.effect === "prestige_unlock") {
    await runCmd(
      `UPDATE user_economy SET prestige_level=prestige_level+1 WHERE guild_id=? AND user_id=?`,
      [message.guild.id, message.author.id]
    );

    const updatedPrestige = await getCmd(
      `SELECT prestige_level FROM user_economy WHERE guild_id=? AND user_id=?`,
      [message.guild.id, message.author.id]
    );

    await runCmd(
      `INSERT INTO prestige_log (guild_id, user_id, prestige_level) VALUES (?, ?, ?)`,
      [message.guild.id, message.author.id, Number(updatedPrestige?.prestige_level || 0)]
    );
  }

  await message.reply({ embeds: [{ color: 0x7b68ee, title: "✨ Crafted!", description: `Successfully crafted **${recipe.name}**!${recipe.reward_coins > 0 ? `\n\n💰 Bonus: +${recipe.reward_coins} ${economySettings.currency_name}` : ""}` }] }).catch(() => {});
}

// ==================== PRESTIGE SYSTEM ==================

async function cmdPrestige(message, args, util) {
  const { economySettings, ecoPrefix, run: runCmd, get: getCmd } = util;
  
  if (!economySettings?.enabled) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Economy system is disabled." }] }).catch(() => {});
    return;
  }

  await runCmd(`INSERT INTO user_economy (guild_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING`,
    [message.guild.id, message.author.id]);

  const econ = await getCmd(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`,
    [message.guild.id, message.author.id]);

  if (args[0]?.toLowerCase() === "ascend") {
    if (econ.prestige_level === 0) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ You must craft a **Prestige Token** first before ascending!" }] }).catch(() => {});
      return;
    }

    const multiplier = 1 + (econ.prestige_level * 0.2);
    const awardedBalance = Math.floor(econ.total_earned * multiplier);

    await runCmd(
      `UPDATE user_economy SET balance=?, total_earned=0, prestige_level=0 WHERE guild_id=? AND user_id=?`,
      [awardedBalance, message.guild.id, message.author.id]
    );

    await message.reply({ embeds: [new EmbedBuilder().setColor(0xffd700).setTitle("👑 𝔸𝕊ℂ𝔼ℕ𝔻𝔼𝔻!").setDescription(`You've become a Murk God!\n\n💰 **Prestige Reward:** ${awardedBalance} ${economySettings.currency_name}\n📊 **Multiplier:** ${multiplier}x your lifetime earnings`)] }).catch(() => {});
    return;
  }

  const embed = {
    color: 0xffd700,
    title: "👑 ℙ𝕣𝕖𝕤𝕥𝕚𝕘𝕖 𝕊𝕥𝕒𝕥𝕦𝕤",
    fields: [
      { name: "Level", value: `${econ.prestige_level}`, inline: true },
      { name: "Lifetime Earnings", value: `${econ.total_earned}`, inline: true },
      { name: "Current Balance", value: `${econ.balance} ${economySettings.currency_name}`, inline: true },
      { name: "Ascend Multiplier", value: `${1 + (econ.prestige_level * 0.2)}x`, inline: true }
    ],
    footer: { text: "Craft Prestige Tokens to increase your prestige level!" }
  };

  await message.reply({ embeds: [embed] }).catch(() => {});
}

// ==================== CLASS SELECTION ==================

async function cmdClass(message, args, util) {
  const { economySettings, ecoPrefix, run: runCmd, get: getCmd } = util;
  
  if (!economySettings?.enabled) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Economy system is disabled." }] }).catch(() => {});
    return;
  }

  if (!args[0]) {
    const classList = Object.entries(MURK_CLASSES).map(([key, cls]) =>
      `**${cls.name}**\n${cls.description}`
    ).join("\n\n");

    await message.reply({ embeds: [{
      color: 0x00d4ff,
      title: "⚔️ 𝕄𝕦𝕣𝕜 𝔸𝕣𝕔𝕙𝕖𝕥𝕪𝕡𝕖𝕤",
      description: classList,
      footer: { text: `Choose: class select <brigand|artificer|scholar|merchant>` }
    }] }).catch(() => {});
    return;
  }

  // Support both "$class merchant" and "$class select merchant"
  const rawArg = args[0]?.toLowerCase();
  const classKey = rawArg === "select" ? args[1]?.toLowerCase() : rawArg;
  const murk_class = classKey ? MURK_CLASSES[classKey] : null;

  if (!murk_class) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Invalid class! Choose: `brigand`, `artificer`, `scholar`, or `merchant`." }] }).catch(() => {});
    return;
  }

  await runCmd(
    `INSERT INTO user_class (guild_id, user_id, class_id) VALUES (?, ?, ?)
     ON CONFLICT (guild_id, user_id) DO UPDATE SET class_id = ?`,
    [message.guild.id, message.author.id, classKey, classKey]
  );

  await message.reply({ embeds: [{ color: 0x00d4ff, title: `⚔️ Class Chosen: ${murk_class.name}`, description: murk_class.description }] }).catch(() => {});
}

// ==================== SWAMP STORY SYSTEM ====================

const SWAMP_STORIES = {
  "frog_prince": {
    title: "🐸 The Frog Prince's Curse",
    chapters: {
      1: {
        text: "You find a frog sitting on a lily pad, wearing a tiny crown. It croaks: 'Help me, adventurer! I've been cursed by the Swamp Witch!'",
        choices: [
          { text: "Kiss the frog", consequence: "kiss_frog", reward: "frog_kiss", death_chance: 0.1 },
          { text: "Ignore and walk away", consequence: "ignore_frog", reward: null },
          { text: "Capture the frog", consequence: "capture_frog", reward: "frog_prisoner" }
        ]
      },
      2: {
        text: "The frog transforms into a handsome prince! But wait... he's actually a lizard in disguise!",
        choices: [
          { text: "Accept his thanks and leave", consequence: "accept_thanks", reward: "royal_blessing" },
          { text: "Demand payment", consequence: "demand_payment", reward: "prince_gold" },
          { text: "Challenge him to a duel", consequence: "duel_prince", reward: "prince_scales", death_chance: 0.3 }
        ]
      }
    }
  },
  "swamp_witch": {
    title: "🧙‍♀️ The Swamp Witch's Brew",
    chapters: {
      1: {
        text: "Deep in the misty swamp, you find a bubbling cauldron. The Swamp Witch cackles: 'What do you seek, little tadpole?'",
        choices: [
          { text: "Ask for a potion of strength", consequence: "strength_potion", reward: "strength_elixir" },
          { text: "Ask for eternal youth", consequence: "youth_potion", reward: "youth_serum", death_chance: 0.2 },
          { text: "Try to steal her ingredients", consequence: "steal_ingredients", reward: "witch_herbs", death_chance: 0.5 }
        ]
      }
    }
  },
  "dragon_lair": {
    title: "🐉 The Dragon's Treasure",
    chapters: {
      1: {
        text: "You discover a cave entrance guarded by a sleeping dragon. Treasure glitters inside!",
        choices: [
          { text: "Sneak past the dragon", consequence: "sneak_past", reward: "dragon_gold", death_chance: 0.4 },
          { text: "Fight the dragon", consequence: "fight_dragon", reward: "dragon_scales", death_chance: 0.8 },
          { text: "Befriend the dragon", consequence: "befriend_dragon", reward: "dragon_friendship" }
        ]
      }
    }
  }
};

const SWAMP_EVENTS = [
  {
    id: "mosquito_swarm",
    title: "🦟 Mosquito Swarm Attack!",
    description: "A massive swarm of bloodthirsty mosquitoes descends upon you!",
    choices: [
      { text: "Swat them away", success: 0.6, reward: "mosquito_wings", consequence: "You fight them off but get bitten!" },
      { text: "Run away", success: 1.0, reward: null, consequence: "You escape but lose your dignity!" },
      { text: "Use bug spray", requires: "bug_spray", reward: "mosquito_slaughter", consequence: "The swarm is annihilated!" }
    ]
  },
  {
    id: "crocodile_ambush",
    title: "🐊 Crocodile Ambush!",
    description: "A massive crocodile bursts from the water, jaws snapping!",
    choices: [
      { text: "Fight back with your bare hands", success: 0.2, reward: "croc_teeth", consequence: "Miraculously, you survive!", death_chance: 0.8 },
      { text: "Use a fishing rod as a weapon", requires: "fishing_rod", success: 0.7, reward: "croc_skin", consequence: "You hook the croc and win!" },
      { text: "Jump on its back", success: 0.4, reward: "croc_ride", consequence: "You tame the beast!" }
    ]
  },
  {
    id: "treasure_chest",
    title: "💰 Mysterious Treasure Chest",
    description: "You find a chest half-buried in the mud. It might be trapped!",
    choices: [
      { text: "Open it carefully", success: 0.8, reward: "random_treasure", consequence: "You find valuable items!" },
      { text: "Smash it open", success: 0.6, reward: "broken_treasure", consequence: "Some items break, but you get others!" },
      { text: "Leave it alone", success: 1.0, reward: null, consequence: "Better safe than sorry." }
    ]
  }
];

const DEATH_SCENARIOS = [
  "🐊 You were eaten by a crocodile!",
  "🦟 You were drained dry by mosquitoes!",
  "🐍 You stepped on a venomous snake!",
  "🕷️ You were bitten by a giant spider!",
  "🌿 You ate poisonous swamp berries!",
  "💧 You drowned in quicksand!",
  "🐺 You were mauled by swamp wolves!",
  "🧟 You were possessed by swamp spirits!"
];

const REVIVAL_METHODS = [
  { item: "revival_potion", name: "🧪 Revival Potion", description: "Brings you back from the dead" },
  { item: "frog_amulet", name: "🐸 Frog Amulet", description: "Protects against one death" },
  { item: "lizard_totem", name: "🦎 Lizard Totem", description: "Revives you with lizard magic" },
  { item: "swamp_blessing", name: "🌿 Swamp Blessing", description: "Nature's protection" }
];

// ==================== SWAMP ADVENTURE SYSTEM ====================

async function cmdAdventure(message, args, util) {
  const { economySettings, ecoPrefix, run: runCmd, get: getCmd } = util;

  if (!economySettings?.enabled) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Economy system is disabled." }] }).catch(() => {});
    return;
  }

  // Cooldown: 15 minutes
  const now = Date.now();
  const adventureCooldown = 900000;
  const lastAdventure = await getCmd(
    `SELECT * FROM minigames_stats WHERE guild_id=? AND user_id=? AND minigame='adventure' AND stat_name='last_adventure'`,
    [message.guild.id, message.author.id]
  );
  if (lastAdventure?.last_played && (now - lastAdventure.last_played) < adventureCooldown) {
    const timeLeft = adventureCooldown - (now - lastAdventure.last_played);
    const minutes = Math.floor(timeLeft / 60000);
    const seconds = Math.floor((timeLeft % 60000) / 1000);
    await message.reply({ embeds: [{ color: 0xf39c12, description: `🗺️ You need to rest! Come back in **${minutes}m ${seconds}s**.` }] }).catch(() => {});
    return;
  }

  const storyId = args[0]?.toLowerCase();
  if (!storyId || !SWAMP_STORIES[storyId]) {
    const availableStories = Object.entries(SWAMP_STORIES).map(([id, story]) =>
      `**${id}** — ${story.title}`
    ).join('\n');

    await message.reply({ embeds: [new EmbedBuilder()
      .setColor(0x2d6a4f)
      .setTitle("🗺️ 𝕊𝕨𝕒𝕞𝕡 𝔸𝕕𝕧𝕖𝕟𝕥𝕦𝕣𝕖𝕤")
      .setDescription(`Choose an adventure to begin:\n\n${availableStories}\n\n**Usage:** \`${ecoPrefix}adventure <story_id>\``)
    ] }).catch(() => {});
    return;
  }

  const story = SWAMP_STORIES[storyId];
  const progress = await getCmd(
    `SELECT * FROM story_progress WHERE guild_id=? AND user_id=? AND story_id=?`,
    [message.guild.id, message.author.id, storyId]
  );

  const currentChapter = progress?.chapter || 1;
  const chapter = story.chapters[currentChapter];

  if (!chapter) {
    await message.reply({ embeds: [{ color: 0xf1c40f, title: `✅ ${story.title}`, description: "You have **completed** this adventure! Well done, Murk Adept." }] }).catch(() => {});
    return;
  }

  const choicesText = chapter.choices.map((choice, i) => `**${i + 1}.** ${choice.text}`).join('\n');

  await message.reply({ embeds: [new EmbedBuilder()
    .setColor(0x2d6a4f)
    .setTitle(`📖 ${story.title} — Chapter ${currentChapter}`)
    .setDescription(`${chapter.text}\n\n**Choices:**\n${choicesText}\n\n*Reply with the number of your choice within 30 seconds!*`)
  ] }).catch(() => {});

  const filter = (m) => m.author.id === message.author.id && /^\d+$/.test(m.content.trim());
  const collector = message.channel.createMessageCollector({ filter, time: 30000, max: 1 });

  collector.on('collect', async (choiceMsg) => {
    const choiceIndex = parseInt(choiceMsg.content.trim()) - 1;
    const choice = chapter.choices[choiceIndex];

    if (!choice) {
      await choiceMsg.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Invalid choice number!" }] }).catch(() => {});
      return;
    }

    if (choice.death_chance && Math.random() < choice.death_chance) {
      await handleDeath(message, util, `You died during **${story.title}**! ${DEATH_SCENARIOS[Math.floor(Math.random() * DEATH_SCENARIOS.length)]}`);
      return;
    }

    let rewardText = "";
    if (choice.reward) {
      await giveReward(message, choice.reward, util);
      rewardText = `\n\n🎁 **Reward:** ${choice.reward.replace(/_/g, ' ')}!`;
    }

    const nextChapter = currentChapter + 1;
    const isCompleted = !story.chapters[nextChapter];

    await runCmd(
      `INSERT INTO story_progress (guild_id, user_id, story_id, chapter, completed, last_updated)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (guild_id, user_id, story_id) DO UPDATE SET chapter=?, completed=?, last_updated=?`,
      [message.guild.id, message.author.id, storyId, nextChapter, isCompleted ? 1 : 0, Date.now(), nextChapter, isCompleted ? 1 : 0, Date.now()]
    );

    // Record cooldown
    await runCmd(
      `INSERT INTO minigames_stats (guild_id, user_id, minigame, stat_name, stat_value, last_played)
       VALUES (?, ?, 'adventure', 'last_adventure', 1, ?)
       ON CONFLICT (guild_id, user_id, minigame, stat_name) DO UPDATE SET stat_value=minigames_stats.stat_value+1, last_played=?`,
      [message.guild.id, message.author.id, now, now]
    );

    const completionText = isCompleted ? "\n\n🏆 **Adventure Completed!**" : `\n\n📖 Continue to Chapter ${nextChapter} next time...`;
    await choiceMsg.reply({ embeds: [new EmbedBuilder()
      .setColor(isCompleted ? 0xf1c40f : 0x2ecc71)
      .setTitle("✅ ℂ𝕙𝕠𝕚𝕔𝕖 𝕄𝕒𝕕𝕖")
      .setDescription(`**${choice.text}**${rewardText}${completionText}`)
    ] }).catch(() => {});
  });

  collector.on('end', (collected, reason) => {
    if (reason === 'time') {
      message.reply({ embeds: [{ color: 0x95a5a6, description: "⏰ Time's up! Adventure paused — use the command again to continue." }] }).catch(() => {});
    }
  });
}

// ==================== RANDOM SWAMP EVENTS ====================

async function cmdExplore(message, args, util) {
  const { economySettings, ecoPrefix, run: runCmd, get: getCmd } = util;

  if (!economySettings?.enabled) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Economy system is disabled." }] }).catch(() => {});
    return;
  }

  const lastExplore = await getCmd(
    `SELECT * FROM minigames_stats WHERE guild_id=? AND user_id=? AND minigame='exploration' AND stat_name='last_explore'`,
    [message.guild.id, message.author.id]
  );

  const now = Date.now();
  const cooldown = 600000;
  if (lastExplore?.last_played && (now - lastExplore.last_played) < cooldown) {
    const timeLeft = cooldown - (now - lastExplore.last_played);
    const minutes = Math.floor(timeLeft / 60000);
    const seconds = Math.floor((timeLeft % 60000) / 1000);
    await message.reply({ embeds: [{ color: 0xf39c12, description: `🌿 You're still recovering! Come back in **${minutes}m ${seconds}s**.` }] }).catch(() => {});
    return;
  }

  const event = SWAMP_EVENTS[Math.floor(Math.random() * SWAMP_EVENTS.length)];
  const choicesText = event.choices.map((choice, i) => `**${i + 1}.** ${choice.text}`).join('\n');

  await message.reply({ embeds: [new EmbedBuilder()
    .setColor(0x27ae60)
    .setTitle(`🗺️ ${event.title}`)
    .setDescription(`${event.description}\n\n**Choices:**\n${choicesText}\n\n*Reply with the number of your choice within 30 seconds!*`)
  ] }).catch(() => {});

  const filter = (m) => m.author.id === message.author.id && /^\d+$/.test(m.content.trim());
  const collector = message.channel.createMessageCollector({ filter, time: 30000, max: 1 });

  collector.on('collect', async (choiceMsg) => {
    const choiceIndex = parseInt(choiceMsg.content.trim()) - 1;
    const choice = event.choices[choiceIndex];

    if (!choice) {
      await choiceMsg.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Invalid choice number!" }] }).catch(() => {});
      return;
    }

    if (choice.requires) {
      const hasItem = await getCmd(
        `SELECT * FROM user_inventory WHERE guild_id=? AND user_id=? AND item_id=? AND quantity > 0`,
        [message.guild.id, message.author.id, choice.requires]
      );
      if (!hasItem) {
        await choiceMsg.reply({ embeds: [{ color: 0xe74c3c, description: `❌ You need a **${choice.requires.replace(/_/g, ' ')}** for this!` }] }).catch(() => {});
        return;
      }
    }

    const success = Math.random() < choice.success;
    if (!success) {
      await choiceMsg.reply({ embeds: [{ color: 0xe74c3c, title: "❌ Failed", description: choice.consequence }] }).catch(() => {});
    } else {
      let rewardText = "";
      if (choice.reward) {
        await giveReward(message, choice.reward, util);
        rewardText = `\n\n🎁 **Reward:** ${choice.reward.replace(/_/g, ' ')}!`;
      }
      await choiceMsg.reply({ embeds: [{ color: 0x2ecc71, title: "✅ Success!", description: `${choice.consequence}${rewardText}` }] }).catch(() => {});
    }

    await runCmd(
      `INSERT INTO minigames_stats (guild_id, user_id, minigame, stat_name, stat_value, last_played)
       VALUES (?, ?, 'exploration', 'last_explore', 1, ?)
       ON CONFLICT (guild_id, user_id, minigame, stat_name) DO UPDATE SET stat_value=minigames_stats.stat_value+1, last_played=?`,
      [message.guild.id, message.author.id, now, now]
    );
  });

  collector.on('end', (collected, reason) => {
    if (reason === 'time') {
      message.reply({ embeds: [{ color: 0x95a5a6, description: "⏰ Time's up! Exploration cancelled." }] }).catch(() => {});
    }
  });
}

// ==================== DEATH AND REVIVAL SYSTEM ====================

async function handleDeath(message, util, deathMessage) {
  const { run: runCmd, get: getCmd } = util;

  for (const revival of REVIVAL_METHODS) {
    const item = await getCmd(
      `SELECT * FROM user_inventory WHERE guild_id=? AND user_id=? AND item_id=? AND quantity > 0`,
      [message.guild.id, message.author.id, revival.item]
    );

    if (item) {
      await runCmd(
        `UPDATE user_inventory SET quantity=quantity-1 WHERE guild_id=? AND user_id=? AND item_id=?`,
        [message.guild.id, message.author.id, revival.item]
      );
      await message.reply({ embeds: [{ color: 0x9b59b6, title: "💀 Near Death...", description: `${deathMessage}\n\nBut... **${revival.name}** saves you!\n${revival.description}` }] }).catch(() => {});
      return;
    }
  }

  await message.reply({ embeds: [new EmbedBuilder()
    .setColor(0x2c2c2c)
    .setTitle("💀 𝕐𝕠𝕦 ℍ𝕒𝕧𝕖 𝔻𝕚𝕖𝕕!")
    .setDescription(`${deathMessage}\n\n**You lost half your wallet!**\n\n💡 **Ways to revive in future:**\n${REVIVAL_METHODS.map(r => `• ${r.name} — ${r.description}`).join('\n')}\n\nBuy revival items from the shop!`)
  ] }).catch(() => {});

  await runCmd(
    `UPDATE user_economy SET balance=FLOOR(balance*0.5) WHERE guild_id=? AND user_id=?`,
    [message.guild.id, message.author.id]
  );
}

// ==================== REWARD SYSTEM ====================

async function giveReward(message, rewardType, util) {
  const { economySettings, run: runCmd } = util;

  const rewards = {
    "frog_kiss":          { money: 400,   item: "frog_blessing" },
    "royal_blessing":     { money: 1500,  item: "crown_jewel" },
    "prince_gold":        { money: 3500  },
    "prince_scales":      { item: "lizard_scales" },
    "strength_elixir":    { item: "strength_potion" },
    "youth_serum":        { item: "youth_potion" },
    "witch_herbs":        { item: "magical_herbs" },
    "dragon_gold":        { money: 8000  },
    "dragon_scales":      { item: "dragon_scales" },
    "dragon_friendship":  { item: "dragon_egg",  money: 2000 },
    "mosquito_wings":     { money: 250,  item: "insect_wings" },
    "mosquito_slaughter": { money: 600,  item: "bug_spray" },
    "croc_teeth":         { item: "crocodile_teeth", money: 500 },
    "croc_skin":          { item: "crocodile_hide",  money: 800 },
    "croc_ride":          { item: "crocodile_whistle", money: 300 },
    "random_treasure":    { money: Math.floor(Math.random() * 2000) + 500 },
    "broken_treasure":    { money: Math.floor(Math.random() * 1000) + 200 }
  };

  const reward = rewards[rewardType];
  if (!reward) return;

  if (reward.money) {
    await runCmd(`UPDATE user_economy SET balance=balance+? WHERE guild_id=? AND user_id=?`,
      [reward.money, message.guild.id, message.author.id]);
  }

  if (reward.item) {
    await runCmd(
      `INSERT INTO user_inventory (guild_id, user_id, item_id, quantity)
       VALUES (?, ?, ?, 1)
       ON CONFLICT (guild_id, user_id, item_id)
       DO UPDATE SET quantity = user_inventory.quantity + 1`,
      [message.guild.id, message.author.id, reward.item]
    );
  }
}

// ==================== MURK SHOP CATALOG ====================

const MURK_CATALOG = [
  {
    item_id: "fishing_rod",
    name: "🎣 Fishing Rod",
    price: 300,
    item_type: "tool",
    description: "A gnarled rod carved from swamp oak. Required to fish in the murky waters.",
    item_image_url: "https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/72x72/1f3a3.png",
    use_effect: "fishing_rod",
    lore: "The Murk fishermen say the rod chooses the catch. A crooked rod catches crooked fish."
  },
  {
    item_id: "shovel",
    name: "⛏️ Rusty Shovel",
    price: 250,
    item_type: "tool",
    description: "A well-worn shovel caked with dried mud. Required for digging in the swamp.",
    item_image_url: "https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/72x72/26cf.png",
    use_effect: "shovel",
    lore: "What lies beneath the swamp floor? Gold, bones, or something far worse?"
  },
  {
    item_id: "swamp_tonic",
    name: "🧪 Swamp Tonic",
    price: 200,
    item_type: "consumable",
    description: "A bubbling green brew. Boosts all earnings by 20% for 1 hour.",
    item_image_url: "https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/72x72/1f9ea.png",
    use_effect: "swamp_tonic",
    lore: "Brewed by Mama Gretch, who hasn't been seen since the last bog incident."
  },
  {
    item_id: "revival_potion",
    name: "💜 Revival Potion",
    price: 500,
    item_type: "consumable",
    description: "A violet vial that revives you from near-death. Fully restores lost coins on death.",
    item_image_url: "https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/72x72/1f49c.png",
    use_effect: "revival_potion",
    lore: "The taste is indescribable. Most survivors refuse to describe it anyway."
  },
  {
    item_id: "padlock",
    name: "🔒 Padlock",
    price: 250,
    item_type: "consumable",
    description: "Secures your wallet from thieves. Grants 4-hour robbery immunity when used.",
    item_image_url: "https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/72x72/1f512.png",
    use_effect: "padlock",
    lore: "The lock doesn't keep them out. It just makes them choose someone easier."
  },
  {
    item_id: "trap_kit",
    name: "🪤 Trap Kit",
    price: 350,
    item_type: "consumable",
    description: "Sets an invisible trap. The next person to rob you loses 20% of their wallet instead.",
    item_image_url: "https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/72x72/1fa64.png",
    use_effect: "trap_kit",
    lore: "Snap. Found it."
  },
  {
    item_id: "fortune_scroll",
    name: "📜 Fortune Scroll",
    price: 400,
    item_type: "consumable",
    description: "An ancient parchment. Reading it grants a random coin bonus of 50–500.",
    item_image_url: "https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/72x72/1f4dc.png",
    use_effect: "fortune_scroll",
    lore: "The ink moves on its own. The scholars say it's just the humidity."
  },
  {
    item_id: "murk_map",
    name: "🗺️ Murk Map",
    price: 600,
    item_type: "consumable",
    description: "A hand-drawn map of the deep swamp. Doubles your explore loot for 2 hours.",
    item_image_url: "https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/72x72/1f5fa.png",
    use_effect: "murk_map",
    lore: "Drawn by someone who probably didn't survive the trip back."
  },
  {
    item_id: "void_essence",
    name: "🌑 Void Essence",
    price: 750,
    item_type: "consumable",
    description: "A vial of pure void energy. Use it to crystallize 3–8 free Murk Shards.",
    item_image_url: "https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/72x72/1f311.png",
    use_effect: "void_essence",
    lore: "It hums with a frequency that makes animals flee. Most animals."
  },
  {
    item_id: "ancient_coin",
    name: "🪙 Ancient Coin",
    price: 450,
    item_type: "consumable",
    description: "A pre-Murk currency. Sell it to a merchant for 1.5x its purchase value.",
    item_image_url: "https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/72x72/1fa99.png",
    use_effect: "ancient_coin",
    lore: "The face on the coin blinks if you look at it long enough."
  },
  {
    item_id: "murk_shard",
    name: "🔷 Murk Shard",
    price: 150,
    item_type: "material",
    description: "A crystallized fragment of the Murk's dark energy. Core crafting material.",
    item_image_url: "https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/72x72/1f537.png",
    use_effect: null,
    lore: "Found in the deepest bog pools, glowing faintly blue. Do not taste it."
  },
  {
    item_id: "shadow_cloak",
    name: "🌑 Shadow Cloak",
    price: 900,
    item_type: "consumable",
    description: "A cloak woven from Murk shadows. Makes you completely unrobbable for 2 hours.",
    item_image_url: "https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/72x72/1f9e5.png",
    use_effect: "shadow_cloak",
    lore: "You don't hide in shadows. You ARE shadows."
  },
  {
    item_id: "lucky_charm",
    name: "🍀 Lucky Charm",
    price: 700,
    item_type: "consumable",
    description: "A four-leaf clover in swamp resin. +20% earnings boost for 6 hours.",
    item_image_url: "https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/72x72/1f340.png",
    use_effect: "lucky_charm",
    lore: "Lucky in coins, unlucky in everything else. Ask the previous owner."
  },
  {
    item_id: "gamblers_dice",
    name: "🎲 Gambler's Dice",
    price: 800,
    item_type: "consumable",
    description: "Cursed dice from a lost game. 40% chance to triple your wallet — or lose 40%.",
    item_image_url: "https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/72x72/1f3b2.png",
    use_effect: "gamblers_dice",
    lore: "The losing player is never seen again. The winning player wishes they weren't."
  },
  {
    item_id: "merchants_lens",
    name: "🔍 Merchant's Lens",
    price: 550,
    item_type: "consumable",
    description: "A magnifying glass that reveals another user's exact wallet & bank balance.",
    item_image_url: "https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/72x72/1f50d.png",
    use_effect: "merchants_lens",
    lore: "Knowledge is power. Knowing someone's balance is dangerous power."
  },
  {
    item_id: "frog_amulet",
    name: "🐸 Frog Amulet",
    price: 650,
    item_type: "single",
    description: "A carved frog totem from the Murk. Permanently boosts daily rewards by 15%.",
    item_image_url: "https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/72x72/1f438.png",
    use_effect: "frog_amulet",
    lore: "The Murk frogs don't blink. They just wait. Wearing this makes you wait with them."
  },
  {
    item_id: "lizard_totem",
    name: "🦎 Lizard Totem",
    price: 850,
    item_type: "single",
    description: "An ancient carved totem. Passively regenerates +50 coins per hour forever.",
    item_image_url: "https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/72x72/1f98e.png",
    use_effect: "lizard_totem",
    lore: "The lizards built something once. Then the Murk came. The totems remember."
  },
  {
    item_id: "witch_brew",
    name: "🫖 Witch's Brew",
    price: 650,
    item_type: "consumable",
    description: "Unstable brew from Baba Murk. 50/50: DOUBLES your wallet or halves it.",
    item_image_url: "https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/72x72/1fad6.png",
    use_effect: "witch_brew",
    lore: "She cackled when she handed it over. That's either a good sign or a very bad one."
  },
  {
    item_id: "prestige_token",
    name: "⭐ Prestige Token",
    price: 2000,
    item_type: "single",
    description: "A glowing token of exceptional status. Required for the Prestige Ascension ritual.",
    item_image_url: "https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/72x72/2b50.png",
    use_effect: "prestige_use",
    lore: "It whispers your name. It knows what you've sacrificed to get here."
  },
  {
    item_id: "dragon_scale",
    name: "🐉 Dragon Scale",
    price: 1200,
    item_type: "consumable",
    description: "A mythical scale from the Murk Serpent. 2x ALL earnings for 3 hours.",
    item_image_url: "https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/72x72/1f409.png",
    use_effect: "dragon_scale",
    lore: "The Murk Serpent doesn't shed scales. Someone took this. We don't ask how."
  },
  {
    item_id: "trophy",
    name: "🏆 Swamp Trophy",
    price: 1000,
    item_type: "collectible",
    description: "A prestigious collectible awarded to Murk survivors. Pure bragging rights.",
    item_image_url: "https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/72x72/1f3c6.png",
    use_effect: null,
    lore: "The inscription reads: 'They survived. Somehow. We're still confused.'"
  },
  {
    item_id: "frog_crown",
    name: "👑 Frog Crown",
    price: 1500,
    item_type: "single",
    description: "The legendary crown of the Murk Frog King. +25% daily & weekly bonus permanently.",
    item_image_url: "https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/72x72/1f451.png",
    use_effect: "frog_crown",
    lore: "The Frog King didn't surrender it willingly. No one talks about what happened."
  },
  {
    item_id: "black_market_pass",
    name: "🎭 Black Market Pass",
    price: 1800,
    item_type: "single",
    description: "A forged pass to The Dark Bazaar. Permanently unlocks dark market trades.",
    item_image_url: "https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/72x72/1f3ad.png",
    use_effect: "black_market_pass",
    lore: "Don't ask where it came from. Don't ask what the stamp means."
  },
  {
    item_id: "murk_lantern",
    name: "🏮 Murk Lantern",
    price: 500,
    item_type: "consumable",
    description: "A lantern burning swamp gas. Doubles explore loot for 2 hours when lit.",
    item_image_url: "https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/72x72/1f3ee.png",
    use_effect: "murk_lantern",
    lore: "Burns green. Smells worse. Finds treasure though."
  },
  {
    item_id: "cursed_compass",
    name: "🧭 Cursed Compass",
    price: 750,
    item_type: "consumable",
    description: "Points to buried treasure... or danger. 65% chance for a 200–1000 coin jackpot.",
    item_image_url: "https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/72x72/1f9ed.png",
    use_effect: "cursed_compass",
    lore: "It always points north. Unfortunately, north is where the screaming comes from."
  }
];

// ==================== HEIST SYSTEM ====================

const HEIST_SCENARIOS = [
  { name: "Murk Vault Heist",        intro: "🏦 You case the Murk City Vault, studying guard rotations and laser grids...", successStory: "You crack the vault door with a custom pick and slip out through the sewers undetected!", failStory: "A silent alarm trips — you barely escape with the police hot on your heels." },
  { name: "Bog Baron Mansion",        intro: "🏚️ The Bog Baron is hosting a gala tonight — perfect cover to slip inside...",           successStory: "You swap into a waiter's uniform, pocket the jewels, and waltz out the front door.",              failStory: "A guard recognizes your face from a wanted poster. You drop everything and run." },
  { name: "Swamp Treasury Run",       intro: "💧 The swamp treasury moves shipments by boat at midnight — you wait in the reeds...",  successStory: "You leap aboard, overpower the guards, and make off with a chest of Murk coin!",            failStory: "The boat was a decoy. You surface to a dozen crossbow bolts aimed at you." },
  { name: "Void Crystal Smugglers",   intro: "🔮 Intel says a void crystal shipment passes through tonight — risky but lucrative...", successStory: "You ambush the courier in the fog and vanish with the crystals before dawn.",               failStory: "The smugglers were tipped off. You walk into an ambush and flee empty-handed." },
  { name: "Ancient Relic Exchange",   intro: "🏺 A shady dealer is trading relics in the back alleys of Murk Market...",             successStory: "You pocket the relics during the exchange and disappear into the crowd.",                    failStory: "The dealer had a bodyguard you didn't account for. You escape, barely." },
];

async function cmdHeist(message, args, util) {
  const { economySettings, ecoPrefix, run: runCmd, get: getCmd } = util;

  if (!economySettings?.enabled) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Economy system is disabled." }] }).catch(() => {});
    return;
  }

  await runCmd(`INSERT INTO user_economy (guild_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING`,
    [message.guild.id, message.author.id]);

  const stats = await getCmd(
    `SELECT * FROM minigames_stats WHERE guild_id=? AND user_id=? AND minigame='heist' AND stat_name='last_heist'`,
    [message.guild.id, message.author.id]
  );

  const now = Date.now();
  const cooldown = 7200000; // 2 hours

  if (stats?.last_played && (now - stats.last_played) < cooldown) {
    const timeLeft = cooldown - (now - stats.last_played);
    const minutes = Math.floor(timeLeft / 60000);
    await message.reply({ embeds: [{ color: 0xf39c12, description: `🚔 You're laying low after the last job. Try again in **${minutes}m**.` }] }).catch(() => {});
    return;
  }

  const economy = await getCmd(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`,
    [message.guild.id, message.author.id]);
  if (!economy) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Economy data missing. Try again." }] }).catch(() => {});
    return;
  }

  const scenario = HEIST_SCENARIOS[Math.floor(Math.random() * HEIST_SCENARIOS.length)];
  const heistCount = (stats?.stat_value || 0) + 1;

  // Brigand passive: 15% better success odds
  const robberClass = await getCmd(`SELECT class_id FROM user_class WHERE guild_id=? AND user_id=?`, [message.guild.id, message.author.id]);
  const baseSuccessRate = 0.40;
  const successRate = robberClass?.class_id === 'brigand' ? baseSuccessRate + 0.15 : baseSuccessRate;

  const success = Math.random() < successRate;

  await runCmd(
    `INSERT INTO minigames_stats (guild_id, user_id, minigame, stat_name, stat_value, last_played)
     VALUES (?, ?, 'heist', 'last_heist', ?, ?)
     ON CONFLICT (guild_id, user_id, minigame, stat_name) DO UPDATE SET stat_value=minigames_stats.stat_value+1, last_played=?`,
    [message.guild.id, message.author.id, heistCount, now, now]
  );

  if (success) {
    const winAmount = Math.floor(2000 + Math.random() * 8000); // 2000-10000
    await runCmd(`UPDATE user_economy SET balance=balance+? WHERE guild_id=? AND user_id=?`,
      [winAmount, message.guild.id, message.author.id]);
    await runCmd(`INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
      [message.guild.id, message.author.id, "heist", winAmount, `Heist: ${scenario.name}`]);
    const brigandNote = robberClass?.class_id === 'brigand' ? "\n\n🗡️ *Brigand passive: +15% success odds*" : "";
    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle(`💰 ℍ𝕖𝕚𝕤𝕥 𝕊𝕦𝕔𝕔𝕖𝕤𝕤!`)
      .setDescription(`**${scenario.name}**\n\n${scenario.intro}\n\n✅ *${scenario.successStory}*${brigandNote}`)
      .addFields(
        { name: "💵 Score", value: `+${winAmount} ${economySettings.currency_name}`, inline: true },
        { name: "🔢 Total Heists", value: `${heistCount}`, inline: true },
        { name: "💳 Balance", value: `${economy.balance + winAmount} ${economySettings.currency_name}`, inline: true }
      )
      .setFooter({ text: "Next heist available in 2 hours" });
    await message.reply({ embeds: [embed] }).catch(() => {});
  } else {
    const fine = Math.floor(economy.balance * 0.30);
    const newBalance = Math.max(0, economy.balance - fine);
    await runCmd(`UPDATE user_economy SET balance=? WHERE guild_id=? AND user_id=?`,
      [newBalance, message.guild.id, message.author.id]);
    await runCmd(`INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
      [message.guild.id, message.author.id, "heist_fail", -fine, `Failed heist: ${scenario.name}`]);
    const brigandNote = robberClass?.class_id === 'brigand' ? "\n\n🗡️ *Brigand passive: +15% success odds*" : "";
    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle(`🚔 ℍ𝕖𝕚𝕤𝕥 𝔽𝕒𝕚𝕝𝕖𝕕!`)
      .setDescription(`**${scenario.name}**\n\n${scenario.intro}\n\n❌ *${scenario.failStory}*${brigandNote}`)
      .addFields(
        { name: "💸 Fine Paid", value: `-${fine} ${economySettings.currency_name}`, inline: true },
        { name: "🔢 Total Heists", value: `${heistCount}`, inline: true },
        { name: "💳 Balance", value: `${newBalance} ${economySettings.currency_name}`, inline: true }
      )
      .setFooter({ text: "Next heist available in 2 hours" });
    await message.reply({ embeds: [embed] }).catch(() => {});
  }
}

// ==================== EXPORTS ====================

module.exports = {
  cmdFish,
  cmdDig,
  cmdMine,
  cmdHunt,
  cmdHeist,
  cmdRobBank,
  cmdPhone,
  cmdAdventure,
  cmdExplore,
  cmdBounty,
  cmdCraft,
  cmdPrestige,
  cmdClass,
  cmdUse,
  cmdItemInfo,
  cmdGift,
  handleDeath,
  giveReward,
  MURK_CLASSES,
  MURK_CATALOG,
  generateDailyBazaar
};

// ==================== FISH / DIG / MINE / HUNT LOOT TABLES ====================
// Weights must sum to exactly 1.0 per table.
// EV math is included in comments for balance reference.

const FISH_TYPES = [
  { name: "Pebble Koi",       emoji: "🐠",    value: 80,    rarity: "common",    weight: 0.35 },
  { name: "Swamp Catfish",    emoji: "🐟",    value: 220,   rarity: "uncommon",  weight: 0.28 },
  { name: "Ghost Eel",        emoji: "🫧🐟",  value: 550,   rarity: "rare",      weight: 0.18 },
  { name: "Bog Serpent",      emoji: "🐍",    value: 1400,  rarity: "epic",      weight: 0.10 },
  { name: "Crystal Bass",     emoji: "💎🐟",  value: 4000,  rarity: "legendary", weight: 0.06 },
  { name: "Murk Leviathan",   emoji: "🌊🦕",  value: 14000, rarity: "mythic",    weight: 0.025 },
  { name: "Void Ray",         emoji: "✨🌀",  value: 60000, rarity: "void",      weight: 0.005 },
];
// EV per catch ≈ 1219. With 70% success rate → ~853 avg per attempt (5min CD → ~10,200/hr max)

function getRandomFish() {
  const rand = Math.random();
  let cumWeight = 0;
  for (const fish of FISH_TYPES) {
    cumWeight += fish.weight;
    if (rand < cumWeight) return fish;
  }
  return FISH_TYPES[0];
}

async function cmdFish(message, args, util) {
  const { economySettings, ecoPrefix, run: runCmd, get: getCmd } = util;
  
  if (!economySettings?.enabled) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Economy system is disabled." }] }).catch(() => {});
    return;
  }

  await runCmd(`INSERT INTO user_economy (guild_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING`,
    [message.guild.id, message.author.id]);

  // Check for fishing rod
  const rod = await getCmd(
    `SELECT * FROM user_inventory WHERE guild_id=? AND user_id=? AND item_id='fishing_rod' AND quantity > 0`,
    [message.guild.id, message.author.id]
  );

  if (!rod) {
    await message.reply({ embeds: [{ color: 0xf39c12, title: '🎣 ℕ𝕠 𝔽𝕚𝕤𝕙𝕚𝕟𝕘 ℝ𝕠𝕕', description: `You need a **Fishing Rod** to fish!\n\nBuy one from the shop: \`${ecoPrefix}buy 1\`` }] }).catch(() => {});
    return;
  }

  // Cooldown (5 minutes)
  const stats = await getCmd(
    `SELECT * FROM minigames_stats WHERE guild_id=? AND user_id=? AND minigame='fishing' AND stat_name='last_cast'`,
    [message.guild.id, message.author.id]
  );

  const now = Date.now();
  const cooldown = 300000; // 5 minutes
  if (stats?.last_played && (now - stats.last_played) < cooldown) {
    const timeLeft = cooldown - (now - stats.last_played);
    const seconds = Math.floor(timeLeft / 1000);
    await message.reply({ embeds: [{ color: 0xf39c12, description: `⏳ Your line is still wet! Come back in **${seconds}s**.` }] }).catch(() => {});
    return;
  }

  // Fishing attempt - base 70% success, 90% with treasure map
  const treasureMap = await getCmd(
    `SELECT * FROM user_inventory WHERE guild_id=? AND user_id=? AND item_id='treasure_map' AND quantity > 0`,
    [message.guild.id, message.author.id]
  );

  const successChance = treasureMap ? 0.9 : 0.7;
  const caught = Math.random() < successChance;

  if (!caught) {
    await runCmd(
      `INSERT INTO minigames_stats (guild_id, user_id, minigame, stat_name, stat_value, last_played)
       VALUES (?, ?, 'fishing', 'last_cast', 0, ?)
       ON CONFLICT (guild_id, user_id, minigame, stat_name) DO UPDATE SET last_played=?`,
      [message.guild.id, message.author.id, now, now]
    );
    await message.reply({ embeds: [{ color: 0x95a5a6, description: '🎣 You cast your line... but nothing bites! Come back later.' }] }).catch(() => {});
    return;
  }

  const fish = getRandomFish();
  const totalCaught = (stats?.stat_value || 0) + 1;
  
  await runCmd(
    `INSERT INTO minigames_stats (guild_id, user_id, minigame, stat_name, stat_value, last_played)
     VALUES (?, ?, 'fishing', 'last_cast', ?, ?)
     ON CONFLICT (guild_id, user_id, minigame, stat_name) DO UPDATE SET stat_value=minigames_stats.stat_value+1, last_played=?`,
    [message.guild.id, message.author.id, totalCaught, now, now]
  );

  const economy = await getCmd(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`,
    [message.guild.id, message.author.id]);
  if (!economy) {
    console.error('[cmdFish] economy row missing for', message.author.id, message.guild.id);
    await message.reply({ embeds: [{ color: 0xe74c3c, description: '❌ Could not load your economy data. Please try again.' }] }).catch(() => {});
    return;
  }
  // Scholar class passive: 25% more fishing value
  const userFishClass = await getCmd(`SELECT class_id FROM user_class WHERE guild_id=? AND user_id=?`, [message.guild.id, message.author.id]);
  const scholarFishMult = userFishClass?.class_id === 'scholar' ? 1.25 : 1;
  const fishValue = Math.floor(fish.value * scholarFishMult);
  const scholarFishNote = scholarFishMult > 1 ? "\n📚 **Scholar Bonus: +25% value!**" : "";
  const newBalance = economy.balance + fishValue;
  
  await runCmd(`UPDATE user_economy SET balance=? WHERE guild_id=? AND user_id=?`,
    [newBalance, message.guild.id, message.author.id]);

  await runCmd(
    `INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
    [message.guild.id, message.author.id, "fishing", fishValue, `Caught a ${fish.name}`]
  );

  const rarityColors2 = { common: 0x3498db, uncommon: 0x2ecc71, rare: 0x9b59b6, epic: 0xe74c3c, legendary: 0xffd700, mythic: 0xff1493, void: 0x8b00ff };
  const fishColor = rarityColors2[fish.rarity] || 0x3498db;
  const fishEmbed = new EmbedBuilder()
    .setColor(fishColor)
    .setTitle(`🎣 𝔽𝕚𝕤𝕙𝕚𝕟𝕘 ℝ𝕖𝕤𝕦𝕝𝕥`)
    .setDescription(`${fish.emoji} **${fish.name}** [${fish.rarity.toUpperCase()}]${scholarFishNote}`)
    .addFields(
      { name: '💰 Value', value: `+${fishValue} ${economySettings.currency_name}`, inline: true },
      { name: '⭐ Rarity', value: fish.rarity, inline: true },
      { name: '🎣 Total Caught', value: `${totalCaught}`, inline: true }
    );
  await message.reply({ embeds: [fishEmbed] }).catch(() => {});
}

// ==================== DIGGING ====================

const DIG_REWARDS = [
  { item: "Rusted Copper",    emoji: "🟤", value: 50,    chance: 0.32 },
  { item: "Iron Fragment",    emoji: "⚙️", value: 180,   chance: 0.26 },
  { item: "Silver Chunk",     emoji: "🥈", value: 550,   chance: 0.20 },
  { item: "Gold Nugget",      emoji: "🥇", value: 1600,  chance: 0.13 },
  { item: "Murk Crystal",     emoji: "💎", value: 5000,  chance: 0.07 },
  { item: "Void Ore",         emoji: "🌑", value: 18000, chance: 0.025 },
  { item: "Ancient Relic",    emoji: "🏺", value: 75000, chance: 0.005 },
];
// EV per dig ≈ 1556. Dig always succeeds. (3min CD → ~31,100/hr max)

const MINE_REWARDS = [
  { item: "Coal",             emoji: "🪨", value: 70,    chance: 0.35 },
  { item: "Iron Ore",         emoji: "🔩", value: 200,   chance: 0.25 },
  { item: "Silver Ore",       emoji: "🥈", value: 500,   chance: 0.18 },
  { item: "Gold Ore",         emoji: "🥇", value: 1200,  chance: 0.12 },
  { item: "Diamond",          emoji: "💎", value: 3500,  chance: 0.07 },
  { item: "Void Crystal",     emoji: "🌌", value: 12000, chance: 0.025 },
  { item: "Eternal Gemstone", emoji: "✨", value: 45000, chance: 0.005 },
];
// EV per mine ≈ 1079. Mine always succeeds. (4min CD → ~16,200/hr max)

const HUNT_REWARDS = [
  { item: "Bog Rat",          emoji: "🐀", value: 60,    chance: 0.30 },
  { item: "Swamp Hare",       emoji: "🐇", value: 180,   chance: 0.25 },
  { item: "Murk Fox",         emoji: "🦊", value: 450,   chance: 0.20 },
  { item: "Bog Boar",         emoji: "🐗", value: 1200,  chance: 0.13 },
  { item: "Shadow Wolf",      emoji: "🐺", value: 3800,  chance: 0.08 },
  { item: "Murk Drake",       emoji: "🐉", value: 12000, chance: 0.03 },
  { item: "Void Stag",        emoji: "🦌", value: 40000, chance: 0.01 },
];
// EV per hunt ≈ 1373. 80% success rate. (6min CD → ~11,000/hr max)

function getDigReward() {
  const rand = Math.random();
  let cumChance = 0;
  for (const reward of DIG_REWARDS) {
    cumChance += reward.chance;
    if (rand < cumChance) return reward;
  }
  return DIG_REWARDS[0];
}

function getMineReward() {
  const rand = Math.random();
  let cum = 0;
  for (const r of MINE_REWARDS) {
    cum += r.chance;
    if (rand < cum) return r;
  }
  return MINE_REWARDS[0];
}

function getHuntReward() {
  const rand = Math.random();
  let cum = 0;
  for (const r of HUNT_REWARDS) {
    cum += r.chance;
    if (rand < cum) return r;
  }
  return HUNT_REWARDS[0];
}

async function cmdDig(message, args, util) {
  const { economySettings, ecoPrefix, run: runCmd, get: getCmd } = util;
  
  if (!economySettings?.enabled) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Economy system is disabled." }] }).catch(() => {});
    return;
  }

  await runCmd(`INSERT INTO user_economy (guild_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING`,
    [message.guild.id, message.author.id]);

  // Check for shovel
  const shovel = await getCmd(
    `SELECT * FROM user_inventory WHERE guild_id=? AND user_id=? AND item_id='shovel' AND quantity > 0`,
    [message.guild.id, message.author.id]
  );

  if (!shovel) {
    await message.reply({ embeds: [{ color: 0xf39c12, title: '⛏️ ℕ𝕠 𝕊𝕙𝕠𝕧𝕖𝕝', description: `You need a **Rusty Shovel** to dig!\n\nBuy one from the shop: \`${ecoPrefix}buy 2\`` }] }).catch(() => {});
    return;
  }

  // Cooldown (3 minutes)
  const stats = await getCmd(
    `SELECT * FROM minigames_stats WHERE guild_id=? AND user_id=? AND minigame='digging' AND stat_name='last_dig'`,
    [message.guild.id, message.author.id]
  );

  const now = Date.now();
  const cooldown = 180000; // 3 minutes
  if (stats?.last_played && (now - stats.last_played) < cooldown) {
    const timeLeft = cooldown - (now - stats.last_played);
    const seconds = Math.floor(timeLeft / 1000);
    await message.reply({ embeds: [{ color: 0xf39c12, description: `⏳ You're catching your breath! Come back in **${seconds}s**.` }] }).catch(() => {});
    return;
  }

  // Check for treasure map
  const treasureMap = await getCmd(
    `SELECT * FROM user_inventory WHERE guild_id=? AND user_id=? AND item_id='treasure_map' AND quantity > 0`,
    [message.guild.id, message.author.id]
  );

  let reward = getDigReward();
  let totalValveGain = reward.value;

  // Treasure map doubles the value and consumes itself
  if (treasureMap) {
    totalValveGain = reward.value * 2;
    await runCmd(
      `UPDATE user_inventory SET quantity=quantity-1 WHERE guild_id=? AND user_id=? AND item_id='treasure_map'`,
      [message.guild.id, message.author.id]
    );
  }

  // Scholar class passive: 25% more dig value
  const userDigClass = await getCmd(`SELECT class_id FROM user_class WHERE guild_id=? AND user_id=?`, [message.guild.id, message.author.id]);
  const scholarDigBonus = userDigClass?.class_id === 'scholar';
  if (scholarDigBonus) totalValveGain = Math.floor(totalValveGain * 1.25);

  const digCount = (stats?.stat_value || 0) + 1;
  await runCmd(
    `INSERT INTO minigames_stats (guild_id, user_id, minigame, stat_name, stat_value, last_played)
     VALUES (?, ?, 'digging', 'last_dig', ?, ?)
     ON CONFLICT (guild_id, user_id, minigame, stat_name) DO UPDATE SET stat_value=minigames_stats.stat_value+1, last_played=?`,
    [message.guild.id, message.author.id, digCount, now, now]
  );

  const economy = await getCmd(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`,
    [message.guild.id, message.author.id]);
  if (!economy) {
    console.error('[cmdDig] economy row missing for', message.author.id, message.guild.id);
    await message.reply({ embeds: [{ color: 0xe74c3c, description: '❌ Could not load your economy data. Please try again.' }] }).catch(() => {});
    return;
  }
  const newBalance = economy.balance + totalValveGain;
  
  await runCmd(`UPDATE user_economy SET balance=? WHERE guild_id=? AND user_id=?`,
    [newBalance, message.guild.id, message.author.id]);

  await runCmd(
    `INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
    [message.guild.id, message.author.id, "digging", totalValveGain, `Dug up ${reward.item}`]
  );

  const rarityColors = { common: 0xa0522d, uncommon: 0x7ccd7c, rare: 0x4169e1, epic: 0x9b59b6, legendary: 0xffd700, mythic: 0xff69b4, ancient: 0xff4500 };
  const mapBonus = treasureMap ? "\n\n✨ **Treasure map bonus: 2x value!**" : "";
  const scholarDigText = scholarDigBonus ? "\n📚 **Scholar Bonus: +25% value!**" : "";
  const embed = new EmbedBuilder()
    .setColor(rarityColors[reward.rarity] || 0xe67e22)
    .setTitle(`⛏️ 𝔻𝕚𝕘 ℝ𝕖𝕤𝕦𝕝𝕥`)
    .setDescription(`${reward.emoji || '⛏️'} **${reward.item}** [${reward.rarity?.toUpperCase() || 'COMMON'}]\n\n💰 **Value:** +${totalValveGain} ${economySettings.currency_name}${mapBonus}${scholarDigText}`)
    .addFields({ name: "Total Digs", value: `${digCount}`, inline: true }, { name: "New Balance", value: `${economy.balance + totalValveGain} ${economySettings.currency_name}`, inline: true });
  await message.reply({ embeds: [embed] }).catch(() => {});
}

// ==================== MINING SYSTEM ====================

async function cmdMine(message, args, util) {
  const { economySettings, ecoPrefix, run: runCmd, get: getCmd } = util;

  if (!economySettings?.enabled) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Economy system is disabled." }] }).catch(() => {});
    return;
  }

  await runCmd(`INSERT INTO user_economy (guild_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING`,
    [message.guild.id, message.author.id]);

  const pickaxe = await getCmd(
    `SELECT * FROM user_inventory WHERE guild_id=? AND user_id=? AND item_id='pickaxe' AND quantity > 0`,
    [message.guild.id, message.author.id]
  );
  if (!pickaxe) {
    await message.reply({ embeds: [{ color: 0xf39c12, title: '⛏️ ℕ𝕠 ℙ𝕚𝕔𝕜𝕒𝕩𝕖', description: `You need a **Pickaxe** to mine!\n\nBuy one from the shop: \`${ecoPrefix}shop\`` }] }).catch(() => {});
    return;
  }

  const stats = await getCmd(
    `SELECT * FROM minigames_stats WHERE guild_id=? AND user_id=? AND minigame='mining' AND stat_name='last_mine'`,
    [message.guild.id, message.author.id]
  );
  const now = Date.now();
  const cooldown = 240000; // 4 minutes
  if (stats?.last_played && (now - stats.last_played) < cooldown) {
    const timeLeft = cooldown - (now - stats.last_played);
    const seconds = Math.floor(timeLeft / 1000);
    await message.reply({ embeds: [{ color: 0xf39c12, description: `⛏️ Your arms are tired! Rest for **${seconds}s** more.` }] }).catch(() => {});
    return;
  }

  const reward = getMineReward();
  const mineCount = (stats?.stat_value || 0) + 1;

  await runCmd(
    `INSERT INTO minigames_stats (guild_id, user_id, minigame, stat_name, stat_value, last_played)
     VALUES (?, ?, 'mining', 'last_mine', ?, ?)
     ON CONFLICT (guild_id, user_id, minigame, stat_name) DO UPDATE SET stat_value=minigames_stats.stat_value+1, last_played=?`,
    [message.guild.id, message.author.id, mineCount, now, now]
  );

  const economy = await getCmd(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`,
    [message.guild.id, message.author.id]);
  if (!economy) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: '❌ Economy data missing. Try again.' }] }).catch(() => {});
    return;
  }

  // Check void_key buff (3x mine rewards)
  const voidBuff = await getCmd(`SELECT * FROM user_buffs WHERE guild_id=? AND user_id=? AND buff_id='void_triple' AND expires_at>?`,
    [message.guild.id, message.author.id, now]);
  const mult = voidBuff ? 3 : 1;
  // Scholar class passive: 25% more mine value
  const userMineClass = await getCmd(`SELECT class_id FROM user_class WHERE guild_id=? AND user_id=?`, [message.guild.id, message.author.id]);
  const scholarMineMult = userMineClass?.class_id === 'scholar' ? 1.25 : 1;
  const value = Math.floor(reward.value * mult * scholarMineMult);

  await runCmd(`UPDATE user_economy SET balance=balance+? WHERE guild_id=? AND user_id=?`,
    [value, message.guild.id, message.author.id]);
  await runCmd(`INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
    [message.guild.id, message.author.id, "mining", value, `Mined ${reward.item}`]);

  const rarityColors = { common: 0x607060, uncommon: 0x7ccd7c, rare: 0x4169e1, epic: 0x9b59b6, legendary: 0xffd700, mythic: 0xff69b4 };
  const voidText = voidBuff ? "\n\n🔑 **Void Key active: 3x rewards!**" : "";
  const scholarMineText = userMineClass?.class_id === 'scholar' ? "\n📚 **Scholar Bonus: +25% value!**" : "";
  const embed = new EmbedBuilder()
    .setColor(rarityColors[reward.rarity] || 0x607060)
    .setTitle("⛏️ 𝕄𝕚𝕟𝕖 ℝ𝕖𝕤𝕦𝕝𝕥")
    .setDescription(`${reward.emoji || '⛏️'} **${reward.item}** [${reward.rarity?.toUpperCase() || 'COMMON'}]\n\n💰 **Value:** +${value} ${economySettings.currency_name}${voidText}${scholarMineText}`)
    .addFields({ name: "Total Mines", value: `${mineCount}`, inline: true }, { name: "New Balance", value: `${economy.balance + value} ${economySettings.currency_name}`, inline: true });
  await message.reply({ embeds: [embed] }).catch(() => {});
}

// ==================== HUNTING SYSTEM ====================

async function cmdHunt(message, args, util) {
  const { economySettings, ecoPrefix, run: runCmd, get: getCmd } = util;

  if (!economySettings?.enabled) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Economy system is disabled." }] }).catch(() => {});
    return;
  }

  await runCmd(`INSERT INTO user_economy (guild_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING`,
    [message.guild.id, message.author.id]);

  const net = await getCmd(
    `SELECT * FROM user_inventory WHERE guild_id=? AND user_id=? AND item_id='hunting_net' AND quantity > 0`,
    [message.guild.id, message.author.id]
  );
  if (!net) {
    await message.reply({ embeds: [{ color: 0xf39c12, title: '🕸️ ℕ𝕠 ℍ𝕦𝕟𝕥𝕚𝕟𝕘 ℕ𝕖𝕥', description: `You need a **Hunting Net** to hunt!\n\nBuy one from the shop: \`${ecoPrefix}shop\`` }] }).catch(() => {});
    return;
  }

  const stats = await getCmd(
    `SELECT * FROM minigames_stats WHERE guild_id=? AND user_id=? AND minigame='hunting' AND stat_name='last_hunt'`,
    [message.guild.id, message.author.id]
  );
  const now = Date.now();
  const cooldown = 360000; // 6 minutes
  if (stats?.last_played && (now - stats.last_played) < cooldown) {
    const timeLeft = cooldown - (now - stats.last_played);
    const seconds = Math.floor(timeLeft / 1000);
    await message.reply({ embeds: [{ color: 0xf39c12, description: `🕸️ Your net is still drying! Come back in **${seconds}s**.` }] }).catch(() => {});
    return;
  }

  const huntCount = (stats?.stat_value || 0) + 1;
  await runCmd(
    `INSERT INTO minigames_stats (guild_id, user_id, minigame, stat_name, stat_value, last_played)
     VALUES (?, ?, 'hunting', 'last_hunt', ?, ?)
     ON CONFLICT (guild_id, user_id, minigame, stat_name) DO UPDATE SET stat_value=minigames_stats.stat_value+1, last_played=?`,
    [message.guild.id, message.author.id, huntCount, now, now]
  );

  // 80% success rate for hunting
  const success = Math.random() < 0.80;
  if (!success) {
    await message.reply({ embeds: [{ color: 0x95a5a6, description: `🕸️ You set your net... but the swamp is empty tonight. Better luck next time!\n\n**Tip:** Even a failed hunt advances your hunt count.` }] }).catch(() => {});
    return;
  }

  const reward = getHuntReward();
  const economy = await getCmd(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`,
    [message.guild.id, message.author.id]);
  if (!economy) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: '❌ Economy data missing. Try again.' }] }).catch(() => {});
    return;
  }

  // Scholar class passive: 25% more hunt value
  const userHuntClass = await getCmd(`SELECT class_id FROM user_class WHERE guild_id=? AND user_id=?`, [message.guild.id, message.author.id]);
  const scholarHuntMult = userHuntClass?.class_id === 'scholar' ? 1.25 : 1;
  const huntValue = Math.floor(reward.value * scholarHuntMult);
  const scholarHuntText = scholarHuntMult > 1 ? "\n📚 **Scholar Bonus: +25% value!**" : "";

  await runCmd(`UPDATE user_economy SET balance=balance+? WHERE guild_id=? AND user_id=?`,
    [huntValue, message.guild.id, message.author.id]);
  await runCmd(`INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
    [message.guild.id, message.author.id, "hunting", huntValue, `Hunted ${reward.item}`]);

  const rarityColors = { common: 0x8b4513, uncommon: 0x228b22, rare: 0x4169e1, epic: 0x9b59b6, legendary: 0xffd700, mythic: 0xff69b4 };
  const embed = new EmbedBuilder()
    .setColor(rarityColors[reward.rarity] || 0x8b4513)
    .setTitle("🕸️ ℍ𝕦𝕟𝕥 ℝ𝕖𝕤𝕦𝕝𝕥")
    .setDescription(`${reward.emoji || '🐾'} **${reward.item}** [${reward.rarity?.toUpperCase() || 'COMMON'}]\n\n💰 **Value:** +${huntValue} ${economySettings.currency_name}${scholarHuntText}`)
    .addFields({ name: "Total Hunts", value: `${huntCount}`, inline: true }, { name: "New Balance", value: `${economy.balance + huntValue} ${economySettings.currency_name}`, inline: true });
  await message.reply({ embeds: [embed] }).catch(() => {});
}

// ==================== ROBBERY SYSTEM ====================

async function cmdRobBank(message, args, util) {
  const { economySettings, ecoPrefix, run: runCmd, get: getCmd } = util;
  
  if (!economySettings?.enabled) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Economy system is disabled." }] }).catch(() => {});
    return;
  }

  await runCmd(`INSERT INTO user_economy (guild_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING`,
    [message.guild.id, message.author.id]);

  const robber = await getCmd(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`,
    [message.guild.id, message.author.id]);

  const now = Date.now();
  const cooldown = 3600000; // 1 hour for bank robbery
  
  if (robber.last_bank_rob && (now - robber.last_bank_rob) < cooldown) {
    const timeLeft = cooldown - (now - robber.last_bank_rob);
    const minutes = Math.floor(timeLeft / 60000);
    await message.reply({ embeds: [{ color: 0xf39c12, description: `🚔 The police are still after you! Wait **${minutes}m** before another bank robbery.` }] }).catch(() => {});
    return;
  }

  // Bank has 50% base success rate, but calling police increases to higher difficulty
  const success = Math.random() < 0.5;
  let amount = 0;

  if (success) {
    amount = Math.floor(500 + Math.random() * 1500); // 500-2000
  } else {
    const fine = Math.floor(robber.balance * 0.4); // 40% fine if caught
    await runCmd(`UPDATE user_economy SET balance=?, last_bank_rob=? WHERE guild_id=? AND user_id=?`,
      [Math.max(0, robber.balance - fine), now, message.guild.id, message.author.id]);
    
    await runCmd(
      `INSERT INTO robbery_attempts (guild_id, robber_id, robbery_type, success, amount_stolen, attempted_at)
       VALUES (?, ?, 'bank', 0, ?, ?)`,
      [message.guild.id, message.author.id, 0, now]
    );

    await message.reply({ embeds: [{ color: 0xe74c3c, title: '🚔 BANK ROBBERY FAILED!', description: `You got caught by the police and paid a fine of **${fine} ${economySettings.currency_name}**!` }] }).catch(() => {});
    return;
  }

  const newBalance = robber.balance + amount;
  await runCmd(`UPDATE user_economy SET balance=?, last_bank_rob=? WHERE guild_id=? AND user_id=?`,
    [newBalance, now, message.guild.id, message.author.id]);

  await runCmd(
    `INSERT INTO robbery_attempts (guild_id, robber_id, robbery_type, success, amount_stolen, attempted_at)
     VALUES (?, ?, 'bank', 1, ?, ?)`,
    [message.guild.id, message.author.id, amount, now]
  );

  await message.reply({ embeds: [{ color: 0x2ecc71, title: '💰 BANK ROBBERY SUCCESS!', description: `🚨 You made off with **${amount} ${economySettings.currency_name}**!\n\n*sirens in the distance...*` }] }).catch(() => {});
}

// ==================== PHONE SYSTEM ====================

async function cmdPhone(message, args, util) {
  const { economySettings, ecoPrefix, run: runCmd, get: getCmd } = util;
  
  if (!economySettings?.enabled) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Economy system is disabled." }] }).catch(() => {});
    return;
  }

  // Check for phone
  const phone = await getCmd(
    `SELECT * FROM user_inventory WHERE guild_id=? AND user_id=? AND item_id='phone' AND quantity > 0`,
    [message.guild.id, message.author.id]
  );

  if (!phone) {
    await message.reply({ embeds: [{ color: 0xe74c3c, title: '❌ No Phone', description: `You don't have a phone! Buy one from the shop.\n\n\`${ecoPrefix}buy phone\`` }] }).catch(() => {});
    return;
  }

  const service = (args[0] || "").toLowerCase();

  if (service === "police" || service === "911" || service === "call_police") {
    // Prevent robbery for 1 hour
    await runCmd(
      `INSERT INTO minigames_stats (guild_id, user_id, minigame, stat_name, stat_value, last_played)
       VALUES (?, ?, 'phone', 'police_called', 1, ?)
       ON CONFLICT (guild_id, user_id, minigame, stat_name) DO UPDATE SET last_played=?`,
      [message.guild.id, message.author.id, Date.now(), Date.now()]
    );
    
    await message.reply({ embeds: [{ color: 0x3498db, title: '📞 Police Called!', description: '🚔 Officers are patrolling your area for the next hour.\n✅ Bank robberies against you will fail if attempted within the hour.' }] }).catch(() => {});
    return;
  }

  if (service === "taxi") {
    const stories = [
      "You got in a taxi and the driver was a professional dancer. They taught you some moves for free!",
      "The taxi driver was suspicious and drove you in circles. You paid extra and felt scammed.",
      "You met a billionaire in the taxi. They gave you a business card but it was fake.",
      "The driver sang opera the entire ride. It was surprisingly good.",
      "The taxi broke down halfway. The driver invited you for coffee instead."
    ];
    
    const randomStory = stories[Math.floor(Math.random() * stories.length)];
    await message.reply({ embeds: [{ color: 0xf39c12, title: '🚕 Taxi Ride', description: randomStory }] }).catch(() => {});
    return;
  }

  if (service === "takeout") {
    const economy = await getCmd(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`,
      [message.guild.id, message.author.id]);

    const foodPrice = 50;
    if (economy.balance < foodPrice) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: `❌ Not enough money for takeout! (costs **${foodPrice} ${economySettings.currency_name}**)` }] }).catch(() => {});
      return;
    }

    const foods = ["Pizza 🍕", "Burger 🍔", "Sushi 🍣", "Tacos 🌮", "Ramen 🍜"];
    const randomFood = foods[Math.floor(Math.random() * foods.length)];

    const newBalance = economy.balance - foodPrice;
    await runCmd(`UPDATE user_economy SET balance=? WHERE guild_id=? AND user_id=?`,
      [newBalance, message.guild.id, message.author.id]);

    await runCmd(
      `INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
      [message.guild.id, message.author.id, "takeout", -foodPrice, "Ordered food"]
    );

    await message.reply({ embeds: [{ color: 0x2ecc71, title: '📱 𝕋𝕒𝕜𝕖𝕠𝕦𝕥 𝔻𝕖𝕝𝕚𝕧𝕖𝕣𝕖𝕕!', description: `${randomFood} has arrived!\n*nom nom nom* 😋\n\nCost: **${foodPrice} ${economySettings.currency_name}**` }] }).catch(() => {});
    return;
  }

  await message.reply({ embeds: [{ color: 0x3498db, title: '📱 ℙ𝕙𝕠𝕟𝕖 𝕊𝕖𝕣𝕧𝕚𝕔𝕖𝕤', description: `\`${ecoPrefix}phone police\` � Call the police *(1h robbery protection)*\n\`${ecoPrefix}phone taxi\` � Order a taxi *(funny stories)*\n\`${ecoPrefix}phone takeout\` � Order food *(${50} ${economySettings.currency_name})*` }] }).catch(() => {});
}

// ==================== ITEM USE SYSTEM ====================

async function cmdUse(message, args, util) {
  const { EmbedBuilder } = require("discord.js");
  const { economySettings, ecoPrefix, run: runCmd, get: getCmd } = util;

  if (!economySettings?.enabled) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Economy system is disabled." }] }).catch(() => {});
    return;
  }

  if (!args[0]) {
  await message.reply({ embeds: [{ color: 0x95a5a6, description: `📦 **Usage:** \`${ecoPrefix}use <item_name>\`\nCheck your inventory with \`${ecoPrefix}inventory\`` }] }).catch(() => {});
    return;
  }

  const itemName = args.filter(a => !a.startsWith("<@")).join(" ").toLowerCase();
  const guildId = message.guild.id;
  const userId = message.author.id;

  const inventoryItem = await getCmd(`
    SELECT ui.quantity, si.name, si.description, si.item_type, si.use_effect, si.item_image_url, si.item_id
    FROM user_inventory ui
    JOIN economy_shop_items si ON si.item_id = ui.item_id AND si.guild_id = ui.guild_id
    WHERE ui.guild_id=? AND ui.user_id=?
      AND (LOWER(si.name) LIKE ? OR si.item_id LIKE ?)
      AND ui.quantity > 0
  `, [guildId, userId, `%${itemName}%`, `%${itemName}%`]);

  if (!inventoryItem) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: `❌ You don't have **${args.filter(a => !a.startsWith('<@')).join(' ')}** in your inventory!` }] }).catch(() => {});
    return;
  }

  if (!inventoryItem.use_effect) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: `❌ **${inventoryItem.name}** cannot be used � it's a ${inventoryItem.item_type}.` }] }).catch(() => {});
    return;
  }

  await runCmd(`INSERT INTO user_economy (guild_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING`, [guildId, userId]);
  const economy = await getCmd(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`, [guildId, userId]);
  const balance = economy?.balance || 0;
  const now = Date.now();
  const effect = inventoryItem.use_effect;

  let embedTitle, embedDesc, embedColor;
  let consumed = true;

  if (effect === "fishing_rod" || effect === "shovel") {
    consumed = false;
    const cmd = effect === "fishing_rod" ? "fish" : "dig";
  await message.reply({ embeds: [{ color: 0x3498db, description: `🔧 **${inventoryItem.name}** is a tool � having it in your inventory is enough! Try \`${ecoPrefix}${cmd}\`.` }] }).catch(() => {});
    return;

  } else if (effect === "prestige_use") {
    consumed = false;
    await message.reply(`⭐ The Prestige Token is used during \`${ecoPrefix}prestige ascend\` — keep it in your inventory!`).catch(() => {});
    return;

  } else if (effect === "swamp_tonic") {
    const expires = now + 3600000;
    await runCmd(`INSERT INTO user_buffs (guild_id, user_id, buff_id, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT (guild_id, user_id, buff_id) DO UPDATE SET expires_at=?`,
      [guildId, userId, "earnings_boost_20", expires, expires]);
    embedTitle = "🧪 𝕊𝕨𝕒𝕞𝕡 𝕋𝕠𝕟𝕚𝕔 — ℂ𝕆ℕ𝕊𝕌𝕄𝔼𝔻";
    embedDesc = "The green liquid burns going down. Your vision goes swampy for a moment, then clears.\n\n✅ **+20% earnings boost** for the next **1 hour**!";
    embedColor = 0x00ff88;

  } else if (effect === "padlock") {
    const expires = now + 14400000;
    await runCmd(`INSERT INTO user_buffs (guild_id, user_id, buff_id, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT (guild_id, user_id, buff_id) DO UPDATE SET expires_at=?`,
      [guildId, userId, "robbery_immune", expires, expires]);
    embedTitle = "🔒 ℙ𝕒𝕕𝕝𝕠𝕔𝕜 — 𝔸ℂ𝕋𝕀𝕍𝔸𝕋𝔼𝔻";
    embedDesc = "You snap the padlock shut on your wallet.\n\n✅ **Robbery immunity** for **4 hours**!";
    embedColor = 0xffd700;

  } else if (effect === "trap_kit") {
    const expires = now + 86400000;
    await runCmd(`INSERT INTO user_buffs (guild_id, user_id, buff_id, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT (guild_id, user_id, buff_id) DO UPDATE SET expires_at=?`,
      [guildId, userId, "trap_set", expires, expires]);
    embedTitle = "🪤 𝕋𝕣𝕒𝕡 𝕂𝕚𝕥 — 𝕊𝔼𝕋";
    embedDesc = "You carefully set the trap around your coin pouch. The next person to attempt a robbery will trigger it and *lose* 20% of their wallet.\n\n✅ **Robbery trap** active for **24 hours**!";
    embedColor = 0xff6600;

  } else if (effect === "fortune_scroll") {
    const bonus = Math.floor(Math.random() * 1800) + 200;
    await runCmd(`UPDATE user_economy SET balance=? WHERE guild_id=? AND user_id=?`, [balance + bonus, guildId, userId]);
    const fortunes = [
      "The scroll speaks of rivers of gold flowing from the east swamp.",
      "Ancient text warns of danger but promises great reward to the bold.",
      "The Murk's voice echoes: *'What is buried shall be found by those who seek.'*",
      "A crude map appears then fades. But the coins remain.",
      "The runes spell out a number. That number is your blessing."
    ];
    embedTitle = "📜 𝔽𝕠𝕣𝕥𝕦𝕟𝕖 𝕊𝕔𝕣𝕠𝕝𝕝 — ℝ𝔼𝔸𝔻";
    embedDesc = `${fortunes[Math.floor(Math.random() * fortunes.length)]}\n\n✅ You received **+${bonus}** ${economySettings.currency_name}!`;
    embedColor = 0xffeedd;

  } else if (effect === "murk_map" || effect === "murk_lantern") {
    const expires = now + 7200000;
    await runCmd(`INSERT INTO user_buffs (guild_id, user_id, buff_id, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT (guild_id, user_id, buff_id) DO UPDATE SET expires_at=?`,
      [guildId, userId, "explore_double", expires, expires]);
    if (effect === "murk_map") {
      embedTitle = "🗺️ 𝕄𝕦𝕣𝕜 𝕄𝕒𝕡 — 𝔸ℂ𝕋𝕀𝕍𝔸𝕋𝔼𝔻";
      embedDesc = "You trace the hand-drawn paths to a hidden clearing deep in the swamp.\n\n✅ **Explore loot doubled** for **2 hours**!";
      embedColor = 0x6699ff;
    } else {
      embedTitle = "🏮 𝕄𝕦𝕣𝕜 𝕃𝕒𝕟𝕥𝕖𝕣𝕟 — 𝕃𝕀𝕋";
      embedDesc = "The lantern flickers green. Hidden paths glow before you.\n\n✅ **Explore loot doubled** for **2 hours**!";
      embedColor = 0x99ff66;
    }

  } else if (effect === "shadow_cloak") {
    const expires = now + 7200000;
    await runCmd(`INSERT INTO user_buffs (guild_id, user_id, buff_id, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT (guild_id, user_id, buff_id) DO UPDATE SET expires_at=?`,
      [guildId, userId, "robbery_immune", expires, expires]);
    embedTitle = "🌑 𝕊𝕙𝕒𝕕𝕠𝕨 ℂ𝕝𝕠𝕒𝕜 — 𝕎𝕆ℝℕ";
    embedDesc = "Your form flickers and becomes indistinct. No one can rob what they can't see.\n\n✅ **Unrobbable** for **2 hours**!";
    embedColor = 0x222244;

  } else if (effect === "lucky_charm") {
    const expires = now + 21600000;
    await runCmd(`INSERT INTO user_buffs (guild_id, user_id, buff_id, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT (guild_id, user_id, buff_id) DO UPDATE SET expires_at=?`,
      [guildId, userId, "earnings_boost_20", expires, expires]);
    embedTitle = "🍀 𝕃𝕦𝕔𝕜𝕪 ℂ𝕙𝕒𝕣𝕞 — 𝔸ℂ𝕋𝕀𝕍𝔸𝕋𝔼𝔻";
    embedDesc = "The four-leaf clover glows with a soft golden light as you hold it.\n\n✅ **+20% earnings boost** for **6 hours**!";
    embedColor = 0x33cc66;

  } else if (effect === "gamblers_dice") {
    const win = Math.random() < 0.4;
    if (win) {
      const gain = balance * 2;
      await runCmd(`UPDATE user_economy SET balance=? WHERE guild_id=? AND user_id=?`, [balance + gain, guildId, userId]);
      embedTitle = "🎲 𝔾𝕒𝕞𝕓𝕝𝕖𝕣'𝕤 𝔻𝕚𝕔𝕖 — 𝕁𝔸ℂ𝕂ℙ𝕆𝕋!";
      embedDesc = `The dice clatter and land on **TRIPLE**. The table erupts in disbelief.\n\n🎉 You **TRIPLED** your wallet! **+${gain}** ${economySettings.currency_name}!`;
      embedColor = 0xffdd00;
    } else {
      const loss = Math.floor(balance * 0.4);
      await runCmd(`UPDATE user_economy SET balance=? WHERE guild_id=? AND user_id=?`, [Math.max(0, balance - loss), guildId, userId]);
      embedTitle = "🎲 𝔾𝕒𝕞𝕓𝕝𝕖𝕣'𝕤 𝔻𝕚𝕔𝕖 — 𝔹𝕌𝕊𝕋";
      embedDesc = `The dice clatter. The room goes quiet. You lose.\n\n💸 Lost **${loss}** ${economySettings.currency_name}. The dice roll away into the dark.`;
      embedColor = 0xff3333;
    }

  } else if (effect === "merchants_lens") {
    const target = message.mentions.users.first();
    if (!target) {
      await message.reply(`❌ You need to mention a user: \`${ecoPrefix}use lens @user\``).catch(() => {});
      return;
    }
    const targetEconomy = await getCmd(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`, [guildId, target.id]);
    const tBal = targetEconomy?.balance || 0;
    const tBank = targetEconomy?.bank || 0;
    embedTitle = "🔍 𝕄𝕖𝕣𝕔𝕙𝕒𝕟𝕥'𝕤 𝕃𝕖𝕟𝕤 — 𝕌𝕊𝔼𝔻";
    embedDesc = `You peer through the lens at **${target.username}**.\n\n👛 **Wallet:** ${tBal} ${economySettings.currency_name}\n🏦 **Bank:** ${tBank} ${economySettings.currency_name}\n💰 **Total:** ${tBal + tBank} ${economySettings.currency_name}\n\n*The lens shatters after revealing this truth.*`;
    embedColor = 0xaaddff;

  } else if (effect === "witch_brew") {
    const win = Math.random() < 0.5;
    if (win) {
      await runCmd(`UPDATE user_economy SET balance=? WHERE guild_id=? AND user_id=?`, [balance * 2, guildId, userId]);
      embedTitle = "🫖 𝕎𝕚𝕥𝕔𝕙'𝕤 𝔹𝕣𝕖𝕨 — 𝔹𝕃𝔼𝕊𝕊𝔼𝔻!";
      embedDesc = `The brew tastes like copper and nightmares. Then the room spins...\n\n✨ **DOUBLED!** You gained **+${balance}** ${economySettings.currency_name}!`;
      embedColor = 0xff88ff;
    } else {
      const loss = Math.floor(balance / 2);
      await runCmd(`UPDATE user_economy SET balance=? WHERE guild_id=? AND user_id=?`, [loss, guildId, userId]);
      embedTitle = "🫖 𝕎𝕚𝕥𝕔𝕙'𝕤 𝔹𝕣𝕖𝕨 — ℂ𝕌ℝ𝕊𝔼𝔻!";
      embedDesc = `The brew tastes like copper and nightmares. Your coins vanish...\n\n💀 **HALVED!** Lost **${balance - loss}** ${economySettings.currency_name}.`;
      embedColor = 0x660066;
    }

  } else if (effect === "dragon_scale") {
    const expires = now + 10800000;
    await runCmd(`INSERT INTO user_buffs (guild_id, user_id, buff_id, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT (guild_id, user_id, buff_id) DO UPDATE SET expires_at=?`,
      [guildId, userId, "earnings_boost_100", expires, expires]);
    embedTitle = "🐉 𝔻𝕣𝕒𝕘𝕠𝕟 𝕊𝕔𝕒𝕝𝕖 — 𝕀ℕ𝔽𝕌𝕊𝔼𝔻";
    embedDesc = "You hold the scale and feel ancient power surge through you. The air crackles.\n\n⚡ **2x ALL earnings** for **3 hours**!";
    embedColor = 0xff4400;

  } else if (effect === "cursed_compass") {
    const success = Math.random() < 0.65;
    if (success) {
      const bonus = Math.floor(Math.random() * 2500) + 500;
      await runCmd(`UPDATE user_economy SET balance=? WHERE guild_id=? AND user_id=?`, [balance + bonus, guildId, userId]);
      embedTitle = "🧭 ℂ𝕦𝕣𝕤𝕖𝕕 ℂ𝕠𝕞𝕡𝕒𝕤𝕤 — 𝕋ℝ𝔼𝔸𝕊𝕌ℝ𝔼 𝔽𝕆𝕌ℕ𝔻!";
      embedDesc = `The compass needle spins wildly then locks. You dig exactly where it points.\n\n💎 **Treasure found! +${bonus}** ${economySettings.currency_name}!`;
      embedColor = 0xffd700;
    } else {
      const loss = Math.min(balance, Math.floor(Math.random() * 200) + 50);
      await runCmd(`UPDATE user_economy SET balance=? WHERE guild_id=? AND user_id=?`, [balance - loss, guildId, userId]);
      embedTitle = "🧭 ℂ𝕦𝕣𝕤𝕖𝕕 ℂ𝕠𝕞𝕡𝕒𝕤𝕤 — 𝔻𝔸ℕ𝔾𝔼ℝ!";
      embedDesc = `The compass leads you straight into a bog trap.\n\n💸 Lost **${loss}** ${economySettings.currency_name} in the chaos.`;
      embedColor = 0x994400;
    }

  } else if (effect === "ancient_coin") {
    const value = Math.floor(450 * 1.5);
    await runCmd(`UPDATE user_economy SET balance=? WHERE guild_id=? AND user_id=?`, [balance + value, guildId, userId]);
    embedTitle = "🪙 𝔸𝕟𝕔𝕚𝕖𝕟𝕥 ℂ𝕠𝕚𝕟 — 𝕊𝕆𝕃𝔻";
    embedDesc = `A shady merchant materialized from the shadows. "Ah, a Pre-Murk sovereign!"\n\n💰 Sold for **${value}** ${economySettings.currency_name} (1.5x value)!`;
    embedColor = 0xddaa00;

  } else if (effect === "void_essence") {
    const shards = Math.floor(Math.random() * 6) + 3;
    await runCmd(`INSERT INTO user_inventory (guild_id, user_id, item_id, quantity) VALUES (?, ?, ?, ?) ON CONFLICT (guild_id, user_id, item_id) DO UPDATE SET quantity = user_inventory.quantity + ?`,
      [guildId, userId, "murk_shard", shards, shards]);
    embedTitle = "🌑 𝕍𝕠𝕚𝕕 𝔼𝕤𝕤𝕖𝕟𝕔𝕖 — ℂ𝕆ℕ𝕊𝕌𝕄𝔼𝔻";
    embedDesc = `You uncork the vial. The void energy swirls out and crystallizes.\n\n⚫ The essence became **${shards} Murk Shards** in your inventory!`;
    embedColor = 0x110022;

  } else if (effect === "frog_amulet") {
    const expires = now + (365 * 24 * 3600000);
    await runCmd(`INSERT INTO user_buffs (guild_id, user_id, buff_id, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT (guild_id, user_id, buff_id) DO UPDATE SET expires_at=?`,
      [guildId, userId, "daily_boost_15", expires, expires]);
    embedTitle = "🐸 𝔽𝕣𝕠𝕘 𝔸𝕞𝕦𝕝𝕖𝕥 — 𝔸𝕋𝕋𝕌ℕ𝔼𝔻";
    embedDesc = "You slip the amulet over your neck. One of the carvings blinks.\n\n✅ **+15% daily rewards** — permanent while owned!";
    embedColor = 0x33ff33;
    consumed = false; // single-use item persists in inventory

  } else if (effect === "lizard_totem") {
    const expires = now + (365 * 24 * 3600000);
    await runCmd(`INSERT INTO user_buffs (guild_id, user_id, buff_id, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT (guild_id, user_id, buff_id) DO UPDATE SET expires_at=?`,
      [guildId, userId, "passive_regen_50", expires, expires]);
    embedTitle = "🦎 𝕃𝕚𝕫𝕒𝕣𝕕 𝕋𝕠𝕥𝕖𝕞 — 𝔸ℂ𝕋𝕀𝕍𝔸𝕋𝔼𝔻";
    embedDesc = "The totem vibrates in your palm. The lizard carving opens its eyes.\n\n✅ **+50 coin passive regen** every hour — permanent!";
    embedColor = 0x55aaff;
    consumed = false;

  } else if (effect === "frog_crown") {
    const expires = now + (365 * 24 * 3600000);
    await runCmd(`INSERT INTO user_buffs (guild_id, user_id, buff_id, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT (guild_id, user_id, buff_id) DO UPDATE SET expires_at=?`,
      [guildId, userId, "royal_boost", expires, expires]);
    embedTitle = "👑 𝔽𝕣𝕠𝕘 ℂ𝕣𝕠𝕨𝕟 — ℂℝ𝕆𝕎ℕ𝔼𝔻";
    embedDesc = "You place the crown upon your head. The swamp falls silent.\n\n✅ **+25% daily & weekly bonus** — permanently bestowed!";
    embedColor = 0xffcc00;
    consumed = false;

  } else if (effect === "black_market_pass") {
    const expires = now + (365 * 24 * 3600000);
    await runCmd(`INSERT INTO user_buffs (guild_id, user_id, buff_id, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT (guild_id, user_id, buff_id) DO UPDATE SET expires_at=?`,
      [guildId, userId, "bazaar_access", expires, expires]);
    embedTitle = "🎭 𝔹𝕝𝕒𝕔𝕜 𝕄𝕒𝕣𝕜𝕖𝕥 ℙ𝕒𝕤𝕤 — 𝔸ℂ𝕋𝕀𝕍𝔸𝕋𝔼𝔻";
    embedDesc = "The pass glows with a dim red light. Somewhere in the Murk, a door unlocks.\n\n✅ **Dark Bazaar access** unlocked permanently!";
    embedColor = 0x880000;
    consumed = false;

  } else if (effect === "revival_potion") {
    consumed = false;
    await message.reply({ embeds: [{ color: 0x9b59b6, description: `🛡️ **${inventoryItem.name}** is held in reserve � it automatically activates when you would die in an adventure or explore event.` }] }).catch(() => {});
    return;

  } else if (effect === "bog_whistle") {
    const success = Math.random() < 0.75;
    if (success) {
      const bonus = Math.floor(Math.random() * 1200) + 300;
      await runCmd(`UPDATE user_economy SET balance=? WHERE guild_id=? AND user_id=?`, [balance + bonus, guildId, userId]);
      embedTitle = "🎵 𝔹𝕠𝕘 𝕎𝕙𝕚𝕤𝕥𝕝𝕖 — 𝕊𝕡𝕚𝕣𝕚𝕥𝕤 ℍ𝔼𝔸ℝ𝔻";
      embedDesc = `The eerie call echoes across the swamp. The spirits answered.\n\n✅ **+${bonus}** ${economySettings.currency_name} dropped from the mist!`;
      embedColor = 0x88ccff;
    } else {
      embedTitle = "🎵 𝔹𝕠𝕘 𝕎𝕙𝕚𝕤𝕥𝕝𝕖 — 𝕊𝕚𝕝𝕖𝕟𝕔𝕖";
      embedDesc = `The whistle shrieks. The swamp goes quiet. No spirits came.\n\n💨 Nothing happened this time. The whistle is spent.`;
      embedColor = 0x556677;
    }

  } else if (effect === "mana_potion") {
    await runCmd(
      `UPDATE minigames_stats SET last_played=0 WHERE guild_id=? AND user_id=? AND minigame IN ('fishing','digging','mining','hunting')`,
      [guildId, userId]
    );
    embedTitle = "💙 𝕄𝕒𝕟𝕒 ℙ𝕠𝕥𝕚𝕠𝕟 — 𝔻ℝ𝔸𝕀ℕ𝔼𝔻";
    embedDesc = "The crystalline liquid radiates cold light as you drink it. Your fatigue evaporates.\n\n✅ **All gathering cooldowns reset!** (fish, dig, mine, hunt)";
    embedColor = 0x3399ff;

  } else if (effect === "time_crystal") {
    await runCmd(
      `UPDATE minigames_stats SET last_played=0 WHERE guild_id=? AND user_id=?`,
      [guildId, userId]
    );
    embedTitle = "⏱️ 𝕋𝕚𝕞𝕖 ℂ𝕣𝕪𝕤𝕥𝕒𝕝 — 𝕊𝕙𝕒𝕥𝕥𝕖𝕣𝕖𝕕";
    embedDesc = "The crystal vibrates violently then explodes in a shiver of temporal energy.\n\n✅ **ALL cooldowns reset** — every activity is available immediately!";
    embedColor = 0xaaeeff;

  } else if (effect === "bone_charm") {
    const expires = now + (4 * 3600000);
    await runCmd(`INSERT INTO user_buffs (guild_id, user_id, buff_id, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT (guild_id, user_id, buff_id) DO UPDATE SET expires_at=?`,
      [guildId, userId, "work_bonus_25", expires, expires]);
    embedTitle = "🦴 𝔹𝕠𝕘 ℂ𝕙𝕒𝕣𝕞 — 𝔸ℂ𝕋𝕀𝕍𝔸𝕋𝔼𝔻";
    embedDesc = "The bone rattles as you snap it in half. A warm energy washes over you.\n\n✅ **+25% job pay** for **4 hours**!";
    embedColor = 0xeecc99;

  } else if (effect === "experience_vial") {
    const expires = now + (2 * 3600000);
    await runCmd(`INSERT INTO user_buffs (guild_id, user_id, buff_id, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT (guild_id, user_id, buff_id) DO UPDATE SET expires_at=?`,
      [guildId, userId, "work_boost_30", expires, expires]);
    embedTitle = "⚗️ 𝔼𝕩𝕡𝕖𝕣𝕚𝕖𝕟𝕔𝕖 𝕍𝕚𝕒𝕝 — 𝔻ℝ𝕌ℕ𝕂";
    embedDesc = "You swallow the shimmering fluid. Your mind sharpens with sudden clarity.\n\n✅ **+30% job pay** for **2 hours**!";
    embedColor = 0x99ffcc;

  } else if (effect === "bog_armor") {
    const expires = now + (6 * 3600000);
    await runCmd(`INSERT INTO user_buffs (guild_id, user_id, buff_id, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT (guild_id, user_id, buff_id) DO UPDATE SET expires_at=?`,
      [guildId, userId, "rob_resist_75", expires, expires]);
    embedTitle = "🛡️ 𝔹𝕠𝕘 𝔸𝕣𝕞𝕠𝕣 — 𝔼ℕ𝔸𝔹𝕃𝔼𝔻";
    embedDesc = "The thick bog-hide armor molds to your form, hardening like stone.\n\n✅ **Robbery fines reduced by 75%** for **6 hours**!";
    embedColor = 0x886644;

  } else if (effect === "void_key") {
    const expires = now + (1 * 3600000);
    await runCmd(`INSERT INTO user_buffs (guild_id, user_id, buff_id, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT (guild_id, user_id, buff_id) DO UPDATE SET expires_at=?`,
      [guildId, userId, "void_triple", expires, expires]);
    embedTitle = "🗝️ 𝕍𝕠𝕚𝕕 𝕂𝕖𝕪 — 𝕀ℕ𝕊𝔼ℝ𝕋𝔼𝔻";
    embedDesc = "The key dissolves into the air, leaving a faint void-haze around your hands.\n\n✅ **3x dig & mine rewards** for **1 hour**!";
    embedColor = 0x6600aa;

  } else if (effect === "chaos_stone") {
    // Weighted random multiplier outcome
    const roll = Math.random();
    let mult;
    let outcomeText;
    if (roll < 0.30)      { mult = 0.20; outcomeText = "💀 The void consumes **80% of your coins!**"; }
    else if (roll < 0.50) { mult = 0.60; outcomeText = "💸 The stone destabilizes — you lose **40%**."; }
    else if (roll < 0.65) { mult = 1.50; outcomeText = "✨ The chaos ripples outward — **+50%!**"; }
    else if (roll < 0.78) { mult = 2.00; outcomeText = "🔥 DOUBLED! The stone burns bright!"; }
    else if (roll < 0.88) { mult = 3.50; outcomeText = "⚡ CHAOS SURGE! **×3.5x** your coins!"; }
    else if (roll < 0.95) { mult = 5.00; outcomeText = "🌀 **VOID JACKPOT! ×5x!**"; }
    else                   { mult = 8.00; outcomeText = "👑 **ABSOLUTE CHAOS! ×8x!!!** THE SWAMP TREMBLES!"; }

    const newBal = Math.floor(balance * mult);
    await runCmd(`UPDATE user_economy SET balance=? WHERE guild_id=? AND user_id=?`, [newBal, guildId, userId]);
    embedTitle = "🌀 ℂ𝕙𝕒𝕠𝕤 𝕊𝕥𝕠𝕟𝕖 — ℝ𝕆𝕃𝕃𝔼𝔻";
    embedDesc = `The stone screams and shatters.\n\n${outcomeText}\n\n**${balance.toLocaleString()}** → **${newBal.toLocaleString()}** ${economySettings.currency_name}`;
    embedColor = mult >= 2 ? 0xff9900 : 0x660033;

  } else if (effect === "bankers_tome") {
    const expires = now + (365 * 24 * 3600000);
    await runCmd(`INSERT INTO user_buffs (guild_id, user_id, buff_id, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT (guild_id, user_id, buff_id) DO UPDATE SET expires_at=?`,
      [guildId, userId, "bank_interest_3", expires, expires]);
    embedTitle = "📚 𝔹𝕒𝕟𝕜𝕖𝕣'𝕤 𝕋𝕠𝕞𝕖 — 𝕃𝔼𝔸ℝℕ𝔼𝔻";
    embedDesc = "The pages flutter of their own accord. The knowledge burns into your mind.\n\n✅ **+3% daily bank interest** — permanently!";
    embedColor = 0xffcc44;
    consumed = false;

  } else if (effect === "murk_compass") {
    const expires = now + (365 * 24 * 3600000);
    await runCmd(`INSERT INTO user_buffs (guild_id, user_id, buff_id, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT (guild_id, user_id, buff_id) DO UPDATE SET expires_at=?`,
      [guildId, userId, "global_boost_15", expires, expires]);
    embedTitle = "🧿 𝕄𝕦𝕣𝕜 ℂ𝕠𝕞𝕡𝕒𝕤𝕤 — 𝔸𝕋𝕋𝕌ℕ𝔼𝔻";
    embedDesc = "The compass needle spins then locks onto you. The swamp recognizes you as one of its own.\n\n✅ **+15% all income** — permanent!";
    embedColor = 0x33ddff;
    consumed = false;

  } else if (effect === "dragon_heart") {
    const expires = now + (365 * 24 * 3600000);
    await runCmd(`INSERT INTO user_buffs (guild_id, user_id, buff_id, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT (guild_id, user_id, buff_id) DO UPDATE SET expires_at=?`,
      [guildId, userId, "passive_regen_600", expires, expires]);
    embedTitle = "❤️‍🔥 𝔻𝕣𝕒𝕘𝕠𝕟 ℍ𝕖𝕒𝕣𝕥 — 𝔹𝔼𝔸𝕋𝕀ℕ𝔾";
    embedDesc = "The heart pulses in your hands then merges with your chest. You feel ancient power flow through you.\n\n✅ **+600 coins/hr passive regen** — permanently!";
    embedColor = 0xff4400;
    consumed = false;

  } else if (effect === "pickaxe" || effect === "hunting_net" || effect === "fishing_rod" || effect === "shovel") {
    consumed = false;
    const toolNames = { pickaxe: "⛏️ Iron Pickaxe", hunting_net: "🕸️ Hunting Net", fishing_rod: "🎣 Fishing Rod", shovel: "⛏️ Rusty Shovel" };
    const toolUses = { pickaxe: "`mine`", hunting_net: "`hunt`", fishing_rod: "`fish`", shovel: "`dig`" };
    await message.reply({ embeds: [{ color: 0x88aacc, description: `🛠️ **${toolNames[effect]}** is a tool — it's already active in your inventory! Use ${toolUses[effect]} to put it to work.` }] }).catch(() => {});
    return;

  } else {
    consumed = false;
    await message.reply({ embeds: [{ color: 0x95a5a6, description: "❓ This item doesn't have a defined interaction yet. Contact a server admin." }] }).catch(() => {});
    return;
  }

  if (consumed) {
    await runCmd(`UPDATE user_inventory SET quantity = quantity - 1 WHERE guild_id=? AND user_id=? AND item_id=?`,
      [guildId, userId, inventoryItem.item_id]);
    await runCmd(`DELETE FROM user_inventory WHERE guild_id=? AND user_id=? AND item_id=? AND quantity <= 0`,
      [guildId, userId, inventoryItem.item_id]);
  }

  const embed = new EmbedBuilder()
    .setTitle(embedTitle)
    .setDescription(embedDesc)
    .setColor(embedColor || 0x9966cc)
    .setThumbnail(inventoryItem.item_image_url || null)
    .setFooter({ text: "THE MURK | Item System" });

  await message.reply({ embeds: [embed] }).catch(() => {});
}

// ==================== ITEM INFO ====================

async function cmdItemInfo(message, args, util) {
  const { EmbedBuilder } = require("discord.js");
  const { economySettings, ecoPrefix, run: runCmd, get: getCmd } = util;

  if (!economySettings?.enabled) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Economy system is disabled." }] }).catch(() => {});
    return;
  }

  if (!args[0]) {
    await message.reply(`📦 Usage: \`${ecoPrefix}item <item_name>\``).catch(() => {});
    return;
  }

  const itemName = args.join(" ").toLowerCase();
  const item = await getCmd(`SELECT * FROM economy_shop_items WHERE guild_id=? AND (LOWER(name) LIKE ? OR item_id LIKE ?)`,
    [message.guild.id, `%${itemName}%`, `%${itemName}%`]);

  if (!item) {
    await message.reply(`❌ Item not found: **${args.join(" ")}**\nCheck the shop with \`${ecoPrefix}shop\``).catch(() => {});
    return;
  }

  const catalogEntry = MURK_CATALOG.find(c => c.item_id === item.item_id);
  const lore = catalogEntry?.lore || "No lore recorded in the Murk archives.";

  const owned = await getCmd(`SELECT quantity FROM user_inventory WHERE guild_id=? AND user_id=? AND item_id=?`,
    [message.guild.id, message.author.id, item.item_id]);

  const typeColors = { tool: 0x3399ff, consumable: 0xff6633, material: 0x99aa33, collectible: 0xffcc00, single: 0xcc44ff, misc: 0x888888 };

  const embed = new EmbedBuilder()
    .setTitle(item.name)
    .setDescription(`${item.description}\n\n> *"${lore}"*`)
    .setColor(typeColors[item.item_type] || 0x888888)
    .setThumbnail(item.item_image_url || null)
    .addFields(
      { name: "💰 Price", value: `${item.price} ${economySettings.currency_name}`, inline: true },
      { name: "🏷️ Type", value: item.item_type.charAt(0).toUpperCase() + item.item_type.slice(1), inline: true },
      { name: "🎒 You Own", value: owned ? `${owned.quantity}x` : "None", inline: true }
    );

  if (item.use_effect && item.use_effect !== "fishing_rod" && item.use_effect !== "shovel" && item.use_effect !== "prestige_use" && item.use_effect !== "revival_potion") {
    embed.addFields({ name: "⚡ Use Command", value: `\`${ecoPrefix}use ${item.item_id}\``, inline: true });
  }
  embed.setFooter({ text: "THE MURK | Item Compendium" });

  await message.reply({ embeds: [embed] }).catch(() => {});
}

// ==================== GIFT SYSTEM ====================

async function cmdGift(message, args, util) {
  const { economySettings, ecoPrefix, run: runCmd, get: getCmd } = util;

  if (!economySettings?.enabled) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Economy system is disabled." }] }).catch(() => {});
    return;
  }

  const target = message.mentions.users.first();
  if (!target || args.length < 2) {
    await message.reply(`❌ Usage: \`${ecoPrefix}gift @user <item_name>\``).catch(() => {});
    return;
  }

  if (target.id === message.author.id) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ You can't gift items to yourself." }] }).catch(() => {});
    return;
  }

  const itemName = args.slice(1).filter(a => !a.startsWith("<@")).join(" ").toLowerCase();

  const inventoryItem = await getCmd(`
    SELECT ui.quantity, si.name, si.item_type, si.item_image_url, si.item_id
    FROM user_inventory ui
    JOIN economy_shop_items si ON si.item_id = ui.item_id AND si.guild_id = ui.guild_id
    WHERE ui.guild_id=? AND ui.user_id=?
      AND (LOWER(si.name) LIKE ? OR si.item_id LIKE ?)
      AND ui.quantity > 0
  `, [message.guild.id, message.author.id, `%${itemName}%`, `%${itemName}%`]);

  if (!inventoryItem) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: `❌ You don't have **${args.slice(1).filter(a => !a.startsWith('<@')).join(' ')}** in your inventory!` }] }).catch(() => {});
    return;
  }

  await runCmd(`UPDATE user_inventory SET quantity = quantity - 1 WHERE guild_id=? AND user_id=? AND item_id=?`,
    [message.guild.id, message.author.id, inventoryItem.item_id]);
  await runCmd(`DELETE FROM user_inventory WHERE guild_id=? AND user_id=? AND item_id=? AND quantity <= 0`,
    [message.guild.id, message.author.id, inventoryItem.item_id]);
  await runCmd(`INSERT INTO user_inventory (guild_id, user_id, item_id, quantity) VALUES (?, ?, ?, 1) ON CONFLICT (guild_id, user_id, item_id) DO UPDATE SET quantity = user_inventory.quantity + 1`,
    [message.guild.id, target.id, inventoryItem.item_id]);

  await message.reply({ embeds: [{ color: 0x2ecc71, title: '🎁 Gift Sent!', description: `You gifted **${inventoryItem.name}** to **${target.username}**! They'll find it in their inventory.` }] }).catch(() => {});
}
