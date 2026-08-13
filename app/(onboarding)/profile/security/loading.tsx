import { Skeleton } from "@/components/Skeleton";

export default function SecurityLoading() {
  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16">
      <div className="flex w-full max-w-md flex-col gap-5">
        <Skeleton className="h-8 w-28" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="w-full rounded-2xl bg-surface p-6 shadow-[var(--shadow-soft)] ring-1 ring-border">
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="mt-2 h-4 w-4/5" />
            <Skeleton className="mt-4 h-10 w-full rounded-full" />
          </div>
        ))}
      </div>
    </main>
  );
}
