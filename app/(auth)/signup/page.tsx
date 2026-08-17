"use client";

import { useSearchParams } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";

export default function SignupPage() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect");

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <AuthForm intent="signup" redirectTo={redirectTo} />
    </main>
  );
}
