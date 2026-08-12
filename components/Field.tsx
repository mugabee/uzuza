import { InputHTMLAttributes } from "react";

export function Field({
  label,
  error,
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      <input
        className={`rounded-lg border bg-surface px-4 py-2.5 outline-none transition-all duration-150 focus:ring-4 ${
          error
            ? "border-red-400 focus:ring-red-400/10"
            : "border-border focus:border-primary/50 focus:ring-primary/10"
        } ${className}`}
        {...props}
      />
      {error && (
        <span role="alert" className="text-xs text-red-500">
          {error}
        </span>
      )}
    </label>
  );
}
