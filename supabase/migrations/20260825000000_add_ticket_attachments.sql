insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'ticket-attachments',
  'ticket-attachments',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.ticket_attachments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  uploader_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null check (
    mime_type in ('image/jpeg', 'image/png', 'image/webp')
  ),
  file_size integer not null check (file_size > 0 and file_size <= 5242880),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  created_at timestamptz not null default now()
);

create index if not exists ticket_attachments_ticket_created_idx
on public.ticket_attachments (ticket_id, created_at);

alter table public.ticket_attachments enable row level security;

create or replace function public.current_ticketing_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where id = (select auth.uid());
$$;

revoke all on function public.current_ticketing_role() from public;
grant execute on function public.current_ticketing_role() to authenticated;

create or replace function public.enforce_ticket_attachment_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    select count(*)
    from public.ticket_attachments
    where ticket_id = new.ticket_id
  ) >= 5 then
    raise exception 'A ticket can have no more than 5 attachments';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_ticket_attachment_limit() from public;

drop trigger if exists enforce_ticket_attachment_limit
on public.ticket_attachments;

create trigger enforce_ticket_attachment_limit
before insert on public.ticket_attachments
for each row execute function public.enforce_ticket_attachment_limit();

create policy "Ticket participants can view attachments"
on public.ticket_attachments
for select
to authenticated
using (
  exists (
    select 1
    from public.tickets
    where tickets.id = ticket_attachments.ticket_id
      and (
        tickets.requester_id = (select auth.uid())
        or (select public.current_ticketing_role()) in ('tech', 'admin')
      )
  )
);

create policy "Requesters and techs can add attachments"
on public.ticket_attachments
for insert
to authenticated
with check (
  uploader_id = (select auth.uid())
  and exists (
    select 1
    from public.tickets
    where tickets.id = ticket_attachments.ticket_id
      and tickets.status <> 'resolved'
      and (
        tickets.requester_id = (select auth.uid())
        or (select public.current_ticketing_role()) = 'tech'
      )
  )
);

create policy "Uploaders and techs can delete attachments"
on public.ticket_attachments
for delete
to authenticated
using (
  uploader_id = (select auth.uid())
  or (select public.current_ticketing_role()) = 'tech'
);

grant select, insert, delete on public.ticket_attachments to authenticated;

create policy "Ticket participants can view attachment files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'ticket-attachments'
  and exists (
    select 1
    from public.tickets
    where tickets.id::text = (storage.foldername(name))[1]
      and (
        tickets.requester_id = (select auth.uid())
        or (select public.current_ticketing_role()) in ('tech', 'admin')
      )
  )
);

create policy "Requesters and techs can upload attachment files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'ticket-attachments'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and exists (
    select 1
    from public.tickets
    where tickets.id::text = (storage.foldername(name))[1]
      and tickets.status <> 'resolved'
      and (
        tickets.requester_id = (select auth.uid())
        or (select public.current_ticketing_role()) = 'tech'
      )
  )
);

create policy "Uploaders and techs can delete attachment files"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'ticket-attachments'
  and (
    (storage.foldername(name))[2] = (select auth.uid())::text
    or (select public.current_ticketing_role()) = 'tech'
  )
);
