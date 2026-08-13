import { View, type ViewProps } from "react-native";
import { useTheme } from "@/lib/theme";

// Port of components/Card.tsx on the web — same token names
// (bg-surface, border-border), shadow approximated with RN's elevation/
// shadow props since CSS box-shadow has no RN equivalent. A dark shadow
// color is invisible against a dark background, so it flips to a lighter,
// lower-opacity shadow (and leans more on `elevation`) in dark mode.
export function Card({ className = "", style, ...props }: ViewProps & { className?: string }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  return (
    <View
      className={`w-full rounded-2xl bg-surface p-6 border border-border ${className}`}
      style={[
        {
          shadowColor: isDark ? "#000000" : "#1c1c1a",
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: isDark ? 0.25 : 0.06,
          shadowRadius: 16,
          elevation: isDark ? 4 : 2,
        },
        style,
      ]}
      {...props}
    />
  );
}
