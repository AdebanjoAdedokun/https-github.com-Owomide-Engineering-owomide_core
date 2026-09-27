-- Rollback: 0007_directory_and_invitations
-- Service: rbac
DROP FUNCTION IF EXISTS rbac.accept_invitation(text, text, text, text);
DROP POLICY IF EXISTS invitation_by_token_policy ON rbac.invitation;
DROP FUNCTION IF EXISTS rbac.members_with_permission(text);
