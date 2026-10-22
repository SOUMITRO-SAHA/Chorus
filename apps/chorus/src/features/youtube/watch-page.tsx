import { MediaGrid } from "@/components/feed";
import { ErrorState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { openBrowser, youtube } from "@/lib/api";
import type { MediaItem } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";
import { Globe } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

export function WatchPage() {
  const { videoId } = useParams<{ videoId: string; }>();
  const navigate = useNavigate();
  const watch = useQuery({
    queryKey: ["youtube", "watch", videoId],
    queryFn: () => youtube.watch(videoId!),
    enabled: !!videoId,
  });

  if (watch.isLoading) {
    return (
      <div className="space-y-4">
        <div className="aspect-video w-full animate-pulse bg-muted sm:rounded-xl" />
        <div className="space-y-3 px-4 sm:px-0">
          <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
          <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
        </div>
      </div>
    );
  }

  if (watch.isError) {
    return (
      <div className="mx-auto max-w-2xl py-10">
        <ErrorState message={String(watch.error)} onRetry={() => watch.refetch()} />
        <div className="mt-4 flex justify-center">
          <Button variant="outline" size="sm" onClick={() => void openBrowser("youtube")}>
            <Globe className="size-4" /> Open in Chorus Browser instead
          </Button>
        </div>
      </div>
    );
  }

  const data = watch.data!;
  const open = (item: MediaItem) => {
    navigate(`/youtube/${item.id}`);
    watch.refetch();
  };

  return (
    <div className="space-y-4">
      {
        /* Player — direct progressive stream, full-bleed on phones like the
          real app, framed card on larger screens */
      }
      <div className="bg-black sm:overflow-hidden sm:rounded-xl sm:shadow-2xl">
        {data.streamUrl
          ? (
            <video
              key={data.video.id}
              src={data.streamUrl}
              poster={data.video.thumbnail}
              controls
              autoPlay
              playsInline
              className="aspect-video w-full"
              aria-label={`Playing ${data.video.title}`}
            />
          )
          : (
            <div className="grid aspect-video w-full place-items-center px-6 text-center text-sm text-muted-foreground">
              No stream available for this video — try another one.
            </div>
          )}
      </div>

      <div className="px-4 sm:px-0">
        <section className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-bold leading-snug tracking-tight sm:text-xl">
              {data.video.title}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{data.video.subtitle}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant="secondary">Ad-free</Badge>
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => navigate(-1)}>
              Back
            </Button>
          </div>
        </section>

        <section aria-label="Related videos" className="mt-6 space-y-4">
          <h2 className="text-base font-bold tracking-tight">Up next</h2>
          <MediaGrid items={data.related} onPlay={open} />
        </section>
      </div>
    </div>
  );
}
