"use client";

import { useEffect, useRef, useState } from "react";
import { AsYouType, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { CountrySelect } from "@/components/CountrySelect";
import { findCountry, getDefaultCountry, suggestCountry } from "../lib/country-suggestion";

/**
 * Full E.164 phone input: a country picker (IP-suggested on first
 * mount when there's no existing value to parse, always manually
 * overridable) paired with a national-number field. Emits the combined
 * E.164 string via onChange as the user types — validation itself
 * stays the caller's job (via internationalPhoneSchema), this
 * component only assembles the value, per "accept free text, validate
 * after" rather than blocking input.
 */
export function CountryPhoneInput({
  value,
  onChange,
  onCountryChange,
  error,
  label = "Phone number",
  id = "phone",
}: {
  value: string;
  onChange: (e164: string) => void;
  onCountryChange?: (countryCode: string) => void;
  error?: string;
  label?: string;
  id?: string;
}) {
  const initial = value ? parsePhoneNumberFromString(value) : undefined;
  const [countryCode, setCountryCode] = useState(initial?.country ?? getDefaultCountry().code);
  const [national, setNational] = useState(initial?.nationalNumber ?? "");
  const initialized = useRef(!!value);

  // Suggest a country from IP location once, only when we didn't already
  // have a value to parse (e.g. editing an existing phone number in
  // Profile starts from that number's real country, not a guess).
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    suggestCountry().then((c) => setCountryCode(c.code));
  }, []);

  useEffect(() => {
    onCountryChange?.(countryCode);
    const country = findCountry(countryCode) ?? getDefaultCountry();
    if (!national.trim()) {
      onChange("");
      return;
    }
    const formatter = new AsYouType(country.code as CountryCode);
    formatter.input(national);
    const parsed = formatter.getNumber();
    onChange(parsed?.number ?? `${country.dialCode}${national.replace(/\D/g, "")}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countryCode, national]);

  const dialCode = findCountry(countryCode)?.dialCode ?? "";

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      <div className="flex gap-2">
        <CountrySelect
          value={countryCode}
          onChange={setCountryCode}
          showDialCode
          className="max-w-[9.5rem] shrink-0"
          id={`${id}-country`}
        />
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground/50">
            {dialCode}
          </span>
          <input
            id={id}
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            value={national}
            onChange={(e) => setNational(e.target.value)}
            placeholder="788 123 456"
            style={{ paddingLeft: `${dialCode.length * 0.6 + 1.5}rem` }}
            className={`w-full rounded-lg border bg-surface py-2.5 pr-4 outline-none transition-all duration-150 focus:ring-4 ${
              error
                ? "border-danger focus:ring-danger/10"
                : "border-border focus:border-primary/50 focus:ring-primary/10"
            }`}
          />
        </div>
      </div>
      {error && (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      )}
    </div>
  );
}
