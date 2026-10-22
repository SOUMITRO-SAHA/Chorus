import { useTheme } from "@/hooks/useTheme";
import { ACCENT_COLORS, BASE_COLORS, THEME_MODES } from "@/lib/theme.constants";
import { ChevronRight, Palette } from "lucide-react";
import { Link } from "react-router-dom";

/** App settings index — categories that own their own screen. */
export function SettingsPage() {
  const { base, accent, mode, resolvedTheme } = useTheme();
  const accentLabel = ACCENT_COLORS.find((option) => option.id === accent)?.label ?? accent;
  const baseLabel = BASE_COLORS.find((option) => option.id === base)?.label ?? base;
  const modeLabel = THEME_MODES.find((option) => option.id === mode)?.label ?? mode;
  const appearanceLabel = mode === "system"
    ? `${modeLabel} (${resolvedTheme === "dark" ? "Dark" : "Light"})`
    : modeLabel;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Personalize how Chorus looks on this device.
        </p>
      </header>

      <section aria-labelledby="appearance-label" className="space-y-2">
        <h2
          id="appearance-label"
          className="px-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase"
        >
          Appearance
        </h2>
        <ul className="overflow-hidden rounded-lg border border-border bg-card">
          <li>
            <Link
              to="/settings/themes"
              id="settings-themes-link"
              className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-accent active:bg-accent"
            >
              <Palette className="size-5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">Themes</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {appearanceLabel} · {accentLabel} accent · {baseLabel} base
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        </ul>
      </section>
    </div>
  );
}
