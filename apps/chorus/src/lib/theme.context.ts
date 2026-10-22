import type { ResolvedTheme, ThemeAccent, ThemeBase, ThemeMode } from "@/lib/theme.constants";
import { createContext } from "react";

export interface ThemeContextValue {
  base: ThemeBase;
  accent: ThemeAccent;
  mode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setBase: (base: ThemeBase) => void;
  setAccent: (accent: ThemeAccent) => void;
  setMode: (mode: ThemeMode) => void;
}

/** Null until a `ThemeProvider` is mounted; `useTheme` turns that into a hard error. */
export const ThemeContext = createContext<ThemeContextValue | null>(null);
