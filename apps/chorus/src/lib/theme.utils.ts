import {
  ACCENT_COLORS,
  BASE_COLORS,
  DEFAULT_THEME_ACCENT,
  DEFAULT_THEME_BASE,
  DEFAULT_THEME_MODE,
  type ResolvedTheme,
  THEME_ACCENT_STORAGE_KEY,
  THEME_BASE_STORAGE_KEY,
  THEME_MODE_STORAGE_KEY,
  type ThemeAccent,
  type ThemeBase,
  type ThemeMode,
} from "@/lib/theme.constants";

const SYSTEM_THEME_QUERY = "(prefers-color-scheme: dark)";

function isThemeBase(value: string): value is ThemeBase {
  return BASE_COLORS.some((option) => option.id === value);
}

function isThemeAccent(value: string): value is ThemeAccent {
  return ACCENT_COLORS.some((option) => option.id === value);
}

export function isThemeMode(value: string): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

/** Falls back to the default base color when storage is unavailable or holds an unknown id. */
export function readStoredThemeBase(): ThemeBase {
  try {
    const stored = window.localStorage.getItem(THEME_BASE_STORAGE_KEY);
    return stored && isThemeBase(stored) ? stored : DEFAULT_THEME_BASE;
  } catch {
    return DEFAULT_THEME_BASE;
  }
}

/** Falls back to the default accent color when storage is unavailable or holds an unknown id. */
export function readStoredThemeAccent(): ThemeAccent {
  try {
    const stored = window.localStorage.getItem(THEME_ACCENT_STORAGE_KEY);
    return stored && isThemeAccent(stored) ? stored : DEFAULT_THEME_ACCENT;
  } catch {
    return DEFAULT_THEME_ACCENT;
  }
}

/** Falls back to the system mode when storage is unavailable or holds an unknown id. */
export function readStoredThemeMode(): ThemeMode {
  try {
    const stored = window.localStorage.getItem(THEME_MODE_STORAGE_KEY);
    return stored && isThemeMode(stored) ? stored : DEFAULT_THEME_MODE;
  } catch {
    return DEFAULT_THEME_MODE;
  }
}

export function storeThemeBase(base: ThemeBase): void {
  try {
    window.localStorage.setItem(THEME_BASE_STORAGE_KEY, base);
  } catch {
    return;
  }
}

export function storeThemeAccent(accent: ThemeAccent): void {
  try {
    window.localStorage.setItem(THEME_ACCENT_STORAGE_KEY, accent);
  } catch {
    return;
  }
}

export function storeThemeMode(mode: ThemeMode): void {
  try {
    window.localStorage.setItem(THEME_MODE_STORAGE_KEY, mode);
  } catch {
    return;
  }
}

/** Resolves `system` against the OS preference, leaving explicit modes untouched. */
export function resolveThemeMode(mode: ThemeMode, systemPrefersDark: boolean): ResolvedTheme {
  if (mode === "system") {
    return systemPrefersDark ? "dark" : "light";
  }
  return mode;
}

export function subscribeToSystemTheme(onChange: () => void): () => void {
  const query = window.matchMedia(SYSTEM_THEME_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function getSystemThemeSnapshot(): boolean {
  return window.matchMedia(SYSTEM_THEME_QUERY).matches;
}
