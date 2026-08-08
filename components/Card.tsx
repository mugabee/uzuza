import { HTMLAttributes } from "react";

export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`w-full rounded-2xl bg-white p-6 shadow-[var(--shadow-soft)] ring-1 ring-black/[0.06] transition-shadow duration-200 ${className}`}
      {...props}
    />
  );
}
