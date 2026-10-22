import { ChorusMark, SpotifyGlyph, YouTubeGlyph, YouTubeMusicGlyph } from "@/components/brand";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { AddShortcutDialog } from "@/features/browser-home/add-shortcut-dialog";
import { HistoryPanel } from "@/features/browser-home/history-panel";
import { browser, openBrowser } from "@/lib/api";
import type { Shortcut } from "@/lib/browser.types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Clock, MoreVertical, Plus, Settings, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

/** Website favicon when available, else the official service glyph, else Chorus's mark. */
function ShortcutGlyph({ shortcut }: { shortcut: Shortcut; }) {
  if (shortcut.icon) {
    return (
      <span className="grid size-8 place-items-center rounded-md bg-icon-surface p-1 ring-1 ring-border/60">
        <img src={shortcut.icon} alt="" className="size-full object-contain" />
      </span>
    );
  }
  switch (shortcut.service) {
    case "youtube":
      return <YouTubeGlyph size={32} />;
    case "youtube-music":
      return <YouTubeMusicGlyph size={32} />;
    case "spotify":
      return <SpotifyGlyph size={32} />;
    default:
      return <ChorusMark size={32} />;
  }
}

const SEARCH_URL = "https://www.youtube.com/results?search_query=";

/**
 * Chorus Browser home — URL/search bar, shortcut tiles (official logos),
 * and the "+" tile to pin a new site. Sessions, history, and persistence
 * live in Rust (`crates/browser-store` + `modules/browser`).
 * The history panel is part of the URL (`?panel=history`) so it stays
 * deep-linkable while the home menu controls it.
 */
export function BrowserHome() {
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [addOpen, setAddOpen] = useState(false);
  const historyOpen = searchParams.get("panel") === "history";
  const setHistoryOpen = (open: boolean) => {
    setSearchParams(open ? { panel: "history" } : {}, { replace: true });
  };

  const state = useQuery({ queryKey: ["browser", "state"], queryFn: browser.state });

  const clearHistory = useMutation({
    mutationFn: browser.clearHistory,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["browser", "state"] }),
  });

  const openTarget = (target: string) => {
    if (/^https?:\/\//i.test(target)) {
      void browser.loadUrl(target);
    } else if (target.includes(".")) {
      void browser.loadUrl(`https://${target}`);
    } else if (target.trim()) {
      void browser.loadUrl(SEARCH_URL + encodeURIComponent(target.trim()));
    }
  };

  const onTileClick = (shortcut: Shortcut) => {
    if (shortcut.service) {
      void openBrowser(shortcut.service);
    } else {
      void browser.loadUrl(shortcut.url);
    }
  };

  const shortcuts = state.data?.shortcuts ?? [];

  return (
    <div className="relative flex flex-1 flex-col">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex select-none items-center justify-center"
      >
        <span className="text-7xl font-bold tracking-tighter text-muted sm:text-9xl">
          Chorus
        </span>
      </div>

      <div className="relative z-10 flex flex-1 flex-col">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2 px-1">
            <ChorusMark size={26} />
            <span
              id="chorus-wordmark"
              className="text-lg font-bold tracking-tight text-foreground"
            >
              One<span className="text-primary">Vid</span>
            </span>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                id="browser-menu"
                className="size-9"
                aria-label="Browser menu"
              >
                <MoreVertical className="size-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Chorus Browser
              </DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => setHistoryOpen(true)}>
                <Clock /> History
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                disabled={(state.data?.history.length ?? 0) === 0}
                onSelect={() => clearHistory.mutate()}
              >
                <Trash2 /> Clear history
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem id="browser-menu-settings" onSelect={() => navigate("/settings")}>
                <Settings /> Settings
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <form
          className="relative mb-6"
          onSubmit={(e) => {
            e.preventDefault();
            openTarget(inputRef.current?.value ?? "");
          }}
        >
          <Input
            id="browser-url-input"
            ref={inputRef}
            placeholder="Search or enter address"
            inputMode="url"
            enterKeyHint="go"
            autoComplete="off"
            spellCheck={false}
            className="h-11 pr-12 bg-card"
            aria-label="Search or enter address"
          />
          <Button
            type="submit"
            variant="ghost"
            size="icon"
            id="browser-url-submit"
            className="absolute top-1/2 right-1.5 size-8 -translate-y-1/2"
            aria-label="Go"
          >
            <ArrowRight className="size-4" />
          </Button>
        </form>

        <section aria-label="Shortcuts" className="grid grid-cols-4 gap-3">
          {shortcuts.map((shortcut) => (
            <button
              key={shortcut.id}
              type="button"
              id={`shortcut-${shortcut.id}`}
              aria-label={`Open ${shortcut.label}`}
              onClick={() => onTileClick(shortcut)}
              className="grid aspect-square place-items-center rounded-xl border border-border bg-card transition-colors hover:border-ring/60 active:bg-accent"
            >
              <ShortcutGlyph shortcut={shortcut} />
            </button>
          ))}
          <button
            type="button"
            id="browser-add-shortcut"
            aria-label="Add shortcut"
            className="grid aspect-square place-items-center rounded-xl border border-dashed border-border text-muted-foreground transition-colors hover:border-ring/60 hover:text-foreground active:bg-accent"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="size-5" />
          </button>
        </section>

        <HistoryPanel
          open={historyOpen}
          entries={state.data?.history ?? []}
          clearing={clearHistory.isPending}
          onClose={() => setHistoryOpen(false)}
          onOpenUrl={(url) => {
            setHistoryOpen(false);
            void browser.loadUrl(url);
          }}
          onClear={() => clearHistory.mutate()}
        />

        <AddShortcutDialog open={addOpen} onOpenChange={setAddOpen} />
      </div>
    </div>
  );
}
