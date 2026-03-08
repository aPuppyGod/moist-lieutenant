const { all, get, run } = require("./db");

const SOCIAL_PLATFORM_OPTIONS = [
  { key: "youtube", label: "YouTube" },
  { key: "twitch", label: "Twitch" },
  { key: "twitter", label: "Twitter / X" },
  { key: "tiktok", label: "TikTok" },
  { key: "instagram", label: "Instagram" },
  { key: "facebook", label: "Facebook" },
  { key: "kick", label: "Kick" },
  { key: "custom_rss", label: "Custom RSS/Atom" }
];

const SOCIAL_EVENT_LABELS = {
  live: "Live",
  post: "Post",
  story: "Story",
  community: "Community"
};

function normalizePlatform(value) {
  const platform = String(value || "").trim().toLowerCase();
  return SOCIAL_PLATFORM_OPTIONS.some((p) => p.key === platform) ? platform : "custom_rss";
}

function getSupportedEventsForPlatform(platformRaw) {
  const platform = normalizePlatform(platformRaw);
  if (platform === "youtube") return ["live", "post", "community"];
  if (platform === "twitch") return ["live"];
  if (platform === "instagram") return ["post", "story"];
  if (platform === "twitter") return ["post"];
  if (platform === "tiktok") return ["post"];
  if (platform === "custom_rss") return ["post"];
  return ["post"];
}

function decodeXmlEntities(text) {
  return String(text || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .trim();
}

function getTagValue(block, tag) {
  const open = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = block.match(new RegExp(`<${open}[^>]*>([\\s\\S]*?)<\\/${open}>`, "i"));
  return match ? decodeXmlEntities(match[1]) : "";
}

function parseAtomEntries(xml) {
  const entries = [];
  const regex = /<entry[\s\S]*?<\/entry>/gi;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const block = match[0];
    const linkMatch = block.match(/<link[^>]*href="([^"]+)"[^>]*>/i);
    const link = linkMatch ? decodeXmlEntities(linkMatch[1]) : "";
    entries.push({
      uid: getTagValue(block, "id") || link,
      title: getTagValue(block, "title") || "New post",
      url: link,
      publishedAt: getTagValue(block, "published") || getTagValue(block, "updated") || null
    });
  }
  return entries;
}

function parseRssItems(xml) {
  const items = [];
  const regex = /<item[\s\S]*?<\/item>/gi;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const block = match[0];
    items.push({
      uid: getTagValue(block, "guid") || getTagValue(block, "link"),
      title: getTagValue(block, "title") || "New post",
      url: getTagValue(block, "link"),
      publishedAt: getTagValue(block, "pubDate") || getTagValue(block, "published") || null
    });
  }
  return items;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "moist-lieutenant/1.0"
    }
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return await response.text();
}

function resolveYouTubeChannelId(link) {
  const external = String(link.external_id || "").trim();
  const sourceUrl = String(link.source_url || "").trim();

  if (/^UC[\w-]{20,}$/i.test(external)) return external;

  const fromExternalUrl = external.match(/channel\/(UC[\w-]{20,})/i);
  if (fromExternalUrl) return fromExternalUrl[1];

  const fromSourceUrl = sourceUrl.match(/channel\/(UC[\w-]{20,})/i);
  if (fromSourceUrl) return fromSourceUrl[1];

  return null;
}

function getYouTubeCommunityUrl(link, channelId) {
  const sourceUrl = String(link.source_url || "").trim();
  if (sourceUrl && /youtube\.com/i.test(sourceUrl)) {
    return `${sourceUrl.replace(/\/+$/, "")}/community`;
  }
  if (channelId) {
    return `https://www.youtube.com/channel/${channelId}/community`;
  }
  return null;
}

async function pollYoutube(link) {
  const channelId = resolveYouTubeChannelId(link);
  if (!channelId) return [];

  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
  const xml = await fetchText(feedUrl);
  const entries = parseAtomEntries(xml).slice(0, 8);

  const events = entries.map((entry) => {
    const titleLower = String(entry.title || "").toLowerCase();
    const isLikelyLive = /\blive\b|stream/i.test(titleLower);
    return {
      eventType: isLikelyLive ? "live" : "post",
      uid: String(entry.uid || entry.url),
      title: entry.title,
      url: entry.url,
      publishedAt: entry.publishedAt
    };
  });

  const communityUrl = getYouTubeCommunityUrl(link, channelId);
  if (communityUrl) {
    try {
      const communityHtml = await fetchText(communityUrl);
      const postIdRegex = /"postId":"([^"]+)"/g;
      let postMatch;
      const seen = new Set();
      while ((postMatch = postIdRegex.exec(communityHtml)) !== null) {
        const postId = postMatch[1];
        if (seen.has(postId)) continue;
        seen.add(postId);
        events.push({
          eventType: "community",
          uid: `yt-community-${postId}`,
          title: "New YouTube community post",
          url: `https://www.youtube.com/post/${postId}`,
          publishedAt: null
        });
        if (seen.size >= 4) break;
      }
    } catch {
      // Community parsing is best-effort.
    }
  }

  return events;
}

let twitchTokenCache = {
  token: null,
  expiresAt: 0
};

async function getTwitchToken() {
  if (twitchTokenCache.token && Date.now() < twitchTokenCache.expiresAt - 60_000) {
    return twitchTokenCache.token;
  }

  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const response = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials"
    })
  });

  if (!response.ok) return null;
  const data = await response.json();
  if (!data?.access_token) return null;

  twitchTokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (Number(data.expires_in || 0) * 1000)
  };

  return twitchTokenCache.token;
}

async function pollTwitch(link) {
  const login = String(link.external_id || "").trim().replace(/^@/, "");
  if (!login) return [];

  const token = await getTwitchToken();
  const clientId = process.env.TWITCH_CLIENT_ID;
  if (!token || !clientId) return [];

  const headers = {
    "Client-Id": clientId,
    Authorization: `Bearer ${token}`
  };

  const streamResponse = await fetch(`https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(login)}`, { headers });
  if (!streamResponse.ok) return [];
  const streamData = await streamResponse.json();
  const stream = Array.isArray(streamData?.data) ? streamData.data[0] : null;
  if (!stream) return [];

  return [
    {
      eventType: "live",
      uid: `twitch-live-${stream.id}`,
      title: stream.title || `${login} is live`,
      url: `https://twitch.tv/${login}`,
      publishedAt: stream.started_at || null
    }
  ];
}

async function pollRssLike(link) {
  const sourceUrl = String(link.source_url || "").trim();
  if (!sourceUrl) return [];
  const xml = await fetchText(sourceUrl);
  const items = parseRssItems(xml).concat(parseAtomEntries(xml)).slice(0, 10);
  return items.map((item) => ({
    eventType: "post",
    uid: String(item.uid || item.url),
    title: item.title,
    url: item.url,
    publishedAt: item.publishedAt
  }));
}

async function pollSocialLink(link) {
  const platform = normalizePlatform(link.platform);
  if (platform === "youtube") return await pollYoutube(link);
  if (platform === "twitch") return await pollTwitch(link);
  return await pollRssLike(link);
}

function defaultTemplateForEvent(eventType) {
  if (eventType === "live") {
    return "{role} 🔴 {handle} is now live on {platform}!\n{title}\n{url}";
  }
  if (eventType === "community") {
    return "{role} 💬 New community post from {handle} on {platform}!\n{url}";
  }
  if (eventType === "story") {
    return "{role} 📸 New story from {handle} on {platform}!\n{url}";
  }
  return "{role} ✨ New post from {handle} on {platform}!\n{title}\n{url}";
}

function renderTemplate(template, vars) {
  return String(template || "")
    .replaceAll("{platform}", vars.platform)
    .replaceAll("{handle}", vars.handle)
    .replaceAll("{title}", vars.title)
    .replaceAll("{url}", vars.url)
    .replaceAll("{event}", vars.event)
    .replaceAll("{role}", vars.role || "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function ensureDefaultRulesForLink(link) {
  const events = getSupportedEventsForPlatform(link.platform);
  for (const eventType of events) {
    await run(
      `INSERT INTO social_link_rules (guild_id, link_id, event_type, enabled, message_template)
       VALUES (?, ?, ?, 1, ?)
       ON CONFLICT (link_id, event_type)
       DO NOTHING`,
      [link.guild_id, link.id, eventType, defaultTemplateForEvent(eventType)]
    );
  }
}

async function runSocialNotifierTick(client) {
  const links = await all(
    `SELECT id, guild_id, platform, external_id, source_url, label, channel_id, enabled
     FROM social_links
     WHERE enabled=1
     ORDER BY created_at DESC`,
    []
  );

  for (const link of links) {
    try {
      await ensureDefaultRulesForLink(link);

      const rules = await all(
        `SELECT id, event_type, enabled, channel_id, role_id, message_template
         FROM social_link_rules
         WHERE link_id=?`,
        [link.id]
      );
      const ruleMap = new Map(rules.map((row) => [String(row.event_type), row]));

      const guildSettings = await get(
        `SELECT social_default_channel_id FROM guild_settings WHERE guild_id=?`,
        [link.guild_id]
      );

      const events = await pollSocialLink(link);
      const guild = client.guilds.cache.get(link.guild_id) || await client.guilds.fetch(link.guild_id).catch(() => null);
      if (!guild) continue;

      for (const event of events) {
        if (!event?.uid || !event?.url) continue;

        const alreadySent = await get(
          `SELECT id FROM social_announcements WHERE link_id=? AND event_uid=?`,
          [link.id, event.uid]
        );
        if (alreadySent) continue;

        const rule = ruleMap.get(String(event.eventType || "post"));
        if (!rule || Number(rule.enabled) !== 1) continue;

        const channelId = rule.channel_id || link.channel_id || guildSettings?.social_default_channel_id || null;
        if (!channelId) continue;

        const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
        if (!channel || !channel.isTextBased || !channel.isTextBased()) continue;

        const roleMention = rule.role_id ? `<@&${rule.role_id}>` : "";
        const platformLabel = SOCIAL_PLATFORM_OPTIONS.find((p) => p.key === normalizePlatform(link.platform))?.label || link.platform;
        const template = rule.message_template || defaultTemplateForEvent(event.eventType);

        const message = renderTemplate(template, {
          platform: platformLabel,
          handle: link.label || link.external_id,
          title: event.title || "New update",
          url: event.url,
          event: SOCIAL_EVENT_LABELS[event.eventType] || event.eventType,
          role: roleMention
        });

        const sent = await channel.send({
          content: message,
          allowedMentions: {
            parse: [],
            roles: rule.role_id ? [rule.role_id] : []
          }
        }).catch(() => null);

        await run(
          `INSERT INTO social_announcements (guild_id, link_id, event_type, event_uid, posted_message_id, sent_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (link_id, event_uid)
           DO NOTHING`,
          [link.guild_id, link.id, event.eventType || "post", event.uid, sent?.id || null, Date.now()]
        );
      }

      await run(
        `UPDATE social_links SET last_checked_at=? WHERE id=?`,
        [Date.now(), link.id]
      );
    } catch (err) {
      console.error("[socials] Poll failed for link", link.id, err?.message || err);
    }
  }
}

function startSocialFeedNotifier(client) {
  runSocialNotifierTick(client).catch((err) => {
    console.error("[socials] Initial poll failed:", err);
  });

  setInterval(() => {
    runSocialNotifierTick(client).catch((err) => {
      console.error("[socials] Poll interval failed:", err);
    });
  }, 120_000);
}

module.exports = {
  SOCIAL_PLATFORM_OPTIONS,
  SOCIAL_EVENT_LABELS,
  normalizePlatform,
  getSupportedEventsForPlatform,
  defaultTemplateForEvent,
  ensureDefaultRulesForLink,
  runSocialNotifierTick,
  startSocialFeedNotifier
};
