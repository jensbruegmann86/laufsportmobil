-- Initial schema for sponsored school runs SaaS
-- Includes RLS policies for admin, teacher, and public sponsor pledge flows.

begin;

create extension if not exists pgcrypto;

create type public.app_role as enum ('admin', 'teacher');
create type public.run_status as enum ('draft', 'active', 'completed');
create type public.pledge_type as enum ('per_lap', 'fixed_amount');
create type public.payment_method_choice as enum ('cash', 'stripe');
create type public.pledge_status as enum ('pending', 'notified', 'paid');

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null,
  school_id uuid not null references public.schools (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.runs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  title text not null,
  date date not null,
  status public.run_status not null default 'draft',
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.runs (id) on delete cascade,
  class_name text not null,
  first_name text not null,
  last_name text not null,
  token uuid not null unique default gen_random_uuid(),
  slug text not null unique,
  qr_code text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pledges (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  sponsor_name text not null,
  sponsor_email text,
  type public.pledge_type not null,
  amount_per_lap numeric(10, 2),
  fixed_amount numeric(10, 2),
  payment_method_choice public.payment_method_choice,
  status public.pledge_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pledges_amount_by_type_chk check (
    (
      type = 'per_lap'
      and amount_per_lap is not null
      and fixed_amount is null
      and amount_per_lap >= 0
    )
    or
    (
      type = 'fixed_amount'
      and fixed_amount is not null
      and amount_per_lap is null
      and fixed_amount >= 0
    )
  )
);

create table public.run_results (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null unique references public.students (id) on delete cascade,
  laps_completed integer not null check (laps_completed >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index runs_school_id_idx on public.runs (school_id);
create index runs_created_by_idx on public.runs (created_by);
create index students_run_id_idx on public.students (run_id);
create index students_token_idx on public.students (token);
create index pledges_student_id_idx on public.pledges (student_id);
create index pledges_status_idx on public.pledges (status);
create index run_results_student_id_idx on public.run_results (student_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at_profiles
before update on public.profiles
for each row
execute function public.set_updated_at();

create trigger set_updated_at_runs
before update on public.runs
for each row
execute function public.set_updated_at();

create trigger set_updated_at_students
before update on public.students
for each row
execute function public.set_updated_at();

create trigger set_updated_at_pledges
before update on public.pledges
for each row
execute function public.set_updated_at();

create trigger set_updated_at_run_results
before update on public.run_results
for each row
execute function public.set_updated_at();

create or replace function public.current_user_role()
returns public.app_role
language sql
stable
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
$$;

create or replace function public.current_user_school_id()
returns uuid
language sql
stable
as $$
  select p.school_id
  from public.profiles p
  where p.id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select public.current_user_role() = 'admin'::public.app_role
$$;

create or replace function public.is_teacher()
returns boolean
language sql
stable
as $$
  select public.current_user_role() = 'teacher'::public.app_role
$$;

create or replace function public.teacher_has_run_access(target_run_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.runs r
    where r.id = target_run_id
      and r.created_by = auth.uid()
  )
$$;

alter table public.schools enable row level security;
alter table public.profiles enable row level security;
alter table public.runs enable row level security;
alter table public.students enable row level security;
alter table public.pledges enable row level security;
alter table public.run_results enable row level security;

create policy schools_admin_select
on public.schools
for select
to authenticated
using (
  public.is_admin()
  and id = public.current_user_school_id()
);

create policy schools_admin_insert
on public.schools
for insert
to authenticated
with check (
  public.is_admin()
  and id = public.current_user_school_id()
);

create policy schools_admin_update
on public.schools
for update
to authenticated
using (
  public.is_admin()
  and id = public.current_user_school_id()
)
with check (
  public.is_admin()
  and id = public.current_user_school_id()
);

create policy schools_admin_delete
on public.schools
for delete
to authenticated
using (
  public.is_admin()
  and id = public.current_user_school_id()
);

create policy profiles_select_self_or_school_admin
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or (
    public.is_admin()
    and school_id = public.current_user_school_id()
  )
);

create policy profiles_insert_self_or_school_admin
on public.profiles
for insert
to authenticated
with check (
  id = auth.uid()
  or (
    public.is_admin()
    and school_id = public.current_user_school_id()
  )
);

create policy profiles_update_self_or_school_admin
on public.profiles
for update
to authenticated
using (
  id = auth.uid()
  or (
    public.is_admin()
    and school_id = public.current_user_school_id()
  )
)
with check (
  (
    id = auth.uid()
    and school_id = public.current_user_school_id()
  )
  or (
    public.is_admin()
    and school_id = public.current_user_school_id()
  )
);

create policy profiles_delete_school_admin
on public.profiles
for delete
to authenticated
using (
  public.is_admin()
  and school_id = public.current_user_school_id()
);

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
    and created_by = auth.uid()
  )
);

create policy runs_insert_school_admin_or_assigned_teacher
on public.runs
for insert
to authenticated
with check (
  (
    public.is_admin()
    and school_id = public.current_user_school_id()
  )
  or (
    public.is_teacher()
    and created_by = auth.uid()
    and school_id = public.current_user_school_id()
  )
);

create policy runs_update_school_admin_or_assigned_teacher
on public.runs
for update
to authenticated
using (
  (
    public.is_admin()
    and school_id = public.current_user_school_id()
  )
  or (
    public.is_teacher()
    and created_by = auth.uid()
  )
)
with check (
  (
    public.is_admin()
    and school_id = public.current_user_school_id()
  )
  or (
    public.is_teacher()
    and created_by = auth.uid()
    and school_id = public.current_user_school_id()
  )
);

create policy runs_delete_school_admin_or_assigned_teacher
on public.runs
for delete
to authenticated
using (
  (
    public.is_admin()
    and school_id = public.current_user_school_id()
  )
  or (
    public.is_teacher()
    and created_by = auth.uid()
  )
);

create policy students_select_school_admin_or_assigned_teacher
on public.students
for select
to authenticated
using (
  exists (
    select 1
    from public.runs r
    where r.id = students.run_id
      and (
        (
          public.is_admin()
          and r.school_id = public.current_user_school_id()
        )
        or (
          public.is_teacher()
          and public.teacher_has_run_access(r.id)
        )
      )
  )
);

create policy students_insert_school_admin_or_assigned_teacher
on public.students
for insert
to authenticated
with check (
  exists (
    select 1
    from public.runs r
    where r.id = students.run_id
      and (
        (
          public.is_admin()
          and r.school_id = public.current_user_school_id()
        )
        or (
          public.is_teacher()
          and public.teacher_has_run_access(r.id)
        )
      )
  )
);

create policy students_update_school_admin_or_assigned_teacher
on public.students
for update
to authenticated
using (
  exists (
    select 1
    from public.runs r
    where r.id = students.run_id
      and (
        (
          public.is_admin()
          and r.school_id = public.current_user_school_id()
        )
        or (
          public.is_teacher()
          and public.teacher_has_run_access(r.id)
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.runs r
    where r.id = students.run_id
      and (
        (
          public.is_admin()
          and r.school_id = public.current_user_school_id()
        )
        or (
          public.is_teacher()
          and public.teacher_has_run_access(r.id)
        )
      )
  )
);

create policy students_delete_school_admin_or_assigned_teacher
on public.students
for delete
to authenticated
using (
  exists (
    select 1
    from public.runs r
    where r.id = students.run_id
      and (
        (
          public.is_admin()
          and r.school_id = public.current_user_school_id()
        )
        or (
          public.is_teacher()
          and public.teacher_has_run_access(r.id)
        )
      )
  )
);

create policy pledges_select_school_admin_or_assigned_teacher
on public.pledges
for select
to authenticated
using (
  exists (
    select 1
    from public.students s
    join public.runs r on r.id = s.run_id
    where s.id = pledges.student_id
      and (
        (
          public.is_admin()
          and r.school_id = public.current_user_school_id()
        )
        or (
          public.is_teacher()
          and public.teacher_has_run_access(r.id)
        )
      )
  )
);

create policy pledges_insert_school_admin
on public.pledges
for insert
to authenticated
with check (
  exists (
    select 1
    from public.students s
    join public.runs r on r.id = s.run_id
    where s.id = pledges.student_id
      and public.is_admin()
      and r.school_id = public.current_user_school_id()
  )
);

create policy pledges_update_school_admin
on public.pledges
for update
to authenticated
using (
  exists (
    select 1
    from public.students s
    join public.runs r on r.id = s.run_id
    where s.id = pledges.student_id
      and public.is_admin()
      and r.school_id = public.current_user_school_id()
  )
)
with check (
  exists (
    select 1
    from public.students s
    join public.runs r on r.id = s.run_id
    where s.id = pledges.student_id
      and public.is_admin()
      and r.school_id = public.current_user_school_id()
  )
);

create policy pledges_delete_school_admin
on public.pledges
for delete
to authenticated
using (
  exists (
    select 1
    from public.students s
    join public.runs r on r.id = s.run_id
    where s.id = pledges.student_id
      and public.is_admin()
      and r.school_id = public.current_user_school_id()
  )
);

create policy run_results_select_school_admin_or_assigned_teacher
on public.run_results
for select
to authenticated
using (
  exists (
    select 1
    from public.students s
    join public.runs r on r.id = s.run_id
    where s.id = run_results.student_id
      and (
        (
          public.is_admin()
          and r.school_id = public.current_user_school_id()
        )
        or (
          public.is_teacher()
          and public.teacher_has_run_access(r.id)
        )
      )
  )
);

create policy run_results_insert_school_admin_or_assigned_teacher
on public.run_results
for insert
to authenticated
with check (
  exists (
    select 1
    from public.students s
    join public.runs r on r.id = s.run_id
    where s.id = run_results.student_id
      and (
        (
          public.is_admin()
          and r.school_id = public.current_user_school_id()
        )
        or (
          public.is_teacher()
          and public.teacher_has_run_access(r.id)
        )
      )
  )
);

create policy run_results_update_school_admin_or_assigned_teacher
on public.run_results
for update
to authenticated
using (
  exists (
    select 1
    from public.students s
    join public.runs r on r.id = s.run_id
    where s.id = run_results.student_id
      and (
        (
          public.is_admin()
          and r.school_id = public.current_user_school_id()
        )
        or (
          public.is_teacher()
          and public.teacher_has_run_access(r.id)
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.students s
    join public.runs r on r.id = s.run_id
    where s.id = run_results.student_id
      and (
        (
          public.is_admin()
          and r.school_id = public.current_user_school_id()
        )
        or (
          public.is_teacher()
          and public.teacher_has_run_access(r.id)
        )
      )
  )
);

create policy run_results_delete_school_admin_or_assigned_teacher
on public.run_results
for delete
to authenticated
using (
  exists (
    select 1
    from public.students s
    join public.runs r on r.id = s.run_id
    where s.id = run_results.student_id
      and (
        (
          public.is_admin()
          and r.school_id = public.current_user_school_id()
        )
        or (
          public.is_teacher()
          and public.teacher_has_run_access(r.id)
        )
      )
  )
);

create or replace function public.get_public_student_by_token(p_student_token uuid)
returns table (
  student_id uuid,
  first_name text,
  last_name text,
  class_name text,
  run_title text,
  run_date date
)
language sql
security definer
set search_path = public
as $$
  select
    s.id,
    s.first_name,
    s.last_name,
    s.class_name,
    r.title,
    r.date
  from public.students s
  join public.runs r on r.id = s.run_id
  where s.token = p_student_token
$$;

create or replace function public.create_pledge_by_token(
  p_student_token uuid,
  p_sponsor_name text,
  p_sponsor_email text,
  p_type public.pledge_type,
  p_amount_per_lap numeric(10, 2) default null,
  p_fixed_amount numeric(10, 2) default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid;
  v_pledge_id uuid;
begin
  select s.id
    into v_student_id
  from public.students s
  where s.token = p_student_token;

  if v_student_id is null then
    raise exception 'Invalid student token';
  end if;

  insert into public.pledges (
    student_id,
    sponsor_name,
    sponsor_email,
    type,
    amount_per_lap,
    fixed_amount,
    payment_method_choice,
    status
  )
  values (
    v_student_id,
    p_sponsor_name,
    p_sponsor_email,
    p_type,
    p_amount_per_lap,
    p_fixed_amount,
    null,
    'pending'
  )
  returning id into v_pledge_id;

  return v_pledge_id;
end;
$$;

revoke all on function public.get_public_student_by_token(uuid) from public;
revoke all on function public.create_pledge_by_token(uuid, text, text, public.pledge_type, numeric, numeric) from public;

grant execute on function public.get_public_student_by_token(uuid) to anon, authenticated;
grant execute on function public.create_pledge_by_token(uuid, text, text, public.pledge_type, numeric, numeric) to anon, authenticated;

commit;
