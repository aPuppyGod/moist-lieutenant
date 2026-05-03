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
// In-memory cooldown manager (per-command, per-user+guild)
// ─────────────────────────────────────────────────────
const _ecoCooldowns = new Map();
function checkCd(cmd, guildId, userId, ms) {
  const key = `${cmd}:${guildId}:${userId}`;
  const remaining = ms - (Date.now() - (_ecoCooldowns.get(key) || 0));
  return remaining > 0 ? remaining : 0;
}
function setCd(cmd, guildId, userId) {
  _ecoCooldowns.set(`${cmd}:${guildId}:${userId}`, Date.now());
}
function fmtCd(ms) {
  if (ms < 60000) return `${Math.ceil(ms / 1000)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.ceil((ms % 60000) / 1000)}s`;
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
    title: `${economySettings.currency_symbol} 𝔹𝕒𝕝𝕒𝕟𝕔𝕖`,
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

  const baseAmount = economySettings.daily_amount || 300;
  // Exponential streak scaling: grows faster at higher streaks
  const bonusPerDay = economySettings.daily_streak_bonus || 50;
  const streakBonus = Math.min(Math.floor(bonusPerDay * Math.sqrt(newStreak - 1) * (newStreak - 1) * 0.5 + bonusPerDay * (newStreak - 1)), 5000);

  // Streak milestone bonuses
  let milestoneBonus = 0;
  let milestoneText = "";
  if (newStreak === 7)   { milestoneBonus = 1000; milestoneText = "\n🔥 **7-day streak bonus! +1,000 bonus!**"; }
  if (newStreak === 14)  { milestoneBonus = 2500; milestoneText = "\n🔥 **2-week streak bonus! +2,500 bonus!**"; }
  if (newStreak === 30)  { milestoneBonus = 7500; milestoneText = "\n🌟 **30-day streak bonus! +7,500 bonus!**"; }
  if (newStreak === 100) { milestoneBonus = 25000; milestoneText = "\n👑 **100-day streak! LEGENDARY +25,000 bonus!**"; }
  if (newStreak > 100 && newStreak % 50 === 0) { milestoneBonus = 10000; milestoneText = `\n⚡ **${newStreak}-day streak bonus! +10,000 bonus!**`; }

  // Check buffs that boost daily
  const frogAmulet = await get(`SELECT * FROM user_buffs WHERE guild_id=? AND user_id=? AND buff_id='daily_boost_15' AND expires_at>?`,
    [message.guild.id, message.author.id, now]);
  const frogCrown = await get(`SELECT * FROM user_buffs WHERE guild_id=? AND user_id=? AND buff_id='royal_boost' AND expires_at>?`,
    [message.guild.id, message.author.id, now]);

  let buffMult = 1.0;
  if (frogAmulet) buffMult += 0.15;
  if (frogCrown)  buffMult += 0.25;

  const totalAmount = Math.floor((baseAmount + streakBonus + milestoneBonus) * buffMult);

  // Merchant class passive: 10% daily bank interest
  const userDailyClass = await get(`SELECT class_id FROM user_class WHERE guild_id=? AND user_id=?`, [message.guild.id, message.author.id]);
  let bankInterest = 0;
  let interestText = "";
  if (userDailyClass?.class_id === 'merchant' && economy.bank > 0) {
    bankInterest = Math.floor(economy.bank * 0.10);
    interestText = `\n💼 **Merchant Interest:** +${bankInterest} ${economySettings.currency_name} *(10% of bank)*`;
  }
  const grandTotal = totalAmount + bankInterest;

  const newBalance = economy.balance + grandTotal;
  await run(`UPDATE user_economy SET balance=?, last_daily=?, daily_streak=?, daily_streak_date=? WHERE guild_id=? AND user_id=?`,
    [newBalance, now, newStreak, today, message.guild.id, message.author.id]);

  await run(`INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
    [message.guild.id, message.author.id, "daily", grandTotal, `Daily reward (${newStreak} day streak)`]);

  const buffText = buffMult > 1 ? `\n🍀 **Buff multiplier:** ${buffMult.toFixed(2)}x` : "";
  const embed = {
    color: 0x2ecc71,
    title: `${economySettings.currency_symbol} 𝔻𝕒𝕚𝕝𝕪 ℝ𝕖𝕨𝕒𝕣𝕕`,
    description: `**Base:** ${baseAmount} ${economySettings.currency_name}\n**Streak Bonus:** +${streakBonus} ${economySettings.currency_name}${milestoneBonus > 0 ? `\n**Milestone:** +${milestoneBonus}` : ""}${buffText}${milestoneText}${interestText}`,
    fields: [
      { name: "🔥 Streak", value: `${newStreak} day${newStreak !== 1 ? "s" : ""}`, inline: true },
      { name: "💰 Earned", value: `+${grandTotal} ${economySettings.currency_name}`, inline: true },
      { name: "💳 New Balance", value: `${newBalance} ${economySettings.currency_name}`, inline: true }
    ],
    footer: { text: `Next daily reward ≥ ${Math.floor((baseAmount + Math.min(Math.floor(bonusPerDay * Math.sqrt(newStreak) * newStreak * 0.5 + bonusPerDay * newStreak), 5000)) * buffMult)} ${economySettings.currency_name}` }
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

  const weeklyBase = economySettings.weekly_amount || 2500;

  // Check buffs
  const frogCrown2 = await get(`SELECT * FROM user_buffs WHERE guild_id=? AND user_id=? AND buff_id='royal_boost' AND expires_at>?`,
    [message.guild.id, message.author.id, now]);
  const weeklyMult = frogCrown2 ? 1.25 : 1.0;
  const weeklyTotal = Math.floor(weeklyBase * weeklyMult);

  const newBalance = economy.balance + weeklyTotal;
  await run(`UPDATE user_economy SET balance=?, last_weekly=? WHERE guild_id=? AND user_id=?`, [newBalance, now, message.guild.id, message.author.id]);

  await run(`INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
    [message.guild.id, message.author.id, "weekly", weeklyTotal, "Weekly reward"]);

  const buffLine = frogCrown2 ? "\n👑 **Frog Crown: +25% bonus applied!**" : "";
  await message.reply({ embeds: [{
    color: 0x2ecc71,
    title: `${economySettings.currency_symbol} 𝕎𝕖𝕖𝕜𝕝𝕪 ℝ𝕖𝕨𝕒𝕣𝕕`,
    description: `💰 **+${weeklyTotal} ${economySettings.currency_name}** collected!${buffLine}\n\n**New Balance:** ${newBalance} ${economySettings.currency_name}`,
    footer: { text: "Come back in 7 days for another weekly reward!" }
  }] }).catch(() => {});
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

  const payCd = checkCd('pay', message.guild.id, message.author.id, 30000);
  if (payCd) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: `⏳ Pay is on cooldown! Try again in **${fmtCd(payCd)}**.` }] }).catch(() => {});
    return;
  }

  await run(`INSERT INTO user_economy (guild_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING`, [message.guild.id, target.member.id]);

  if (senderEcon.balance < amount) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: `❌ You don't have enough ${economySettings.currency_name}!` }] }).catch(() => {});
    return;
  }

  setCd('pay', message.guild.id, message.author.id);
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

  const depositCd = checkCd('deposit', message.guild.id, message.author.id, 8000);
  if (depositCd) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: `⏳ Deposit is on cooldown! Try again in **${fmtCd(depositCd)}**.` }] }).catch(() => {});
    return;
  }
  setCd('deposit', message.guild.id, message.author.id);

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

  const withdrawCd = checkCd('withdraw', message.guild.id, message.author.id, 8000);
  if (withdrawCd) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: `⏳ Withdraw is on cooldown! Try again in **${fmtCd(withdrawCd)}**.` }] }).catch(() => {});
    return;
  }
  setCd('withdraw', message.guild.id, message.author.id);

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
  // Brigand class passive: 25% faster rob cooldown
  const robberClass = await get(`SELECT class_id FROM user_class WHERE guild_id=? AND user_id=?`, [message.guild.id, message.author.id]);
  const effectiveCooldown = robberClass?.class_id === 'brigand' ? Math.floor(cooldown * 0.75) : cooldown;
  if (robber.last_normal_rob && (now - robber.last_normal_rob) < effectiveCooldown) {
    const timeLeft = effectiveCooldown - (now - robber.last_normal_rob);
    const minutes = Math.floor(timeLeft / 60000);
    const brigandHint = robberClass?.class_id === 'brigand' ? " *(Brigand: 25% faster cooldown)*" : "";
    await message.reply({ embeds: [{ color: 0xe74c3c, description: `❌ You must wait ${minutes} minutes before robbing again!${brigandHint}` }] }).catch(() => {});
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
  // Bone Armor reduces fine by 50%
  const boneArmorBuff = await get(`SELECT 1 FROM user_buffs WHERE guild_id=? AND user_id=? AND buff_id='bone_armor_50' AND expires_at>?`, [message.guild.id, message.author.id, now]);
  const effectiveFine = boneArmorBuff ? Math.floor(fine * 0.5) : fine;
  const armorNote = boneArmorBuff ? " *(🦴 Bone Armor: 50% off!)*" : "";
  await run(`UPDATE user_economy SET balance=?, last_normal_rob=? WHERE guild_id=? AND user_id=?`,
    [robber.balance - effectiveFine, now, message.guild.id, message.author.id]);
  await run(`INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
    [message.guild.id, message.author.id, "rob_failed", -effectiveFine, `Failed to rob ${target.member.user.tag}`]);
  await message.reply({ embeds: [{ color: 0xe74c3c, description: `❌ You got caught trying to rob ${target.member}! You paid a fine of ${effectiveFine} ${economySettings.currency_name}${armorNote}.` }] }).catch(() => {});
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

  const slotsCd = checkCd('slots', message.guild.id, message.author.id, 15000);
  if (slotsCd) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: `⏳ Slots is on cooldown! Try again in **${fmtCd(slotsCd)}**.` }] }).catch(() => {});
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

  setCd('slots', message.guild.id, message.author.id);
  await run(`UPDATE user_economy SET balance=? WHERE guild_id=? AND user_id=?`, [newBalance, message.guild.id, message.author.id]);
  await run(`INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
    [message.guild.id, message.author.id, "slots", winnings, `Slots (bet ${bet})`]);

  const embed = {
    color: winnings > 0 ? 0x2ecc71 : 0xe74c3c,
    title: "🎰 𝕊𝕝𝕠𝕥 𝕄𝕒𝕔𝕙𝕚𝕟𝕖",
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

  const cfCd = checkCd('coinflip', message.guild.id, message.author.id, 10000);
  if (cfCd) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: `⏳ Coinflip is on cooldown! Try again in **${fmtCd(cfCd)}**.` }] }).catch(() => {});
    return;
  }

  const flip = Math.random() < 0.5 ? "heads" : "tails";
  const userChoice = choice === "h" ? "heads" : choice === "t" ? "tails" : choice;
  const won = flip === userChoice;
  const winnings = won ? bet : -bet;
  const newBalance = economy.balance + winnings;

  setCd('coinflip', message.guild.id, message.author.id);
  await run(`UPDATE user_economy SET balance=? WHERE guild_id=? AND user_id=?`, [newBalance, message.guild.id, message.author.id]);
  await run(`INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
    [message.guild.id, message.author.id, "coinflip", winnings, `Coinflip ${flip} (bet ${bet})`]);

  const embed = {
    color: won ? 0x2ecc71 : 0xe74c3c,
    title: "🪙 ℂ𝕠𝕚𝕟𝕗𝕝𝕚𝕡",
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

  const diceCd = checkCd('dice', message.guild.id, message.author.id, 10000);
  if (diceCd) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: `⏳ Dice is on cooldown! Try again in **${fmtCd(diceCd)}**.` }] }).catch(() => {});
    return;
  }

  const roll = Math.floor(Math.random() * 6) + 1;
  const won = roll === guess;
  const winnings = won ? bet * 5 : -bet;
  const newBalance = economy.balance + winnings;

  setCd('dice', message.guild.id, message.author.id);
  await run(`UPDATE user_economy SET balance=? WHERE guild_id=? AND user_id=?`, [newBalance, message.guild.id, message.author.id]);
  await run(`INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
    [message.guild.id, message.author.id, "dice", winnings, `Dice ${roll} (bet ${bet})`]);

  const embed = {
    color: won ? 0x2ecc71 : 0xe74c3c,
    title: "🎲 𝔻𝕚𝕔𝕖 ℝ𝕠𝕝𝕝",
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
      title: "💼 𝔸𝕧𝕒𝕚𝕝𝕒𝕓𝕝𝕖 𝕁𝕠𝕓𝕤",
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
    const jobName = args.slice(1).join(" ").trim();
    if (!jobName) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Please specify a job name." }] }).catch(() => {});
      return;
    }

    // Strip leading emoji characters so users can type 'Swamp Sweeper' or '🧹 Swamp Sweeper'
    const stripEmoji = s => s.replace(/^[\p{Emoji}\s]+/u, "").trim();

    // Try exact match first, then emoji-stripped match
    let job = await get(`SELECT * FROM economy_jobs WHERE guild_id=? AND LOWER(name)=LOWER(?)`, [message.guild.id, jobName]);
    if (!job) {
      // Match against name with leading emoji stripped from DB value
      const allJobs = await all(`SELECT * FROM economy_jobs WHERE guild_id=?`, [message.guild.id]);
      job = allJobs.find(j => stripEmoji(j.name).toLowerCase() === jobName.toLowerCase())
             || allJobs.find(j => stripEmoji(j.name).toLowerCase().includes(jobName.toLowerCase()));
    }
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

  const basePay = Math.floor(job.pay_min + Math.random() * (job.pay_max - job.pay_min));

  // Apply work buffs
  const bonusBuff = await get(`SELECT * FROM user_buffs WHERE guild_id=? AND user_id=? AND buff_id='work_bonus_25' AND expires_at>?`,
    [message.guild.id, message.author.id, now]);
  const boostBuff = await get(`SELECT * FROM user_buffs WHERE guild_id=? AND user_id=? AND buff_id='work_boost_30' AND expires_at>?`,
    [message.guild.id, message.author.id, now]);
  const globalBoost = await get(`SELECT * FROM user_buffs WHERE guild_id=? AND user_id=? AND buff_id='global_boost_15' AND expires_at>?`,
    [message.guild.id, message.author.id, now]);

  let payMult = 1.0;
  if (bonusBuff)  payMult += 0.25;
  if (boostBuff)  payMult += 0.30;
  if (globalBoost) payMult += 0.15;

  const pay = Math.floor(basePay * payMult);
  const buffNote = payMult > 1 ? ` *(×${payMult.toFixed(2)} buff)*` : "";

  await run(`UPDATE user_economy SET balance=?, job_last_shift=?, job_shifts_completed=?, job_weekly_shifts=? WHERE guild_id=? AND user_id=?`,
    [economy.balance + pay, now, economy.job_shifts_completed + 1, economy.job_weekly_shifts + 1, message.guild.id, message.author.id]);
  await run(`INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
    [message.guild.id, message.author.id, "work", pay, `Worked as ${job.name}`]);

  await message.reply({ embeds: [{ color: 0x2ecc71, description: `✅ Shift complete! You earned **${pay}** ${economySettings.currency_name}${buffNote} (${economy.job_weekly_shifts + 1}/${job.weekly_shifts_required} this week)` }] }).catch(() => {});
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

  // Artificer class passive: 20% shop discount
  const buyerClass = await get(`SELECT class_id FROM user_class WHERE guild_id=? AND user_id=?`, [message.guild.id, message.author.id]);
  const finalPrice = buyerClass?.class_id === 'artificer' ? Math.floor(item.price * 0.8) : item.price;
  const discountNote = buyerClass?.class_id === 'artificer' ? ` *(20% Artificer discount!)*` : "";

  if (economy.balance < finalPrice) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: `❌ You need ${finalPrice} ${economySettings.currency_name} to buy this! You have ${economy.balance}.` }] }).catch(() => {});
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

  const buyCd = checkCd('buy', message.guild.id, message.author.id, 8000);
  if (buyCd) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: `⏳ Shop is on cooldown! Try again in **${fmtCd(buyCd)}**.` }] }).catch(() => {});
    return;
  }
  setCd('buy', message.guild.id, message.author.id);

  await run(`UPDATE user_economy SET balance=? WHERE guild_id=? AND user_id=?`, [economy.balance - finalPrice, message.guild.id, message.author.id]);
  await run(`INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
    [message.guild.id, message.author.id, "shop_purchase", -finalPrice, `Bought ${item.name}`]);

  await run(`
    INSERT INTO user_inventory (guild_id, user_id, item_id, quantity)
    VALUES (?, ?, ?, 1)
    ON CONFLICT (guild_id, user_id, item_id)
    DO UPDATE SET quantity = user_inventory.quantity + 1
  `, [message.guild.id, message.author.id, item.item_id]);

  await message.reply({ embeds: [{ color: 0x2ecc71, description: `✅ You bought **${item.name}** for ${finalPrice} ${economySettings.currency_name}!${discountNote}` }] }).catch(() => {});
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
    const tradeCd = checkCd('trade', guildId, userId, 60000);
    if (tradeCd) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: `⏳ Trade is on cooldown! Try again in **${fmtCd(tradeCd)}**.` }] }).catch(() => {});
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

    setCd('trade', guildId, userId);
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

    const lotteryCd = checkCd('lottery', guildId, userId, 20000);
    if (lotteryCd) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: `⏳ Lottery is on cooldown! Try again in **${fmtCd(lotteryCd)}**.` }] }).catch(() => {});
      return;
    }
    setCd('lottery', guildId, userId);

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
    await message.reply({ embeds: [new EmbedBuilder().setColor(0x8e44ad).setTitle("🎡 ℝ𝕠𝕦𝕝𝕖𝕥𝕥𝕖").setDescription(
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

  const rouletteCd = checkCd('roulette', message.guild.id, message.author.id, 15000);
  if (rouletteCd) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: `⏳ Roulette is on cooldown! Try again in **${fmtCd(rouletteCd)}**.` }] }).catch(() => {}); return;
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
  setCd('roulette', message.guild.id, message.author.id);
  await run(`UPDATE user_economy SET balance=? WHERE guild_id=? AND user_id=?`, [newBalance, message.guild.id, message.author.id]);
  await run(`INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
    [message.guild.id, message.author.id, "roulette", winnings, `Roulette ${spin} (bet ${bet} on ${choice})`]);

  const embed = {
    color: won ? 0x2ecc71 : 0xe74c3c,
    title: "🎡 ℝ𝕠𝕦𝕝𝕖𝕥𝕥𝕖",
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
    await message.reply({ embeds: [new EmbedBuilder().setColor(0x2d6a4f).setTitle("🃏 𝔹𝕝𝕒𝕔𝕜𝕛𝕒𝕔𝕜").setDescription(
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

  const bjCd = checkCd('blackjack', message.guild.id, message.author.id, 45000);
  if (bjCd) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: `⏳ Blackjack is on cooldown! Try again in **${fmtCd(bjCd)}**.` }] }).catch(() => {}); return;
  }
  setCd('blackjack', message.guild.id, message.author.id);

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
    await message.reply({ embeds: [{ color: 0xf1c40f, title: "🃏 𝔹𝕃𝔸ℂ𝕂𝕁𝔸ℂ𝕂!", description: `${showState(true)}\n\n🎉 Natural blackjack! You win **${winnings} ${economySettings.currency_name}** (2.5x)!` }] }).catch(() => {});
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

    await message.reply({ embeds: [{ color, title: "🃏 𝔹𝕝𝕒𝕔𝕜𝕛𝕒𝕔𝕜 — ℝ𝕖𝕤𝕦𝕝𝕥", description: `${showState(true)}\n\n${result}`, fields: [{ name: "Balance", value: `${newBalance} ${economySettings.currency_name}`, inline: true }] }] }).catch(() => {});
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
    await message.reply({ embeds: [new EmbedBuilder().setColor(0xe67e22).setTitle("📈 ℍ𝕚𝕘𝕙-𝕃𝕠𝕨").setDescription(
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

  const hlCd = checkCd('highlow', message.guild.id, message.author.id, 10000);
  if (hlCd) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: `⏳ High-Low is on cooldown! Try again in **${fmtCd(hlCd)}**.` }] }).catch(() => {}); return;
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
  setCd('highlow', message.guild.id, message.author.id);
  await run(`UPDATE user_economy SET balance=? WHERE guild_id=? AND user_id=?`, [newBalance, message.guild.id, message.author.id]);
  await run(`INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
    [message.guild.id, message.author.id, "highlow", winnings, `High-Low (bet ${bet})`]);

  await message.reply({ embeds: [{
    color: won ? 0x2ecc71 : 0xe74c3c,
    title: "📈 ℍ𝕚𝕘𝕙-𝕃𝕠𝕨",
    description: `First number: **${first}**\nSecond number: **${second}**\n\nYou guessed **${guessHigher ? "higher" : "lower"}**\n${won ? `✅ Correct! +**${winnings} ${economySettings.currency_name}**` : `❌ Wrong! -**${bet} ${economySettings.currency_name}**`}`,
    fields: [{ name: "Balance", value: `${newBalance} ${economySettings.currency_name}`, inline: true }]
  }] }).catch(() => {});
}

// ─── INVEST COMMAND ─────────────────────────────────────────────────────────
// Usage: invest <amount> <venture> | invest collect | invest status
const VENTURES = {
  swamp_trade: {
    name: "🌿 Swamp Trade",
    risk: "Low",
    color: 0x2ecc71,
    desc: "Slow and steady. Low risk, modest returns.",
    duration: 8 * 3600000,   // 8 hours
    ranges: [
      { chance: 0.15, mult: 0.85 },  // 15% small loss
      { chance: 0.30, mult: 1.10 },  // 30% slight gain
      { chance: 0.35, mult: 1.25 },  // 35% good gain
      { chance: 0.15, mult: 1.45 },  // 15% great gain
      { chance: 0.05, mult: 1.80 },  // 5% jackpot
    ]
  },
  murk_mine: {
    name: "⛏️ Murk Mine Co.",
    risk: "Medium",
    color: 0xf39c12,
    desc: "Mining venture. Moderate risk, higher rewards.",
    duration: 12 * 3600000, // 12 hours
    ranges: [
      { chance: 0.20, mult: 0.60 },  // 20% significant loss
      { chance: 0.20, mult: 0.90 },  // 20% small loss
      { chance: 0.25, mult: 1.30 },  // 25% decent gain
      { chance: 0.20, mult: 1.75 },  // 20% great gain
      { chance: 0.10, mult: 2.50 },  // 10% big win
      { chance: 0.05, mult: 4.00 },  // 5% jackpot
    ]
  },
  void_market: {
    name: "🌀 Void Markets",
    risk: "Extreme",
    color: 0x9b59b6,
    desc: "The void is unpredictable. Lose it all or multiply it tenfold.",
    duration: 24 * 3600000, // 24 hours
    ranges: [
      { chance: 0.25, mult: 0.10 },  // 25% near total loss
      { chance: 0.15, mult: 0.50 },  // 15% major loss
      { chance: 0.20, mult: 1.00 },  // 20% break even
      { chance: 0.15, mult: 2.00 },  // 15% double
      { chance: 0.15, mult: 4.00 },  // 15% quadruple
      { chance: 0.10, mult: 8.00 },  // 10% huge win
    ]
  },
  bog_shrooms: {
    name: "🍄 Bog Shroom Farm",
    risk: "Very Low",
    color: 0x5dbb63,
    desc: "Cultivating swamp mushrooms. Tiny gains but nearly guaranteed.",
    duration: 2 * 3600000,  // 2 hours — great for quick, safe returns
    ranges: [
      { chance: 0.05, mult: 0.90 },  // 5%  tiny loss
      { chance: 0.30, mult: 1.05 },  // 30% slight gain
      { chance: 0.40, mult: 1.10 },  // 40% decent gain
      { chance: 0.20, mult: 1.20 },  // 20% good gain
      { chance: 0.05, mult: 1.40 },  // 5%  great gain
    ]
  },
  dragon_auction: {
    name: "🐉 Dragon Auction",
    risk: "High",
    color: 0xe74c3c,
    desc: "Bidding on a rare dragon artefact. High stakes, high rewards.",
    duration: 6 * 3600000,  // 6 hours
    ranges: [
      { chance: 0.30, mult: 0.20 },  // 30% big loss
      { chance: 0.20, mult: 0.70 },  // 20% partial loss
      { chance: 0.15, mult: 1.00 },  // 15% break even
      { chance: 0.20, mult: 2.20 },  // 20% good win
      { chance: 0.10, mult: 4.50 },  // 10% great win
      { chance: 0.05, mult: 9.00 },  // 5%  jackpot
    ]
  },
  artifact_fence: {
    name: "🏺 Artifact Fence",
    risk: "Medium-High",
    color: 0xf39c12,
    desc: "Selling ancient relics through back channels. Steady medium risk.",
    duration: 16 * 3600000, // 16 hours
    ranges: [
      { chance: 0.15, mult: 0.40 },  // 15% significant loss
      { chance: 0.15, mult: 0.80 },  // 15% small loss
      { chance: 0.20, mult: 1.00 },  // 20% break even
      { chance: 0.25, mult: 1.60 },  // 25% decent gain
      { chance: 0.15, mult: 2.80 },  // 15% great gain
      { chance: 0.10, mult: 5.00 },  // 10% jackpot
    ]
  }
};

function rollVentureMultiplier(venture) {
  let roll = Math.random();
  for (const tier of venture.ranges) {
    if (roll < tier.chance) return tier.mult;
    roll -= tier.chance;
  }
  return 1.0;
}

async function cmdInvest(message, args, util) {
  const { economySettings, run, get } = util;
  const userId = message.author.id;
  const guildId = message.guild.id;

  // Ensure investments table exists
  await run(`CREATE TABLE IF NOT EXISTS user_investments (
    id BIGSERIAL PRIMARY KEY,
    guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
    venture_id TEXT NOT NULL, amount BIGINT NOT NULL,
    invested_at BIGINT NOT NULL, matures_at BIGINT NOT NULL, collected INTEGER DEFAULT 0
  )`).catch(() => {});

  const economy = await get(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`, [guildId, userId]);
  if (!economy) return message.reply("You don't have an economy account yet.").catch(() => {});

  const sub = (args[0] || "").toLowerCase();

  // invest status — view active investments
  if (sub === "status" || sub === "list") {
    const investments = await util.all
      ? await util.all(`SELECT * FROM user_investments WHERE guild_id=? AND user_id=? AND collected=0 ORDER BY invested_at DESC LIMIT 10`, [guildId, userId])
      : [];
    if (!investments || investments.length === 0)
      return message.reply({ embeds: [{ color: 0x95a5a6, description: "📊 You have no active investments. Use `invest <amount> <swamp_trade|murk_mine|void_market>`" }] }).catch(() => {});

    const now = Date.now();
    const fields = investments.map(inv => {
      const v = VENTURES[inv.venture_id] || { name: inv.venture_id };
      const timeLeft = inv.matures_at - now;
      const ready = timeLeft <= 0;
      const timeStr = ready ? "✅ Ready to collect!" : `⏳ ${Math.ceil(timeLeft / 3600000)}h remaining`;
      return { name: `${v.name || inv.venture_id}`, value: `**${inv.amount.toLocaleString()} ${economySettings.currency_name}** invested\n${timeStr}`, inline: true };
    });

    return message.reply({ embeds: [{
      color: 0x3498db,
      title: `📊 𝕀𝕟𝕧𝕖𝕤𝕥𝕞𝕖𝕟𝕥 ℙ𝕠𝕣𝕥𝕗𝕠𝕝𝕚𝕠`,
      fields,
      footer: { text: "Use 'invest collect' to collect matured investments" }
    }] }).catch(() => {});
  }

  // invest collect
  if (sub === "collect") {
    const now = Date.now();
    const matured = util.all
      ? await util.all(`SELECT * FROM user_investments WHERE guild_id=? AND user_id=? AND collected=0 AND matures_at<=?`, [guildId, userId, now])
      : [];
    if (!matured || matured.length === 0)
      return message.reply({ embeds: [{ color: 0x95a5a6, description: "⏳ No matured investments to collect yet. Check `invest status`." }] }).catch(() => {});

    let totalReturns = 0;
    const summaryLines = [];
    for (const inv of matured) {
      const v = VENTURES[inv.venture_id];
      if (!v) continue;
      const mult = rollVentureMultiplier(v);
      const returns = Math.floor(inv.amount * mult);
      const profit = returns - inv.amount;
      totalReturns += returns;
      const profitStr = profit >= 0 ? `+${profit.toLocaleString()}` : profit.toLocaleString();
      summaryLines.push(`${v.name}: **${inv.amount.toLocaleString()} → ${returns.toLocaleString()}** (${profitStr})`);
      await run(`UPDATE user_investments SET collected=1 WHERE id=?`, [inv.id]).catch(() => {});
    }

    const newBalance = economy.balance + totalReturns;
    await run(`UPDATE user_economy SET balance=? WHERE guild_id=? AND user_id=?`, [newBalance, guildId, userId]);

    return message.reply({ embeds: [{
      color: totalReturns > 0 ? 0x2ecc71 : 0xe74c3c,
      title: `💰 𝕀𝕟𝕧𝕖𝕤𝕥𝕞𝕖𝕟𝕥 ℂ𝕠𝕝𝕝𝕖𝕔𝕥𝕖𝕕`,
      description: summaryLines.join("\n"),
      fields: [
        { name: "Total Collected", value: `${totalReturns.toLocaleString()} ${economySettings.currency_name}`, inline: true },
        { name: "New Balance", value: `${newBalance.toLocaleString()} ${economySettings.currency_name}`, inline: true }
      ]
    }] }).catch(() => {});
  }

  // invest <amount> <venture>
  const ventureKey = (args[1] || "").toLowerCase();
  const venture = VENTURES[ventureKey];
  if (!venture) {
    const ventureList = Object.entries(VENTURES)
      .map(([k, v]) => `**${v.name}** (\`${k}\`) — ${v.risk} risk, matures in ${v.duration / 3600000}h\n${v.desc}`)
      .join("\n\n");
    return message.reply({ embeds: [{
      color: 0x3498db,
      title: "📊 𝕀𝕟𝕧𝕖𝕤𝕥𝕞𝕖𝕟𝕥 𝕍𝕖𝕟𝕥𝕦𝕣𝕖𝕤",
      description: `Choose a venture:\n\n${ventureList}\n\n**Usage:** \`invest <amount> <venture_id>\`\n**Collect:** \`invest collect\`\n**Status:** \`invest status\``,
      footer: { text: "Investments are locked until maturity. Results are revealed on collection." }
    }] }).catch(() => {});
  }

  const bet = args[0] === "all" ? economy.balance : parseInt(args[0]);
  if (isNaN(bet) || bet <= 0) return message.reply("Please specify a valid amount.").catch(() => {});
  if (bet > economy.balance) return message.reply(`You only have ${economy.balance.toLocaleString()} ${economySettings.currency_name}.`).catch(() => {});
  if (bet < 100) return message.reply("Minimum investment is 100 coins.").catch(() => {});

  const now = Date.now();
  const matures_at = now + venture.duration;

  await run(`UPDATE user_economy SET balance=? WHERE guild_id=? AND user_id=?`, [economy.balance - bet, guildId, userId]);
  await run(
    `INSERT INTO user_investments (guild_id, user_id, venture_id, amount, invested_at, matures_at, collected) VALUES (?, ?, ?, ?, ?, ?, 0)`,
    [guildId, userId, ventureKey, bet, now, matures_at]
  );

  return message.reply({ embeds: [{
    color: venture.color,
    title: `${venture.name} — Investment Filed`,
    description: `💸 You invested **${bet.toLocaleString()} ${economySettings.currency_name}** in **${venture.name}**.\n\n${venture.desc}`,
    fields: [
      { name: "Risk", value: venture.risk, inline: true },
      { name: "Matures In", value: `${venture.duration / 3600000} hours`, inline: true },
      { name: "Wallet", value: `${(economy.balance - bet).toLocaleString()} ${economySettings.currency_name}`, inline: true }
    ],
    footer: { text: "Use 'invest collect' after the venture matures to see your returns." }
  }] }).catch(() => {});
}

// ─── NET WORTH COMMAND ────────────────────────────────────────────────────────
async function cmdNetWorth(message, args, util) {
  const { economySettings, get } = util;

  const target = message.mentions.users.first() || message.author;
  const economy = await get(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`, [message.guild.id, target.id]);
  if (!economy) return message.reply(`${target.username} has no economy account yet.`).catch(() => {});

  // Sum inventory item values
  let inventoryValue = 0;
  const inventoryItems = util.all
    ? await util.all(`SELECT ui.quantity, si.price FROM user_inventory ui
        JOIN economy_shop_items si ON si.guild_id=ui.guild_id AND si.item_id=ui.item_id
        WHERE ui.guild_id=? AND ui.user_id=?`, [message.guild.id, target.id])
    : [];
  if (inventoryItems && inventoryItems.length > 0) {
    inventoryValue = inventoryItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);
  }

  // Active investments
  let investmentValue = 0;
  const activeInvests = util.all
    ? await util.all(`SELECT amount FROM user_investments WHERE guild_id=? AND user_id=? AND collected=0`, [message.guild.id, target.id])
    : [];
  if (activeInvests && activeInvests.length > 0) {
    investmentValue = activeInvests.reduce((sum, i) => sum + i.amount, 0);
  }

  const wallet = economy.balance || 0;
  const bank = economy.bank_balance || 0;
  const netWorth = wallet + bank + inventoryValue + investmentValue;

  // Net worth tiers
  let tier = "🧹 Swamp Peasant";
  if (netWorth >= 500000) tier = "👑 Murk Overlord";
  else if (netWorth >= 200000) tier = "🐉 Dragon Lord";
  else if (netWorth >= 100000) tier = "⚔️ Warlord";
  else if (netWorth >= 50000) tier = "🎭 Shadow Broker";
  else if (netWorth >= 20000) tier = "💼 Merchant Prince";
  else if (netWorth >= 10000) tier = "⚗️ Alchemist";
  else if (netWorth >= 5000) tier = "🛡️ Murk Guard";
  else if (netWorth >= 2000) tier = "🛒 Market Runner";
  else if (netWorth >= 500) tier = "🪣 Bog Collector";

  await message.reply({ embeds: [{
    color: 0xf1c40f,
    title: `💰 ℕ𝕖𝕥 𝕎𝕠𝕣𝕥𝕙 — ${target.username}`,
    description: `**Wealth Tier:** ${tier}`,
    fields: [
      { name: "👜 Wallet", value: `${wallet.toLocaleString()} ${economySettings.currency_name}`, inline: true },
      { name: "🏦 Bank", value: `${bank.toLocaleString()} ${economySettings.currency_name}`, inline: true },
      { name: "🎒 Inventory Value", value: `${inventoryValue.toLocaleString()} ${economySettings.currency_name}`, inline: true },
      { name: "📊 Active Investments", value: `${investmentValue.toLocaleString()} ${economySettings.currency_name}`, inline: true },
      { name: "✨ Total Net Worth", value: `**${netWorth.toLocaleString()} ${economySettings.currency_name}**`, inline: true },
    ],
    thumbnail: { url: target.displayAvatarURL({ dynamic: true }) }
  }] }).catch(() => {});
}

// ==================== STATS COMMAND ====================

async function cmdStats(message, args, economySettings) {
  if (!economySettings?.enabled) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Economy system is disabled." }] }).catch(() => {});
    return;
  }

  const target = args[0] ? await pickUserSmart(message, args[0]) : { member: message.member };
  if (!target) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ User not found." }] }).catch(() => {});
    return;
  }

  const userId = target.member.id;
  const guildId = message.guild.id;

  const [fishStat, digStat, mineStat, huntStat, heistStat, economy, classRow] = await Promise.all([
    get(`SELECT stat_value FROM minigames_stats WHERE guild_id=? AND user_id=? AND minigame='fishing'  AND stat_name='fish_count'`,  [guildId, userId]),
    get(`SELECT stat_value FROM minigames_stats WHERE guild_id=? AND user_id=? AND minigame='digging'  AND stat_name='last_dig'`,    [guildId, userId]),
    get(`SELECT stat_value FROM minigames_stats WHERE guild_id=? AND user_id=? AND minigame='mining'   AND stat_name='last_mine'`,   [guildId, userId]),
    get(`SELECT stat_value FROM minigames_stats WHERE guild_id=? AND user_id=? AND minigame='hunting'  AND stat_name='last_hunt'`,   [guildId, userId]),
    get(`SELECT stat_value FROM minigames_stats WHERE guild_id=? AND user_id=? AND minigame='heist'    AND stat_name='last_heist'`,  [guildId, userId]),
    get(`SELECT * FROM user_economy WHERE guild_id=? AND user_id=?`, [guildId, userId]),
    get(`SELECT class_id FROM user_class WHERE guild_id=? AND user_id=?`, [guildId, userId]),
  ]);

  const classDisplay = classRow?.class_id
    ? { brigand: "🗡️ Brigand", artificer: "⚙️ Artificer", scholar: "📖 Scholar", merchant: "💼 Merchant" }[classRow.class_id] || classRow.class_id
    : "*(none)*";

  const streak = economy?.daily_streak || 0;
  const prestige = economy?.prestige_level || 0;

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle(`📊 ${target.member.displayName}'s Stats`)
    .setThumbnail(target.member.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: "🎣 Fishing Trips",  value: `${fishStat?.stat_value  || 0}`, inline: true },
      { name: "⛏️ Dig Runs",       value: `${digStat?.stat_value   || 0}`, inline: true },
      { name: "🪨 Mine Runs",      value: `${mineStat?.stat_value  || 0}`, inline: true },
      { name: "🕸️ Hunt Runs",      value: `${huntStat?.stat_value  || 0}`, inline: true },
      { name: "💰 Heists Run",     value: `${heistStat?.stat_value || 0}`, inline: true },
      { name: "🔥 Daily Streak",   value: `${streak} day${streak !== 1 ? "s" : ""}`, inline: true },
      { name: "⭐ Prestige",       value: `Level ${prestige}`, inline: true },
      { name: "🎭 Class",          value: classDisplay, inline: true },
    )
    .setFooter({ text: `${economySettings.currency_name} economy` });

  await message.reply({ embeds: [embed] }).catch(() => {});
}


// ─────────────────────────────────────────────────────
// ECONOMY: DUEL (1v1 wager)
// ─────────────────────────────────────────────────────

async function cmdDuel(message, args) {
  const economySettings = await getEconomySettings(message.guild.id);
  if (!economySettings?.enabled) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Economy system is disabled on this server." }] }).catch(() => {});
    return;
  }

  const ecoPrefix = economySettings.economy_prefix || "$";
  const sym = economySettings.currency_name;

  const target = message.mentions.users.first();
  const amount = parseInt(args[1], 10);

  if (!target || target.id === message.author.id || target.bot) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle("⚔️ Duel").setDescription(
      `Challenge someone to a coin duel!\n\n**Usage:** \`${ecoPrefix}duel @user <amount>\`\n\n**Rules:**\n• Both players wager the same amount\n• Winner takes the full pot\n• You have 60 seconds to accept`
    )] }).catch(() => {});
    return;
  }

  if (isNaN(amount) || amount < 50) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: `❌ Minimum duel wager is **50** ${sym}.` }] }).catch(() => {});
    return;
  }

  const duelCd = checkCd('duel', message.guild.id, message.author.id, 30000);
  if (duelCd) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: `⏳ Duel on cooldown! Try again in **${fmtCd(duelCd)}**.` }] }).catch(() => {});
    return;
  }

  await run(`INSERT INTO user_economy (guild_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING`, [message.guild.id, message.author.id]);
  const challengerEcon = await get(`SELECT balance FROM user_economy WHERE guild_id=? AND user_id=?`, [message.guild.id, message.author.id]);
  if ((challengerEcon?.balance || 0) < amount) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: `❌ You need **${amount} ${sym}** in your wallet to issue this challenge!` }] }).catch(() => {});
    return;
  }

  // Deduct from challenger upfront — refunded on decline/expire
  await run(`UPDATE user_economy SET balance=balance-? WHERE guild_id=? AND user_id=?`, [amount, message.guild.id, message.author.id]);
  setCd('duel', message.guild.id, message.author.id);

  const scenes = [
    "The two meet in the foggy Murk arena. The crowd falls silent...",
    "Both warriors draw their weapons at the crossroads of the swamp...",
    "The Murk itself watches as the challengers face each other...",
    "A ring of bog-fire ignites around them. There is no backing down...",
    "The duel bell tolls through the swamp. All creatures go still...",
  ];
  const randomScene = scenes[Math.floor(Math.random() * scenes.length)];

  await message.reply({ embeds: [new EmbedBuilder()
    .setColor(0xe67e22)
    .setTitle("⚔️ 𝔻𝕦𝕖𝕝 ℂ𝕙𝕒𝕝𝕝𝕖𝕟𝕘𝕖!")
    .setDescription(`${message.author} challenges ${target} to a duel!\n\n*${randomScene}*\n\n**Wager:** ${amount} ${sym} each\n**Prize Pool:** ${amount * 2} ${sym}\n\n${target}, type \`${ecoPrefix}duel accept\` or \`${ecoPrefix}duel decline\` within **60 seconds**!`)
    .setFooter({ text: "Challenge expires in 60 seconds" })
  ] }).catch(() => {});

  const filter = m =>
    m.author.id === target.id && (
      m.content.trim().toLowerCase() === 'accept' ||
      m.content.trim().toLowerCase() === 'yes' ||
      m.content.trim().toLowerCase() === 'decline' ||
      m.content.trim().toLowerCase() === 'no' ||
      m.content.trim().toLowerCase() === `${ecoPrefix}duel accept` ||
      m.content.trim().toLowerCase() === `${ecoPrefix}duel decline`
    );

  const collected = await message.channel.awaitMessages({ filter, max: 1, time: 60000 }).catch(() => null);
  const response = collected?.first()?.content?.trim()?.toLowerCase() || '';
  const accepted = response === 'accept' || response === 'yes' || response === `${ecoPrefix}duel accept`;

  if (!accepted) {
    // Refund challenger
    await run(`UPDATE user_economy SET balance=balance+? WHERE guild_id=? AND user_id=?`, [amount, message.guild.id, message.author.id]);
    const reason = (!collected || collected.size === 0)
      ? `⏰ **${target.username}** didn't respond in time! ${message.author}'s wager refunded.`
      : `🤚 **${target.username}** declined the duel! ${message.author}'s wager refunded.`;
    await message.reply({ embeds: [{ color: 0x95a5a6, description: reason }] }).catch(() => {});
    return;
  }

  // Check target has enough
  await run(`INSERT INTO user_economy (guild_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING`, [message.guild.id, target.id]);
  const targetEcon = await get(`SELECT balance FROM user_economy WHERE guild_id=? AND user_id=?`, [message.guild.id, target.id]);
  if ((targetEcon?.balance || 0) < amount) {
    await run(`UPDATE user_economy SET balance=balance+? WHERE guild_id=? AND user_id=?`, [amount, message.guild.id, message.author.id]);
    await message.reply({ embeds: [{ color: 0xe74c3c, description: `❌ ${target} doesn't have enough ${sym}! Wager refunded to ${message.author}.` }] }).catch(() => {});
    return;
  }

  // Deduct from target
  await run(`UPDATE user_economy SET balance=balance-? WHERE guild_id=? AND user_id=?`, [amount, message.guild.id, target.id]);

  // Resolve: 50/50
  const challengerWins = Math.random() < 0.5;
  const winner = challengerWins ? message.author : target;
  const loser  = challengerWins ? target : message.author;
  const pot = amount * 2;

  await run(`UPDATE user_economy SET balance=balance+? WHERE guild_id=? AND user_id=?`, [pot, message.guild.id, winner.id]);
  await run(`INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
    [message.guild.id, winner.id, "duel_won", pot, `Duel vs ${loser.username}`]);
  await run(`INSERT INTO economy_transactions (guild_id, user_id, type, amount, description) VALUES (?, ?, ?, ?, ?)`,
    [message.guild.id, loser.id, "duel_lost", -amount, `Duel vs ${winner.username}`]);

  const battleScenes = [
    "Blades clash in the swamp fog! The fight is fierce and desperate...",
    "The warriors trade blows for what feels like an eternity...",
    "In a single decisive strike, the duel is decided...",
    "The swamp holds its breath as the two duelists give everything...",
    "Lightning flashes over the bog as the final blow lands...",
  ];

  await message.reply({ embeds: [new EmbedBuilder()
    .setColor(0xffd700)
    .setTitle("⚔️ 𝔻𝕦𝕖𝕝 ℝ𝕖𝕤𝕦𝕝𝕥!")
    .setDescription(`*${battleScenes[Math.floor(Math.random() * battleScenes.length)]}*\n\n🏆 **${winner.username}** wins the duel!\n💀 **${loser.username}** falls defeated.`)
    .addFields(
      { name: "💰 Prize Collected", value: `${pot} ${sym}`, inline: true },
      { name: "🎯 Wager Each",      value: `${amount} ${sym}`, inline: true }
    )
    .setFooter({ text: "50/50 chance — pure skill (or luck)" })
  ] }).catch(() => {});
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
  cmdInvest,
  cmdNetWorth,
  cmdStats,
  cmdDuel,
};

