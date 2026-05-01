const { all, get, run } = require("./db");
const { EmbedBuilder } = require("discord.js");

/**
 * ============ MURK ECONOMY: LORE-DRIVEN DEEP ECONOMY ============
 * 
 * THE MURK LORE:
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * Deep beneath the fetid swamp lies THE MURKâ€”a sunken civilization built by
 * ancient traders and alchemists. Once it thrived, but a great catastrophe
 * sealed it underwater. Now YOU are a Murk Adept, scrounging through its ruins
 * for wealth, forbidden knowledge, and power.
 * 
 * CLASS SYSTEM (Murk Archetypes):
 *   â€¢ BRIGAND: Stealth, theft, high-risk robberies (25% faster cooldowns)
 *   â€¢ ARTIFICER: Crafting, item creation, dark bazaar discount (20% shop discount)
 *   â€¢ SCHOLAR: Lore collection, expedition bonuses (25% more loot from explore/fish)
 *   â€¢ MERCHANT: Trading, bounty posting, profit margins (10% bank interest daily)
 * 
 * KEY MECHANICS:
 *   1. Daily Stock â†’ Dark Bazaar refreshes daily with new items
 *   2. Bounty Board â†’ Post & claim bounties for coins
 *   3. Crafting â†’ Combine items into powerful artifacts & buffs
 *   4. Prestige System â†’ Ascend to godhood, reset for multiplicative power
 *   5. Lore Collection â†’ Unlock story & secrets
 */

// ==================== MURK CLASSES ==================

const MURK_CLASSES = {
  brigand: {
    name: "ðŸ—¡ï¸ Brigand",
    icon: "ðŸ—¡ï¸",
    description: "Master of stealth and high-risk crimes. 25% faster robbery cooldowns.",
    passive: "robbery_speedup",
    passive_value: 0.75  // multiply cooldown by 0.75
  },
  artificer: {
    name: "âš™ï¸ Artificer",
    icon: "âš™ï¸",
    description: "Craftsperson of the Murk. 20% discount at Dark Bazaar.",
    passive: "bazaar_discount",
    passive_value: 0.8
  },
  scholar: {
    name: "ðŸ“– Scholar",
    icon: "ðŸ“–",
    description: "Collector of forbidden knowledge. 25% more loot from expeditions.",
    passive: "expedition_bonus",
    passive_value: 1.25
  },
  merchant: {
    name: "ðŸ’¼ Merchant",
    icon: "ðŸ’¼",
    description: "Trader extraordinaire. 10% daily bank interest.",
    passive: "daily_interest",
    passive_value: 0.1
  }
};

// ==================== DARK BAZAAR (Daily Shop) ==================

const BAZAAR_POOL = [
  { id: "murk_shard", name: "ðŸ”® Murk Shard", price: 150, description: "Fragment of Murk power. Sell for +50%." },
  { id: "swamp_tonic", name: "ðŸ§ª Swamp Tonic", price: 200, description: "Grants +25% earnings for 1 hour." },
  { id: "ancient_coin", name: "ðŸ’Ž Ancient Coin", price: 100, description: "Worth 1.5x normal coins at bank." },
  { id: "trap_kit", name: "ðŸª¤ Trap Kit", price: 250, description: "Defend against robberiesâ€”one-time use." },
  { id: "fortune_scroll", name: "ðŸ“œ Fortune Scroll", price: 300, description: "Reroll next dig/fish for better loot." },
  { id: "murk_map", name: "ðŸ—ºï¸ Murk Map", price: 500, description: "Find hidden Murk zones for 24hrs." },
  { id: "void_essence", name: "âœ¨ Void Essence", price: 800, description: "Increases max wallet capacity +500." }
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
    name: "ðŸ”® Murk Elixir (Master)",
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
    name: "ðŸ‘‘ Prestige Token",
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
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "âŒ Economy system is disabled." }] }).catch(() => {});
    return;
  }

  const subcommand = (args[0] || "").toLowerCase();

  if (subcommand === "list") {
    const bounties = await all(
      `SELECT * FROM bounties WHERE guild_id=? AND status='active' ORDER BY amount DESC LIMIT 10`,
      [message.guild.id]
    );

    if (bounties.length === 0) {
      await message.reply({ embeds: [{ color: 0x95a5a6, description: `ðŸ“‹ No active bounties. Use \`${ecoPrefix}bounty post @user <amount>\` to create one!` }] }).catch(() => {});
      return;
    }

    const list = bounties.map((b, i) => 
      `**${i + 1}.** <@${b.target_id}> â€” **${b.amount}** ${economySettings.currency_name}\nPosted by <@${b.poster_id}>`
    ).join("\n\n");

    await message.reply({ embeds: [{ color: 0xff6b6b, title: "ðŸ’€ Bounty Board", description: list, footer: { text: `Use '${ecoPrefix}bounty claim <number>' to claim a bounty!` } }] }).catch(() => {});
    return;
  }

  if (subcommand === "post") {
    if (args.length < 2) {
      await message.reply({ embeds: [{ color: 0x9b59b6, title: "ðŸ’€ Post a Bounty", description: `**Usage:** \`${ecoPrefix}bounty post @user <amount>\`\n\nPost a bounty on someone for coins! Anyone can claim it by targeting that user.` }] }).catch(() => {});
      return;
    }

    const target = message.mentions.users.first();
    if (!target) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: "âŒ Please mention a user to bounty." }] }).catch(() => {});
      return;
    }

    const amount = parseInt(args[2]);
    if (isNaN(amount) || amount < 50) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: "âŒ Minimum bounty is **50** coins." }] }).catch(() => {});
      return;
    }

    const poster = await getCmd(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`,
      [message.guild.id, message.author.id]);

    if (!poster || poster.balance < amount) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: `âŒ You need **${amount}** ${economySettings.currency_name} to post this bounty!` }] }).catch(() => {});
      return;
    }

    await runCmd(`UPDATE user_economy SET balance=balance-? WHERE guild_id=? AND user_id=?`,
      [amount, message.guild.id, message.author.id]);

    const expiresAt = Date.now() + 604800000;
    await runCmd(
      `INSERT INTO bounties (guild_id, poster_id, target_id, amount, expires_at) VALUES (?, ?, ?, ?, ?)`,
      [message.guild.id, message.author.id, target.id, amount, expiresAt]
    );

    await message.reply({ embeds: [{ color: 0xff6b6b, title: "ðŸ’€ Bounty Posted!", description: `**Target:** ${target}\n**Reward:** ${amount} ${economySettings.currency_name}\n**Expires:** <t:${Math.floor(expiresAt/1000)}:R>` }] }).catch(() => {});
    return;
  }

  if (subcommand === "claim") {
    const bountyId = parseInt(args[1]);
    if (isNaN(bountyId)) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: "âŒ Invalid bounty ID." }] }).catch(() => {});
      return;
    }

    const bounty = await getCmd(`SELECT * FROM bounties WHERE id=? AND status='active' AND guild_id=?`,
      [bountyId, message.guild.id]);

    if (!bounty) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: "âŒ Bounty not found or already claimed." }] }).catch(() => {});
      return;
    }

    if (message.author.id === bounty.target_id) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: "âŒ You can't claim a bounty on yourself!" }] }).catch(() => {});
      return;
    }

    await runCmd(`UPDATE bounties SET claimed_by=?, claimed_at=?, status='claimed' WHERE id=?`,
      [message.author.id, Date.now(), bountyId]);
    await runCmd(`UPDATE user_economy SET balance=balance+? WHERE guild_id=? AND user_id=?`,
      [bounty.amount, message.guild.id, message.author.id]);

    await message.reply({ embeds: [{ color: 0x2ecc71, title: "ðŸ’€ Bounty Claimed!", description: `You earned **${bounty.amount}** ${economySettings.currency_name}!\n**Target was:** <@${bounty.target_id}>` }] }).catch(() => {});
    return;
  }

  await message.reply({ embeds: [{ color: 0x9b59b6, title: "ðŸ’€ Bounty Board", description: `\`${ecoPrefix}bounty list\` â€” See all active bounties\n\`${ecoPrefix}bounty post @user <amount>\` â€” Post a bounty\n\`${ecoPrefix}bounty claim <id>\` â€” Claim reward` }] }).catch(() => {});
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
      title: "âš™ï¸ Crafting Recipes",
      description: recipes,
      footer: { text: `Use craft <recipe> to craft!` }
    }] }).catch(() => {});
    return;
  }

  const recipeName = args[0].toLowerCase();
  const recipe = RECIPES[recipeName];

  if (!recipe) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "âŒ Recipe not found. Use `craft` to see available recipes." }] }).catch(() => {});
    return;
  }

  // Check inputs
  for (const input of recipe.inputs) {
    const inv = await getCmd(
      `SELECT * FROM user_inventory WHERE guild_id=? AND user_id=? AND item_id=?`,
      [message.guild.id, message.author.id, input.item]
    );

    if (!inv || inv.quantity < input.qty) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: `âŒ You need **${input.qty}x ${input.item}** to craft this!` }] }).catch(() => {});
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

  await message.reply({ embeds: [{ color: 0x7b68ee, title: "âœ¨ Crafted!", description: `Successfully crafted **${recipe.name}**!${recipe.reward_coins > 0 ? `\n\nðŸ’° Bonus: +${recipe.reward_coins} ${economySettings.currency_name}` : ""}` }] }).catch(() => {});
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
      await message.reply({ embeds: [{ color: 0xe74c3c, description: "âŒ You must craft a **Prestige Token** first before ascending!" }] }).catch(() => {});
      return;
    }

    const multiplier = 1 + (econ.prestige_level * 0.2);
    const awardedBalance = Math.floor(econ.total_earned * multiplier);

    await runCmd(
      `UPDATE user_economy SET balance=?, total_earned=0, prestige_level=0 WHERE guild_id=? AND user_id=?`,
      [awardedBalance, message.guild.id, message.author.id]
    );

    await message.reply({ embeds: [new EmbedBuilder().setColor(0xffd700).setTitle("ðŸ‘‘ ASCENDED!").setDescription(`You've become a Murk God!\n\nðŸ’° **Prestige Reward:** ${awardedBalance} ${economySettings.currency_name}\nðŸ“Š **Multiplier:** ${multiplier}x your lifetime earnings`)] }).catch(() => {});
    return;
  }

  const embed = {
    color: 0xffd700,
    title: "ðŸ‘‘ Prestige Status",
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
      title: "âš”ï¸ Murk Archetypes",
      description: classList,
      footer: { text: `Choose: class select <brigand|artificer|scholar|merchant>` }
    }] }).catch(() => {});
    return;
  }

  const classKey = args[0].toLowerCase();
  const murk_class = MURK_CLASSES[classKey];

  if (!murk_class) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "âŒ Invalid class! Choose: `brigand`, `artificer`, `scholar`, or `merchant`." }] }).catch(() => {});
    return;
  }

  await runCmd(
    `INSERT INTO user_class (guild_id, user_id, class_id) VALUES (?, ?, ?)
     ON CONFLICT (guild_id, user_id) DO UPDATE SET class_id = ?`,
    [message.guild.id, message.author.id, classKey, classKey]
  );

  await message.reply({ embeds: [{ color: 0x00d4ff, title: `âš”ï¸ Class Chosen: ${murk_class.name}`, description: murk_class.description }] }).catch(() => {});
}

// ==================== SWAMP STORY SYSTEM ====================

const SWAMP_STORIES = {
  "frog_prince": {
    title: "ðŸ¸ The Frog Prince's Curse",
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
    title: "ðŸ§™â€â™€ï¸ The Swamp Witch's Brew",
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
    title: "ðŸ‰ The Dragon's Treasure",
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
    title: "ðŸ¦Ÿ Mosquito Swarm Attack!",
    description: "A massive swarm of bloodthirsty mosquitoes descends upon you!",
    choices: [
      { text: "Swat them away", success: 0.6, reward: "mosquito_wings", consequence: "You fight them off but get bitten!" },
      { text: "Run away", success: 1.0, reward: null, consequence: "You escape but lose your dignity!" },
      { text: "Use bug spray", requires: "bug_spray", reward: "mosquito_slaughter", consequence: "The swarm is annihilated!" }
    ]
  },
  {
    id: "crocodile_ambush",
    title: "ðŸŠ Crocodile Ambush!",
    description: "A massive crocodile bursts from the water, jaws snapping!",
    choices: [
      { text: "Fight back with your bare hands", success: 0.2, reward: "croc_teeth", consequence: "Miraculously, you survive!", death_chance: 0.8 },
      { text: "Use a fishing rod as a weapon", requires: "fishing_rod", success: 0.7, reward: "croc_skin", consequence: "You hook the croc and win!" },
      { text: "Jump on its back", success: 0.4, reward: "croc_ride", consequence: "You tame the beast!" }
    ]
  },
  {
    id: "treasure_chest",
    title: "ðŸ’° Mysterious Treasure Chest",
    description: "You find a chest half-buried in the mud. It might be trapped!",
    choices: [
      { text: "Open it carefully", success: 0.8, reward: "random_treasure", consequence: "You find valuable items!" },
      { text: "Smash it open", success: 0.6, reward: "broken_treasure", consequence: "Some items break, but you get others!" },
      { text: "Leave it alone", success: 1.0, reward: null, consequence: "Better safe than sorry." }
    ]
  }
];

const DEATH_SCENARIOS = [
  "ðŸŠ You were eaten by a crocodile!",
  "ðŸ¦Ÿ You were drained dry by mosquitoes!",
  "ðŸ You stepped on a venomous snake!",
  "ðŸ•·ï¸ You were bitten by a giant spider!",
  "ðŸŒ¿ You ate poisonous swamp berries!",
  "ðŸ’§ You drowned in quicksand!",
  "ðŸº You were mauled by swamp wolves!",
  "ðŸ§Ÿ You were possessed by swamp spirits!"
];

const REVIVAL_METHODS = [
  { item: "revival_potion", name: "ðŸ§ª Revival Potion", description: "Brings you back from the dead" },
  { item: "frog_amulet", name: "ðŸ¸ Frog Amulet", description: "Protects against one death" },
  { item: "lizard_totem", name: "ðŸ¦Ž Lizard Totem", description: "Revives you with lizard magic" },
  { item: "swamp_blessing", name: "ðŸŒ¿ Swamp Blessing", description: "Nature's protection" }
];

// ==================== SWAMP ADVENTURE SYSTEM ====================

async function cmdAdventure(message, args, util) {
  const { economySettings, ecoPrefix, run: runCmd, get: getCmd } = util;

  if (!economySettings?.enabled) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "âŒ Economy system is disabled." }] }).catch(() => {});
    return;
  }

  const storyId = args[0]?.toLowerCase();
  if (!storyId || !SWAMP_STORIES[storyId]) {
    const availableStories = Object.entries(SWAMP_STORIES).map(([id, story]) =>
      `**${id}** â€” ${story.title}`
    ).join('\n');

    await message.reply({ embeds: [new EmbedBuilder()
      .setColor(0x2d6a4f)
      .setTitle("ðŸ—ºï¸ Swamp Adventures")
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
    await message.reply({ embeds: [{ color: 0xf1c40f, title: `âœ… ${story.title}`, description: "You have **completed** this adventure! Well done, Murk Adept." }] }).catch(() => {});
    return;
  }

  const choicesText = chapter.choices.map((choice, i) => `**${i + 1}.** ${choice.text}`).join('\n');

  await message.reply({ embeds: [new EmbedBuilder()
    .setColor(0x2d6a4f)
    .setTitle(`ðŸ“– ${story.title} â€” Chapter ${currentChapter}`)
    .setDescription(`${chapter.text}\n\n**Choices:**\n${choicesText}\n\n*Reply with the number of your choice within 30 seconds!*`)
  ] }).catch(() => {});

  const filter = (m) => m.author.id === message.author.id && /^\d+$/.test(m.content.trim());
  const collector = message.channel.createMessageCollector({ filter, time: 30000, max: 1 });

  collector.on('collect', async (choiceMsg) => {
    const choiceIndex = parseInt(choiceMsg.content.trim()) - 1;
    const choice = chapter.choices[choiceIndex];

    if (!choice) {
      await choiceMsg.reply({ embeds: [{ color: 0xe74c3c, description: "âŒ Invalid choice number!" }] }).catch(() => {});
      return;
    }

    if (choice.death_chance && Math.random() < choice.death_chance) {
      await handleDeath(message, util, `You died during **${story.title}**! ${DEATH_SCENARIOS[Math.floor(Math.random() * DEATH_SCENARIOS.length)]}`);
      return;
    }

    let rewardText = "";
    if (choice.reward) {
      await giveReward(message, choice.reward, util);
      rewardText = `\n\nðŸŽ **Reward:** ${choice.reward.replace(/_/g, ' ')}!`;
    }

    const nextChapter = currentChapter + 1;
    const isCompleted = !story.chapters[nextChapter];

    await runCmd(
      `INSERT INTO story_progress (guild_id, user_id, story_id, chapter, completed, last_updated)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (guild_id, user_id, story_id) DO UPDATE SET chapter=?, completed=?, last_updated=?`,
      [message.guild.id, message.author.id, storyId, nextChapter, isCompleted ? 1 : 0, Date.now(), nextChapter, isCompleted ? 1 : 0, Date.now()]
    );

    const completionText = isCompleted ? "\n\nðŸ† **Adventure Completed!**" : `\n\nðŸ“– Continue to Chapter ${nextChapter} next time...`;
    await choiceMsg.reply({ embeds: [new EmbedBuilder()
      .setColor(isCompleted ? 0xf1c40f : 0x2ecc71)
      .setTitle("âœ… Choice Made")
      .setDescription(`**${choice.text}**${rewardText}${completionText}`)
    ] }).catch(() => {});
  });

  collector.on('end', (collected, reason) => {
    if (reason === 'time') {
      message.reply({ embeds: [{ color: 0x95a5a6, description: "â° Time's up! Adventure paused â€” use the command again to continue." }] }).catch(() => {});
    }
  });
}

// ==================== RANDOM SWAMP EVENTS ====================

async function cmdExplore(message, args, util) {
  const { economySettings, ecoPrefix, run: runCmd, get: getCmd } = util;

  if (!economySettings?.enabled) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "âŒ Economy system is disabled." }] }).catch(() => {});
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
    await message.reply({ embeds: [{ color: 0xf39c12, description: `ðŸŒ¿ You're still recovering! Come back in **${minutes}m ${seconds}s**.` }] }).catch(() => {});
    return;
  }

  const event = SWAMP_EVENTS[Math.floor(Math.random() * SWAMP_EVENTS.length)];
  const choicesText = event.choices.map((choice, i) => `**${i + 1}.** ${choice.text}`).join('\n');

  await message.reply({ embeds: [new EmbedBuilder()
    .setColor(0x27ae60)
    .setTitle(`ðŸ—ºï¸ ${event.title}`)
    .setDescription(`${event.description}\n\n**Choices:**\n${choicesText}\n\n*Reply with the number of your choice within 30 seconds!*`)
  ] }).catch(() => {});

  const filter = (m) => m.author.id === message.author.id && /^\d+$/.test(m.content.trim());
  const collector = message.channel.createMessageCollector({ filter, time: 30000, max: 1 });

  collector.on('collect', async (choiceMsg) => {
    const choiceIndex = parseInt(choiceMsg.content.trim()) - 1;
    const choice = event.choices[choiceIndex];

    if (!choice) {
      await choiceMsg.reply({ embeds: [{ color: 0xe74c3c, description: "âŒ Invalid choice number!" }] }).catch(() => {});
      return;
    }

    if (choice.requires) {
      const hasItem = await getCmd(
        `SELECT * FROM user_inventory WHERE guild_id=? AND user_id=? AND item_id=? AND quantity > 0`,
        [message.guild.id, message.author.id, choice.requires]
      );
      if (!hasItem) {
        await choiceMsg.reply({ embeds: [{ color: 0xe74c3c, description: `âŒ You need a **${choice.requires.replace(/_/g, ' ')}** for this!` }] }).catch(() => {});
        return;
      }
    }

    const success = Math.random() < choice.success;
    if (!success) {
      await choiceMsg.reply({ embeds: [{ color: 0xe74c3c, title: "âŒ Failed", description: choice.consequence }] }).catch(() => {});
    } else {
      let rewardText = "";
      if (choice.reward) {
        await giveReward(message, choice.reward, util);
        rewardText = `\n\nðŸŽ **Reward:** ${choice.reward.replace(/_/g, ' ')}!`;
      }
      await choiceMsg.reply({ embeds: [{ color: 0x2ecc71, title: "âœ… Success!", description: `${choice.consequence}${rewardText}` }] }).catch(() => {});
    }

    await runCmd(
      `INSERT INTO minigames_stats (guild_id, user_id, minigame, stat_name, stat_value, last_played)
       VALUES (?, ?, 'exploration', 'last_explore', 1, ?)
       ON CONFLICT (guild_id, user_id, minigame, stat_name) DO UPDATE SET stat_value=stat_value+1, last_played=?`,
      [message.guild.id, message.author.id, now, now]
    );
  });

  collector.on('end', (collected, reason) => {
    if (reason === 'time') {
      message.reply({ embeds: [{ color: 0x95a5a6, description: "â° Time's up! Exploration cancelled." }] }).catch(() => {});
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
      await message.reply({ embeds: [{ color: 0x9b59b6, title: "ðŸ’€ Near Death...", description: `${deathMessage}\n\nBut... **${revival.name}** saves you!\n${revival.description}` }] }).catch(() => {});
      return;
    }
  }

  await message.reply({ embeds: [new EmbedBuilder()
    .setColor(0x2c2c2c)
    .setTitle("ðŸ’€ You Have Died!")
    .setDescription(`${deathMessage}\n\n**You lost half your wallet!**\n\nðŸ’¡ **Ways to revive in future:**\n${REVIVAL_METHODS.map(r => `â€¢ ${r.name} â€” ${r.description}`).join('\n')}\n\nBuy revival items from the shop!`)
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
    "frog_kiss": { money: 100, item: "frog_blessing" },
    "royal_blessing": { money: 500, item: "crown_jewel" },
    "prince_gold": { money: 1000 },
    "prince_scales": { item: "lizard_scales" },
    "strength_elixir": { item: "strength_potion" },
    "youth_serum": { item: "youth_potion" },
    "witch_herbs": { item: "magical_herbs" },
    "dragon_gold": { money: 2000 },
    "dragon_scales": { item: "dragon_scales" },
    "dragon_friendship": { item: "dragon_egg" },
    "mosquito_wings": { money: 50, item: "insect_wings" },
    "mosquito_slaughter": { money: 150, item: "bug_spray" },
    "croc_teeth": { item: "crocodile_teeth" },
    "croc_skin": { item: "crocodile_hide" },
    "croc_ride": { item: "crocodile_whistle" },
    "random_treasure": { money: Math.floor(Math.random() * 500) + 100 },
    "broken_treasure": { money: Math.floor(Math.random() * 300) + 50 }
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
    name: "ðŸŽ£ Fishing Rod",
    price: 300,
    item_type: "tool",
    description: "A gnarled rod carved from swamp oak. Required to fish in the murky waters.",
    item_image_url: "https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/72x72/1f3a3.png",
    use_effect: "fishing_rod",
    lore: "The Murk fishermen say the rod chooses the catch. A crooked rod catches crooked fish."
  },
  {
    item_id: "shovel",
    name: "â›ï¸ Rusty Shovel",
    price: 250,
    item_type: "tool",
    description: "A well-worn shovel caked with dried mud. Required for digging in the swamp.",
    item_image_url: "https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/72x72/26cf.png",
    use_effect: "shovel",
    lore: "What lies beneath the swamp floor? Gold, bones, or something far worse?"
  },
  {
    item_id: "swamp_tonic",
    name: "ðŸ§ª Swamp Tonic",
    price: 200,
    item_type: "consumable",
    description: "A bubbling green brew. Boosts all earnings by 20% for 1 hour.",
    item_image_url: "https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/72x72/1f9ea.png",
    use_effect: "swamp_tonic",
    lore: "Brewed by Mama Gretch, who hasn't been seen since the last bog incident."
  },
  {
    item_id: "revival_potion",
    name: "ðŸ’œ Revival Potion",
    price: 500,
    item_type: "consumable",
    description: "A violet vial that revives you from near-death. Fully restores lost coins on death.",
    item_image_url: "https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/72x72/1f49c.png",
    use_effect: "revival_potion",
    lore: "The taste is indescribable. Most survivors refuse to describe it anyway."
  },
  {
    item_id: "padlock",
    name: "ðŸ”’ Padlock",
    price: 250,
    item_type: "consumable",
    description: "Secures your wallet from thieves. Grants 4-hour robbery immunity when used.",
    item_image_url: "https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/72x72/1f512.png",
    use_effect: "padlock",
    lore: "The lock doesn't keep them out. It just makes them choose someone easier."
  },
  {
    item_id: "trap_kit",
    name: "ðŸª¤ Trap Kit",
    price: 350,
    item_type: "consumable",
    description: "Sets an invisible trap. The next person to rob you loses 20% of their wallet instead.",
    item_image_url: "https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/72x72/1fa64.png",
    use_effect: "trap_kit",
    lore: "Snap. Found it."
  },
  {
    item_id: "fortune_scroll",
    name: "ðŸ“œ Fortune Scroll",
    price: 400,
    item_type: "consumable",
    description: "An ancient parchment. Reading it grants a random coin bonus of 50â€“500.",
    item_image_url: "https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/72x72/1f4dc.png",
    use_effect: "fortune_scroll",
    lore: "The ink moves on its own. The scholars say it's just the humidity."
  },
  {
    item_id: "murk_map",
    name: "ðŸ—ºï¸ Murk Map",
    price: 600,
    item_type: "consumable",
    description: "A hand-drawn map of the deep swamp. Doubles your explore loot for 2 hours.",
    item_image_url: "https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/72x72/1f5fa.png",
    use_effect: "murk_map",
    lore: "Drawn by someone who probably didn't survive the trip back."
  },
  {
    item_id: "void_essence",
    name: "ðŸŒ‘ Void Essence",
    price: 750,
    item_type: "consumable",
    description: "A vial of pure void energy. Use it to crystallize 3â€“8 free Murk Shards.",
    item_image_url: "https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/72x72/1f311.png",
    use_effect: "void_essence",
    lore: "It hums with a frequency that makes animals flee. Most animals."
  },
  {
    item_id: "ancient_coin",
    name: "ðŸª™ Ancient Coin",
    price: 450,
    item_type: "consumable",
    description: "A pre-Murk currency. Sell it to a merchant for 1.5x its purchase value.",
    item_image_url: "https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/72x72/1fa99.png",
    use_effect: "ancient_coin",
    lore: "The face on the coin blinks if you look at it long enough."
  },
  {
    item_id: "murk_shard",
    name: "ðŸ”· Murk Shard",
    price: 150,
    item_type: "material",
    description: "A crystallized fragment of the Murk's dark energy. Core crafting material.",
    item_image_url: "https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/72x72/1f537.png",
    use_effect: null,
    lore: "Found in the deepest bog pools, glowing faintly blue. Do not taste it."
  },
  {
    item_id: "shadow_cloak",
    name: "ðŸŒ‘ Shadow Cloak",
    price: 900,
    item_type: "consumable",
    description: "A cloak woven from Murk shadows. Makes you completely unrobbable for 2 hours.",
    item_image_url: "https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/72x72/1f9e5.png",
    use_effect: "shadow_cloak",
    lore: "You don't hide in shadows. You ARE shadows."
  },
  {
    item_id: "lucky_charm",
    name: "ðŸ€ Lucky Charm",
    price: 700,
    item_type: "consumable",
    description: "A four-leaf clover in swamp resin. +20% earnings boost for 6 hours.",
    item_image_url: "https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/72x72/1f340.png",
    use_effect: "lucky_charm",
    lore: "Lucky in coins, unlucky in everything else. Ask the previous owner."
  },
  {
    item_id: "gamblers_dice",
    name: "ðŸŽ² Gambler's Dice",
    price: 800,
    item_type: "consumable",
    description: "Cursed dice from a lost game. 40% chance to triple your wallet â€” or lose 40%.",
    item_image_url: "https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/72x72/1f3b2.png",
    use_effect: "gamblers_dice",
    lore: "The losing player is never seen again. The winning player wishes they weren't."
  },
  {
    item_id: "merchants_lens",
    name: "ðŸ” Merchant's Lens",
    price: 550,
    item_type: "consumable",
    description: "A magnifying glass that reveals another user's exact wallet & bank balance.",
    item_image_url: "https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/72x72/1f50d.png",
    use_effect: "merchants_lens",
    lore: "Knowledge is power. Knowing someone's balance is dangerous power."
  },
  {
    item_id: "frog_amulet",
    name: "ðŸ¸ Frog Amulet",
    price: 650,
    item_type: "single",
    description: "A carved frog totem from the Murk. Permanently boosts daily rewards by 15%.",
    item_image_url: "https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/72x72/1f438.png",
    use_effect: "frog_amulet",
    lore: "The Murk frogs don't blink. They just wait. Wearing this makes you wait with them."
  },
  {
    item_id: "lizard_totem",
    name: "ðŸ¦Ž Lizard Totem",
    price: 850,
    item_type: "single",
    description: "An ancient carved totem. Passively regenerates +50 coins per hour forever.",
    item_image_url: "https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/72x72/1f98e.png",
    use_effect: "lizard_totem",
    lore: "The lizards built something once. Then the Murk came. The totems remember."
  },
  {
    item_id: "witch_brew",
    name: "ðŸ«– Witch's Brew",
    price: 650,
    item_type: "consumable",
    description: "Unstable brew from Baba Murk. 50/50: DOUBLES your wallet or halves it.",
    item_image_url: "https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/72x72/1fad6.png",
    use_effect: "witch_brew",
    lore: "She cackled when she handed it over. That's either a good sign or a very bad one."
  },
  {
    item_id: "prestige_token",
    name: "â­ Prestige Token",
    price: 2000,
    item_type: "single",
    description: "A glowing token of exceptional status. Required for the Prestige Ascension ritual.",
    item_image_url: "https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/72x72/2b50.png",
    use_effect: "prestige_use",
    lore: "It whispers your name. It knows what you've sacrificed to get here."
  },
  {
    item_id: "dragon_scale",
    name: "ðŸ‰ Dragon Scale",
    price: 1200,
    item_type: "consumable",
    description: "A mythical scale from the Murk Serpent. 2x ALL earnings for 3 hours.",
    item_image_url: "https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/72x72/1f409.png",
    use_effect: "dragon_scale",
    lore: "The Murk Serpent doesn't shed scales. Someone took this. We don't ask how."
  },
  {
    item_id: "trophy",
    name: "ðŸ† Swamp Trophy",
    price: 1000,
    item_type: "collectible",
    description: "A prestigious collectible awarded to Murk survivors. Pure bragging rights.",
    item_image_url: "https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/72x72/1f3c6.png",
    use_effect: null,
    lore: "The inscription reads: 'They survived. Somehow. We're still confused.'"
  },
  {
    item_id: "frog_crown",
    name: "ðŸ‘‘ Frog Crown",
    price: 1500,
    item_type: "single",
    description: "The legendary crown of the Murk Frog King. +25% daily & weekly bonus permanently.",
    item_image_url: "https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/72x72/1f451.png",
    use_effect: "frog_crown",
    lore: "The Frog King didn't surrender it willingly. No one talks about what happened."
  },
  {
    item_id: "black_market_pass",
    name: "ðŸŽ­ Black Market Pass",
    price: 1800,
    item_type: "single",
    description: "A forged pass to The Dark Bazaar. Permanently unlocks dark market trades.",
    item_image_url: "https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/72x72/1f3ad.png",
    use_effect: "black_market_pass",
    lore: "Don't ask where it came from. Don't ask what the stamp means."
  },
  {
    item_id: "murk_lantern",
    name: "ðŸ® Murk Lantern",
    price: 500,
    item_type: "consumable",
    description: "A lantern burning swamp gas. Doubles explore loot for 2 hours when lit.",
    item_image_url: "https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/72x72/1f3ee.png",
    use_effect: "murk_lantern",
    lore: "Burns green. Smells worse. Finds treasure though."
  },
  {
    item_id: "cursed_compass",
    name: "ðŸ§­ Cursed Compass",
    price: 750,
    item_type: "consumable",
    description: "Points to buried treasure... or danger. 65% chance for a 200â€“1000 coin jackpot.",
    item_image_url: "https://cdn.jsdelivr.net/npm/twemoji@14.0.2/assets/72x72/1f9ed.png",
    use_effect: "cursed_compass",
    lore: "It always points north. Unfortunately, north is where the screaming comes from."
  }
];

// ==================== EXPORTS ====================

module.exports = {
  cmdFish,
  cmdDig,
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

const FISH_TYPES = [
  { name: "Goldfish", emoji: "ðŸ ", value: 50, rarity: "common", weight: 0.2 },
  { name: "Salmon", emoji: "ðŸŸ", value: 150, rarity: "uncommon", weight: 0.3 },
  { name: "Tuna", emoji: "ðŸŸ", value: 300, rarity: "rare", weight: 0.2 },
  { name: "Legendary Trout", emoji: "âœ¨ðŸŸ", value: 1000, rarity: "legendary", weight: 0.15 },
  { name: "Golden Koi", emoji: "ðŸª™ðŸŸ", value: 2000, rarity: "mythic", weight: 0.15 }
];

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
    await message.reply({ embeds: [{ color: 0xf39c12, description: `⏳ Your line is still wet! Come back in **${seconds}s**.` }] }).catch(() => {});
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
     ON CONFLICT (guild_id, user_id, minigame, stat_name) DO UPDATE SET stat_value=stat_value+1, last_played=?`,
    [message.guild.id, message.author.id, totalCaught, now, now]
  );

  const economy = await getCmd(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`,
    [message.guild.id, message.author.id]);
  const newBalance = economy.balance + fish.value;
  
  await runCmd(`UPDATE user_economy SET balance=? WHERE guild_id=? AND user_id=?`,
    [newBalance, message.guild.id, message.author.id]);

  await runCmd(
    `INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
    [message.guild.id, message.author.id, "fishing", fish.value, `Caught a ${fish.name}`]
  );

  await message.reply({ embeds: [new EmbedBuilder().setColor(0x3498db).setTitle(`🎣 You caught a ${fish.emoji} ${fish.name}!`).addFields({ name: 'Value', value: `${fish.value} ${economySettings.currency_name}`, inline: true }, { name: 'Rarity', value: fish.rarity, inline: true }, { name: 'Total Caught', value: `${totalCaught}`, inline: true })] }).catch(() => {});
}

// ==================== DIGGING ====================

const DIG_REWARDS = [
  { item: "old_coin", value: 30, chance: 0.3 },
  { item: "gem", value: 100, chance: 0.25 },
  { item: "gold_bar", value: 300, chance: 0.2 },
  { item: "treasure", value: 1000, chance: 0.15 },
  { item: "legendary_artifact", value: 5000, chance: 0.1 }
];

function getDigReward() {
  const rand = Math.random();
  let cumChance = 0;
  for (const reward of DIG_REWARDS) {
    cumChance += reward.chance;
    if (rand < cumChance) return reward;
  }
  return DIG_REWARDS[0];
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
    await message.reply({ embeds: [{ color: 0xf39c12, description: `⏳ You're catching your breath! Come back in **${seconds}s**.` }] }).catch(() => {});
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

  const digCount = (stats?.stat_value || 0) + 1;
  await runCmd(
    `INSERT INTO minigames_stats (guild_id, user_id, minigame, stat_name, stat_value, last_played)
     VALUES (?, ?, 'digging', 'last_dig', ?, ?)
     ON CONFLICT (guild_id, user_id, minigame, stat_name) DO UPDATE SET stat_value=stat_value+1, last_played=?`,
    [message.guild.id, message.author.id, digCount, now, now]
  );

  const economy = await getCmd(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`,
    [message.guild.id, message.author.id]);
  const newBalance = economy.balance + totalValveGain;
  
  await runCmd(`UPDATE user_economy SET balance=? WHERE guild_id=? AND user_id=?`,
    [newBalance, message.guild.id, message.author.id]);

  await runCmd(
    `INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
    [message.guild.id, message.author.id, "digging", totalValveGain, `Dug up ${reward.item}`]
  );

  const mapBonus = treasureMap ? "\nâœ¨ **Treasure map bonus: 2x rewards!**" : "";
  await message.reply({ embeds: [new EmbedBuilder().setColor(0xe67e22).setTitle(`⛏️ You dug and found: ${reward.item.replace(/_/g,' ').toUpperCase()}!`).setDescription(`**Value:** ${totalValveGain} ${economySettings.currency_name}\n**Total dug:** ${digCount}${mapBonus ? '\n\n✨ **Treasure map bonus: 2x rewards!**' : ''}`)] }).catch(() => {});
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
  await message.reply({ embeds: [{ color: 0x2ecc71, title: '🎁 Gift Sent!', description: `You gifted **${inventoryItem.name}** to **${target.username}**! They'll find it in their inventory.` }] }).catch(() => {});
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

    const foods = ["Pizza ðŸ•", "Burger ðŸ”", "Sushi ðŸ£", "Tacos ðŸŒ®", "Ramen ðŸœ"];
    const randomFood = foods[Math.floor(Math.random() * foods.length)];

    const newBalance = economy.balance - foodPrice;
    await runCmd(`UPDATE user_economy SET balance=? WHERE guild_id=? AND user_id=?`,
      [newBalance, message.guild.id, message.author.id]);

    await runCmd(
      `INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
      [message.guild.id, message.author.id, "takeout", -foodPrice, "Ordered food"]
    );

    await message.reply({ embeds: [{ color: 0x2ecc71, title: '📱 Takeout Delivered!', description: `${randomFood} has arrived!\n*nom nom nom* 😋\n\nCost: **${foodPrice} ${economySettings.currency_name}**` }] }).catch(() => {});
    return;
  }

  await message.reply({ embeds: [{ color: 0x3498db, title: '📱 Phone Services', description: `\`${ecoPrefix}phone police\` — Call the police *(1h robbery protection)*\n\`${ecoPrefix}phone taxi\` — Order a taxi *(funny stories)*\n\`${ecoPrefix}phone takeout\` — Order food *(${50} ${economySettings.currency_name})*` }] }).catch(() => {});
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
    await message.reply({ embeds: [{ color: 0xe74c3c, description: `❌ **${inventoryItem.name}** cannot be used — it's a ${inventoryItem.item_type}.` }] }).catch(() => {});
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
  await message.reply({ embeds: [{ color: 0x3498db, description: `🔧 **${inventoryItem.name}** is a tool — having it in your inventory is enough! Try \`${ecoPrefix}${cmd}\`.` }] }).catch(() => {});
    return;

  } else if (effect === "prestige_use") {
    consumed = false;
    await message.reply(`â­ The Prestige Token is used during \`${ecoPrefix}prestige ascend\` â€” keep it in your inventory!`).catch(() => {});
    return;

  } else if (effect === "swamp_tonic") {
    const expires = now + 3600000;
    await runCmd(`INSERT INTO user_buffs (guild_id, user_id, buff_id, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT (guild_id, user_id, buff_id) DO UPDATE SET expires_at=?`,
      [guildId, userId, "earnings_boost_20", expires, expires]);
    embedTitle = "ðŸ§ª Swamp Tonic â€” CONSUMED";
    embedDesc = "The green liquid burns going down. Your vision goes swampy for a moment, then clears.\n\nâœ… **+20% earnings boost** for the next **1 hour**!";
    embedColor = 0x00ff88;

  } else if (effect === "padlock") {
    const expires = now + 14400000;
    await runCmd(`INSERT INTO user_buffs (guild_id, user_id, buff_id, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT (guild_id, user_id, buff_id) DO UPDATE SET expires_at=?`,
      [guildId, userId, "robbery_immune", expires, expires]);
    embedTitle = "ðŸ”’ Padlock â€” ACTIVATED";
    embedDesc = "You snap the padlock shut on your wallet.\n\nâœ… **Robbery immunity** for **4 hours**!";
    embedColor = 0xffd700;

  } else if (effect === "trap_kit") {
    const expires = now + 86400000;
    await runCmd(`INSERT INTO user_buffs (guild_id, user_id, buff_id, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT (guild_id, user_id, buff_id) DO UPDATE SET expires_at=?`,
      [guildId, userId, "trap_set", expires, expires]);
    embedTitle = "ðŸª¤ Trap Kit â€” SET";
    embedDesc = "You carefully set the trap around your coin pouch. The next person to attempt a robbery will trigger it and *lose* 20% of their wallet.\n\nâœ… **Robbery trap** active for **24 hours**!";
    embedColor = 0xff6600;

  } else if (effect === "fortune_scroll") {
    const bonus = Math.floor(Math.random() * 450) + 50;
    await runCmd(`UPDATE user_economy SET balance=? WHERE guild_id=? AND user_id=?`, [balance + bonus, guildId, userId]);
    const fortunes = [
      "The scroll speaks of rivers of gold flowing from the east swamp.",
      "Ancient text warns of danger but promises great reward to the bold.",
      "The Murk's voice echoes: *'What is buried shall be found by those who seek.'*",
      "A crude map appears then fades. But the coins remain.",
      "The runes spell out a number. That number is your blessing."
    ];
    embedTitle = "ðŸ“œ Fortune Scroll â€” READ";
    embedDesc = `${fortunes[Math.floor(Math.random() * fortunes.length)]}\n\nâœ… You received **+${bonus}** ${economySettings.currency_name}!`;
    embedColor = 0xffeedd;

  } else if (effect === "murk_map" || effect === "murk_lantern") {
    const expires = now + 7200000;
    await runCmd(`INSERT INTO user_buffs (guild_id, user_id, buff_id, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT (guild_id, user_id, buff_id) DO UPDATE SET expires_at=?`,
      [guildId, userId, "explore_double", expires, expires]);
    if (effect === "murk_map") {
      embedTitle = "ðŸ—ºï¸ Murk Map â€” ACTIVATED";
      embedDesc = "You trace the hand-drawn paths to a hidden clearing deep in the swamp.\n\nâœ… **Explore loot doubled** for **2 hours**!";
      embedColor = 0x6699ff;
    } else {
      embedTitle = "ðŸ® Murk Lantern â€” LIT";
      embedDesc = "The lantern flickers green. Hidden paths glow before you.\n\nâœ… **Explore loot doubled** for **2 hours**!";
      embedColor = 0x99ff66;
    }

  } else if (effect === "shadow_cloak") {
    const expires = now + 7200000;
    await runCmd(`INSERT INTO user_buffs (guild_id, user_id, buff_id, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT (guild_id, user_id, buff_id) DO UPDATE SET expires_at=?`,
      [guildId, userId, "robbery_immune", expires, expires]);
    embedTitle = "ðŸŒ‘ Shadow Cloak â€” WORN";
    embedDesc = "Your form flickers and becomes indistinct. No one can rob what they can't see.\n\nâœ… **Unrobbable** for **2 hours**!";
    embedColor = 0x222244;

  } else if (effect === "lucky_charm") {
    const expires = now + 21600000;
    await runCmd(`INSERT INTO user_buffs (guild_id, user_id, buff_id, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT (guild_id, user_id, buff_id) DO UPDATE SET expires_at=?`,
      [guildId, userId, "earnings_boost_20", expires, expires]);
    embedTitle = "ðŸ€ Lucky Charm â€” ACTIVATED";
    embedDesc = "The four-leaf clover glows with a soft golden light as you hold it.\n\nâœ… **+20% earnings boost** for **6 hours**!";
    embedColor = 0x33cc66;

  } else if (effect === "gamblers_dice") {
    const win = Math.random() < 0.4;
    if (win) {
      const gain = balance * 2;
      await runCmd(`UPDATE user_economy SET balance=? WHERE guild_id=? AND user_id=?`, [balance + gain, guildId, userId]);
      embedTitle = "ðŸŽ² Gambler's Dice â€” JACKPOT!";
      embedDesc = `The dice clatter and land on **TRIPLE**. The table erupts in disbelief.\n\nðŸŽ‰ You **TRIPLED** your wallet! **+${gain}** ${economySettings.currency_name}!`;
      embedColor = 0xffdd00;
    } else {
      const loss = Math.floor(balance * 0.4);
      await runCmd(`UPDATE user_economy SET balance=? WHERE guild_id=? AND user_id=?`, [Math.max(0, balance - loss), guildId, userId]);
      embedTitle = "ðŸŽ² Gambler's Dice â€” BUST";
      embedDesc = `The dice clatter. The room goes quiet. You lose.\n\nðŸ’¸ Lost **${loss}** ${economySettings.currency_name}. The dice roll away into the dark.`;
      embedColor = 0xff3333;
    }

  } else if (effect === "merchants_lens") {
    const target = message.mentions.users.first();
    if (!target) {
      await message.reply(`âŒ You need to mention a user: \`${ecoPrefix}use lens @user\``).catch(() => {});
      return;
    }
    const targetEconomy = await getCmd(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`, [guildId, target.id]);
    const tBal = targetEconomy?.balance || 0;
    const tBank = targetEconomy?.bank || 0;
    embedTitle = "ðŸ” Merchant's Lens â€” USED";
    embedDesc = `You peer through the lens at **${target.username}**.\n\nðŸ‘› **Wallet:** ${tBal} ${economySettings.currency_name}\nðŸ¦ **Bank:** ${tBank} ${economySettings.currency_name}\nðŸ’° **Total:** ${tBal + tBank} ${economySettings.currency_name}\n\n*The lens shatters after revealing this truth.*`;
    embedColor = 0xaaddff;

  } else if (effect === "witch_brew") {
    const win = Math.random() < 0.5;
    if (win) {
      await runCmd(`UPDATE user_economy SET balance=? WHERE guild_id=? AND user_id=?`, [balance * 2, guildId, userId]);
      embedTitle = "ðŸ«– Witch's Brew â€” BLESSED!";
      embedDesc = `The brew tastes like copper and nightmares. Then the room spins...\n\nâœ¨ **DOUBLED!** You gained **+${balance}** ${economySettings.currency_name}!`;
      embedColor = 0xff88ff;
    } else {
      const loss = Math.floor(balance / 2);
      await runCmd(`UPDATE user_economy SET balance=? WHERE guild_id=? AND user_id=?`, [loss, guildId, userId]);
      embedTitle = "ðŸ«– Witch's Brew â€” CURSED!";
      embedDesc = `The brew tastes like copper and nightmares. Your coins vanish...\n\nðŸ’€ **HALVED!** Lost **${balance - loss}** ${economySettings.currency_name}.`;
      embedColor = 0x660066;
    }

  } else if (effect === "dragon_scale") {
    const expires = now + 10800000;
    await runCmd(`INSERT INTO user_buffs (guild_id, user_id, buff_id, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT (guild_id, user_id, buff_id) DO UPDATE SET expires_at=?`,
      [guildId, userId, "earnings_boost_100", expires, expires]);
    embedTitle = "ðŸ‰ Dragon Scale â€” INFUSED";
    embedDesc = "You hold the scale and feel ancient power surge through you. The air crackles.\n\nâš¡ **2x ALL earnings** for **3 hours**!";
    embedColor = 0xff4400;

  } else if (effect === "cursed_compass") {
    const success = Math.random() < 0.65;
    if (success) {
      const bonus = Math.floor(Math.random() * 800) + 200;
      await runCmd(`UPDATE user_economy SET balance=? WHERE guild_id=? AND user_id=?`, [balance + bonus, guildId, userId]);
      embedTitle = "ðŸ§­ Cursed Compass â€” TREASURE FOUND!";
      embedDesc = `The compass needle spins wildly then locks. You dig exactly where it points.\n\nðŸ’Ž **Treasure found! +${bonus}** ${economySettings.currency_name}!`;
      embedColor = 0xffd700;
    } else {
      const loss = Math.min(balance, Math.floor(Math.random() * 200) + 50);
      await runCmd(`UPDATE user_economy SET balance=? WHERE guild_id=? AND user_id=?`, [balance - loss, guildId, userId]);
      embedTitle = "ðŸ§­ Cursed Compass â€” DANGER!";
      embedDesc = `The compass leads you straight into a bog trap.\n\nðŸ’¸ Lost **${loss}** ${economySettings.currency_name} in the chaos.`;
      embedColor = 0x994400;
    }

  } else if (effect === "ancient_coin") {
    const value = Math.floor(450 * 1.5);
    await runCmd(`UPDATE user_economy SET balance=? WHERE guild_id=? AND user_id=?`, [balance + value, guildId, userId]);
    embedTitle = "ðŸª™ Ancient Coin â€” SOLD";
    embedDesc = `A shady merchant materialized from the shadows. "Ah, a Pre-Murk sovereign!"\n\nðŸ’° Sold for **${value}** ${economySettings.currency_name} (1.5x value)!`;
    embedColor = 0xddaa00;

  } else if (effect === "void_essence") {
    const shards = Math.floor(Math.random() * 6) + 3;
    await runCmd(`INSERT INTO user_inventory (guild_id, user_id, item_id, quantity) VALUES (?, ?, ?, ?) ON CONFLICT (guild_id, user_id, item_id) DO UPDATE SET quantity = user_inventory.quantity + ?`,
      [guildId, userId, "murk_shard", shards, shards]);
    embedTitle = "ðŸŒ‘ Void Essence â€” CONSUMED";
    embedDesc = `You uncork the vial. The void energy swirls out and crystallizes.\n\nâš« The essence became **${shards} Murk Shards** in your inventory!`;
    embedColor = 0x110022;

  } else if (effect === "frog_amulet") {
    const expires = now + (365 * 24 * 3600000);
    await runCmd(`INSERT INTO user_buffs (guild_id, user_id, buff_id, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT (guild_id, user_id, buff_id) DO UPDATE SET expires_at=?`,
      [guildId, userId, "daily_boost_15", expires, expires]);
    embedTitle = "ðŸ¸ Frog Amulet â€” ATTUNED";
    embedDesc = "You slip the amulet over your neck. One of the carvings blinks.\n\nâœ… **+15% daily rewards** â€” permanent while owned!";
    embedColor = 0x33ff33;
    consumed = false; // single-use item persists in inventory

  } else if (effect === "lizard_totem") {
    const expires = now + (365 * 24 * 3600000);
    await runCmd(`INSERT INTO user_buffs (guild_id, user_id, buff_id, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT (guild_id, user_id, buff_id) DO UPDATE SET expires_at=?`,
      [guildId, userId, "passive_regen_50", expires, expires]);
    embedTitle = "ðŸ¦Ž Lizard Totem â€” ACTIVATED";
    embedDesc = "The totem vibrates in your palm. The lizard carving opens its eyes.\n\nâœ… **+50 coin passive regen** every hour â€” permanent!";
    embedColor = 0x55aaff;
    consumed = false;

  } else if (effect === "frog_crown") {
    const expires = now + (365 * 24 * 3600000);
    await runCmd(`INSERT INTO user_buffs (guild_id, user_id, buff_id, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT (guild_id, user_id, buff_id) DO UPDATE SET expires_at=?`,
      [guildId, userId, "royal_boost", expires, expires]);
    embedTitle = "ðŸ‘‘ Frog Crown â€” CROWNED";
    embedDesc = "You place the crown upon your head. The swamp falls silent.\n\nâœ… **+25% daily & weekly bonus** â€” permanently bestowed!";
    embedColor = 0xffcc00;
    consumed = false;

  } else if (effect === "black_market_pass") {
    const expires = now + (365 * 24 * 3600000);
    await runCmd(`INSERT INTO user_buffs (guild_id, user_id, buff_id, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT (guild_id, user_id, buff_id) DO UPDATE SET expires_at=?`,
      [guildId, userId, "bazaar_access", expires, expires]);
    embedTitle = "ðŸŽ­ Black Market Pass â€” ACTIVATED";
    embedDesc = "The pass glows with a dim red light. Somewhere in the Murk, a door unlocks.\n\nâœ… **Dark Bazaar access** unlocked permanently!";
    embedColor = 0x880000;
    consumed = false;

  } else if (effect === "revival_potion") {
    consumed = false;
    await message.reply({ embeds: [{ color: 0x9b59b6, description: `🛡️ **${inventoryItem.name}** is held in reserve — it automatically activates when you would die in an adventure or explore event.` }] }).catch(() => {});
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
    await message.reply(`ðŸ“¦ Usage: \`${ecoPrefix}item <item_name>\``).catch(() => {});
    return;
  }

  const itemName = args.join(" ").toLowerCase();
  const item = await getCmd(`SELECT * FROM economy_shop_items WHERE guild_id=? AND (LOWER(name) LIKE ? OR item_id LIKE ?)`,
    [message.guild.id, `%${itemName}%`, `%${itemName}%`]);

  if (!item) {
    await message.reply(`âŒ Item not found: **${args.join(" ")}**\nCheck the shop with \`${ecoPrefix}shop\``).catch(() => {});
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
      { name: "ðŸ’° Price", value: `${item.price} ${economySettings.currency_name}`, inline: true },
      { name: "ðŸ·ï¸ Type", value: item.item_type.charAt(0).toUpperCase() + item.item_type.slice(1), inline: true },
      { name: "ðŸŽ’ You Own", value: owned ? `${owned.quantity}x` : "None", inline: true }
    );

  if (item.use_effect && item.use_effect !== "fishing_rod" && item.use_effect !== "shovel" && item.use_effect !== "prestige_use" && item.use_effect !== "revival_potion") {
    embed.addFields({ name: "âš¡ Use Command", value: `\`${ecoPrefix}use ${item.item_id}\``, inline: true });
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
    await message.reply(`âŒ Usage: \`${ecoPrefix}gift @user <item_name>\``).catch(() => {});
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
