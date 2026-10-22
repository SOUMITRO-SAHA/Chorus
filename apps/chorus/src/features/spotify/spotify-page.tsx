import { ShelfRow } from "@/components/feed";
import { MediaRow } from "@/components/media-card";
import { ErrorState, ListSkeleton } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import { spotify } from "@/lib/api";
import { formatDuration } from "@/lib/formatDuration.utils";
import type { MediaItem } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";
import { KeyRound, Music2, Pause, Play } from "lucide-react";
import { useState } from "react";

/**
 * Spotify — official Web API with your own account (OAuth PKCE).
 * Catalog browse/search native; tracks play 30s previews via the API's
 * preview_url (full-track DRM playback is on the roadmap).
 */
export function SpotifyPage() {
  const [clientId, setClientId] = useState("");
  const player = useAudioPlayer();

  const status = useQuery({ queryKey: ["spotify", "status"], queryFn: spotify.status });
  const releases = useQuery({
    queryKey: ["spotify", "releases"],
    queryFn: spotify.newReleases,
    enabled: !!status.data?.connected,
  });

  const [searchQuery, setSearchQuery] = useState<string | null>(null);
  const results = useQuery({
    queryKey: ["spotify", "search", searchQuery],
    queryFn: () => spotify.search(searchQuery!),
    enabled: !!searchQuery && !!status.data?.connected,
  });

  const play = (item: MediaItem) => {
    if (item.kind === "album") {
      // Albums expand into a track search — simplest native path for now.
      setSearchQuery(null);
      void spotify.albumTracks(item.id).then((tracks) => {
        const first = tracks.find((t) => t.previewUrl);
        if (first?.previewUrl) player.load(first.id, first.previewUrl);
      });
      return;
    }
    if (item.previewUrl) player.load(item.id, item.previewUrl);
  };

  if (status.isLoading) {
    return <ListSkeleton rows={4} />;
  }

  if (status.isError) {
    return (
      <div className="mx-auto max-w-2xl py-10">
        <ErrorState message={String(status.error)} onRetry={() => status.refetch()} />
      </div>
    );
  }

  // Setup flow
  if (!status.data?.configured || !status.data?.connected) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Music2 className="size-5 text-primary" /> Connect Spotify
            </CardTitle>
            <CardDescription>
              Chorus uses Spotify's official Web API with your own free app credentials — your credentials stay on this
              machine.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
              <li>
                Open the{" "}
                <a
                  className="text-foreground underline decoration-primary underline-offset-2"
                  href="https://developer.spotify.com/dashboard"
                  target="_blank"
                  rel="noreferrer"
                >
                  Spotify Developer Dashboard
                </a>{" "}
                → Create app.
              </li>
              <li>
                Set redirect URI to{" "}
                <code className="rounded bg-secondary px-1 py-0.5 text-xs">http://127.0.0.1:8765/callback</code>{" "}
                and enable the <em>Web API</em>.
              </li>
              <li>Paste the Client ID below and connect.</li>
            </ol>
            <div className="flex gap-2">
              <Input
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="Client ID"
                aria-label="Spotify Client ID"
              />
              <Button
                disabled={!clientId.trim()}
                onClick={async () => {
                  await spotify.saveClientId(clientId.trim());
                  await spotify.connect();
                  await status.refetch();
                  void releases.refetch();
                }}
              >
                <KeyRound className="size-4" /> Connect
              </Button>
            </div>
            {status.data?.configured && !status.data?.connected && (
              <Button
                variant="outline"
                className="w-full"
                onClick={async () => {
                  await spotify.connect();
                  await status.refetch();
                }}
              >
                Open Spotify in browser & sign in
              </Button>
            )}
            <p className="text-xs leading-relaxed text-muted-foreground">
              Full-track playback requires Spotify's DRM (Web Playback SDK) — on the roadmap. Until then tracks play
              their 30s previews.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Connected
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="border-primary/30 bg-primary/10 text-foreground">
          <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
          Connected{status.data.displayName ? ` · ${status.data.displayName}` : ""}
        </Badge>
      </div>

      {searchQuery && (
        <section aria-label={`Spotify results for ${searchQuery}`} className="space-y-2">
          <h2 className="text-lg font-bold tracking-tight">Tracks for “{searchQuery}”</h2>
          {results.isLoading && <ListSkeleton />}
          {results.isError && <ErrorState message={String(results.error)} onRetry={() => results.refetch()} />}
          {results.data?.map((item) => (
            <MediaRow key={item.id} item={item} active={player.currentId === item.id} onClick={play} />
          ))}
        </section>
      )}

      {releases.data?.map((shelf) => (
        <ShelfRow key={shelf.title} shelf={shelf} activeId={player.currentId} onPlay={play} />
      ))}

      {player.currentId && (
        <div
          className="sticky bottom-16 z-20 -mx-4 border-t border-border/60 bg-card/95 px-4 py-2.5 backdrop-blur sm:-mx-6 sm:px-6"
          role="region"
          aria-label="Now playing"
        >
          <div className="mx-auto flex w-full max-w-7xl items-center gap-3">
            <Music2 className="size-4 text-primary" />
            <p className="min-w-0 flex-1 truncate text-sm">
              {formatDuration(player.position)} / 0:30 · preview playing
            </p>
            <Button
              size="icon"
              className="size-8 rounded-full"
              aria-label={player.playing ? "Pause preview" : "Play preview"}
              onClick={player.toggle}
            >
              {player.playing
                ? <Pause className="size-4" />
                : <Play className="size-4 translate-x-px" fill="currentColor" />}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
