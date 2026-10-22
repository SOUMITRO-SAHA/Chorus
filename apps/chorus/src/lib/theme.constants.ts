export const BASE_COLORS = [
  { id: "neutral", label: "Neutral" },
  { id: "stone", label: "Stone" },
  { id: "zinc", label: "Zinc" },
  { id: "mauve", label: "Mauve" },
  { id: "olive", label: "Olive" },
  { id: "mist", label: "Mist" },
  { id: "taupe", label: "Taupe" },
] as const;

export const ACCENT_COLORS = [
  { id: "amber", label: "Amber" },
  { id: "blue", label: "Blue" },
  { id: "cyan", label: "Cyan" },
  { id: "emerald", label: "Emerald" },
  { id: "fuchsia", label: "Fuchsia" },
  { id: "green", label: "Green" },
  { id: "indigo", label: "Indigo" },
  { id: "lime", label: "Lime" },
  { id: "orange", label: "Orange" },
  { id: "pink", label: "Pink" },
  { id: "purple", label: "Purple" },
  { id: "red", label: "Red" },
  { id: "rose", label: "Rose" },
  { id: "sky", label: "Sky" },
  { id: "teal", label: "Teal" },
  { id: "violet", label: "Violet" },
  { id: "yellow", label: "Yellow" },
] as const;

export const THEME_MODES = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "System" },
] as const;

export type ThemeBase = (typeof BASE_COLORS)[number]["id"];
export type ThemeAccent = (typeof ACCENT_COLORS)[number]["id"];
export type ThemeMode = (typeof THEME_MODES)[number]["id"];
export type ResolvedTheme = Exclude<ThemeMode, "system">;

export const DEFAULT_THEME_BASE: ThemeBase = "neutral";
export const DEFAULT_THEME_ACCENT: ThemeAccent = "blue";
export const DEFAULT_THEME_MODE: ThemeMode = "system";

export const THEME_BASE_STORAGE_KEY = "chorus.theme-base";
export const THEME_ACCENT_STORAGE_KEY = "chorus.theme-accent";
export const THEME_MODE_STORAGE_KEY = "chorus.theme-mode";
