import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const api = readFileSync("supabase/functions/pos-api/index.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20261031150000_enforce_draft_only_fiscal_tax_policies.sql",
  "utf8",
);
const profileMigration = readFileSync(
  "supabase/migrations/20261031160000_enforce_draft_only_fiscal_profiles.sql",
  "utf8",
);
const securitySql = readFileSync("supabase/tests/fiscal_tax_policy_security.sql", "utf8");

describe("fiscal configuration authorization contract", () => {
  it("limits fiscal tax-policy routes to restaurant owners", () => {
    expect(api).toContain('if(role!=="restaurant_owner")return response(req,err("FORBIDDEN","Only a restaurant owner can manage fiscal tax policies."');
  });

  it("scopes fiscal profile and policy reads to the resolved tenant and branch", () => {
    expect(api).toContain('.eq("tenant_id",context.tenantId).eq("branch_id",context.branchId).maybeSingle()');
    expect(api).toContain('.eq("tenant_id",context.tenantId).eq("branch_id",context.branchId).order("policy_version"');
  });

  it("requires the requested branch to be active and belong to an authorized membership", () => {
    expect(api).toContain('.eq("tenant_id",t.id).eq("is_active",true)');
    expect(api).toContain('q=q.eq("id",requestedBranch)');
    expect(api).toContain('q=q.in("id",branchIds)');
    expect(api).toContain('memberships.sort((a:Rec,b:Rec)=>Number(b.role==="restaurant_owner")-Number(a.role==="restaurant_owner"))');
  });

  it("validates explicit effective dates and rejects duplicate rule codes", () => {
    expect(api).toContain('!isoDate(effectiveFrom)');
    expect(api).toContain('seenCodes.has(code)');
    expect(api).toContain('!Number.isSafeInteger(rate)');
    expect(api).toContain('treatment!=="taxable"&&Number(rate)!==0');
  });

  it("forces inserted tax policies to unreviewed drafts until approval is implemented", () => {
    expect(migration).toContain("new.status <> 'draft'");
    expect(migration).toContain("new.reviewed_by is not null");
    expect(migration).toContain("new.reviewed_at is not null");
    expect(migration).toContain("Fiscal tax policy approval is disabled");
    expect(securitySql).toContain("pos_fiscal_tax_policy_draft_only");
  });

  it("prevents fiscal profiles from claiming authorization without a verified workflow", () => {
    expect(profileMigration).toContain("new.fiscal_status <> 'draft'");
    expect(profileMigration).toContain("new.authorized_by is not null");
    expect(profileMigration).toContain("Fiscal authorization changes are disabled");
    expect(securitySql).toContain("pos_fiscal_profile_draft_only");
  });

  it("protects audit events from mutation and direct writes", () => {
    expect(securitySql).toContain("pos_fiscal_tax_policy_audit_append_only");
    expect(securitySql).toContain("pos_fiscal_tax_policy_audit_no_truncate");
    expect(securitySql).toContain("service_role must not have direct write privileges");
  });
});
