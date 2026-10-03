-- ============================================================================
-- on god. — 0006_storage_media_types.sql
--
-- The 3D specimen is part of the archive's media, and Supabase Storage is the
-- media system, so the GLB belongs in the same bucket as the plates rather
-- than being left behind as a static file. That means the bucket's MIME
-- allowlist has to admit model types.
-- ============================================================================

update storage.buckets
   set allowed_mime_types = array[
         'image/jpeg',
         'image/png',
         'image/webp',
         'image/avif',
         'image/gif',
         'image/svg+xml',
         'model/gltf-binary',
         'model/gltf+json',
         'application/octet-stream'
       ]
 where id = 'ongod-media';