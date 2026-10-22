import { FeedSkeleton, ShelfRow } from "@/components/feed";
import { MediaRow } from "@/components/media-card";
import { ErrorState, ListSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import { music } from "@/lib/api";
import { formatDuration } from "@/lib/formatDuration.utils";
import type { MediaItem } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * YouTube Music — native home shelves, search, and a persistent bottom
 * player. Songs stream as direct AAC audio (no ads, no video).
 */
export function MusicPage() {
  const [params] = useSearchParams();
  const query = params.get("q");
  const player = useAudioPlayer();
  const [playError, setPlayError] = useState<string | null>(null);
  const home = useQuery({ queryKey: ["music", "home"], queryFn: music.home, staleTime: 5 * 60_000 });
  const results = useQuery({
    queryKey: ["music", "search", query],
    queryFn: () => music.search(query!),
    enabled: !!query,
  });

  const play = (item: MediaItem) => {
    setPlayError(null);
    void music
      .play(item.id)
      .then((track) => {
        if (track.audioUrl) player.load(item.id, track.audioUrl);
        else setPlayError("No audio stream available for this track.");
      })
      .catch((error: unknown) => {
        setPlayError(
          String(error).includes("Cannot play")
            ? `${String(error)} Try another song — some uploads are verification-gated by YouTube.`
            : String(error),
        );
      });
  };

  const current = player.currentId
    ? [...(home.data ?? []).flatMap((s) => s.items), ...(results.data ?? [])].find((i) => i.id === player.currentId)
      ?? null
    : null;

  return (
    <>
      {playError && (
        <p
          role="alert"
          className="mx-4 mt-4 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive sm:mx-6"
        >
          {playError}
        </p>
      )}
      {query
        ? (
          <div className="flex-1 space-y-4">
            <h1 className="text-lg font-bold tracking-tight">Songs for “{query}”</h1>
            {results.isLoading && <ListSkeleton />}
            {results.isError && <ErrorState message={String(results.error)} onRetry={() => results.refetch()} />}
            {results.data?.map((item) => (
              <MediaRow key={item.id} item={item} active={player.currentId === item.id} onClick={play} />
            ))}
          </div>
        )
        : (
          <div className="flex-1 space-y-8">
            {home.isLoading && <FeedSkeleton rows={2} />}
            {home.isError && <ErrorState message={String(home.error)} onRetry={() => home.refetch()} />}
            {home.data?.map((shelf) => (
              <ShelfRow key={shelf.title} shelf={shelf} activeId={player.currentId} onPlay={play} />
            ))}
          </div>
        )}
      <PlayerBar player={player} current={current} />
    </>
  );
}

interface PlayerBarProps {
  player: ReturnType<typeof useAudioPlayer>;
  current: MediaItem | null;
}

function PlayerBar({ player, current }: PlayerBarProps) {
  if (!current) return null;
  return (
    <div
      className="sticky bottom-16 z-20 border-t border-border/60 bg-card/95 backdrop-blur"
      role="region"
      aria-label="Now playing"
    >
      <div className="mx-auto flex w-full max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
        {current.thumbnail && <img src={current.thumbnail} alt="" className="size-11 rounded-md object-cover" />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{current.title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {formatDuration(player.position)} / {formatDuration(player.duration)} · {current.subtitle}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Restart track"
            onClick={() => player.seek(0)}
          >
            <SkipBack className="size-4" />
          </Button>
          <Button
            size="icon"
            className="size-9 rounded-full"
            aria-label={player.playing ? "Pause" : "Play"}
            onClick={player.toggle}
          >
            {player.playing
              ? <Pause className="size-4" />
              : <Play className="size-4 translate-x-px" fill="currentColor" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Seek forward 10 seconds"
            onClick={() => player.seek(player.position + 10)}
          >
            <SkipForward className="size-4" />
          </Button>
        </div>
      </div>
      <div className="mx-auto w-full max-w-7xl px-4 pb-2 sm:px-6">
        <Slider
          value={[Math.min(player.position, player.duration || 0)]}
          max={player.duration || 1}
          step={1}
          onValueChange={(values: number[]) => player.seek(values[0])}
          aria-label="Seek"
        />
      </div>
    </div>
  );
}
