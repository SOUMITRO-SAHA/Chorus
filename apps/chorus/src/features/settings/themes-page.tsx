import { ThemeModeSelector } from "@/components/theme/theme-mode-selector";
import { ThemeSelector } from "@/components/theme/theme-selector";

/** Theme settings — appearance mode, base color, and accent palette. */
export function ThemesPage() {
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Themes</h1>
        <p className="text-sm text-muted-foreground">
          Choose light, dark, or system appearance, then fine-tune the base color and accent. Changes apply instantly
          and are saved on this device.
        </p>
      </header>
      <ThemeModeSelector />
      <ThemeSelector />
    </div>
  );
}
