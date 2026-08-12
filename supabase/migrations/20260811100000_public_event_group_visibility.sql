-- Event Contribution groups are meant to be shareable with anyone via
-- link/QR (Section 3.3: "functions like a fundraising thermometer"), not
-- gated behind membership like ibimina groups. The groups table only ever
-- had SELECT policies for "you're a member" and "browsing an open
-- matching group" - an anonymous scanner (or a logged-in user who isn't a
-- member) hitting an event group's row got blocked by RLS entirely, which
-- combined with the page-level "if (!user) redirect('/login')" check made
-- scanning an event QR code go nowhere useful. get_pledge_board() already
-- handles anonymous/non-member callers safely (auth.uid() is just null,
-- which correctly falls through every "is this mine / am I admin" check)
-- - the groups table itself was the missing piece.

create policy "browse public event groups" on public.groups
  for select using (group_type = 'event');
