import { useTheme } from "@/hooks/useTheme";
import { ACCENT_COLORS, BASE_COLORS, type ThemeAccent, type ThemeBase } from "@/lib/theme.constants";
import { cn } from "@/lib/utils";

interface ThemeSwatchProps {
  label: string;
  selected: boolean;
  dotClassName: string;
  themeAttribute: "data-base" | "data-accent";
  themeValue: ThemeBase | ThemeAccent;
  onSelect: () => void;
}

function ThemeSwatch({
  label,
  selected,
  dotClassName,
  themeAttribute,
  themeValue,
  onSelect,
}: ThemeSwatchProps) {
  const themeData = themeAttribute === "data-base" ? { "data-base": themeValue } : { "data-accent": themeValue };

  return (
    <button
      type="button"
      role="radio"
      id={`theme-option-${themeValue}`}
      {...themeData}
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "relative flex flex-col items-center gap-2 rounded-lg border border-border/70 p-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-ring",
        selected && "border-ring bg-accent text-foreground",
      )}
    >
      <span
        className={cn("size-8 rounded-full ring-1 ring-border", dotClassName)}
        aria-hidden="true"
      />
      <span className="w-full truncate text-center">{label}</span>
      {selected && (
        <span
          id={`theme-check-${themeValue}`}
          className="absolute top-1.5 right-1.5 text-xs leading-none font-semibold text-foreground"
        >
          ✓
        </span>
      )}
    </button>
  );
}

/** Official shadcn base-color and accent palettes, applied instantly. */
export function ThemeSelector() {
  const { base, accent, setBase, setAccent } = useTheme();

  return (
    <div className="space-y-4">
      <section
        aria-labelledby="base-color-label"
        className="space-y-3 rounded-lg border border-border bg-card p-4"
      >
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="base-color-label" className="text-sm font-semibold">
            Base color
          </h2>
          <span className="text-xs text-muted-foreground">
            {BASE_COLORS.find((option) => option.id === base)?.label}
          </span>
        </div>
        <div
          role="radiogroup"
          aria-labelledby="base-color-label"
          className="grid grid-cols-4 gap-2 sm:grid-cols-7"
        >
          {BASE_COLORS.map((option) => (
            <ThemeSwatch
              key={option.id}
              label={option.label}
              selected={base === option.id}
              dotClassName="bg-muted-foreground"
              themeAttribute="data-base"
              themeValue={option.id}
              onSelect={() => setBase(option.id)}
            />
          ))}
        </div>
      </section>
      <section
        aria-labelledby="accent-color-label"
        className="space-y-3 rounded-lg border border-border bg-card p-4"
      >
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="accent-color-label" className="text-sm font-semibold">
            Accent
          </h2>
          <span className="text-xs text-muted-foreground">
            {ACCENT_COLORS.find((option) => option.id === accent)?.label}
          </span>
        </div>
        <div
          role="radiogroup"
          aria-labelledby="accent-color-label"
          className="grid grid-cols-4 gap-2 sm:grid-cols-6"
        >
          {ACCENT_COLORS.map((option) => (
            <ThemeSwatch
              key={option.id}
              label={option.label}
              selected={accent === option.id}
              dotClassName="bg-primary"
              themeAttribute="data-accent"
              themeValue={option.id}
              onSelect={() => setAccent(option.id)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
