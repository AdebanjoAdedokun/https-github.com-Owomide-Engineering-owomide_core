import type { DbClient } from "../db.js";

export class RoleRepository {
  /**
   * True if any of the given role codes — resolved against this org's visible
   * roles (the global system roles plus the org's own custom roles) — grants
   * the named permission. No match means Deny.
   */
  async hasPermission(
    client: DbClient,
    roleCodes: readonly string[],
    permission: string
  ): Promise<boolean> {
    if (roleCodes.length === 0 || !permission) return false;
    const result = await client.query<{ allowed: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM rbac.role r
         JOIN rbac.role_permission rp ON rp.role_id = r.id
         WHERE r.code = ANY($1)
           AND rp.permission_name = $2
       ) AS allowed`,
      [[...roleCodes], permission]
    );
    return result.rows[0]?.allowed ?? false;
  }
}
