import { HTMLAttributes } from "react";

export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`w-full rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5 ${className}`}
      {...props}
    />
  );
}
