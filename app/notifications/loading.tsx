import { Skeleton } from "@/components/Skeleton";

export default function NotificationsLoading() {
  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16">
      <div className="flex w-full max-w-md flex-col gap-5">
        <Skeleton className="h-8 w-40" />
        <div className="flex gap-1 rounded-full bg-surface-secondary p-1">
          <Skeleton className="h-9 flex-1 bg-surface" />
          <Skeleton className="h-9 flex-1 bg-transparent" />
        </div>
        <div className="w-full rounded-2xl bg-surface p-2 shadow-[var(--shadow-soft)] ring-1 ring-border">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-start gap-3 px-3 py-3.5">
              <Skeleton className="mt-1.5 h-2 w-2 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1">
                <Skeleton className="h-4 w-2/5" />
                <Skeleton className="mt-2 h-3 w-4/5" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
