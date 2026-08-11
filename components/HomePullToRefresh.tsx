"use client";

import { useRouter } from "next/navigation";
import { PullToRefresh } from "@/components/PullToRefresh";
import type { ReactNode } from "react";

export function HomePullToRefresh({ children }: { children: ReactNode }) {
  const router = useRouter();
  return <PullToRefresh onRefresh={() => router.refresh()}>{children}</PullToRefresh>;
}
