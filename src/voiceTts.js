const {
  joinVoiceChannel,
  getVoiceConnection,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  NoSubscriberBehavior,
  entersState,
  StreamType
} = require("@discordjs/voice");
const { ChannelType } = require("discord.js");
const googleTTS = require("google-tts-api");
const prism = require("prism-media");

function createGuildPlayer() {
  const player = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Stop }
  });

  player.on("error", (err) => {
    console.error("[voice-tts] Audio player error:", err);
  });

  player.on(AudioPlayerStatus.Playing, () => {
    console.log("[voice-tts] Player status: playing");
  });

  player.on(AudioPlayerStatus.Buffering, () => {
    console.log("[voice-tts] Player status: buffering");
  });

  player.on(AudioPlayerStatus.Idle, () => {
    console.log("[voice-tts] Player status: idle");
  });

  return player;
}

async function joinMemberVoiceChannel(message) {
  if (!message.guild || !message.member) {
    return { ok: false, reason: "This command only works in a server." };
  }

  const targetChannel = message.member.voice?.channel;
  if (!targetChannel) {
    return { ok: false, reason: "Join a voice channel first." };
  }

  const botMember = message.guild.members.me;
  const perms = targetChannel.permissionsFor(botMember);
  if (!perms?.has("Connect") || !perms?.has("Speak")) {
    return { ok: false, reason: "I need Connect + Speak permissions in your VC." };
  }

  const createConnection = () =>
    joinVoiceChannel({
      guildId: message.guild.id,
      channelId: targetChannel.id,
      adapterCreator: message.guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: false
    });

  let connection = getVoiceConnection(message.guild.id);
  if (
    connection &&
    (connection.joinConfig.channelId !== targetChannel.id ||
      connection.state.status === VoiceConnectionStatus.Disconnected ||
      connection.state.status === VoiceConnectionStatus.Destroyed)
  ) {
    connection.destroy();
    connection = null;
  }

  if (!connection) {
    connection = createConnection();
  }

  let isReady = false;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 35_000);
      isReady = true;
      break;
    } catch (err) {
      console.warn(`[voice-tts] Voice connect attempt ${attempt} failed:`, err?.message || err);
      if (attempt === 2) break;
      try {
        connection.destroy();
      } catch {}
      connection = createConnection();
    }
  }

  if (!isReady) {
    return { ok: false, reason: "Failed to connect to voice in time. Please try `.v join` again." };
  }

  if (!connection.__lopStateHooked) {
    connection.on("stateChange", (_oldState, newState) => {
      console.log("[voice-tts] Connection state:", newState.status);
    });
    connection.__lopStateHooked = true;
  }

  console.log("[voice-tts] Connection ping snapshot:", {
    ws: connection.ping?.ws,
    udp: connection.ping?.udp
  });

  if (message.guild.members.me?.voice?.serverMute) {
    console.warn("[voice-tts] Bot is server-muted; audio will not be heard.");
  }

  if (targetChannel.type === ChannelType.GuildStageVoice) {
    try {
      if (message.guild.members.me?.voice?.suppress) {
        await message.guild.members.me.voice.setSuppressed(false);
      }
      await message.guild.members.me?.voice?.setRequestToSpeak(true).catch(() => {});
    } catch (err) {
      console.warn("[voice-tts] Stage unsuppress/request-to-speak failed:", err?.message || err);
    }
  }

  return { ok: true, connection, channel: targetChannel };
}

async function speakTextInVoice(message, text) {
  const cleaned = String(text || "").trim();
  if (!cleaned) {
    return { ok: false, reason: "Give me text to speak." };
  }
  if (cleaned.length > 250) {
    return { ok: false, reason: "Keep TTS text under 250 characters." };
  }

  const joined = await joinMemberVoiceChannel(message);
  if (!joined.ok) return joined;

  try {
    const ttsUrl = googleTTS.getAudioUrl(cleaned, {
      lang: "en-US",
      slow: false,
      host: "https://translate.google.com"
    });
    console.log("[voice-tts] Speaking text length:", cleaned.length);

    const transcoder = new prism.FFmpeg({
      args: [
        "-analyzeduration", "0",
        "-loglevel", "warning",
        "-reconnect", "1",
        "-reconnect_streamed", "1",
        "-reconnect_delay_max", "5",
        "-i", ttsUrl,
        "-c:a", "libopus",
        "-b:a", "96k",
        "-vbr", "on",
        "-ar", "48000",
        "-ac", "2",
        "-f", "ogg",
        "pipe:1"
      ]
    });

    transcoder.on("error", (err) => {
      console.error("[voice-tts] FFmpeg error:", err);
    });

    const resource = createAudioResource(transcoder, {
      inputType: StreamType.OggOpus,
      inlineVolume: false
    });

    const player = createGuildPlayer();
    joined.connection.subscribe(player);
    player.play(resource);

    try {
      await entersState(player, AudioPlayerStatus.Playing, 10_000);
    } catch (_err) {
      const udpPing = joined.connection.ping?.udp;
      console.warn("[voice-tts] Playback did not reach Playing state. UDP ping:", udpPing);
      return { ok: false, reason: "I joined, but audio did not start. If hosting blocks Discord voice UDP, TTS will stay silent." };
    }

    const wsPing = joined.connection.ping?.ws;
    const udpPing = joined.connection.ping?.udp;
    console.log("[voice-tts] Playback ping snapshot:", { ws: wsPing, udp: udpPing });

    if (udpPing == null) {
      return { ok: false, reason: "VOICE_UDP_UNAVAILABLE" };
    }

    return { ok: true };
  } catch (err) {
    console.error("[voice-tts] Failed to play TTS:", err);
    return { ok: false, reason: "Failed to generate/play TTS audio." };
  }
}

module.exports = {
  joinMemberVoiceChannel,
  speakTextInVoice
};
