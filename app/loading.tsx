import { Skeleton } from "@/components/Skeleton";

export default function HomeLoading() {
  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16">
      <div className="flex w-full max-w-md flex-col gap-5">
        <div className="rounded-3xl bg-surface-secondary p-6">
          <Skeleton className="h-3 w-32 bg-foreground/10" />
          <Skeleton className="mt-3 h-9 w-40 bg-foreground/10" />
          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/10 pt-4">
            <Skeleton className="h-8 bg-foreground/10" />
            <Skeleton className="h-8 bg-foreground/10" />
            <Skeleton className="h-8 bg-foreground/10" />
          </div>
        </div>

        <div className="w-full rounded-2xl bg-surface p-6 shadow-[var(--shadow-soft)] ring-1 ring-border">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col items-center gap-2">
              <Skeleton className="h-20 w-32 rounded-full" />
              <Skeleton className="h-6 w-14" />
            </div>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-16" />
            </div>
          </div>
        </div>

        {[0, 1].map((i) => (
          <div key={i} className="w-full rounded-2xl bg-surface p-6 shadow-[var(--shadow-soft)] ring-1 ring-border">
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="mt-3 h-4 w-1/2" />
          </div>
        ))}
      </div>
    </main>
  );
}
