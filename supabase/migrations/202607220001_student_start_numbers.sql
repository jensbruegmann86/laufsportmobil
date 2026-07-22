begin;

alter table public.students
  add column if not exists start_number integer check (start_number is null or start_number > 0);

create unique index if not exists students_run_id_start_number_unique_idx
  on public.students (run_id, start_number)
  where start_number is not null;

create index if not exists students_run_id_class_name_last_name_idx
  on public.students (run_id, class_name, last_name, first_name);

commit;