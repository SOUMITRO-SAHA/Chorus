import { SpotifyGlyph, YouTubeGlyph, YouTubeMusicGlyph } from "@/components/brand";
import type { HistoryListItem } from "@/features/browser-home/history-grouping.utils";
import { browser } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Globe } from "lucide-react";

const DAY_MS = 86_400_000;
const FAVICON_STALE_MS = Number.POSITIVE_INFINITY;
const FAVICON_GC_MS = DAY_MS;

const TILE = "grid size-9 shrink-0 place-items-center overflow-hidden rounded-[10px] ring-1 ring-border/60";

function ServiceMark({ category }: { category: HistoryListItem["category"]; }) {
  switch (category) {
    case "youtube":
      return <YouTubeGlyph size={22} />;
    case "youtube-music":
      return <YouTubeMusicGlyph size={23} />;
    case "spotify":
      return <SpotifyGlyph size={23} />;
    default:
      return null;
  }
}

function SiteFavicon({ host, source }: { host: string; source: string; }) {
  const icon = useQuery({
    queryKey: ["browser", "favicon", host],
    queryFn: () => browser.favicon(source),
    staleTime: FAVICON_STALE_MS,
    gcTime: FAVICON_GC_MS,
    retry: false,
  });

  if (icon.data) {
    return (
      <span className={cn(TILE, "bg-icon-surface p-1.5")}>
        <img src={icon.data} alt="" draggable={false} loading="lazy" className="size-full object-contain" />
      </span>
    );
  }

  return (
    <span className={cn(TILE, "bg-card text-muted-foreground")} aria-hidden="true">
      {icon.isPending
        ? <Globe className="size-4" />
        : <span className="text-sm font-semibold text-foreground/70">{host.charAt(0).toUpperCase()}</span>}
    </span>
  );
}

/**
 * Identity mark for one history row: the official service glyph for Chorus's
 * services, or the site's cached favicon for everything else.
 */
export function HistoryFavicon({ item }: { item: HistoryListItem; }) {
  if (item.category === "other") return <SiteFavicon host={item.host} source={item.entry.url} />;
  return (
    <span className={cn(TILE, "bg-card")} aria-hidden="true">
      <ServiceMark category={item.category} />
    </span>
  );
}
