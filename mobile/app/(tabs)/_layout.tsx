import { Tabs } from "expo-router";
import { Text } from "react-native";
import { useTheme } from "../../lib/theme";

// Mirrors components/AppNav.tsx on the web app: Home / Find tabs, a raised
// circular Quick Actions button in the middle, Profile on the right.
// Wallet lives as its own tab there too — kept here for Mobile Phase 0's
// shell; screens are placeholders until their respective phases land.
function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  return (
    <Text className={focused ? "text-primary text-xs font-medium" : "text-foreground/50 text-xs font-medium"}>
      {label}
    </Text>
  );
}

export default function TabsLayout() {
  const { theme } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: theme === "dark" ? "#1e2126" : "#ffffff",
          borderTopColor: theme === "dark" ? "rgba(255,255,255,0.1)" : "rgba(28,28,26,0.08)",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Home", tabBarIcon: ({ focused }) => <TabIcon label="Home" focused={focused} /> }}
      />
      <Tabs.Screen
        name="wallet"
        options={{ title: "Wallet", tabBarIcon: ({ focused }) => <TabIcon label="Wallet" focused={focused} /> }}
      />
      <Tabs.Screen
        name="find"
        options={{ title: "Find", tabBarIcon: ({ focused }) => <TabIcon label="Find" focused={focused} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: "Profile", tabBarIcon: ({ focused }) => <TabIcon label="Profile" focused={focused} /> }}
      />
    </Tabs>
  );
}
