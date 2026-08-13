export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-surface-secondary ${className}`} />;
}

export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`w-full rounded-2xl bg-surface p-6 shadow-[var(--shadow-soft)] ring-1 ring-border ${className}`}>
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="mt-3 h-4 w-full" />
      <Skeleton className="mt-2 h-4 w-4/5" />
    </div>
  );
}
