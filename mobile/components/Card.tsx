import { View, type ViewProps } from "react-native";

// Port of components/Card.tsx on the web — same token names
// (bg-surface, border-border), shadow approximated with RN's elevation/
// shadow props since CSS box-shadow has no RN equivalent.
export function Card({ className = "", style, ...props }: ViewProps & { className?: string }) {
  return (
    <View
      className={`w-full rounded-2xl bg-surface p-6 border border-border ${className}`}
      style={[
        {
          shadowColor: "#1c1c1a",
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.06,
          shadowRadius: 16,
          elevation: 2,
        },
        style,
      ]}
      {...props}
    />
  );
}
