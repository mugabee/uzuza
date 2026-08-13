import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useColorScheme as useSystemColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colorScheme as nativewindColorScheme } from "nativewind";

// Mirrors the web app's DisplaySettings.tsx: theme (light/dark) and
// high-contrast are two independent axes, not one combined mode.
// Persisted the same way the web app persists its localStorage prefs, just
// with AsyncStorage as the storage layer instead.

type Theme = "light" | "dark";

const THEME_KEY = "uzuza_theme";
const CONTRAST_KEY = "uzuza_contrast";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (t: Theme) => void;
  highContrast: boolean;
  setHighContrast: (v: boolean) => void;
  rootClassName: string;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useSystemColorScheme();
  const [theme, setThemeState] = useState<Theme>(systemScheme === "dark" ? "dark" : "light");
  const [highContrast, setHighContrastState] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const [storedTheme, storedContrast] = await Promise.all([
        AsyncStorage.getItem(THEME_KEY),
        AsyncStorage.getItem(CONTRAST_KEY),
      ]);
      if (storedTheme === "dark" || storedTheme === "light") {
        setThemeState(storedTheme);
        nativewindColorScheme.set(storedTheme);
      } else {
        nativewindColorScheme.set(systemScheme === "dark" ? "dark" : "light");
      }
      if (storedContrast === "high") setHighContrastState(true);
      setLoaded(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setTheme(next: Theme) {
    setThemeState(next);
    nativewindColorScheme.set(next);
    AsyncStorage.setItem(THEME_KEY, next);
  }

  function setHighContrast(next: boolean) {
    setHighContrastState(next);
    AsyncStorage.setItem(CONTRAST_KEY, next ? "high" : "default");
  }

  if (!loaded) return null;

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        highContrast,
        setHighContrast,
        rootClassName: highContrast ? "high-contrast" : "",
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
