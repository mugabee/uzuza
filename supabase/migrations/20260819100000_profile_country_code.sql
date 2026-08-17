-- Backs the new Profile "Country & Currency" section. Deliberately just
-- a country code (ISO 3166-1 alpha-2), not a separate stored currency
-- column: currency is always derived from country_code (via the shared
-- lib/country-data.ts table used everywhere else in the app), so there
-- is no possibility of the two drifting out of sync and showing a
-- currency that doesn't match the selected country. Nullable — existing
-- users have no value until they set one; UI code must treat null as
-- "use the app's default market" (Rwanda/RWF), not as an error.
alter table public.profiles
  add column country_code text;
