import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";
import { WalletView } from "@/components/WalletView";

export default async function WalletPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: transactions } = await supabase.rpc("get_wallet_transactions");
  const { data: balance } = await supabase.rpc("get_wallet_balance");
  const { data: hasConsent } = await supabase.rpc("has_wallet_consent");
  const { data: profile } = await supabase.from("profiles").select("phone").eq("id", user.id).single();

  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16">
      <div className="flex w-full max-w-md flex-col gap-5">
        <h1 className="font-display text-2xl font-semibold text-primary">
          Wallet
        </h1>
        <WalletView
          transactions={transactions ?? []}
          balance={Number(balance ?? 0)}
          hasWalletConsent={!!hasConsent}
          myPhone={profile?.phone ?? ""}
        />
        <Link href="/" className="text-center text-sm text-foreground/50 hover:text-primary">
          Back to home
        </Link>
      </div>
    </main>
  );
}
