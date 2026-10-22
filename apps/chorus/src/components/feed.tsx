import { MediaCard } from "@/components/media-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { MediaItem, Shelf } from "@/lib/types";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef } from "react";

interface ShelfProps {
  shelf: Shelf;
  activeId?: string | null;
  onPlay: (item: MediaItem) => void;
}

/** A titled, horizontally scrollable row of media cards. */
export function ShelfRow({ shelf, activeId, onPlay }: ShelfProps) {
  const scroller = useRef<HTMLDivElement>(null);

  const scroll = (dir: 1 | -1) => {
    scroller.current?.scrollBy({ left: dir * Math.min(720, window.innerWidth * 0.8), behavior: "smooth" });
  };

  return (
    <section aria-label={shelf.title} className="space-y-2">
      <div className="flex items-center justify-between pr-1">
        <h2 className="text-base font-bold tracking-tight">{shelf.title}</h2>
        {/* arrows are desktop-only affordances; phones swipe */}
        <div className="hidden gap-1 sm:flex">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={`Scroll ${shelf.title} left`}
            onClick={() => scroll(-1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={`Scroll ${shelf.title} right`}
            onClick={() => scroll(1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
      <div
        ref={scroller}
        className="no-scrollbar -mx-1 flex snap-x gap-1 overflow-x-auto px-1 pb-1"
      >
        {shelf.items.map((item) => (
          <MediaCard
            key={`${shelf.title}-${item.id}`}
            item={item}
            active={activeId === item.id}
            onClick={onPlay}
            className="w-[150px] shrink-0 snap-start sm:w-[170px]"
          />
        ))}
      </div>
    </section>
  );
}

interface GridProps {
  items: MediaItem[];
  activeId?: string | null;
  onPlay: (item: MediaItem) => void;
}

/** Responsive grid of media cards (search results, related videos). */
export function MediaGrid({ items, activeId, onPlay }: GridProps) {
  return (
    <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {items.map((item) => <MediaCard key={item.id} item={item} active={activeId === item.id} onClick={onPlay} />)}
    </div>
  );
}

/** Loading placeholder matching the shelf/grid layouts. */
export function FeedSkeleton({ rows = 2 }: { rows?: number; }) {
  return (
    <div className="space-y-8" aria-hidden="true">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="space-y-3">
          <Skeleton className="h-5 w-32" />
          <div className="flex gap-3 overflow-hidden">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="w-[150px] shrink-0 space-y-2 sm:w-[170px]">
                <Skeleton className="aspect-square w-full rounded-lg" />
                <Skeleton className="h-3.5 w-4/5" />
                <Skeleton className="h-3 w-3/5" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
