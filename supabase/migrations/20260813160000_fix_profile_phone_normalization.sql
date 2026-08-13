-- Real bug found while verifying the new P2P phone lookup: auth.users.phone
-- is stored E.164-without-a-leading-plus by Supabase's own phone-auth
-- convention (e.g. "250788123456"), and handle_new_user() copied that raw
-- value straight into profiles.phone. Everywhere else in the app —
-- phoneSchema validation, ProfileForm, the chat sender fallback, and now
-- find_user_by_contact — works with the "+"-prefixed format. One code path
-- already had to work around this explicitly (see the comment in
-- app/api/momo/collections/request/route.ts: "the on_auth_user_created
-- trigger already inserted a profiles row using the raw (no '+') phone
-- format - normalize it..."), but the trigger itself — the actual root
-- cause, hit by every regular phone-OTP signup, not just that one flow —
-- was never fixed. Fixed at the source, plus a one-time backfill for any
-- profile already stored without the prefix.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone, invite_code)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    case when new.phone is not null and new.phone <> '' and new.phone not like '+%'
      then '+' || new.phone
      else new.phone
    end,
    public.generate_invite_code()
  );
  return new;
end;
$$;

update public.profiles
set phone = '+' || phone
where phone is not null and phone <> '' and phone not like '+%';
