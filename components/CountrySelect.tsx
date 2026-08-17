"use client";

import { COUNTRIES } from "../lib/country-data";

/**
 * A plain native <select> rather than a custom combobox — with 242
 * options, the browser's own type-to-jump behavior already gives users
 * fast search for free, and a native select is the most reliable,
 * accessible, and smallest option on a low-end mobile browser (matches
 * this app's low-data-mode priorities). Shared by the phone country-code
 * picker (CountryPhoneInput) and the plain country/currency picker
 * (Profile page) — same list, same behavior, one place to update.
 */
export function CountrySelect({
  value,
  onChange,
  label,
  showDialCode = false,
  className = "",
  id,
}: {
  value: string;
  onChange: (code: string) => void;
  label?: string;
  showDialCode?: boolean;
  className?: string;
  id?: string;
}) {
  const select = (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none transition-all duration-150 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 ${className}`}
    >
      {COUNTRIES.map((c) => (
        <option key={c.code} value={c.code}>
          {c.flag} {c.name}
          {showDialCode ? ` (${c.dialCode})` : ""}
        </option>
      ))}
    </select>
  );

  if (!label) return select;

  return (
    <label className="flex flex-col gap-1.5 text-sm" htmlFor={id}>
      <span className="font-medium text-foreground">{label}</span>
      {select}
    </label>
  );
}
