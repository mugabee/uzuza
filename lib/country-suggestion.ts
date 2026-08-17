"use client";

import { COUNTRIES, type CountryInfo } from "./country-data";

const DEFAULT_COUNTRY_CODE = "RW"; // Uzuza's primary market — sane fallback when IP suggestion is unavailable.

export function findCountry(code: string | null | undefined): CountryInfo | undefined {
  if (!code) return undefined;
  return COUNTRIES.find((c) => c.code === code.toUpperCase());
}

export function getDefaultCountry(): CountryInfo {
  return findCountry(DEFAULT_COUNTRY_CODE) ?? COUNTRIES[0];
}

/**
 * Best-effort IP-based country suggestion for pre-selecting a country
 * picker — never authoritative, always overridable. Returns the default
 * country (Rwanda) if the suggestion is unavailable (local dev, a host
 * that doesn't populate the geo header, or the request simply fails) so
 * callers always get a sane starting point without needing their own
 * fallback logic.
 */
export async function suggestCountry(): Promise<CountryInfo> {
  try {
    const res = await fetch("/api/geo");
    if (!res.ok) return getDefaultCountry();
    const data = await res.json();
    return findCountry(data.country) ?? getDefaultCountry();
  } catch {
    return getDefaultCountry();
  }
}
