import { FeedSkeleton, MediaGrid, ShelfRow } from "@/components/feed";
import { ErrorState } from "@/components/states";
import { youtube } from "@/lib/api";
import type { MediaItem } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";

export function YouTubePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const query = params.get("q");

  const home = useQuery({ queryKey: ["youtube", "home"], queryFn: youtube.home, staleTime: 5 * 60_000 });
  const results = useQuery({
    queryKey: ["youtube", "search", query],
    queryFn: () => youtube.search(query!),
    enabled: !!query,
  });

  const open = (item: MediaItem) => navigate(`/youtube/${item.id}`);

  if (query) {
    return (
      <div className="space-y-5">
        <h1 className="text-lg font-bold tracking-tight">Results for “{query}”</h1>
        {results.isLoading && <FeedSkeleton rows={1} />}
        {results.isError && <ErrorState message={String(results.error)} onRetry={() => results.refetch()} />}
        {results.data && <MediaGrid items={results.data} onPlay={open} />}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {home.isLoading && <FeedSkeleton rows={2} />}
      {home.isError && <ErrorState message={String(home.error)} onRetry={() => home.refetch()} />}
      {home.data?.map((shelf) => <ShelfRow key={shelf.title} shelf={shelf} onPlay={open} />)}
    </div>
  );
}
