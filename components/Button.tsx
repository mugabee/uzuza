import { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary";

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-primary text-primary-foreground shadow-[0_1px_2px_rgba(26,95,74,0.15),0_4px_12px_-2px_rgba(26,95,74,0.25)] hover:bg-primary/90 hover:shadow-[0_2px_4px_rgba(26,95,74,0.18),0_8px_20px_-4px_rgba(26,95,74,0.3)] disabled:bg-primary/40 disabled:shadow-none",
  secondary:
    "bg-transparent border border-primary/25 text-primary hover:bg-primary/5 hover:border-primary/40 disabled:opacity-40 disabled:hover:bg-transparent",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold transition-all duration-150 ease-out active:scale-[0.97] disabled:cursor-not-allowed disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-paper ${variantClasses[variant]} ${className}`}
      {...props}
    />
  );
}
