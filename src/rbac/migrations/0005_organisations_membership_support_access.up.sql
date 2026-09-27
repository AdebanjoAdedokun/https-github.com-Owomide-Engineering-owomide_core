-- Migration: 0005_organisations_membership_support_access
-- Service: rbac
-- PostgreSQL 16+
--
-- Organisations, people, memberships, role assignments, invitations, time-boxed support access
-- and the access log (decisions D-02, D-03; PRD ORG-001 to ORG-015, GOV-015 to GOV-019, AI-036).
-- Authority comes from these stored rows, resolved per request, not from token claims.
-- Enforced here:
--   * an organisation always has at least one active Account Owner (ORG-009);
--   * only the roles an organisation has enabled can be assigned (Release 1: four roles);
--   * role assignments and support grants are never deleted or rewritten, only revoked;
--   * support access always has an end, at most 30 days after it starts;
--   * the access log is append-only.

-- ---------------------------------------------------------------- Organisation

CREATE TABLE rbac.organisation (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text CHECK (btrim(id) <> ''),
  name text NOT NULL CHECK (btrim(name) <> ''),
  country text NOT NULL CHECK (country ~ '^[A-Z]{2}$'),
  default_currency text NOT NULL CHECK (default_currency ~ '^[A-Z]{3}$'),
  time_zone text NOT NULL CHECK (btrim(time_zone) <> ''),
  ai_data_policy text NOT NULL CHECK (ai_data_policy IN ('disabled', 'enabled_without_cost_margin', 'enabled')),
  -- Release 1 supports four roles (PRD section 2.5); later releases enable more.
  enabled_role_codes text[] NOT NULL
    DEFAULT ARRAY['account_owner', 'pricing_manager', 'finance_approver', 'executor'],
  created_by text NOT NULL CHECK (btrim(created_by) <> ''),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ('account_owner' = ANY (enabled_role_codes))
);

-- ---------------------------------------------------------------- People (not tenant data)

-- One row per person across organisations, keyed by the identity provider's subject.
CREATE TABLE rbac.user_account (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_subject text NOT NULL UNIQUE CHECK (btrim(identity_subject) <> ''),
  email text NOT NULL CHECK (position('@' IN email) > 1),
  display_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE UNIQUE INDEX user_account_email_uniq ON rbac.user_account (lower(email));

-- ---------------------------------------------------------------- Membership and roles

CREATE TABLE rbac.membership (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL REFERENCES rbac.organisation (id),
  user_id uuid NOT NULL REFERENCES rbac.user_account (id),
  status text NOT NULL CHECK (status IN ('invited', 'active', 'suspended', 'removed')),
  invited_by text,
  joined_at timestamptz,
  status_changed_by text,
  status_changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (org_id, id),
  UNIQUE (org_id, user_id),
  CHECK (status <> 'active' OR joined_at IS NOT NULL)
);

CREATE TABLE rbac.role_assignment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL,
  membership_id uuid NOT NULL,
  role_code text NOT NULL CHECK (btrim(role_code) <> ''),
  granted_by text NOT NULL CHECK (btrim(granted_by) <> ''),
  granted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  revoked_by text,
  revoked_at timestamptz,
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, membership_id) REFERENCES rbac.membership (org_id, id),
  CHECK ((revoked_at IS NULL) = (revoked_by IS NULL))
);

CREATE UNIQUE INDEX role_assignment_active_uniq
  ON rbac.role_assignment (org_id, membership_id, role_code) WHERE revoked_at IS NULL;

CREATE FUNCTION rbac.guard_role_assignment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  enabled text[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT enabled_role_codes INTO enabled FROM rbac.organisation WHERE id = NEW.org_id;
    IF NOT (NEW.role_code = ANY (coalesce(enabled, ARRAY[]::text[]))) THEN
      RAISE EXCEPTION 'role % is not enabled for this organisation', NEW.role_code
        USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM rbac.role WHERE code = NEW.role_code AND org_id IS NULL) THEN
      RAISE EXCEPTION 'unknown role %', NEW.role_code USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.revoked_at IS NOT NULL THEN
      RAISE EXCEPTION 'a new role assignment cannot start revoked' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'role assignment % is already revoked', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  IF (to_jsonb(NEW) - 'revoked_by' - 'revoked_at') IS DISTINCT FROM (to_jsonb(OLD) - 'revoked_by' - 'revoked_at') THEN
    RAISE EXCEPTION 'role assignments can only be revoked, not changed' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER role_assignment_guard
BEFORE INSERT OR UPDATE ON rbac.role_assignment
FOR EACH ROW EXECUTE FUNCTION rbac.guard_role_assignment();

-- Last owner (ORG-009): checked at commit, so a transfer (grant the new owner, then revoke the
-- old one) inside one transaction succeeds, while leaving no owner at all fails.
CREATE FUNCTION rbac.assert_org_has_owner()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_org text := CASE WHEN TG_OP = 'DELETE' THEN OLD.org_id ELSE NEW.org_id END;
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM rbac.role_assignment ra
      JOIN rbac.membership m ON m.org_id = ra.org_id AND m.id = ra.membership_id
     WHERE ra.org_id = target_org
       AND ra.role_code = 'account_owner'
       AND ra.revoked_at IS NULL
       AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'organisation % must keep at least one active Account Owner', target_org
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER role_assignment_keeps_owner
AFTER INSERT OR UPDATE ON rbac.role_assignment
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION rbac.assert_org_has_owner();

CREATE CONSTRAINT TRIGGER membership_keeps_owner
AFTER UPDATE ON rbac.membership
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION rbac.assert_org_has_owner();

-- ---------------------------------------------------------------- Invitations

CREATE TABLE rbac.invitation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL REFERENCES rbac.organisation (id),
  email text NOT NULL CHECK (position('@' IN email) > 1),
  role_codes text[] NOT NULL CHECK (cardinality(role_codes) > 0),
  -- Only a SHA-256 of the one-time token is stored.
  token_sha256 text NOT NULL UNIQUE CHECK (token_sha256 ~ '^[0-9a-f]{64}$'),
  invited_by text NOT NULL CHECK (btrim(invited_by) <> ''),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  accepted_by_user_id uuid REFERENCES rbac.user_account (id),
  revoked_at timestamptz,
  UNIQUE (org_id, id),
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '14 days'),
  CHECK ((accepted_at IS NULL) = (accepted_by_user_id IS NULL)),
  CHECK (accepted_at IS NULL OR revoked_at IS NULL)
);

CREATE INDEX invitation_org_email_idx ON rbac.invitation (org_id, lower(email));

-- ---------------------------------------------------------------- Support access (ORG-015)

CREATE TABLE rbac.support_access_grant (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL REFERENCES rbac.organisation (id),
  owomide_user_id text NOT NULL CHECK (btrim(owomide_user_id) <> ''),
  purpose text NOT NULL CHECK (btrim(purpose) <> ''),
  granted_by text NOT NULL CHECK (btrim(granted_by) <> ''),
  starts_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  ends_at timestamptz NOT NULL,
  revoked_by text,
  revoked_at timestamptz,
  UNIQUE (org_id, id),
  CHECK (ends_at > starts_at AND ends_at <= starts_at + interval '30 days'),
  CHECK ((revoked_at IS NULL) = (revoked_by IS NULL))
);

CREATE FUNCTION rbac.guard_support_grant_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'support grant % is already revoked', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  IF (to_jsonb(NEW) - 'revoked_by' - 'revoked_at') IS DISTINCT FROM (to_jsonb(OLD) - 'revoked_by' - 'revoked_at') THEN
    RAISE EXCEPTION 'support grants can only be revoked, not changed' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER support_access_grant_guard
BEFORE UPDATE ON rbac.support_access_grant
FOR EACH ROW EXECUTE FUNCTION rbac.guard_support_grant_update();

-- ---------------------------------------------------------------- Access log (append-only)

CREATE TABLE rbac.access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL REFERENCES rbac.organisation (id),
  actor_user_id text NOT NULL CHECK (btrim(actor_user_id) <> ''),
  via_support_grant_id uuid,
  action text NOT NULL CHECK (btrim(action) <> ''),
  resource text NOT NULL DEFAULT '',
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (org_id, via_support_grant_id) REFERENCES rbac.support_access_grant (org_id, id)
);

CREATE INDEX access_log_org_time_idx ON rbac.access_log (org_id, occurred_at DESC);

-- ---------------------------------------------------------------- Creating an organisation

-- A new organisation has no tenant context yet, so creation runs as one SECURITY DEFINER step:
-- the organisation, the creator's account (if new), an active membership and the Account Owner
-- role, all or nothing (ORG-001, J3 day 0).
CREATE FUNCTION rbac.create_organisation(
  p_identity_subject text,
  p_email text,
  p_display_name text,
  p_name text,
  p_country text,
  p_default_currency text,
  p_time_zone text,
  p_ai_data_policy text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rbac, pg_temp
AS $$
DECLARE
  v_user uuid;
  v_org text;
  v_membership uuid;
BEGIN
  INSERT INTO rbac.user_account (identity_subject, email, display_name)
  VALUES (p_identity_subject, p_email, coalesce(p_display_name, ''))
  ON CONFLICT (identity_subject) DO UPDATE SET identity_subject = EXCLUDED.identity_subject
  RETURNING id INTO v_user;

  -- The new organisation becomes the tenant context for the rest of this transaction, so the
  -- forced row-level security policies apply exactly as they do to the service.
  v_org := gen_random_uuid()::text;
  PERFORM set_config('app.org_id', v_org, true);

  INSERT INTO rbac.organisation (id, name, country, default_currency, time_zone, ai_data_policy,
                                 created_by)
  VALUES (v_org, p_name, p_country, p_default_currency, p_time_zone, p_ai_data_policy, v_user::text);

  INSERT INTO rbac.membership (org_id, user_id, status, joined_at, status_changed_by)
  VALUES (v_org, v_user, 'active', clock_timestamp(), v_user::text)
  RETURNING id INTO v_membership;

  INSERT INTO rbac.role_assignment (org_id, membership_id, role_code, granted_by)
  VALUES (v_org, v_membership, 'account_owner', v_user::text);

  INSERT INTO rbac.access_log (org_id, actor_user_id, action, resource)
  VALUES (v_org, v_user::text, 'organisation.create', v_org);

  RETURN v_org;
END;
$$;

-- Current authority for one person in one organisation: active membership and unrevoked roles.
-- The gateway resolves this per request instead of trusting token claims.
CREATE FUNCTION rbac.active_role_codes(p_org_id text, p_identity_subject text)
RETURNS text[]
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(array_agg(ra.role_code ORDER BY ra.role_code), ARRAY[]::text[])
    FROM rbac.user_account u
    JOIN rbac.membership m ON m.user_id = u.id AND m.org_id = p_org_id AND m.status = 'active'
    JOIN rbac.role_assignment ra ON ra.org_id = m.org_id AND ra.membership_id = m.id
                                AND ra.revoked_at IS NULL
   WHERE u.identity_subject = p_identity_subject;
$$;

-- ---------------------------------------------------------------- Row-level security

ALTER TABLE rbac.organisation ENABLE ROW LEVEL SECURITY;
ALTER TABLE rbac.organisation FORCE ROW LEVEL SECURITY;
CREATE POLICY organisation_tenant_policy ON rbac.organisation
  USING (id = rbac.current_org_id()) WITH CHECK (id = rbac.current_org_id());

ALTER TABLE rbac.membership ENABLE ROW LEVEL SECURITY;
ALTER TABLE rbac.membership FORCE ROW LEVEL SECURITY;
CREATE POLICY membership_tenant_policy ON rbac.membership
  USING (org_id = rbac.current_org_id()) WITH CHECK (org_id = rbac.current_org_id());

ALTER TABLE rbac.role_assignment ENABLE ROW LEVEL SECURITY;
ALTER TABLE rbac.role_assignment FORCE ROW LEVEL SECURITY;
CREATE POLICY role_assignment_tenant_policy ON rbac.role_assignment
  USING (org_id = rbac.current_org_id()) WITH CHECK (org_id = rbac.current_org_id());

ALTER TABLE rbac.invitation ENABLE ROW LEVEL SECURITY;
ALTER TABLE rbac.invitation FORCE ROW LEVEL SECURITY;
CREATE POLICY invitation_tenant_policy ON rbac.invitation
  USING (org_id = rbac.current_org_id()) WITH CHECK (org_id = rbac.current_org_id());

ALTER TABLE rbac.support_access_grant ENABLE ROW LEVEL SECURITY;
ALTER TABLE rbac.support_access_grant FORCE ROW LEVEL SECURITY;
CREATE POLICY support_access_grant_tenant_policy ON rbac.support_access_grant
  USING (org_id = rbac.current_org_id()) WITH CHECK (org_id = rbac.current_org_id());

ALTER TABLE rbac.access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE rbac.access_log FORCE ROW LEVEL SECURITY;
CREATE POLICY access_log_tenant_policy ON rbac.access_log
  USING (org_id = rbac.current_org_id()) WITH CHECK (org_id = rbac.current_org_id());

-- ---------------------------------------------------------------- Grants

GRANT SELECT, INSERT, UPDATE ON rbac.organisation, rbac.membership, rbac.role_assignment,
  rbac.invitation, rbac.support_access_grant TO rbac_svc;
GRANT SELECT, INSERT, UPDATE ON rbac.user_account TO rbac_svc;
GRANT SELECT, INSERT ON rbac.access_log TO rbac_svc;
GRANT EXECUTE ON FUNCTION rbac.active_role_codes(text, text) TO rbac_svc;
REVOKE ALL ON FUNCTION rbac.create_organisation(text, text, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rbac.create_organisation(text, text, text, text, text, text, text, text) TO rbac_svc;
