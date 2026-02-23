const LOG_EVENT_DEFS = [
  { key: "message_delete", label: "Message Delete" },
  { key: "message_edit", label: "Message Edit" },
  { key: "message_bulk_delete", label: "Bulk Message Delete" },
  { key: "member_join", label: "Member Join" },
  { key: "member_leave", label: "Member Leave" },
  { key: "member_join_new_account", label: "New Account Join Warning" },
  { key: "member_role_update", label: "Member Role Update" },
  { key: "member_nick_update", label: "Nickname Changes" },
  { key: "member_timeout", label: "Mute/Unmute (Timeout)" },
  { key: "ban_add", label: "Ban" },
  { key: "ban_remove", label: "Unban" },
  { key: "channel_create", label: "Channel Create" },
  { key: "channel_delete", label: "Channel Delete" },
  { key: "channel_update", label: "Channel Update" },
  { key: "role_create", label: "Role Create" },
  { key: "role_delete", label: "Role Delete" },
  { key: "role_update", label: "Role Update" },
  { key: "guild_update", label: "Server Update" },
  { key: "voice_join", label: "Voice Join" },
  { key: "voice_leave", label: "Voice Leave" },
  { key: "voice_move", label: "Voice Move" }
];

module.exports = {
  LOG_EVENT_DEFS
};
