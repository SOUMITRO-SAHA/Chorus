import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { useEffect, useRef } from "react";

interface Props {
  placeholder: string;
  /** Called on submit (Enter or button press). */
  onSearch: (query: string) => void;
  /** Disables the submit button while a query is in flight. */
  busy?: boolean;
}

/**
 * Uncontrolled search input — the DOM value is read on submit, so it works
 * identically for human typing, IMEs and automation tooling.
 */
export function SearchBar({ placeholder, onSearch, busy }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") (document.activeElement as HTMLElement)?.blur();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <form
      className="flex w-full max-w-xl items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const q = inputRef.current?.value.trim() ?? "";
        if (q) onSearch(q);
      }}
    >
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id="search-input"
          ref={inputRef}
          placeholder={placeholder}
          inputMode="search"
          enterKeyHint="search"
          className="h-10 bg-secondary/60 pl-9"
          aria-label={placeholder}
        />
      </div>
      {/* Icon-only on phones, labeled from tablet up */}
      <Button
        type="submit"
        id="search-submit"
        size="icon"
        disabled={busy}
        className="size-10 shrink-0 sm:hidden"
        aria-label="Search"
      >
        <Search className="size-4" />
      </Button>
      <Button
        type="submit"
        id="search-submit"
        disabled={busy}
        className="hidden h-10 shrink-0 sm:inline-flex"
        aria-label="Search"
      >
        {busy ? "…" : "Search"}
      </Button>
    </form>
  );
}
