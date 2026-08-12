-- Save app reference: the Savings > Insights tab shows a 6-month line
-- chart of the member's own contributions. One aggregate RPC, same
-- "controlled read function" pattern as get_lifetime_savings_summary.

create function public.get_savings_insights()
returns table (month_label text, total numeric)
language sql
security definer
set search_path = public
stable
as $$
  with months as (
    select date_trunc('month', now()) - (n || ' months')::interval as month_start
    from generate_series(0, 5) as n
  )
  select to_char(m.month_start, 'Mon') as month_label,
         coalesce(sum(c.amount), 0) as total
  from months m
  left join public.contributions c
    on c.member_id = auth.uid()
    and c.status = 'confirmed'
    and date_trunc('month', c.confirmed_at) = m.month_start
  group by m.month_start
  order by m.month_start;
$$;
