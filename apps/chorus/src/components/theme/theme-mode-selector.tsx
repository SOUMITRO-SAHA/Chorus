import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useTheme } from "@/hooks/useTheme";
import { THEME_MODES, type ThemeMode } from "@/lib/theme.constants";
import { isThemeMode } from "@/lib/theme.utils";
import { Monitor, Moon, Sun } from "lucide-react";

const MODE_ICONS = {
  light: Sun,
  dark: Moon,
  system: Monitor,
} as const;

function modeSummary(mode: ThemeMode, resolvedTheme: "light" | "dark"): string {
  if (mode === "system") {
    return `System · ${resolvedTheme === "dark" ? "Dark" : "Light"}`;
  }
  return THEME_MODES.find((option) => option.id === mode)?.label ?? mode;
}

/** Light, dark, or system appearance, applied instantly across the app. */
export function ThemeModeSelector() {
  const { mode, resolvedTheme, setMode } = useTheme();

  return (
    <section
      aria-labelledby="theme-mode-label"
      className="space-y-3 rounded-lg border border-border bg-card p-4"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="theme-mode-label" className="text-sm font-semibold">
          Appearance
        </h2>
        <span className="text-xs text-muted-foreground">{modeSummary(mode, resolvedTheme)}</span>
      </div>
      <ToggleGroup
        type="single"
        value={mode}
        variant="outline"
        size="lg"
        aria-label="Appearance mode"
        className="grid w-full grid-cols-3"
        onValueChange={(value) => {
          if (value && isThemeMode(value)) {
            setMode(value);
          }
        }}
      >
        {THEME_MODES.map((option) => {
          const Icon = MODE_ICONS[option.id];
          return (
            <ToggleGroupItem
              key={option.id}
              id={`theme-mode-${option.id}`}
              value={option.id}
              aria-label={`${option.label} appearance`}
              className="h-11 gap-2 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
            >
              <Icon className="size-4" aria-hidden="true" />
              <span>{option.label}</span>
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>
      <p className="text-xs text-muted-foreground">
        System follows your device&apos;s light or dark setting.
      </p>
    </section>
  );
}
