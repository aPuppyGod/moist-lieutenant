const { getReactionRoleBinding } = require("./settings");

function normalizeEmojiKey(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";

  const mentionMatch = value.match(/^<a?:([a-zA-Z0-9_]+):(\d+)>$/);
  if (mentionMatch) {
    return `${mentionMatch[1]}:${mentionMatch[2]}`;
  }

  const customMatch = value.match(/^([a-zA-Z0-9_]+):(\d+)$/);
  if (customMatch) {
    return `${customMatch[1]}:${customMatch[2]}`;
  }

  return value;
}

function emojiKeyFromReaction(reaction) {
  if (!reaction?.emoji) return "";
  if (reaction.emoji.id) return `${reaction.emoji.name}:${reaction.emoji.id}`;
  return reaction.emoji.name || "";
}

async function applyReactionRoleOnAdd(reaction, user) {
  if (!reaction?.message?.guild || !user || user.bot) return;

  const guild = reaction.message.guild;
  const message = reaction.message.partial
    ? await reaction.message.fetch().catch(() => null)
    : reaction.message;

  if (!message) return;

  const emojiKey = emojiKeyFromReaction(reaction);
  if (!emojiKey) return;

  console.log(`[ReactionRole] Add - Looking for bindings: guild=${guild.id}, msg=${message.id}, emoji=${emojiKey}`);
  
  const bindings = await getReactionRoleBinding(guild.id, message.id, emojiKey).catch(() => []);
  if (!bindings || bindings.length === 0) {
    console.log(`[ReactionRole] No bindings found for emoji: ${emojiKey}`);
    return;
  }

  console.log(`[ReactionRole] Found ${bindings.length} binding(s) for emoji ${emojiKey}`);

  const member = guild.members.cache.get(user.id) || await guild.members.fetch(user.id).catch(() => null);
  if (!member) return;

  // Process all bindings
  for (const binding of bindings) {
    const mode = binding.mode || 'toggle';
    
    // Only process if mode is 'add' or 'toggle'
    if (mode !== 'add' && mode !== 'toggle') {
      console.log(`[ReactionRole] Role ${binding.role_id} mode is '${mode}', skipping add`);
      continue;
    }

    const role = guild.roles.cache.get(binding.role_id) || await guild.roles.fetch(binding.role_id).catch(() => null);
    if (!role) {
      console.log(`[ReactionRole] Role ${binding.role_id} not found`);
      continue;
    }

    console.log(`[ReactionRole] Adding role ${role.name} to ${member.user.tag} (mode: ${mode})`);
    await member.roles.add(role).catch((err) => {
      console.error(`[ReactionRole] Failed to add role ${role.name}:`, err);
    });
  }
}

async function applyReactionRoleOnRemove(reaction, user) {
  if (!reaction?.message?.guild || !user || user.bot) return;

  const guild = reaction.message.guild;
  const message = reaction.message.partial
    ? await reaction.message.fetch().catch(() => null)
    : reaction.message;

  if (!message) return;

  const emojiKey = emojiKeyFromReaction(reaction);
  if (!emojiKey) return;

  console.log(`[ReactionRole] Remove - Looking for bindings: guild=${guild.id}, msg=${message.id}, emoji=${emojiKey}`);

  const bindings = await getReactionRoleBinding(guild.id, message.id, emojiKey).catch(() => []);
  if (!bindings || bindings.length === 0) return;

  console.log(`[ReactionRole] Found ${bindings.length} binding(s) for emoji ${emojiKey}`);

  const member = guild.members.cache.get(user.id) || await guild.members.fetch(user.id).catch(() => null);
  if (!member) return;

  // Process all bindings
  for (const binding of bindings) {
    const mode = binding.mode || 'toggle';
    
    // Only process if mode is 'remove' or 'toggle'
    if (mode !== 'remove' && mode !== 'toggle') {
      console.log(`[ReactionRole] Role ${binding.role_id} mode is '${mode}', skipping remove`);
      continue;
    }

    const role = guild.roles.cache.get(binding.role_id) || await guild.roles.fetch(binding.role_id).catch(() => null);
    if (!role) continue;

    console.log(`[ReactionRole] Removing role ${role.name} from ${member.user.tag} (mode: ${mode})`);
    await member.roles.remove(role).catch((err) => {
      console.error(`[ReactionRole] Failed to remove role ${role.name}:`, err);
    });
  }
}

module.exports = {
  normalizeEmojiKey,
  emojiKeyFromReaction,
  applyReactionRoleOnAdd,
  applyReactionRoleOnRemove
};
