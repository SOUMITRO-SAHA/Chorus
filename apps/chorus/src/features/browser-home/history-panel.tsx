import { SpotifyGlyph, YouTubeGlyph, YouTubeMusicGlyph } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HistoryFavicon } from "@/features/browser-home/history-favicon";
import {
  buildHistoryView,
  type HistoryCategory,
  type HistoryListItem,
} from "@/features/browser-home/history-grouping.utils";
import type { HistoryEntry } from "@/lib/browser.types";
import { ChevronRight, Clock, Globe, Layers, Loader2, Trash2, X } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";

interface HistoryPanelProps {
  open: boolean;
  entries: readonly HistoryEntry[];
  clearing: boolean;
  onClose: () => void;
  onOpenUrl: (url: string) => void;
  onClear: () => void;
}

interface HistoryTab {
  readonly id: HistoryCategory;
  readonly label: string;
  readonly mark: ReactNode;
}

const HISTORY_TABS: readonly HistoryTab[] = [
  { id: "all", label: "All", mark: <Layers className="size-3.5" aria-hidden="true" /> },
  { id: "youtube", label: "YouTube", mark: <YouTubeGlyph size={15} /> },
  { id: "youtube-music", label: "YT Music", mark: <YouTubeMusicGlyph size={15} /> },
  { id: "spotify", label: "Spotify", mark: <SpotifyGlyph size={15} /> },
  { id: "other", label: "Other", mark: <Globe className="size-3.5" aria-hidden="true" /> },
];

const visitNoun = (count: number) => (count === 1 ? "visit" : "visits");

function visitSummary(count: number): string {
  if (count === 0) return "No visits yet";
  return `${count.toLocaleString()} ${visitNoun(count)}`;
}

function HistoryRow({ item, onOpen }: { item: HistoryListItem; onOpen: (url: string) => void; }) {
  return (
    <button
      type="button"
      id={`history-${item.entry.id}`}
      onClick={() => onOpen(item.entry.url)}
      aria-label={`Open ${item.title} — ${item.detail}`}
      className="flex w-full touch-manipulation items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-accent/70 active:bg-accent"
    >
      <HistoryFavicon item={item} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{item.title}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{item.detail}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5 self-center">
        <span className="text-[11px] tabular-nums text-muted-foreground">{item.timeLabel}</span>
        <ChevronRight className="size-3.5 text-muted-foreground/50" aria-hidden="true" />
      </span>
    </button>
  );
}

function HistoryList({ items, onOpen }: { items: readonly HistoryListItem[]; onOpen: (url: string) => void; }) {
  return (
    <div className="space-y-0.5 pb-3">
      {items.map((item, index) => {
        const showDay = index === 0 || items[index - 1]?.dayKey !== item.dayKey;
        return (
          <div key={item.entry.id}>
            {showDay
              ? (
                <p className="sticky top-0 z-10 bg-background/95 px-3 pb-1.5 pt-3 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase backdrop-blur">
                  {item.dayLabel}
                </p>
              )
              : null}
            <HistoryRow item={item} onOpen={onOpen} />
          </div>
        );
      })}
    </div>
  );
}

function EmptyHistory({ category }: { category: HistoryCategory; }) {
  const label = HISTORY_TABS.find((tab) => tab.id === category)?.label ?? "browsing";
  return (
    <div
      id="history-empty"
      className="flex min-h-64 flex-col items-center justify-center gap-3 px-8 py-14 text-center"
    >
      <span className="grid size-12 place-items-center rounded-full bg-card text-muted-foreground ring-1 ring-border/60">
        <Clock className="size-5" aria-hidden="true" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">
          {category === "all" ? "No history yet" : `No ${label} history yet`}
        </p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Pages you open in Chorus Browser appear here, grouped by service.
        </p>
      </div>
    </div>
  );
}

/**
 * Full-screen history picker for the browser menu. History is classified by
 * service in one pass, so the filter rail, counts, and active list share a
 * single derivation; only the selected group is mounted at a time.
 */
export function HistoryPanel({ open, entries, clearing, onClose, onOpenUrl, onClear }: HistoryPanelProps) {
  const [active, setActive] = useState<HistoryCategory>("all");
  const view = useMemo(() => buildHistoryView(entries, Date.now()), [entries, open]);
  const items = view.groups[active];

  const close = () => {
    setActive("all");
    onClose();
  };

  const clear = () => {
    setActive("all");
    onClear();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent
        id="history-panel"
        showCloseButton={false}
        className="top-0 left-0 flex h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-background p-0 sm:max-w-none"
      >
        <header className="shrink-0 border-b border-border/60 px-4 pb-2.5 pt-3">
          <DialogHeader className="mx-auto w-full max-w-2xl flex-row items-center justify-between gap-3 space-y-0 text-left">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-card text-muted-foreground ring-1 ring-border/60">
                <Clock className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <DialogTitle className="text-base font-semibold leading-tight">History</DialogTitle>
                <DialogDescription className="text-[11px] leading-tight text-muted-foreground">
                  {visitSummary(entries.length)}
                </DialogDescription>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-9 shrink-0 text-muted-foreground hover:text-foreground"
              aria-label="Close history"
              id="close-history"
              onClick={close}
            >
              <X className="size-5" />
            </Button>
          </DialogHeader>
        </header>

        <Tabs
          value={active}
          onValueChange={(value) => setActive(value as HistoryCategory)}
          className="mx-auto min-h-0 w-full max-w-2xl flex-1 gap-0"
        >
          <div className="shrink-0 px-3 py-2.5">
            <TabsList
              variant="default"
              className="h-auto w-full items-center justify-between gap-1 rounded-none bg-transparent p-0"
            >
              {HISTORY_TABS.map((tab) => {
                const count = view.counts[tab.id];
                const selected = tab.id === active;
                return (
                  <TabsTrigger
                    key={tab.id}
                    id={`history-tab-${tab.id}`}
                    value={tab.id}
                    disabled={tab.id !== "all" && count === 0}
                    aria-label={`${tab.label} history, ${count} ${visitNoun(count)}`}
                    className="h-9 flex-none gap-1.5 rounded-full border border-transparent px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground data-[state=active]:border-border/80 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-none"
                  >
                    {tab.mark}
                    <span className={selected ? "truncate" : "sr-only"}>{tab.label}</span>
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] leading-none tabular-nums text-muted-foreground">
                      {count}
                    </span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          <ScrollArea key={active} className="min-h-0 flex-1">
            <TabsContent value={active} className="m-0 px-2 sm:px-3">
              {items.length === 0
                ? <EmptyHistory category={active} />
                : <HistoryList items={items} onOpen={onOpenUrl} />}
            </TabsContent>
          </ScrollArea>
        </Tabs>

        <footer className="shrink-0 border-t border-border/60 p-3">
          <div className="mx-auto w-full max-w-2xl">
            <Button
              id="history-clear"
              variant="outline"
              className="h-10 w-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={clearing || entries.length === 0}
              onClick={clear}
            >
              {clearing ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              {clearing ? "Clearing…" : "Clear history"}
            </Button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
