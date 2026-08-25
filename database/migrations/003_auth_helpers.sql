-- Security-definer identity lookup keeps password sign-in compatible with tenant RLS:
-- the caller must supply the organization slug, while tenant scope is still established
-- from the returned database row before any application query runs.
CREATE OR REPLACE FUNCTION smart_corp_find_login_user(p_email text, p_tenant_slug text)
RETURNS TABLE(user_id uuid, tenant_id uuid, email text, password_hash text, status text, locked_until timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, u.tenant_id, u.email, u.password_hash, u.status, u.locked_until
  FROM users u
  JOIN organizations o ON o.id = u.tenant_id
  WHERE lower(u.email) = lower(p_email)
    AND o.slug = p_tenant_slug
  LIMIT 1
$$;

-- The function returns only the password verifier and account state needed by the API.
-- The API role must be granted EXECUTE explicitly in each deployment; revoke the
-- default PUBLIC grant in the role bootstrap script.
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations (slug);

CREATE OR REPLACE FUNCTION smart_corp_record_login_failure(p_user_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE users
  SET failed_login_count = failed_login_count + 1,
      locked_until = CASE WHEN failed_login_count + 1 >= 8 THEN now() + interval '15 minutes' ELSE locked_until END,
      updated_at = now()
  WHERE id = p_user_id AND status = 'active'
$$;

CREATE OR REPLACE FUNCTION smart_corp_record_login_success(p_user_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE users SET failed_login_count = 0, locked_until = NULL, last_active_at = now(), updated_at = now() WHERE id = p_user_id
$$;
