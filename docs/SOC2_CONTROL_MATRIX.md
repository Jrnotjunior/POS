# SOC 2 Readiness Control Matrix — Web2Table POS

**Status:** Internal readiness plan, not an audit report or certification.  
**System in scope:** Web2Table POS and the SaaS services it depends on for identity, tenant/branch authorization, POS API, database, realtime notifications, hosting and deployment. Final scope must be approved by management and the independent CPA firm.  
**Last reviewed:** 2026-10-31

## 1. Objective and claims

Prepare evidence of control design and operation for a future SOC 2 examination. SOC 2 is an independent examination/report under AICPA standards, not a self-issued certificate. Select Trust Services Categories with the CPA firm based on customer commitments and risk; Security is the common baseline. Availability, Processing Integrity, Confidentiality and Privacy should be included only where appropriate to the system and commitments.

Do not claim "SOC 2 certified", "SOC 2 compliant", or "audited" until an independent examination and report support the specific claim.

## 2. Known architecture facts and limitations

- POS has a React/TypeScript client and a Supabase Edge Function API boundary.
- The SaaS backend is authoritative for tenant/branch membership and online-order operations.
- POS realtime notifications are metadata-only refresh signals; clients reload business data through authorized APIs.
- The repository's engineering standards require least privilege, auditability, secure configuration and tenant isolation.
- POS README states that the initial scaffold is not connected to production transaction persistence, a printer, or BIR e-invoicing. Do not treat sample-data screens as production controls.
- Source code alone does not prove a control operates effectively in production. Runtime configuration, logs, approvals, access reviews and samples are also required.

## 3. Control matrix

Statuses: **Open** = evidence/implementation not verified; **Design** = documented approach; **Implemented-unverified** = code appears present but operational evidence is missing; **Verified** = testable evidence reviewed and stored. Never mark Verified without an evidence link and reviewer/date.

| ID | Area / objective | Minimum expected control | Initial status | Evidence to collect |
|---|---|---|---|---|
| GOV-01 | Security governance | Named control owners, approved security policy, risk register and annual review | Open | Approved policy, owner register, review minutes |
| GOV-02 | Risk assessment | Document risks, likelihood/impact, treatment owner and due date | Open | Risk register and management sign-off |
| IAM-01 | Identity lifecycle | Unique accounts; documented joiner/mover/leaver flow; prompt revocation | Open | Access tickets, user list, termination samples |
| IAM-02 | MFA | MFA for privileged access and production control planes; exceptions approved and time-bound | Open | IdP settings, privileged account inventory, exception log |
| IAM-03 | Least privilege | Role-based access; separate production/admin privileges; periodic access review | Open | Role matrix, access review sign-off, IAM exports |
| TEN-01 | Tenant isolation | Server-side authorization on every sensitive operation; tenant/branch validated server-side; deny cross-tenant access | Implemented-unverified | API authorization tests, RLS/policy review, negative cross-tenant tests |
| SEC-01 | Secrets | No service-role/provider secrets in browser bundle or repository; managed secrets and rotation | Open | Secret scan reports, hosting config review, rotation evidence |
| SEC-02 | Secure SDLC | Protected branch, review/approval, required CI checks, dependency/security scanning and release process | Open | Branch protection, PR reviews, CI logs, scan results |
| SEC-03 | Vulnerability management | Defined scanning cadence, severity SLAs, remediation and retest | Open | Scanner configuration, findings and closure evidence |
| LOG-01 | Audit logging | Log security-relevant actions and sensitive business events with actor, tenant/branch, timestamp, result and correlation ID; avoid secrets/needless PII | Open | Event schema, sample sanitized logs, retention config |
| LOG-02 | Log protection | Restrict log access, preserve integrity, set retention and monitor failures | Open | IAM export, retention policy, alert tests |
| DATA-01 | Data classification | Inventory personal, customer, payment, order and tax data; document purpose and retention | Open | Data inventory, flow diagram, retention schedule |
| DATA-02 | Encryption | TLS for network traffic; encryption at rest via managed providers; key/secret access restricted | Open | Provider settings and documented key responsibility |
| PRIV-01 | Privacy obligations | Privacy notice, lawful purpose, data-subject request process and retention/deletion rules where applicable | Open | Privacy notice, request log, retention/deletion tests |
| CHG-01 | Change management | Changes reviewed, tested, approved and traceable to deployment; emergency change process | Open | PRs, approvals, CI runs, deployment history |
| OPS-01 | Monitoring | Availability/error/security alerts with owner and escalation route | Open | Alert config, sample incidents, on-call/escalation guide |
| OPS-02 | Incident response | Written incident plan, severity definitions, evidence preservation, notification assessment and annual tabletop | Open | Plan, tabletop record, incident tickets |
| BCP-01 | Backup and recovery | Document backups, restore ownership, RPO/RTO targets; test restoration periodically | Open | Provider config, restore-test record, approved RPO/RTO |
| VEND-01 | Vendor management | Inventory service providers/subservice organizations; review SOC reports/security terms and complementary user controls | Open | Vendor inventory, contracts, review notes |
| POS-01 | Processing integrity | Server-side final amount/tax validation, idempotent checkout, atomic persistence and reconciliation | Open | Design review, tests, transaction samples and reconciliations |
| POS-02 | Transaction auditability | Finalized transactions not silently overwritten/deleted; voids/returns/corrections authorized and traceable | Open | Database constraints, event history, approval samples |
| RT-01 | Realtime correctness | Realtime payloads carry no business secrets; reconnect and missed-event reconciliation reload authorized state | Implemented-unverified | Subscription tests, reconnect test, API authorization evidence |
| SUP-01 | Support access | Time-limited, approved and logged support access; tenant-specific access restricted | Open | Support procedure, access records, sample approval |
| HR-01 | Personnel controls | Confidentiality commitments, onboarding/offboarding and security training appropriate to staff | Open | Policy acknowledgement and training records |

## 4. Evidence repository

Store evidence in an access-controlled location outside public source control. Do not commit customer data, raw logs containing personal data, secrets, audit reports, or sensitive-console screenshots to this repository.

Suggested folders:
- governance/ — policies, system description, risk register, owners
- access/ — access reviews, joiner/mover/leaver samples, MFA settings evidence
- engineering/ — PR approvals, CI results, dependency/security scans, deployment records
- operations/ — monitoring, incidents, restore tests, business continuity
- vendors/ — provider inventory, contracts, SOC reports, complementary controls
- pos-processing/ — tests for idempotency, invoice sequence, voids/returns and reconciliation
- privacy/ — data inventory, retention schedule, requests and incident assessments
- audit/ — CPA requests, sample selections, management assertions and final report (restricted)

Each evidence item should have an ID, control ID, date/range, owner, source, reviewer, result and retention/access classification. Keep evidence tamper-resistant and avoid unnecessary personal data.

## 5. Remediation order

### P0 — Before production customer financial data
1. Confirm production architecture and system boundary; identify all subservice providers.
2. Complete tenant/branch negative authorization tests and database policy review.
3. Verify privileged MFA, secret storage, production access restrictions and revocation process.
4. Establish durable server-side sale persistence, idempotency, audit history and reconciliation before treating POS transactions as production-ready.
5. Configure production logging/alerts and document incident escalation.
6. Set backup/restore targets and perform a documented restore test.
7. Add code review, required CI checks, dependency scanning and controlled deployment evidence.

### P1 — Before audit observation period
1. Approve governance, risk, access, change, incident, vendor, privacy and retention policies.
2. Perform first access review and document remediation.
3. Run incident-response and recovery tabletop exercises.
4. Establish evidence collection owners and monthly control reviews.
5. Engage an independent CPA firm to confirm criteria, scope, Type 1 vs Type 2 objectives and readiness gaps.

### P2 — During and after examination
1. Address CPA readiness findings.
2. For Type 2, operate controls consistently throughout the agreed observation period and retain evidence.
3. Respond to sample requests and remediate exceptions.
4. Approve customer-facing claims only after reviewing the final issued report and permitted communications.

## 6. Management decisions required

- [ ] Confirm legal entity and system boundary.
- [ ] Select Trust Services Categories with CPA firm.
- [ ] Decide whether initial goal is Type 1 design assessment or Type 2 operating-effectiveness report.
- [ ] Assign a named owner and backup for every control.
- [ ] Approve risk appetite, incident-notification process, data retention and recovery objectives.
- [ ] Select restricted evidence repository and retention policy.
- [ ] Confirm provider/subservice responsibilities and complementary user entity controls.

## 7. Reference

AICPA & CIMA — System and Organization Controls (SOC) resources and Trust Services Criteria:  
https://www.aicpa-cima.com/resources/landing/system-and-organization-controls-soc-suite-of-services

The CPA firm must confirm applicable criteria, examination type, system description, subservice treatment and evidence requirements. This matrix is an internal planning artifact, not a substitute for professional advice or an examination.
