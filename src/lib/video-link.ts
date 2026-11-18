/**
 * Client-safe helpers for turning a lesson URL into a trusted video embed.
 * Only an explicit allowlist of hosts is embedded; every other URL is treated
 * as a normal join/download link by the caller.
 */

export type VideoEmbed = {
  provider: "youtube" | "vimeo";
  embedUrl: string;
  label: string;
};

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);
const VIMEO_HOSTS = new Set(["vimeo.com", "www.vimeo.com", "player.vimeo.com"]);

function safeUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

function cleanId(value: string | null | undefined) {
  return value && /^[A-Za-z0-9_-]{6,}$/.test(value) ? value : null;
}

/** Parse a YouTube or Vimeo link into a privacy-friendly embed URL. */
export function parseVideoEmbed(raw: string | null | undefined): VideoEmbed | null {
  const url = safeUrl(String(raw ?? "").trim());
  if (!url) return null;
  const host = url.hostname.toLowerCase();
  const nocookie = host.includes("youtube-nocookie");

  if (YOUTUBE_HOSTS.has(host)) {
    let id: string | null = null;
    if (host.endsWith("youtu.be")) {
      id = url.pathname.split("/").filter(Boolean)[0] ?? null;
    } else if (url.pathname === "/watch") {
      id = url.searchParams.get("v");
    } else {
      const parts = url.pathname.split("/").filter(Boolean);
      if ((parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "live") && parts[1]) {
        id = parts[1];
      }
    }
    id = cleanId(id);
    if (!id) return null;
    const base = nocookie ? "www.youtube-nocookie.com" : "www.youtube.com";
    return {
      provider: "youtube",
      embedUrl: `https://${base}/embed/${encodeURIComponent(id)}`,
      label: "YouTube video",
    };
  }

  if (host === "youtu.be") {
    const id = cleanId(url.pathname.split("/").filter(Boolean)[0]);
    if (!id) return null;
    return {
      provider: "youtube",
      embedUrl: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`,
      label: "YouTube video",
    };
  }

  if (VIMEO_HOSTS.has(host)) {
    const parts = url.pathname.split("/").filter(Boolean);
    const id = cleanId(host === "player.vimeo.com" ? parts[1] : parts[0]);
    if (!id) return null;
    return {
      provider: "vimeo",
      embedUrl: `https://player.vimeo.com/video/${encodeURIComponent(id)}`,
      label: "Vimeo video",
    };
  }

  return null;
}
