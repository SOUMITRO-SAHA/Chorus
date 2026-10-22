import type { ThemeAccent, ThemeBase, ThemeMode } from "@/lib/theme.constants";
import { ThemeContext } from "@/lib/theme.context";
import {
  getSystemThemeSnapshot,
  readStoredThemeAccent,
  readStoredThemeBase,
  readStoredThemeMode,
  resolveThemeMode,
  storeThemeAccent,
  storeThemeBase,
  storeThemeMode,
  subscribeToSystemTheme,
} from "@/lib/theme.utils";
import { type ReactNode, useLayoutEffect, useMemo, useState, useSyncExternalStore } from "react";

interface ThemeProviderProps {
  children: ReactNode;
}

/** Applies the selected base, accent, and light/dark/system mode to the document root. */
export function ThemeProvider({ children }: ThemeProviderProps) {
  const [base, setBase] = useState<ThemeBase>(readStoredThemeBase);
  const [accent, setAccent] = useState<ThemeAccent>(readStoredThemeAccent);
  const [mode, setMode] = useState<ThemeMode>(readStoredThemeMode);
  const systemPrefersDark = useSyncExternalStore(
    subscribeToSystemTheme,
    getSystemThemeSnapshot,
  );
  const resolvedTheme = resolveThemeMode(mode, systemPrefersDark);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.base = base;
    root.dataset.accent = accent;
    root.dataset.mode = mode;
    root.dataset.theme = resolvedTheme;
    root.classList.toggle("dark", resolvedTheme === "dark");
    root.style.colorScheme = resolvedTheme;
    storeThemeBase(base);
    storeThemeAccent(accent);
    storeThemeMode(mode);
  }, [base, accent, mode, resolvedTheme]);

  const value = useMemo(
    () => ({ base, accent, mode, resolvedTheme, setBase, setAccent, setMode }),
    [base, accent, mode, resolvedTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
