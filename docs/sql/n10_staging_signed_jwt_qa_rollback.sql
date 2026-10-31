-- N10 STAGING ONLY (not for production); perform only after removing
-- all QA files through the authenticated Storage API; never DELETE storage.objects.
BEGIN;
DROP POLICY IF EXISTS mmh_n10_qa_storage_mfa ON storage.objects;
DROP POLICY IF EXISTS mmh_n10_qa_storage_owner ON storage.objects;
DROP FUNCTION IF EXISTS public.mmh_n10_qa_privileged_read(uuid);
DROP TABLE IF EXISTS public.mmh_n10_signed_qa_entries;
DROP FUNCTION IF EXISTS mmh_n10_qa_security.mfa_ok();
DROP SCHEMA IF EXISTS mmh_n10_qa_security;
-- Bucket is retained here; delete it via Storage API only after confirming
-- its contents are empty. Do NOT delete storage.objects metadata via SQL.
COMMIT;
