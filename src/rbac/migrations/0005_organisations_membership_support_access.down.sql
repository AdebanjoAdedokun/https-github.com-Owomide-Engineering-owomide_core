-- Rollback: 0005_organisations_membership_support_access
-- Service: rbac
-- ⚠️  DESTRUCTIVE: drops organisations, people, memberships, role assignments, invitations,
-- support grants and the access log. Safe in local dev only.

DROP FUNCTION IF EXISTS rbac.active_role_codes(text, text);
DROP FUNCTION IF EXISTS rbac.create_organisation(text, text, text, text, text, text, text, text);
DROP TABLE IF EXISTS rbac.access_log;
DROP TABLE IF EXISTS rbac.support_access_grant;
DROP FUNCTION IF EXISTS rbac.guard_support_grant_update();
DROP TABLE IF EXISTS rbac.invitation;
DROP TABLE IF EXISTS rbac.role_assignment;
DROP TABLE IF EXISTS rbac.membership;
DROP FUNCTION IF EXISTS rbac.assert_org_has_owner();
DROP FUNCTION IF EXISTS rbac.guard_role_assignment();
DROP TABLE IF EXISTS rbac.user_account;
DROP TABLE IF EXISTS rbac.organisation;
