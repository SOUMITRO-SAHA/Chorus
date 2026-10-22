import { cn } from "@/lib/utils";
import { Disc3, ListMusic, PlaySquare } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

const TABS = [
  { path: "/youtube", label: "Videos", icon: PlaySquare },
  { path: "/music", label: "Music", icon: ListMusic },
  { path: "/spotify", label: "Spotify", icon: Disc3 },
];

/**
 * Android-first bottom tab navigation — shown on every service route.
 * Hidden on the browser home (which is itself the app switcher).
 */
export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  if (location.pathname === "/") return null;

  const active = location.pathname.startsWith("/youtube/") ? "/youtube" : location.pathname;
  if (!TABS.some((t) => t.path === active)) return null;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-card/95 backdrop-blur"
      aria-label="Services"
    >
      <div className="mx-auto flex h-16 max-w-3xl items-stretch">
        {TABS.map((tab) => {
          const isActive = active === tab.path;
          return (
            <button
              key={tab.path}
              type="button"
              onClick={() => navigate(tab.path)}
              aria-label={`Open ${tab.label}`}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-0.5 pt-1 text-[11px] font-medium transition-colors",
                isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "grid size-8 place-items-center rounded-full transition-colors",
                  isActive && "bg-primary text-primary-foreground",
                )}
              >
                <tab.icon className="size-5" />
              </span>
              {tab.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
