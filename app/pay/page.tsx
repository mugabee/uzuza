import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";
import { PayView } from "@/components/PayView";

export default async function PayPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: requests } = await supabase.rpc("list_my_p2p_requests");
  const { data: walletBalance } = await supabase.rpc("get_wallet_balance");

  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16">
      <div className="flex w-full max-w-md flex-col gap-5">
        <h1 className="font-display text-2xl font-semibold text-primary">
          Send or request money
        </h1>
        <PayView initialRequests={requests ?? []} walletBalance={Number(walletBalance ?? 0)} />
        <Link href="/wallet" className="text-center text-sm text-foreground/50 hover:text-primary">
          Back to wallet
        </Link>
      </div>
    </main>
  );
}
