import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { browser } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Globe, Link2, Loader2, Plus, X } from "lucide-react";
import { type FormEvent, useState } from "react";

interface AddShortcutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Enter a website address.");
  }
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
  let parsed: URL;
  try {
    parsed = new URL(hasScheme ? trimmed : `https://${trimmed}`);
  } catch {
    throw new Error("Enter a valid website address, like example.com.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http and https links are supported.");
  }
  return parsed.toString();
}

function labelFor(url: string): string {
  const host = new URL(url).hostname.replace(/^www\./, "");
  return host || url;
}

/**
 * Centered "add shortcut" dialog: a single website-link field. The favicon is
 * fetched natively and persisted with the shortcut; failures fall back to
 * Chorus's default mark on the tile.
 */
export function AddShortcutDialog({ open, onOpenChange }: AddShortcutDialogProps) {
  const queryClient = useQueryClient();
  const [url, setUrl] = useState("");

  const addShortcut = useMutation({
    mutationFn: async (raw: string) => {
      const target = normalizeUrl(raw);
      const icon = await browser.favicon(target).catch(() => null);
      return browser.shortcutAdd(labelFor(target), target, "", icon);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["browser", "state"] });
      setUrl("");
      onOpenChange(false);
    },
  });

  const handleOpenChange = (next: boolean) => {
    if (addShortcut.isPending) return;
    if (!next) {
      setUrl("");
      addShortcut.reset();
    }
    onOpenChange(next);
  };

  const handleUrlChange = (value: string) => {
    setUrl(value);
    if (addShortcut.isError) addShortcut.reset();
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    addShortcut.mutate(url);
  };

  const error = addShortcut.error?.message ?? null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100dvh-3rem)] max-w-[calc(100%-3rem)] overflow-y-auto rounded-xl border-border/80 bg-popover p-5 text-popover-foreground shadow-2xl sm:max-w-md"
      >
        <form className="grid gap-5" onSubmit={onSubmit} aria-busy={addShortcut.isPending}>
          <DialogHeader className="relative text-left">
            {!addShortcut.isPending
              ? (
                <DialogClose asChild>
                  <Button
                    id="shortcut-dialog-close"
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute -top-1 -right-1 size-10 text-muted-foreground hover:text-foreground"
                    aria-label="Close"
                  >
                    <X className="size-4" />
                  </Button>
                </DialogClose>
              )
              : null}
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20"
              >
                <Link2 className="size-5" />
              </span>
              <div className="grid gap-1 pr-10">
                <DialogTitle className="text-lg leading-tight">Add shortcut</DialogTitle>
                <DialogDescription className="leading-snug">
                  Paste a link and we'll fetch its icon.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="grid gap-2">
            <Label
              htmlFor="shortcut-url"
              className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
            >
              Website link
            </Label>
            <div className="relative">
              <Globe
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id="shortcut-url"
                autoFocus
                value={url}
                onChange={(event) => handleUrlChange(event.target.value)}
                placeholder="example.com"
                inputMode="url"
                enterKeyHint="go"
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                disabled={addShortcut.isPending}
                aria-invalid={error !== null}
                aria-describedby={error ? "shortcut-url-error" : undefined}
                className="h-11 pr-3 pl-9 text-base focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/20"
              />
            </div>
            {error
              ? (
                <p
                  id="shortcut-url-error"
                  role="alert"
                  className="flex items-start gap-1.5 text-xs leading-snug text-destructive"
                >
                  <CircleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                  <span>{error}</span>
                </p>
              )
              : null}
          </div>

          <DialogFooter className="flex-row justify-end gap-2">
            <DialogClose asChild>
              <Button
                type="button"
                variant="ghost"
                className="h-10 px-4 text-muted-foreground hover:text-foreground"
                disabled={addShortcut.isPending}
              >
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit"
              id="shortcut-add-submit"
              disabled={addShortcut.isPending || url.trim().length === 0}
              className="h-10 min-w-28 px-5 disabled:bg-secondary disabled:text-muted-foreground disabled:opacity-100"
            >
              {addShortcut.isPending
                ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Adding…
                  </>
                )
                : (
                  <>
                    <Plus className="size-4" />
                    Add
                  </>
                )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
