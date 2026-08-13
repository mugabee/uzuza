-- Email notification channel (Resend). CLAUDE.md's original architecture
-- only names in-app + SMS as notification channels — this adds email as a
-- genuine third channel for users who have one on file, sent as a digest
-- by a daily cron (matching the once-a-day cap already documented for
-- Vercel Hobby cron jobs, same constraint sweep-out and payment-reminders
-- already work within) rather than per-event, since there's no
-- request-scoped Node context available from a plain SQL insert to fire
-- an HTTP call synchronously.
alter table public.notifications add column emailed_at timestamptz;

create index notifications_pending_email_idx
  on public.notifications (created_at)
  where emailed_at is null;

alter table public.profiles add column email_notifications_enabled boolean not null default true;

create function public.set_email_notifications_enabled(p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles set email_notifications_enabled = p_enabled where id = auth.uid();
end;
$$;
