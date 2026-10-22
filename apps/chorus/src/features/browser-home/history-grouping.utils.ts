import type { HistoryEntry } from "@/lib/browser.types";

/** History filters: the aggregated view plus the service buckets it groups into. */
export type HistoryCategory = "all" | "youtube" | "youtube-music" | "spotify" | "other";

export type HistoryServiceCategory = Exclude<HistoryCategory, "all">;

export interface HistoryListItem {
  readonly entry: HistoryEntry;
  readonly category: HistoryServiceCategory;
  readonly host: string;
  readonly title: string;
  readonly detail: string;
  readonly dayKey: number;
  readonly dayLabel: string;
  readonly timeLabel: string;
}

export interface HistoryView {
  readonly counts: Readonly<Record<HistoryCategory, number>>;
  readonly groups: Readonly<Record<HistoryCategory, readonly HistoryListItem[]>>;
}

const DAY_MS = 86_400_000;

const TIME_FORMAT = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

const WEEKDAY_DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
});

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});

const DATED_YEAR_FORMAT = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function startOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function parseUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function categoryForUrl(url: URL): HistoryServiceCategory {
  const host = normalizeHost(url.hostname);
  if (host === "music.youtube.com") return "youtube-music";
  if (
    host === "youtube.com"
    || host === "m.youtube.com"
    || host === "youtu.be"
    || host.endsWith(".youtube.com")
    || host.endsWith(".youtu.be")
  ) {
    return "youtube";
  }
  if (host === "spotify.com" || host.endsWith(".spotify.com")) return "spotify";
  return "other";
}

/** Host without the noise `www.` prefix, or the raw value when unparsable. */
export function historyHost(raw: string): string {
  const url = parseUrl(raw);
  return url ? normalizeHost(url.hostname) : raw;
}

/** Which service filter a URL belongs to. `music.youtube.com` is not YouTube. */
export function historyCategoryFor(raw: string): HistoryServiceCategory {
  const url = parseUrl(raw);
  return url ? categoryForUrl(url) : "other";
}

function humanizeSegment(segment: string): string {
  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    decoded = segment;
  }
  return decoded
    .replace(/[-_+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function searchDetail(url: URL): string | null {
  const query = url.searchParams.get("search_query")
    ?? url.searchParams.get("q")
    ?? url.searchParams.get("query");
  return query ? `Search · ${query}` : null;
}

function youtubeDetail(url: URL, segments: readonly string[]): string {
  if (segments[0] === "results") return searchDetail(url) ?? "Search";
  if (segments[0] === "watch") return "Watching";
  if (segments[0] === "shorts") return "Shorts";
  if (segments[0] === "playlist" || segments[0] === "playlists") return "Playlists";
  if (segments[0] === "feed" && segments[1] === "subscriptions") return "Subscriptions";
  if (segments[0] === "feed" && segments[1] === "history") return "Watch history";
  if (segments[0]?.startsWith("@")) return segments[0];
  if (segments[0] === "channel" && segments[1]) return `Channel · ${humanizeSegment(segments[1])}`;
  return segments.slice(0, 2).map(humanizeSegment).join(" · ") || "Home";
}

function musicDetail(url: URL, segments: readonly string[]): string {
  if (segments[0] === "search") return searchDetail(url) ?? "Search";
  if (segments[0] === "watch") return "Song";
  if (segments[0] === "library") return "Library";
  if (segments[0] === "explore") return "Explore";
  if (segments[0] === "playlist") return "Playlist";
  return segments.slice(0, 2).map(humanizeSegment).join(" · ") || "Home";
}

function spotifyDetail(url: URL, segments: readonly string[]): string {
  if (segments[0] === "search") return searchDetail(url) ?? "Search";
  if (segments[0] === "album") return "Album";
  if (segments[0] === "track") return "Track";
  if (segments[0] === "playlist") return "Playlist";
  if (segments[0] === "artist") return "Artist";
  if (segments[0] === "show") return "Podcast";
  if (segments[0] === "episode") return "Episode";
  if (segments[0] === "collection") return "Your library";
  return segments.slice(0, 2).map(humanizeSegment).join(" · ") || "Home";
}

function detailForUrl(url: URL, category: HistoryServiceCategory): string {
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length === 0) return searchDetail(url) ?? "Home";
  switch (category) {
    case "youtube":
      return youtubeDetail(url, segments);
    case "youtube-music":
      return musicDetail(url, segments);
    case "spotify":
      return spotifyDetail(url, segments);
    default: {
      const query = searchDetail(url);
      if (segments.length === 1 && query) return query;
      return segments.slice(0, 2).map(humanizeSegment).join(" · ");
    }
  }
}

/** A short, human label for what the URL is — shown under the host. */
export function historyDetail(raw: string, category: HistoryServiceCategory): string {
  const url = parseUrl(raw);
  return url ? detailForUrl(url, category) : raw;
}

/** Day bucket label: Today, Yesterday, weekday, then a short date. */
export function historyDayLabel(timestamp: number, now: number): string {
  const day = startOfDay(timestamp);
  const today = startOfDay(now);
  const days = Math.round((today - day) / DAY_MS);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return WEEKDAY_DATE_FORMAT.format(timestamp);
  return days < 365 ? DATE_FORMAT.format(timestamp) : DATED_YEAR_FORMAT.format(timestamp);
}

/** One O(n) pass: classify, format, and bucket entries for the filter rail. */
export function buildHistoryView(entries: readonly HistoryEntry[], now: number): HistoryView {
  const groups: Record<HistoryCategory, HistoryListItem[]> = {
    all: [],
    youtube: [],
    "youtube-music": [],
    spotify: [],
    other: [],
  };

  for (const entry of entries) {
    const url = parseUrl(entry.url);
    const category = url ? categoryForUrl(url) : "other";
    const host = url ? normalizeHost(url.hostname) : entry.url;
    const rawTitle = entry.title.trim();
    const title = rawTitle && historyHost(`https://${rawTitle}`) !== host ? rawTitle : host;
    const item: HistoryListItem = {
      entry,
      category,
      host,
      title,
      detail: url ? detailForUrl(url, category) : entry.url,
      dayKey: startOfDay(entry.visitedAt),
      dayLabel: historyDayLabel(entry.visitedAt, now),
      timeLabel: TIME_FORMAT.format(entry.visitedAt),
    };
    groups.all.push(item);
    groups[category].push(item);
  }

  return {
    counts: {
      all: groups.all.length,
      youtube: groups.youtube.length,
      "youtube-music": groups["youtube-music"].length,
      spotify: groups.spotify.length,
      other: groups.other.length,
    },
    groups,
  };
}
