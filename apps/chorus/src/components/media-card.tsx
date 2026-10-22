import type { MediaItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Play } from "lucide-react";

interface Props {
  item: MediaItem;
  active?: boolean;
  onClick?: (item: MediaItem) => void;
  className?: string;
}

/**
 * One card component for every kind of media across all providers (DRY).
 * Renders as a vertical poster (default) or horizontal row (`layout="row"`).
 */
export function MediaCard({ item, active, onClick, className }: Props) {
  return (
    <button
      type="button"
      id={`media-${item.id}`}
      onClick={() => onClick?.(item)}
      aria-label={`Play ${item.title}`}
      className={cn(
        "group w-full text-left rounded-xl p-2 transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring",
        active && "bg-accent",
        className,
      )}
    >
      <div className="relative overflow-hidden rounded-lg bg-muted">
        {item.thumbnail
          ? (
            <img
              src={item.thumbnail}
              alt=""
              loading="lazy"
              className="aspect-square w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
            />
          )
          : <div className="aspect-square w-full animate-pulse bg-muted" />}
        {item.duration && (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white">
            {item.duration}
          </span>
        )}
        <span
          className={cn(
            "absolute inset-0 grid place-items-center bg-black/45 opacity-0 transition-opacity group-hover:opacity-100",
            active && "opacity-100",
          )}
        >
          <span className="grid size-11 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg">
            <Play className="size-5 translate-x-px" fill="currentColor" />
          </span>
        </span>
      </div>
      <div className="mt-2 px-0.5">
        <p className="line-clamp-1 text-sm font-semibold">{item.title}</p>
        <p className="line-clamp-1 text-xs text-muted-foreground">{item.subtitle}</p>
      </div>
    </button>
  );
}

/** Compact horizontal row variant (lists, search results). */
export function MediaRow({ item, active, onClick }: Props) {
  return (
    <button
      type="button"
      id={`media-${item.id}`}
      onClick={() => onClick?.(item)}
      aria-label={`Play ${item.title}`}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-accent",
        active && "bg-accent",
      )}
    >
      {item.thumbnail
        ? <img src={item.thumbnail} alt="" loading="lazy" className="size-12 shrink-0 rounded-md object-cover" />
        : <div className="size-12 shrink-0 animate-pulse rounded-md bg-muted" />}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{item.title}</p>
        <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>
      </div>
      {item.duration && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{item.duration}</span>}
    </button>
  );
}
