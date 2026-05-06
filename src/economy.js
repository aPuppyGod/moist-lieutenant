const { all, get, run } = require("./db");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

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
    description: "Master of stealth and high-risk crimes. 25% faster robbery & heist cooldowns, +15% heist success odds, and 10% more loot from work events.",
    passive: "robbery_speedup",
    passive_value: 0.75  // multiply cooldown by 0.75
  },
  artificer: {
    name: "⚙️ Artificer",
    icon: "⚙️",
    description: "Craftsperson of the Murk. 20% discount on ALL shop purchases and 15% bonus to crafting XP.",
    passive: "bazaar_discount",
    passive_value: 0.8
  },
  scholar: {
    name: "📖 Scholar",
    icon: "📖",
    description: "Collector of forbidden knowledge. 25% more loot from ALL gather activities (fish, dig, mine, hunt, explore) and +10% XP from every action.",
    passive: "expedition_bonus",
    passive_value: 1.25
  },
  merchant: {
    name: "💼 Merchant",
    icon: "💼",
    description: "Trader extraordinaire. 10% daily bank interest, 8% better sell prices, and 5% bonus work pay.",
    passive: "daily_interest",
    passive_value: 0.1
  },
  farmer: {
    name: "🌾 Farmer",
    icon: "🌾",
    description: "Tiller of Murk soil. 30% more harvest yield from weed, beehive, and grapes. 15% discount on all grow/brew/farm shop items. Passive 5% income from crops each day.",
    passive: "harvest_boost",
    passive_value: 1.30
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
  // ── Core Synthesis ───────────────────────────────────────────────────────
  "murk_elixir": {
    name: "🔮 Murk Elixir (Master)",
    inputs: [
      { item: "swamp_tonic",  qty: 2 },
      { item: "murk_shard",   qty: 1 },
      { item: "ancient_coin", qty: 3 }
    ],
    output: { item: "murk_elixir", qty: 1 },
    reward_coins: 500,
    buff: { buff_id: "super_luck", duration: 7200000 }  // 2 hours: +30% all gather value
  },
  "prestige_token": {
    name: "👑 Prestige Token",
    inputs: [
      { item: "void_essence",   qty: 2 },
      { item: "murk_elixir",   qty: 1 },
      { item: "fortune_scroll", qty: 5 }
    ],
    output: null,
    reward_coins: 0,
    effect: "prestige_unlock"
  },
  // ── Gathering Boosts ─────────────────────────────────────────────────────
  "enhanced_tonic": {
    name: "💪 Enhanced Tonic",
    inputs: [
      { item: "bone_dust",    qty: 2 },
      { item: "crystal_dust", qty: 2 },
      { item: "murk_shard",   qty: 1 }
    ],
    output: null,
    reward_coins: 0,
    buff: { buff_id: "enhanced_gather_30", duration: 7200000 }  // 2 hours: +30% all gather
  },
  "alchemists_stone": {
    name: "⚗️ Alchemist's Stone",
    inputs: [
      { item: "bone_dust",    qty: 1 },
      { item: "crystal_dust", qty: 1 },
      { item: "dark_matter",  qty: 1 }
    ],
    output: null,
    reward_coins: 0,
    buff: { buff_id: "alchemist_gather_40", duration: 10800000 }  // 3 hours: +40% all gather
  },
  "wisdom_tome": {
    name: "📚 Ancient Wisdom Tome",
    inputs: [
      { item: "ancient_tablet", qty: 1 },
      { item: "crystal_dust",   qty: 2 }
    ],
    output: null,
    reward_coins: 0,
    buff: { buff_id: "wisdom_boost_50", duration: 7200000 }  // 2 hours: +50% all gather
  },
  "crystal_lens": {
    name: "🔮 Crystal Lens",
    inputs: [
      { item: "crystal_dust", qty: 3 },
      { item: "murk_shard",   qty: 2 }
    ],
    output: null,
    reward_coins: 0,
    buff: { buff_id: "fish_double", duration: 7200000 }  // 2 hours: 2x fishing value only
  },
  // ── Defense & Crime ───────────────────────────────────────────────────────
  "bone_armor": {
    name: "🦴 Bone Armor Set",
    inputs: [
      { item: "bone_dust",  qty: 3 },
      { item: "murk_shard", qty: 2 }
    ],
    output: null,
    reward_coins: 0,
    buff: { buff_id: "bone_armor_50", duration: 21600000 }  // 6 hours: 50% reduced rob fine
  },
  "dragon_armor": {
    name: "🐉 Dragon Scale Armor",
    inputs: [
      { item: "dragon_tooth", qty: 2 },
      { item: "bone_dust",    qty: 3 }
    ],
    output: null,
    reward_coins: 0,
    buff: { buff_id: "robbery_immune", duration: 28800000 }  // 8 hours: completely unrobbable
  },
  "shadow_veil": {
    name: "👁️ Shadow Veil",
    inputs: [
      { item: "void_fragment", qty: 2 },
      { item: "dark_matter",   qty: 2 }
    ],
    output: null,
    reward_coins: 0,
    buff: { buff_id: "robbery_immune", duration: 10800000 }  // 3 hours: completely unrobbable
  },
  "dark_blade": {
    name: "⚫ Dark Blade",
    inputs: [
      { item: "dark_matter", qty: 2 },
      { item: "murk_shard",  qty: 3 }
    ],
    output: null,
    reward_coins: 0,
    buff: { buff_id: "heist_edge", duration: 86400000 }  // 24 hours: +20% heist success rate
  },
  // ── Material Processing ───────────────────────────────────────────────────
  "void_shard_bundle": {
    name: "🌀 Void Shard Bundle",
    inputs: [
      { item: "void_fragment", qty: 3 },
      { item: "dark_matter",   qty: 1 }
    ],
    output: { item: "void_essence", qty: 2 },
    reward_coins: 0
  },
  "murk_crystal": {
    name: "💎 Murk Crystal",
    inputs: [
      { item: "murk_shard", qty: 5 }
    ],
    output: null,
    reward_coins: 1800
  }
};

// ── Friendly display names for crafting recipes ───────────────────────────────
const ITEM_NAMES = {
  bone_dust:     "🦴 Bone Dust",     crystal_dust:   "✨ Crystal Dust",
  dark_matter:   "⚫ Dark Matter",   murk_shard:     "🔷 Murk Shard",
  dragon_tooth:  "🦷 Dragon Tooth",  void_fragment:  "🌀 Void Fragment",
  ancient_tablet:"📜 Ancient Tablet", void_essence:  "🌑 Void Essence",
  murk_elixir:   "🔮 Murk Elixir",  fortune_scroll: "📜 Fortune Scroll",
  swamp_tonic:   "🧪 Swamp Tonic",  ancient_coin:   "🪙 Ancient Coin",
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
    const recipes = Object.entries(RECIPES).map(([key, recipe]) => {
      const inputList = recipe.inputs.map(i => `${i.qty}x ${ITEM_NAMES[i.item] || i.item}`).join(", ");
      let outputStr = "";
      if (recipe.output)              outputStr = ` → ${recipe.output.qty}x ${ITEM_NAMES[recipe.output.item] || recipe.output.item}`;
      else if (recipe.reward_coins)   outputStr = ` → 💰 ${recipe.reward_coins} coins`;
      else if (recipe.buff)           outputStr = ` → **${recipe.buff.buff_id.replace(/_/g, ' ')}** buff`;
      else if (recipe.effect)         outputStr = ` → ⭐ prestige unlock`;
      return `**${recipe.name}**\n\`${key}\` | 📥 ${inputList}${outputStr}`;
    }).join("\n\n");

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
      footer: { text: `Choose: class select <brigand|artificer|scholar|merchant|farmer>` }
    }] }).catch(() => {});
    return;
  }

  // Support both "$class merchant" and "$class select merchant"
  const rawArg = args[0]?.toLowerCase();
  const classKey = rawArg === "select" ? args[1]?.toLowerCase() : rawArg;
  const murk_class = classKey ? MURK_CLASSES[classKey] : null;

  if (!murk_class) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Invalid class! Choose: `brigand`, `artificer`, `scholar`, `merchant`, or `farmer`." }] }).catch(() => {});
    return;
  }

  await runCmd(
    `INSERT INTO user_class (guild_id, user_id, class_id) VALUES (?, ?, ?)
     ON CONFLICT (guild_id, user_id) DO UPDATE SET class_id = ?`,
    [message.guild.id, message.author.id, classKey, classKey]
  );

  await message.reply({ embeds: [{ color: 0x00d4ff, title: `⚔️ Class Chosen: ${murk_class.name}`, description: murk_class.description }] }).catch(() => {});
}

// ==================== TAGIHAGEN GARDEN ADVENTURE SYSTEM ====================

// ─── Explore events: each has multiple outcomes depending on choice ───────────
const GARDEN_EXPLORE_EVENTS = [
  {
    id: "bunny_warren",
    title: "🐇 A Bunny Warren",
    description: "You nearly trip over a hidden burrow entrance at the base of an oak tree. Several pairs of luminous eyes blink at you from the darkness.",
    choices: [
      {
        id: "reach_in",
        label: "🤚 Reach inside",
        success: 0.5,
        win: { text: "A bunny drops a shiny object in your palm — a **Tagihagen Pebble**, smooth as river glass.", items: [{ id: "tagihagen_pebble", qty: 1 }], money: 0 },
        lose: { text: "You get nibbled fiercely. Nothing gained, dignity lost.", items: [], money: -50 }
      },
      {
        id: "offer_food",
        label: "🥕 Leave a carrot nearby",
        requires: "carrot",
        success: 0.9,
        win: { text: "The bunnies emerge and drop **Rabbit Fur** and a few **Garden Shards** at your feet.", items: [{ id: "rabbit_fur", qty: 2 }, { id: "garden_shard", qty: 1 }], money: 0 },
        lose: { text: "They took the carrot and gave nothing back. Bold.", items: [], money: 0 }
      },
      {
        id: "observe",
        label: "👁️ Watch quietly",
        success: 1.0,
        win: { text: "You spot a bunny dragging a **Mossy Coin** into the warren — you snatch it before it disappears.", items: [{ id: "mossy_coin", qty: 1 }], money: 150 },
        lose: { text: "", items: [], money: 0 }
      }
    ]
  },
  {
    id: "glowing_pond",
    title: "✨ The Glowing Pond",
    description: "A small pond in the eastern garden glows faintly violet. The water smells of lavender and old magic. Something stirs beneath the surface.",
    choices: [
      {
        id: "drink",
        label: "💧 Take a sip",
        death_chance: 0.15,
        success: 0.7,
        win: { text: "A warm glow fills your chest. You feel invigorated — and find **Bioluminite** crystallised on your lips.", items: [{ id: "bioluminite", qty: 1 }], money: 300 },
        lose: { text: "Your stomach lurches. You spend the next hour groaning in the bushes.", items: [], money: -200 }
      },
      {
        id: "fish_it",
        label: "🎣 Fish for something shiny",
        requires: "fishing_rod",
        success: 0.8,
        win: { text: "You pull out a **Glowfish** — rare, luminescent, and worth a good amount.", items: [{ id: "glowfish", qty: 1 }], money: 500 },
        lose: { text: "Your rod snaps. The pond laughs at you (probably).", items: [], money: 0 }
      },
      {
        id: "toss_coin",
        label: "🪙 Make a wish",
        success: 0.6,
        win: { text: "The pond accepts your offering and spits back **two** coins for every one you tossed. Mysterious.", items: [], money: 400 },
        lose: { text: "Your coin sinks. The pond offers no wisdom, only depth.", items: [], money: -100 }
      }
    ]
  },
  {
    id: "tagibee_hive",
    title: "🍯 A Wild Tagibee Hive",
    description: "High in a bramble thicket you spot a wild hive dripping with golden Tagihagen honeycomb. The air hums with the sound of a hundred sleepy bees.",
    choices: [
      {
        id: "steal_honey",
        label: "🤜 Grab some honeycomb",
        death_chance: 0.1,
        success: 0.45,
        win: { text: "You snatch a chunk of **Wild Honeycomb** before the swarm notices. Sweet success.", items: [{ id: "wild_honeycomb", qty: 2 }], money: 0 },
        lose: { text: "The hive erupts. You flee in terror, stung dozens of times.", items: [], money: -300 }
      },
      {
        id: "smoke_it",
        label: "🔥 Use a campfire kit to smoke them",
        requires: "campfire_kit",
        success: 0.85,
        win: { text: "The smoke calms the bees. You harvest **Wild Honeycomb** and a few **Beeswax Chunks** unmolested.", items: [{ id: "wild_honeycomb", qty: 3 }, { id: "beeswax_chunk", qty: 2 }], money: 0 },
        lose: { text: "Too much smoke — the bees scatter and the hive collapses. Nothing to harvest.", items: [], money: 0 }
      },
      {
        id: "leave_it",
        label: "🚶 Leave it alone",
        success: 1.0,
        win: { text: "A single bee lands on your hand, deposits a tiny **Pollen Sac**, then flies away. A gift.", items: [{ id: "pollen_sac", qty: 1 }], money: 0 },
        lose: { text: "", items: [], money: 0 }
      }
    ]
  },
  {
    id: "old_greenhouse",
    title: "🏚️ The Old Greenhouse",
    description: "A crumbling glass greenhouse at the garden's edge, overgrown with vines. The door hangs open. Inside: strange plants, broken pottery, and the smell of soil.",
    choices: [
      {
        id: "search_pots",
        label: "🪴 Search the clay pots",
        success: 0.65,
        win: { text: "Under a cracked pot you find **Seed Packets** and a rusted **Iron Scrap**.", items: [{ id: "seed_packet", qty: 2 }, { id: "iron_scrap", qty: 1 }], money: 0 },
        lose: { text: "Just dirt and worms. Though the worms are quite fat.", items: [], money: 0 }
      },
      {
        id: "take_cuttings",
        label: "✂️ Take plant cuttings",
        success: 0.75,
        win: { text: "You carefully snip **Herb Cuttings** from several healthy specimens.", items: [{ id: "herb_cutting", qty: 3 }], money: 0 },
        lose: { text: "One of the plants bites you. You leave with nothing but a sore thumb.", items: [], money: 0 }
      },
      {
        id: "smash_pots",
        label: "💥 Smash everything",
        success: 0.4,
        win: { text: "Under the rubble: a stash of old **Murk Coins** someone forgot about.", items: [], money: 800 },
        lose: { text: "A shard bounces back and cuts your cheek. You find nothing and feel foolish.", items: [], money: -100 }
      }
    ]
  },
  {
    id: "talking_scarecrow",
    title: "🎃 The Talking Scarecrow",
    description: "In the middle of the turnip patch stands a scarecrow with glass eyes that follow you. When you get close, it whispers: *'I know where things are buried...'*",
    choices: [
      {
        id: "bargain",
        label: "🤝 Offer it something",
        success: 0.8,
        win: { text: "The scarecrow whispers coordinates. You dig and find a **Buried Cache** — coins and a **Garden Shard**.", items: [{ id: "garden_shard", qty: 1 }], money: 600 },
        lose: { text: "It gives you nonsense directions and cackles. Nothing is buried where it said.", items: [], money: 0 }
      },
      {
        id: "run",
        label: "🏃 Run away",
        success: 1.0,
        win: { text: "As you flee, a **Turnip** rolls after you like an offering. You accept it.", items: [{ id: "tagihagen_turnip", qty: 2 }], money: 0 },
        lose: { text: "", items: [], money: 0 }
      },
      {
        id: "remove_hat",
        label: "🎩 Take its hat",
        death_chance: 0.05,
        success: 0.5,
        win: { text: "Inside the hat: a **Mossy Coin** and a folded map. You pocket both.", items: [{ id: "mossy_coin", qty: 1 }, { id: "old_map_fragment", qty: 1 }], money: 0 },
        lose: { text: "The scarecrow shrieks. Crows descend on you from nowhere and peck at your pockets.", items: [], money: -400 }
      }
    ]
  },
  {
    id: "mushroom_ring",
    title: "🍄 A Fairy Mushroom Ring",
    description: "A perfect circle of red-capped mushrooms in the mossy clearing. Step inside and time feels slower. The air tastes like copper and roses.",
    choices: [
      {
        id: "eat_mushroom",
        label: "🍄 Eat one of the mushrooms",
        death_chance: 0.2,
        success: 0.55,
        win: { text: "A vivid hallucination… then clarity. You wake up with **Fairy Dust** in your pockets.", items: [{ id: "fairy_dust", qty: 1 }], money: 250 },
        lose: { text: "Wrong mushroom. You spend an hour convinced you're a goose. Nothing gained.", items: [], money: 0 }
      },
      {
        id: "dance_in_ring",
        label: "💃 Dance inside the ring",
        success: 0.7,
        win: { text: "Something unseen applauds. **Bioluminite** and **Fairy Dust** materialise at your feet.", items: [{ id: "bioluminite", qty: 1 }, { id: "fairy_dust", qty: 1 }], money: 0 },
        lose: { text: "You trip over a root and face-plant. The fairies (if any) are unmoved.", items: [], money: 0 }
      },
      {
        id: "harvest_mushrooms",
        label: "🧺 Pick the mushrooms carefully",
        success: 0.85,
        win: { text: "You harvest a basket of **Tagihagen Mushrooms** — valued by alchemists and cooks alike.", items: [{ id: "tagihagen_mushroom", qty: 3 }], money: 0 },
        lose: { text: "The mushrooms crumble to dust the moment you touch them.", items: [], money: 0 }
      }
    ]
  },
  {
    id: "stone_well",
    title: "🪣 The Ancient Stone Well",
    description: "An old mossy well in the garden's heart, sealed with a heavy stone. Faint scratching sounds come from below. Something is down there.",
    choices: [
      {
        id: "lower_bucket",
        label: "🪣 Lower the bucket",
        success: 0.7,
        win: { text: "The bucket comes back up dripping with **Well Water** and a **Garden Shard** caught in the handle.", items: [{ id: "well_water", qty: 2 }, { id: "garden_shard", qty: 1 }], money: 0 },
        lose: { text: "The rope snaps. Your bucket is gone and something below laughs.", items: [], money: 0 }
      },
      {
        id: "shout_in",
        label: "📣 Shout into the well",
        success: 0.6,
        win: { text: "Something echoes back directions to a **hidden coin stash** nearby. You find it.", items: [], money: 700 },
        lose: { text: "Your voice echoes back with a mocking tone. The well offers nothing.", items: [], money: 0 }
      },
      {
        id: "climb_in",
        label: "🧗 Climb down",
        death_chance: 0.25,
        success: 0.5,
        win: { text: "At the bottom: a forgotten **Iron Chest** with coins, **Iron Scrap**, and a **Mossy Coin**.", items: [{ id: "iron_scrap", qty: 2 }, { id: "mossy_coin", qty: 1 }], money: 1200 },
        lose: { text: "You slip halfway down and barely haul yourself out. Bruised and empty-handed.", items: [], money: 0 }
      }
    ]
  },
  {
    id: "fog_sprite",
    title: "🌫️ A Fog Sprite",
    description: "A small glowing orb drifts toward you from the morning mist, circling your head with what seems like curiosity.",
    choices: [
      {
        id: "follow_it",
        label: "✨ Follow the sprite",
        success: 0.75,
        win: { text: "It leads you to a patch of **Glowing Mushrooms** and vanishes, duty done.", items: [{ id: "tagihagen_mushroom", qty: 2 }, { id: "bioluminite", qty: 1 }], money: 0 },
        lose: { text: "It leads you in circles for 20 minutes and flickers out. Nothing found.", items: [], money: 0 }
      },
      {
        id: "catch_it",
        label: "🫙 Try to catch it",
        success: 0.35,
        win: { text: "Captured in your jar, the sprite gifts you **Fairy Dust** before dissolving into light.", items: [{ id: "fairy_dust", qty: 2 }], money: 0 },
        lose: { text: "Too fast. It zips away, leaving only a cold patch of air.", items: [], money: 0 }
      },
      {
        id: "ignore",
        label: "🚶 Ignore it and keep walking",
        success: 1.0,
        win: { text: "It drops a **Pollen Sac** on your boot and drifts off. Small, but appreciated.", items: [{ id: "pollen_sac", qty: 1 }], money: 100 },
        lose: { text: "", items: [], money: 0 }
      }
    ]
  },
  {
    id: "overgrown_shed",
    title: "🏗️ An Overgrown Tool Shed",
    description: "Half-buried under wisteria is a small wooden shed. The padlock is rusted clean through. Inside: decades of forgotten tools and crates.",
    choices: [
      {
        id: "rummage_tools",
        label: "🔧 Search for useful tools",
        success: 0.7,
        win: { text: "You find a **Rusty Pickaxe Head** and some **Iron Scrap** — useful for crafting.", items: [{ id: "iron_scrap", qty: 3 }, { id: "garden_shard", qty: 1 }], money: 0 },
        lose: { text: "Just rust and cobwebs. The tools are beyond salvage.", items: [], money: 0 }
      },
      {
        id: "open_crates",
        label: "📦 Open the old crates",
        success: 0.6,
        win: { text: "Inside a crate beneath burlap sacks: a jar of **Preserved Honey** and some coins.", items: [{ id: "wild_honeycomb", qty: 1 }], money: 500 },
        lose: { text: "Rotten food and mouse nests. You sneeze twice and leave.", items: [], money: 0 }
      },
      {
        id: "take_nap",
        label: "😴 Take a cheeky nap",
        success: 0.9,
        win: { text: "Best nap of your life. You wake up refreshed — and some gnome has left **Herb Cuttings** by your head.", items: [{ id: "herb_cutting", qty: 2 }], money: 200 },
        lose: { text: "You wake up late and achieve nothing. At least you're rested.", items: [], money: 0 }
      }
    ]
  },
  {
    id: "wild_foxes",
    title: "🦊 A Family of Garden Foxes",
    description: "Three foxes lounge in a sunny patch of lavender. One has something shiny in its mouth. They regard you with calm amber eyes.",
    choices: [
      {
        id: "steal_shiny",
        label: "🤏 Steal the shiny thing",
        success: 0.3,
        win: { text: "Quick hands prevail — it's a **Mossy Coin**. The fox looks personally offended.", items: [{ id: "mossy_coin", qty: 1 }], money: 0 },
        lose: { text: "The fox bites your finger and trots away, insulted. Deserved.", items: [], money: -100 }
      },
      {
        id: "play_with_foxes",
        label: "🎾 Play with them",
        success: 0.85,
        win: { text: "They bring you a **Garden Shard** and some **Tagihagen Pebbles** as play-tokens.", items: [{ id: "garden_shard", qty: 1 }, { id: "tagihagen_pebble", qty: 2 }], money: 0 },
        lose: { text: "One fox steals your snack and they all vanish. Rude.", items: [], money: -50 }
      },
      {
        id: "observe_foxes",
        label: "📓 Sketch them in your notebook",
        success: 1.0,
        win: { text: "A peaceful moment. The eldest fox nuzzles your boot and leaves a **Pollen Sac** as a parting gift.", items: [{ id: "pollen_sac", qty: 1 }], money: 150 },
        lose: { text: "", items: [], money: 0 }
      }
    ]
  }
];

// ─── Exploration-only items (can only be found via explore) ────────────────────
const EXPLORE_ITEM_NAMES = {
  "tagihagen_pebble": "🪨 Tagihagen Pebble",
  "mossy_coin": "🪙 Mossy Coin",
  "garden_shard": "💠 Garden Shard",
  "rabbit_fur": "🐇 Rabbit Fur",
  "bioluminite": "🔮 Bioluminite",
  "glowfish": "🐟 Glowfish",
  "wild_honeycomb": "🍯 Wild Honeycomb",
  "beeswax_chunk": "🕯️ Beeswax Chunk",
  "pollen_sac": "🌼 Pollen Sac",
  "seed_packet": "🌱 Seed Packet",
  "iron_scrap": "🔩 Iron Scrap",
  "herb_cutting": "🌿 Herb Cutting",
  "tagihagen_turnip": "🌱 Tagihagen Turnip",
  "old_map_fragment": "🗺️ Map Fragment",
  "fairy_dust": "✨ Fairy Dust",
  "tagihagen_mushroom": "🍄 Tagihagen Mushroom",
  "well_water": "💧 Well Water",
  "carrot": "🥕 Carrot",
};

// ─── Adventure stories: branching based on choice, continuous until end/death ─────
const GARDEN_ADVENTURES = {
  "moonlit_hunt": {
    title: "🌙 The Moonlit Garden Hunt",
    intro: "The garden is different at night. Silver light filters through the yew trees. A note pinned to the gate reads: *'Something precious was lost here. The one who finds it shall be rewarded.'*",
    nodes: {
      "start": {
        text: "The garden path splits before you. The left trail leads toward the pond; the right toward the old greenhouse.",
        choices: [
          { id: "go_pond", label: "🌊 Head to the pond", next: "pond_arrive" },
          { id: "go_greenhouse", label: "🏚️ Go to the greenhouse", next: "greenhouse_arrive" },
        ]
      },
      "pond_arrive": {
        text: "The moonlit pond glows softly. A figure sits at its edge — an old woman in a moth-eaten coat, muttering to herself.",
        choices: [
          { id: "talk_woman", label: "🗣️ Approach the old woman", next: "woman_talk" },
          { id: "search_pond_edge", label: "🔦 Search the bank", next: "pond_bank_search" },
        ]
      },
      "woman_talk": {
        text: "She looks up with bright eyes: *'Ah, a night wanderer. I lost my golden thimble by the big willow. Find it and I'll reward you handsomely.'*",
        choices: [
          { id: "search_willow", label: "🌳 Search under the willow", next: "willow_search" },
          { id: "demand_upfront", label: "💰 Demand payment upfront", next: "woman_refuses" },
        ]
      },
      "woman_refuses": {
        text: "She narrows her eyes. *'I don't deal with greedy folk.'* She closes her coat and turns away. The opportunity is lost.",
        choices: [
          { id: "apologise", label: "🙏 Apologise and help anyway", next: "willow_search" },
          { id: "walk_away", label: "🚶 Walk away", next: "greenhouse_arrive" },
        ]
      },
      "willow_search": {
        text: "Under the drooping willow you dig through leaf litter. Your fingers find something cold and metallic.",
        reward: { items: [{ id: "mossy_coin", qty: 2 }], money: 800 },
        choices: [
          { id: "return_thimble", label: "🎁 Return the thimble", next: "woman_reward" },
          { id: "keep_thimble", label: "🤐 Keep it for yourself", next: "keep_thimble_end" },
        ]
      },
      "woman_reward": {
        text: "She claps her hands with delight. *'Bless you!'* She presses a **Bioluminite** crystal and a pouch of coins into your palm.",
        reward: { items: [{ id: "bioluminite", qty: 1 }, { id: "fairy_dust", qty: 1 }], money: 1500 },
        end: true,
        win: true
      },
      "keep_thimble_end": {
        text: "You pocket it and leave. Walking home, you feel oddly guilty. The garden seems darker somehow. Still, the coins spend.",
        reward: { items: [{ id: "mossy_coin", qty: 1 }], money: 400 },
        end: true,
        win: true
      },
      "pond_bank_search": {
        text: "Among the reeds you find a waterlogged journal, a few old coins, and a curious **Garden Shard** embedded in the clay.",
        reward: { items: [{ id: "garden_shard", qty: 1 }], money: 300 },
        choices: [
          { id: "read_journal", label: "📖 Read the journal", next: "journal_clue" },
          { id: "head_greenhouse", label: "🏚️ Head to the greenhouse", next: "greenhouse_arrive" },
        ]
      },
      "journal_clue": {
        text: "The journal describes something buried under the 'three-stone cairn' near the eastern wall. You know the spot.",
        choices: [
          { id: "find_cairn", label: "🪨 Find the cairn", next: "cairn_dig" },
          { id: "give_up_journal", label: "📕 Too much effort", next: "greenhouse_arrive" },
        ]
      },
      "cairn_dig": {
        text: "You dig carefully. Beneath the three stones is a cloth bundle — inside: a collection of **Garden Shards**, coins, and a **Map Fragment**.",
        reward: { items: [{ id: "garden_shard", qty: 2 }, { id: "old_map_fragment", qty: 1 }], money: 1000 },
        end: true,
        win: true
      },
      "greenhouse_arrive": {
        text: "The old greenhouse. A beam of moonlight picks out something shiny half-buried in the soil by the tomato cages.",
        choices: [
          { id: "dig_shiny", label: "⛏️ Dig it up", next: "greenhouse_dig" },
          { id: "investigate_plants", label: "🌱 Check the plants instead", next: "greenhouse_plants" },
        ]
      },
      "greenhouse_dig": {
        text: "You unearth a small tin box — inside are **Iron Scraps**, a **Beeswax Chunk**, and a decent pile of coins.",
        reward: { items: [{ id: "iron_scrap", qty: 2 }, { id: "beeswax_chunk", qty: 1 }], money: 600 },
        end: true,
        win: true
      },
      "greenhouse_plants": {
        text: "A cluster of rare **Tagihagen Mushrooms** has sprouted overnight. You carefully harvest them.",
        reward: { items: [{ id: "tagihagen_mushroom", qty: 3 }, { id: "herb_cutting", qty: 2 }], money: 200 },
        end: true,
        win: true
      },
    }
  },
  "bunnys_debt": {
    title: "🐇 The Bunny's Debt",
    intro: "A small white rabbit with a pocket watch bolts across your path, drops a scribbled note, and vanishes into the hedgerow. The note reads: *'I owe Mister Holt three carrots. Please help. —B'*",
    nodes: {
      "start": {
        text: "Mister Holt is the grumpy old groundskeeper. You could find him at his cottage or go search for carrots in the kitchen garden first.",
        choices: [
          { id: "find_holt", label: "🧑‍🌾 Go see Mister Holt first", next: "holt_greeting" },
          { id: "find_carrots", label: "🥕 Search for carrots first", next: "carrot_patch" },
        ]
      },
      "holt_greeting": {
        text: "Mister Holt opens his door with a scowl. *'That blasted rabbit owes me three carrots. Bring them and I'll overlook the matter. Don't… and I'll set traps.'*",
        choices: [
          { id: "promise_carrots", label: "🤝 Promise to deliver them", next: "carrot_patch" },
          { id: "argue_with_holt", label: "🗣️ Argue on the bunny's behalf", next: "holt_annoyed" },
        ]
      },
      "holt_annoyed": {
        text: "Holt slams the door. You'll need to find the carrots and slip them under his door to resolve this quietly.",
        choices: [
          { id: "find_carrots_anyway", label: "🥕 Find the carrots anyway", next: "carrot_patch" },
          { id: "abandon_quest", label: "🚪 Give up", next: "quest_abandoned" },
        ]
      },
      "carrot_patch": {
        text: "The kitchen garden is overgrown but the carrot row is easy to spot. Three fine orange specimens wait to be pulled.",
        reward: { items: [{ id: "carrot", qty: 3 }], money: 0 },
        choices: [
          { id: "deliver_carrots", label: "🎁 Deliver to Mister Holt", next: "deliver_carrots" },
          { id: "eat_one", label: "🥕 Eat one (take two)", next: "eat_carrot" },
        ]
      },
      "eat_one": {
        text: "Delicious. But now you only have two. Holt asked for three.",
        choices: [
          { id: "deliver_two", label: "🤞 Deliver two and hope", next: "holt_unhappy" },
          { id: "find_third", label: "🔍 Look for a third carrot", next: "third_carrot" },
        ]
      },
      "third_carrot": {
        text: "Behind the compost heap you find a stunted but valid carrot. It'll do.",
        reward: { items: [{ id: "carrot", qty: 1 }], money: 0 },
        choices: [
          { id: "deliver_three_now", label: "🎁 Deliver all three now", next: "deliver_carrots" },
        ]
      },
      "holt_unhappy": {
        text: "*'Two?! TWOOO?!'* He takes them but grumbles. The bunny is safe-ish. You get a smaller reward.",
        reward: { items: [{ id: "tagihagen_pebble", qty: 1 }], money: 250 },
        end: true,
        win: true
      },
      "deliver_carrots": {
        text: "Holt counts the three carrots with a grunt. *'Right then. Tell that rabbit we're square. And here — I found this in the ground last week, no use to me.'* He hands you a **Garden Shard** and a few coins.",
        reward: { items: [{ id: "garden_shard", qty: 2 }, { id: "carrot", qty: 1 }], money: 700 },
        end: true,
        win: true
      },
      "quest_abandoned": {
        text: "You walk away. The rabbit is somewhere out there, worried. You find a **Mossy Coin** on the path as a small consolation.",
        reward: { items: [{ id: "mossy_coin", qty: 1 }], money: 100 },
        end: true,
        win: false
      }
    }
  },
  "the_missing_bee": {
    title: "🐝 The Missing Bee",
    intro: "Lady Tagihagen's prized **Golden Bee** has escaped its hive and is loose somewhere in the garden. She's posted a reward: whoever returns it safely gets a share of the season's honey harvest.",
    nodes: {
      "start": {
        text: "The bee was last seen near the lavender beds. You can search the lavender, check the clover patch to the west, or ask the garden gnome statue (it has glassy eyes that sometimes seem to move).",
        choices: [
          { id: "search_lavender", label: "🌸 Search the lavender", next: "lavender_search" },
          { id: "check_clover", label: "🍀 Check the clover patch", next: "clover_search" },
          { id: "ask_gnome", label: "🗿 Ask the garden gnome", next: "gnome_ask" },
        ]
      },
      "gnome_ask": {
        text: "The gnome doesn't speak. Obviously. But you notice its ceramic eyes are pointing north toward the oak tree.",
        choices: [
          { id: "go_oak", label: "🌳 Head to the oak tree", next: "oak_arrive" },
          { id: "search_lavender_after", label: "🌸 Search the lavender instead", next: "lavender_search" },
        ]
      },
      "oak_arrive": {
        text: "A buzzing from a knothole in the old oak. The Golden Bee has set up a temporary residence.",
        choices: [
          { id: "coax_bee_gently", label: "🫳 Coax it out gently", next: "bee_coaxed" },
          { id: "use_smoke_bee", label: "🔥 Use campfire kit smoke", requires: "campfire_kit", next: "bee_smoked_out" },
          { id: "reach_knothole", label: "🤚 Reach in and grab it", next: "bee_grabs_you" },
        ]
      },
      "bee_coaxed": {
        text: "Patience pays off. The bee lands on your extended finger and allows itself to be returned to the hive.",
        reward: { items: [{ id: "wild_honeycomb", qty: 3 }, { id: "beeswax_chunk", qty: 2 }], money: 1800 },
        end: true,
        win: true
      },
      "bee_smoked_out": {
        text: "A gentle puff of smoke and the bee drifts drowsily out. You cup it carefully and deliver it home.",
        reward: { items: [{ id: "wild_honeycomb", qty: 4 }, { id: "pollen_sac", qty: 2 }], money: 2000 },
        end: true,
        win: true
      },
      "bee_grabs_you": {
        text: "Stung six times. The bee escapes deeper into the oak. You retreat, swollen-fingered.",
        choices: [
          { id: "try_again_patience", label: "🫳 Try again with patience", next: "bee_coaxed" },
          { id: "give_up_bee", label: "🚶 Give up", next: "bee_lost" },
        ]
      },
      "lavender_search": {
        text: "You comb through the lavender but find no Golden Bee — just a **Pollen Sac** and a pleasant smell.",
        reward: { items: [{ id: "pollen_sac", qty: 1 }], money: 0 },
        choices: [
          { id: "try_clover", label: "🍀 Try the clover patch", next: "clover_search" },
          { id: "try_oak", label: "🌳 Check the old oak", next: "oak_arrive" },
        ]
      },
      "clover_search": {
        text: "No bee, but you spot a cluster of **Tagihagen Mushrooms** and a **Garden Shard** tucked into a rabbit run.",
        reward: { items: [{ id: "tagihagen_mushroom", qty: 2 }, { id: "garden_shard", qty: 1 }], money: 0 },
        choices: [
          { id: "search_lavender_after2", label: "🌸 Try the lavender beds", next: "lavender_search" },
          { id: "go_oak_after", label: "🌳 Check the old oak", next: "oak_arrive" },
        ]
      },
      "bee_lost": {
        text: "You report back empty-handed. Lady Tagihagen sighs. *'Perhaps tomorrow.'* She gives you a small courtesy payment.",
        reward: { items: [{ id: "tagihagen_pebble", qty: 1 }], money: 300 },
        end: true,
        win: false
      }
    }
  }
};

const DEATH_SCENARIOS = [
  "🐊 You were eaten by a garden crocodile (escaped from the exotic pond)!",
  "🍄 You ate the wrong mushroom and simply ceased to exist for a bit!",
  "🐝 The Tagibees had had enough of you!",
  "🕷️ An enormous garden spider had an opinion about trespassers!",
  "💧 You drowned in the ornamental koi pond!",
  "🌿 The yew hedge came alive and was not friendly!",
  "🐺 Wild foxes are cuter than they are merciful!",
  "🧟 The garden gnomes moved at night and you were there to witness it!"
];

const REVIVAL_METHODS = [
  { item: "revival_potion", name: "🧪 Revival Potion", description: "Brings you back from the dead" },
  { item: "frog_amulet", name: "🐸 Frog Amulet", description: "Protects against one death" },
  { item: "lizard_totem", name: "🦎 Lizard Totem", description: "Revives you with garden magic" },
  { item: "swamp_blessing", name: "🌿 Garden Blessing", description: "Nature's protection" }
];

// ==================== EXPLORE COMMAND ====================

async function cmdExplore(message, args, util) {
  const { economySettings, ecoPrefix, run: runCmd, get: getCmd } = util;
  const { all: allRows } = require("./db");

  if (!economySettings?.enabled) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Economy system is disabled." }] }).catch(() => {});
    return;
  }

  const now = Date.now();
  const cooldown = 600000; // 10 min
  const lastExplore = await getCmd(
    `SELECT * FROM minigames_stats WHERE guild_id=? AND user_id=? AND minigame='exploration' AND stat_name='last_explore'`,
    [message.guild.id, message.author.id]
  );
  if (lastExplore?.last_played && (now - lastExplore.last_played) < cooldown) {
    const timeLeft = cooldown - (now - lastExplore.last_played);
    const mins = Math.floor(timeLeft / 60000);
    const secs = Math.floor((timeLeft % 60000) / 1000);
    await message.reply({ embeds: [{ color: 0xf39c12, description: `🌿 You're still recovering from your last wander. Back in **${mins}m ${secs}s**.` }] }).catch(() => {});
    return;
  }

  // Pick a random event
  const event = GARDEN_EXPLORE_EVENTS[Math.floor(Math.random() * GARDEN_EXPLORE_EVENTS.length)];

  // Filter choices: if choice requires an item, check inventory
  const availableChoices = [];
  for (const choice of event.choices) {
    if (choice.requires) {
      const hasItem = await getCmd(
        `SELECT * FROM user_inventory WHERE guild_id=? AND user_id=? AND item_id=? AND quantity > 0`,
        [message.guild.id, message.author.id, choice.requires]
      );
      if (!hasItem) continue; // skip locked choice
    }
    availableChoices.push(choice);
  }

  // Build embed + buttons
  const embed = new EmbedBuilder()
    .setColor(0x4a7c59)
    .setTitle(`🌿 𝕋𝕒𝕘𝕚𝕙𝕒𝕘𝕖𝕟 𝔾𝕒𝕣𝕕𝕖𝕟 — ${event.title}`)
    .setDescription(event.description + "\n\n*Choose your action below:*")
    .setFooter({ text: "Tagihagen Garden | Expires in 45s" });

  const row = new ActionRowBuilder().addComponents(
    availableChoices.map((c, i) =>
      new ButtonBuilder()
        .setCustomId(`explore_${i}`)
        .setLabel(c.label)
        .setStyle(ButtonStyle.Primary)
    )
  );

  const msg = await message.reply({ embeds: [embed], components: [row] }).catch(() => null);
  if (!msg) return;

  const collector = msg.createMessageComponentCollector({
    filter: i => i.user.id === message.author.id && i.customId.startsWith("explore_"),
    time: 45000,
    max: 1
  });

  collector.on("collect", async interaction => {
    const idx = parseInt(interaction.customId.split("_")[1]);
    const choice = availableChoices[idx];
    if (!choice) return;

    // Death chance
    if (choice.death_chance && Math.random() < choice.death_chance) {
      await interaction.update({ components: [] }).catch(() => {});
      await handleDeath(message, util, `You died exploring Tagihagen Garden! ${DEATH_SCENARIOS[Math.floor(Math.random() * DEATH_SCENARIOS.length)]}`);
      return;
    }

    const success = Math.random() < (choice.success ?? 1.0);
    const outcome = success ? choice.win : choice.lose;

    // Give items
    const itemLines = [];
    for (const it of (outcome.items || [])) {
      await runCmd(
        `INSERT INTO user_inventory (guild_id, user_id, item_id, quantity) VALUES (?, ?, ?, ?)
         ON CONFLICT (guild_id, user_id, item_id) DO UPDATE SET quantity=user_inventory.quantity+?`,
        [message.guild.id, message.author.id, it.id, it.qty, it.qty]
      );
      const name = EXPLORE_ITEM_NAMES[it.id] || it.id;
      itemLines.push(`${name} ×${it.qty}`);
    }
    // Give money
    if (outcome.money && outcome.money > 0) {
      await runCmd(`UPDATE user_economy SET balance=balance+? WHERE guild_id=? AND user_id=?`,
        [outcome.money, message.guild.id, message.author.id]);
    } else if (outcome.money && outcome.money < 0) {
      await runCmd(`UPDATE user_economy SET balance=MAX(0,balance+?) WHERE guild_id=? AND user_id=?`,
        [outcome.money, message.guild.id, message.author.id]);
    }

    // Record cooldown
    await runCmd(
      `INSERT INTO minigames_stats (guild_id, user_id, minigame, stat_name, stat_value, last_played)
       VALUES (?, ?, 'exploration', 'last_explore', 1, ?)
       ON CONFLICT (guild_id, user_id, minigame, stat_name) DO UPDATE SET stat_value=stat_value+1, last_played=?`,
      [message.guild.id, message.author.id, now, now]
    );

    const rewardText = itemLines.length || outcome.money
      ? `\n\n🎒 **Rewards:** ${[
          ...itemLines,
          outcome.money > 0 ? `${economySettings.currency_symbol || '🪙'}${outcome.money} ${economySettings.currency_name || 'coins'}` : '',
          outcome.money < 0 ? `Lost ${Math.abs(outcome.money)} ${economySettings.currency_name || 'coins'}` : ''
        ].filter(Boolean).join(", ")}`
      : "";

    const resultEmbed = new EmbedBuilder()
      .setColor(success ? 0x2ecc71 : 0xe74c3c)
      .setTitle(success ? `✅ 𝔼𝕩𝕡𝕝𝕠𝕣𝕒𝕥𝕚𝕠𝕟 𝕊𝕦𝕔𝕔𝕖𝕤𝕤` : `❌ 𝔼𝕩𝕡𝕝𝕠𝕣𝕒𝕥𝕚𝕠𝕟 𝔽𝕒𝕚𝕝𝕦𝕣𝕖`)
      .setDescription(`**${choice.label}**\n\n${outcome.text}${rewardText}`);

    await interaction.update({ embeds: [resultEmbed], components: [] }).catch(() => {});
  });

  collector.on("end", (collected, reason) => {
    if (reason === "time") {
      msg.edit({ embeds: [embed.setFooter({ text: "Tagihagen Garden | Expired" })], components: [] }).catch(() => {});
    }
  });
}

// ==================== ADVENTURE COMMAND ====================

async function cmdAdventure(message, args, util) {
  const { economySettings, ecoPrefix, run: runCmd, get: getCmd } = util;

  if (!economySettings?.enabled) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Economy system is disabled." }] }).catch(() => {});
    return;
  }

  // Cooldown: 20 minutes
  const now = Date.now();
  const cooldown = 1200000;
  const lastAdv = await getCmd(
    `SELECT * FROM minigames_stats WHERE guild_id=? AND user_id=? AND minigame='adventure' AND stat_name='last_adventure'`,
    [message.guild.id, message.author.id]
  );
  if (lastAdv?.last_played && (now - lastAdv.last_played) < cooldown) {
    const timeLeft = cooldown - (now - lastAdv.last_played);
    const mins = Math.floor(timeLeft / 60000);
    const secs = Math.floor((timeLeft % 60000) / 1000);
    await message.reply({ embeds: [{ color: 0xf39c12, description: `🗺️ You need to rest! Come back in **${mins}m ${secs}s**.` }] }).catch(() => {});
    return;
  }

  const storyId = args[0]?.toLowerCase();

  if (!storyId || !GARDEN_ADVENTURES[storyId]) {
    const list = Object.entries(GARDEN_ADVENTURES)
      .map(([id, s]) => `• \`${ecoPrefix}adventure ${id}\` — **${s.title}**`)
      .join("\n");
    await message.reply({ embeds: [new EmbedBuilder()
      .setColor(0x4a7c59)
      .setTitle("🗺️ 𝕋𝕒𝕘𝕚𝕙𝕒𝕘𝕖𝕟 𝔾𝕒𝕣𝕕𝕖𝕟 𝔸𝕕𝕧𝕖𝕟𝕥𝕦𝕣𝕖𝕤")
      .setDescription(`Choose an adventure and embark:\n\n${list}`)
      .setFooter({ text: "Tagihagen Garden | Adventures branch based on your choices" })
    ] }).catch(() => {});
    return;
  }

  const story = GARDEN_ADVENTURES[storyId];

  // Run the adventure as a continuous session
  await _runAdventureNode(message, util, story, "start", storyId, [], now);
}

async function _runAdventureNode(message, util, story, nodeId, storyId, accumulatedRewards, sessionStart) {
  const { economySettings, run: runCmd, get: getCmd } = util;
  const node = story.nodes[nodeId];
  if (!node) return;

  // Handle end node
  if (node.end) {
    // Give rewards from this node
    const allRewards = [...accumulatedRewards];
    if (node.reward) allRewards.push(node.reward);

    const totalMoney = allRewards.reduce((s, r) => s + (r.money || 0), 0);
    const allItems = allRewards.flatMap(r => r.items || []);

    // Consolidate items
    const itemMap = {};
    for (const it of allItems) {
      itemMap[it.id] = (itemMap[it.id] || 0) + it.qty;
    }

    for (const [id, qty] of Object.entries(itemMap)) {
      await runCmd(
        `INSERT INTO user_inventory (guild_id, user_id, item_id, quantity) VALUES (?, ?, ?, ?)
         ON CONFLICT (guild_id, user_id, item_id) DO UPDATE SET quantity=user_inventory.quantity+?`,
        [message.guild.id, message.author.id, id, qty, qty]
      );
    }
    if (totalMoney > 0) {
      await runCmd(`UPDATE user_economy SET balance=balance+? WHERE guild_id=? AND user_id=?`,
        [totalMoney, message.guild.id, message.author.id]);
    }

    // Record cooldown
    const now = Date.now();
    await runCmd(
      `INSERT INTO minigames_stats (guild_id, user_id, minigame, stat_name, stat_value, last_played)
       VALUES (?, ?, 'adventure', 'last_adventure', 1, ?)
       ON CONFLICT (guild_id, user_id, minigame, stat_name) DO UPDATE SET stat_value=stat_value+1, last_played=?`,
      [message.guild.id, message.author.id, now, now]
    );

    const itemLines = Object.entries(itemMap)
      .map(([id, qty]) => `${EXPLORE_ITEM_NAMES[id] || id} ×${qty}`);
    const rewardText = itemLines.length || totalMoney
      ? `\n\n🎒 **Total Rewards:**\n${[
          ...itemLines,
          totalMoney > 0 ? `${economySettings.currency_symbol || '🪙'}${totalMoney} ${economySettings.currency_name || 'coins'}` : ''
        ].filter(Boolean).join("\n")}`
      : "";

    await message.reply({ embeds: [new EmbedBuilder()
      .setColor(node.win ? 0xf1c40f : 0x95a5a6)
      .setTitle(node.win ? "🏆 𝔸𝕕𝕧𝕖𝕟𝕥𝕦𝕣𝕖 ℂ𝕠𝕞𝕡𝕝𝕖𝕥𝕖!" : "📖 𝔸𝕕𝕧𝕖𝕟𝕥𝕦𝕣𝕖 𝔼𝕟𝕕𝕖𝕕")
      .setDescription(`${node.text}${rewardText}`)
      .setFooter({ text: `Tagihagen Garden — ${story.title}` })
    ] }).catch(() => {});
    return;
  }

  // Give rewards from this node (non-end nodes can also have rewards)
  const newRewards = [...accumulatedRewards];
  if (node.reward) newRewards.push(node.reward);

  const desc = (node === story.nodes["start"]
    ? `*${story.intro}*\n\n${node.text}`
    : node.text) + "\n\n*Make your choice:*";

  const embed = new EmbedBuilder()
    .setColor(0x4a7c59)
    .setTitle(`🗺️ ${story.title}`)
    .setDescription(desc)
    .setFooter({ text: "Tagihagen Garden | Responds in 60s" });

  const row = new ActionRowBuilder().addComponents(
    node.choices.map((c, i) =>
      new ButtonBuilder()
        .setCustomId(`adv_${i}`)
        .setLabel(c.label)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!!(c.requires)) // could grey out if item not available
    )
  );

  // Also add an abandon button
  const abandonRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("adv_abandon")
      .setLabel("🚪 Abandon Adventure")
      .setStyle(ButtonStyle.Danger)
  );

  const msg = await message.reply({ embeds: [embed], components: [row, abandonRow] }).catch(() => null);
  if (!msg) return;

  const collector = msg.createMessageComponentCollector({
    filter: i => i.user.id === message.author.id && (i.customId.startsWith("adv_")),
    time: 60000,
    max: 1
  });

  collector.on("collect", async interaction => {
    if (interaction.customId === "adv_abandon") {
      await interaction.update({ components: [] }).catch(() => {});
      // Give any accumulated rewards so far
      const totalMoney = newRewards.reduce((s, r) => s + (r.money || 0), 0);
      const allItems = newRewards.flatMap(r => r.items || []);
      const itemMap = {};
      for (const it of allItems) itemMap[it.id] = (itemMap[it.id] || 0) + it.qty;

      for (const [id, qty] of Object.entries(itemMap)) {
        await runCmd(
          `INSERT INTO user_inventory (guild_id, user_id, item_id, quantity) VALUES (?, ?, ?, ?)
           ON CONFLICT (guild_id, user_id, item_id) DO UPDATE SET quantity=user_inventory.quantity+?`,
          [message.guild.id, message.author.id, id, qty, qty]
        );
      }
      if (totalMoney > 0) {
        await runCmd(`UPDATE user_economy SET balance=balance+? WHERE guild_id=? AND user_id=?`,
          [totalMoney, message.guild.id, message.author.id]);
      }

      const now = Date.now();
      await runCmd(
        `INSERT INTO minigames_stats (guild_id, user_id, minigame, stat_name, stat_value, last_played)
         VALUES (?, ?, 'adventure', 'last_adventure', 1, ?)
         ON CONFLICT (guild_id, user_id, minigame, stat_name) DO UPDATE SET stat_value=stat_value+1, last_played=?`,
        [message.guild.id, message.author.id, now, now]
      );

      const itemLines = Object.entries(itemMap).map(([id, qty]) => `${EXPLORE_ITEM_NAMES[id] || id} ×${qty}`);
      const kept = itemLines.length || totalMoney
        ? `\n\n🎒 **Kept:** ${[...itemLines, totalMoney > 0 ? `${economySettings.currency_symbol || '🪙'}${totalMoney}` : ''].filter(Boolean).join(", ")}`
        : "";

      await message.reply({ embeds: [{ color: 0x95a5a6, title: "🚪 𝔸𝕕𝕧𝕖𝕟𝕥𝕦𝕣𝕖 𝔸𝕓𝕒𝕟𝕕𝕠𝕟𝕖𝕕", description: `You slip back through the gate. The garden whispers after you.${kept}` }] }).catch(() => {});
      return;
    }

    const idx = parseInt(interaction.customId.split("_")[1]);
    const choice = node.choices[idx];
    if (!choice) return;

    // Death chance check
    if (choice.death_chance && Math.random() < choice.death_chance) {
      await interaction.update({ components: [] }).catch(() => {});
      await handleDeath(message, util, `You died during **${story.title}**! ${DEATH_SCENARIOS[Math.floor(Math.random() * DEATH_SCENARIOS.length)]}`);
      return;
    }

    await interaction.update({ components: [] }).catch(() => {});

    // Continue to next node
    await _runAdventureNode(message, util, story, choice.next, storyId, newRewards, sessionStart);
  });

  collector.on("end", (collected, reason) => {
    if (reason === "time" && collected.size === 0) {
      msg.edit({ embeds: [embed.setFooter({ text: "Tagihagen Garden | Timed out — adventure paused" })], components: [] }).catch(() => {});
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
  },
  // ── Illegal economy materials & tools ──────────────────────────────────────
  { item_id: "iron_scrap",       name: "🔩 Iron Scrap",         price: 80,   item_type: "material",   description: "Scavenged metal scraps. Used in weapon crafting.",              item_image_url: null, use_effect: null, lore: "Smells like rust and bad decisions." },
  { item_id: "gunpowder",        name: "💥 Gunpowder",          price: 120,  item_type: "material",   description: "Black powder. Highly flammable. Handle with care.",            item_image_url: null, use_effect: null, lore: "The warning label was illegible. Probably fine." },
  { item_id: "ghost_gun_parts",  name: "🔧 Ghost Gun Parts",    price: 600,  item_type: "material",   description: "Untraceable firearm components. Sourced from somewhere dark.",   item_image_url: null, use_effect: null, lore: "No serial number. No history. No witnesses." },
  { item_id: "brewing_barrel",   name: "🛢️ Brewing Barrel",     price: 1200, item_type: "tool",       description: "A sturdy oak barrel for fermenting illegal brews.",            item_image_url: null, use_effect: null, lore: "Smells of the past. And yeast." },
  { item_id: "empty_bottle",     name: "🍶 Empty Bottle",       price: 50,   item_type: "material",   description: "A glass bottle ready for filling with questionable liquids.",   item_image_url: null, use_effect: null, lore: "Half empty or half full. Currently: completely empty." },
  { item_id: "water_jug",        name: "🫙 Water Jug",          price: 30,   item_type: "material",   description: "A jug of clean water. Used in brewing recipes.",               item_image_url: null, use_effect: null, lore: "The cleanest thing in this operation." },
  { item_id: "bread_yeast",      name: "🍞 Bread Yeast",        price: 40,   item_type: "material",   description: "Active dry yeast. The secret ingredient in any good brew.",    item_image_url: null, use_effect: null, lore: "It lives. It feeds. It ferments." },
  { item_id: "sugar",            name: "🍬 Sugar",              price: 25,   item_type: "material",   description: "Raw cane sugar. Adds sweetness and boosts fermentation.",       item_image_url: null, use_effect: null, lore: "A spoonful helps the illegal brew go down." },
  { item_id: "apple",            name: "🍎 Apple",              price: 35,   item_type: "material",   description: "A fresh apple. Used in cider brewing.",                        item_image_url: null, use_effect: null, lore: "An apple a day keeps the revenuers away." },
  { item_id: "berry",            name: "🫐 Berry",              price: 30,   item_type: "material",   description: "Wild berries. Perfect for fermenting into berry wine.",         item_image_url: null, use_effect: null, lore: "Don't ask where they were found." },
  { item_id: "grape_vine_trellise", name: "🍇 Grape Vine Trellise", price: 800, item_type: "tool",  description: "Plant this to grow your own grapes every 6h. One-time setup.",   item_image_url: null, use_effect: null, lore: "The roots go deep. So does the debt." },
  { item_id: "beehive",          name: "🪣 Beehive",            price: 500,  item_type: "tool",       description: "An empty hive. Add bees to start producing honeycomb.",        item_image_url: null, use_effect: null, lore: "The previous owner left in a hurry." },
  { item_id: "bees",             name: "🐝 Bees",               price: 300,  item_type: "consumable", description: "A colony of bees. Adds 3 bee workers to your beehive.",        item_image_url: null, use_effect: null, lore: "Buzzing intensifies." },
  { item_id: "electric_heater",  name: "🌡️ Electric Heater",    price: 400,  item_type: "tool",       description: "Calms bees for 30 minutes before harvesting. Reusable.",       item_image_url: null, use_effect: null, lore: "Stolen from a spa. Worth it." },
  { item_id: "campfire_kit",     name: "🔥 Campfire Kit",       price: 150,  item_type: "consumable", description: "Smoke calms bees instantly. Single use, 2h calm duration.",    item_image_url: null, use_effect: null, lore: "Light it, smoke 'em, collect the gold." },
  { item_id: "basement",         name: "🏚️ Basement Lab",       price: 2000, item_type: "tool",       description: "A hidden basement for a safer grow operation. Required for basement weed tier.", item_image_url: null, use_effect: null, lore: "The landlord doesn't know. Let's keep it that way." },
  { item_id: "bunker",           name: "🏗️ Underground Bunker",  price: 5000, item_type: "tool",       description: "A fully hidden underground bunker. Required for underground operations.", item_image_url: null, use_effect: null, lore: "Built before you were born. Repurposed by you." },
];

// ==================== HEIST SYSTEM ====================

const HEIST_SCENARIOS = [
  { name: "Murk Vault Heist",        intro: "🏦 You case the Murk City Vault, studying guard rotations and laser grids...", successStory: "You crack the vault door with a custom pick and slip out through the sewers undetected!", failStory: "A silent alarm trips — you barely escape with the police hot on your heels." },
  { name: "Bog Baron Mansion",        intro: "🏚️ The Bog Baron is hosting a gala tonight — perfect cover to slip inside...",           successStory: "You swap into a waiter's uniform, pocket the jewels, and waltz out the front door.",              failStory: "A guard recognizes your face from a wanted poster. You drop everything and run." },
  { name: "Swamp Treasury Run",       intro: "💧 The swamp treasury moves shipments by boat at midnight — you wait in the reeds...",  successStory: "You leap aboard, overpower the guards, and make off with a chest of Murk coin!",            failStory: "The boat was a decoy. You surface to a dozen crossbow bolts aimed at you." },
  { name: "Void Crystal Smugglers",   intro: "🔮 Intel says a void crystal shipment passes through tonight — risky but lucrative...", successStory: "You ambush the courier in the fog and vanish with the crystals before dawn.",               failStory: "The smugglers were tipped off. You walk into an ambush and flee empty-handed." },
  { name: "Ancient Relic Exchange",   intro: "🏺 A shady dealer is trading relics in the back alleys of Murk Market...",             successStory: "You pocket the relics during the exchange and disappear into the crowd.",                    failStory: "The dealer had a bodyguard you didn't account for. You escape, barely." },
];

// cmdHeist — see async joinable version below (after cmdRobBank)

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
  // Active gather buffs (stacking)
  const [gBuff20f, gBuff100f, gBuffLuckf, gBuffEnhf, gBuffAlchf, gBuffWisdf, gBuffFishD] = await Promise.all([
    getCmd(`SELECT 1 FROM user_buffs WHERE guild_id=? AND user_id=? AND buff_id='earnings_boost_20' AND expires_at>?`,  [message.guild.id, message.author.id, now]),
    getCmd(`SELECT 1 FROM user_buffs WHERE guild_id=? AND user_id=? AND buff_id='earnings_boost_100' AND expires_at>?`, [message.guild.id, message.author.id, now]),
    getCmd(`SELECT 1 FROM user_buffs WHERE guild_id=? AND user_id=? AND buff_id='super_luck' AND expires_at>?`,         [message.guild.id, message.author.id, now]),
    getCmd(`SELECT 1 FROM user_buffs WHERE guild_id=? AND user_id=? AND buff_id='enhanced_gather_30' AND expires_at>?`, [message.guild.id, message.author.id, now]),
    getCmd(`SELECT 1 FROM user_buffs WHERE guild_id=? AND user_id=? AND buff_id='alchemist_gather_40' AND expires_at>?`,[message.guild.id, message.author.id, now]),
    getCmd(`SELECT 1 FROM user_buffs WHERE guild_id=? AND user_id=? AND buff_id='wisdom_boost_50' AND expires_at>?`,    [message.guild.id, message.author.id, now]),
    getCmd(`SELECT 1 FROM user_buffs WHERE guild_id=? AND user_id=? AND buff_id='fish_double' AND expires_at>?`,        [message.guild.id, message.author.id, now]),
  ]);
  let gatherMultF = 1.0;
  const gatherNotesF = [];
  if (gBuff20f)   { gatherMultF += 0.20; gatherNotesF.push("+20% Tonic"); }
  if (gBuff100f)  { gatherMultF += 1.00; gatherNotesF.push("+2x Dragon Scale"); }
  if (gBuffLuckf) { gatherMultF += 0.30; gatherNotesF.push("+30% Murk Elixir"); }
  if (gBuffEnhf)  { gatherMultF += 0.30; gatherNotesF.push("+30% Enhanced Tonic"); }
  if (gBuffAlchf) { gatherMultF += 0.40; gatherNotesF.push("+40% Alchemist Stone"); }
  if (gBuffWisdf) { gatherMultF += 0.50; gatherNotesF.push("+50% Wisdom Tome"); }
  if (gBuffFishD) { gatherMultF += 1.00; gatherNotesF.push("+2x Crystal Lens"); }
  const fishBuffLine = gatherNotesF.length > 0 ? `\n✨ **Buffs:** ${gatherNotesF.join(", ")}` : "";
  const fishValue = Math.floor(fish.value * scholarFishMult * gatherMultF);
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
    .setDescription(`${fish.emoji} **${fish.name}** [${fish.rarity.toUpperCase()}]${scholarFishNote}${fishBuffLine}`)
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
  // Active gather buffs (stacking)
  const [gBuff20d, gBuff100d, gBuffLuckd, gBuffEnhd, gBuffAlchd, gBuffWisd] = await Promise.all([
    getCmd(`SELECT 1 FROM user_buffs WHERE guild_id=? AND user_id=? AND buff_id='earnings_boost_20' AND expires_at>?`,  [message.guild.id, message.author.id, now]),
    getCmd(`SELECT 1 FROM user_buffs WHERE guild_id=? AND user_id=? AND buff_id='earnings_boost_100' AND expires_at>?`, [message.guild.id, message.author.id, now]),
    getCmd(`SELECT 1 FROM user_buffs WHERE guild_id=? AND user_id=? AND buff_id='super_luck' AND expires_at>?`,         [message.guild.id, message.author.id, now]),
    getCmd(`SELECT 1 FROM user_buffs WHERE guild_id=? AND user_id=? AND buff_id='enhanced_gather_30' AND expires_at>?`, [message.guild.id, message.author.id, now]),
    getCmd(`SELECT 1 FROM user_buffs WHERE guild_id=? AND user_id=? AND buff_id='alchemist_gather_40' AND expires_at>?`,[message.guild.id, message.author.id, now]),
    getCmd(`SELECT 1 FROM user_buffs WHERE guild_id=? AND user_id=? AND buff_id='wisdom_boost_50' AND expires_at>?`,    [message.guild.id, message.author.id, now]),
  ]);
  let gatherMultD = 1.0;
  const gatherNotesD = [];
  if (gBuff20d)   { gatherMultD += 0.20; gatherNotesD.push("+20% Tonic"); }
  if (gBuff100d)  { gatherMultD += 1.00; gatherNotesD.push("+2x Dragon Scale"); }
  if (gBuffLuckd) { gatherMultD += 0.30; gatherNotesD.push("+30% Murk Elixir"); }
  if (gBuffEnhd)  { gatherMultD += 0.30; gatherNotesD.push("+30% Enhanced Tonic"); }
  if (gBuffAlchd) { gatherMultD += 0.40; gatherNotesD.push("+40% Alchemist Stone"); }
  if (gBuffWisd)  { gatherMultD += 0.50; gatherNotesD.push("+50% Wisdom Tome"); }
  totalValveGain = Math.floor(totalValveGain * gatherMultD);
  const digBuffLine = gatherNotesD.length > 0 ? `\n✨ **Buffs:** ${gatherNotesD.join(", ")}` : "";
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
    .setDescription(`${reward.emoji || '⛏️'} **${reward.item}** [${reward.rarity?.toUpperCase() || 'COMMON'}]\n\n💰 **Value:** +${totalValveGain} ${economySettings.currency_name}${mapBonus}${scholarDigText}${digBuffLine}`)
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
  // Active gather buffs (stacking)
  const [gBuff20m, gBuff100m, gBuffLuckm, gBuffEnhm, gBuffAlchm, gBuffWisdm] = await Promise.all([
    getCmd(`SELECT 1 FROM user_buffs WHERE guild_id=? AND user_id=? AND buff_id='earnings_boost_20' AND expires_at>?`,  [message.guild.id, message.author.id, now]),
    getCmd(`SELECT 1 FROM user_buffs WHERE guild_id=? AND user_id=? AND buff_id='earnings_boost_100' AND expires_at>?`, [message.guild.id, message.author.id, now]),
    getCmd(`SELECT 1 FROM user_buffs WHERE guild_id=? AND user_id=? AND buff_id='super_luck' AND expires_at>?`,         [message.guild.id, message.author.id, now]),
    getCmd(`SELECT 1 FROM user_buffs WHERE guild_id=? AND user_id=? AND buff_id='enhanced_gather_30' AND expires_at>?`, [message.guild.id, message.author.id, now]),
    getCmd(`SELECT 1 FROM user_buffs WHERE guild_id=? AND user_id=? AND buff_id='alchemist_gather_40' AND expires_at>?`,[message.guild.id, message.author.id, now]),
    getCmd(`SELECT 1 FROM user_buffs WHERE guild_id=? AND user_id=? AND buff_id='wisdom_boost_50' AND expires_at>?`,    [message.guild.id, message.author.id, now]),
  ]);
  let gatherMultM = 1.0;
  const gatherNotesM = [];
  if (gBuff20m)   { gatherMultM += 0.20; gatherNotesM.push("+20% Tonic"); }
  if (gBuff100m)  { gatherMultM += 1.00; gatherNotesM.push("+2x Dragon Scale"); }
  if (gBuffLuckm) { gatherMultM += 0.30; gatherNotesM.push("+30% Murk Elixir"); }
  if (gBuffEnhm)  { gatherMultM += 0.30; gatherNotesM.push("+30% Enhanced Tonic"); }
  if (gBuffAlchm) { gatherMultM += 0.40; gatherNotesM.push("+40% Alchemist Stone"); }
  if (gBuffWisdm) { gatherMultM += 0.50; gatherNotesM.push("+50% Wisdom Tome"); }
  const mineBuffLine = gatherNotesM.length > 0 ? `\n✨ **Buffs:** ${gatherNotesM.join(", ")}` : "";
  const value = Math.floor(reward.value * mult * scholarMineMult * gatherMultM);

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
    .setDescription(`${reward.emoji || '⛏️'} **${reward.item}** [${reward.rarity?.toUpperCase() || 'COMMON'}]\n\n💰 **Value:** +${value} ${economySettings.currency_name}${voidText}${scholarMineText}${mineBuffLine}`)
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
  // Active gather buffs (stacking)
  const [gBuff20h, gBuff100h, gBuffLuckh, gBuffEnhh, gBuffAlchh, gBuffWisdh] = await Promise.all([
    getCmd(`SELECT 1 FROM user_buffs WHERE guild_id=? AND user_id=? AND buff_id='earnings_boost_20' AND expires_at>?`,  [message.guild.id, message.author.id, now]),
    getCmd(`SELECT 1 FROM user_buffs WHERE guild_id=? AND user_id=? AND buff_id='earnings_boost_100' AND expires_at>?`, [message.guild.id, message.author.id, now]),
    getCmd(`SELECT 1 FROM user_buffs WHERE guild_id=? AND user_id=? AND buff_id='super_luck' AND expires_at>?`,         [message.guild.id, message.author.id, now]),
    getCmd(`SELECT 1 FROM user_buffs WHERE guild_id=? AND user_id=? AND buff_id='enhanced_gather_30' AND expires_at>?`, [message.guild.id, message.author.id, now]),
    getCmd(`SELECT 1 FROM user_buffs WHERE guild_id=? AND user_id=? AND buff_id='alchemist_gather_40' AND expires_at>?`,[message.guild.id, message.author.id, now]),
    getCmd(`SELECT 1 FROM user_buffs WHERE guild_id=? AND user_id=? AND buff_id='wisdom_boost_50' AND expires_at>?`,    [message.guild.id, message.author.id, now]),
  ]);
  let gatherMultH = 1.0;
  const gatherNotesH = [];
  if (gBuff20h)   { gatherMultH += 0.20; gatherNotesH.push("+20% Tonic"); }
  if (gBuff100h)  { gatherMultH += 1.00; gatherNotesH.push("+2x Dragon Scale"); }
  if (gBuffLuckh) { gatherMultH += 0.30; gatherNotesH.push("+30% Murk Elixir"); }
  if (gBuffEnhh)  { gatherMultH += 0.30; gatherNotesH.push("+30% Enhanced Tonic"); }
  if (gBuffAlchh) { gatherMultH += 0.40; gatherNotesH.push("+40% Alchemist Stone"); }
  if (gBuffWisdh) { gatherMultH += 0.50; gatherNotesH.push("+50% Wisdom Tome"); }
  const huntBuffLine = gatherNotesH.length > 0 ? `\n✨ **Buffs:** ${gatherNotesH.join(", ")}` : "";
  const huntValue = Math.floor(reward.value * scholarHuntMult * gatherMultH);
  const scholarHuntText = scholarHuntMult > 1 ? "\n📚 **Scholar Bonus: +25% value!**" : "";

  await runCmd(`UPDATE user_economy SET balance=balance+? WHERE guild_id=? AND user_id=?`,
    [huntValue, message.guild.id, message.author.id]);
  await runCmd(`INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
    [message.guild.id, message.author.id, "hunting", huntValue, `Hunted ${reward.item}`]);

  const rarityColors = { common: 0x8b4513, uncommon: 0x228b22, rare: 0x4169e1, epic: 0x9b59b6, legendary: 0xffd700, mythic: 0xff69b4 };
  const embed = new EmbedBuilder()
    .setColor(rarityColors[reward.rarity] || 0x8b4513)
    .setTitle("🕸️ ℍ𝕦𝕟𝕥 ℝ𝕖𝕤𝕦𝕝𝕥")
    .setDescription(`${reward.emoji || '🐾'} **${reward.item}** [${reward.rarity?.toUpperCase() || 'COMMON'}]\n\n💰 **Value:** +${huntValue} ${economySettings.currency_name}${scholarHuntText}${huntBuffLine}`)
    .addFields({ name: "Total Hunts", value: `${huntCount}`, inline: true }, { name: "New Balance", value: `${economy.balance + huntValue} ${economySettings.currency_name}`, inline: true });
  await message.reply({ embeds: [embed] }).catch(() => {});
}

// ==================== ROBBERY SYSTEM ====================

async function cmdRobBank(message, args, util) {
  const { economySettings, ecoPrefix, run: runCmd, get: getCmd } = util;
  const { all: allCmd } = require("./db");

  if (!economySettings?.enabled) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Economy system is disabled." }] }).catch(() => {});
    return;
  }

  await runCmd(`INSERT INTO user_economy (guild_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING`,
    [message.guild.id, message.author.id]);

  const subArg = (args[0] || "").toLowerCase();
  const now = Date.now();

  // ─── Check existing active rob ───────────────────────────────────────────
  const activeRob = await getCmd(`SELECT * FROM active_bankrobs WHERE guild_id=?`, [message.guild.id]);

  // ─── JOIN ────────────────────────────────────────────────────────────────
  if (subArg === "join") {
    if (!activeRob) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: `❌ No active bank robbery to join! Start one with \`${ecoPrefix}bankrob\`.` }] }).catch(() => {});
      return;
    }
    if (activeRob.status !== "recruiting") {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Recruiting is closed — the robbery is already underway!" }] }).catch(() => {});
      return;
    }
    if (now > activeRob.recruit_until) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ The recruiting window has closed." }] }).catch(() => {});
      return;
    }
    const crew = JSON.parse(activeRob.crew);
    if (crew.includes(message.author.id)) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ You're already in this robbery!" }] }).catch(() => {});
      return;
    }

    const robber = await getCmd(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`, [message.guild.id, message.author.id]);
    if (!robber || robber.balance < 200) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ You need at least **200 coins** in your wallet to join a bank robbery (stake)." }] }).catch(() => {});
      return;
    }

    crew.push(message.author.id);
    await runCmd(`UPDATE active_bankrobs SET crew=? WHERE guild_id=?`, [JSON.stringify(crew), message.guild.id]);

    const timeLeft = Math.ceil((activeRob.finish_at - now) / 1000);
    await message.reply({ embeds: [{ color: 0x3498db, title: "🏦 Joined the Robbery!", description: `You're in, **${message.author.username}**! 🔫\n\n👥 Crew: **${crew.length}** robbers\n⏰ Robbery executes in **${timeLeft}s**` }] }).catch(() => {});
    return;
  }

  // ─── CHECK STATUS ────────────────────────────────────────────────────────
  if (subArg === "check" || subArg === "status") {
    if (!activeRob) {
      await message.reply({ embeds: [{ color: 0x95a5a6, description: `No active bank robbery. Start one with \`${ecoPrefix}bankrob\`.` }] }).catch(() => {});
      return;
    }
    const crew = JSON.parse(activeRob.crew);
    const timeLeft = Math.max(0, Math.ceil((activeRob.finish_at - now) / 1000));
    const phase = activeRob.status === "recruiting" && now < activeRob.recruit_until
      ? `🟡 Recruiting (${Math.ceil((activeRob.recruit_until - now) / 1000)}s left to join)`
      : `🔴 In progress (${timeLeft}s until result)`;
    const policeNote = activeRob.police_called ? "\n🚔 **Police have been called!** Success chance is reduced." : "";
    await message.reply({ embeds: [{ color: 0xf39c12, title: "🏦 Bank Robbery Status", description: `👥 Crew: **${crew.length}** robbers\nLeader: <@${activeRob.leader_id}>\nPhase: ${phase}${policeNote}` }] }).catch(() => {});
    return;
  }

  // ─── START NEW ROBBERY ───────────────────────────────────────────────────
  if (activeRob) {
    const crew = JSON.parse(activeRob.crew);
    const timeLeft = Math.ceil((activeRob.finish_at - now) / 1000);
    await message.reply({ embeds: [{ color: 0xf39c12, description: `🏦 A bank robbery is already in progress! ${crew.includes(message.author.id) ? "You're already in the crew." : `Use \`${ecoPrefix}bankrob join\` to participate.`}\n\n⏰ Result in **${timeLeft}s**.` }] }).catch(() => {});
    return;
  }

  const cooldownKey = `bankrob_cd_${message.guild.id}_${message.author.id}`;
  const robber = await getCmd(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`, [message.guild.id, message.author.id]);

  const personalCd = 3600000; // 1 hour personal cooldown
  if (robber.last_bank_rob && (now - robber.last_bank_rob) < personalCd) {
    const mins = Math.floor((personalCd - (now - robber.last_bank_rob)) / 60000);
    await message.reply({ embeds: [{ color: 0xf39c12, description: `🚔 You're still wanted from the last job. Try again in **${mins}m**.` }] }).catch(() => {});
    return;
  }

  if (!robber || robber.balance < 200) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ You need at least **200 coins** to lead a bank robbery (stake in case of failure)." }] }).catch(() => {});
    return;
  }

  const recruitWindowMs = 60_000; // 60s to join
  const robberyDurationMs = 3 * 60_000; // 3 minutes
  const recruitUntil = now + recruitWindowMs;
  const finishAt = now + robberyDurationMs;

  await runCmd(
    `INSERT INTO active_bankrobs (guild_id, leader_id, channel_id, crew, recruit_until, finish_at, police_called, status)
     VALUES (?, ?, ?, ?, ?, ?, 0, 'recruiting')
     ON CONFLICT (guild_id) DO UPDATE SET
       leader_id=excluded.leader_id, channel_id=excluded.channel_id, crew=excluded.crew,
       recruit_until=excluded.recruit_until, finish_at=excluded.finish_at,
       police_called=0, status='recruiting'`,
    [message.guild.id, message.author.id, message.channel.id, JSON.stringify([message.author.id]), recruitUntil, finishAt]
  );
  await runCmd(`UPDATE user_economy SET last_bank_rob=? WHERE guild_id=? AND user_id=?`, [now, message.guild.id, message.author.id]);

  // DM only the wealthiest member (the person whose bank is being robbed)
  const topVictim = await allCmd(
    `SELECT user_id FROM user_economy WHERE guild_id=? AND user_id != ? AND balance > 500 ORDER BY balance DESC LIMIT 1`,
    [message.guild.id, message.author.id]
  );
  if (topVictim.length > 0) {
    const victimUser = await message.client.users.fetch(topVictim[0].user_id).catch(() => null);
    if (victimUser) {
      victimUser.send({ embeds: [{ color: 0xe74c3c, title: "🚨 Bank Robbery Alert!", description: `Someone is robbing the bank in **${message.guild.name}**!\n\nThe robbery will complete in **3 minutes**.\n\n📱 If you have a **Phone**, quickly use \`${ecoPrefix}phone police\` in the server to call the police and **immediately stop** the robbery!\n\n*This is a targeted alert because you have the most wealth deposited.*` }] }).catch(() => {});
    }
  }

  await message.reply({ embeds: [new EmbedBuilder()
    .setColor(0xf39c12)
    .setTitle("🏦 𝔹𝕒𝕟𝕜 ℝ𝕠𝕓𝕓𝕖𝕣𝕪 𝕊𝕥𝕒𝕣𝕥𝕚𝕟𝕘!")
    .setDescription(`**${message.author.username}** is planning a bank heist! 🔫\n\n⏰ **60 seconds** to join the crew!\n⏳ Robbery executes in **3 minutes**\n\n📞 **The wealthiest member has been alerted** — if they call police, the robbery is immediately busted!\n💀 More crew = slightly higher success + bigger payout split equally`)
    .addFields(
      { name: "👥 Current Crew", value: `<@${message.author.id}> (leader)`, inline: false },
      { name: "📋 To Join", value: `\`${ecoPrefix}bankrob join\``, inline: true },
      { name: "📊 Check Status", value: `\`${ecoPrefix}bankrob check\``, inline: true }
    )
    .setFooter({ text: "Success chance: 40% solo → up to 65% with full crew | Police call = -20%" })
  ] }).catch(() => {});

  // Transition from recruiting → active after 60s
  setTimeout(async () => {
    try {
      const rob = await getCmd(`SELECT * FROM active_bankrobs WHERE guild_id=? AND status='recruiting'`, [message.guild.id]);
      if (!rob) return;
      await runCmd(`UPDATE active_bankrobs SET status='active' WHERE guild_id=?`, [message.guild.id]);
      const crewList = JSON.parse(rob.crew).map(id => `<@${id}>`).join(", ");
      await message.channel.send({ embeds: [{ color: 0xe74c3c, title: "🚨 Recruiting Closed!", description: `The crew is locked in! 👥 **${JSON.parse(rob.crew).length}** robbers: ${crewList}\n\n⏰ Result in **~2 minutes**. Stay tuned!` }] }).catch(() => {});
    } catch (e) { /* ignore */ }
  }, recruitWindowMs);
}

// ==================== HEIST SYSTEM (JOINABLE ASYNC) ====================

async function cmdHeist(message, args, util) {
  const { economySettings, ecoPrefix, run: runCmd, get: getCmd } = util;
  const { all: allCmd } = require("./db");

  if (!economySettings?.enabled) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Economy system is disabled." }] }).catch(() => {});
    return;
  }

  await runCmd(`INSERT INTO user_economy (guild_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING`,
    [message.guild.id, message.author.id]);

  const subArg = (args[0] || "").toLowerCase();
  const now = Date.now();

  const activeHeist = await getCmd(`SELECT * FROM active_heists WHERE guild_id=?`, [message.guild.id]);

  // ─── JOIN ────────────────────────────────────────────────────────────────
  if (subArg === "join") {
    if (!activeHeist) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: `❌ No active heist to join! Start one with \`${ecoPrefix}heist\`.` }] }).catch(() => {});
      return;
    }
    if (now > activeHeist.recruit_until) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ The recruiting window has closed." }] }).catch(() => {});
      return;
    }
    const crew = JSON.parse(activeHeist.crew);
    if (crew.includes(message.author.id)) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ You're already in this heist!" }] }).catch(() => {});
      return;
    }
    const member = await getCmd(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`, [message.guild.id, message.author.id]);
    if (!member || member.balance < 100) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ You need at least **100 coins** to join a heist." }] }).catch(() => {});
      return;
    }
    crew.push(message.author.id);
    await runCmd(`UPDATE active_heists SET crew=? WHERE guild_id=?`, [JSON.stringify(crew), message.guild.id]);
    const timeLeft = Math.max(0, Math.ceil((activeHeist.execute_at - now) / 1000));
    await message.reply({ embeds: [{ color: 0x3498db, title: "🕵️ Joined the Heist!", description: `You're in! 👥 Crew now: **${crew.length}** | ⏰ Executes in **${timeLeft}s**` }] }).catch(() => {});
    return;
  }

  // ─── CHECK STATUS ────────────────────────────────────────────────────────
  if (subArg === "check") {
    if (!activeHeist) {
      await message.reply({ embeds: [{ color: 0x95a5a6, description: `No active heist. Start one with \`${ecoPrefix}heist\`.` }] }).catch(() => {});
      return;
    }
    const crew = JSON.parse(activeHeist.crew);
    const timeLeft = Math.max(0, Math.ceil((activeHeist.execute_at - now) / 1000));
    await message.reply({ embeds: [{ color: 0x9b59b6, title: "🕵️ Heist Status", description: `**${activeHeist.scenario}**\n\n👥 Crew: **${crew.length}** | Leader: <@${activeHeist.leader_id}>\n⏰ Executes in **${timeLeft}s**` }] }).catch(() => {});
    return;
  }

  // ─── START NEW HEIST ─────────────────────────────────────────────────────
  if (activeHeist) {
    const timeLeft = Math.max(0, Math.ceil((activeHeist.execute_at - now) / 1000));
    const crew = JSON.parse(activeHeist.crew);
    await message.reply({ embeds: [{ color: 0xf39c12, description: `A heist is already being planned! ${crew.includes(message.author.id) ? "You're already in the crew." : `Use \`${ecoPrefix}heist join\` to join.`}\n\n⏰ Result in **${timeLeft}s**.` }] }).catch(() => {});
    return;
  }

  // Cooldown check
  const stats = await getCmd(
    `SELECT * FROM minigames_stats WHERE guild_id=? AND user_id=? AND minigame='heist' AND stat_name='last_heist'`,
    [message.guild.id, message.author.id]
  );
  const cooldown = 7200000;
  if (stats?.last_played && (now - stats.last_played) < cooldown) {
    const mins = Math.floor((cooldown - (now - stats.last_played)) / 60000);
    await message.reply({ embeds: [{ color: 0xf39c12, description: `🚔 You're laying low after the last job. Try again in **${mins}m**.` }] }).catch(() => {});
    return;
  }

  const economy = await getCmd(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`, [message.guild.id, message.author.id]);
  if (!economy || economy.balance < 100) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ You need at least **100 coins** to plan a heist." }] }).catch(() => {});
    return;
  }

  const scenario = HEIST_SCENARIOS[Math.floor(Math.random() * HEIST_SCENARIOS.length)];
  const recruitWindowMs = 60_000;
  const recruitUntil = now + recruitWindowMs;
  const executeAt = now + 3 * 60_000; // 3 minutes until execution

  await runCmd(
    `INSERT INTO active_heists (guild_id, leader_id, channel_id, crew, scenario, recruit_until, execute_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'recruiting')
     ON CONFLICT (guild_id) DO UPDATE SET
       leader_id=excluded.leader_id, channel_id=excluded.channel_id, crew=excluded.crew,
       scenario=excluded.scenario, recruit_until=excluded.recruit_until,
       execute_at=excluded.execute_at, status='recruiting'`,
    [message.guild.id, message.author.id, message.channel.id, JSON.stringify([message.author.id]), scenario.name, recruitUntil, executeAt]
  );

  // Brigand / dark blade class modifiers for display
  const robberClass = await getCmd(`SELECT class_id FROM user_class WHERE guild_id=? AND user_id=?`, [message.guild.id, message.author.id]);
  const classNote = robberClass?.class_id === 'brigand' ? "\n\n🗡️ *Brigand bonus applies to your cut!*" : "";

  await message.reply({ embeds: [new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle(`🕵️ ℍ𝕖𝕚𝕤𝕥 ℙ𝕝𝕒𝕟𝕟𝕚𝕟𝕘: ${scenario.name}`)
    .setDescription(`${scenario.intro}\n\n⏰ **60s** to gather your crew — heist executes in **3 minutes**!${classNote}`)
    .addFields(
      { name: "👥 Current Crew", value: `<@${message.author.id}> (leader)`, inline: false },
      { name: "📋 Join", value: `\`${ecoPrefix}heist join\``, inline: true },
      { name: "📊 Status", value: `\`${ecoPrefix}heist check\``, inline: true }
    )
    .setFooter({ text: "Solo: 40% success | Each extra crew member adds ~5% success | Payout split equally" })
  ] }).catch(() => {});
}

async function cmdPhone(message, args, util) {
  const { economySettings, ecoPrefix, run: runCmd, get: getCmd } = util;
  const { all: allCmd } = require("./db");
  
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
    const now = Date.now();
    // Check for active bank robbery in this guild
    const activeRob = await getCmd(`SELECT * FROM active_bankrobs WHERE guild_id=? AND status != 'done'`, [message.guild.id]);
    if (activeRob && !activeRob.police_called) {
      // Immediately bust the robbery
      const crew = JSON.parse(activeRob.crew || '[]');
      const channel = await message.client.channels.fetch(activeRob.channel_id).catch(() => null);
      for (const uid of crew) {
        const member = await getCmd(`SELECT balance FROM user_economy WHERE guild_id=? AND user_id=?`, [activeRob.guild_id, uid]);
        if (member) {
          const fine = Math.floor(member.balance * 0.40);
          await runCmd(`UPDATE user_economy SET balance=MAX(0, balance-?) WHERE guild_id=? AND user_id=?`, [fine, activeRob.guild_id, uid]);
        }
      }
      await runCmd(`DELETE FROM active_bankrobs WHERE guild_id=?`, [message.guild.id]);
      const crewMentions = crew.map(id => `<@${id}>`).join(", ");
      if (channel && channel.id !== message.channel.id) {
        await channel.send({ embeds: [{ color: 0xe74c3c, title: "🚔 Bank Robbery — POLICE RAID!", description: `🚨 **The police stormed the bank!**\n\n<@${message.author.id}> called the police and shut it down immediately!\n\n👥 Crew: ${crewMentions}\n💸 Each crew member fined **40% of their wallet**.` }] }).catch(() => {});
      }
      await message.reply({ embeds: [{ color: 0x3498db, title: "🚔 Police Called!", description: `📞 You called the police and immediately stopped the bank robbery!\n\n🚨 Crew arrested — each fined **40% of their wallet**.\n\n👥 Crew: ${crewMentions}` }] }).catch(() => {});
      return;
    }
    // General 1h protection
    await runCmd(
      `INSERT INTO minigames_stats (guild_id, user_id, minigame, stat_name, stat_value, last_played)
       VALUES (?, ?, 'phone', 'police_called', 1, ?)
       ON CONFLICT (guild_id, user_id, minigame, stat_name) DO UPDATE SET last_played=?`,
      [message.guild.id, message.author.id, now, now]
    );
    await message.reply({ embeds: [{ color: 0x3498db, title: '📞 Police Called!', description: '🚔 Officers are patrolling your area for the next hour.\n✅ Bank robberies against you will be harder if attempted.' }] }).catch(() => {});
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
