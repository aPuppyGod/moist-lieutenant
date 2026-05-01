// src/economyCommands.js
// Economy commands extracted from commands.js
// Covers: balance, daily, weekly, pay, leaderboard, deposit, withdraw, rob, slots, coinflip, dice, job, work, shop, buy, inventory

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { get, all, run } = require("./db");
const { cmdRobBank } = require("./economy");

// ─────────────────────────────────────────────────────
// Helpers (duplicated from commands.js for module isolation)
// ─────────────────────────────────────────────────────

async function pickUserSmart(message, arg) {
  if (!message.guild) return null;
  await message.guild.members.fetch().catch(() => {});
  const members = message.guild.members.cache.filter(m => !m.user.bot);

  const mention = message.mentions.users.first();
  if (mention) return { member: message.guild.members.cache.get(mention.id), ambiguous: false };

  if (/^\d{15,21}$/.test(arg)) {
    const byId = members.get(arg);
    if (byId) return { member: byId, ambiguous: false };
  }

  const norm = s => String(s || "").toLowerCase();
  let found = members.filter(m =>
    norm(m.user.username) === norm(arg) ||
    norm(m.displayName) === norm(arg) ||
    norm(m.user.globalName) === norm(arg)
  );
  if (found.size === 1) return { member: found.first(), ambiguous: false };
  if (found.size > 1) return { ambiguous: true, matches: found.map(m => m.user.tag) };

  found = members.filter(m =>
    norm(m.user.username).includes(norm(arg)) ||
    norm(m.displayName).includes(norm(arg)) ||
    norm(m.user.globalName).includes(norm(arg))
  );
  if (found.size === 1) return { member: found.first(), ambiguous: false };
  if (found.size > 1) return { ambiguous: true, matches: found.map(m => m.user.tag) };

  return null;
}

function parseUserMentionSimple(message, arg) {
  const mentionMatch = arg?.match(/^<@!?(\d+)>$/);
  if (mentionMatch) {
    const member = message.guild.members.cache.get(mentionMatch[1]);
    return member ? { found: true, member } : { found: false };
  }
  if (/^\d{15,21}$/.test(arg)) {
    const member = message.guild.members.cache.get(arg);
    return member ? { found: true, member } : { found: false };
  }
  return { found: false };
}

async function getEconomySettings(guildId) {
  await run(
    `INSERT INTO economy_settings (guild_id) VALUES (?)
     ON CONFLICT (guild_id) DO NOTHING`,
    [guildId]
  );
  return await get(`SELECT * FROM economy_settings WHERE guild_id=?`, [guildId]);
}

// ─────────────────────────────────────────────────────
// ECONOMY: BALANCE & REWARDS
// ─────────────────────────────────────────────────────

async function cmdBalance(message, args) {
  const economySettings = await getEconomySettings(message.guild.id);
  if (!economySettings || !economySettings.enabled) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Economy system is disabled on this server." }] }).catch(() => {});
    return;
  }

  const targetUser = args[0] ? await pickUserSmart(message, args[0]) : null;
  const userId = targetUser?.member?.id || message.author.id;

  await run(`
    INSERT INTO user_economy (guild_id, user_id)
    VALUES (?, ?)
    ON CONFLICT (guild_id, user_id) DO NOTHING
  `, [message.guild.id, userId]);

  const economy = await get(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`, [message.guild.id, userId]);

  const embed = {
    color: 0xf1c40f,
    title: `${economySettings.currency_symbol} Balance`,
    description: `💰 **Wallet:** ${economy.balance} ${economySettings.currency_name}\n🏦 **Bank:** ${economy.bank} ${economySettings.currency_name}\n💎 **Total:** ${economy.balance + economy.bank} ${economySettings.currency_name}`,
    footer: { text: userId === message.author.id ? "Your balance" : `Balance of ${targetUser.member.user.tag}` }
  };

  await message.reply({ embeds: [embed] }).catch(() => {});
}

async function cmdDaily(message) {
  const economySettings = await getEconomySettings(message.guild.id);
  if (!economySettings || !economySettings.enabled) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Economy system is disabled on this server." }] }).catch(() => {});
    return;
  }

  await run(`
    INSERT INTO user_economy (guild_id, user_id)
    VALUES (?, ?)
    ON CONFLICT (guild_id, user_id) DO NOTHING
  `, [message.guild.id, message.author.id]);

  const economy = await get(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`, [message.guild.id, message.author.id]);

  const now = Date.now();
  const dayInMs = 86400000;

  if (economy.last_daily && (now - economy.last_daily) < dayInMs) {
    const timeLeft = dayInMs - (now - economy.last_daily);
    const hours = Math.floor(timeLeft / 3600000);
    const minutes = Math.floor((timeLeft % 3600000) / 60000);
    await message.reply({ embeds: [{ color: 0x2ecc71, description: `⏰ You already claimed your daily reward! Come back in ${hours}h ${minutes}m.\n🔥 Current streak: **${economy.daily_streak || 0}** days` }] }).catch(() => {});
    return;
  }

  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - dayInMs).toDateString();
  let newStreak = 1;

  if (economy.daily_streak_date === yesterday) {
    newStreak = (economy.daily_streak || 0) + 1;
  } else if (economy.daily_streak_date !== today) {
    newStreak = 1;
  }

  const baseAmount = economySettings.daily_amount || 100;
  const streakBonus = Math.floor((newStreak - 1) * (economySettings.daily_streak_bonus || 10));
  const totalAmount = baseAmount + streakBonus;

  const newBalance = economy.balance + totalAmount;
  await run(`UPDATE user_economy SET balance=?, last_daily=?, daily_streak=?, daily_streak_date=? WHERE guild_id=? AND user_id=?`,
    [newBalance, now, newStreak, today, message.guild.id, message.author.id]);

  await run(`INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
    [message.guild.id, message.author.id, "daily", totalAmount, `Daily reward (${newStreak} day streak)`]);

  const embed = {
    color: 0x2ecc71,
    title: `${economySettings.currency_symbol} Daily Reward`,
    description: `**Base:** ${baseAmount} ${economySettings.currency_name}\n**Streak Bonus:** ${streakBonus} ${economySettings.currency_name} (${newStreak} days)\n**Total:** ${totalAmount} ${economySettings.currency_name}`,
    fields: [
      { name: "🔥 Current Streak", value: `${newStreak} day${newStreak !== 1 ? "s" : ""}`, inline: true },
      { name: "💰 New Balance", value: `${newBalance} ${economySettings.currency_name}`, inline: true }
    ],
    footer: { text: `Keep your streak going! Come back tomorrow for ${baseAmount + (newStreak * (economySettings.daily_streak_bonus || 10))} ${economySettings.currency_name}` }
  };

  await message.reply({ embeds: [embed] }).catch(() => {});
}

async function cmdWeekly(message) {
  const economySettings = await getEconomySettings(message.guild.id);
  if (!economySettings || !economySettings.enabled) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Economy system is disabled on this server." }] }).catch(() => {});
    return;
  }

  await run(`
    INSERT INTO user_economy (guild_id, user_id)
    VALUES (?, ?)
    ON CONFLICT (guild_id, user_id) DO NOTHING
  `, [message.guild.id, message.author.id]);

  const economy = await get(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`, [message.guild.id, message.author.id]);

  const now = Date.now();
  const weekInMs = 604800000;

  if (economy.last_weekly && (now - economy.last_weekly) < weekInMs) {
    const timeLeft = weekInMs - (now - economy.last_weekly);
    const days = Math.floor(timeLeft / 86400000);
    const hours = Math.floor((timeLeft % 86400000) / 3600000);
    await message.reply({ embeds: [{ color: 0x2ecc71, description: `⏰ You already claimed your weekly reward! Come back in ${days}d ${hours}h.` }] }).catch(() => {});
    return;
  }

  const newBalance = economy.balance + economySettings.weekly_amount;
  await run(`UPDATE user_economy SET balance=?, last_weekly=? WHERE guild_id=? AND user_id=?`, [newBalance, now, message.guild.id, message.author.id]);

  await run(`INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
    [message.guild.id, message.author.id, "weekly", economySettings.weekly_amount, "Weekly reward"]);

  await message.reply({ embeds: [{ color: 0x2ecc71, description: `✅ You claimed your weekly reward of ${economySettings.weekly_amount} ${economySettings.currency_name}! ${economySettings.currency_symbol}` }] }).catch(() => {});
}

async function cmdPay(message, args) {
  const economySettings = await getEconomySettings(message.guild.id);
  if (!economySettings || !economySettings.enabled) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Economy system is disabled on this server." }] }).catch(() => {});
    return;
  }

  await run(`INSERT INTO user_economy (guild_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING`, [message.guild.id, message.author.id]);
  const senderEcon = await get(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`, [message.guild.id, message.author.id]);

  if (args.length < 2) {
    const ecoPrefix = economySettings.economy_prefix || "$";
    await message.reply({ embeds: [new EmbedBuilder().setColor(0x2ecc71).setTitle('💸 Pay Another User').setDescription(`Transfer money from your wallet to another user.\n\n**Usage:** \`${ecoPrefix}pay @user <amount>\`\n**Example:** \`${ecoPrefix}pay @John 500\`\n\n**Your Balance:** ${senderEcon.balance} ${economySettings.currency_name}`)] }).catch(() => {});
    return;
  }

  const target = await pickUserSmart(message, args[0]);
  if (!target || target.ambiguous || target.member.user.bot) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Invalid user or cannot pay bots." }] }).catch(() => {});
    return;
  }

  const amount = Number.parseInt(args[1], 10);
  if (!Number.isFinite(amount) || amount <= 0) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Invalid amount." }] }).catch(() => {});
    return;
  }

  await run(`INSERT INTO user_economy (guild_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING`, [message.guild.id, target.member.id]);

  if (senderEcon.balance < amount) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: `❌ You don't have enough ${economySettings.currency_name}!` }] }).catch(() => {});
    return;
  }

  await run(`UPDATE user_economy SET balance=balance-? WHERE guild_id=? AND user_id=?`, [amount, message.guild.id, message.author.id]);
  await run(`UPDATE user_economy SET balance=balance+? WHERE guild_id=? AND user_id=?`, [amount, message.guild.id, target.member.id]);

  await run(`INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
    [message.guild.id, message.author.id, "pay_sent", -amount, `Paid to ${target.member.user.tag}`]);
  await run(`INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
    [message.guild.id, target.member.id, "pay_received", amount, `Received from ${message.author.tag}`]);

  await message.reply({ embeds: [{ color: 0x2ecc71, description: `✅ You paid ${amount} ${economySettings.currency_name} to ${target.member}! ${economySettings.currency_symbol}` }] }).catch(() => {});
}

async function cmdEcoLeaderboard(message) {
  const economySettings = await getEconomySettings(message.guild.id);
  if (!economySettings || !economySettings.enabled) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Economy system is disabled on this server." }] }).catch(() => {});
    return;
  }

  const top = await all(`
    SELECT user_id, balance, bank, (balance + bank) as total
    FROM user_economy
    WHERE guild_id=?
    ORDER BY total DESC
    LIMIT 10
  `, [message.guild.id]);

  if (top.length === 0) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "No economy data yet!" }] }).catch(() => {});
    return;
  }

  const embed = {
    color: 0xf1c40f,
    title: `${economySettings.currency_symbol} Economy Leaderboard`,
    description: top.map((row, i) => {
      const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
      return `${medal} <@${row.user_id}>: **${row.total}** ${economySettings.currency_name}`;
    }).join("\n"),
    footer: { text: `${message.guild.name}` }
  };

  await message.reply({ embeds: [embed] }).catch(() => {});
}

// ─────────────────────────────────────────────────────
// ECONOMY: BANKING
// ─────────────────────────────────────────────────────

async function cmdDeposit(message, args) {
  const economySettings = await getEconomySettings(message.guild.id);
  if (!economySettings || !economySettings.enabled) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Economy system is disabled on this server." }] }).catch(() => {});
    return;
  }

  await run(`INSERT INTO user_economy (guild_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING`, [message.guild.id, message.author.id]);
  const economy = await get(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`, [message.guild.id, message.author.id]);

  if (!args[0]) {
    const ecoPrefix = economySettings.economy_prefix || "$";
    await message.reply({ embeds: [new EmbedBuilder().setColor(0x3498db).setTitle('💰 Deposit Money to Bank').setDescription(`Move money from your wallet to your bank for safekeeping.\n\n**Usage:**\n\`${ecoPrefix}deposit <amount>\`\n\`${ecoPrefix}deposit all\`\n\n**Your Wallet:** ${economy.balance} ${economySettings.currency_name}\n**Your Bank:** ${economy.bank} ${economySettings.currency_name}`)] }).catch(() => {});
    return;
  }

  let amount;
  if (args[0]?.toLowerCase() === "all") {
    amount = economy.balance;
  } else {
    amount = parseInt(args[0]);
    if (isNaN(amount) || amount <= 0) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Please specify a valid amount or 'all'." }] }).catch(() => {});
      return;
    }
  }

  if (economy.balance < amount) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: `❌ You only have ${economy.balance} ${economySettings.currency_name} in your wallet!` }] }).catch(() => {});
    return;
  }

  await run(`UPDATE user_economy SET balance=?, bank=? WHERE guild_id=? AND user_id=?`,
    [economy.balance - amount, economy.bank + amount, message.guild.id, message.author.id]);
  await run(`INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
    [message.guild.id, message.author.id, "deposit", amount, "Bank deposit"]);

  await message.reply({ embeds: [{ color: 0x2ecc71, description: `✅ Deposited ${amount} ${economySettings.currency_name} to your bank. 🏦` }] }).catch(() => {});
}

async function cmdWithdraw(message, args) {
  const economySettings = await getEconomySettings(message.guild.id);
  if (!economySettings || !economySettings.enabled) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Economy system is disabled on this server." }] }).catch(() => {});
    return;
  }

  await run(`INSERT INTO user_economy (guild_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING`, [message.guild.id, message.author.id]);
  const economy = await get(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`, [message.guild.id, message.author.id]);

  if (!args[0]) {
    const ecoPrefix = economySettings.economy_prefix || "$";
    await message.reply({ embeds: [new EmbedBuilder().setColor(0x3498db).setTitle('💵 Withdraw Money from Bank').setDescription(`Move money from your bank to your wallet.\n\n**Usage:**\n\`${ecoPrefix}withdraw <amount>\`\n\`${ecoPrefix}withdraw all\`\n\n**Your Wallet:** ${economy.balance} ${economySettings.currency_name}\n**Your Bank:** ${economy.bank} ${economySettings.currency_name}`)] }).catch(() => {});
    return;
  }

  let amount;
  if (args[0]?.toLowerCase() === "all") {
    amount = economy.bank;
  } else {
    amount = parseInt(args[0]);
    if (isNaN(amount) || amount <= 0) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Please specify a valid amount or 'all'." }] }).catch(() => {});
      return;
    }
  }

  if (economy.bank < amount) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: `❌ You only have ${economy.bank} ${economySettings.currency_name} in your bank!` }] }).catch(() => {});
    return;
  }

  await run(`UPDATE user_economy SET balance=?, bank=? WHERE guild_id=? AND user_id=?`,
    [economy.balance + amount, economy.bank - amount, message.guild.id, message.author.id]);
  await run(`INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
    [message.guild.id, message.author.id, "withdraw", amount, "Bank withdrawal"]);

  await message.reply({ embeds: [{ color: 0x2ecc71, description: `✅ Withdrew ${amount} ${economySettings.currency_name} from your bank. 💵` }] }).catch(() => {});
}

// ─────────────────────────────────────────────────────
// ECONOMY: ROB
// ─────────────────────────────────────────────────────

async function cmdRob(message, args) {
  const economySettings = await getEconomySettings(message.guild.id);
  if (!economySettings || !economySettings.enabled || !economySettings.rob_enabled) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Robbing is disabled on this server." }] }).catch(() => {});
    return;
  }

  if (!args[0]) {
    const ecoPrefix = economySettings.economy_prefix || "$";
    const cooldownMins = Math.floor((economySettings.rob_cooldown || 3600) / 60);
    await message.reply({ embeds: [new EmbedBuilder().setColor(0xe67e22).setTitle('💰 Rob Another User').setDescription(`Attempt to steal money from another user's wallet! (50% success rate)\n\n**Usage:** \`${ecoPrefix}rob @user\`\n\n**Risk:** You pay a fine if caught!\n**Cooldown:** ${economySettings.rob_cooldown || 60} minutes`)] }).catch(() => {});
    return;
  }

  const targetResult = parseUserMentionSimple(message, args[0]);
  if (!targetResult.found || targetResult.member.user.bot || targetResult.member.id === message.author.id) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Please mention a valid user to rob." }] }).catch(() => {});
    return;
  }
  const target = targetResult;

  await run(`INSERT INTO user_economy (guild_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING`, [message.guild.id, message.author.id]);
  await run(`INSERT INTO user_economy (guild_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING`, [message.guild.id, target.member.id]);

  const robber = await get(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`, [message.guild.id, message.author.id]);
  const victim = await get(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`, [message.guild.id, target.member.id]);

  const now = Date.now();
  const cooldown = (economySettings.rob_cooldown || 3600) * 1000;
  if (robber.last_normal_rob && (now - robber.last_normal_rob) < cooldown) {
    const timeLeft = cooldown - (now - robber.last_normal_rob);
    const minutes = Math.floor(timeLeft / 60000);
    await message.reply({ embeds: [{ color: 0xe74c3c, description: `❌ You must wait ${minutes} minutes before robbing again!` }] }).catch(() => {});
    return;
  }

  const padlock = await get(`SELECT * FROM user_inventory WHERE guild_id=? AND user_id=? AND item_id='padlock' AND quantity > 0`,
    [message.guild.id, target.member.id]);
  if (padlock) {
    await run(`UPDATE user_inventory SET quantity=quantity-1 WHERE guild_id=? AND user_id=? AND item_id='padlock'`,
      [message.guild.id, target.member.id]);
    await message.reply({ embeds: [{ color: 0xe74c3c, description: `❌ ${target.member} had a 🔒 **Padlock** protecting their wallet! It broke when you tried to rob them.` }] }).catch(() => {});
    await run(`UPDATE user_economy SET last_normal_rob=? WHERE guild_id=? AND user_id=?`, [now, message.guild.id, message.author.id]);
    return;
  }

  if (victim.balance < 50) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: `❌ ${target.member} is too poor to rob! (less than 50 ${economySettings.currency_name})` }] }).catch(() => {});
    return;
  }

  const success = Math.random() < 0.5;
  if (!success) {
    const fine = Math.min(robber.balance, Math.floor(victim.balance * 0.3));
    await run(`UPDATE user_economy SET balance=?, last_normal_rob=? WHERE guild_id=? AND user_id=?`,
      [robber.balance - fine, now, message.guild.id, message.author.id]);
    await run(`INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
      [message.guild.id, message.author.id, "rob_failed", -fine, `Failed to rob ${target.member.user.tag}`]);
    await message.reply({ embeds: [{ color: 0xe74c3c, description: `❌ You got caught trying to rob ${target.member}! You paid a fine of ${fine} ${economySettings.currency_name}.` }] }).catch(() => {});
    return;
  }

  const stolen = Math.floor(victim.balance * (0.1 + Math.random() * 0.2));
  await run(`UPDATE user_economy SET balance=?, last_normal_rob=? WHERE guild_id=? AND user_id=?`,
    [robber.balance + stolen, now, message.guild.id, message.author.id]);
  await run(`UPDATE user_economy SET balance=? WHERE guild_id=? AND user_id=?`,
    [victim.balance - stolen, message.guild.id, target.member.id]);
  await run(`INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
    [message.guild.id, message.author.id, "rob_success", stolen, `Robbed ${target.member.user.tag}`]);
  await run(`INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
    [message.guild.id, target.member.id, "robbed", -stolen, `Robbed by ${message.author.tag}`]);

  await message.reply({ embeds: [{ color: 0x2ecc71, description: `✅ You successfully robbed ${stolen} ${economySettings.currency_name} from ${target.member}! 💰` }] }).catch(() => {});
}

// ─────────────────────────────────────────────────────
// ECONOMY: GAMBLING
// ─────────────────────────────────────────────────────

async function cmdSlots(message, args) {
  const economySettings = await getEconomySettings(message.guild.id);
  if (!economySettings || !economySettings.enabled) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Economy system is disabled on this server." }] }).catch(() => {});
    return;
  }

  await run(`INSERT INTO user_economy (guild_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING`, [message.guild.id, message.author.id]);
  const economy = await get(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`, [message.guild.id, message.author.id]);

  if (!args[0]) {
    const ecoPrefix = economySettings.economy_prefix || "$";
    await message.reply({ embeds: [new EmbedBuilder().setColor(0x9b59b6).setTitle('🎰 Slot Machine').setDescription(`Spin the slots and win big!\n\n**Usage:** \`${ecoPrefix}slots <bet>\`\n\n**Payouts:**\n🎉 Triple Match: 3x\n💎 Triple Diamonds: 5x\n7️⃣ Triple Sevens: 10x (JACKPOT!)\n🎯 Double Match: 1.5x\n\n**Your Balance:** ${economy.balance} ${economySettings.currency_name}`)] }).catch(() => {});
    return;
  }

  const bet = parseInt(args[0]);
  if (isNaN(bet) || bet <= 0) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Please specify a valid bet amount." }] }).catch(() => {});
    return;
  }

  if (economy.balance < bet) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: `❌ You don't have enough ${economySettings.currency_name}!` }] }).catch(() => {});
    return;
  }

  const symbols = ["🍒", "🍋", "🍊", "🍇", "💎", "7️⃣"];
  const reel1 = symbols[Math.floor(Math.random() * symbols.length)];
  const reel2 = symbols[Math.floor(Math.random() * symbols.length)];
  const reel3 = symbols[Math.floor(Math.random() * symbols.length)];

  let multiplier = 0;
  let result = "";

  if (reel1 === reel2 && reel2 === reel3) {
    if (reel1 === "7️⃣") { multiplier = 10; result = "🎰 JACKPOT!!! 🎰"; }
    else if (reel1 === "💎") { multiplier = 5; result = "💎 Triple Diamonds! 💎"; }
    else { multiplier = 3; result = "🎉 Triple Match! 🎉"; }
  } else if (reel1 === reel2 || reel2 === reel3 || reel1 === reel3) {
    multiplier = 1.5;
    result = "🎯 Double Match!";
  } else {
    multiplier = 0;
    result = "❌ No match...";
  }

  const winnings = Math.floor(bet * multiplier) - bet;
  const newBalance = economy.balance + winnings;

  await run(`UPDATE user_economy SET balance=? WHERE guild_id=? AND user_id=?`, [newBalance, message.guild.id, message.author.id]);
  await run(`INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
    [message.guild.id, message.author.id, "slots", winnings, `Slots (bet ${bet})`]);

  const embed = {
    color: winnings > 0 ? 0x2ecc71 : 0xe74c3c,
    title: "🎰 Slot Machine",
    description: `${reel1} | ${reel2} | ${reel3}\n\n${result}`,
    fields: [
      { name: "Bet", value: `${bet} ${economySettings.currency_name}`, inline: true },
      { name: "Result", value: winnings > 0 ? `+${winnings} ${economySettings.currency_name}` : `${winnings} ${economySettings.currency_name}`, inline: true },
      { name: "Balance", value: `${newBalance} ${economySettings.currency_name}`, inline: true }
    ]
  };

  await message.reply({ embeds: [embed] }).catch(() => {});
}

async function cmdCoinflip(message, args) {
  const economySettings = await getEconomySettings(message.guild.id);
  if (!economySettings || !economySettings.enabled) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Economy system is disabled on this server." }] }).catch(() => {});
    return;
  }

  await run(`INSERT INTO user_economy (guild_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING`, [message.guild.id, message.author.id]);
  const economy = await get(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`, [message.guild.id, message.author.id]);

  if (!args[0] || !args[1]) {
    const ecoPrefix = economySettings.economy_prefix || "$";
    await message.reply({ embeds: [new EmbedBuilder().setColor(0xf1c40f).setTitle('🪙 Coinflip').setDescription(`Bet on heads or tails! Double your money or lose it all.\n\n**Usage:** \`${ecoPrefix}coinflip <bet> <heads/tails>\`\n**Example:** \`${ecoPrefix}coinflip 100 h\`\n\n**Choices:** heads, tails, h, t\n**Payout:** 2x your bet\n\n**Your Balance:** ${economy.balance} ${economySettings.currency_name}`)] }).catch(() => {});
    return;
  }

  const bet = parseInt(args[0]);
  const choice = args[1]?.toLowerCase();

  if (isNaN(bet) || bet <= 0) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Please specify a valid bet amount." }] }).catch(() => {});
    return;
  }

  if (!["heads", "tails", "h", "t"].includes(choice)) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Please choose heads (h) or tails (t)." }] }).catch(() => {});
    return;
  }

  if (economy.balance < bet) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: `❌ You don't have enough ${economySettings.currency_name}!` }] }).catch(() => {});
    return;
  }

  const flip = Math.random() < 0.5 ? "heads" : "tails";
  const userChoice = choice === "h" ? "heads" : choice === "t" ? "tails" : choice;
  const won = flip === userChoice;
  const winnings = won ? bet : -bet;
  const newBalance = economy.balance + winnings;

  await run(`UPDATE user_economy SET balance=? WHERE guild_id=? AND user_id=?`, [newBalance, message.guild.id, message.author.id]);
  await run(`INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
    [message.guild.id, message.author.id, "coinflip", winnings, `Coinflip ${flip} (bet ${bet})`]);

  const embed = {
    color: won ? 0x2ecc71 : 0xe74c3c,
    title: "🪙 Coinflip",
    description: `You chose **${userChoice}**\nThe coin landed on **${flip}**!\n\n${won ? "✅ You won!" : "❌ You lost!"}`,
    fields: [
      { name: "Bet", value: `${bet} ${economySettings.currency_name}`, inline: true },
      { name: "Result", value: won ? `+${bet} ${economySettings.currency_name}` : `-${bet} ${economySettings.currency_name}`, inline: true },
      { name: "Balance", value: `${newBalance} ${economySettings.currency_name}`, inline: true }
    ]
  };

  await message.reply({ embeds: [embed] }).catch(() => {});
}

async function cmdDice(message, args) {
  const economySettings = await getEconomySettings(message.guild.id);
  if (!economySettings || !economySettings.enabled) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Economy system is disabled on this server." }] }).catch(() => {});
    return;
  }

  await run(`INSERT INTO user_economy (guild_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING`, [message.guild.id, message.author.id]);
  const economy = await get(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`, [message.guild.id, message.author.id]);

  if (!args[0] || !args[1]) {
    const ecoPrefix = economySettings.economy_prefix || "$";
    await message.reply({ embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle('🎲 Dice Roll').setDescription(`Guess the dice roll (1-6) and win 6x your bet!\n\n**Usage:** \`${ecoPrefix}dice <bet> <guess>\`\n**Example:** \`${ecoPrefix}dice 100 5\`\n\n**Payout:** 6x your bet if you guess correctly\n\n**Your Balance:** ${economy.balance} ${economySettings.currency_name}`)] }).catch(() => {});
    return;
  }

  const bet = parseInt(args[0]);
  const guess = parseInt(args[1]);

  if (isNaN(bet) || bet <= 0) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Please specify a valid bet amount." }] }).catch(() => {});
    return;
  }

  if (isNaN(guess) || guess < 1 || guess > 6) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Please guess a number between 1 and 6." }] }).catch(() => {});
    return;
  }

  if (economy.balance < bet) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: `❌ You don't have enough ${economySettings.currency_name}!` }] }).catch(() => {});
    return;
  }

  const roll = Math.floor(Math.random() * 6) + 1;
  const won = roll === guess;
  const winnings = won ? bet * 5 : -bet;
  const newBalance = economy.balance + winnings;

  await run(`UPDATE user_economy SET balance=? WHERE guild_id=? AND user_id=?`, [newBalance, message.guild.id, message.author.id]);
  await run(`INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
    [message.guild.id, message.author.id, "dice", winnings, `Dice ${roll} (bet ${bet})`]);

  const embed = {
    color: won ? 0x2ecc71 : 0xe74c3c,
    title: "🎲 Dice Roll",
    description: `You guessed **${guess}**\nThe dice rolled **${roll}**!\n\n${won ? "🎉 You won 6x your bet!" : "❌ You lost!"}`,
    fields: [
      { name: "Bet", value: `${bet} ${economySettings.currency_name}`, inline: true },
      { name: "Result", value: won ? `+${bet * 5} ${economySettings.currency_name}` : `-${bet} ${economySettings.currency_name}`, inline: true },
      { name: "Balance", value: `${newBalance} ${economySettings.currency_name}`, inline: true }
    ]
  };

  await message.reply({ embeds: [embed] }).catch(() => {});
}

// ─────────────────────────────────────────────────────
// ECONOMY: JOBS
// ─────────────────────────────────────────────────────

async function cmdJob(message, args) {
  const economySettings = await getEconomySettings(message.guild.id);
  if (!economySettings || !economySettings.enabled) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Economy system is disabled on this server." }] }).catch(() => {});
    return;
  }

  const subcommand = args[0]?.toLowerCase();

  if (!subcommand || subcommand === "list") {
    const jobs = await all(`SELECT * FROM economy_jobs WHERE guild_id=? ORDER BY pay_min ASC`, [message.guild.id]);
    if (jobs.length === 0) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ No jobs available! Ask an admin to add some." }] }).catch(() => {});
      return;
    }

    const embed = {
      color: 0x3498db,
      title: "💼 Available Jobs",
      description: jobs.map(j =>
        `**${j.name}**\n💰 Pay: ${j.pay_min}-${j.pay_max} ${economySettings.currency_name}\n📊 Requires: ${j.required_shifts} total shifts\n⏰ Weekly: ${j.weekly_shifts_required} shifts/week`
      ).join("\n\n"),
      footer: { text: `Use job apply <jobname> to apply!` }
    };

    await message.reply({ embeds: [embed] }).catch(() => {});
    return;
  }

  await run(`INSERT INTO user_economy (guild_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING`, [message.guild.id, message.author.id]);
  const economy = await get(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`, [message.guild.id, message.author.id]);

  if (subcommand === "apply") {
    const jobName = args.slice(1).join(" ");
    if (!jobName) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Please specify a job name." }] }).catch(() => {});
      return;
    }

    const job = await get(`SELECT * FROM economy_jobs WHERE guild_id=? AND LOWER(name)=LOWER(?)`, [message.guild.id, jobName]);
    if (!job) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ That job doesn't exist! Use `job list` to see available jobs." }] }).catch(() => {});
      return;
    }

    if (economy.job_id) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ You already have a job! Use `job quit` first." }] }).catch(() => {});
      return;
    }

    if (economy.job_shifts_completed < job.required_shifts) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: `❌ You need ${job.required_shifts} total shifts completed to apply for this job! (You have ${economy.job_shifts_completed})` }] }).catch(() => {});
      return;
    }

    await run(`UPDATE user_economy SET job_id=?, job_weekly_shifts=0, job_week_reset=? WHERE guild_id=? AND user_id=?`,
      [job.id, Date.now(), message.guild.id, message.author.id]);

    await message.reply({ embeds: [{ color: 0x2ecc71, title: '✅ Hired!', description: `Congratulations! You got the job as **${job.name}**! Start working with the \`work\` command.` }] }).catch(() => {});
    return;
  }

  if (subcommand === "quit") {
    if (!economy.job_id) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ You don't have a job!" }] }).catch(() => {});
      return;
    }
    await run(`UPDATE user_economy SET job_id=NULL, job_weekly_shifts=0 WHERE guild_id=? AND user_id=?`, [message.guild.id, message.author.id]);
    await message.reply({ embeds: [{ color: 0x2ecc71, description: "✅ You quit your job." }] }).catch(() => {});
    return;
  }

  if (subcommand === "info") {
    if (!economy.job_id) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ You don't have a job! Use `job list` to see available jobs." }] }).catch(() => {});
      return;
    }

    const job = await get(`SELECT * FROM economy_jobs WHERE id=?`, [economy.job_id]);
    const weekInMs = 604800000;
    const weekProgress = Date.now() - economy.job_week_reset;
    const daysLeft = Math.max(0, Math.floor((weekInMs - weekProgress) / 86400000));

    const embed = {
      color: 0x3498db,
      title: `💼 Your Job: ${job.name}`,
      fields: [
        { name: "💰 Pay Range", value: `${job.pay_min}-${job.pay_max} ${economySettings.currency_name}`, inline: true },
        { name: "📊 Total Shifts", value: `${economy.job_shifts_completed}`, inline: true },
        { name: "⏰ This Week", value: `${economy.job_weekly_shifts}/${job.weekly_shifts_required}`, inline: true },
        { name: "📅 Week Resets In", value: `${daysLeft} days`, inline: true }
      ],
      footer: { text: `Use the work command to complete a shift!` }
    };

    await message.reply({ embeds: [embed] }).catch(() => {});
    return;
  }

  await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Usage: `job list`, `job apply <name>`, `job quit`, or `job info`" }] }).catch(() => {});
}

async function cmdWork(message) {
  const economySettings = await getEconomySettings(message.guild.id);
  if (!economySettings || !economySettings.enabled) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Economy system is disabled on this server." }] }).catch(() => {});
    return;
  }

  await run(`INSERT INTO user_economy (guild_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING`, [message.guild.id, message.author.id]);
  const economy = await get(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`, [message.guild.id, message.author.id]);

  if (!economy.job_id) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ You don't have a job! Use `job apply <name>` to get one." }] }).catch(() => {});
    return;
  }

  const now = Date.now();
  const shiftCooldown = 3600000;
  if (economy.job_last_shift && (now - economy.job_last_shift) < shiftCooldown) {
    const timeLeft = shiftCooldown - (now - economy.job_last_shift);
    const minutes = Math.floor(timeLeft / 60000);
    await message.reply({ embeds: [{ color: 0xe74c3c, description: `❌ You're tired! Rest for ${minutes} more minutes before your next shift.` }] }).catch(() => {});
    return;
  }

  const job = await get(`SELECT * FROM economy_jobs WHERE id=?`, [economy.job_id]);

  const weekInMs = 604800000;
  if (now - economy.job_week_reset > weekInMs) {
    if (economy.job_weekly_shifts < job.weekly_shifts_required) {
      await run(`UPDATE user_economy SET job_id=NULL, job_weekly_shifts=0, job_week_reset=NULL WHERE guild_id=? AND user_id=?`,
        [message.guild.id, message.author.id]);
      await message.reply({ embeds: [{ color: 0xe74c3c, description: `❌ You were fired from **${job.name}** for not completing ${job.weekly_shifts_required} shifts last week!` }] }).catch(() => {});
      return;
    }
    await run(`UPDATE user_economy SET job_weekly_shifts=0, job_week_reset=? WHERE guild_id=? AND user_id=?`,
      [now, message.guild.id, message.author.id]);
  }

  const games = ["typing", "emoji", "math"];
  const game = games[Math.floor(Math.random() * games.length)];

  if (game === "typing") {
    const words = ["javascript", "programming", "computer", "keyboard", "algorithm", "database", "function", "variable", "discord", "economy"];
    const word = words[Math.floor(Math.random() * words.length)];
    await message.reply({ embeds: [{ color: 0x3498db, title: '⌨️ Typing Challenge!', description: `Type the following word within 15 seconds:\n\`\`\`${word}\`\`\`` }] }).catch(() => {});
    const filter = m => m.author.id === message.author.id && m.content.toLowerCase() === word.toLowerCase();
    const collected = await message.channel.awaitMessages({ filter, max: 1, time: 15000, errors: ["time"] }).catch(() => null);
    if (!collected || collected.size === 0) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Time's up! You failed the shift." }] }).catch(() => {});
      return;
    }
  } else if (game === "emoji") {
    const emojis = ["😀", "😎", "🚀", "💎", "🔥", "⚡", "🎯", "🎮", "🎨", "🎭"];
    const target = emojis[Math.floor(Math.random() * emojis.length)];
    const options = [target];
    while (options.length < 5) {
      const random = emojis[Math.floor(Math.random() * emojis.length)];
      if (!options.includes(random)) options.push(random);
    }
    options.sort(() => Math.random() - 0.5);
    await message.reply({ embeds: [{ color: 0x3498db, description: `🎯 **Emoji Challenge!**\nFind and type the **${target}** emoji within 15 seconds:\n${options.join(" ")}` }] }).catch(() => {});
    const filter = m => m.author.id === message.author.id && m.content.includes(target);
    const collected = await message.channel.awaitMessages({ filter, max: 1, time: 15000, errors: ["time"] }).catch(() => null);
    if (!collected || collected.size === 0) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Time's up! You failed the shift." }] }).catch(() => {});
      return;
    }
  } else if (game === "math") {
    const num1 = Math.floor(Math.random() * 20) + 1;
    const num2 = Math.floor(Math.random() * 20) + 1;
    const operations = ["+", "-", "*"];
    const op = operations[Math.floor(Math.random() * operations.length)];
    let answer;
    if (op === "+") answer = num1 + num2;
    else if (op === "-") answer = num1 - num2;
    else answer = num1 * num2;
    await message.reply({ embeds: [{ color: 0x3498db, title: '🔢 Math Challenge!', description: `Solve within 15 seconds:\n\`\`\`${num1} ${op} ${num2} = ?\`\`\`` }] }).catch(() => {});
    const filter = m => m.author.id === message.author.id && parseInt(m.content) === answer;
    const collected = await message.channel.awaitMessages({ filter, max: 1, time: 15000, errors: ["time"] }).catch(() => null);
    if (!collected || collected.size === 0) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Time's up! You failed the shift." }] }).catch(() => {});
      return;
    }
  }

  const pay = Math.floor(job.pay_min + Math.random() * (job.pay_max - job.pay_min));
  await run(`UPDATE user_economy SET balance=?, job_last_shift=?, job_shifts_completed=?, job_weekly_shifts=? WHERE guild_id=? AND user_id=?`,
    [economy.balance + pay, now, economy.job_shifts_completed + 1, economy.job_weekly_shifts + 1, message.guild.id, message.author.id]);
  await run(`INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
    [message.guild.id, message.author.id, "work", pay, `Worked as ${job.name}`]);

  await message.reply({ embeds: [{ color: 0x2ecc71, description: `✅ Shift complete! You earned ${pay} ${economySettings.currency_name}. (${economy.job_weekly_shifts + 1}/${job.weekly_shifts_required} this week)` }] }).catch(() => {});
}

// ─────────────────────────────────────────────────────
// ECONOMY: SHOP
// ─────────────────────────────────────────────────────

async function cmdShop(message) {
  const economySettings = await getEconomySettings(message.guild.id);
  if (!economySettings || !economySettings.enabled) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Economy system is disabled on this server." }] }).catch(() => {});
    return;
  }

  const items = await all(`SELECT * FROM economy_shop_items WHERE guild_id=? ORDER BY price ASC`, [message.guild.id]);
  if (items.length === 0) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ The shop is empty! Ask an admin to add items." }] }).catch(() => {});
    return;
  }

  const typeEmoji = { tool: "🛠️", consumable: "🧪", material: "🧱", collectible: "🏆", single: "👑", misc: "📦" };
  const ITEMS_PER_PAGE = 5;

  // Flatten items with global numbering
  const indexed = items.map((item, i) => ({ ...item, shopIdx: i + 1 }));
  const totalPages = Math.ceil(indexed.length / ITEMS_PER_PAGE);

  function buildPage(page) {
    const start = page * ITEMS_PER_PAGE;
    const pageItems = indexed.slice(start, start + ITEMS_PER_PAGE);
    const lines = pageItems.map(item => {
      const emoji = typeEmoji[item.item_type] || "📦";
      const useHint = item.use_effect && !["fishing_rod", "shovel", "prestige_use", "revival_potion"].includes(item.use_effect)
        ? ` | Use: \`use ${item.item_id}\``
        : "";
      return `**${item.shopIdx}. ${emoji} ${item.name}** — ${item.price} ${economySettings.currency_name}\n${item.description}${useHint}`;
    });

    const previewItem = pageItems.find(i => i.item_image_url) || null;
    const embed = new EmbedBuilder()
      .setColor(0x1f8b4c)
      .setTitle("🛒 The Murk Grand Bazaar")
      .setDescription(lines.join("\n\n"))
      .setFooter({ text: `Page ${page + 1}/${totalPages} • Use buy <item number> to purchase` });
    if (previewItem?.item_image_url) embed.setThumbnail(previewItem.item_image_url);
    return embed;
  }

  function buildRow(page, disabled = false) {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("shop_prev")
        .setLabel("◀ Prev")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled || page === 0),
      new ButtonBuilder()
        .setCustomId("shop_page")
        .setLabel(`${page + 1} / ${totalPages}`)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId("shop_next")
        .setLabel("Next ▶")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled || page === totalPages - 1)
    );
  }

  let currentPage = 0;
  const msg = await message.reply({ embeds: [buildPage(0)], components: totalPages > 1 ? [buildRow(0)] : [] }).catch(() => null);
  if (!msg || totalPages <= 1) return;

  const collector = msg.createMessageComponentCollector({
    filter: i => i.user.id === message.author.id && (i.customId === "shop_prev" || i.customId === "shop_next"),
    time: 120000
  });

  collector.on("collect", async interaction => {
    if (interaction.customId === "shop_prev") currentPage = Math.max(0, currentPage - 1);
    if (interaction.customId === "shop_next") currentPage = Math.min(totalPages - 1, currentPage + 1);
    await interaction.update({ embeds: [buildPage(currentPage)], components: [buildRow(currentPage)] }).catch(() => {});
  });

  collector.on("end", () => {
    msg.edit({ components: [buildRow(currentPage, true)] }).catch(() => {});
  });
}

async function cmdBuy(message, args) {
  const economySettings = await getEconomySettings(message.guild.id);
  if (!economySettings || !economySettings.enabled) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Economy system is disabled on this server." }] }).catch(() => {});
    return;
  }

  if (!args[0]) {
    await cmdShop(message);
    return;
  }

  const itemIndex = parseInt(args[0]) - 1;
  if (isNaN(itemIndex)) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Please specify an item number from the shop." }] }).catch(() => {});
    return;
  }

  const items = await all(`SELECT * FROM economy_shop_items WHERE guild_id=? ORDER BY price ASC`, [message.guild.id]);
  const item = items[itemIndex];
  if (!item) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Invalid item number!" }] }).catch(() => {});
    return;
  }

  await run(`INSERT INTO user_economy (guild_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING`, [message.guild.id, message.author.id]);
  const economy = await get(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`, [message.guild.id, message.author.id]);

  if (economy.balance < item.price) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: `❌ You need ${item.price} ${economySettings.currency_name} to buy this! You have ${economy.balance}.` }] }).catch(() => {});
    return;
  }

  if (item.item_type === "single") {
    const owned = await get(`SELECT * FROM user_inventory WHERE guild_id=? AND user_id=? AND item_id=?`,
      [message.guild.id, message.author.id, item.item_id]);
    if (owned && owned.quantity > 0) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ You already own this item!" }] }).catch(() => {});
      return;
    }
  }

  await run(`UPDATE user_economy SET balance=? WHERE guild_id=? AND user_id=?`, [economy.balance - item.price, message.guild.id, message.author.id]);
  await run(`INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
    [message.guild.id, message.author.id, "shop_purchase", -item.price, `Bought ${item.name}`]);

  await run(`
    INSERT INTO user_inventory (guild_id, user_id, item_id, quantity)
    VALUES (?, ?, ?, 1)
    ON CONFLICT (guild_id, user_id, item_id)
    DO UPDATE SET quantity = user_inventory.quantity + 1
  `, [message.guild.id, message.author.id, item.item_id]);

  await message.reply({ embeds: [{ color: 0x2ecc71, description: `✅ You bought **${item.name}** for ${item.price} ${economySettings.currency_name}!` }] }).catch(() => {});
}

async function cmdInventory(message) {
  const economySettings = await getEconomySettings(message.guild.id);
  if (!economySettings || !economySettings.enabled) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Economy system is disabled on this server." }] }).catch(() => {});
    return;
  }

  const items = await all(`
    SELECT ui.item_id, ui.quantity, si.name, si.description, si.item_type, si.use_effect, si.item_image_url
    FROM user_inventory ui
    JOIN economy_shop_items si ON ui.item_id = si.item_id AND ui.guild_id = si.guild_id
    WHERE ui.guild_id=? AND ui.user_id=? AND ui.quantity > 0
  `, [message.guild.id, message.author.id]);

  if (items.length === 0) {
    await message.reply({ embeds: [{ color: 0x3498db, description: "🎒 Your inventory is empty!" }] }).catch(() => {});
    return;
  }

  const previewItem = items.find((i) => i.item_image_url) || items[0];
  const embed = new EmbedBuilder()
    .setColor(0x2e4053)
    .setTitle("🎒 Your Inventory")
    .setDescription(items.map(item => {
      const useHint = item.use_effect && !["fishing_rod", "shovel", "prestige_use", "revival_potion"].includes(item.use_effect)
        ? `\nUse: \`use ${item.item_id}\``
        : "";
      return `**${item.name}** x${item.quantity} (${item.item_type || "misc"})\n${item.description}${useHint}`;
    }).join("\n\n"))
    .setThumbnail(previewItem?.item_image_url || null)
    .setFooter({ text: "Tip: use item <name> for lore + stats" });

  await message.reply({ embeds: [embed] }).catch(() => {});
}

// ─────────────────────────────────────────────────────
// ECONOMY ADMIN: give / take / set / reset
// ─────────────────────────────────────────────────────

async function cmdEcoAdmin(message, args) {
  // Permission check: must be admin/manager
  const member = message.member;
  if (!member) return;
  const isAdmin = member.permissions?.has(1n << 3n) || // Administrator bit
    member.id === (process.env.BOT_MANAGER_ID || "900758140499398676");
  const settings = await get(`SELECT mod_role_id FROM guild_settings WHERE guild_id=?`, [message.guild.id]);
  const isManager = settings?.mod_role_id && member.roles?.cache?.has(settings.mod_role_id);
  if (!isAdmin && !isManager) {
    await message.reply({ embeds: [{ color: 0x95a5a6, description: "You need admin/manager permissions to use `ecoadmin`." }] }).catch(() => {});
    return;
  }

  const sub = String(args[0] || "").toLowerCase();
  const guildId = message.guild.id;

  const ecoSettings = await getEconomySettings(guildId);
  const sym = ecoSettings?.currency_symbol || "🪙";

  if (!["give", "take", "set", "reset"].includes(sub)) {
    await message.reply({ embeds: [{ color: 0x95a5a6, description: "Usage: `!ecoadmin give|take|set|reset <@user> [amount]`" }] }).catch(() => {});
    return;
  }

  const found = await pickUserSmart(message, args[1]);
  if (!found?.member) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "User not found. Please mention or provide a valid username/ID." }] }).catch(() => {});
    return;
  }
  const target = found.member;
  const targetId = target.user.id;

  // Ensure user economy row exists
  await run(
    `INSERT INTO user_economy (guild_id, user_id, balance, bank) VALUES (?, ?, 0, 0)
     ON CONFLICT (guild_id, user_id) DO NOTHING`,
    [guildId, targetId]
  );

  if (sub === "reset") {
    await run(`UPDATE user_economy SET balance=0, bank=0 WHERE guild_id=? AND user_id=?`, [guildId, targetId]);
    await message.reply({ embeds: [{ color: 0x2ecc71, description: `✅ Reset economy for ${target.user.tag}.` }] }).catch(() => {});
    return;
  }

  const amount = parseInt(args[2], 10);
  if (!amount || amount < 0) {
    await message.reply({ embeds: [{ color: 0x3498db, description: "Please provide a valid positive amount." }] }).catch(() => {});
    return;
  }

  if (sub === "give") {
    await run(`UPDATE user_economy SET balance=balance+? WHERE guild_id=? AND user_id=?`, [amount, guildId, targetId]);
    await message.reply({ embeds: [{ color: 0x2ecc71, description: `✅ Gave ${sym}${amount.toLocaleString()} to ${target.user.tag}.` }] }).catch(() => {});
    return;
  }

  if (sub === "take") {
    await run(`UPDATE user_economy SET balance=GREATEST(0, balance-?) WHERE guild_id=? AND user_id=?`, [amount, guildId, targetId]);
    await message.reply({ embeds: [{ color: 0x2ecc71, description: `✅ Removed ${sym}${amount.toLocaleString()} from ${target.user.tag}.` }] }).catch(() => {});
    return;
  }

  if (sub === "set") {
    await run(`UPDATE user_economy SET balance=? WHERE guild_id=? AND user_id=?`, [amount, guildId, targetId]);
    await message.reply({ embeds: [{ color: 0x2ecc71, description: `✅ Set ${target.user.tag}'s wallet to ${sym}${amount.toLocaleString()}.` }] }).catch(() => {});
    return;
  }
}

// ─────────────────────────────────────────────────────
// TRADE: offer, accept, decline, list
// ─────────────────────────────────────────────────────

async function cmdTrade(message, args) {
  const sub = String(args[0] || "").toLowerCase();
  const guildId = message.guild.id;
  const userId = message.author.id;

  const ecoSettings = await getEconomySettings(guildId);
  if (!ecoSettings?.enabled) {
    await message.reply({ embeds: [{ color: 0x3498db, description: "Economy is not enabled on this server." }] }).catch(() => {});
    return;
  }

  if (sub === "offer") {
    // !trade offer @user <your_item> for <their_item>
    // e.g. !trade offer @User iron_sword for gold_bar
    const forIdx = args.indexOf("for");
    if (forIdx === -1 || forIdx < 3) {
      await message.reply({ embeds: [{ color: 0x95a5a6, description: "Usage: `!trade offer <@user> <your_item> for <their_item>`" }] }).catch(() => {});
      return;
    }
    const found = await pickUserSmart(message, args[1]);
    if (!found?.member) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: "Target user not found." }] }).catch(() => {});
      return;
    }
    const toUser = found.member;
    if (toUser.user.id === userId) {
      await message.reply({ embeds: [{ color: 0x3498db, description: "You cannot trade with yourself." }] }).catch(() => {});
      return;
    }

    const fromItem = args.slice(2, forIdx).join(" ").trim().toLowerCase();
    const toItem = args.slice(forIdx + 1).join(" ").trim().toLowerCase();
    if (!fromItem || !toItem) {
      await message.reply({ embeds: [{ color: 0x3498db, description: "Please specify both items for the trade." }] }).catch(() => {});
      return;
    }

    const offeredItem = await get(
      `SELECT item_id, name FROM economy_shop_items
       WHERE guild_id=? AND (LOWER(item_id)=LOWER(?) OR LOWER(name)=LOWER(?))
       LIMIT 1`,
      [guildId, fromItem, fromItem]
    );
    const wantedItem = await get(
      `SELECT item_id, name FROM economy_shop_items
       WHERE guild_id=? AND (LOWER(item_id)=LOWER(?) OR LOWER(name)=LOWER(?))
       LIMIT 1`,
      [guildId, toItem, toItem]
    );
    if (!offeredItem || !wantedItem) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: "One or both items were not found in the shop catalog. Use the item ID from the shop/inventory." }] }).catch(() => {});
      return;
    }

    const senderInv = await get(
      `SELECT item_id, quantity FROM user_inventory WHERE guild_id=? AND user_id=? AND item_id=?`,
      [guildId, userId, offeredItem.item_id]
    );
    if (!senderInv || senderInv.quantity < 1) {
      await message.reply({ embeds: [{ color: 0x3498db, description: `You don't have **${offeredItem.name || offeredItem.item_id}** in your inventory.` }] }).catch(() => {});
      return;
    }

    await run(
      `INSERT INTO trade_offers (guild_id, from_user_id, to_user_id, from_item, to_item, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`,
      [guildId, userId, toUser.user.id, offeredItem.item_id, wantedItem.item_id]
    );

    const offer = await get(`SELECT id FROM trade_offers WHERE guild_id=? AND from_user_id=? AND status='pending' ORDER BY id DESC LIMIT 1`, [guildId, userId]);
    await message.reply({ embeds: [{ color: 0x2ecc71, title: '✅ Trade Offer Sent!', description: `Trade offer #${offer?.id} sent to ${toUser.user.tag}!\nYou offer: **${fromItem}** | You want: **${toItem}**\nThey can accept with \`!trade accept ${offer?.id}\` or decline with \`!trade decline ${offer?.id}\`.` }] }).catch(() => {});
    return;
  }

  if (sub === "accept") {
    const offerId = parseInt(args[1], 10);
    if (!offerId) {
      await message.reply({ embeds: [{ color: 0x95a5a6, description: "Usage: `!trade accept <trade_id>`" }] }).catch(() => {});
      return;
    }

    const offer = await get(
      `SELECT * FROM trade_offers WHERE id=? AND guild_id=? AND to_user_id=? AND status='pending'`,
      [offerId, guildId, userId]
    );
    if (!offer) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: "Trade offer not found or not addressed to you." }] }).catch(() => {});
      return;
    }

    const receiverInv = await get(
      `SELECT item_id, quantity FROM user_inventory WHERE guild_id=? AND user_id=? AND item_id=?`,
      [guildId, userId, offer.to_item]
    );
    if (!receiverInv || receiverInv.quantity < 1) {
      await message.reply({ embeds: [{ color: 0x3498db, description: `You don't have **${offer.to_item}** in your inventory to complete this trade.` }] }).catch(() => {});
      return;
    }

    const senderInv = await get(
      `SELECT item_id, quantity FROM user_inventory WHERE guild_id=? AND user_id=? AND item_id=?`,
      [guildId, offer.from_user_id, offer.from_item]
    );
    if (!senderInv || senderInv.quantity < 1) {
      await run(`UPDATE trade_offers SET status='cancelled', resolved_at=? WHERE id=?`, [Date.now(), offerId]);
      await message.reply({ embeds: [{ color: 0x3498db, description: `Trade cancelled — the other party no longer has **${offer.from_item}**.` }] }).catch(() => {});
      return;
    }

    await run(`UPDATE user_inventory SET quantity=quantity-1 WHERE guild_id=? AND user_id=? AND item_id=?`, [guildId, offer.from_user_id, offer.from_item]);
    await run(`UPDATE user_inventory SET quantity=quantity-1 WHERE guild_id=? AND user_id=? AND item_id=?`, [guildId, userId, offer.to_item]);

    await run(
      `INSERT INTO user_inventory (guild_id, user_id, item_id, quantity)
       VALUES (?, ?, ?, 1)
       ON CONFLICT (guild_id, user_id, item_id) DO UPDATE SET quantity=user_inventory.quantity+1`,
      [guildId, userId, offer.from_item]
    );
    await run(
      `INSERT INTO user_inventory (guild_id, user_id, item_id, quantity)
       VALUES (?, ?, ?, 1)
       ON CONFLICT (guild_id, user_id, item_id) DO UPDATE SET quantity=user_inventory.quantity+1`,
      [guildId, offer.from_user_id, offer.to_item]
    );

    await run(`UPDATE trade_offers SET status='completed', resolved_at=? WHERE id=?`, [Date.now(), offerId]);
    await message.reply({ embeds: [{ color: 0x2ecc71, description: `✅ Trade #${offerId} completed! You gave **${offer.to_item}** and received **${offer.from_item}**.` }] }).catch(() => {});
    return;
  }

  if (sub === "decline") {
    const offerId = parseInt(args[1], 10);
    if (!offerId) {
      await message.reply({ embeds: [{ color: 0x95a5a6, description: "Usage: `!trade decline <trade_id>`" }] }).catch(() => {});
      return;
    }
    const offer = await get(
      `SELECT * FROM trade_offers WHERE id=? AND guild_id=? AND (to_user_id=? OR from_user_id=?) AND status='pending'`,
      [offerId, guildId, userId, userId]
    );
    if (!offer) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: "Trade offer not found." }] }).catch(() => {});
      return;
    }
    await run(`UPDATE trade_offers SET status='declined', resolved_at=? WHERE id=?`, [Date.now(), offerId]);
    await message.reply({ embeds: [{ color: 0x2ecc71, description: `✅ Trade #${offerId} declined.` }] }).catch(() => {});
    return;
  }

  if (sub === "list") {
    const rows = await all(
      `SELECT id, from_user_id, to_user_id, from_item, to_item, status, created_at
       FROM trade_offers WHERE guild_id=? AND (from_user_id=? OR to_user_id=?) AND status='pending'
       ORDER BY id DESC LIMIT 10`,
      [guildId, userId, userId]
    );
    if (!rows.length) {
      await message.reply({ embeds: [{ color: 0x3498db, description: "You have no pending trades." }] }).catch(() => {});
      return;
    }
    const lines = rows.map(r => {
      const dir = r.from_user_id === userId ? "📤 Outgoing" : "📥 Incoming";
      return `**#${r.id}** ${dir}\nOffer: \`${r.from_item}\` → Want: \`${r.to_item}\``;
    }).join("\n\n");
    const embed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle("Your Pending Trades")
      .setDescription(lines.slice(0, 4000));
    await message.reply({ embeds: [embed] }).catch(() => {});
    return;
  }

  await message.reply({ embeds: [{ color: 0x95a5a6, description: "Usage: `!trade offer <@user> <item> for <item>` | `!trade accept <id>` | `!trade decline <id>` | `!trade list`" }] }).catch(() => {});
}

// ─────────────────────────────────────────────────────
// LOTTERY: buy tickets, check status, draw (admin)
// ─────────────────────────────────────────────────────

async function cmdLottery(message, args) {
  const sub = String(args[0] || "").toLowerCase();
  const guildId = message.guild.id;
  const userId = message.author.id;

  const ecoSettings = await getEconomySettings(guildId);
  if (!ecoSettings?.enabled) {
    await message.reply({ embeds: [{ color: 0x3498db, description: "Economy is not enabled on this server." }] }).catch(() => {});
    return;
  }
  const sym = ecoSettings.currency_symbol || "🪙";

  // Ensure lottery pool row exists
  await run(
    `INSERT INTO lottery_pool (guild_id, pot, ticket_price) VALUES (?, 0, 100)
     ON CONFLICT (guild_id) DO NOTHING`,
    [guildId]
  );
  const pool = await get(`SELECT pot, ticket_price, last_draw_at FROM lottery_pool WHERE guild_id=?`, [guildId]);
  const ticketPrice = pool?.ticket_price || 100;

  if (!sub || sub === "status" || sub === "info") {
    // Count total tickets and user's tickets
    const totalTickets = await get(`SELECT COALESCE(SUM(count),0) AS total FROM lottery_tickets WHERE guild_id=?`, [guildId]);
    const userTickets = await get(`SELECT COALESCE(SUM(count),0) AS total FROM lottery_tickets WHERE guild_id=? AND user_id=?`, [guildId, userId]);
    const pot = pool?.pot || 0;
    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle("🎟️ Lottery")
      .addFields(
        { name: "Current Pot", value: `${sym}${pot.toLocaleString()}`, inline: true },
        { name: "Ticket Price", value: `${sym}${ticketPrice}`, inline: true },
        { name: "Total Tickets Sold", value: `${totalTickets?.total || 0}`, inline: true },
        { name: "Your Tickets", value: `${userTickets?.total || 0}`, inline: true }
      )
      .setFooter({ text: "Buy tickets with !lottery buy <amount> • Admin draws with !lottery draw" });
    await message.reply({ embeds: [embed] }).catch(() => {});
    return;
  }

  if (sub === "buy") {
    const count = Math.max(1, parseInt(args[1], 10) || 1);
    if (count > 100) {
      await message.reply({ embeds: [{ color: 0x3498db, description: "You can buy at most 100 tickets at once." }] }).catch(() => {});
      return;
    }
    const cost = ticketPrice * count;

    await run(
      `INSERT INTO user_economy (guild_id, user_id, balance, bank) VALUES (?, ?, 0, 0)
       ON CONFLICT (guild_id, user_id) DO NOTHING`,
      [guildId, userId]
    );
    const eco = await get(`SELECT balance FROM user_economy WHERE guild_id=? AND user_id=?`, [guildId, userId]);
    if ((eco?.balance || 0) < cost) {
      await message.reply({ embeds: [{ color: 0x3498db, description: `You need ${sym}${cost.toLocaleString()} but only have ${sym}${(eco?.balance || 0).toLocaleString()}.` }] }).catch(() => {});
      return;
    }

    await run(`UPDATE user_economy SET balance=balance-? WHERE guild_id=? AND user_id=?`, [cost, guildId, userId]);
    await run(`UPDATE lottery_pool SET pot=pot+? WHERE guild_id=?`, [cost, guildId]);
    await run(
      `INSERT INTO lottery_tickets (guild_id, user_id, count) VALUES (?, ?, ?)`,
      [guildId, userId, count]
    );

    await message.reply({ embeds: [{ color: 0x2ecc71, description: `🎟️ Bought **${count}** ticket${count > 1 ? "s" : ""} for ${sym}${cost.toLocaleString()}! Good luck!` }] }).catch(() => {});
    return;
  }

  if (sub === "draw") {
    // Admin only
    const member = message.member;
    const isAdmin = member?.permissions?.has(1n << 3n) ||
      member?.id === (process.env.BOT_MANAGER_ID || "900758140499398676");
    const gsRow = await get(`SELECT mod_role_id FROM guild_settings WHERE guild_id=?`, [guildId]);
    const isManager = gsRow?.mod_role_id && member?.roles?.cache?.has(gsRow.mod_role_id);
    if (!isAdmin && !isManager) {
      await message.reply({ embeds: [{ color: 0x95a5a6, description: "Only admins/managers can draw the lottery." }] }).catch(() => {});
      return;
    }

    const pot = pool?.pot || 0;
    if (pot === 0) {
      await message.reply({ embeds: [{ color: 0x3498db, description: "The lottery pot is empty — no tickets sold yet." }] }).catch(() => {});
      return;
    }

    // Build weighted ticket pool
    const tickets = await all(`SELECT user_id, count FROM lottery_tickets WHERE guild_id=?`, [guildId]);
    if (!tickets.length) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: "No tickets sold yet." }] }).catch(() => {});
      return;
    }

    const pool_arr = [];
    for (const t of tickets) {
      for (let i = 0; i < t.count; i++) pool_arr.push(t.user_id);
    }
    const winnerId = pool_arr[Math.floor(Math.random() * pool_arr.length)];

    // Give winner the pot
    await run(
      `INSERT INTO user_economy (guild_id, user_id, balance, bank) VALUES (?, ?, 0, 0)
       ON CONFLICT (guild_id, user_id) DO NOTHING`,
      [guildId, winnerId]
    );
    await run(`UPDATE user_economy SET balance=balance+? WHERE guild_id=? AND user_id=?`, [pot, guildId, winnerId]);

    // Reset lottery
    await run(`UPDATE lottery_pool SET pot=0, last_draw_at=? WHERE guild_id=?`, [Date.now(), guildId]);
    await run(`DELETE FROM lottery_tickets WHERE guild_id=?`, [guildId]);

    const winnerUser = await message.guild.members.fetch(winnerId).catch(() => null);
    const winnerTag = winnerUser?.user?.tag || `<@${winnerId}>`;
    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle("🎉 Lottery Draw!")
      .setDescription(`**Winner: ${winnerTag}**\nPrize: **${sym}${pot.toLocaleString()}**`)
      .setFooter({ text: `Total tickets: ${pool_arr.length}` });
    await message.channel.send({ embeds: [embed] }).catch(() => {});
    return;
  }

  if (sub === "setprice") {
    const member = message.member;
    const isAdmin = member?.permissions?.has(1n << 3n) ||
      member?.id === (process.env.BOT_MANAGER_ID || "900758140499398676");
    if (!isAdmin) {
      await message.reply({ embeds: [{ color: 0x95a5a6, description: "Only admins can set the ticket price." }] }).catch(() => {});
      return;
    }
    const price = parseInt(args[1], 10);
    if (!price || price < 1) {
      await message.reply({ embeds: [{ color: 0x3498db, description: "Please provide a valid ticket price." }] }).catch(() => {});
      return;
    }
    await run(`UPDATE lottery_pool SET ticket_price=? WHERE guild_id=?`, [price, guildId]);
    await message.reply({ embeds: [{ color: 0x2ecc71, description: `✅ Lottery ticket price set to ${sym}${price}.` }] }).catch(() => {});
    return;
  }

  await message.reply({ embeds: [{ color: 0x95a5a6, description: "Usage: `!lottery` | `!lottery buy <amount>` | `!lottery draw` (admin) | `!lottery setprice <price>` (admin)" }] }).catch(() => {});
}

// ─────────────────────────────────────────────────────
// ECONOMY: ROULETTE
// ─────────────────────────────────────────────────────

async function cmdRoulette(message, args) {
  const economySettings = await getEconomySettings(message.guild.id);
  if (!economySettings?.enabled) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Economy system is disabled." }] }).catch(() => {});
    return;
  }

  const ecoPrefix = economySettings.economy_prefix || "$";
  await run(`INSERT INTO user_economy (guild_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING`, [message.guild.id, message.author.id]);
  const economy = await get(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`, [message.guild.id, message.author.id]);

  if (!args[0] || !args[1]) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(0x8e44ad).setTitle("🎡 Roulette").setDescription(
      `Bet on a number (0-36), color (red/black), or group (even/odd/low/high)!\n\n**Usage:** \`${ecoPrefix}roulette <bet> <choice>\`\n\n**Payouts:**\n🔴/⚫ Red or Black → 2x\n🔢 Even/Odd → 2x\n📊 Low (1-18)/High (19-36) → 2x\n🎯 Single number (0-36) → 35x jackpot\n\n**Your Balance:** ${economy.balance} ${economySettings.currency_name}`
    )] }).catch(() => {});
    return;
  }

  const bet = parseInt(args[0]);
  if (isNaN(bet) || bet <= 0) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Invalid bet amount." }] }).catch(() => {}); return;
  }
  if (economy.balance < bet) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: `❌ You don't have enough ${economySettings.currency_name}!` }] }).catch(() => {}); return;
  }

  const choice = args[1].toLowerCase();
  const RED_NUMBERS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
  const spin = Math.floor(Math.random() * 37); // 0-36
  const spinColor = spin === 0 ? "green" : RED_NUMBERS.has(spin) ? "red" : "black";
  const spinEmoji = spin === 0 ? "💚" : spinColor === "red" ? "🔴" : "⚫";

  let won = false;
  let multiplier = 0;
  let choiceDesc = choice;

  const numChoice = parseInt(choice);
  if (!isNaN(numChoice) && numChoice >= 0 && numChoice <= 36) {
    won = spin === numChoice;
    multiplier = 35;
    choiceDesc = `number ${numChoice}`;
  } else if (choice === "red") {
    won = spinColor === "red";
    multiplier = 2;
    choiceDesc = "🔴 Red";
  } else if (choice === "black") {
    won = spinColor === "black";
    multiplier = 2;
    choiceDesc = "⚫ Black";
  } else if (choice === "even") {
    won = spin !== 0 && spin % 2 === 0;
    multiplier = 2;
    choiceDesc = "Even";
  } else if (choice === "odd") {
    won = spin % 2 !== 0;
    multiplier = 2;
    choiceDesc = "Odd";
  } else if (choice === "low") {
    won = spin >= 1 && spin <= 18;
    multiplier = 2;
    choiceDesc = "Low (1-18)";
  } else if (choice === "high") {
    won = spin >= 19 && spin <= 36;
    multiplier = 2;
    choiceDesc = "High (19-36)";
  } else {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Invalid choice! Use: red, black, even, odd, low, high, or a number 0-36." }] }).catch(() => {}); return;
  }

  const winnings = won ? bet * (multiplier - 1) : -bet;
  const newBalance = economy.balance + winnings;
  await run(`UPDATE user_economy SET balance=? WHERE guild_id=? AND user_id=?`, [newBalance, message.guild.id, message.author.id]);
  await run(`INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
    [message.guild.id, message.author.id, "roulette", winnings, `Roulette ${spin} (bet ${bet} on ${choice})`]);

  const embed = {
    color: won ? 0x2ecc71 : 0xe74c3c,
    title: "🎡 Roulette",
    description: `The wheel spins...\n\n${spinEmoji} **${spin}** ${spinColor.toUpperCase()}\n\nYou bet on **${choiceDesc}**\n${won ? `✅ You won **${winnings} ${economySettings.currency_name}**!` : `❌ You lost **${bet} ${economySettings.currency_name}**.`}`,
    fields: [
      { name: "Balance", value: `${newBalance} ${economySettings.currency_name}`, inline: true },
      { name: "Multiplier", value: won ? `${multiplier}x` : "0x", inline: true }
    ]
  };
  await message.reply({ embeds: [embed] }).catch(() => {});
}

// ─────────────────────────────────────────────────────
// ECONOMY: BLACKJACK
// ─────────────────────────────────────────────────────

function bjCardValue(card) {
  if (["J","Q","K"].includes(card[0])) return 10;
  if (card[0] === "A") return 11;
  return parseInt(card[0]);
}

function bjHandValue(hand) {
  let val = hand.reduce((s, c) => s + bjCardValue(c), 0);
  let aces = hand.filter(c => c[0] === "A").length;
  while (val > 21 && aces > 0) { val -= 10; aces--; }
  return val;
}

function bjDeck() {
  const suits = ["♠","♥","♦","♣"];
  const ranks = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
  const deck = [];
  for (const s of suits) for (const r of ranks) deck.push(r + s);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function bjHandStr(hand) { return hand.join(" "); }

async function cmdBlackjack(message, args) {
  const economySettings = await getEconomySettings(message.guild.id);
  if (!economySettings?.enabled) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Economy system is disabled." }] }).catch(() => {});
    return;
  }

  const ecoPrefix = economySettings.economy_prefix || "$";
  await run(`INSERT INTO user_economy (guild_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING`, [message.guild.id, message.author.id]);
  const economy = await get(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`, [message.guild.id, message.author.id]);

  if (!args[0]) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(0x2d6a4f).setTitle("🃏 Blackjack").setDescription(
      `Try to beat the dealer by getting closer to 21 without going over!\n\n**Usage:** \`${ecoPrefix}blackjack <bet>\`\n\n**Rules:**\n• Blackjack (Ace + 10-card on deal) = **2.5x**\n• Beat dealer = **2x**\n• Push (tie) = bet returned\n• Bust or lose = lose bet\n\n**Controls:** Type \`hit\` or \`stand\` in 30 seconds\n\n**Your Balance:** ${economy.balance} ${economySettings.currency_name}`
    )] }).catch(() => {});
    return;
  }

  const bet = parseInt(args[0]);
  if (isNaN(bet) || bet <= 0) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Invalid bet amount." }] }).catch(() => {}); return;
  }
  if (economy.balance < bet) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: `❌ You don't have enough ${economySettings.currency_name}!` }] }).catch(() => {}); return;
  }

  const deck = bjDeck();
  let playerHand = [deck.pop(), deck.pop()];
  let dealerHand = [deck.pop(), deck.pop()];

  const showState = (showDealer = false) => {
    const dHand = showDealer ? bjHandStr(dealerHand) : `${dealerHand[0]} ??`;
    const dVal = showDealer ? bjHandValue(dealerHand) : "?";
    return `🃏 **Your hand:** ${bjHandStr(playerHand)} = **${bjHandValue(playerHand)}**\n🎩 **Dealer:** ${dHand} = **${dVal}**`;
  };

  // Natural blackjack check
  if (bjHandValue(playerHand) === 21) {
    const winnings = Math.floor(bet * 1.5);
    const newBalance = economy.balance + winnings;
    await run(`UPDATE user_economy SET balance=? WHERE guild_id=? AND user_id=?`, [newBalance, message.guild.id, message.author.id]);
    await run(`INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
      [message.guild.id, message.author.id, "blackjack", winnings, `Blackjack natural (bet ${bet})`]);
    await message.reply({ embeds: [{ color: 0xf1c40f, title: "🃏 BLACKJACK!", description: `${showState(true)}\n\n🎉 Natural blackjack! You win **${winnings} ${economySettings.currency_name}** (2.5x)!` }] }).catch(() => {});
    return;
  }

  const gameMsg = await message.reply({ embeds: [new EmbedBuilder().setColor(0x2d6a4f).setTitle("🃏 Blackjack").setDescription(
    `${showState()}\n\nType \`hit\` to draw a card or \`stand\` to hold (30 seconds)`
  )] }).catch(() => null);
  if (!gameMsg) return;

  let playerBust = false;
  const filter = m => m.author.id === message.author.id && ["hit","stand","h","s"].includes(m.content.toLowerCase());
  const collector = message.channel.createMessageCollector({ filter, time: 30000 });

  collector.on("collect", async m => {
    const act = m.content.toLowerCase();
    if (act === "hit" || act === "h") {
      playerHand.push(deck.pop());
      const pVal = bjHandValue(playerHand);
      if (pVal > 21) {
        playerBust = true;
        collector.stop("bust");
        return;
      }
      if (pVal === 21) { collector.stop("stand"); return; }
      await m.reply({ embeds: [{ color: 0x3498db, description: `${showState()}\n\nType \`hit\` or \`stand\`` }] }).catch(() => {});
    } else {
      collector.stop("stand");
    }
  });

  collector.on("end", async (collected, reason) => {
    if (reason === "time" && !playerBust) reason = "stand";

    // Dealer plays
    while (bjHandValue(dealerHand) < 17) dealerHand.push(deck.pop());

    const pVal = bjHandValue(playerHand);
    const dVal = bjHandValue(dealerHand);
    let result, winnings, color;

    if (playerBust) {
      result = `💥 You busted (${pVal})! Dealer wins.`;
      winnings = -bet;
      color = 0xe74c3c;
    } else if (dVal > 21 || pVal > dVal) {
      result = `✅ You win! (${pVal} vs ${dVal})`;
      winnings = bet;
      color = 0x2ecc71;
    } else if (pVal === dVal) {
      result = `🤝 Push! (${pVal} vs ${dVal}) — Bet returned.`;
      winnings = 0;
      color = 0xf1c40f;
    } else {
      result = `❌ Dealer wins! (${pVal} vs ${dVal})`;
      winnings = -bet;
      color = 0xe74c3c;
    }

    const newBalance = economy.balance + winnings;
    await run(`UPDATE user_economy SET balance=? WHERE guild_id=? AND user_id=?`, [newBalance, message.guild.id, message.author.id]);
    if (winnings !== 0) {
      await run(`INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
        [message.guild.id, message.author.id, "blackjack", winnings, `Blackjack (bet ${bet})`]);
    }

    await message.reply({ embeds: [{ color, title: "🃏 Blackjack — Result", description: `${showState(true)}\n\n${result}`, fields: [{ name: "Balance", value: `${newBalance} ${economySettings.currency_name}`, inline: true }] }] }).catch(() => {});
  });
}

// ─────────────────────────────────────────────────────
// ECONOMY: HIGH-LOW
// ─────────────────────────────────────────────────────

async function cmdHighLow(message, args) {
  const economySettings = await getEconomySettings(message.guild.id);
  if (!economySettings?.enabled) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Economy system is disabled." }] }).catch(() => {});
    return;
  }

  const ecoPrefix = economySettings.economy_prefix || "$";
  await run(`INSERT INTO user_economy (guild_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING`, [message.guild.id, message.author.id]);
  const economy = await get(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`, [message.guild.id, message.author.id]);

  if (!args[0]) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(0xe67e22).setTitle("📈 High-Low").setDescription(
      `Guess if the next number is higher or lower!\n\n**Usage:** \`${ecoPrefix}highlow <bet> <higher|lower>\`\n\n**Payout:** 1.9x (house edge: 10%)\n\n**Your Balance:** ${economy.balance} ${economySettings.currency_name}`
    )] }).catch(() => {});
    return;
  }

  const bet = parseInt(args[0]);
  if (isNaN(bet) || bet <= 0) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Invalid bet amount." }] }).catch(() => {}); return;
  }
  if (economy.balance < bet) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: `❌ You don't have enough ${economySettings.currency_name}!` }] }).catch(() => {}); return;
  }

  const choice = args[1]?.toLowerCase();
  if (!["higher","lower","h","l","high","low"].includes(choice)) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Choose `higher` or `lower`." }] }).catch(() => {}); return;
  }
  const guessHigher = ["higher","h","high"].includes(choice);

  const first = Math.floor(Math.random() * 10) + 1; // 1-10
  const second = Math.floor(Math.random() * 10) + 1;

  // Tie = house wins
  const actuallyHigher = second > first;
  const won = guessHigher ? actuallyHigher : !actuallyHigher;

  const winnings = won ? Math.floor(bet * 0.9) : -bet;
  const newBalance = economy.balance + winnings;
  await run(`UPDATE user_economy SET balance=? WHERE guild_id=? AND user_id=?`, [newBalance, message.guild.id, message.author.id]);
  await run(`INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
    [message.guild.id, message.author.id, "highlow", winnings, `High-Low (bet ${bet})`]);

  await message.reply({ embeds: [{
    color: won ? 0x2ecc71 : 0xe74c3c,
    title: "📈 High-Low",
    description: `First number: **${first}**\nSecond number: **${second}**\n\nYou guessed **${guessHigher ? "higher" : "lower"}**\n${won ? `✅ Correct! +**${winnings} ${economySettings.currency_name}**` : `❌ Wrong! -**${bet} ${economySettings.currency_name}**`}`,
    fields: [{ name: "Balance", value: `${newBalance} ${economySettings.currency_name}`, inline: true }]
  }] }).catch(() => {});
}

module.exports = {
  cmdBalance,
  cmdDaily,
  cmdWeekly,
  cmdPay,
  cmdEcoLeaderboard,
  cmdDeposit,
  cmdWithdraw,
  cmdRob,
  cmdSlots,
  cmdCoinflip,
  cmdDice,
  cmdJob,
  cmdWork,
  cmdShop,
  cmdBuy,
  cmdInventory,
  cmdEcoAdmin,
  cmdTrade,
  cmdLottery,
  cmdRoulette,
  cmdBlackjack,
  cmdHighLow,
};

