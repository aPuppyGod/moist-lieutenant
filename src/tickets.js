const {
  ChannelType,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require("discord.js");

const {
  getTicketSettings,
  upsertTicketSettings,
  getOpenTicketByUser,
  getTicketByChannel,
  createTicket,
  closeTicket
} = require("./settings");

function cleanPrefix(prefix) {
  const value = String(prefix || "ticket").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 16);
  return value || "ticket";
}

function ticketOpenButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_open")
      .setLabel("Open Ticket")
      .setStyle(ButtonStyle.Primary)
  );
}

function ticketCloseButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_close")
      .setLabel("Close Ticket")
      .setStyle(ButtonStyle.Danger)
  );
}

async function sendTicketPanel(guild) {
  const settings = await getTicketSettings(guild.id);
  if (!settings.enabled) return { ok: false, reason: "Ticket system is disabled." };
  if (!settings.panel_channel_id) return { ok: false, reason: "Set a panel channel first." };

  const panelChannel = guild.channels.cache.get(settings.panel_channel_id)
    || await guild.channels.fetch(settings.panel_channel_id).catch(() => null);
  if (!panelChannel || !panelChannel.isTextBased || !panelChannel.isTextBased()) {
    return { ok: false, reason: "Panel channel not found or not text-based." };
  }

  const embed = new EmbedBuilder()
    .setColor(0x7bc96f)
    .setTitle("Support Tickets")
    .setDescription("Need help? Click **Open Ticket** below. A private channel will be created for you and staff.")
    .setTimestamp(new Date());

  const panelMessage = await panelChannel.send({
    embeds: [embed],
    components: [ticketOpenButton()]
  }).catch(() => null);

  if (!panelMessage) return { ok: false, reason: "Failed to send ticket panel." };

  await upsertTicketSettings(guild.id, { panel_message_id: panelMessage.id });
  return { ok: true, messageId: panelMessage.id, channelId: panelChannel.id };
}

async function createTicketChannel(guild, openerId) {
  const settings = await getTicketSettings(guild.id);
  const prefix = cleanPrefix(settings.ticket_prefix);

  const existing = await getOpenTicketByUser(guild.id, openerId);
  if (existing?.channel_id) {
    const existingChannel = guild.channels.cache.get(existing.channel_id)
      || await guild.channels.fetch(existing.channel_id).catch(() => null);
    if (existingChannel) {
      return { ok: false, reason: `You already have an open ticket: <#${existingChannel.id}>` };
    }
  }

  const opener = guild.members.cache.get(openerId) || await guild.members.fetch(openerId).catch(() => null);
  if (!opener) return { ok: false, reason: "Could not find ticket opener in this server." };

  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionsBitField.Flags.ViewChannel]
    },
    {
      id: opener.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.AttachFiles,
        PermissionsBitField.Flags.AddReactions
      ]
    },
    {
      id: guild.client.user.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.ManageChannels,
        PermissionsBitField.Flags.ManageMessages
      ]
    }
  ];

  if (settings.support_role_id) {
    overwrites.push({
      id: settings.support_role_id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.AttachFiles,
        PermissionsBitField.Flags.AddReactions
      ]
    });
  }

  for (const [, role] of guild.roles.cache) {
    if (role.permissions.has(PermissionsBitField.Flags.Administrator)) {
      overwrites.push({
        id: role.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory
        ]
      });
    }
  }

  const suffix = String(Date.now()).slice(-4);
  const baseName = `${prefix}-${opener.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 90);
  const channelName = `${baseName}-${suffix}`.slice(0, 95);

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: settings.category_id || undefined,
    permissionOverwrites: overwrites
  }).catch(() => null);

  if (!channel) return { ok: false, reason: "Failed to create ticket channel." };

  await createTicket(guild.id, channel.id, opener.id);

  const firstEmbed = new EmbedBuilder()
    .setColor(0xa8d5a8)
    .setTitle("Ticket Opened")
    .setDescription(`Hello ${opener}, support will be with you shortly.`)
    .addFields(
      { name: "Opened By", value: `${opener.user.tag}`, inline: true },
      { name: "Ticket Channel", value: `<#${channel.id}>`, inline: true }
    )
    .setTimestamp(new Date());

  await channel.send({
    content: settings.support_role_id ? `<@&${settings.support_role_id}>` : undefined,
    embeds: [firstEmbed],
    components: [ticketCloseButton()],
    allowedMentions: { roles: settings.support_role_id ? [settings.support_role_id] : [] }
  }).catch(() => {});

  return { ok: true, channel };
}

async function closeTicketChannel(guild, channelId, closedByUserId) {
  const ticket = await getTicketByChannel(guild.id, channelId);
  if (!ticket || ticket.status !== "open") return { ok: false, reason: "This channel is not an open ticket." };

  const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
  if (!channel) return { ok: false, reason: "Ticket channel not found." };

  await closeTicket(guild.id, channelId, closedByUserId);

  const safeName = String(channel.name || "ticket").replace(/^closed-/, "");
  await channel.setName(`closed-${safeName}`.slice(0, 95)).catch(() => {});

  const openerId = ticket.opener_id;
  await channel.permissionOverwrites.edit(openerId, {
    SendMessages: false,
    AddReactions: false
  }).catch(() => {});

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x8b7355)
        .setTitle("Ticket Closed")
        .setDescription("This ticket has been closed. Staff can still review the channel.")
        .setTimestamp(new Date())
    ]
  }).catch(() => {});

  return { ok: true };
}

async function handleTicketInteraction(interaction) {
  if (!interaction?.isButton || !interaction.isButton()) return false;
  if (!interaction.guild) return false;
  if (interaction.customId !== "ticket_open" && interaction.customId !== "ticket_close") return false;

  const guild = interaction.guild;
  const settings = await getTicketSettings(guild.id);
  if (!settings.enabled) {
    await interaction.reply({ content: "Ticket system is disabled.", ephemeral: true }).catch(() => {});
    return true;
  }

  if (interaction.customId === "ticket_open") {
    const opened = await createTicketChannel(guild, interaction.user.id);
    if (!opened.ok) {
      await interaction.reply({ content: `❌ ${opened.reason}`, ephemeral: true }).catch(() => {});
      return true;
    }
    await interaction.reply({ content: `✅ Ticket created: <#${opened.channel.id}>`, ephemeral: true }).catch(() => {});
    return true;
  }

  const ticket = await getTicketByChannel(guild.id, interaction.channelId);
  if (!ticket) {
    await interaction.reply({ content: "This is not a ticket channel.", ephemeral: true }).catch(() => {});
    return true;
  }

  const member = interaction.member;
  const hasAdmin = Boolean(member?.permissions?.has(PermissionsBitField.Flags.Administrator));
  const isOpener = ticket.opener_id === interaction.user.id;
  const hasSupport = Boolean(settings.support_role_id && member?.roles?.cache?.has(settings.support_role_id));

  if (!hasAdmin && !isOpener && !hasSupport) {
    await interaction.reply({ content: "Only ticket opener, support role, or admins can close tickets.", ephemeral: true }).catch(() => {});
    return true;
  }

  const closed = await closeTicketChannel(guild, interaction.channelId, interaction.user.id);
  if (!closed.ok) {
    await interaction.reply({ content: `❌ ${closed.reason}`, ephemeral: true }).catch(() => {});
    return true;
  }

  await interaction.reply({ content: "✅ Ticket closed.", ephemeral: true }).catch(() => {});
  return true;
}

module.exports = {
  sendTicketPanel,
  handleTicketInteraction,
  closeTicketChannel
};
