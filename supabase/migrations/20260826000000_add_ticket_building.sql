alter table public.tickets
add column if not exists building text;

update public.tickets
set building = 'main'
where building is null;

alter table public.tickets
alter column building set default 'main',
alter column building set not null;

alter table public.tickets
drop constraint if exists tickets_building_check;

alter table public.tickets
add constraint tickets_building_check
check (building in ('main', 'prek'));

create index if not exists tickets_building_status_created_idx
on public.tickets (building, status, created_at desc);
