const crypto = require("crypto");
const express = require("express");
const { all, get, run } = require("./db");

const LOW_COST_MODE = process.env.LOW_COST_MODE === "true";
const parsedPollInterval = Number.parseInt(String(process.env.SOCIAL_POLL_INTERVAL_MS || ""), 10);
const SOCIAL_POLL_INTERVAL_MS = Number.isFinite(parsedPollInterval) && parsedPollInterval > 0
  ? parsedPollInterval
  : (LOW_COST_MODE ? 600_000 : 120_000);

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

function parseUrlSafe(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function stripAt(value) {
  return String(value || "").replace(/^@+/, "").trim();
}

function firstPathPart(pathname) {
  return String(pathname || "")
    .split("/")
    .filter(Boolean)[0] || "";
}

function normalizeSocialExternalId(platformRaw, rawValue) {
  const platform = normalizePlatform(platformRaw);
  const raw = String(rawValue || "").trim();
  if (!raw) return "";

  if (platform === "custom_rss") {
    return raw;
  }

  const parsed = parseUrlSafe(raw);
  let candidate = raw;

  if (parsed) {
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname || "";

    if (platform === "youtube") {
      const channelMatch = path.match(/\/channel\/(UC[\w-]{20,})/i);
      if (channelMatch) return channelMatch[1];

      const atMatch = path.match(/\/@([a-zA-Z0-9._-]+)/);
      if (atMatch) return `@${atMatch[1]}`;

      const userOrCustom = path.match(/\/(user|c)\/([a-zA-Z0-9._-]+)/i);
      if (userOrCustom) return userOrCustom[2];

      if (host.includes("youtube.com") || host.includes("youtu.be")) {
        const first = firstPathPart(path);
        if (first) candidate = first;
      }
    } else {
      const first = firstPathPart(path);
      if (first) candidate = first;
    }
  }

  candidate = stripAt(candidate)
    .replace(/^channel\//i, "")
    .replace(/[?#].*$/, "")
    .trim();

  if (platform === "youtube" && /^UC[\w-]{20,}$/i.test(candidate)) {
    return candidate;
  }

  if (platform === "youtube") {
    return candidate ? `@${candidate}` : "";
  }

  return candidate;
}

function inferSourceUrl(platformRaw, externalIdRaw, sourceUrlRaw) {
  const platform = normalizePlatform(platformRaw);
  const externalId = String(externalIdRaw || "").trim();
  const sourceUrl = String(sourceUrlRaw || "").trim();
  if (sourceUrl) return sourceUrl;
  if (!externalId) return null;

  if (platform === "youtube") {
    if (/^UC[\w-]{20,}$/i.test(externalId)) {
      return `https://www.youtube.com/channel/${externalId}`;
    }
    return `https://www.youtube.com/${externalId.startsWith("@") ? externalId : `@${externalId}`}`;
  }

  if (platform === "twitch") {
    return `https://www.twitch.tv/${stripAt(externalId)}`;
  }

  if (platform === "twitter") {
    return `https://rss-bridge.org/bridge01/?action=display&bridge=TwitterBridge&context=By+username&u=${stripAt(externalId)}&format=Atom`;
  }

  if (platform === "tiktok") {
    return `https://rsshub.app/tiktok/user/${stripAt(externalId)}`;
  }

  if (platform === "instagram") {
    return `https://rsshub.app/instagram/user/${stripAt(externalId)}`;
  }

  if (platform === "facebook") {
    return `https://rsshub.app/facebook/page/${stripAt(externalId)}`;
  }

  if (platform === "kick") {
    return `https://kick.com/${stripAt(externalId)}`;
  }

  return null;
}

function inferDefaultLabel(platformRaw, externalIdRaw) {
  const platform = normalizePlatform(platformRaw);
  const externalId = String(externalIdRaw || "").trim();
  if (!externalId) return null;
  if (platform === "youtube") {
    if (/^UC[\w-]{20,}$/i.test(externalId)) return externalId;
    return externalId.startsWith("@") ? externalId : `@${externalId}`;
  }
  if (platform === "custom_rss") return externalId;
  const clean = stripAt(externalId);
  return clean ? `@${clean}` : null;
}

function getSupportedEventsForPlatform(platformRaw) {
  const platform = normalizePlatform(platformRaw);
  if (platform === "youtube") return ["live", "post", "community"];
  if (platform === "twitch") return ["live"];
  if (platform === "instagram") return ["post", "story"];
  if (platform === "twitter") return ["post"];
  if (platform === "tiktok") return ["live", "post"];
  if (platform === "facebook") return ["post"];
  if (platform === "kick") return ["live"];
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
    const err = new Error(`HTTP ${response.status} for ${url}`);
    err.status = response.status;
    err.url = url;
    throw err;
  }
  return await response.text();
}

function buildRssCandidateUrls(link) {
  const sourceUrl = String(link.source_url || "").trim();
  const platform = normalizePlatform(link.platform);
  const external = stripAt(String(link.external_id || ""));
  const candidates = [];

  if (sourceUrl) {
    candidates.push(sourceUrl);
  }

  // RSSHub public instances can block traffic intermittently, so try mirrors.
  if (platform === "tiktok") {
    if (sourceUrl) {
      try {
        const parsed = new URL(sourceUrl);
        const path = `${parsed.pathname || ""}${parsed.search || ""}`;
        candidates.push(`https://rsshub.net${path}`);
      } catch {
        // Ignore malformed configured source URL and fall back to generated URLs.
      }
    }

    if (external) {
      candidates.push(`https://rsshub.net/tiktok/user/${external}`);
      candidates.push(`https://rsshub.app/tiktok/user/${external}`);
    }
  }

  return [...new Set(candidates.filter(Boolean))];
}

async function resolveYouTubeChannelId(link) {
  const external = String(link.external_id || "").trim();
  const sourceUrl = String(link.source_url || "").trim();

  if (/^UC[\w-]{20,}$/i.test(external)) return external;

  const feedChannelMatch = sourceUrl.match(/[?&]channel_id=(UC[\w-]{20,})/i);
  if (feedChannelMatch) return feedChannelMatch[1];

  const fromExternalUrl = external.match(/channel\/(UC[\w-]{20,})/i);
  if (fromExternalUrl) return fromExternalUrl[1];

  const fromSourceUrl = sourceUrl.match(/channel\/(UC[\w-]{20,})/i);
  if (fromSourceUrl) return fromSourceUrl[1];

  const handleCandidate = external.startsWith("@") ? external : `@${stripAt(external)}`;
  if (!/^@[a-zA-Z0-9._-]+$/.test(handleCandidate)) return null;

  try {
    const html = await fetchText(`https://www.youtube.com/${handleCandidate}`);
    const channelIdMatch = html.match(/"channelId":"(UC[\w-]{20,})"/);
    if (channelIdMatch) return channelIdMatch[1];
  } catch {
    // Best-effort handle resolution.
  }

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
  const channelId = await resolveYouTubeChannelId(link);
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

async function pollKick(link) {
  const username = String(link.external_id || "").trim().replace(/^@/, "");
  if (!username) return [];

  try {
    // Try to get stream info from Kick's API or page
    const apiUrl = `https://kick.com/api/v1/channels/${username}`;
    const response = await fetch(apiUrl, {
      headers: {
        "User-Agent": "moist-lieutenant/1.0"
      }
    });

    if (!response.ok) return [];

    const data = await response.json();
    if (!data?.livestream) return [];

    const stream = data.livestream;
    if (!stream.is_live) return [];

    return [
      {
        eventType: "live",
        uid: `kick-live-${stream.id}`,
        title: stream.session_title || `${username} is live on Kick`,
        url: `https://kick.com/${username}`,
        publishedAt: stream.created_at || null
      }
    ];
  } catch (err) {
    console.warn("[socials] Kick API failed for", username, err.message);
    return [];
  }
}

async function pollRssLike(link) {
  const platform = normalizePlatform(link.platform);
  const urls = buildRssCandidateUrls(link);
  if (urls.length === 0) return [];

  let lastError = null;
  for (const url of urls) {
    try {
      const xml = await fetchText(url);
      const items = parseRssItems(xml).concat(parseAtomEntries(xml)).slice(0, 10);

      return items.map((item) => {
        let eventType = "post";

        // Detect live streams based on title/content
        if (platform === "tiktok") {
          const titleLower = String(item.title || "").toLowerCase();
          const isLikelyLive = /\blive\b|\blivestream\b|\bgoing live\b|\bstreaming\b/i.test(titleLower);
          if (isLikelyLive) {
            eventType = "live";
          }
        }

        return {
          eventType,
          uid: String(item.uid || item.url),
          title: item.title,
          url: item.url,
          publishedAt: item.publishedAt
        };
      });
    } catch (err) {
      lastError = err;
      continue;
    }
  }

  // If all candidate RSS endpoints are blocked/unavailable, skip this tick gracefully.
  if (lastError && [401, 403, 404, 429].includes(Number(lastError.status || 0))) {
    console.warn(`[socials] RSS source unavailable for link ${link.id} (${platform}): ${lastError.message}`);
    return [];
  }

  // Network or fetch-level failures (no HTTP status) are non-fatal for polling.
  if (lastError && !lastError.status && /fetch failed|network|econn|etimedout/i.test(String(lastError.message || ""))) {
    return [];
  }

  if (lastError) {
    throw lastError;
  }

  return [];
}

async function pollSocialLink(link) {
  const platform = normalizePlatform(link.platform);
  
  try {
    if (platform === "youtube") {
      return await pollYoutube(link);
    } else if (platform === "twitch") {
      return await pollTwitch(link);
    } else if (platform === "kick") {
      return await pollKick(link);
    } else {
      // custom_rss, twitter, tiktok, instagram, facebook, and others
      return await pollRssLike(link);
    }
  } catch (err) {
    console.error(`[socials] pollSocialLink failed for link ${link.id} (${platform}):`, err.message);
    return [];
  }
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

function getTwitchEventSubCallbackUrl() {
  if (process.env.TWITCH_EVENTSUB_CALLBACK_URL) {
    return process.env.TWITCH_EVENTSUB_CALLBACK_URL;
  }

  const discordCallbackUrl = process.env.DISCORD_CALLBACK_URL;
  if (!discordCallbackUrl) return null;

  try {
    const url = new URL(discordCallbackUrl);
    url.pathname = "/twitch/eventsub";
    url.search = "";
    return url.toString();
  } catch {
    return null;
  }
}

function getTwitchEventSubSecret() {
  return String(process.env.TWITCH_EVENTSUB_SECRET || "").trim() || null;
}

function buildTwitchRequestHeaders(token) {
  const clientId = process.env.TWITCH_CLIENT_ID;
  return {
    "Client-Id": clientId,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  };
}

async function fetchTwitchUserByLogin(login) {
  if (!login) return null;
  const token = await getTwitchToken();
  if (!token) return null;
  const headers = buildTwitchRequestHeaders(token);
  const response = await fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(login)}`, { headers });
  if (!response.ok) return null;
  const data = await response.json();
  return Array.isArray(data?.data) && data.data[0] ? data.data[0] : null;
}

async function fetchTwitchUserById(id) {
  if (!id) return null;
  const token = await getTwitchToken();
  if (!token) return null;
  const headers = buildTwitchRequestHeaders(token);
  const response = await fetch(`https://api.twitch.tv/helix/users?id=${encodeURIComponent(id)}`, { headers });
  if (!response.ok) return null;
  const data = await response.json();
  return Array.isArray(data?.data) && data.data[0] ? data.data[0] : null;
}

async function fetchTwitchStreamByBroadcasterId(broadcasterId) {
  if (!broadcasterId) return null;
  const token = await getTwitchToken();
  if (!token) return null;
  const headers = buildTwitchRequestHeaders(token);
  const response = await fetch(`https://api.twitch.tv/helix/streams?user_id=${encodeURIComponent(broadcasterId)}`, { headers });
  if (!response.ok) return null;
  const data = await response.json();
  return Array.isArray(data?.data) && data.data[0] ? data.data[0] : null;
}

async function getExistingTwitchEventSubSubscriptions() {
  const token = await getTwitchToken();
  if (!token) return [];
  const headers = buildTwitchRequestHeaders(token);
  let cursor = null;
  const subscriptions = [];

  do {
    const url = new URL("https://api.twitch.tv/helix/eventsub/subscriptions");
    if (cursor) url.searchParams.set("after", cursor);
    const response = await fetch(url.toString(), { headers });
    if (!response.ok) break;
    const data = await response.json();
    if (Array.isArray(data?.data)) {
      subscriptions.push(...data.data);
    }
    cursor = data?.pagination?.cursor || null;
  } while (cursor);

  return subscriptions;
}

async function createTwitchEventSubSubscription(broadcasterId) {
  const callbackUrl = getTwitchEventSubCallbackUrl();
  const secret = getTwitchEventSubSecret();
  if (!callbackUrl || !secret) return null;

  const token = await getTwitchToken();
  if (!token) return null;

  const headers = buildTwitchRequestHeaders(token);
  const body = JSON.stringify({
    type: "stream.online",
    version: "1",
    condition: { broadcaster_user_id: broadcasterId },
    transport: {
      method: "webhook",
      callback: callbackUrl,
      secret
    }
  });

  const response = await fetch("https://api.twitch.tv/helix/eventsub/subscriptions", {
    method: "POST",
    headers,
    body
  });

  if (response.ok) return await response.json();
  if (response.status === 409) return null;

  const errorBody = await response.text().catch(() => "");
  console.warn("[socials] Twitch EventSub subscribe failed:", response.status, errorBody);
  return null;
}

async function syncTwitchEventSubSubscriptions() {
  const callbackUrl = getTwitchEventSubCallbackUrl();
  const secret = getTwitchEventSubSecret();
  if (!callbackUrl || !secret) {
    console.warn("[socials] Twitch EventSub not enabled because callback URL or secret is missing.");
    return;
  }

  const existing = await getExistingTwitchEventSubSubscriptions();
  const existingBroadcasters = new Set(
    existing
      .filter((sub) => sub.transport?.method === "webhook" && sub.condition?.broadcaster_user_id)
      .map((sub) => sub.condition.broadcaster_user_id)
  );

  const links = await all(
    `SELECT external_id FROM social_links WHERE platform='twitch' AND enabled=1`,
    []
  );

  for (const link of links) {
    const login = stripAt(String(link.external_id || "")).toLowerCase();
    if (!login) continue;
    const user = await fetchTwitchUserByLogin(login);
    if (!user?.id) continue;

    if (existingBroadcasters.has(user.id)) continue;
    await createTwitchEventSubSubscription(user.id);
  }
}

async function getTwitchLinksByLogin(login) {
  const normalizedLogin = String(login || "").toLowerCase().trim();
  if (!normalizedLogin) return [];

  const links = await all(
    `SELECT * FROM social_links WHERE platform='twitch' AND enabled=1`,
    []
  );

  return links.filter((link) => stripAt(String(link.external_id || "")).toLowerCase() === normalizedLogin);
}

async function dispatchSocialEvent(client, link, event, guild = null) {
  if (!event?.uid || !event?.url) return false;

  if (!guild) {
    guild = client.guilds.cache.get(link.guild_id) || await client.guilds.fetch(link.guild_id).catch(() => null);
  }
  if (!guild) return false;

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

  const alreadySent = await get(
    `SELECT id FROM social_announcements WHERE link_id=? AND event_uid=?`,
    [link.id, event.uid]
  );
  if (alreadySent) return false;

  const rule = ruleMap.get(String(event.eventType || "post"));
  if (!rule || Number(rule.enabled) !== 1) return false;

  const channelId = rule.channel_id || link.channel_id || guildSettings?.social_default_channel_id || null;
  if (!channelId) return false;

  const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased || !channel.isTextBased()) return false;

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

  return !!sent;
}

async function installTwitchEventSubRoutes(app, client) {
  const callbackUrl = getTwitchEventSubCallbackUrl();
  const secret = getTwitchEventSubSecret();
  if (!callbackUrl || !secret) {
    console.warn("[socials] Twitch EventSub route not enabled; callback URL or secret is missing.");
    return;
  }

  app.post("/twitch/eventsub", express.text({ type: "application/json" }), async (req, res) => {
    const rawBody = req.body || "";
    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return res.status(400).send("Invalid JSON");
    }

    const messageId = req.header("Twitch-Eventsub-Message-Id");
    const timestamp = req.header("Twitch-Eventsub-Message-Timestamp");
    const signature = req.header("Twitch-Eventsub-Message-Signature");
    if (!messageId || !timestamp || !signature) {
      return res.status(400).send("Missing Twitch EventSub headers");
    }

    const expected = crypto
      .createHmac("sha256", secret)
      .update(messageId + timestamp + rawBody)
      .digest("hex");

    if (signature !== `sha256=${expected}`) {
      return res.status(403).send("Invalid signature");
    }

    const messageType = req.header("Twitch-Eventsub-Message-Type");
    if (messageType === "webhook_callback_verification") {
      return res.status(200).send(payload.challenge || "");
    }

    if (messageType === "revocation") {
      console.warn("[socials] Twitch EventSub revoked:", payload.subscription || payload);
      return res.status(200).send("ok");
    }

    if (messageType !== "notification") {
      return res.status(200).send("ignored");
    }

    if (payload.subscription?.type !== "stream.online") {
      return res.status(200).send("ignored");
    }

    handleTwitchEventSubNotification(client, payload).catch((err) => {
      console.error("[socials] EventSub notification failed:", err);
    });

    return res.status(200).send("ok");
  });
}

async function handleTwitchEventSubNotification(client, payload) {
  const event = payload.event || {};
  const broadcasterId = event.broadcaster_user_id;
  if (!broadcasterId) return;

  const user = await fetchTwitchUserById(broadcasterId);
  const login = String(user?.login || "").trim();
  if (!login) return;

  const links = await getTwitchLinksByLogin(login);
  if (!links.length) return;

  const stream = await fetchTwitchStreamByBroadcasterId(broadcasterId);
  const title = stream?.title || `${login} is live`;
  const publishedAt = stream?.started_at || event.started_at || null;
  const uid = stream?.id ? `twitch-live-${stream.id}` : `twitch-live-${broadcasterId}-${publishedAt || Date.now()}`;

  const socialEvent = {
    eventType: "live",
    uid,
    title,
    url: `https://twitch.tv/${login}`,
    publishedAt
  };

  for (const link of links) {
    await dispatchSocialEvent(client, link, socialEvent).catch((err) => {
      console.error("[socials] dispatchSocialEvent failed:", err);
    });
  }
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
        await dispatchSocialEvent(client, link, event, guild);
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

function startSocialFeedNotifier(client, app = null) {
  if (app) {
    installTwitchEventSubRoutes(app, client);
  }

  if (getTwitchEventSubCallbackUrl() && getTwitchEventSubSecret()) {
    syncTwitchEventSubSubscriptions().catch((err) => {
      console.error("[socials] Twitch EventSub sync failed:", err);
    });
  }

  runSocialNotifierTick(client).catch((err) => {
    console.error("[socials] Initial poll failed:", err);
  });

  setInterval(() => {
    runSocialNotifierTick(client).catch((err) => {
      console.error("[socials] Poll interval failed:", err);
    });
  }, SOCIAL_POLL_INTERVAL_MS);
}

module.exports = {
  SOCIAL_PLATFORM_OPTIONS,
  SOCIAL_EVENT_LABELS,
  normalizePlatform,
  normalizeSocialExternalId,
  inferSourceUrl,
  inferDefaultLabel,
  getSupportedEventsForPlatform,
  defaultTemplateForEvent,
  ensureDefaultRulesForLink,
  runSocialNotifierTick,
  startSocialFeedNotifier
};
