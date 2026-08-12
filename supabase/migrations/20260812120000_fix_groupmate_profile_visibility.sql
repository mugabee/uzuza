-- Real bug found via live verification: public.profiles has only ever had a
-- "select own profile" RLS policy (Phase 1). Every place in the app that
-- shows another member's name — chat sender, group ledger, member lists,
-- admin confirm/late-payment rows, forming-group and reservation views,
-- group settings — silently got back no row at all for anyone but the
-- caller, and fell back to a bare "Member" for every single one of them,
-- regardless of whether that member had actually set a name. Not a missing
-- name problem; a visibility problem.
--
-- Groupmates already see each other's contribution/payout status, amounts,
-- and phone numbers implicitly (payment matching is phone-based, per
-- CLAUDE.md, and the WhatsApp group link is shared once active) — a shared
-- ibimina/event group is already a "everyone already knows everyone"
-- context, so letting groupmates see each other's name/phone/avatar is
-- consistent with the live-shared-ledger transparency model, not a new
-- exposure. This does not open profiles to the whole platform — only to
-- people who share at least one group.
create policy "select groupmates' profile" on public.profiles
  for select using (
    exists (
      select 1 from public.group_members gm1
      join public.group_members gm2 on gm1.group_id = gm2.group_id
      where gm1.user_id = auth.uid() and gm2.user_id = profiles.id
    )
  );
