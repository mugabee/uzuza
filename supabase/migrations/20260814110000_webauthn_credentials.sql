-- Passkey / biometric app-unlock (post-Phase-10 gap-fill).
-- Scoped deliberately as a LOCAL RE-AUTHENTICATION GATE on top of the
-- existing OTP-created session, not a replacement for OTP sign-in itself —
-- Supabase's admin API can only mint a full login session from an email
-- address (admin.generateLink), and a large share of Uzuza accounts are
-- phone-only with no email on file, so a passwordless-login replacement
-- would silently fail to work for most of the primary market segment.
-- This design works identically for phone and email accounts since it
-- never needs to mint a new session — it just gates access to an already-
-- authenticated one, the same way a banking app's Face ID re-lock works.
create table public.webauthn_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  credential_id text not null unique,
  public_key text not null,
  counter bigint not null default 0,
  transports text[] not null default '{}',
  device_label text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index webauthn_credentials_user_id_idx on public.webauthn_credentials(user_id);

alter table public.webauthn_credentials enable row level security;

create policy "Users can view their own passkeys"
  on public.webauthn_credentials for select
  using (user_id = auth.uid());

create policy "Users can insert their own passkeys"
  on public.webauthn_credentials for insert
  with check (user_id = auth.uid());

create policy "Users can update their own passkeys"
  on public.webauthn_credentials for update
  using (user_id = auth.uid());

create policy "Users can delete their own passkeys"
  on public.webauthn_credentials for delete
  using (user_id = auth.uid());
