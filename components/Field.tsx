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
        className={`rounded-lg border px-4 py-2.5 outline-none transition-colors focus:border-primary ${
          error ? "border-red-400" : "border-black/10"
        } ${className}`}
        {...props}
      />
      {error && <span className="text-xs text-red-500">{error}</span>}
    </label>
  );
}
