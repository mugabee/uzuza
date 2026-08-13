import { Skeleton } from "@/components/Skeleton";

export default function NewGroupLoading() {
  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16">
      <div className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-[var(--shadow-soft)] ring-1 ring-border">
        <Skeleton className="h-6 w-1/2" />
        <div className="mt-6 flex flex-col gap-4">
          <Skeleton className="h-11 w-full rounded-lg" />
          <Skeleton className="h-11 w-full rounded-lg" />
          <Skeleton className="h-11 w-full rounded-lg" />
          <Skeleton className="h-11 w-full rounded-lg" />
          <Skeleton className="mt-2 h-11 w-full rounded-full" />
        </div>
      </div>
    </main>
  );
}
