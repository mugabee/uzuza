// Curated to the countries Rwandan diaspora most commonly send from,
// rather than every ISO currency — keeps the picker short and scannable.
export const SUPPORTED_CURRENCIES = [
  { code: "USD", label: "US Dollar", flag: "🇺🇸" },
  { code: "EUR", label: "Euro", flag: "🇪🇺" },
  { code: "GBP", label: "British Pound", flag: "🇬🇧" },
  { code: "CAD", label: "Canadian Dollar", flag: "🇨🇦" },
  { code: "KES", label: "Kenyan Shilling", flag: "🇰🇪" },
  { code: "UGX", label: "Ugandan Shilling", flag: "🇺🇬" },
  { code: "TZS", label: "Tanzanian Shilling", flag: "🇹🇿" },
  { code: "ZAR", label: "South African Rand", flag: "🇿🇦" },
  { code: "AED", label: "UAE Dirham", flag: "🇦🇪" },
] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number]["code"];

export function currencyLabel(code: string) {
  const found = SUPPORTED_CURRENCIES.find((c) => c.code === code);
  return found ? `${found.flag} ${found.code}` : code;
}
