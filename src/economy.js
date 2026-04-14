const { all, get, run } = require("./db");

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
    await message.reply("❌ Economy system is disabled.").catch(() => {});
    return;
  }

  const storyId = args[0]?.toLowerCase();
  if (!storyId || !SWAMP_STORIES[storyId]) {
    const availableStories = Object.entries(SWAMP_STORIES).map(([id, story]) => 
      `**${id}**: ${story.title}`
    ).join('\n');
    
    await message.reply(`🗺️ **Swamp Adventures**\n\nChoose your adventure:\n${availableStories}\n\nUsage: \`${ecoPrefix}adventure <story_id>\``).catch(() => {});
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
    await message.reply(`✅ **${story.title}**\n\nYou have completed this adventure!`).catch(() => {});
    return;
  }

  const choicesText = chapter.choices.map((choice, i) => 
    `${i + 1}. ${choice.text}`
  ).join('\n');

  await message.reply(`📖 **${story.title} - Chapter ${currentChapter}**\n\n${chapter.text}\n\n**Choices:**\n${choicesText}\n\nReply with the number of your choice!`).catch(() => {});

  // Set up choice collector
  const filter = (m) => m.author.id === message.author.id && /^\d+$/.test(m.content.trim());
  const collector = message.channel.createMessageCollector({ filter, time: 30000, max: 1 });

  collector.on('collect', async (choiceMsg) => {
    const choiceIndex = parseInt(choiceMsg.content.trim()) - 1;
    const choice = chapter.choices[choiceIndex];

    if (!choice) {
      await choiceMsg.reply("❌ Invalid choice number!").catch(() => {});
      return;
    }

    // Check death chance
    if (choice.death_chance && Math.random() < choice.death_chance) {
      await handleDeath(message, util, `You died during **${story.title}**! ${DEATH_SCENARIOS[Math.floor(Math.random() * DEATH_SCENARIOS.length)]}`);
      return;
    }

    // Apply consequence
    let rewardText = "";
    if (choice.reward) {
      await giveReward(message, choice.reward, util);
      rewardText = `\n\n🎁 **Reward:** ${choice.reward.replace(/_/g, ' ').toUpperCase()}!`;
    }

    // Update progress
    const nextChapter = currentChapter + 1;
    const isCompleted = !story.chapters[nextChapter];

    await runCmd(
      `INSERT INTO story_progress (guild_id, user_id, story_id, chapter, completed, last_updated)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (guild_id, user_id, story_id) DO UPDATE SET
       chapter=?, completed=?, last_updated=?`,
      [message.guild.id, message.author.id, storyId, nextChapter, isCompleted ? 1 : 0, Date.now(), nextChapter, isCompleted ? 1 : 0, Date.now()]
    );

    const completionText = isCompleted ? "\n\n🏆 **Adventure Completed!**" : `\n\n📖 Continue to Chapter ${nextChapter}...`;
    await choiceMsg.reply(`✅ **Choice Made:** ${choice.text}${rewardText}${completionText}`).catch(() => {});
  });

  collector.on('end', (collected, reason) => {
    if (reason === 'time') {
      message.reply("⏰ Time's up! Adventure cancelled.").catch(() => {});
    }
  });
}

// ==================== RANDOM SWAMP EVENTS ====================

async function cmdExplore(message, args, util) {
  const { economySettings, ecoPrefix, run: runCmd, get: getCmd } = util;
  
  if (!economySettings?.enabled) {
    await message.reply("❌ Economy system is disabled.").catch(() => {});
    return;
  }

  // Check for exploration cooldown (10 minutes)
  const lastExplore = await getCmd(
    `SELECT * FROM minigames_stats WHERE guild_id=? AND user_id=? AND minigame='exploration' AND stat_name='last_explore'`,
    [message.guild.id, message.author.id]
  );

  const now = Date.now();
  const cooldown = 600000; // 10 minutes
  if (lastExplore?.last_played && (now - lastExplore.last_played) < cooldown) {
    const timeLeft = cooldown - (now - lastExplore.last_played);
    const minutes = Math.floor(timeLeft / 60000);
    await message.reply(`🌿 You're still recovering from your last expedition! Come back in ${minutes} minutes.`).catch(() => {});
    return;
  }

  // Random event
  const event = SWAMP_EVENTS[Math.floor(Math.random() * SWAMP_EVENTS.length)];
  const choicesText = event.choices.map((choice, i) => 
    `${i + 1}. ${choice.text}`
  ).join('\n');

  await message.reply(`🗺️ **Swamp Exploration**\n\n${event.title}\n${event.description}\n\n**Choices:**\n${choicesText}\n\nReply with the number of your choice!`).catch(() => {});

  // Set up choice collector
  const filter = (m) => m.author.id === message.author.id && /^\d+$/.test(m.content.trim());
  const collector = message.channel.createMessageCollector({ filter, time: 30000, max: 1 });

  collector.on('collect', async (choiceMsg) => {
    const choiceIndex = parseInt(choiceMsg.content.trim()) - 1;
    const choice = event.choices[choiceIndex];

    if (!choice) {
      await choiceMsg.reply("❌ Invalid choice number!").catch(() => {});
      return;
    }

    // Check requirements
    if (choice.requires) {
      const hasItem = await getCmd(
        `SELECT * FROM user_inventory WHERE guild_id=? AND user_id=? AND item_id=? AND quantity > 0`,
        [message.guild.id, message.author.id, choice.requires]
      );
      if (!hasItem) {
        await choiceMsg.reply(`❌ You need **${choice.requires.replace(/_/g, ' ').toUpperCase()}** for this action!`).catch(() => {});
        return;
      }
    }

    // Check success
    const success = Math.random() < choice.success;
    if (!success) {
      await choiceMsg.reply(`❌ **Failed:** ${choice.consequence}`).catch(() => {});
    } else {
      let rewardText = "";
      if (choice.reward) {
        await giveReward(message, choice.reward, util);
        rewardText = `\n\n🎁 **Reward:** ${choice.reward.replace(/_/g, ' ').toUpperCase()}!`;
      }

      await choiceMsg.reply(`✅ **Success:** ${choice.consequence}${rewardText}`).catch(() => {});
    }

    // Update exploration stats
    await runCmd(
      `INSERT INTO minigames_stats (guild_id, user_id, minigame, stat_name, stat_value, last_played)
       VALUES (?, ?, 'exploration', 'last_explore', 1, ?)
       ON CONFLICT (guild_id, user_id, minigame, stat_name) DO UPDATE SET
       stat_value=stat_value+1, last_played=?`,
      [message.guild.id, message.author.id, now, now]
    );
  });

  collector.on('end', (collected, reason) => {
    if (reason === 'time') {
      message.reply("⏰ Time's up! Exploration cancelled.").catch(() => {});
    }
  });
}

// ==================== DEATH AND REVIVAL SYSTEM ====================

async function handleDeath(message, util, deathMessage) {
  const { run: runCmd, get: getCmd } = util;

  // Check for revival items
  for (const revival of REVIVAL_METHODS) {
    const item = await getCmd(
      `SELECT * FROM user_inventory WHERE guild_id=? AND user_id=? AND item_id=? AND quantity > 0`,
      [message.guild.id, message.author.id, revival.item]
    );

    if (item) {
      // Consume the item and revive
      await runCmd(
        `UPDATE user_inventory SET quantity=quantity-1 WHERE guild_id=? AND user_id=? AND item_id=?`,
        [message.guild.id, message.author.id, revival.item]
      );

      await message.reply(`💀 ${deathMessage}\n\nBut... **${revival.name}** saves you!\n\n${revival.description}`).catch(() => {});
      return;
    }
  }

  // No revival - actual death
  await message.reply(`💀 ${deathMessage}\n\n**You have died!**\n\n💡 **Ways to revive:**\n${REVIVAL_METHODS.map(r => `• ${r.name} (${r.description})`).join('\n')}\n\nBuy revival items from the shop!`).catch(() => {});

  // Reset some progress (but keep items)
  await runCmd(
    `UPDATE user_economy SET balance=balance*0.5 WHERE guild_id=? AND user_id=?`,
    [message.guild.id, message.author.id]
  );
}

// ==================== REWARD SYSTEM ====================

async function giveReward(message, rewardType, util) {
  const { economySettings, run: runCmd } = util;

  const rewards = {
    // Story rewards
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

    // Event rewards
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

// ==================== EXPORTS ====================

module.exports = {
  cmdFish,
  cmdDig,
  cmdRobBank,
  cmdPhone,
  cmdAdventure,
  cmdExplore,
  handleDeath,
  giveReward
};

// ==================== SWAMP ADVENTURE SYSTEM ====================

async function cmdAdventure(message, args, util) {
  const { economySettings, ecoPrefix, run: runCmd, get: getCmd } = util;
  
  if (!economySettings?.enabled) {
    await message.reply("❌ Economy system is disabled.").catch(() => {});
    return;
  }

  const storyId = args[0]?.toLowerCase();
  if (!storyId || !SWAMP_STORIES[storyId]) {
    const availableStories = Object.entries(SWAMP_STORIES).map(([id, story]) => 
      `**${id}**: ${story.title}`
    ).join('\n');
    
    await message.reply(`🗺️ **Swamp Adventures**\n\nChoose your adventure:\n${availableStories}\n\nUsage: \`${ecoPrefix}adventure <story_id>\``).catch(() => {});
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
    await message.reply(`✅ **${story.title}**\n\nYou have completed this adventure!`).catch(() => {});
    return;
  }

  const choicesText = chapter.choices.map((choice, i) => 
    `${i + 1}. ${choice.text}`
  ).join('\n');

  await message.reply(`📖 **${story.title} - Chapter ${currentChapter}**\n\n${chapter.text}\n\n**Choices:**\n${choicesText}\n\nReply with the number of your choice!`).catch(() => {});

  // Set up choice collector
  const filter = (m) => m.author.id === message.author.id && /^\d+$/.test(m.content.trim());
  const collector = message.channel.createMessageCollector({ filter, time: 30000, max: 1 });

  collector.on('collect', async (choiceMsg) => {
    const choiceIndex = parseInt(choiceMsg.content.trim()) - 1;
    const choice = chapter.choices[choiceIndex];

    if (!choice) {
      await choiceMsg.reply("❌ Invalid choice number!").catch(() => {});
      return;
    }

    // Check death chance
    if (choice.death_chance && Math.random() < choice.death_chance) {
      await handleDeath(message, util, `You died during **${story.title}**! ${DEATH_SCENARIOS[Math.floor(Math.random() * DEATH_SCENARIOS.length)]}`);
      return;
    }

    // Apply consequence
    let rewardText = "";
    if (choice.reward) {
      await giveReward(message, choice.reward, util);
      rewardText = `\n\n🎁 **Reward:** ${choice.reward.replace(/_/g, ' ').toUpperCase()}!`;
    }

    // Update progress
    const nextChapter = currentChapter + 1;
    const isCompleted = !story.chapters[nextChapter];

    await runCmd(
      `INSERT INTO story_progress (guild_id, user_id, story_id, chapter, completed, last_updated)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (guild_id, user_id, story_id) DO UPDATE SET
       chapter=?, completed=?, last_updated=?`,
      [message.guild.id, message.author.id, storyId, nextChapter, isCompleted ? 1 : 0, Date.now(), nextChapter, isCompleted ? 1 : 0, Date.now()]
    );

    const completionText = isCompleted ? "\n\n🏆 **Adventure Completed!**" : `\n\n📖 Continue to Chapter ${nextChapter}...`;
    await choiceMsg.reply(`✅ **Choice Made:** ${choice.text}${rewardText}${completionText}`).catch(() => {});
  });

  collector.on('end', (collected, reason) => {
    if (reason === 'time') {
      message.reply("⏰ Time's up! Adventure cancelled.").catch(() => {});
    }
  });
}

// ==================== RANDOM SWAMP EVENTS ====================

async function cmdExplore(message, args, util) {
  const { economySettings, ecoPrefix, run: runCmd, get: getCmd } = util;
  
  if (!economySettings?.enabled) {
    await message.reply("❌ Economy system is disabled.").catch(() => {});
    return;
  }

  // Check for exploration cooldown (10 minutes)
  const lastExplore = await getCmd(
    `SELECT * FROM minigames_stats WHERE guild_id=? AND user_id=? AND minigame='exploration' AND stat_name='last_explore'`,
    [message.guild.id, message.author.id]
  );

  const now = Date.now();
  const cooldown = 600000; // 10 minutes
  if (lastExplore?.last_played && (now - lastExplore.last_played) < cooldown) {
    const timeLeft = cooldown - (now - lastExplore.last_played);
    const minutes = Math.floor(timeLeft / 60000);
    await message.reply(`🌿 You're still recovering from your last expedition! Come back in ${minutes} minutes.`).catch(() => {});
    return;
  }

  // Random event
  const event = SWAMP_EVENTS[Math.floor(Math.random() * SWAMP_EVENTS.length)];
  const choicesText = event.choices.map((choice, i) => 
    `${i + 1}. ${choice.text}`
  ).join('\n');

  await message.reply(`🗺️ **Swamp Exploration**\n\n${event.title}\n${event.description}\n\n**Choices:**\n${choicesText}\n\nReply with the number of your choice!`).catch(() => {});

  // Set up choice collector
  const filter = (m) => m.author.id === message.author.id && /^\d+$/.test(m.content.trim());
  const collector = message.channel.createMessageCollector({ filter, time: 30000, max: 1 });

  collector.on('collect', async (choiceMsg) => {
    const choiceIndex = parseInt(choiceMsg.content.trim()) - 1;
    const choice = event.choices[choiceIndex];

    if (!choice) {
      await choiceMsg.reply("❌ Invalid choice number!").catch(() => {});
      return;
    }

    // Check requirements
    if (choice.requires) {
      const hasItem = await getCmd(
        `SELECT * FROM user_inventory WHERE guild_id=? AND user_id=? AND item_id=? AND quantity > 0`,
        [message.guild.id, message.author.id, choice.requires]
      );
      if (!hasItem) {
        await choiceMsg.reply(`❌ You need **${choice.requires.replace(/_/g, ' ').toUpperCase()}** for this action!`).catch(() => {});
        return;
      }
    }

    // Check success
    const success = Math.random() < choice.success;
    if (!success) {
      await choiceMsg.reply(`❌ **Failed:** ${choice.consequence}`).catch(() => {});
    } else {
      let rewardText = "";
      if (choice.reward) {
        await giveReward(message, choice.reward, util);
        rewardText = `\n\n🎁 **Reward:** ${choice.reward.replace(/_/g, ' ').toUpperCase()}!`;
      }

      await choiceMsg.reply(`✅ **Success:** ${choice.consequence}${rewardText}`).catch(() => {});
    }

    // Update exploration stats
    await runCmd(
      `INSERT INTO minigames_stats (guild_id, user_id, minigame, stat_name, stat_value, last_played)
       VALUES (?, ?, 'exploration', 'last_explore', 1, ?)
       ON CONFLICT (guild_id, user_id, minigame, stat_name) DO UPDATE SET
       stat_value=stat_value+1, last_played=?`,
      [message.guild.id, message.author.id, now, now]
    );
  });

  collector.on('end', (collected, reason) => {
    if (reason === 'time') {
      message.reply("⏰ Time's up! Exploration cancelled.").catch(() => {});
    }
  });
}

// ==================== DEATH AND REVIVAL SYSTEM ====================

async function handleDeath(message, util, deathMessage) {
  const { run: runCmd, get: getCmd } = util;

  // Check for revival items
  for (const revival of REVIVAL_METHODS) {
    const item = await getCmd(
      `SELECT * FROM user_inventory WHERE guild_id=? AND user_id=? AND item_id=? AND quantity > 0`,
      [message.guild.id, message.author.id, revival.item]
    );

    if (item) {
      // Consume the item and revive
      await runCmd(
        `UPDATE user_inventory SET quantity=quantity-1 WHERE guild_id=? AND user_id=? AND item_id=?`,
        [message.guild.id, message.author.id, revival.item]
      );

      await message.reply(`💀 ${deathMessage}\n\nBut... **${revival.name}** saves you!\n\n${revival.description}`).catch(() => {});
      return;
    }
  }

  // No revival - actual death
  await message.reply(`💀 ${deathMessage}\n\n**You have died!**\n\n💡 **Ways to revive:**\n${REVIVAL_METHODS.map(r => `• ${r.name} (${r.description})`).join('\n')}\n\nBuy revival items from the shop!`).catch(() => {});

  // Reset some progress (but keep items)
  await runCmd(
    `UPDATE user_economy SET balance=balance*0.5 WHERE guild_id=? AND user_id=?`,
    [message.guild.id, message.author.id]
  );
}

// ==================== REWARD SYSTEM ====================

async function giveReward(message, rewardType, util) {
  const { economySettings, run: runCmd } = util;

  const rewards = {
    // Story rewards
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

    // Event rewards
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

// ==================== EXPORTS ====================

module.exports = {
  cmdFish,
  cmdDig,
  cmdRobBank,
  cmdPhone,
  cmdAdventure,
  cmdExplore,
  handleDeath,
  giveReward
};

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
