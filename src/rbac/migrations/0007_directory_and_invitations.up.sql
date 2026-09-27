-- Migration: 0007_directory_and_invitations
-- Service: rbac
-- PostgreSQL 16+
--
-- 1. rbac.members_with_permission: who in the current organisation holds a permission now, for
--    Notify (approvers of a submission, executors of a release). Active members with an active
--    assignment of an enabled role only; support access never counts as membership.
-- 2. rbac.accept_invitation: the invitee signs in and accepts a one-time invitation (ORG-003,
--    ORG-004). The token is checked by hash, must be unexpired, unrevoked and unused, and the
--    signed-in email must match the invited address. Membership and roles are created in one step.

CREATE FUNCTION rbac.members_with_permission(p_permission text)
RETURNS TABLE (identity_subject text, email text, display_name text)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, rbac
AS $$
  SELECT DISTINCT u.identity_subject, u.email, u.display_name
  FROM rbac.membership m
  JOIN rbac.organisation o ON o.id = m.org_id
  JOIN rbac.user_account u ON u.id = m.user_id
  JOIN rbac.role_assignment ra
    ON ra.org_id = m.org_id AND ra.membership_id = m.id AND ra.revoked_at IS NULL
  JOIN rbac.role r ON r.code = ra.role_code AND r.org_id IS NULL
  JOIN rbac.role_permission rp ON rp.role_id = r.id AND rp.permission_name = p_permission
  WHERE m.org_id = rbac.current_org_id()
    AND m.status = 'active'
    AND ra.role_code = ANY (o.enabled_role_codes)
  ORDER BY u.identity_subject;
$$;

-- The invitee has no tenant context before accepting, so the invitation is found by its token
-- hash through this narrow policy, visible only while the accepting function has set the hash.
CREATE POLICY invitation_by_token_policy ON rbac.invitation
  FOR SELECT
  USING (token_sha256 = NULLIF(current_setting('rbac.invitation_token_sha256', true), ''));

CREATE FUNCTION rbac.accept_invitation(
  p_token text,
  p_identity_subject text,
  p_email text,
  p_display_name text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rbac, pg_temp
AS $$
DECLARE
  v_hash text;
  v_inv rbac.invitation%ROWTYPE;
  v_user uuid;
  v_membership rbac.membership%ROWTYPE;
  v_role text;
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 THEN
    RAISE EXCEPTION 'invitation is not valid' USING ERRCODE = 'invalid_authorization_specification';
  END IF;
  v_hash := encode(sha256(convert_to(p_token, 'UTF8')), 'hex');

  PERFORM set_config('rbac.invitation_token_sha256', v_hash, true);
  SELECT * INTO v_inv FROM rbac.invitation WHERE token_sha256 = v_hash;
  PERFORM set_config('rbac.invitation_token_sha256', '', true);

  -- One message for every failure, so the response says nothing about which tokens exist.
  -- (Tested on the row itself: PERFORM above resets FOUND.)
  IF v_inv.id IS NULL
     OR v_inv.accepted_at IS NOT NULL
     OR v_inv.revoked_at IS NOT NULL
     OR v_inv.expires_at <= clock_timestamp()
     OR lower(v_inv.email) <> lower(btrim(p_email)) THEN
    RAISE EXCEPTION 'invitation is not valid' USING ERRCODE = 'invalid_authorization_specification';
  END IF;

  -- From here on the organisation is the tenant context, as for the service.
  PERFORM set_config('app.org_id', v_inv.org_id, true);

  SELECT id INTO v_user FROM rbac.user_account WHERE identity_subject = p_identity_subject;
  IF v_user IS NULL THEN
    INSERT INTO rbac.user_account (identity_subject, email, display_name)
    VALUES (p_identity_subject, btrim(p_email), coalesce(p_display_name, ''))
    RETURNING id INTO v_user;
  END IF;

  SELECT * INTO v_membership FROM rbac.membership WHERE org_id = v_inv.org_id AND user_id = v_user;
  IF NOT FOUND THEN
    INSERT INTO rbac.membership (org_id, user_id, status, invited_by, joined_at, status_changed_by)
    VALUES (v_inv.org_id, v_user, 'active', v_inv.invited_by, clock_timestamp(), v_user::text)
    RETURNING * INTO v_membership;
  ELSIF v_membership.status = 'suspended' THEN
    -- Only an administrator can lift a suspension.
    RAISE EXCEPTION 'invitation is not valid' USING ERRCODE = 'invalid_authorization_specification';
  ELSIF v_membership.status <> 'active' THEN
    UPDATE rbac.membership
    SET status = 'active', joined_at = clock_timestamp(), status_changed_by = v_user::text,
        status_changed_at = clock_timestamp()
    WHERE id = v_membership.id;
  END IF;

  FOREACH v_role IN ARRAY v_inv.role_codes LOOP
    IF NOT EXISTS (
      SELECT 1 FROM rbac.role_assignment
      WHERE org_id = v_inv.org_id AND membership_id = v_membership.id
        AND role_code = v_role AND revoked_at IS NULL
    ) THEN
      INSERT INTO rbac.role_assignment (org_id, membership_id, role_code, granted_by)
      VALUES (v_inv.org_id, v_membership.id, v_role, v_inv.invited_by);
    END IF;
  END LOOP;

  UPDATE rbac.invitation SET accepted_at = clock_timestamp(), accepted_by_user_id = v_user
  WHERE id = v_inv.id;

  INSERT INTO rbac.access_log (org_id, actor_user_id, action, resource)
  VALUES (v_inv.org_id, v_user::text, 'invitation.accept', v_inv.id::text);

  RETURN v_inv.org_id;
END;
$$;

REVOKE ALL ON FUNCTION rbac.accept_invitation(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rbac.accept_invitation(text, text, text, text) TO rbac_svc;
GRANT EXECUTE ON FUNCTION rbac.members_with_permission(text) TO rbac_svc;
