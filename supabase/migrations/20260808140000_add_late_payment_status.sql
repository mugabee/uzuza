-- Section 3.7's "pay + fine to stay" option: a member marked missed
-- should be able to pay late and stay in good standing, not just be stuck
-- with a permanent black mark. Own migration — adding an enum value can't
-- be used in the same transaction it was added in.

alter type public.contribution_status add value 'late_submitted';
alter type public.contribution_status add value 'paid_late';
