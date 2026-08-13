import { Skeleton } from "@/components/Skeleton";

export default function ProfileLoading() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm rounded-2xl bg-surface p-6 shadow-[var(--shadow-soft)] ring-1 ring-border">
        <Skeleton className="h-6 w-2/3" />
        <div className="mt-4 flex items-center gap-4">
          <Skeleton className="h-14 w-14 shrink-0 rounded-full" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="mt-6 flex flex-col gap-4">
          <Skeleton className="h-11 w-full rounded-lg" />
          <Skeleton className="h-11 w-full rounded-lg" />
          <Skeleton className="h-11 w-full rounded-full" />
        </div>
      </div>
    </main>
  );
}
