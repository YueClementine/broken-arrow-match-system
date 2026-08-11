do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'room_change_versions'
  ) then
    alter publication supabase_realtime add table public.room_change_versions;
  end if;
end;
$$;

comment on table public.room_change_versions is
  'The only browser-visible Realtime table. It contains room IDs and revision counters, never player identity data.';
