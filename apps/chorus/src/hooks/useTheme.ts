import { ThemeContext, type ThemeContextValue } from "@/lib/theme.context";
import { useContext } from "react";

/** Reads the active appearance mode and base/accent palette; throws outside `ThemeProvider`. */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
