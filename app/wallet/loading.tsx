import { Skeleton } from "@/components/Skeleton";

export default function WalletLoading() {
  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16">
      <div className="flex w-full max-w-md flex-col gap-5">
        <Skeleton className="h-8 w-24" />

        <div className="flex gap-1 rounded-full bg-surface-secondary p-1">
          <Skeleton className="h-9 flex-1 bg-surface" />
          <Skeleton className="h-9 flex-1 bg-transparent" />
        </div>

        <div className="rounded-3xl bg-surface-secondary p-6">
          <Skeleton className="h-3 w-28 bg-foreground/10" />
          <Skeleton className="mt-3 h-9 w-36 bg-foreground/10" />
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Skeleton className="h-10 rounded-full bg-foreground/10" />
            <Skeleton className="h-10 rounded-full bg-foreground/10" />
          </div>
        </div>

        <div className="w-full rounded-2xl bg-surface p-6 shadow-[var(--shadow-soft)] ring-1 ring-border">
          <Skeleton className="h-5 w-1/3" />
          <div className="mt-3 flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-14" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
