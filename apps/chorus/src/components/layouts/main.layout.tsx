import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface MainLayoutProps {
  /** Sticky top bar slot — the AppHeader with the route's search area. */
  header?: ReactNode;
  /** Fixed bottom tab bar slot — the service tab strip. */
  nav?: ReactNode;
  /** Per-route overrides for the content region (full-bleed, narrower). */
  contentClassName?: string;
  children: ReactNode;
}

/**
 * The one scaffold for every screen. The native shell (MainActivity window
 * insets) keeps the viewport between the Android status bar and the
 * gesture/IME areas; this layout owns everything inside it: background,
 * the header slot, the centered content region with bottom-nav clearance,
 * and the nav slot. The surface is the plain `background` token so it matches
 * the native status-bar strip instead of tinting the top of every screen.
 * Pages render content only — no container classes.
 */
export function MainLayout({ header, nav, contentClassName, children }: MainLayoutProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      {header}
      <main className={cn("mx-auto w-full max-w-7xl flex-1 px-4 py-6 pb-24 sm:px-6", contentClassName)}>
        {children}
      </main>
      {nav}
    </div>
  );
}
