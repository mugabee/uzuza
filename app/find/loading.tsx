import { Skeleton } from "@/components/Skeleton";

export default function FindLoading() {
  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16">
      <div className="flex w-full max-w-md flex-col gap-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-56" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="w-full rounded-2xl bg-surface p-6 shadow-[var(--shadow-soft)] ring-1 ring-border">
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-2/5" />
              <Skeleton className="h-4 w-14" />
            </div>
            <Skeleton className="mt-3 h-4 w-3/5" />
            <Skeleton className="mt-3 h-9 w-full rounded-full" />
          </div>
        ))}
      </div>
    </main>
  );
}
