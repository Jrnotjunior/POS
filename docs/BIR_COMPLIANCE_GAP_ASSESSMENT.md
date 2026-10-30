# Web2Table POS — BIR Compliance Gap Assessment

**Assessment date:** 31 October 2026  
**Scope:** Repository-level preliminary assessment of `Jrnotjunior/POS` and the described Web2Table multi-tenant SaaS architecture.  
**Status:** PRELIMINARY — NOT LEGAL/TAX ADVICE, NOT A BIR DETERMINATION, AND NOT EVIDENCE OF ACCREDITATION.

## Executive decision

**Do not enable the POS to issue or represent any output as a BIR-compliant sales invoice/e-invoice yet.** Keep fiscal issuance disabled. Existing printed POS receipts are transaction receipts only and must not be represented as BIR-compliant invoices.

The immediate blocker is not just missing fields. Web2Table must first confirm which legal/technical route applies to the product and business model:

1. A POS sales machine/software generating principal invoices for a taxpayer-user, subject to the applicable BIR accreditation and registration/Permit to Use route under RMO 24-2023 and related current issuances;
2. A system used only for order-taking or supplementary/internal documents, potentially a Special Purpose Machine (SPM) with registration but not the same accreditation route; or
3. A subscription-based electronic invoicing/e-receipting system / Electronic Invoicing Service Provider (ESP) solution, where the supplier-side obligations introduced by RMC 110-2026 may apply in addition to taxpayer-user obligations.

Because Web2Table is a multi-tenant SaaS product, do **not** assume it is exempt from supplier/ESP requirements merely because each restaurant is a separate taxpayer. Obtain a written classification/pathway from the BIR or Philippine tax counsel before selecting an architecture or making a compliance claim.

## What was inspected

- POS repository README and architecture boundaries.
- POS `pos-api` Edge Function route/auth flow and cash-sale path.
- Fiscal-profile and fiscal-tax-policy database foundations.
- Fiscal tax calculation domain module, as summarized by the repository's current implementation history.
- BIR RMO 24-2023 official full text.
- BIR's 2026 Revenue Regulations and Revenue Memorandum Circulars index, including RR 6-2026, RR 7-2026, RMC 98-2026, RMC 110-2026 and RMC 112-2026 listings.

This is a repository-level assessment, not a full audit of every file, deployed environment, tenant configuration, database object, production log, application behavior, or submitted BIR document. Each implementation status below is based on code evidence currently inspected and must be revalidated in automated tests and an end-to-end demo.

## Regulatory sources to track

1. **RMO 24-2023** — accreditation/registration framework for CRMs, POS and other sales machines/software generating invoices/receipts, including subscription-based e-invoicing/e-receipting systems. Official full text: https://bir-cdn.bir.gov.ph/local/pdf/RMO%20No.%2024-2023.pdf
2. **RR 7-2024, as amended** — invoice rules under the Ease of Paying Taxes framework. Verify the latest consolidated text and applicability for each taxpayer type.
3. **RR 11-2025, as amended by RR 26-2025** — electronic invoicing requirements and transitory periods. RR 26-2025 provides a 31 December 2026 compliance date for specified covered taxpayer groups; confirm whether each restaurant customer falls within a covered class and whether later issuances changed the date. Official RR 26-2025: https://bir-cdn.bir.gov.ph/BIR/pdf/RR%20No.%2026-2025.pdf
4. **RMC 98-2026** — BIR guidance on electronic invoice issuance under RR 8-2022 and RR 11-2025, as amended by RR 26-2025. Retrieve and review the official full text and annexes before designing transmission.
5. **RMC 110-2026** — accreditation, technical, operational, security, data governance, institutional, legal and continuing compliance requirements for Electronic Invoicing Service Providers (ESPs). BIR's official 2026 RMC index lists this issuance dated 13 October 2026: https://www.bir.gov.ph/2026-Revenue-Memorandum-Circulars?label=2026&type=PAGE
6. **RR 6-2026 and RMC 112-2026** — mandatory invoice information and separate presentation of creditable withholding tax. These are current as of this assessment date and must be reflected in invoice schema/rules where applicable. Official RR index: https://www.bir.gov.ph/2026-Revenue-Regulations
7. **RR 7-2026** — amends the burden-sharing agreement for establishments claiming senior-citizen discounts as tax deductions. Review alongside applicable senior-citizen/PWD/other statutory discount rules.
8. **Enhanced eAccReg / PTU / e-invoicing portals and current BIR advisories** — confirm current application route, required approvals and system-specific registration: https://eaccreg.bir.gov.ph/ACCREG/help.html and https://eis-cert.bir.gov.ph/

**Important timing note:** As of 31 October 2026, the BIR site announcement reported an ESP accreditation application window of 16–30 October 2026. That window appears to have passed. This assessment does not establish whether Web2Table applied, qualifies, or has any certificate. If RMC 110-2026 applies to Web2Table, promptly obtain written advice from the BIR on the current application/transition route. Do not infer permission to operate from a closed application window or from the absence of an entry on a website.

## Gap matrix

Legend: **GAP** = not evidenced/implemented in inspected code; **PARTIAL** = foundation exists but requirement is not end-to-end; **VERIFY** = must be confirmed against full repository, deployment, documents, or BIR; **BLOCKER** = must be resolved before fiscal issuance.

| Area | Requirement / evidence expected | Current evidence | Status | Required action / release gate |
|---|---|---|---|---|
| Product/legal classification | Determine whether product is POS generating principal invoices, SPM/order-taking system, subscription e-invoicing system, ESP, or a combination. | POS repository describes a dedicated POS; SaaS is multi-tenant. No written BIR classification located in inspected evidence. | **BLOCKER** | Obtain written BIR/tax counsel determination covering Web2Table supplier and restaurant taxpayer-user roles, architecture, and each product capability. |
| Supplier/ESP accreditation | Applicable supplier accreditation, documentary eligibility, security/data governance, technical demonstration, interoperability and ongoing obligations. | No evidence of Web2Table BIR accreditation certificate or ESP certificate in inspected repository. | **BLOCKER / VERIFY** | Confirm RMO 24-2023 and RMC 110-2026 route, application status, deadlines/transition options and whether shared multi-tenant platform is covered. Do not market as BIR-accredited without documentary proof. |
| Taxpayer/branch registration | Applicable POS/software registration, PTU/ATG/PTI Electronic Invoice and per-taxpayer/branch coverage. | Fiscal profile schema stores tenant/branch taxpayer data and authorization metadata; database guards keep fiscal profiles draft and authorization fields empty. No actual BIR-issued permit evidence inspected. | **PARTIAL / BLOCKER** | Create evidence-backed registration records only from authentic documents; model permit/certificate type, covered taxpayer/branch/software version, dates, identifiers and revocation/renewal state. Never allow UI data alone to assert authorization. |
| Invoice generation and required header | Correct registered name/trade name/address, TIN + branch code, VAT status, machine/software identifiers, invoice series/number, transaction date/time and applicable buyer information. | Current cash-sale response persists sale number and totals/items; inspected response does not show a BIR invoice DTO/series, MIN, permit/authorization, or invoice issuance workflow. Fiscal profile stores some taxpayer fields only. | **GAP / BLOCKER** | Build a versioned invoice schema from current consolidated BIR requirements and generate only after legal pathway and authorization are confirmed. Validate per branch and tax status. |
| Current invoice mandatory information | Include required invoice data, including creditable withholding tax information where applicable under RR 6-2026/RMC 112-2026; statutory discount fields where applicable. | No evidence of complete current invoice fields or current BIR schema in the inspected sale endpoint. | **GAP / BLOCKER** | Translate current issuances and annexes into field-level requirements and test cases, including exceptions/applicability. Do not hardcode assumptions about when withholding tax applies. |
| Tax classification/calculation | Correct VATable, VAT-exempt and zero-rated treatment; discounts and tax bases; currency/rounding; effective-dated approved policy. | `src/domain/fiscalTax.ts` provides a calculation foundation using integer centavos and configurable policies. DB policies are draft-only and not connected to checkout. | **PARTIAL** | Obtain accountant-approved tax rules for each customer/branch; add mixed-tax baskets, discounts, returns/refunds, rounding and tax-category tests; enforce server-side calculation. No statutory defaults without verified requirements. |
| Tamper-free sales records | Users/providers cannot silently edit or delete sales or bypass transaction recording; privileged actions are logged. | Cash sales use a trusted Edge Function and RPC; fiscal configuration has append-only audit events and draft-only guards. This does not prove complete immutable sales ledger or provider-admin activity coverage. | **PARTIAL / VERIFY** | Review all RPCs, grants, triggers, service-role access and break-glass paths. Add append-only sale/adjustment ledger and tests for privileged/provider actions, edits, deletion, retries and cross-tenant attempts. |
| Activity/transaction log | Report who created/changed/pushed/pulled/exported transactions, values and timestamps, including provider/admin remote access. | Fiscal configuration audit metadata exists; no complete invoice/sales activity journal was evidenced in inspected code. | **GAP** | Implement actor-attributed audit events for sales, invoices, adjustments, exports, transmission attempts, admin/provider support access and configuration changes. Restrict access and avoid logging secrets/needless PII. |
| Nonvolatile storage / recovery | Durable records survive power/service interruption; documented backup/recovery and retention. | Sales persist in Supabase and sale lines are re-read from DB for receipts. No end-to-end disaster recovery, backup restore evidence, retention policy evidence or recovery test was inspected. | **PARTIAL / VERIFY** | Define BIR/legal retention schedule; document backup/RPO/RTO and access/export; run and record restore tests. Validate records remain retrievable if SaaS access ends. |
| Electronic Journal (e-Journal) | For applicable POS route, daily journal includes original invoice details and adjustment documents plus relevant X/Z readings; export in prescribed text format where required. | No e-Journal export or complete fiscal adjustment journal evidenced in inspected code. | **GAP / BLOCKER** | Implement the applicable format and daily immutable export after confirming whether the chosen route requires e-Journal or a different e-invoicing data model. |
| X-reading / shift report | Cashier accountability report with required sales, discounts and adjustments. | Shift open/close endpoints and cash sale flow exist; no verified BIR-compliant X-reading output or reconciliation evidence inspected. | **PARTIAL / GAP** | Build report from persisted ledger and compare expected cash/card/other tender totals, discounts, refunds, voids and cashier accountability. |
| Z-reading / end-of-day | Daily operation report with accumulated grand total, sales/tax breakdown, tender modes, Z-counter/reset counter, adjustments; no further sales for a closed sales operation date where applicable. | No verified BIR-compliant Z-reading, grand-total/reset-counter control or close-day transaction lock inspected. | **GAP / BLOCKER** | Implement daily close semantics, immutable report snapshots, counters and tests for late sales, timezone/business day, reprint and adjustments. Confirm exact requirements for the selected route. |
| Backend statutory reports | Sales summary by VATable/VAT-exempt/zero-rated categories and required special discount books/reports, void/return/refund reports. | General sales history/shift capabilities exist; statutory report outputs not evidenced. | **GAP** | Implement and reconcile each applicable BIR report to the invoice/adjustment ledger; test totals and export/print formats. |
| Invoice numbering | At least six-digit sequential running serial number and applicable reset counter; no gaps, reuse, client-generated numbering or tampering. | Sale number exists, but no evidence that it is a compliant invoice series with six-digit padded sequence, reset counter, MIN mapping or branch-specific issuance semantics. | **GAP / BLOCKER** | Design a database-authoritative, concurrency-safe, auditable invoice-number allocator per approved scope; test retries, parallel tills, rollback, reset and non-reuse. Keep transaction IDs separate from invoice numbers. |
| Reprint | Reprints preserve original stored data and show “REPRINT” plus reprint date/time. | Receipt printing uses persisted sale item snapshots, which is good for consistency; BIR reprint label/time behavior was not verified. | **PARTIAL** | Keep original issuance immutable; add explicit reprint metadata/label and audit event; test repeated prints do not create new sales or invoice numbers. |
| E-invoice transmission / EIS | Correct current BIR schema (JSON or current prescribed protocol), transmission to BIR or approved ESP, unique ID/reference, retries/reconciliation and delivery status. | No BIR EIS transmission, PTT/middleware certification, EIS unique ID, or ESP integration evidenced in inspected endpoint. | **GAP / BLOCKER** | After pathway confirmation, implement adapter behind a versioned interface; verify current BIR schema and test environment; persist payload hash, attempts, responses, unique ID and unresolved errors. Never silently mark unsent invoices as transmitted. |
| Verification seal | Applicable QR/barcode/URL or other BIR-required verification mechanism for e-invoices under the chosen route. | No validated fiscal verification seal evidenced. | **GAP / BLOCKER** | Implement only the BIR-prescribed mechanism and payload; verify scan/resolution and tamper detection. A generic QR code is not sufficient evidence. |
| Offline/downtime procedures | No sale disappears during downtime; required authorized manual invoice procedure, reference linkage and later reconciliation where applicable. | No documented offline invoice queue/manual-invoice replacement workflow inspected. | **GAP** | Confirm current fallback rules and implement fail-safe procedure. Never fabricate an invoice number or claim BIR transmission while offline. |
| Retention and taxpayer access | Retain records for required period and give taxpayer-user access/export at registered place of business. | Cloud persistence exists; legal retention configuration, export package, offboarding access and retention tests were not inspected. | **PARTIAL / VERIFY** | Confirm retention duration with current law/tax counsel; provide tenant/branch export, access controls, offboarding process, legal hold and tested restore. |
| Statutory discounts | Correct eligibility, required customer evidence/fields, discount calculation, tax treatment, books/reports and current senior-citizen/PWD/other applicable rules. | General configurable discount support is not proven to cover statutory eligibility and reports. RR 7-2026 is a current source to review. | **GAP / BLOCKER for statutory discounts** | Create rules only from current legal guidance; capture required proof and audit evidence with privacy safeguards; add accountant-reviewed examples and tests. |
| Creditable withholding tax | Current invoice information and presentation under RR 6-2026 and RMC 112-2026 where applicable. | No evidence of invoice-level withholding tax fields/calculation/presentation in inspected sale contract. | **GAP / BLOCKER where applicable** | Add conditional fields/rules only after tax counsel defines applicable transactions, required separate presentation and transition treatment. |
| Multi-tenant isolation | No tenant/branch can read, issue, export or transmit another taxpayer's invoice; numbering and configuration are properly scoped. | Edge Function performs server-side membership and branch checks; fiscal tables use tenant/branch constraints and direct client privileges are revoked. End-to-end cross-tenant tests not inspected. | **PARTIAL / VERIFY** | Add automated authorization tests for every fiscal endpoint, SQL function, export and transmission worker. Test owner/cashier multi-role and cross-tenant branch spoofing. |
| Security and SOC 2 readiness | Least privilege, auditability, secret protection, incident response, security review, vendor/subprocessor governance. | Server-side service role and audit foundations exist; no complete ESP-level security/data governance evidence or independent assessment inspected. | **PARTIAL / VERIFY** | Document threat model, data flow, access reviews, incident response, encryption/key management, backups, vulnerability management, subprocessors and security evidence. SOC 2 readiness is not certification. |
| Documentary application package | Sworn declarations, required annexes, company/representative documents, technical documents, system demo and BIR checklist evidence. | No complete application dossier or signed BIR forms/certificate evidence inspected. | **GAP / VERIFY** | Assemble only after pathway decision. Map every RMO 24-2023 Annex B/C/F and any applicable RMC 110-2026 ESP document to an owner and evidence file. |
| End-to-end proof | Demonstration proves actual invoice issuance, reports, audit trail, failure/retry, tenant isolation and BIR/ESP interoperability. | Existing code-level foundations and a receipt test do not establish BIR compliance. No completed BIR demo/interoperability test evidence inspected. | **GAP / BLOCKER** | Prepare reproducible acceptance suite and evidence pack; require passing tests, approved tax review, and applicable BIR certificates/permits before activation. |

## Immediate technical findings

1. **The current POS sale is not a fiscal invoice workflow.** The inspected cash-sale endpoint creates a cash sale and returns persisted sale/item snapshots for receipt consistency. That is valuable transaction integrity, but not invoice issuance, invoice numbering approval, EIS transmission or BIR accreditation.
2. **Fiscal profile and tax policy tables are foundations, not authorization.** Their draft-only guards and audit trail are prudent controls. They must remain non-authoritative until authentic permits/certificates are reviewed and represented accurately.
3. **The tax calculation module is not yet checkout enforcement.** Calculations must be server-side, based on approved effective-dated rules and persisted with the transaction. Browser totals must never become the tax authority.
4. **The sales and fiscal ledgers must be designed together.** Invoice issuance, invoice sequence allocation, journal entries, adjustments, reporting, reprints and EIS delivery must be auditable and idempotent.
5. **A printed receipt is not proof of BIR compliance.** Do not add “BIR compliant,” “BIR accredited,” “official invoice,” or similar claims without evidence applicable to the actual software version, taxpayer, branch and authorization.
6. **ESP obligations may change the business plan.** RMC 110-2026 must be assessed directly against Web2Table's provider role and platform architecture. Its existence cannot be handled as merely a restaurant-owner settings task.

## Recommended implementation sequence

### Phase 0 — Regulatory decision (no fiscal code activation)
- [ ] Obtain written product classification and supplier/ESP pathway determination.
- [ ] Confirm whether Web2Table needs POS software accreditation, ESP accreditation, registration/PTU/ATG/PTI, or multiple approvals.
- [ ] Confirm current application availability/transition options after the reported 16–30 October 2026 ESP window.
- [ ] Identify each customer tax profile and covered taxpayer group without assuming all restaurants have identical obligations.
- [ ] Have a Philippine tax professional review RR 7-2024 as amended, RR 11-2025/RR 26-2025, RMC 98-2026, RMC 110-2026, RR 6-2026/RMC 112-2026, RR 7-2026, and related applicable rules.

### Phase 1 — Requirements and schema
- [ ] Build a versioned field-by-field compliance checklist from official full texts and annexes.
- [ ] Define taxpayer, branch, POS/software version, authorization, invoice series, tax category, customer, adjustment, journal, report and transmission data models.
- [ ] Define record-retention, export, outage and manual-invoice replacement policies.
- [ ] Specify immutable/idempotent issuance and correction/void/refund semantics.

### Phase 2 — Core fiscal ledger (still disabled in production)
- [ ] Implement server-authoritative invoice sequence and transaction-to-invoice linkage.
- [ ] Persist approved tax breakdowns and invoice snapshots with each issuance.
- [ ] Implement immutable audit events, reprint events and adjustment linkage.
- [ ] Add X/Z readings and statutory/backend reports as applicable.
- [ ] Add data export, backup/restore, retention and branch/taxpayer access controls.

### Phase 3 — Integration and evidence
- [ ] Implement the BIR/approved ESP adapter based on the current approved protocol and schema.
- [ ] Add durable retry, delivery state, unique ID handling, reconciliation and dead-letter alerting.
- [ ] Test outages, duplicate requests, parallel tills, tenant spoofing, returns/voids, discounts, rounding, day close, reprints and exports.
- [ ] Produce a system demo pack and map tests to the official BIR functional/technical checklist and applicable ESP checklist.

### Phase 4 — Controlled activation
Activation requires **all** of:
- [ ] Written pathway decision and professional tax review.
- [ ] Applicable accreditation/registration/permit/certification documents verified and within scope.
- [ ] Passing automated tests and an end-to-end demonstration.
- [ ] Approved configuration per taxpayer and branch.
- [ ] Operational runbook, monitoring, incident response, backup/restore and customer export procedure.
- [ ] Product/legal approval of any compliance claims.

Until then, keep fiscal issuance disabled. Do not block ordinary internal POS transaction recording, but clearly label non-fiscal receipts and do not imply they satisfy invoice obligations.

## Questions requiring authoritative confirmation

1. Is Web2Table, as a third-party multi-tenant SaaS, an ESP under RMC 110-2026 when it generates/transmits invoices on behalf of unrelated restaurant taxpayers? Does a POS accreditation under RMO 24-2023 cover any or all of that role?
2. Given the ESP application window reported for 16–30 October 2026, what application or transition path is currently available to a provider that has not applied?
3. For each restaurant customer group, which electronic invoicing deadline and permit/registration route currently applies, considering RR 11-2025/RR 26-2025 and RMC 98-2026?
4. Which prescribed BIR data schema, transmission method, certification/permit, unique ID and verification seal are required for Web2Table's exact architecture?
5. What are the current retention period, offline/manual invoice replacement procedure, and required invoice/adjustment numbering semantics?
6. How must RR 6-2026/RMC 112-2026 withholding-tax information and RR 7-2026 senior-citizen discount rules be applied to the restaurant use cases?

## Release decision

**Current decision: NO-GO for BIR/fiscal invoice issuance or BIR-compliance marketing.**  
**Permitted next work:** regulatory pathway confirmation, requirements traceability, internal transaction integrity, tests, reports and draft configuration foundations.  
**Not yet proven:** BIR accreditation, registration/PTU/ATG/PTI, ESP approval, EIS interoperability, legal tax correctness, production retention/recovery compliance, or successful BIR system demonstration.

This document is an engineering gap assessment to support review with the BIR and a Philippine tax professional; it is not a legal opinion or certification.
