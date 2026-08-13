import { SafeAreaView, ScrollView, Text, Pressable } from "react-native";
import { Card } from "../../components/Card";
import { useTheme } from "../../lib/theme";

export default function ProfileScreen() {
  const { theme, setTheme, highContrast, setHighContrast } = useTheme();

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <ScrollView contentContainerClassName="px-6 py-8 gap-4" className="flex-1">
        <Text className="font-display text-2xl font-bold text-primary">Profile</Text>
        <Card>
          <Text className="font-display text-lg font-semibold text-primary">Display</Text>
          <Text className="mt-1 text-sm text-foreground/60">
            Full profile/settings screens land in Mobile Phase 2 — this just proves the theme
            system works end to end.
          </Text>
          <Pressable
            onPress={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="mt-4 self-start rounded-full bg-primary px-5 py-2.5"
          >
            <Text className="font-semibold text-primary-foreground">
              Switch to {theme === "dark" ? "light" : "dark"} mode
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setHighContrast(!highContrast)}
            className="mt-3 self-start rounded-full border border-primary/30 px-5 py-2.5"
          >
            <Text className="font-semibold text-primary">
              {highContrast ? "Disable" : "Enable"} high contrast
            </Text>
          </Pressable>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
