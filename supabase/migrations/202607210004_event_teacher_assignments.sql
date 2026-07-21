begin;

alter table public.runs
  add column if not exists teacher_id uuid references auth.users (id) on delete set null;

create index if not exists runs_teacher_id_idx on public.runs (teacher_id);

create table if not exists public.teacher_invites (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null unique references public.runs (id) on delete cascade,
  school_id uuid not null references public.schools (id) on delete cascade,
  email text not null,
  invited_by uuid not null references auth.users (id) on delete cascade,
  teacher_user_id uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists teacher_invites_school_id_idx on public.teacher_invites (school_id);
create index if not exists teacher_invites_email_idx on public.teacher_invites (lower(email));
create index if not exists teacher_invites_teacher_user_id_idx on public.teacher_invites (teacher_user_id);

create trigger set_updated_at_teacher_invites
before update on public.teacher_invites
for each row
execute function public.set_updated_at();

create or replace function public.teacher_has_run_access(target_run_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.runs r
    where r.id = target_run_id
      and r.teacher_id = auth.uid()
  )
$$;

drop policy if exists runs_select_school_admin_or_assigned_teacher on public.runs;
create policy runs_select_school_admin_or_assigned_teacher
on public.runs
for select
to authenticated
using (
  (
    public.is_admin()
    and school_id = public.current_user_school_id()
  )
  or (
    public.is_teacher()
    and teacher_id = auth.uid()
  )
);

drop policy if exists runs_insert_school_admin_or_assigned_teacher on public.runs;
create policy runs_insert_school_admin_only
on public.runs
for insert
to authenticated
with check (
  public.is_admin()
  and school_id = public.current_user_school_id()
);

drop policy if exists runs_update_school_admin_or_assigned_teacher on public.runs;
create policy runs_update_school_admin_only
on public.runs
for update
to authenticated
using (
  public.is_admin()
  and school_id = public.current_user_school_id()
)
with check (
  public.is_admin()
  and school_id = public.current_user_school_id()
);

drop policy if exists runs_delete_school_admin_or_assigned_teacher on public.runs;
create policy runs_delete_school_admin_only
on public.runs
for delete
to authenticated
using (
  public.is_admin()
  and school_id = public.current_user_school_id()
);

alter table public.teacher_invites enable row level security;

create policy teacher_invites_select_school_admin_or_assigned_teacher
on public.teacher_invites
for select
to authenticated
using (
  (
    public.is_admin()
    and school_id = public.current_user_school_id()
  )
  or (
    public.is_teacher()
    and teacher_user_id = auth.uid()
  )
);

create policy teacher_invites_insert_school_admin_only
on public.teacher_invites
for insert
to authenticated
with check (
  public.is_admin()
  and school_id = public.current_user_school_id()
);

create policy teacher_invites_update_school_admin_only
on public.teacher_invites
for update
to authenticated
using (
  public.is_admin()
  and school_id = public.current_user_school_id()
)
with check (
  public.is_admin()
  and school_id = public.current_user_school_id()
);

commit;
