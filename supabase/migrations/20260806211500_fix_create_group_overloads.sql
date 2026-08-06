-- CREATE OR REPLACE FUNCTION only replaces a function with the exact same
-- parameter list. Phase 5 and Phase 6 each added a new trailing parameter,
-- which created a NEW overload each time instead of replacing the old
-- one — three versions of create_group ended up coexisting (8, 9, and 10
-- params). PostgREST can't disambiguate a call that omits the newer
-- optional params, since it can't tell which overload's defaults you
-- want. Drop the two obsolete ones, keep only the complete signature.
drop function if exists public.create_group(
  text, public.group_type, numeric, text, int, public.account_type, public.rotation_method, text
);
drop function if exists public.create_group(
  text, public.group_type, numeric, text, int, public.account_type, public.rotation_method, text, boolean
);
