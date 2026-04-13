const { all, get, run } = require("./db");

// ==================== FISHING ====================

const FISH_TYPES = [
  { name: "Goldfish", emoji: "🐠", value: 50, rarity: "common", weight: 0.2 },
  { name: "Salmon", emoji: "🐟", value: 150, rarity: "uncommon", weight: 0.3 },
  { name: "Tuna", emoji: "🐟", value: 300, rarity: "rare", weight: 0.2 },
  { name: "Legendary Trout", emoji: "✨🐟", value: 1000, rarity: "legendary", weight: 0.15 },
  { name: "Golden Koi", emoji: "🪙🐟", value: 2000, rarity: "mythic", weight: 0.15 }
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
    await message.reply("❌ Economy system is disabled.").catch(() => {});
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
    await message.reply(`❌ You don't have a fishing rod! Buy one from the shop.\n\n💡 **Tip:** \`${ecoPrefix}buy fishing_rod\``).catch(() => {});
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
    await message.reply(`⏳ Your line is still wet! Come back in ${seconds}s.`).catch(() => {});
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
    await message.reply("🎣 You cast your line... but nothing bites! Come back later.").catch(() => {});
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

  await message.reply(`🎣 **You caught a ${fish.emoji} ${fish.name}!**\n\n**Value:** ${fish.value} ${economySettings.currency_name}\n**Rarity:** ${fish.rarity}\n**Total caught:** ${totalCaught}`).catch(() => {});
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
    await message.reply("❌ Economy system is disabled.").catch(() => {});
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
    await message.reply(`❌ You don't have a shovel! Buy one from the shop.\n\n💡 **Tip:** \`${ecoPrefix}buy shovel\``).catch(() => {});
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
    await message.reply(`⏳ You're catching your breath... come back in ${seconds}s.`).catch(() => {});
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

  const mapBonus = treasureMap ? "\n✨ **Treasure map bonus: 2x rewards!**" : "";
  await message.reply(`⛏️ **You dug and found:** ${reward.item.toUpperCase()}!\n\n**Value:** ${totalValveGain} ${economySettings.currency_name}\n**Total dug:** ${digCount}${mapBonus}`).catch(() => {});
}

// ==================== ROBBERY SYSTEM ====================

async function cmdRobBank(message, args, util) {
  const { economySettings, ecoPrefix, run: runCmd, get: getCmd } = util;
  
  if (!economySettings?.enabled) {
    await message.reply("❌ Economy system is disabled.").catch(() => {});
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
    await message.reply(`❌ Cops are still on high alert! Wait ${minutes} more minutes.`).catch(() => {});
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

    await message.reply(`🚔 **BANK ROBBERY FAILED!**\n\nYou got caught by the police and paid a fine of ${fine} ${economySettings.currency_name}!`).catch(() => {});
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

  await message.reply(`💰 **BANK ROBBERY SUCCESS!**\n\n🚨 You made off with ${amount} ${economySettings.currency_name}!\n*sirens in the distance...*`).catch(() => {});
}

// ==================== PHONE SYSTEM ====================

async function cmdPhone(message, args, util) {
  const { economySettings, ecoPrefix, run: runCmd, get: getCmd } = util;
  
  if (!economySettings?.enabled) {
    await message.reply("❌ Economy system is disabled.").catch(() => {});
    return;
  }

  // Check for phone
  const phone = await getCmd(
    `SELECT * FROM user_inventory WHERE guild_id=? AND user_id=? AND item_id='phone' AND quantity > 0`,
    [message.guild.id, message.author.id]
  );

  if (!phone) {
    await message.reply(`📱 You don't have a phone! Buy one from the shop.\n\n\`${ecoPrefix}buy phone\``).catch(() => {});
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
    
    await message.reply(`📞 **Police Called!**\n\n🚔 Officers are patrolling your area for the next hour.\n✅ Bank robberies against you will fail if attempted within the hour.`).catch(() => {});
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
    await message.reply(`🚕 **Taxi Ride**\n\n${randomStory}`).catch(() => {});
    return;
  }

  if (service === "takeout") {
    const economy = await getCmd(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`,
      [message.guild.id, message.author.id]);

    const foodPrice = 50;
    if (economy.balance < foodPrice) {
      await message.reply(`❌ Not enough money for takeout! (costs ${foodPrice} ${economySettings.currency_name})`).catch(() => {});
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

    await message.reply(`📱 **Takeout Delivered!**\n\n${randomFood} has arrived!\n*nom nom nom* 😋\n\nCost: ${foodPrice} ${economySettings.currency_name}`).catch(() => {});
    return;
  }

  await message.reply(`📱 **Phone Services**\n\n\`${ecoPrefix}phone police\` - Call the police (1h protection)\n\`${ecoPrefix}phone taxi\` - Order a taxi (funny stories)\n\`${ecoPrefix}phone takeout\` - Order food (${50} ${economySettings.currency_name})`).catch(() => {});
}

// ==================== EXPORTS ====================

module.exports = {
  cmdFish,
  cmdDig,
  cmdRobBank,
  cmdPhone
};
