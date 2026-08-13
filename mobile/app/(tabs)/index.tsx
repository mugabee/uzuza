import { SafeAreaView, ScrollView, Text, View } from "react-native";
import { Card } from "../../components/Card";
import { useAuth } from "../../lib/auth";

export default function HomeScreen() {
  const { session, loading } = useAuth();

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <ScrollView contentContainerClassName="px-6 py-8 gap-4" className="flex-1">
        <Text className="font-display text-2xl font-bold text-primary">Uzuza</Text>
        <Card>
          <Text className="font-display text-lg font-semibold text-primary">Home</Text>
          <Text className="mt-2 text-foreground/70">
            Mobile Phase 0 scaffold — group list, savings journey, and trust score land in Mobile
            Phase 3.
          </Text>
          <View className="mt-4 rounded-lg bg-surface-secondary p-3">
            <Text className="text-xs text-foreground/50">Auth status (Mobile Phase 1 wires the real flow)</Text>
            <Text className="mt-1 text-sm font-medium text-foreground">
              {loading ? "Checking session..." : session ? `Signed in as ${session.user.id}` : "Not signed in"}
            </Text>
          </View>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
