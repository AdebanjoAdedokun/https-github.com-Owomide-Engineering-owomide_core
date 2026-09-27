import type pg from "pg";
import type { ServiceEntry } from "./manifest.js";

// Database invariants every service schema must keep, checked against a migrated database.
//
// The migration runner grants each service role SELECT, INSERT, UPDATE and DELETE on every new
// table by default (ALTER DEFAULT PRIVILEGES in runner.ts). A migration that only "does not grant"
// DELETE therefore still allows it; it must REVOKE. These checks catch that and similar gaps:
//
//   rls_not_forced             a table with org_id has row-level security off or not forced
//   rls_without_policy         row-level security is on but no policy exists (everything hidden)
//   definer_without_search_path a SECURITY DEFINER function without a fixed search_path
//   definer_executable_by_public a SECURITY DEFINER function anyone can execute
//   view_not_security_invoker  a view that would read tables with its owner's rights
//   delete_not_declared        the service role can DELETE from a table not tagged @deletable
//   append_only_writable       the service role can UPDATE or DELETE a table tagged @append-only
//   role_too_powerful          a service role is superuser, bypasses RLS or creates roles/dbs
//   cross_schema_access        a service role can use another service's schema
//
// Tags live in the table comment (COMMENT ON TABLE ... IS '... @deletable'), so each migration
// declares its own intent next to the table it creates.

export interface Finding {
  code: string;
  schema: string;
  object: string;
  detail: string;
}

export async function checkInvariants(
  client: pg.ClientBase,
  services: readonly ServiceEntry[]
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const schemas = services.map((s) => s.schema);

  for (const service of services) {
    const exists = await client.query(`SELECT 1 FROM pg_namespace WHERE nspname = $1`, [
      service.schema,
    ]);
    if (exists.rowCount === 0) continue;
    const add = (code: string, object: string, detail: string) =>
      findings.push({ code, schema: service.schema, object, detail });

    const tables = await client.query<{
      oid: number;
      name: string;
      has_org: boolean;
      rls: boolean;
      forced: boolean;
      policies: number;
      comment: string | null;
    }>(
      `SELECT c.oid, c.relname AS name,
              EXISTS (SELECT 1 FROM pg_attribute a
                      WHERE a.attrelid = c.oid AND a.attname = 'org_id' AND NOT a.attisdropped) AS has_org,
              c.relrowsecurity AS rls, c.relforcerowsecurity AS forced,
              (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid = c.oid) AS policies,
              obj_description(c.oid, 'pg_class') AS comment
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = $1 AND c.relkind IN ('r', 'p')
       ORDER BY c.relname`,
      [service.schema]
    );
    const roleExists =
      (await client.query(`SELECT 1 FROM pg_roles WHERE rolname = $1`, [service.role])).rowCount! >
      0;

    for (const t of tables.rows) {
      if (t.has_org && (!t.rls || !t.forced)) {
        add("rls_not_forced", t.name, "has org_id but row-level security is not enabled and forced");
      }
      if (t.rls && t.policies === 0) {
        add("rls_without_policy", t.name, "row-level security is on but the table has no policy");
      }
      if (!roleExists) continue;
      const comment = t.comment ?? "";
      const privileges = await client.query<{ can_delete: boolean; can_update: boolean }>(
        `SELECT has_table_privilege($1, $2::oid, 'DELETE') AS can_delete,
                has_any_column_privilege($1, $2::oid, 'UPDATE') AS can_update`,
        [service.role, t.oid]
      );
      const { can_delete, can_update } = privileges.rows[0]!;
      if (comment.includes("@append-only")) {
        if (can_delete || can_update) {
          add(
            "append_only_writable",
            t.name,
            `${service.role} can ${[can_update && "UPDATE", can_delete && "DELETE"].filter(Boolean).join(" and ")}`
          );
        }
      } else if (can_delete && !comment.includes("@deletable")) {
        add("delete_not_declared", t.name, `${service.role} can DELETE; revoke it or tag @deletable`);
      }
    }

    const views = await client.query<{ name: string; options: string[] | null }>(
      `SELECT c.relname AS name, c.reloptions AS options
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = $1 AND c.relkind = 'v' ORDER BY c.relname`,
      [service.schema]
    );
    for (const v of views.rows) {
      const invoker = (v.options ?? []).some((o) => /^security_invoker=(true|on|1)$/i.test(o));
      if (!invoker) {
        add("view_not_security_invoker", v.name, "view runs with its owner's rights; add security_invoker");
      }
    }

    const definers = await client.query<{ name: string; config: string[] | null; public_exec: boolean }>(
      `SELECT format('%s(%s)', p.proname, pg_get_function_identity_arguments(p.oid)) AS name,
              p.proconfig AS config,
              coalesce(p.proacl IS NULL
                       OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a
                                  WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'), false) AS public_exec
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = $1 AND p.prosecdef ORDER BY 1`,
      [service.schema]
    );
    for (const f of definers.rows) {
      if (!(f.config ?? []).some((c) => c.startsWith("search_path="))) {
        add("definer_without_search_path", f.name, "SECURITY DEFINER without SET search_path");
      }
      if (f.public_exec) {
        add("definer_executable_by_public", f.name, "REVOKE ALL ON FUNCTION ... FROM PUBLIC");
      }
    }

    if (roleExists) {
      const role = await client.query<{
        rolsuper: boolean;
        rolbypassrls: boolean;
        rolcreaterole: boolean;
        rolcreatedb: boolean;
      }>(
        `SELECT rolsuper, rolbypassrls, rolcreaterole, rolcreatedb FROM pg_roles WHERE rolname = $1`,
        [service.role]
      );
      const r = role.rows[0]!;
      const powers = Object.entries(r)
        .filter(([, v]) => v)
        .map(([k]) => k);
      if (powers.length > 0) add("role_too_powerful", service.role, powers.join(", "));
      for (const other of schemas) {
        if (other === service.schema) continue;
        const usage = await client.query<{ ok: boolean }>(
          `SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = $2)
                  AND has_schema_privilege($1, $2, 'USAGE') AS ok`,
          [service.role, other]
        );
        if (usage.rows[0]!.ok) {
          add("cross_schema_access", service.role, `can use schema ${other}`);
        }
      }
    }
  }
  return findings;
}

export function formatFindings(findings: readonly Finding[]): string {
  if (findings.length === 0) return "All database invariants hold.";
  return findings
    .map((f) => `${f.code.padEnd(30)} ${f.schema}.${f.object}: ${f.detail}`)
    .join("\n");
}
