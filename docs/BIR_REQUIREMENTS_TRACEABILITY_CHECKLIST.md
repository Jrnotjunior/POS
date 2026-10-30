# Web2Table BIR Requirements Traceability & Acceptance Checklist

**Status:** Draft for engineering implementation; legal applicability and exact formats must be confirmed against current BIR full texts/annexes and the taxpayer's facts.  
**As of:** 31 October 2026  
**Release rule:** No fiscal invoice issuance or claim of BIR accreditation until the relevant route, permits/certificates and end-to-end tests are verified.

This checklist separates (A) POS/software accreditation under RMO 24-2023, (B) taxpayer electronic-invoicing obligations under RR 11-2025/RR 26-2025/RMC 98-2026, and (C) provider-side ESP accreditation under RMC 110-2026. These are distinct questions; satisfying one does not automatically satisfy the others.

## Key regulatory distinction

- RMO 24-2023 expressly covers POS software and subscription-based e-invoicing/e-receipting software, and distinguishes SPM/order-taking software that does not issue principal invoices. The classification follows actual product capabilities, not the label used in the UI.
- RR 26-2025 gives a 31 December 2026 deadline to specified covered taxpayer groups, while separately listing taxpayers using POS systems among groups to be covered through future separate regulations. A taxpayer may nevertheless be covered because it independently falls into another category (e.g. e-commerce/internet transactions, LTS, large taxpayer, or other invoicing software). RMC 98-2026 must be read together with this rule.
- RMC 110-2026 establishes provider-side ESP requirements. Do not assume a multi-tenant provider can commercially offer an e-invoicing solution without the applicable ESP accreditation.
- RMO 24-2023's supplier/POS accreditation route and RMC 110-2026's ESP accreditation route may overlap depending on functionality. Get a written determination from BIR/tax counsel for Web2Table's actual role.
- RMC 98-2026 distinguishes electronic invoice issuance from electronic sales reporting. Do not conflate issuance, transmission to the buyer, and BIR sales-data reporting as one feature.

## Workstream A — Regulatory pathway and documentary evidence

| ID | Requirement / acceptance evidence | Status | Release gate |
|---|---|---|---|
| REG-001 | Written classification of each Web2Table capability: ordering-only/SPM, POS generating principal invoice, subscription e-invoicing, and/or ESP. | OPEN — external determination | Must be resolved before deciding required permits/certificates or enabling issuance. |
| REG-002 | Written mapping of Web2Table supplier obligations under RMO 24-2023 and RMC 110-2026, including whether both apply. | OPEN — external determination | No commercial e-invoicing service until applicable provider authorization is verified. |
| REG-003 | Per-customer determination of taxpayer coverage under RR 11-2025/RR 26-2025/RMC 98-2026; capture reasons and effective dates. | OPEN — tax review | Do not assume every restaurant has identical deadlines or exemptions. |
| REG-004 | Authentic accreditation/registration/PTU/ATG/PTI Electronic Invoice/EIS certification records, scoped to software/version/modules/deployment and taxpayer/branch as applicable. | NOT EVIDENCED | Do not let a profile field alone confer an authorized status. |
| REG-005 | Documentary application package and current route after the reported 16–30 October 2026 ESP application window. | OPEN — external determination | Do not assume late application is accepted or that no application is required. |
| REG-006 | Regulatory register with issuance number, date, official full text, annexes, superseding/amending issuance, applicability decision, reviewer and review date. | PARTIAL — source list in assessment | Keep source register current before each fiscal release. |

## Workstream B — POS/software accreditation features (RMO 24-2023; confirm exact applicability)

| ID | Requirement / acceptance evidence | Status | Required engineering proof |
|---|---|---|---|
| POS-001 | Accumulated Grand Total Sales with required capacity and reset counter behavior. | GAP | Database-backed accumulator, non-truncating reports, reset audit and controlled reset procedure. |
| POS-002 | Tamper-free sales recording; no deployed training/no-sale mode that can misrepresent live transactions. | PARTIAL | Tests for edit/delete/privileged access, disabled training mode in production and clear non-fiscal test receipts. |
| POS-003 | Activity/transaction log for create, edit, delete, extract, push/pull, provider remote access; actor, values, date/time. | GAP | Append-only actor-attributed log and negative tests for log modification/deletion. |
| POS-004 | Nonvolatile storage or recovery/backup retaining sales and related information for legally required period. | PARTIAL | Documented retention; restore and tenant export tests; no claims until tested. |
| POS-005 | e-Journal/audit journal for applicable POS route, including invoices, adjustments, X-reading and Z-reading; daily text export where prescribed. | GAP | Golden-file tests against current BIR annex format and reconciliation to persisted ledger. Confirm whether a subscription transmission route changes this requirement. |
| POS-006 | X-reading / cashier accountability reports, including sales, discounts, adjustments and totals. | PARTIAL | Snapshot report tests against persisted sale/adjustment ledger and tender reconciliation. |
| POS-007 | Z-reading/EOD with accumulated grand total, sales/tax categories, tender modes, Z-counter/reset counter and adjustments. | GAP | Immutable close snapshot, unique Z-counter, correct reprint behavior and block post-close transactions for the same business date as applicable. |
| POS-008 | Backend reports, including BIR sales summary and applicable statutory discount books/reports and void/return/refund reports. | GAP | Golden-file tests for each applicable report; totals reconcile exactly to ledger. |
| POS-009 | Sequential invoice numbering, applicable minimum length/reset-counter rules, and no reuse/collision under concurrent tills. | GAP | Server/database allocator with concurrency, retry, rollback, uniqueness and gap-analysis tests. Do not reuse sale IDs as invoice numbers without validation. |
| POS-010 | Receipt/invoice data and required BIR identity/authorization identifiers and format. | GAP | Versioned validated document schema and tests against applicable official annexes. |
| POS-011 | Reprint must reproduce the original immutable document and show reprint marker/date-time as required. | PARTIAL | Reprint audit event; no new sale or invoice number on reprint. |
| POS-012 | Refund, return, void, cancellation and other adjustment records are linked, auditable and reflected in journals/reports. | GAP / VERIFY | Adjustment ledger and cross-report reconciliation tests. |
| POS-013 | Applicable BIR QR/verification mechanism and verification data. | GAP | Implement only the prescribed mechanism for the approved route; scan/verification tests. |
| POS-014 | Documented operational demonstration for each applicable requirement. | GAP | Evidence bundle of test run, screenshots/exports, source version, test data and results. |

## Workstream C — Electronic invoicing (RR 11-2025, RR 26-2025, RMC 98-2026; applicability per taxpayer)

| ID | Requirement / acceptance evidence | Status | Required engineering proof |
|---|---|---|---|
| EINV-001 | Invoice generated by registered/approved/accredited system and covered by applicable PTI Electronic Invoice. | NOT EVIDENCED | Verify authentic approval and scope before issuing e-invoices. |
| EINV-002 | Electronic invoice is electronically issued to the buyer, not merely printed from software. | GAP | Buyer delivery mechanism with durable delivery status and retrieval/access behavior. |
| EINV-003 | Structured invoice data can be extracted, processed and transmitted/reported as prescribed. | GAP | Versioned schema validator and export/adapter tests against the current BIR standard. |
| EINV-004 | Required invoice data reflects current amendments, including withholding tax information where applicable under RR 6-2026/RMC 112-2026. | GAP | Rule-driven conditional fields; tests reviewed by Philippine tax professional. |
| EINV-005 | Downtime: taxpayer can issue a BIR-authorized manual invoice where required; after restoration, replacement electronic invoice links to manual reference as prescribed. | GAP | Documented fallback, linkage and reconciliation tests. Never invent a manual invoice authority or number. |
| EINV-006 | Taxpayer receives access to invoices/data; taxpayer and BIR can retrieve records as required. | PARTIAL | Tenant export/access tests, offboarding/data portability and audit support. |
| EINV-007 | Electronic invoice issuance and electronic sales reporting are separate capabilities. | GAP | Separate state machines, permissions, statuses and acceptance tests; never infer BIR reporting from buyer delivery. |
| EINV-008 | Customer/branch/software coverage matches actual PTI Electronic Invoice or other approved authorization. | NOT EVIDENCED | Validate issuance scope server-side for each transaction; no tenant can use another tenant's authorization. |

## Workstream D — ESP accreditation and continuing controls (RMC 110-2026; only if Web2Table is an ESP)

| ID | Requirement / acceptance evidence | Status | Required engineering/business proof |
|---|---|---|---|
| ESP-001 | Confirm Web2Table falls within ESP definition and eligibility requirements. | OPEN — external determination | Written BIR/tax counsel interpretation and management decision. |
| ESP-002 | Solution-specific accreditation scope covers product/version/modules/interfaces/deployment. | NOT EVIDENCED | Verified certificate and controlled release/version inventory. |
| ESP-003 | Required Philippine accountable representatives/officers, legal entity, beneficial ownership and service-provider disclosures. | NOT EVIDENCED | Documentary package, named accountable owners and change-control process. |
| ESP-004 | Technical architecture/data-flow review and interoperability/end-to-end transmission test. | GAP | Architecture pack, sequence/data-flow diagrams and passing integration test evidence. |
| ESP-005 | Security/privacy/data governance, source-code review, VAPT and required certifications/equivalents. | NOT EVIDENCED | Independent evidence and remediation closure; SOC 2 readiness is not SOC 2 attestation. |
| ESP-006 | Load, stress, concurrency, failover, backup and recovery testing. | GAP | Reproducible test reports and remediation for failed thresholds. |
| ESP-007 | Taxpayer data portability, preservation, migration and no vendor lock-in. | PARTIAL / VERIFY | Tested full data export, documented migration/offboarding, no loss of audit trail. |
| ESP-008 | Incident reporting, material change management, continuing compliance, audit cooperation and service continuity. | GAP | Operational policies, on-call runbook, incident exercises, release inventory and evidence log. |
| ESP-009 | Verify current application/transition path after the BIR-announced 16–30 October 2026 application window. | OPEN — external determination | Written BIR confirmation; do not infer late application acceptance. |

## Workstream E — Security, isolation, and integrity (all routes)

| ID | Requirement / acceptance evidence | Status | Required engineering proof |
|---|---|---|---|
| SEC-001 | Tenant/branch isolation for profile, invoices, numbering, journal, reports, exports and transmission. | PARTIAL | Automated cross-tenant/cross-branch spoofing tests for every endpoint and database function. |
| SEC-002 | Least privilege and no direct client privilege to bypass authorization or mutate audit records. | PARTIAL | Catalog assertions and negative integration tests, including service-role routes. |
| SEC-003 | Server-authoritative tax calculation and persisted immutable tax snapshot. | PARTIAL | Checkout contract derives totals from trusted menu/tax policy; browser-supplied tax totals ignored/rejected. |
| SEC-004 | Idempotent sale/invoice/transmission behavior under retries and network timeouts. | PARTIAL | Duplicate request tests, outbox/retry state, unique external ID and reconciliation. |
| SEC-005 | Record retention, export, backup/restore and recovery procedures. | PARTIAL | Documented policy and recorded restore drills. |
| SEC-006 | No false claims of BIR accreditation/compliance; distinguish internal transaction receipt from authorized invoice. | REQUIRED | UI, receipt copy, marketing and release checklist reviewed before release. |

## Definition of done for fiscal release

Fiscal issuance stays **disabled** until all applicable rows have:
1. an applicability decision backed by the current official source and tax reviewer;
2. implementation evidence tied to a source commit and schema/software version;
3. passing automated tests and a reproducible end-to-end demonstration;
4. verified applicable BIR-issued permits/certificates and correct taxpayer/branch scope;
5. operational evidence for security, retention, export, downtime, incident handling and recovery; and
6. written release approval.

## Official sources to keep attached to this checklist

- BIR RMO 24-2023: https://bir-cdn.bir.gov.ph/local/pdf/RMO%20No.%2024-2023.pdf
- BIR RR 26-2025: https://bir-cdn.bir.gov.ph/BIR/pdf/RR%20No.%2026-2025.pdf
- BIR RR 11-2025: https://bir-cdn.bir.gov.ph/BIR/pdf/RR%20No.%2011-2025.pdf
- BIR 2026 Revenue Memorandum Circular index (RMC 98-2026, RMC 110-2026, RMC 112-2026): https://www.bir.gov.ph/2026-Revenue-Memorandum-Circulars?label=2026&type=PAGE
- BIR 2026 Revenue Regulations index (RR 6-2026 and related issuances): https://www.bir.gov.ph/2026-Revenue-Regulations

This is an engineering traceability checklist, not a legal opinion, tax opinion, accreditation, or proof of compliance.
