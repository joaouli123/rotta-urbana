-- ============================================================================
-- Rotta Urbana — 0010: Storage buckets/policies + Realtime publication
-- ----------------------------------------------------------------------------
-- Buckets:
--   avatars     (public)  — profile pictures, path: {user_id}/file
--   driver-docs (private) — CNH/RG/vehicle/selfie, path: {user_id}/file
-- Object access is scoped to the owning user's folder; admins read docs.
-- ============================================================================
set search_path = public, extensions;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true),
       ('driver-docs', 'driver-docs', false)
on conflict (id) do nothing;

-- ─── avatars (public read, owner writes own folder) ────────────────────────
drop policy if exists "avatars_read"       on storage.objects;
drop policy if exists "avatars_write_own"  on storage.objects;
drop policy if exists "avatars_update_own" on storage.objects;
drop policy if exists "avatars_delete_own" on storage.objects;

create policy "avatars_read" on storage.objects for select to public
  using (bucket_id = 'avatars');
create policy "avatars_write_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars_update_own" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ─── driver-docs (private: owner + admin) ──────────────────────────────────
drop policy if exists "docs_read_own"   on storage.objects;
drop policy if exists "docs_write_own"  on storage.objects;
drop policy if exists "docs_update_own" on storage.objects;
drop policy if exists "docs_delete_own" on storage.objects;

create policy "docs_read_own" on storage.objects for select to authenticated
  using (bucket_id = 'driver-docs'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
create policy "docs_write_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'driver-docs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "docs_update_own" on storage.objects for update to authenticated
  using (bucket_id = 'driver-docs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "docs_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'driver-docs'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ─── Realtime: let clients subscribe to ride + driver changes ──────────────
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rides') then
    alter publication supabase_realtime add table public.rides;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'drivers') then
    alter publication supabase_realtime add table public.drivers;
  end if;
end $$;
