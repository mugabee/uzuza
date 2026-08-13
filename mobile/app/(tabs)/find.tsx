import { SafeAreaView, ScrollView, Text } from "react-native";
import { Card } from "../../components/Card";

export default function FindScreen() {
  return (
    <SafeAreaView className="flex-1 bg-paper">
      <ScrollView contentContainerClassName="px-6 py-8 gap-4" className="flex-1">
        <Text className="font-display text-2xl font-bold text-primary">Find a group</Text>
        <Card>
          <Text className="text-foreground/70">Group browsing lands in Mobile Phase 3.</Text>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
