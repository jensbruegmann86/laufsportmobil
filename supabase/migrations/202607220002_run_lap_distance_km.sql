begin;

alter table public.runs
  add column if not exists lap_distance_km numeric(6,3) check (lap_distance_km is null or lap_distance_km > 0);

commit;