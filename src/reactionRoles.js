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

  console.log(`[ReactionRole] Add - Looking for binding: guild=${guild.id}, msg=${message.id}, emoji=${emojiKey}`);
  
  const binding = await getReactionRoleBinding(guild.id, message.id, emojiKey).catch(() => null);
  if (!binding?.role_id) {
    console.log(`[ReactionRole] No binding found for emoji: ${emojiKey}`);
    return;
  }

  const mode = binding.mode || 'toggle';
  console.log(`[ReactionRole] Found binding for emoji ${emojiKey} -> role ${binding.role_id} (mode: ${mode})`);

  // Only process if mode is 'add' or 'toggle'
  if (mode !== 'add' && mode !== 'toggle') {
    console.log(`[ReactionRole] Mode is '${mode}', skipping add`);
    return;
  }

  const member = guild.members.cache.get(user.id) || await guild.members.fetch(user.id).catch(() => null);
  if (!member) return;

  const role = guild.roles.cache.get(binding.role_id) || await guild.roles.fetch(binding.role_id).catch(() => null);
  if (!role) {
    console.log(`[ReactionRole] Role ${binding.role_id} not found`);
    return;
  }

  console.log(`[ReactionRole] Adding role ${role.name} to ${member.user.tag}`);
  await member.roles.add(role).catch((err) => {
    console.error(`[ReactionRole] Failed to add role:`, err);
  });
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

  console.log(`[ReactionRole] Remove - Looking for binding: guild=${guild.id}, msg=${message.id}, emoji=${emojiKey}`);

  const binding = await getReactionRoleBinding(guild.id, message.id, emojiKey).catch(() => null);
  if (!binding?.role_id) return;

  const mode = binding.mode || 'toggle';
  console.log(`[ReactionRole] Found binding with mode: ${mode}`);
  
  // Only process if mode is 'remove' or 'toggle'
  if (mode !== 'remove' && mode !== 'toggle') {
    console.log(`[ReactionRole] Mode is '${mode}', skipping remove`);
    return;
  }

  const member = guild.members.cache.get(user.id) || await guild.members.fetch(user.id).catch(() => null);
  if (!member) return;

  const role = guild.roles.cache.get(binding.role_id) || await guild.roles.fetch(binding.role_id).catch(() => null);
  if (!role) return;

  console.log(`[ReactionRole] Removing role ${role.name} from ${member.user.tag}`);
  await member.roles.remove(role).catch((err) => {
    console.error(`[ReactionRole] Failed to remove role:`, err);
  });
}

module.exports = {
  normalizeEmojiKey,
  emojiKeyFromReaction,
  applyReactionRoleOnAdd,
  applyReactionRoleOnRemove
};
