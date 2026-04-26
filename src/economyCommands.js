// src/economyCommands.js
// Economy commands extracted from commands.js
// Covers: balance, daily, weekly, pay, leaderboard, deposit, withdraw, rob, slots, coinflip, dice, job, work, shop, buy, inventory

const { EmbedBuilder } = require("discord.js");
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

// ─────────────────────────────────────────────────────
// ECONOMY: BALANCE & REWARDS
// ─────────────────────────────────────────────────────

async function cmdBalance(message, args) {
  const economySettings = await get(`SELECT * FROM economy_settings WHERE guild_id=?`, [message.guild.id]);
  if (!economySettings || !economySettings.enabled) {
    await message.reply("❌ Economy system is disabled on this server.").catch(() => {});
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
  const economySettings = await get(`SELECT * FROM economy_settings WHERE guild_id=?`, [message.guild.id]);
  if (!economySettings || !economySettings.enabled) {
    await message.reply("❌ Economy system is disabled on this server.").catch(() => {});
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
    await message.reply(`⏰ You already claimed your daily reward! Come back in ${hours}h ${minutes}m.\n🔥 Current streak: **${economy.daily_streak || 0}** days`).catch(() => {});
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
  const economySettings = await get(`SELECT * FROM economy_settings WHERE guild_id=?`, [message.guild.id]);
  if (!economySettings || !economySettings.enabled) {
    await message.reply("❌ Economy system is disabled on this server.").catch(() => {});
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
    await message.reply(`⏰ You already claimed your weekly reward! Come back in ${days}d ${hours}h.`).catch(() => {});
    return;
  }

  const newBalance = economy.balance + economySettings.weekly_amount;
  await run(`UPDATE user_economy SET balance=?, last_weekly=? WHERE guild_id=? AND user_id=?`, [newBalance, now, message.guild.id, message.author.id]);

  await run(`INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
    [message.guild.id, message.author.id, "weekly", economySettings.weekly_amount, "Weekly reward"]);

  await message.reply(`✅ You claimed your weekly reward of ${economySettings.weekly_amount} ${economySettings.currency_name}! ${economySettings.currency_symbol}`).catch(() => {});
}

async function cmdPay(message, args) {
  const economySettings = await get(`SELECT * FROM economy_settings WHERE guild_id=?`, [message.guild.id]);
  if (!economySettings || !economySettings.enabled) {
    await message.reply("❌ Economy system is disabled on this server.").catch(() => {});
    return;
  }

  await run(`INSERT INTO user_economy (guild_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING`, [message.guild.id, message.author.id]);
  const senderEcon = await get(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`, [message.guild.id, message.author.id]);

  if (args.length < 2) {
    const ecoPrefix = economySettings.economy_prefix || "$";
    await message.reply(`💸 **Pay Another User**\n\nTransfer money from your wallet to another user.\n\n**Usage:** \`${ecoPrefix}pay @user <amount>\`\n**Example:** \`${ecoPrefix}pay @John 500\`\n\n**Your Balance:** ${senderEcon.balance} ${economySettings.currency_name}`).catch(() => {});
    return;
  }

  const target = await pickUserSmart(message, args[0]);
  if (!target || target.ambiguous || target.member.user.bot) {
    await message.reply("❌ Invalid user or cannot pay bots.").catch(() => {});
    return;
  }

  const amount = Number.parseInt(args[1], 10);
  if (!Number.isFinite(amount) || amount <= 0) {
    await message.reply("❌ Invalid amount.").catch(() => {});
    return;
  }

  await run(`INSERT INTO user_economy (guild_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING`, [message.guild.id, target.member.id]);

  if (senderEcon.balance < amount) {
    await message.reply(`❌ You don't have enough ${economySettings.currency_name}!`).catch(() => {});
    return;
  }

  await run(`UPDATE user_economy SET balance=balance-? WHERE guild_id=? AND user_id=?`, [amount, message.guild.id, message.author.id]);
  await run(`UPDATE user_economy SET balance=balance+? WHERE guild_id=? AND user_id=?`, [amount, message.guild.id, target.member.id]);

  await run(`INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
    [message.guild.id, message.author.id, "pay_sent", -amount, `Paid to ${target.member.user.tag}`]);
  await run(`INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
    [message.guild.id, target.member.id, "pay_received", amount, `Received from ${message.author.tag}`]);

  await message.reply(`✅ You paid ${amount} ${economySettings.currency_name} to ${target.member}! ${economySettings.currency_symbol}`).catch(() => {});
}

async function cmdEcoLeaderboard(message) {
  const economySettings = await get(`SELECT * FROM economy_settings WHERE guild_id=?`, [message.guild.id]);
  if (!economySettings || !economySettings.enabled) {
    await message.reply("❌ Economy system is disabled on this server.").catch(() => {});
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
    await message.reply("No economy data yet!").catch(() => {});
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
  const economySettings = await get(`SELECT * FROM economy_settings WHERE guild_id=?`, [message.guild.id]);
  if (!economySettings || !economySettings.enabled) {
    await message.reply("❌ Economy system is disabled on this server.").catch(() => {});
    return;
  }

  await run(`INSERT INTO user_economy (guild_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING`, [message.guild.id, message.author.id]);
  const economy = await get(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`, [message.guild.id, message.author.id]);

  if (!args[0]) {
    const ecoPrefix = economySettings.economy_prefix || "$";
    await message.reply(`💰 **Deposit Money to Bank**\n\nMove money from your wallet to your bank for safekeeping.\n\n**Usage:**\n\`${ecoPrefix}deposit <amount>\` - Deposit specific amount\n\`${ecoPrefix}deposit all\` - Deposit everything\n\n**Your Balance:**\n💵 Wallet: ${economy.balance} ${economySettings.currency_name}\n🏦 Bank: ${economy.bank} ${economySettings.currency_name}`).catch(() => {});
    return;
  }

  let amount;
  if (args[0]?.toLowerCase() === "all") {
    amount = economy.balance;
  } else {
    amount = parseInt(args[0]);
    if (isNaN(amount) || amount <= 0) {
      await message.reply("❌ Please specify a valid amount or 'all'.").catch(() => {});
      return;
    }
  }

  if (economy.balance < amount) {
    await message.reply(`❌ You only have ${economy.balance} ${economySettings.currency_name} in your wallet!`).catch(() => {});
    return;
  }

  await run(`UPDATE user_economy SET balance=?, bank=? WHERE guild_id=? AND user_id=?`,
    [economy.balance - amount, economy.bank + amount, message.guild.id, message.author.id]);
  await run(`INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
    [message.guild.id, message.author.id, "deposit", amount, "Bank deposit"]);

  await message.reply(`✅ Deposited ${amount} ${economySettings.currency_name} to your bank. 🏦`).catch(() => {});
}

async function cmdWithdraw(message, args) {
  const economySettings = await get(`SELECT * FROM economy_settings WHERE guild_id=?`, [message.guild.id]);
  if (!economySettings || !economySettings.enabled) {
    await message.reply("❌ Economy system is disabled on this server.").catch(() => {});
    return;
  }

  await run(`INSERT INTO user_economy (guild_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING`, [message.guild.id, message.author.id]);
  const economy = await get(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`, [message.guild.id, message.author.id]);

  if (!args[0]) {
    const ecoPrefix = economySettings.economy_prefix || "$";
    await message.reply(`💰 **Withdraw Money from Bank**\n\nMove money from your bank to your wallet.\n\n**Usage:**\n\`${ecoPrefix}withdraw <amount>\` - Withdraw specific amount\n\`${ecoPrefix}withdraw all\` - Withdraw everything\n\n**Your Balance:**\n💵 Wallet: ${economy.balance} ${economySettings.currency_name}\n🏦 Bank: ${economy.bank} ${economySettings.currency_name}`).catch(() => {});
    return;
  }

  let amount;
  if (args[0]?.toLowerCase() === "all") {
    amount = economy.bank;
  } else {
    amount = parseInt(args[0]);
    if (isNaN(amount) || amount <= 0) {
      await message.reply("❌ Please specify a valid amount or 'all'.").catch(() => {});
      return;
    }
  }

  if (economy.bank < amount) {
    await message.reply(`❌ You only have ${economy.bank} ${economySettings.currency_name} in your bank!`).catch(() => {});
    return;
  }

  await run(`UPDATE user_economy SET balance=?, bank=? WHERE guild_id=? AND user_id=?`,
    [economy.balance + amount, economy.bank - amount, message.guild.id, message.author.id]);
  await run(`INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
    [message.guild.id, message.author.id, "withdraw", amount, "Bank withdrawal"]);

  await message.reply(`✅ Withdrew ${amount} ${economySettings.currency_name} from your bank. 💵`).catch(() => {});
}

// ─────────────────────────────────────────────────────
// ECONOMY: ROB
// ─────────────────────────────────────────────────────

async function cmdRob(message, args) {
  const economySettings = await get(`SELECT * FROM economy_settings WHERE guild_id=?`, [message.guild.id]);
  if (!economySettings || !economySettings.enabled || !economySettings.rob_enabled) {
    await message.reply("❌ Robbing is disabled on this server.").catch(() => {});
    return;
  }

  if (!args[0]) {
    const ecoPrefix = economySettings.economy_prefix || "$";
    const cooldownMins = Math.floor((economySettings.rob_cooldown || 3600) / 60);
    await message.reply(`💰 **Rob Another User**\n\nAttempt to steal money from another user's wallet! (50% success rate)\n\n**Usage:** \`${ecoPrefix}rob @user\`\n\n**Rules:**\n• 50% chance to succeed\n• If caught, you pay a fine\n• Users with 🔒 Padlock are protected\n• Cooldown: ${cooldownMins} minutes\n• Target must have at least 50 ${economySettings.currency_name}\n\n**Tip:** Buy a padlock from the shop to protect yourself!`).catch(() => {});
    return;
  }

  const targetResult = parseUserMentionSimple(message, args[0]);
  if (!targetResult.found || targetResult.member.user.bot || targetResult.member.id === message.author.id) {
    await message.reply("❌ Please mention a valid user to rob.").catch(() => {});
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
    await message.reply(`❌ You must wait ${minutes} minutes before robbing again!`).catch(() => {});
    return;
  }

  const padlock = await get(`SELECT * FROM user_inventory WHERE guild_id=? AND user_id=? AND item_id='padlock' AND quantity > 0`,
    [message.guild.id, target.member.id]);
  if (padlock) {
    await run(`UPDATE user_inventory SET quantity=quantity-1 WHERE guild_id=? AND user_id=? AND item_id='padlock'`,
      [message.guild.id, target.member.id]);
    await message.reply(`❌ ${target.member} had a 🔒 **Padlock** protecting their wallet! It broke when you tried to rob them.`).catch(() => {});
    await run(`UPDATE user_economy SET last_normal_rob=? WHERE guild_id=? AND user_id=?`, [now, message.guild.id, message.author.id]);
    return;
  }

  if (victim.balance < 50) {
    await message.reply(`❌ ${target.member} is too poor to rob! (less than 50 ${economySettings.currency_name})`).catch(() => {});
    return;
  }

  const success = Math.random() < 0.5;
  if (!success) {
    const fine = Math.min(robber.balance, Math.floor(victim.balance * 0.3));
    await run(`UPDATE user_economy SET balance=?, last_normal_rob=? WHERE guild_id=? AND user_id=?`,
      [robber.balance - fine, now, message.guild.id, message.author.id]);
    await run(`INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
      [message.guild.id, message.author.id, "rob_failed", -fine, `Failed to rob ${target.member.user.tag}`]);
    await message.reply(`❌ You got caught trying to rob ${target.member}! You paid a fine of ${fine} ${economySettings.currency_name}.`).catch(() => {});
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

  await message.reply(`✅ You successfully robbed ${stolen} ${economySettings.currency_name} from ${target.member}! 💰`).catch(() => {});
}

// ─────────────────────────────────────────────────────
// ECONOMY: GAMBLING
// ─────────────────────────────────────────────────────

async function cmdSlots(message, args) {
  const economySettings = await get(`SELECT * FROM economy_settings WHERE guild_id=?`, [message.guild.id]);
  if (!economySettings || !economySettings.enabled) {
    await message.reply("❌ Economy system is disabled on this server.").catch(() => {});
    return;
  }

  await run(`INSERT INTO user_economy (guild_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING`, [message.guild.id, message.author.id]);
  const economy = await get(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`, [message.guild.id, message.author.id]);

  if (!args[0]) {
    const ecoPrefix = economySettings.economy_prefix || "$";
    await message.reply(`🎰 **Slot Machine**\n\nSpin the slots and win big!\n\n**Usage:** \`${ecoPrefix}slots <bet>\`\n\n**Payouts:**\n🎉 Triple Match: 3x\n💎 Triple Diamonds: 5x\n7️⃣ Triple Sevens: 10x (JACKPOT!)\n🎯 Double Match: 1.5x\n\n**Your Balance:** ${economy.balance} ${economySettings.currency_name}`).catch(() => {});
    return;
  }

  const bet = parseInt(args[0]);
  if (isNaN(bet) || bet <= 0) {
    await message.reply("❌ Please specify a valid bet amount.").catch(() => {});
    return;
  }

  if (economy.balance < bet) {
    await message.reply(`❌ You don't have enough ${economySettings.currency_name}!`).catch(() => {});
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
  const economySettings = await get(`SELECT * FROM economy_settings WHERE guild_id=?`, [message.guild.id]);
  if (!economySettings || !economySettings.enabled) {
    await message.reply("❌ Economy system is disabled on this server.").catch(() => {});
    return;
  }

  await run(`INSERT INTO user_economy (guild_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING`, [message.guild.id, message.author.id]);
  const economy = await get(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`, [message.guild.id, message.author.id]);

  if (!args[0] || !args[1]) {
    const ecoPrefix = economySettings.economy_prefix || "$";
    await message.reply(`🪙 **Coinflip**\n\nBet on heads or tails! Double your money or lose it all.\n\n**Usage:** \`${ecoPrefix}coinflip <bet> <heads/tails>\`\n**Example:** \`${ecoPrefix}coinflip 100 h\`\n\n**Choices:** heads, tails, h, t\n**Payout:** 2x your bet\n\n**Your Balance:** ${economy.balance} ${economySettings.currency_name}`).catch(() => {});
    return;
  }

  const bet = parseInt(args[0]);
  const choice = args[1]?.toLowerCase();

  if (isNaN(bet) || bet <= 0) {
    await message.reply("❌ Please specify a valid bet amount.").catch(() => {});
    return;
  }

  if (!["heads", "tails", "h", "t"].includes(choice)) {
    await message.reply("❌ Please choose heads (h) or tails (t).").catch(() => {});
    return;
  }

  if (economy.balance < bet) {
    await message.reply(`❌ You don't have enough ${economySettings.currency_name}!`).catch(() => {});
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
  const economySettings = await get(`SELECT * FROM economy_settings WHERE guild_id=?`, [message.guild.id]);
  if (!economySettings || !economySettings.enabled) {
    await message.reply("❌ Economy system is disabled on this server.").catch(() => {});
    return;
  }

  await run(`INSERT INTO user_economy (guild_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING`, [message.guild.id, message.author.id]);
  const economy = await get(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`, [message.guild.id, message.author.id]);

  if (!args[0] || !args[1]) {
    const ecoPrefix = economySettings.economy_prefix || "$";
    await message.reply(`🎲 **Dice Roll**\n\nGuess the dice roll (1-6) and win 6x your bet!\n\n**Usage:** \`${ecoPrefix}dice <bet> <guess>\`\n**Example:** \`${ecoPrefix}dice 100 5\`\n\n**Payout:** 6x your bet if you guess correctly\n\n**Your Balance:** ${economy.balance} ${economySettings.currency_name}`).catch(() => {});
    return;
  }

  const bet = parseInt(args[0]);
  const guess = parseInt(args[1]);

  if (isNaN(bet) || bet <= 0) {
    await message.reply("❌ Please specify a valid bet amount.").catch(() => {});
    return;
  }

  if (isNaN(guess) || guess < 1 || guess > 6) {
    await message.reply("❌ Please guess a number between 1 and 6.").catch(() => {});
    return;
  }

  if (economy.balance < bet) {
    await message.reply(`❌ You don't have enough ${economySettings.currency_name}!`).catch(() => {});
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
  const economySettings = await get(`SELECT * FROM economy_settings WHERE guild_id=?`, [message.guild.id]);
  if (!economySettings || !economySettings.enabled) {
    await message.reply("❌ Economy system is disabled on this server.").catch(() => {});
    return;
  }

  const subcommand = args[0]?.toLowerCase();

  if (!subcommand || subcommand === "list") {
    const jobs = await all(`SELECT * FROM economy_jobs WHERE guild_id=? ORDER BY min_pay ASC`, [message.guild.id]);
    if (jobs.length === 0) {
      await message.reply("❌ No jobs available! Ask an admin to add some.").catch(() => {});
      return;
    }

    const embed = {
      color: 0x3498db,
      title: "💼 Available Jobs",
      description: jobs.map(j =>
        `**${j.name}**\n💰 Pay: ${j.min_pay}-${j.max_pay} ${economySettings.currency_name}\n📊 Requires: ${j.required_shifts} total shifts\n⏰ Weekly: ${j.weekly_shifts_required} shifts/week`
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
      await message.reply("❌ Please specify a job name.").catch(() => {});
      return;
    }

    const job = await get(`SELECT * FROM economy_jobs WHERE guild_id=? AND LOWER(name)=LOWER(?)`, [message.guild.id, jobName]);
    if (!job) {
      await message.reply("❌ That job doesn't exist! Use `job list` to see available jobs.").catch(() => {});
      return;
    }

    if (economy.job_id) {
      await message.reply("❌ You already have a job! Use `job quit` first.").catch(() => {});
      return;
    }

    if (economy.job_shifts_completed < job.required_shifts) {
      await message.reply(`❌ You need ${job.required_shifts} total shifts completed to apply for this job! (You have ${economy.job_shifts_completed})`).catch(() => {});
      return;
    }

    await run(`UPDATE user_economy SET job_id=?, job_weekly_shifts=0, job_week_reset=? WHERE guild_id=? AND user_id=?`,
      [job.id, Date.now(), message.guild.id, message.author.id]);

    await message.reply(`✅ Congratulations! You got the job as **${job.name}**! Start working with the \`work\` command.`).catch(() => {});
    return;
  }

  if (subcommand === "quit") {
    if (!economy.job_id) {
      await message.reply("❌ You don't have a job!").catch(() => {});
      return;
    }
    await run(`UPDATE user_economy SET job_id=NULL, job_weekly_shifts=0 WHERE guild_id=? AND user_id=?`, [message.guild.id, message.author.id]);
    await message.reply("✅ You quit your job.").catch(() => {});
    return;
  }

  if (subcommand === "info") {
    if (!economy.job_id) {
      await message.reply("❌ You don't have a job! Use `job list` to see available jobs.").catch(() => {});
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
        { name: "💰 Pay Range", value: `${job.min_pay}-${job.max_pay} ${economySettings.currency_name}`, inline: true },
        { name: "📊 Total Shifts", value: `${economy.job_shifts_completed}`, inline: true },
        { name: "⏰ This Week", value: `${economy.job_weekly_shifts}/${job.weekly_shifts_required}`, inline: true },
        { name: "📅 Week Resets In", value: `${daysLeft} days`, inline: true }
      ],
      footer: { text: `Use the work command to complete a shift!` }
    };

    await message.reply({ embeds: [embed] }).catch(() => {});
    return;
  }

  await message.reply("❌ Usage: `job list`, `job apply <name>`, `job quit`, or `job info`").catch(() => {});
}

async function cmdWork(message) {
  const economySettings = await get(`SELECT * FROM economy_settings WHERE guild_id=?`, [message.guild.id]);
  if (!economySettings || !economySettings.enabled) {
    await message.reply("❌ Economy system is disabled on this server.").catch(() => {});
    return;
  }

  await run(`INSERT INTO user_economy (guild_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING`, [message.guild.id, message.author.id]);
  const economy = await get(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`, [message.guild.id, message.author.id]);

  if (!economy.job_id) {
    await message.reply("❌ You don't have a job! Use `job apply <name>` to get one.").catch(() => {});
    return;
  }

  const now = Date.now();
  const shiftCooldown = 3600000;
  if (economy.job_last_shift && (now - economy.job_last_shift) < shiftCooldown) {
    const timeLeft = shiftCooldown - (now - economy.job_last_shift);
    const minutes = Math.floor(timeLeft / 60000);
    await message.reply(`❌ You're tired! Rest for ${minutes} more minutes before your next shift.`).catch(() => {});
    return;
  }

  const job = await get(`SELECT * FROM economy_jobs WHERE id=?`, [economy.job_id]);

  const weekInMs = 604800000;
  if (now - economy.job_week_reset > weekInMs) {
    if (economy.job_weekly_shifts < job.weekly_shifts_required) {
      await run(`UPDATE user_economy SET job_id=NULL, job_weekly_shifts=0, job_week_reset=NULL WHERE guild_id=? AND user_id=?`,
        [message.guild.id, message.author.id]);
      await message.reply(`❌ You were fired from **${job.name}** for not completing ${job.weekly_shifts_required} shifts last week!`).catch(() => {});
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
    await message.reply(`⌨️ **Typing Challenge!**\nType the following word within 15 seconds:\n\`\`\`${word}\`\`\``).catch(() => {});
    const filter = m => m.author.id === message.author.id && m.content.toLowerCase() === word.toLowerCase();
    const collected = await message.channel.awaitMessages({ filter, max: 1, time: 15000, errors: ["time"] }).catch(() => null);
    if (!collected || collected.size === 0) {
      await message.reply("❌ Time's up! You failed the shift.").catch(() => {});
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
    await message.reply(`🎯 **Emoji Challenge!**\nFind and type the **${target}** emoji within 15 seconds:\n${options.join(" ")}`).catch(() => {});
    const filter = m => m.author.id === message.author.id && m.content.includes(target);
    const collected = await message.channel.awaitMessages({ filter, max: 1, time: 15000, errors: ["time"] }).catch(() => null);
    if (!collected || collected.size === 0) {
      await message.reply("❌ Time's up! You failed the shift.").catch(() => {});
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
    await message.reply(`🔢 **Math Challenge!**\nSolve within 15 seconds:\n\`\`\`${num1} ${op} ${num2} = ?\`\`\``).catch(() => {});
    const filter = m => m.author.id === message.author.id && parseInt(m.content) === answer;
    const collected = await message.channel.awaitMessages({ filter, max: 1, time: 15000, errors: ["time"] }).catch(() => null);
    if (!collected || collected.size === 0) {
      await message.reply("❌ Time's up! You failed the shift.").catch(() => {});
      return;
    }
  }

  const pay = Math.floor(job.min_pay + Math.random() * (job.max_pay - job.min_pay));
  await run(`UPDATE user_economy SET balance=?, job_last_shift=?, job_shifts_completed=?, job_weekly_shifts=? WHERE guild_id=? AND user_id=?`,
    [economy.balance + pay, now, economy.job_shifts_completed + 1, economy.job_weekly_shifts + 1, message.guild.id, message.author.id]);
  await run(`INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
    [message.guild.id, message.author.id, "work", pay, `Worked as ${job.name}`]);

  await message.reply(`✅ Shift complete! You earned ${pay} ${economySettings.currency_name}. (${economy.job_weekly_shifts + 1}/${job.weekly_shifts_required} this week)`).catch(() => {});
}

// ─────────────────────────────────────────────────────
// ECONOMY: SHOP
// ─────────────────────────────────────────────────────

async function cmdShop(message) {
  const economySettings = await get(`SELECT * FROM economy_settings WHERE guild_id=?`, [message.guild.id]);
  if (!economySettings || !economySettings.enabled) {
    await message.reply("❌ Economy system is disabled on this server.").catch(() => {});
    return;
  }

  const items = await all(`SELECT * FROM economy_shop_items WHERE guild_id=? ORDER BY price ASC`, [message.guild.id]);
  if (items.length === 0) {
    await message.reply("❌ The shop is empty! Ask an admin to add items.").catch(() => {});
    return;
  }

  const grouped = new Map();
  for (const item of items) {
    const key = item.item_type || "misc";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item);
  }

  const typeEmoji = { tool: "🛠️", consumable: "🧪", material: "🧱", collectible: "🏆", single: "👑", misc: "📦" };

  const lines = [];
  let idx = 1;
  for (const [type, list] of grouped.entries()) {
    lines.push(`\n**${typeEmoji[type] || "📦"} ${type.toUpperCase()}**`);
    for (const item of list) {
      const usable = item.use_effect && !["fishing_rod", "shovel", "prestige_use", "revival_potion"].includes(item.use_effect)
        ? ` | Use: \`use ${item.item_id}\``
        : "";
      lines.push(`**${idx}. ${item.name}** - ${item.price} ${economySettings.currency_name}${usable}`);
      lines.push(`${item.description}`);
      idx += 1;
    }
  }

  const previewItem = items.find((i) => i.item_image_url) || items[0];
  const embed = new EmbedBuilder()
    .setColor(0x1f8b4c)
    .setTitle("🛒 The Murk Grand Bazaar")
    .setDescription(lines.join("\n"))
    .setThumbnail(previewItem?.item_image_url || null)
    .setFooter({ text: `Use buy <item number> to purchase | inspect with item <name>` });

  await message.reply({ embeds: [embed] }).catch(() => {});
}

async function cmdBuy(message, args) {
  const economySettings = await get(`SELECT * FROM economy_settings WHERE guild_id=?`, [message.guild.id]);
  if (!economySettings || !economySettings.enabled) {
    await message.reply("❌ Economy system is disabled on this server.").catch(() => {});
    return;
  }

  if (!args[0]) {
    await cmdShop(message);
    return;
  }

  const itemIndex = parseInt(args[0]) - 1;
  if (isNaN(itemIndex)) {
    await message.reply("❌ Please specify an item number from the shop.").catch(() => {});
    return;
  }

  const items = await all(`SELECT * FROM economy_shop_items WHERE guild_id=? ORDER BY price ASC`, [message.guild.id]);
  const item = items[itemIndex];
  if (!item) {
    await message.reply("❌ Invalid item number!").catch(() => {});
    return;
  }

  await run(`INSERT INTO user_economy (guild_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING`, [message.guild.id, message.author.id]);
  const economy = await get(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`, [message.guild.id, message.author.id]);

  if (economy.balance < item.price) {
    await message.reply(`❌ You need ${item.price} ${economySettings.currency_name} to buy this! You have ${economy.balance}.`).catch(() => {});
    return;
  }

  if (item.item_type === "single") {
    const owned = await get(`SELECT * FROM user_inventory WHERE guild_id=? AND user_id=? AND item_id=?`,
      [message.guild.id, message.author.id, item.item_id]);
    if (owned && owned.quantity > 0) {
      await message.reply("❌ You already own this item!").catch(() => {});
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

  await message.reply(`✅ You bought **${item.name}** for ${item.price} ${economySettings.currency_name}!`).catch(() => {});
}

async function cmdInventory(message) {
  const economySettings = await get(`SELECT * FROM economy_settings WHERE guild_id=?`, [message.guild.id]);
  if (!economySettings || !economySettings.enabled) {
    await message.reply("❌ Economy system is disabled on this server.").catch(() => {});
    return;
  }

  const items = await all(`
    SELECT ui.item_id, ui.quantity, si.name, si.description, si.item_type, si.use_effect, si.item_image_url
    FROM user_inventory ui
    JOIN economy_shop_items si ON ui.item_id = si.item_id AND ui.guild_id = si.guild_id
    WHERE ui.guild_id=? AND ui.user_id=? AND ui.quantity > 0
  `, [message.guild.id, message.author.id]);

  if (items.length === 0) {
    await message.reply("🎒 Your inventory is empty!").catch(() => {});
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
};
