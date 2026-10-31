-- MMHVAULT N10: disposable REAL signed-JWT RLS/RPC/Storage acceptance fixtures.
-- ISOLATED AUTH STAGING ldivswlhtgmznzwhzsoi ONLY. NEVER RUN ON PRODUCTION.
-- Does not change the existing 11 public tables, policies, Auth factors or finance data.
BEGIN;
DO $pre$
BEGIN
  IF to_regclass('public.mmh_n10_signed_qa_entries') IS NOT NULL
     OR to_regprocedure('public.mmh_n10_qa_privileged_read(uuid)') IS NOT NULL
     OR EXISTS (SELECT 1 FROM storage.buckets WHERE id='mmh-n10-qa-private')
  THEN
    RAISE EXCEPTION 'N10 staging QA objects already exist; refuse duplicate';
  END IF;
END
$pre$;
CREATE SCHEMA mmh_n10_qa_security;
REVOKE ALL ON SCHEMA mmh_n10_qa_security FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA mmh_n10_qa_security TO authenticated;

CREATE FUNCTION mmh_n10_qa_security.mfa_ok()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $fn$
 SELECT COALESCE(
   auth.uid() IS NOT NULL
   AND (
     auth.jwt()->>'aal'='aal2'
     OR NOT EXISTS (
       SELECT 1 FROM auth.mfa_factors f
       WHERE f.user_id=auth.uid() AND f.status::text='verified'
     )
   ), false
 )
$fn$;
REVOKE ALL ON FUNCTION mmh_n10_qa_security.mfa_ok() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION mmh_n10_qa_security.mfa_ok() TO authenticated;

CREATE TABLE public.mmh_n10_signed_qa_entries (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 marker text NOT NULL DEFAULT 'N10-ISOLATED-STAGING-ONLY'
    CHECK(marker='N10-ISOLATED-STAGING-ONLY')
);
ALTER TABLE public.mmh_n10_signed_qa_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.mmh_n10_signed_qa_entries FROM PUBLIC, anon;
GRANT SELECT ON public.mmh_n10_signed_qa_entries TO authenticated;
CREATE POLICY mmh_n10_qa_owner_select
 ON public.mmh_n10_signed_qa_entries AS PERMISSIVE FOR SELECT TO authenticated
 USING (user_id=(SELECT auth.uid()));
CREATE POLICY mmh_n10_qa_mfa_select
 ON public.mmh_n10_signed_qa_entries AS RESTRICTIVE FOR SELECT TO authenticated
 USING ((SELECT mmh_n10_qa_security.mfa_ok()));
-- All records are synthetic and contain only a generic marker plus existing Auth UID.
INSERT INTO public.mmh_n10_signed_qa_entries(user_id)
 SELECT id FROM auth.users;

-- SECURITY DEFINER bypasses RLS, so it MUST check BOTH UID and enrolled MFA.
CREATE FUNCTION public.mmh_n10_qa_privileged_read(p_expected_uid uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
  who uuid := auth.uid();
BEGIN
  IF who IS NULL OR who IS DISTINCT FROM p_expected_uid THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE='42501';
  END IF;
  IF NOT COALESCE(mmh_n10_qa_security.mfa_ok(),false) THEN
    RAISE EXCEPTION 'Second factor required' USING ERRCODE='42501';
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.mmh_n10_signed_qa_entries e WHERE e.user_id=who
  );
END
$fn$;
REVOKE ALL ON FUNCTION public.mmh_n10_qa_privileged_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mmh_n10_qa_privileged_read(uuid) TO authenticated;

-- Supabase Storage documentation allows bucket creation via SQL; file content
-- operations (upload/download/delete) MUST use Storage API, not storage.objects DML.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('mmh-n10-qa-private','mmh-n10-qa-private',false,65536,ARRAY['text/plain']);

-- AAL1 and AAL2 use the exact same existing ownership predicate.
CREATE POLICY mmh_n10_qa_storage_owner
 ON storage.objects AS PERMISSIVE FOR ALL TO authenticated
 USING (bucket_id='mmh-n10-qa-private'
   AND (storage.foldername(name))[1]=(SELECT auth.uid())::text)
 WITH CHECK (bucket_id='mmh-n10-qa-private'
   AND (storage.foldername(name))[1]=(SELECT auth.uid())::text);
CREATE POLICY mmh_n10_qa_storage_mfa
 ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
 USING (bucket_id <> 'mmh-n10-qa-private'
   OR (SELECT mmh_n10_qa_security.mfa_ok()))
 WITH CHECK (bucket_id <> 'mmh-n10-qa-private'
   OR (SELECT mmh_n10_qa_security.mfa_ok()));
COMMIT;
