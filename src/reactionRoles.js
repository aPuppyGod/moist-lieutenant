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

  const emojiKey = normalizeEmojiKey(emojiKeyFromReaction(reaction));
  if (!emojiKey) return;

  const binding = await getReactionRoleBinding(guild.id, message.id, emojiKey).catch(() => null);
  if (!binding?.role_id) return;

  const member = guild.members.cache.get(user.id) || await guild.members.fetch(user.id).catch(() => null);
  if (!member) return;

  const role = guild.roles.cache.get(binding.role_id) || await guild.roles.fetch(binding.role_id).catch(() => null);
  if (!role) return;

  await member.roles.add(role).catch(() => {});
}

async function applyReactionRoleOnRemove(reaction, user) {
  if (!reaction?.message?.guild || !user || user.bot) return;

  const guild = reaction.message.guild;
  const message = reaction.message.partial
    ? await reaction.message.fetch().catch(() => null)
    : reaction.message;

  if (!message) return;

  const emojiKey = normalizeEmojiKey(emojiKeyFromReaction(reaction));
  if (!emojiKey) return;

  const binding = await getReactionRoleBinding(guild.id, message.id, emojiKey).catch(() => null);
  if (!binding?.role_id) return;
  if (Number(binding.remove_on_unreact) !== 1) return;

  const member = guild.members.cache.get(user.id) || await guild.members.fetch(user.id).catch(() => null);
  if (!member) return;

  const role = guild.roles.cache.get(binding.role_id) || await guild.roles.fetch(binding.role_id).catch(() => null);
  if (!role) return;

  await member.roles.remove(role).catch(() => {});
}

module.exports = {
  normalizeEmojiKey,
  emojiKeyFromReaction,
  applyReactionRoleOnAdd,
  applyReactionRoleOnRemove
};
