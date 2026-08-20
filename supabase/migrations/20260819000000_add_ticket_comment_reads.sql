create table if not exists public.ticket_comment_reads (
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (ticket_id, user_id)
);

alter table public.ticket_comment_reads enable row level security;

create policy "Users can view their own ticket comment reads"
on public.ticket_comment_reads
for select
to authenticated
using (user_id = (select auth.uid()));

create policy "Requesters can create their own ticket comment reads"
on public.ticket_comment_reads
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.tickets
    where tickets.id = ticket_comment_reads.ticket_id
      and tickets.requester_id = (select auth.uid())
  )
);

create policy "Requesters can update their own ticket comment reads"
on public.ticket_comment_reads
for update
to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.tickets
    where tickets.id = ticket_comment_reads.ticket_id
      and tickets.requester_id = (select auth.uid())
  )
)
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.tickets
    where tickets.id = ticket_comment_reads.ticket_id
      and tickets.requester_id = (select auth.uid())
  )
);

grant select, insert, update on public.ticket_comment_reads to authenticated;

create index if not exists ticket_comments_ticket_created_idx
on public.ticket_comments (ticket_id, created_at desc);

do $$
begin
  alter publication supabase_realtime add table public.ticket_comments;
exception
  when duplicate_object then null;
end;
$$;

create or replace function public.unread_ticket_comment_counts()
returns table (ticket_id uuid, unread_count integer)
language sql
stable
security invoker
set search_path = public
as $$
  select
    tickets.id as ticket_id,
    count(ticket_comments.id)::integer as unread_count
  from public.tickets
  join public.ticket_comments
    on ticket_comments.ticket_id = tickets.id
   and ticket_comments.author_id <> (select auth.uid())
  left join public.ticket_comment_reads
    on ticket_comment_reads.ticket_id = tickets.id
   and ticket_comment_reads.user_id = (select auth.uid())
  where tickets.requester_id = (select auth.uid())
    and ticket_comments.created_at > coalesce(
      ticket_comment_reads.last_read_at,
      '-infinity'::timestamptz
    )
  group by tickets.id;
$$;

revoke all on function public.unread_ticket_comment_counts() from public;
grant execute on function public.unread_ticket_comment_counts() to authenticated;
