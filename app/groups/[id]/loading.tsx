import { Skeleton } from "@/components/Skeleton";

export default function GroupLoading() {
  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16">
      <div className="flex w-full max-w-md flex-col gap-5">
        <div className="w-full rounded-2xl bg-surface p-6 shadow-[var(--shadow-soft)] ring-1 ring-border">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-2 h-6 w-2/3" />
          <Skeleton className="mt-2 h-4 w-1/2" />
        </div>

        <div className="flex gap-1 rounded-full bg-surface-secondary p-1">
          <Skeleton className="h-9 flex-1 bg-surface" />
          <Skeleton className="h-9 flex-1 bg-transparent" />
          <Skeleton className="h-9 flex-1 bg-transparent" />
        </div>

        <div className="w-full rounded-2xl bg-surface p-6 shadow-[var(--shadow-soft)] ring-1 ring-border">
          <Skeleton className="h-5 w-1/3" />
          <div className="mt-3 flex flex-col gap-1.5">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/5" />
          </div>
          <Skeleton className="mt-4 h-10 w-full rounded-full" />
        </div>
      </div>
    </main>
  );
}
