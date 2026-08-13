import { Skeleton } from "@/components/Skeleton";

export default function PayLoading() {
  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16">
      <div className="flex w-full max-w-md flex-col gap-5">
        <Skeleton className="h-8 w-56" />
        <div className="w-full rounded-2xl bg-surface p-6 shadow-[var(--shadow-soft)] ring-1 ring-border">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="mt-2 h-4 w-full" />
          <Skeleton className="mt-1 h-4 w-4/5" />
          <div className="mt-3 flex gap-2">
            <Skeleton className="h-10 flex-1 rounded-lg" />
            <Skeleton className="h-10 w-16 rounded-full" />
          </div>
        </div>
        <div className="w-full rounded-2xl bg-surface p-6 shadow-[var(--shadow-soft)] ring-1 ring-border">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="mt-4 h-10 w-full" />
        </div>
      </div>
    </main>
  );
}
