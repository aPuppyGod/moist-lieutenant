"use strict";
const { EmbedBuilder } = require("discord.js");
const { handleDeath } = require("./economy");

// ─────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────

async function ensureUser(run, get, guildId, userId) {
  await run(
    `INSERT INTO user_economy (guild_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING`,
    [guildId, userId]
  );
}

async function getInventory(get, guildId, userId, itemId) {
  return get(
    `SELECT quantity FROM user_inventory WHERE guild_id=? AND user_id=? AND item_id=?`,
    [guildId, userId, itemId]
  );
}

async function removeItem(run, guildId, userId, itemId, qty = 1) {
  await run(
    `UPDATE user_inventory SET quantity=MAX(0, quantity-?) WHERE guild_id=? AND user_id=? AND item_id=?`,
    [qty, guildId, userId, itemId]
  );
}

async function addItem(run, guildId, userId, itemId, qty = 1) {
  await run(
    `INSERT INTO user_inventory (guild_id, user_id, item_id, quantity)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (guild_id, user_id, item_id) DO UPDATE SET quantity=user_inventory.quantity+?`,
    [guildId, userId, itemId, qty, qty]
  );
}

// Buy an item by name or item_id from the guild shop DB.
// Returns { ok, item, finalPrice, error }
async function purchaseItem(get, run, guildId, userId, query, currency) {
  const { all } = require("./db");
  const norm = q => q.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
  const normQ = norm(query);
  const items = await all(`SELECT * FROM economy_shop_items WHERE guild_id=?`, [guildId]);
  const item = items.find(i =>
    norm(i.item_id) === normQ ||
    norm(i.name) === normQ
  );
  if (!item) return { ok: false, error: `❌ Item **${query}** not found in the shop.` };

  // Artificer discount check
  const buyerClass = await get(`SELECT class_id FROM user_class WHERE guild_id=? AND user_id=?`, [guildId, userId]);
  const FARMER_ITEMS = ["beehive", "bees", "electric_heater", "campfire_kit", "grape_vine_trellise", "basement", "bunker"];
  let finalPrice = item.price;
  if (buyerClass?.class_id === "artificer") finalPrice = Math.floor(item.price * 0.8);
  else if (buyerClass?.class_id === "farmer" && FARMER_ITEMS.includes(item.item_id)) finalPrice = Math.floor(item.price * 0.85);

  const economy = await get(`SELECT balance FROM user_economy WHERE guild_id=? AND user_id=?`, [guildId, userId]);
  if (!economy || economy.balance < finalPrice) {
    return { ok: false, error: `❌ You need **${finalPrice} ${currency}** but only have **${economy?.balance ?? 0}**.` };
  }

  await run(`UPDATE user_economy SET balance=balance-? WHERE guild_id=? AND user_id=?`, [finalPrice, guildId, userId]);
  await run(
    `INSERT INTO user_inventory (guild_id, user_id, item_id, quantity) VALUES (?, ?, ?, 1)
     ON CONFLICT (guild_id, user_id, item_id) DO UPDATE SET quantity=user_inventory.quantity+1`,
    [guildId, userId, item.item_id]
  );
  return { ok: true, item, finalPrice };
}

// Show a mini-shop embed for a list of item_ids relevant to an activity
async function showActivityShop(message, util, itemIds, title, ecoPrefix, buyCmd) {
  const { get: getCmd } = util;
  const { all } = require("./db");
  const guildId = message.guild.id;
  const currency = util.economySettings.currency_name || "coins";
  const allItems = await all(`SELECT * FROM economy_shop_items WHERE guild_id=?`, [guildId]);
  const relevant = itemIds
    .map(id => allItems.find(i => i.item_id === id))
    .filter(Boolean);

  if (relevant.length === 0) {
    await message.reply({ embeds: [{ color: 0x95a5a6, description: "No items found in the shop. Make sure the guild shop is set up." }] }).catch(() => {});
    return;
  }

  const lines = relevant.map(i => `**${i.name}** — ${i.price} ${currency}\n*${i.description}*`).join("\n\n");
  await message.reply({ embeds: [new EmbedBuilder()
    .setColor(0x2c2f33)
    .setTitle(title)
    .setDescription(`${lines}\n\n🛒 Buy: \`${ecoPrefix}${buyCmd} buy <item name or id>\`\n*e.g. \`${ecoPrefix}${buyCmd} buy ${itemIds[0]}\`*`)
  ] }).catch(() => {});
}

// ─────────────────────────────────────────────────────────────────
// WEAPONS
// ─────────────────────────────────────────────────────────────────

const WEAPONS = {
  switchblade: { name: "Switchblade", buyPrice: 800, sellPrice: 2000, craftable: false, stingRisk: 0.15, shotRisk: 0.03 },
  pipe_bomb:   { name: "Pipe Bomb",   buyPrice: null, sellPrice: 4000, craftable: true,
                 recipe: { murk_shard: 2, iron_scrap: 3, gunpowder: 2 }, stingRisk: 0, shotRisk: 0.05 },
  ghost_gun:   { name: "Ghost Gun",   buyPrice: null, sellPrice: 8000, craftable: true,
                 recipe: { ghost_gun_parts: 1, iron_scrap: 4, gunpowder: 3 }, stingRisk: 0, shotRisk: 0.08 },
};

async function cmdWeapons(message, args, util) {
  const { economySettings, ecoPrefix, run, get } = util;
  const { all } = require("./db");

  if (!economySettings?.enabled) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Economy system is disabled." }] }).catch(() => {});
    return;
  }

  await ensureUser(run, get, message.guild.id, message.author.id);
  const sub = (args[0] || "").toLowerCase();
  const guildId = message.guild.id;
  const userId = message.author.id;
  const currency = economySettings.currency_name || "coins";

  // ── LIST ──────────────────────────────────────────────────────────────────────
  if (!sub || sub === "list" || sub === "shop") {
    const lines = Object.entries(WEAPONS).map(([id, w]) => {
      const buyStr = w.buyPrice ? `Buy: ${w.buyPrice}` : "Craft only";
      return `**${w.name}** (\`${id}\`) — ${buyStr} | Sell: ${w.sellPrice} ${currency}`;
    });
    await message.reply({ embeds: [new EmbedBuilder()
      .setColor(0x992d22)
      .setTitle("🔫 Underground Weapons Dealer")
      .setDescription(`*Pssst... looking for something special?*\n\n${lines.join("\n")}\n\n🛒 \`${ecoPrefix}weapons buy <name>\`\n🔧 \`${ecoPrefix}weapons craft <name>\`\n💰 \`${ecoPrefix}weapons sell <name>\``)
      .setFooter({ text: "Warning: 15% chance of police sting on purchases. You didn't hear this from me." })
    ] }).catch(() => {});
    return;
  }

  // ── SHOP (materials) ──────────────────────────────────────────────────────────
  if (sub === "buy" && !args[1]) {
    await showActivityShop(message, util,
      ["iron_scrap", "gunpowder", "ghost_gun_parts"],
      "🔫 Underground Arms — Crafting Materials",
      ecoPrefix, "weapons"
    );
    return;
  }

  if (sub === "buy" && args[1]) {
    const query = args.slice(1).join(" ");
    const result = await purchaseItem(get, run, guildId, userId, query, currency);
    if (!result.ok) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: result.error }] }).catch(() => {});
    } else {
      await message.reply({ embeds: [{ color: 0x2ecc71, description: `✅ Bought **${result.item.name}** for **${result.finalPrice} ${currency}**.` }] }).catch(() => {});
    }
    return;
  }

  const weaponId = args[1]?.toLowerCase();
  const weapon = weaponId && WEAPONS[weaponId];

  // ── BUY ───────────────────────────────────────────────────────────────────────
  if (sub === "buy") {
    if (!weapon) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: `❌ Unknown weapon. Options: ${Object.keys(WEAPONS).join(", ")}` }] }).catch(() => {});
      return;
    }
    if (!weapon.buyPrice) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: `❌ **${weapon.name}** can only be crafted, not bought.` }] }).catch(() => {});
      return;
    }
    const economy = await get(`SELECT balance FROM user_economy WHERE guild_id=? AND user_id=?`, [guildId, userId]);
    if (economy.balance < weapon.buyPrice) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: `❌ You need **${weapon.buyPrice} ${currency}** to buy a ${weapon.name}.` }] }).catch(() => {});
      return;
    }

    // Sting risk
    if (Math.random() < weapon.stingRisk) {
      const fine = Math.floor(economy.balance * 0.35);
      await run(`UPDATE user_economy SET balance=MAX(0, balance-?) WHERE guild_id=? AND user_id=?`, [fine, guildId, userId]);
      await message.reply({ embeds: [{ color: 0xe74c3c, title: "🚔 Police Sting!", description: `The deal was a setup! Cops swarmed the exchange.\n\n💸 You paid a fine of **${fine} ${currency}** and barely escaped.` }] }).catch(() => {});
      return;
    }

    // Shot risk
    if (Math.random() < weapon.shotRisk) {
      await message.reply({ embeds: [{ color: 0x1a1a1a, description: "🔫 Something went wrong during the deal..." }] }).catch(() => {});
      await handleDeath(message, util, "You were shot during an illegal arms deal.");
      return;
    }

    await run(`UPDATE user_economy SET balance=balance-? WHERE guild_id=? AND user_id=?`, [weapon.buyPrice, guildId, userId]);
    await addItem(run, guildId, userId, weaponId);
    await message.reply({ embeds: [{ color: 0x2ecc71, title: "🔫 Weapon Acquired", description: `You bought a **${weapon.name}** for **${weapon.buyPrice} ${currency}**.\n\n*Keep it hidden...*` }] }).catch(() => {});
    return;
  }

  // ── CRAFT ─────────────────────────────────────────────────────────────────────
  if (sub === "craft") {
    if (!weapon || !weapon.craftable) {
      const craftable = Object.entries(WEAPONS).filter(([, w]) => w.craftable).map(([id]) => id).join(", ");
      await message.reply({ embeds: [{ color: 0xe74c3c, description: `❌ That weapon isn't craftable. Craftable: ${craftable}` }] }).catch(() => {});
      return;
    }
    // Check materials
    for (const [matId, qty] of Object.entries(weapon.recipe)) {
      const inv = await getInventory(get, guildId, userId, matId);
      if (!inv || inv.quantity < qty) {
        await message.reply({ embeds: [{ color: 0xe74c3c, description: `❌ Missing materials! Need **${qty}x ${matId}** (you have ${inv?.quantity || 0}).` }] }).catch(() => {});
        return;
      }
    }
    // Shot risk during crafting
    if (Math.random() < weapon.shotRisk) {
      await message.reply({ embeds: [{ color: 0x1a1a1a, description: "💥 The device detonated prematurely..." }] }).catch(() => {});
      await handleDeath(message, util, "You were killed when a weapon you were crafting exploded.");
      return;
    }
    for (const [matId, qty] of Object.entries(weapon.recipe)) {
      await removeItem(run, guildId, userId, matId, qty);
    }
    await addItem(run, guildId, userId, weaponId);
    const recipeStr = Object.entries(weapon.recipe).map(([id, q]) => `${q}x ${id}`).join(", ");
    await message.reply({ embeds: [{ color: 0x2ecc71, title: "🔧 Weapon Crafted!", description: `You assembled a **${weapon.name}** using ${recipeStr}.\n\nSell it for **${weapon.sellPrice} ${currency}** with \`${ecoPrefix}weapons sell ${weaponId}\`.` }] }).catch(() => {});
    return;
  }

  // ── SELL ──────────────────────────────────────────────────────────────────────
  if (sub === "sell") {
    if (!weapon) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: `❌ Unknown weapon.` }] }).catch(() => {});
      return;
    }
    const inv = await getInventory(get, guildId, userId, weaponId);
    if (!inv || inv.quantity < 1) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: `❌ You don't have a **${weapon.name}** to sell.` }] }).catch(() => {});
      return;
    }
    // Busted risk
    if (Math.random() < 0.20) {
      await removeItem(run, guildId, userId, weaponId);
      const fine = 500;
      await run(`UPDATE user_economy SET balance=MAX(0, balance-?) WHERE guild_id=? AND user_id=?`, [fine, guildId, userId]);
      await message.reply({ embeds: [{ color: 0xe74c3c, title: "🚔 Busted!", description: `Police intercepted the deal! Your **${weapon.name}** was confiscated and you paid a **${fine} ${currency}** fine.` }] }).catch(() => {});
      return;
    }
    const sellAmt = Math.floor(weapon.sellPrice * (0.85 + Math.random() * 0.30)); // ±15% variance
    await removeItem(run, guildId, userId, weaponId);
    await run(`UPDATE user_economy SET balance=balance+? WHERE guild_id=? AND user_id=?`, [sellAmt, guildId, userId]);
    await message.reply({ embeds: [{ color: 0x2ecc71, title: "💰 Weapon Sold!", description: `You sold your **${weapon.name}** for **${sellAmt} ${currency}** on the black market.` }] }).catch(() => {});
    return;
  }

  await message.reply({ embeds: [{ color: 0x95a5a6, description: `🔫 Usage: \`${ecoPrefix}weapons [list|buy|craft|sell] [weapon]\`` }] }).catch(() => {});
}

// ─────────────────────────────────────────────────────────────────
// GROW WEED
// ─────────────────────────────────────────────────────────────────

const WEED_LOCATIONS = {
  outdoor:     { duration: 2 * 3600_000,  bustRisk: 0.40, payoutMin: 500,  payoutMax: 1500,  item: null },
  basement:    { duration: 4 * 3600_000,  bustRisk: 0.20, payoutMin: 1500, payoutMax: 4000,  item: "basement" },
  underground: { duration: 6 * 3600_000,  bustRisk: 0.10, payoutMin: 4000, payoutMax: 12000, item: "bunker" },
};

async function cmdGrowWeed(message, args, util) {
  const { economySettings, ecoPrefix, run, get } = util;

  if (!economySettings?.enabled) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Economy system is disabled." }] }).catch(() => {});
    return;
  }

  await ensureUser(run, get, message.guild.id, message.author.id);
  const sub = (args[0] || "").toLowerCase();
  const guildId = message.guild.id;
  const userId = message.author.id;
  const currency = economySettings.currency_name || "coins";
  const now = Date.now();

  const existingOp = await get(
    `SELECT * FROM illegal_ops WHERE guild_id=? AND user_id=? AND op_type='weed'`,
    [guildId, userId]
  );

  if (!sub || sub === "status" || sub === "check") {
    if (!existingOp) {
      await message.reply({ embeds: [{ color: 0x95a5a6, title: "🌿 Weed Growing", description: `No active grow operation.\n\n\`${ecoPrefix}grow-weed start [outdoor|basement|underground]\`\n\n**Locations:**\n• **outdoor** — 2h, 40% bust, 500–1500 ${currency}\n• **basement** — 4h, 20% bust, 1500–4000 ${currency} *(needs basement item)*\n• **underground** — 6h, 10% bust, 4000–12000 ${currency} *(needs bunker item)*\n\nShop: \`${ecoPrefix}grow-weed buy\`` }] }).catch(() => {});
      return;
    }
    const data = JSON.parse(existingOp.data);
    const timeLeft = Math.max(0, existingOp.finish_at - now);
    const ready = timeLeft === 0;
    await message.reply({ embeds: [{ color: 0x27ae60, title: "🌿 Grow Operation Status", description: `Location: **${data.location}**\n${ready ? "✅ **Ready to harvest!**" : `⏰ Ready in **${Math.ceil(timeLeft / 60000)}m**`}\n\n${ready ? `\`${ecoPrefix}grow-weed harvest\`` : ""}` }] }).catch(() => {});
    return;
  }

  if (sub === "buy") {
    if (!args[1]) {
      await showActivityShop(message, util,
        ["basement", "bunker"],
        "🌿 Grow Op — Location Items",
        ecoPrefix, "grow-weed"
      );
      return;
    }
    const query = args.slice(1).join(" ");
    const result = await purchaseItem(get, run, guildId, userId, query, currency);
    if (!result.ok) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: result.error }] }).catch(() => {});
    } else {
      await message.reply({ embeds: [{ color: 0x2ecc71, description: `✅ Bought **${result.item.name}** for **${result.finalPrice} ${currency}**.` }] }).catch(() => {});
    }
    return;
  }

  if (sub === "start") {
    if (existingOp) {
      await message.reply({ embeds: [{ color: 0xf39c12, description: "❌ You already have an active grow operation. Harvest it first!" }] }).catch(() => {});
      return;
    }
    const locKey = (args[1] || "outdoor").toLowerCase();
    const loc = WEED_LOCATIONS[locKey];
    if (!loc) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: `❌ Unknown location. Choose: outdoor, basement, underground` }] }).catch(() => {});
      return;
    }
    if (loc.item) {
      const inv = await getInventory(get, guildId, userId, loc.item);
      if (!inv || inv.quantity < 1) {
        await message.reply({ embeds: [{ color: 0xe74c3c, description: `❌ You need a **${loc.item}** item to grow weed there.` }] }).catch(() => {});
        return;
      }
    }
    const finishAt = now + loc.duration;
    await run(
      `INSERT INTO illegal_ops (guild_id, user_id, op_type, stage, data, started_at, finish_at)
       VALUES (?, ?, 'weed', 1, ?, ?, ?)`,
      [guildId, userId, JSON.stringify({ location: locKey }), now, finishAt]
    );
    const hrs = loc.duration / 3600_000;
    await message.reply({ embeds: [{ color: 0x27ae60, title: "🌿 Grow Operation Started!", description: `You planted **${locKey}** weed.\n\n⏰ Ready to harvest in **${hrs}h**\nBust risk: **${loc.bustRisk * 100}%**\nPayout: **${loc.payoutMin}–${loc.payoutMax} ${currency}**\n\nHarvest with \`${ecoPrefix}grow-weed harvest\`` }] }).catch(() => {});
    return;
  }

  if (sub === "harvest") {
    if (!existingOp) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ You have nothing growing. Start with \`${ecoPrefix}grow-weed start\`." }] }).catch(() => {});
      return;
    }
    if (now < existingOp.finish_at) {
      const mins = Math.ceil((existingOp.finish_at - now) / 60000);
      await message.reply({ embeds: [{ color: 0xf39c12, description: `⏰ Not ready yet! Come back in **${mins}m**.` }] }).catch(() => {});
      return;
    }
    const data = JSON.parse(existingOp.data);
    const loc = WEED_LOCATIONS[data.location];

    await run(`DELETE FROM illegal_ops WHERE guild_id=? AND user_id=? AND op_type='weed'`, [guildId, userId]);

    if (Math.random() < loc.bustRisk) {
      const economy = await get(`SELECT balance FROM user_economy WHERE guild_id=? AND user_id=?`, [guildId, userId]);
      const fine = Math.floor(economy.balance * 0.40);
      await run(`UPDATE user_economy SET balance=MAX(0, balance-?) WHERE guild_id=? AND user_id=?`, [fine, guildId, userId]);
      // Rare shot chance
      if (Math.random() < 0.05) {
        await message.reply({ embeds: [{ color: 0x1a1a1a, description: "🚔 Cops raided the operation..." }] }).catch(() => {});
        await handleDeath(message, util, "You were shot in a police raid on your grow operation.");
        return;
      }
      await message.reply({ embeds: [{ color: 0xe74c3c, title: "🚔 BUSTED!", description: `Police raided your grow operation! All plants destroyed.\n\n💸 Fine: **${fine} ${currency}**` }] }).catch(() => {});
      return;
    }

    const payout = Math.floor(loc.payoutMin + Math.random() * (loc.payoutMax - loc.payoutMin));
    // Farmer class: 30% more harvest yield
    const harvestClass = await get(`SELECT class_id FROM user_class WHERE guild_id=? AND user_id=?`, [guildId, userId]);
    const farmerMult = harvestClass?.class_id === 'farmer' ? 1.30 : 1;
    const finalPayout = Math.floor(payout * farmerMult);
    const farmerNote = farmerMult > 1 ? `\n🌾 **Farmer Bonus: +30% yield!**` : "";
    await run(`UPDATE user_economy SET balance=balance+? WHERE guild_id=? AND user_id=?`, [finalPayout, guildId, userId]);
    await message.reply({ embeds: [{ color: 0x2ecc71, title: "🌿 Harvest Successful!", description: `You harvested your **${data.location}** crop!\n\n💰 Earned: **${finalPayout} ${currency}**${farmerNote}` }] }).catch(() => {});
    return;
  }

  await message.reply({ embeds: [{ color: 0x95a5a6, description: `🌿 Usage: \`${ecoPrefix}grow-weed [start|harvest|check] [location]\`` }] }).catch(() => {});
}

// ─────────────────────────────────────────────────────────────────
// METH COOK
// ─────────────────────────────────────────────────────────────────

const COOK_LOCATIONS = {
  warehouse:   { setupCost: 800,  riskMult: 0.8, payoutMult: 1.0 },
  mobile:      { setupCost: 1500, riskMult: 0.5, payoutMult: 1.5 },
  underground: { setupCost: 3000, riskMult: 0.3, payoutMult: 2.5 },
};
const COOK_SELL_MARKETS = {
  lowkey:    { riskMult: 0.5, payoutMult: 0.7 },
  street:    { riskMult: 1.0, payoutMult: 1.0 },
  wholesale: { riskMult: 1.5, payoutMult: 1.6 },
};

async function cmdCook(message, args, util) {
  const { economySettings, ecoPrefix, run, get } = util;

  if (!economySettings?.enabled) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Economy system is disabled." }] }).catch(() => {});
    return;
  }

  await ensureUser(run, get, message.guild.id, message.author.id);
  const sub = (args[0] || "").toLowerCase();
  const guildId = message.guild.id;
  const userId = message.author.id;
  const currency = economySettings.currency_name || "coins";
  const now = Date.now();

  const existingOp = await get(
    `SELECT * FROM illegal_ops WHERE guild_id=? AND user_id=? AND op_type='meth'`,
    [guildId, userId]
  );

  if (!sub || sub === "check") {
    if (!existingOp) {
      await message.reply({ embeds: [{ color: 0x95a5a6, title: "🧪 Meth Operation", description: `No active operation.\n\n\`${ecoPrefix}cook start <location>\`\n\n**Locations:** warehouse (800), mobile (1500), underground (3000)\n\nSteps: start → supply → cook → sell\nShop: \`${ecoPrefix}cook buy\`` }] }).catch(() => {});
      return;
    }
    const data = JSON.parse(existingOp.data);
    const stage = existingOp.stage;
    const stages = ["", "Awaiting supplies", "Cooking", "Ready to sell"];
    const timeLeft = existingOp.finish_at ? Math.max(0, existingOp.finish_at - now) : 0;
    const ready = !existingOp.finish_at || timeLeft === 0;
    await message.reply({ embeds: [{ color: 0x3498db, title: "🧪 Cook Operation Status", description: `Location: **${data.location}**\nStage: **${stages[stage] || "Unknown"}**\n${stage === 2 && !ready ? `⏰ Ready in **${Math.ceil(timeLeft / 60000)}m**` : ""}${ready ? "✅ Ready for next step!" : ""}` }] }).catch(() => {});
    return;
  }

  if (sub === "buy") {
    if (!args[1]) {
      await showActivityShop(message, util,
        ["electric_heater", "campfire_kit"],
        "🧪 Cook Lab Supplies",
        ecoPrefix, "cook"
      );
      return;
    }
    const query = args.slice(1).join(" ");
    const result = await purchaseItem(get, run, guildId, userId, query, currency);
    if (!result.ok) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: result.error }] }).catch(() => {});
    } else {
      await message.reply({ embeds: [{ color: 0x2ecc71, description: `✅ Bought **${result.item.name}** for **${result.finalPrice} ${currency}**.` }] }).catch(() => {});
    }
    return;
  }

  if (sub === "start") {
    if (existingOp) {
      await message.reply({ embeds: [{ color: 0xf39c12, description: "❌ You already have an active operation!" }] }).catch(() => {});
      return;
    }
    const locKey = (args[1] || "warehouse").toLowerCase();
    const loc = COOK_LOCATIONS[locKey];
    if (!loc) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: `❌ Unknown location. Choose: warehouse, mobile, underground` }] }).catch(() => {});
      return;
    }
    const economy = await get(`SELECT balance FROM user_economy WHERE guild_id=? AND user_id=?`, [guildId, userId]);
    if (economy.balance < loc.setupCost) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: `❌ Setup costs **${loc.setupCost} ${currency}** for a ${locKey} lab.` }] }).catch(() => {});
      return;
    }
    await run(`UPDATE user_economy SET balance=balance-? WHERE guild_id=? AND user_id=?`, [loc.setupCost, guildId, userId]);
    await run(
      `INSERT INTO illegal_ops (guild_id, user_id, op_type, stage, data, started_at, finish_at)
       VALUES (?, ?, 'meth', 1, ?, ?, NULL)`,
      [guildId, userId, JSON.stringify({ location: locKey, risk: 0 }), now]
    );
    await message.reply({ embeds: [{ color: 0x3498db, title: "🧪 Lab Set Up!", description: `**${locKey}** lab ready. Spent **${loc.setupCost} ${currency}**.\n\nNext: \`${ecoPrefix}cook supply\` to get chemicals.` }] }).catch(() => {});
    return;
  }

  if (sub === "supply") {
    if (!existingOp || existingOp.stage !== 1) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Not in the supply stage." }] }).catch(() => {});
      return;
    }
    const data = JSON.parse(existingOp.data);
    const loc = COOK_LOCATIONS[data.location];
    const stealChemicals = (args[1] || "").toLowerCase() === "steal";
    let addedRisk = 0;
    if (stealChemicals) {
      addedRisk = 0.10;
      if (Math.random() < 0.25 * loc.riskMult) {
        const economy = await get(`SELECT balance FROM user_economy WHERE guild_id=? AND user_id=?`, [guildId, userId]);
        const fine = Math.floor(economy.balance * 0.30);
        await run(`UPDATE user_economy SET balance=MAX(0, balance-?) WHERE guild_id=? AND user_id=?`, [fine, guildId, userId]);
        await run(`DELETE FROM illegal_ops WHERE guild_id=? AND user_id=? AND op_type='meth'`, [guildId, userId]);
        await message.reply({ embeds: [{ color: 0xe74c3c, title: "🚔 Caught Stealing Chemicals!", description: `Operation blown! Fine: **${fine} ${currency}**` }] }).catch(() => {});
        return;
      }
    } else {
      const chemCost = 400;
      const economy = await get(`SELECT balance FROM user_economy WHERE guild_id=? AND user_id=?`, [guildId, userId]);
      if (economy.balance < chemCost) {
        await message.reply({ embeds: [{ color: 0xe74c3c, description: `❌ Need **${chemCost} ${currency}** to buy chemicals, or use \`${ecoPrefix}cook supply steal\`.` }] }).catch(() => {});
        return;
      }
      await run(`UPDATE user_economy SET balance=balance-? WHERE guild_id=? AND user_id=?`, [chemCost, guildId, userId]);
    }
    const cookDuration = (2 + Math.floor(Math.random() * 5)) * 3600_000; // 2-6h
    data.risk = (data.risk || 0) + addedRisk;
    await run(
      `UPDATE illegal_ops SET stage=2, data=?, finish_at=? WHERE guild_id=? AND user_id=? AND op_type='meth'`,
      [JSON.stringify(data), now + cookDuration, guildId, userId]
    );
    const hrs = Math.round(cookDuration / 3600_000);
    await message.reply({ embeds: [{ color: 0x3498db, title: "🧪 Cooking Started!", description: `Chemicals acquired${stealChemicals ? " *(stolen)*" : ""}. Lab is cooking...\n\n⏰ Ready in **~${hrs}h**\n\nCheck with \`${ecoPrefix}cook check\`, then \`${ecoPrefix}cook sell\` when done.` }] }).catch(() => {});
    return;
  }

  if (sub === "sell") {
    if (!existingOp || existingOp.stage !== 2) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Nothing is ready to sell." }] }).catch(() => {});
      return;
    }
    if (existingOp.finish_at && now < existingOp.finish_at) {
      const mins = Math.ceil((existingOp.finish_at - now) / 60000);
      await message.reply({ embeds: [{ color: 0xf39c12, description: `⏰ Still cooking! Ready in **${mins}m**.` }] }).catch(() => {});
      return;
    }
    const marketKey = (args[1] || "street").toLowerCase();
    const market = COOK_SELL_MARKETS[marketKey];
    if (!market) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: `❌ Unknown market. Choose: lowkey, street, wholesale` }] }).catch(() => {});
      return;
    }
    const data = JSON.parse(existingOp.data);
    const loc = COOK_LOCATIONS[data.location];
    const bustChance = 0.15 * loc.riskMult * market.riskMult + (data.risk || 0);

    await run(`DELETE FROM illegal_ops WHERE guild_id=? AND user_id=? AND op_type='meth'`, [guildId, userId]);

    if (Math.random() < bustChance) {
      const economy = await get(`SELECT balance FROM user_economy WHERE guild_id=? AND user_id=?`, [guildId, userId]);
      const fine = Math.floor(economy.balance * 0.45);
      await run(`UPDATE user_economy SET balance=MAX(0, balance-?) WHERE guild_id=? AND user_id=?`, [fine, guildId, userId]);
      if (Math.random() < 0.10) {
        await message.reply({ embeds: [{ color: 0x1a1a1a, description: "🔫 DEA opened fire during the bust..." }] }).catch(() => {});
        await handleDeath(message, util, "You were shot by DEA agents during a meth bust.");
        return;
      }
      await message.reply({ embeds: [{ color: 0xe74c3c, title: "🚔 BUSTED Selling!", description: `The deal went sideways. Cops showed up!\n\n💸 Fine: **${fine} ${currency}**` }] }).catch(() => {});
      return;
    }

    const basePayout = Math.floor(15000 + Math.random() * 35000);
    const finalPayout = Math.floor(basePayout * loc.payoutMult * market.payoutMult);
    await run(`UPDATE user_economy SET balance=balance+? WHERE guild_id=? AND user_id=?`, [finalPayout, guildId, userId]);
    await message.reply({ embeds: [{ color: 0x2ecc71, title: "💰 Deal Complete!", description: `Sold via **${marketKey}** market.\n\n💵 Earned: **${finalPayout} ${currency}**\n\n*Breaking bad is quite profitable...*` }] }).catch(() => {});
    return;
  }

  await message.reply({ embeds: [{ color: 0x95a5a6, description: `🧪 Usage: \`${ecoPrefix}cook [start|supply|sell|check] [location|market]\`` }] }).catch(() => {});
}

// ─────────────────────────────────────────────────────────────────
// BEEHIVE
// ─────────────────────────────────────────────────────────────────

async function cmdBeehive(message, args, util) {
  const { economySettings, ecoPrefix, run, get } = util;

  if (!economySettings?.enabled) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Economy system is disabled." }] }).catch(() => {});
    return;
  }

  await ensureUser(run, get, message.guild.id, message.author.id);
  const sub = (args[0] || "").toLowerCase();
  const guildId = message.guild.id;
  const userId = message.author.id;
  const now = Date.now();
  const HONEYCOMB_INTERVAL = 4 * 3600_000; // 4h per batch

  const hive = await get(`SELECT * FROM beehives WHERE guild_id=? AND user_id=?`, [guildId, userId]);

  if (!sub || sub === "check") {
    if (!hive) {
      await message.reply({ embeds: [{ color: 0x95a5a6, title: "🐝 Beehive", description: `No beehive set up!\n\nBuy a **beehive** and **bees** from the shop:\n\`${ecoPrefix}beehive buy\`\n\nThen set up:\n\`${ecoPrefix}beehive setup\`` }] }).catch(() => {});
      return;
    }
    const readyCombs = hive.honeycomb_ready || 0;
    const nextBatch = hive.last_harvest_at ? Math.max(0, Math.ceil((hive.last_harvest_at + HONEYCOMB_INTERVAL - now) / 60000)) : 0;
    const calmExpired = !hive.calm_expires_at || now > hive.calm_expires_at;
    await message.reply({ embeds: [{ color: 0xf39c12, title: "🐝 Beehive Status", description: `🐝 Bees: **${hive.bee_count}**\n🍯 Honeycomb ready: **${readyCombs}**\n${nextBatch > 0 ? `⏰ Next batch in **${nextBatch}m**` : "🟢 Ready to produce!"}\n\nBees calm: **${calmExpired ? "No — calm before harvesting!" : "Yes ✅"}**\n\n${!calmExpired ? "" : `Calm with \`${ecoPrefix}beehive calm [heater|campfire]\``}\n\`${ecoPrefix}beehive harvest\`` }] }).catch(() => {});
    return;
  }

  if (sub === "buy") {
    if (!args[1]) {
      await showActivityShop(message, util,
        ["beehive", "bees", "electric_heater", "campfire_kit"],
        "🐝 Beehive Shop",
        ecoPrefix, "beehive"
      );
      return;
    }
    const query = args.slice(1).join(" ");
    const result = await purchaseItem(get, run, message.guild.id, message.author.id, query, util.economySettings.currency_name || "coins");
    if (!result.ok) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: result.error }] }).catch(() => {});
    } else {
      await message.reply({ embeds: [{ color: 0x2ecc71, description: `✅ Bought **${result.item.name}** for **${result.finalPrice} ${util.economySettings.currency_name || "coins"}**.` }] }).catch(() => {});
    }
    return;
  }

  if (sub === "setup") {
    if (hive) {
      await message.reply({ embeds: [{ color: 0xf39c12, description: "❌ You already have a beehive set up!" }] }).catch(() => {});
      return;
    }
    const hiveItem = await getInventory(get, guildId, userId, "beehive");
    const beesItem = await getInventory(get, guildId, userId, "bees");
    if (!hiveItem || hiveItem.quantity < 1) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: `❌ You need a **beehive** item from the shop.` }] }).catch(() => {});
      return;
    }
    if (!beesItem || beesItem.quantity < 1) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: `❌ You need a **bees** item from the shop to populate the hive.` }] }).catch(() => {});
      return;
    }
    await removeItem(run, guildId, userId, "beehive");
    await removeItem(run, guildId, userId, "bees");
    await run(
      `INSERT INTO beehives (guild_id, user_id, bee_count, honeycomb_ready, last_harvest_at, calm_expires_at)
       VALUES (?, ?, 3, 0, ?, NULL)`,
      [guildId, userId, now]
    );
    await message.reply({ embeds: [{ color: 0xf39c12, title: "🐝 Beehive Established!", description: `Your bees are buzzing! 🍯\n\nHoney production starts — harvest every 4h.\n\n\`${ecoPrefix}beehive check\`` }] }).catch(() => {});
    return;
  }

  if (sub === "calm") {
    if (!hive) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ No beehive to calm." }] }).catch(() => {});
      return;
    }
    const method = (args[1] || "").toLowerCase();
    if (method === "heater") {
      const heater = await getInventory(get, guildId, userId, "electric_heater");
      if (!heater || heater.quantity < 1) {
        await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ You need an **electric_heater** item." }] }).catch(() => {});
        return;
      }
      const calmUntil = now + 30 * 60_000;
      await run(`UPDATE beehives SET calm_expires_at=? WHERE guild_id=? AND user_id=?`, [calmUntil, guildId, userId]);
      await message.reply({ embeds: [{ color: 0x3498db, description: "🌡️ Electric heater calms the bees for **30 minutes**. Harvest now!" }] }).catch(() => {});
    } else if (method === "campfire") {
      const kit = await getInventory(get, guildId, userId, "campfire_kit");
      if (!kit || kit.quantity < 1) {
        await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ You need a **campfire_kit** item (single use)." }] }).catch(() => {});
        return;
      }
      await removeItem(run, guildId, userId, "campfire_kit");
      const calmUntil = now + 120 * 60_000; // 2h (campfire is slow but long lasting)
      await run(`UPDATE beehives SET calm_expires_at=? WHERE guild_id=? AND user_id=?`, [calmUntil, guildId, userId]);
      await message.reply({ embeds: [{ color: 0xf39c12, description: "🔥 Campfire smoke calms the bees for **2 hours**. Campfire kit consumed." }] }).catch(() => {});
    } else {
      await message.reply({ embeds: [{ color: 0x95a5a6, description: `🐝 Choose a calming method:\n• \`${ecoPrefix}beehive calm heater\` — electric heater (reusable, 30min)\n• \`${ecoPrefix}beehive calm campfire\` — campfire kit (one-use, 2h)` }] }).catch(() => {});
    }
    return;
  }

  if (sub === "harvest") {
    if (!hive) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ No beehive to harvest." }] }).catch(() => {});
      return;
    }

    // Check if new honeycomb is ready
    const elapsed = now - (hive.last_harvest_at || now);
    const batches = hive.bee_count >= 3 ? Math.floor(elapsed / HONEYCOMB_INTERVAL) : 0;
    let readyCombs = (hive.honeycomb_ready || 0) + batches;

    if (readyCombs < 1) {
      const mins = Math.ceil((HONEYCOMB_INTERVAL - (elapsed % HONEYCOMB_INTERVAL)) / 60000);
      await message.reply({ embeds: [{ color: 0xf39c12, description: `⏰ No honeycomb ready yet. Next batch in **${mins}m**.` }] }).catch(() => {});
      return;
    }

    // Check if bees are calm
    const beesCalm = hive.calm_expires_at && now <= hive.calm_expires_at;
    if (!beesCalm) {
      if (Math.random() < 0.30) {
        const fine = 100;
        await run(`UPDATE user_economy SET balance=MAX(0, balance-?) WHERE guild_id=? AND user_id=?`, [fine, guildId, userId]);
        await run(`UPDATE beehives SET last_harvest_at=?, honeycomb_ready=0 WHERE guild_id=? AND user_id=?`, [now, guildId, userId]);
        await message.reply({ embeds: [{ color: 0xe74c3c, title: "🐝 Stung!", description: `The bees weren't calm! You got stung and lost **${fine} coins**.\n\nNo honeycomb collected. Calm them first next time!` }] }).catch(() => {});
        return;
      }
      // Lucky — no sting but they fly off and take some honey
      readyCombs = Math.max(0, readyCombs - 1);
    }

    await run(`UPDATE beehives SET last_harvest_at=?, honeycomb_ready=0 WHERE guild_id=? AND user_id=?`, [now, guildId, userId]);
    // Farmer class: 30% more honeycomb
    const hiveClass = await get(`SELECT class_id FROM user_class WHERE guild_id=? AND user_id=?`, [guildId, userId]);
    const hiveFarmerBonus = hiveClass?.class_id === 'farmer' ? Math.max(1, Math.floor(readyCombs * 0.30)) : 0;
    const totalCombs = readyCombs + hiveFarmerBonus;
    const hiveFarmerNote = hiveFarmerBonus > 0 ? `\n🌾 **Farmer Bonus: +${hiveFarmerBonus} extra honeycomb!**` : "";
    await addItem(run, guildId, userId, "honeycomb", totalCombs);
    await message.reply({ embeds: [{ color: 0xf39c12, title: "🍯 Honeycomb Harvested!", description: `You collected **${totalCombs}x honeycomb**!${hiveFarmerNote}\n\nUse it in brewing recipes with \`${ecoPrefix}brew start mead\`.` }] }).catch(() => {});
    return;
  }

  await message.reply({ embeds: [{ color: 0x95a5a6, description: `🐝 Usage: \`${ecoPrefix}beehive [setup|check|calm|harvest]\`` }] }).catch(() => {});
}

// ─────────────────────────────────────────────────────────────────
// GRAPE VINE
// ─────────────────────────────────────────────────────────────────

async function cmdGrapes(message, args, util) {
  const { economySettings, ecoPrefix, run, get } = util;

  if (!economySettings?.enabled) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Economy system is disabled." }] }).catch(() => {});
    return;
  }

  await ensureUser(run, get, message.guild.id, message.author.id);
  const sub = (args[0] || "").toLowerCase();
  const guildId = message.guild.id;
  const userId = message.author.id;
  const now = Date.now();
  const GRAPE_INTERVAL = 6 * 3600_000;

  const vineOp = await get(`SELECT * FROM illegal_ops WHERE guild_id=? AND user_id=? AND op_type='grape_vine'`, [guildId, userId]);

  if (!sub || sub === "check") {
    if (!vineOp) {
      await message.reply({ embeds: [{ color: 0x95a5a6, title: "🍇 Grape Vine", description: `No grape vine planted.\n\nBuy a **grape_vine_trellise** from the shop:\n\`${ecoPrefix}grapes buy\`\n\nThen plant:\n\`${ecoPrefix}grapes plant\`` }] }).catch(() => {});
      return;
    }
    const timeLeft = Math.max(0, vineOp.finish_at - now);
    const ready = timeLeft === 0;
    await message.reply({ embeds: [{ color: 0x8e44ad, title: "🍇 Grape Vine Status", description: `${ready ? "✅ **Grapes are ready to harvest!**" : `⏰ Ready in **${Math.ceil(timeLeft / 60000)}m**`}\n\n\`${ecoPrefix}grapes harvest\`` }] }).catch(() => {});
    return;
  }

  if (sub === "buy") {
    const currency = util.economySettings.currency_name || "coins";
    if (!args[1]) {
      await showActivityShop(message, util,
        ["grape_vine_trellise"],
        "🍇 Vineyard Shop",
        ecoPrefix, "grapes"
      );
      return;
    }
    const query = args.slice(1).join(" ");
    const result = await purchaseItem(get, run, guildId, userId, query, currency);
    if (!result.ok) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: result.error }] }).catch(() => {});
    } else {
      await message.reply({ embeds: [{ color: 0x2ecc71, description: `✅ Bought **${result.item.name}** for **${result.finalPrice} ${currency}**.` }] }).catch(() => {});
    }
    return;
  }

  if (sub === "plant") {
    if (vineOp) {
      await message.reply({ embeds: [{ color: 0xf39c12, description: "❌ You already have grapes growing!" }] }).catch(() => {});
      return;
    }
    const trellise = await getInventory(get, guildId, userId, "grape_vine_trellise");
    if (!trellise || trellise.quantity < 1) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ You need a **grape_vine_trellise** from the shop." }] }).catch(() => {});
      return;
    }
    await removeItem(run, guildId, userId, "grape_vine_trellise");
    const finishAt = now + GRAPE_INTERVAL;
    await run(
      `INSERT INTO illegal_ops (guild_id, user_id, op_type, stage, data, started_at, finish_at)
       VALUES (?, ?, 'grape_vine', 1, '{}', ?, ?)`,
      [guildId, userId, now, finishAt]
    );
    await message.reply({ embeds: [{ color: 0x8e44ad, title: "🍇 Grapes Planted!", description: `Your grape vine is growing! 🌱\n\n⏰ Ready to harvest in **6h**.\n\nUse grapes in brewing: \`${ecoPrefix}brew start wine\`` }] }).catch(() => {});
    return;
  }

  if (sub === "harvest") {
    if (!vineOp) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ No grape vine growing." }] }).catch(() => {});
      return;
    }
    if (now < vineOp.finish_at) {
      const mins = Math.ceil((vineOp.finish_at - now) / 60000);
      await message.reply({ embeds: [{ color: 0xf39c12, description: `⏰ Not ready! Come back in **${mins}m**.` }] }).catch(() => {});
      return;
    }
    const grapes = 4 + Math.floor(Math.random() * 5); // 4-8
    await run(`DELETE FROM illegal_ops WHERE guild_id=? AND user_id=? AND op_type='grape_vine'`, [guildId, userId]);
    // Farmer class: 30% more grapes (at least 1 extra)
    const grapeClass = await get(`SELECT class_id FROM user_class WHERE guild_id=? AND user_id=?`, [guildId, userId]);
    const grapeFarmerBonus = grapeClass?.class_id === 'farmer' ? Math.max(1, Math.floor(grapes * 0.30)) : 0;
    const totalGrapes = grapes + grapeFarmerBonus;
    const grapeFarmerNote = grapeFarmerBonus > 0 ? `\n🌾 **Farmer Bonus: +${grapeFarmerBonus} extra grapes!**` : "";
    // Replant automatically
    const finishAt = now + GRAPE_INTERVAL;
    await run(
      `INSERT INTO illegal_ops (guild_id, user_id, op_type, stage, data, started_at, finish_at)
       VALUES (?, ?, 'grape_vine', 1, '{}', ?, ?)`,
      [guildId, userId, now, finishAt]
    );
    await addItem(run, guildId, userId, "grape", totalGrapes);
    await message.reply({ embeds: [{ color: 0x8e44ad, title: "🍇 Grapes Harvested!", description: `You harvested **${totalGrapes}x grape**!${grapeFarmerNote} 🍷\n\nVine replanted automatically — next harvest in **6h**.` }] }).catch(() => {});
    return;
  }

  await message.reply({ embeds: [{ color: 0x95a5a6, description: `🍇 Usage: \`${ecoPrefix}grapes [plant|check|harvest]\`` }] }).catch(() => {});
}

// ─────────────────────────────────────────────────────────────────
// BREWING
// ─────────────────────────────────────────────────────────────────

const BREW_RECIPES = {
  ale: {
    name: "Ale", duration: 1 * 3600_000, output: "ale_bottle",
    ingredients: { water_jug: 1, bread_yeast: 1, sugar: 1 },
    sellMin: 300, sellMax: 500,
  },
  apple_cider: {
    name: "Apple Cider", duration: 0.75 * 3600_000, output: "apple_cider_bottle",
    ingredients: { apple: 3 },
    sellMin: 200, sellMax: 350,
  },
  berry_wine: {
    name: "Berry Wine", duration: 1.5 * 3600_000, output: "berry_wine_bottle",
    ingredients: { berry: 5 },
    sellMin: 400, sellMax: 600,
  },
  wine: {
    name: "Wine", duration: 2 * 3600_000, output: "wine_bottle",
    ingredients: { grape: 6 },
    sellMin: 700, sellMax: 1000,
  },
  mead: {
    name: "Mead", duration: 3 * 3600_000, output: "mead_bottle",
    ingredients: { honeycomb: 2 },
    sellMin: 1200, sellMax: 1800,
  },
};

async function cmdBrew(message, args, util) {
  const { economySettings, ecoPrefix, run, get } = util;

  if (!economySettings?.enabled) {
    await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Economy system is disabled." }] }).catch(() => {});
    return;
  }

  await ensureUser(run, get, message.guild.id, message.author.id);
  const sub = (args[0] || "").toLowerCase();
  const guildId = message.guild.id;
  const userId = message.author.id;
  const currency = economySettings.currency_name || "coins";
  const now = Date.now();

  const existingBrew = await get(`SELECT * FROM illegal_ops WHERE guild_id=? AND user_id=? AND op_type LIKE 'brew_%'`, [guildId, userId]);

  if (!sub || sub === "recipes" || sub === "list") {
    const recipeLines = Object.entries(BREW_RECIPES).map(([id, r]) => {
      const ings = Object.entries(r.ingredients).map(([item, qty]) => `${qty}x ${item}`).join(", ");
      return `**${r.name}** (\`${id}\`) — ${ings} → ${Math.round(r.duration / 3600_000 * 10) / 10}h → ${r.sellMin}–${r.sellMax} ${currency}`;
    });
    await message.reply({ embeds: [new EmbedBuilder()
      .setColor(0xe67e22)
      .setTitle("🍺 Illegal Brewing Recipes")
      .setDescription(`All recipes require a **brewing_barrel** in inventory.\n\n${recipeLines.join("\n")}\n\nStart: \`${ecoPrefix}brew start <recipe>\`\nShop: \`${ecoPrefix}brew buy\``)
      .setFooter({ text: "Selling carries a 30% raid risk — all bottles confiscated + 30% fine" })
    ] }).catch(() => {});
    return;
  }

  if (sub === "buy") {
    if (!args[1]) {
      await showActivityShop(message, util,
        ["brewing_barrel", "empty_bottle", "water_jug", "bread_yeast", "sugar", "apple", "berry"],
        "🍺 Brew Supplies Shop",
        ecoPrefix, "brew"
      );
      return;
    }
    const query = args.slice(1).join(" ");
    const result = await purchaseItem(get, run, guildId, userId, query, currency);
    if (!result.ok) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: result.error }] }).catch(() => {});
    } else {
      await message.reply({ embeds: [{ color: 0x2ecc71, description: `✅ Bought **${result.item.name}** for **${result.finalPrice} ${currency}**.` }] }).catch(() => {});
    }
    return;
  }

  if (sub === "check") {
    if (!existingBrew) {
      await message.reply({ embeds: [{ color: 0x95a5a6, description: `No active brew. Start one with \`${ecoPrefix}brew start <recipe>\`.` }] }).catch(() => {});
      return;
    }
    const data = JSON.parse(existingBrew.data);
    const timeLeft = Math.max(0, existingBrew.finish_at - now);
    const ready = timeLeft === 0;
    await message.reply({ embeds: [{ color: 0xe67e22, title: "🍺 Brew Status", description: `**${data.recipe_name}**\n${ready ? "✅ **Ready to harvest!**" : `⏰ Ready in **${Math.ceil(timeLeft / 60000)}m**`}` }] }).catch(() => {});
    return;
  }

  if (sub === "start") {
    if (existingBrew) {
      await message.reply({ embeds: [{ color: 0xf39c12, description: "❌ Already brewing something! Harvest it first." }] }).catch(() => {});
      return;
    }
    const recipeKey = (args[1] || "").toLowerCase();
    const recipe = BREW_RECIPES[recipeKey];
    if (!recipe) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: `❌ Unknown recipe. Use \`${ecoPrefix}brew list\` to see recipes.` }] }).catch(() => {});
      return;
    }
    const barrel = await getInventory(get, guildId, userId, "brewing_barrel");
    if (!barrel || barrel.quantity < 1) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ You need a **brewing_barrel** from the shop." }] }).catch(() => {});
      return;
    }
    for (const [matId, qty] of Object.entries(recipe.ingredients)) {
      const inv = await getInventory(get, guildId, userId, matId);
      if (!inv || inv.quantity < qty) {
        await message.reply({ embeds: [{ color: 0xe74c3c, description: `❌ Missing **${qty}x ${matId}** (have ${inv?.quantity || 0}).` }] }).catch(() => {});
        return;
      }
    }
    for (const [matId, qty] of Object.entries(recipe.ingredients)) {
      await removeItem(run, guildId, userId, matId, qty);
    }
    const finishAt = now + recipe.duration;
    await run(
      `INSERT INTO illegal_ops (guild_id, user_id, op_type, stage, data, started_at, finish_at)
       VALUES (?, ?, ?, 1, ?, ?, ?)`,
      [guildId, userId, `brew_${recipeKey}`, JSON.stringify({ recipe_name: recipe.name, recipe_key: recipeKey, output: recipe.output, sell_min: recipe.sellMin, sell_max: recipe.sellMax }), now, finishAt]
    );
    const hrs = Math.round(recipe.duration / 3600_000 * 10) / 10;
    await message.reply({ embeds: [{ color: 0xe67e22, title: `🍺 Brewing ${recipe.name}!`, description: `Ingredients used. The barrel is fermenting...\n\n⏰ Ready in **${hrs}h**\n\nHarvest with \`${ecoPrefix}brew harvest\`.` }] }).catch(() => {});
    return;
  }

  if (sub === "harvest") {
    if (!existingBrew) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ Nothing is brewing." }] }).catch(() => {});
      return;
    }
    if (now < existingBrew.finish_at) {
      const mins = Math.ceil((existingBrew.finish_at - now) / 60000);
      await message.reply({ embeds: [{ color: 0xf39c12, description: `⏰ Not ready! Come back in **${mins}m**.` }] }).catch(() => {});
      return;
    }
    const data = JSON.parse(existingBrew.data);
    const qty = 2 + Math.floor(Math.random() * 4); // 2-5 bottles
    await run(`DELETE FROM illegal_ops WHERE guild_id=? AND user_id=? AND op_type=?`, [guildId, userId, existingBrew.op_type]);
    await addItem(run, guildId, userId, data.output, qty);
    await message.reply({ embeds: [{ color: 0x2ecc71, title: `🍺 ${data.recipe_name} Ready!`, description: `You bottled **${qty}x ${data.output.replace(/_/g, " ")}**! 🎉\n\nSell with \`${ecoPrefix}brew sell\`.` }] }).catch(() => {});
    return;
  }

  if (sub === "sell") {
    const qty = parseInt(args[1]) || 1;
    // Find a bottle to sell
    const bottles = ["ale_bottle", "apple_cider_bottle", "berry_wine_bottle", "wine_bottle", "mead_bottle"];
    let soldBottle = null;
    let soldQty = 0;
    for (const bottleId of bottles) {
      const inv = await getInventory(get, guildId, userId, bottleId);
      if (inv && inv.quantity >= 1) {
        soldBottle = bottleId;
        soldQty = Math.min(qty, inv.quantity);
        break;
      }
    }
    if (!soldBottle) {
      await message.reply({ embeds: [{ color: 0xe74c3c, description: "❌ You have no bottled brew to sell." }] }).catch(() => {});
      return;
    }

    // 30% raid risk
    if (Math.random() < 0.30) {
      // Confiscate all brew bottles
      for (const bottleId of bottles) {
        const inv = await getInventory(get, guildId, userId, bottleId);
        if (inv && inv.quantity > 0) {
          await run(`UPDATE user_inventory SET quantity=0 WHERE guild_id=? AND user_id=? AND item_id=?`, [guildId, userId, bottleId]);
        }
      }
      const economy = await get(`SELECT balance FROM user_economy WHERE guild_id=? AND user_id=?`, [guildId, userId]);
      const fine = Math.floor(economy.balance * 0.30);
      await run(`UPDATE user_economy SET balance=MAX(0, balance-?) WHERE guild_id=? AND user_id=?`, [fine, guildId, userId]);
      await message.reply({ embeds: [{ color: 0xe74c3c, title: "🚔 Raid!", description: `Revenue agents raided your operation! All bottles confiscated.\n\n💸 Fine: **${fine} ${currency}**` }] }).catch(() => {});
      return;
    }

    // Find recipe for price
    const recipeForBottle = Object.values(BREW_RECIPES).find(r => r.output === soldBottle);
    const sellMin = recipeForBottle?.sellMin || 200;
    const sellMax = recipeForBottle?.sellMax || 500;
    const priceEach = Math.floor(sellMin + Math.random() * (sellMax - sellMin));
    const totalEarned = priceEach * soldQty;

    await removeItem(run, guildId, userId, soldBottle, soldQty);
    await run(`UPDATE user_economy SET balance=balance+? WHERE guild_id=? AND user_id=?`, [totalEarned, guildId, userId]);
    await message.reply({ embeds: [{ color: 0x2ecc71, title: "💰 Brew Sold!", description: `Sold **${soldQty}x ${soldBottle.replace(/_/g, " ")}** for **${totalEarned} ${currency}** (${priceEach} each).\n\n*Cheers!* 🥂` }] }).catch(() => {});
    return;
  }

  await message.reply({ embeds: [{ color: 0x95a5a6, description: `🍺 Usage: \`${ecoPrefix}brew [list|start|check|harvest|sell] [recipe]\`` }] }).catch(() => {});
}

// ─────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────

module.exports = { cmdWeapons, cmdGrowWeed, cmdCook, cmdBeehive, cmdGrapes, cmdBrew };
