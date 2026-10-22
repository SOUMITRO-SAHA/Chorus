import { ChorusMark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface Props {
  /** Right-side slot (e.g. a search bar). */
  children?: React.ReactNode;
  /** Route the back button returns to. */
  backTo?: string;
  /** Accessible label describing the back destination. */
  backLabel?: string;
}

export function AppHeader({
  children,
  backTo = "/",
  backLabel = "Go back to Chorus home",
}: Props) {
  const navigate = useNavigate();
  const isHome = window.location.hash === "#/";

  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-1.5 px-2 sm:gap-3 sm:px-6">
        {!isHome && (
          <Button
            id="app-header-back"
            variant="ghost"
            size="icon"
            className="size-9 shrink-0"
            aria-label={backLabel}
            onClick={() => navigate(backTo)}
          >
            <ArrowLeft className="size-5" />
          </Button>
        )}
        <button
          type="button"
          onClick={() => navigate("/")}
          className="flex shrink-0 items-center gap-2 px-1"
          aria-label="Chorus home"
        >
          <ChorusMark size={28} />
          <span className="hidden text-[15px] font-bold tracking-tight md:block">Chorus</span>
        </button>
        <div className="flex min-w-0 flex-1 justify-end sm:justify-center">{children}</div>
      </div>
    </header>
  );
}
