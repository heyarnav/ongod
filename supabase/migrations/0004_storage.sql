-- ============================================================================
-- on god. — 0004_storage.sql
--
-- One bucket: `ongod-media`, PUBLIC. It holds product and collection imagery.
--
-- There is deliberately no private bucket in this system. The complaint /
-- evidence feature was removed, so there is nothing customer-uploaded to keep
-- private.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ongod-media',
  'ongod-media',
  true,
  10485760, -- 10 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'image/svg+xml']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- storage.objects policies
--
-- The bucket is public, so reads need no policy at all — public URLs are
-- served without going through RLS. Writes are admin-only.
-- ---------------------------------------------------------------------------

drop policy if exists "ongod-media admin upload" on storage.objects;
create policy "ongod-media admin upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'ongod-media'
    and public.is_admin()
  );

drop policy if exists "ongod-media admin update" on storage.objects;
create policy "ongod-media admin update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'ongod-media'
    and public.is_admin()
  )
  with check (
    bucket_id = 'ongod-media'
    and public.is_admin()
  );

drop policy if exists "ongod-media admin delete" on storage.objects;
create policy "ongod-media admin delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'ongod-media'
    and public.is_admin()
  );