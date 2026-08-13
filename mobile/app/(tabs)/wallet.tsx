import { SafeAreaView, ScrollView, Text } from "react-native";
import { Card } from "../../components/Card";

export default function WalletScreen() {
  return (
    <SafeAreaView className="flex-1 bg-paper">
      <ScrollView contentContainerClassName="px-6 py-8 gap-4" className="flex-1">
        <Text className="font-display text-2xl font-bold text-primary">Wallet</Text>
        <Card>
          <Text className="text-foreground/70">
            Personal wallet (balance, top-up, withdraw) lands in Mobile Phase 9.
          </Text>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
