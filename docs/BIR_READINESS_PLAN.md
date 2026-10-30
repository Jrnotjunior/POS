# BIR Readiness Plan — Web2Table POS

**Status:** Readiness planning only. Web2Table POS is not represented as BIR-accredited, certified, registered, or authorized by this document.  
**Last reviewed:** 2026-10-31

## 1. Objective and scope

Prepare Web2Table POS for the correct Philippine BIR route before it is used to generate tax invoices/receipts in production. The exact route depends on the product's role and the taxpayer/customer profile. Obtain written guidance from the responsible BIR office and Philippine tax counsel before treating any route as final.

Keep these separate:
- **POS/CRM sales-machine accreditation or permit/registration** applicable to a software/system generating sales invoices or receipts.
- **Taxpayer-specific registration/authority** for a restaurant or branch using the system.
- **Electronic invoicing and sales reporting (EIS)** obligations, including certification/Permit to Transmit where applicable.
- **Electronic Invoicing Service Provider (ESP) accreditation**, if Web2Table intends to act as an ESP under the current BIR framework.

## 2. Current baseline and open gaps

The POS repository README states that the initial scaffold is not connected to a production transaction API, printer, or BIR e-invoicing. Treat these as open until implementation and evidence prove otherwise:

- [ ] Confirm legal entity/provider role and intended BIR route with BIR/RDO/Large Taxpayers office and Philippine tax adviser.
- [ ] Confirm whether Web2Table is applying as a POS software provider, a subscription-based invoicing/receipting provider, an ESP, or more than one category.
- [ ] Identify a pilot restaurant taxpayer and branch; collect registration details only through an approved secure process.
- [ ] Define invoice/receipt requirements for the taxpayer's registration and tax treatment.
- [ ] Implement server-authoritative sale finalization, price/tax calculations, durable numbering and idempotency.
- [ ] Implement immutable transaction/audit history for issued invoices, voids, returns, corrections, reprints and failed submissions.
- [ ] Implement structured invoice data export and map it to current BIR technical requirements.
- [ ] Implement secure transmission, acknowledgement tracking, retry/backoff, duplicate prevention and reconciliation if EIS reporting applies.
- [ ] Ensure offline operation cannot silently create conflicting invoice numbers or falsely mark a transmission as successful.
- [ ] Implement approved receipt/invoice templates only after required fields and wording are validated by tax counsel/BIR guidance.
- [ ] Prepare user, administrator, deployment, backup/recovery and troubleshooting documentation.
- [ ] Complete BIR testing/application documents and retain the official application outcome and any issued authority/certificate.
- [ ] Add release controls preventing production invoice issuance until relevant permissions and configuration are verified.

## 3. Required design controls

### Transaction integrity
- Final totals, discounts, tax treatment and invoice identifiers are calculated/validated by trusted server-side code, never accepted from the browser as authoritative.
- Persist each finalized sale atomically with line items, tender(s), tax breakdown, cashier/shift, branch, required customer data, and invoice state.
- Use a unique durable idempotency key for each checkout request; retries must not create duplicate sales or invoice numbers.
- Do not hard-delete finalized sales or issued invoices. Corrections must use explicit, authorized, auditable reversal/void/credit/correction flows as legally appropriate.
- Invoice numbering must be unique within the applicable registered taxpayer/branch/terminal series and follow approved rules. Do not invent numbering policy without confirmation.
- Keep business timestamps with explicit timezone handling and preserve original issue time.

### Tax and invoice configuration
- Store effective-dated tax configuration with controlled changes and an audit trail.
- Support only validated tax categories and calculations; do not assume all restaurants are VAT-registered or share the same tax treatment.
- Distinguish a printed receipt from a compliant invoice and from an electronically reported invoice.
- Do not show "BIR compliant", "BIR approved", "accredited", "certified", or similar claims without documented authorization for the specific product/version/usage.

### E-invoicing / sales reporting (if applicable)
- Map invoice fields and structured payload to the current official BIR schema/specification.
- Use authenticated server-to-server transmission; never expose transmission secrets in browser code.
- Persist request identifiers, response/acknowledgement, timestamps, attempt counts, status and sanitized error details.
- Use a retry queue with exponential backoff, dead-letter/manual review, idempotency and reconciliation.
- Protect taxpayer/invoice data in transit and at rest; restrict access and redact secrets/PII from logs.
- Validate correction, cancellation, rejected payloads, outage windows, and delayed acknowledgement.

## 4. Regulatory references to verify before implementation

Official sources reviewed on 2026-10-31; tax counsel must confirm current applicability and later amendments:

- BIR **RMO No. 24-2023**: accreditation policies for CRMs, POS and similar sales machines/software generating invoices/receipts, including subscription-based e-invoicing/e-receipting systems.  
  https://www.bir.gov.ph/2023-Revenue-Memorandum-Order
- BIR **RR No. 11-2025**: electronic invoicing and electronic sales reporting framework.  
  https://bir-cdn.bir.gov.ph/BIR/pdf/RR%20No.%2011-2025.pdf
- BIR **RR No. 26-2025**: amends transitory provisions of RR 11-2025; certain covered taxpayers' e-invoice compliance period was extended to 31 December 2026. Confirm the customer's classification and subsequent rules before relying on a deadline.  
  https://bir-cdn.bir.gov.ph/BIR/pdf/RR%20No.%2026-2025.pdf
- BIR **RMC No. 98-2026**: listed by BIR as prescribing policies/guidelines for electronic invoice issuance under RR 8-2022 and RR 11-2025, as amended by RR 26-2025. Obtain and review the full text before finalizing design.  
  https://www.bir.gov.ph/2026-Revenue-Memorandum-Circulars
- BIR **RMC No. 110-2026**: listed by BIR as prescribing accreditation, technical, operational, security, data governance, institutional, legal and continuing compliance requirements for ESPs. Obtain and review the full text and application process if Web2Table intends to be an ESP.  
  https://www.bir.gov.ph/2026-Revenue-Memorandum-Circulars
- BIR EIS certification portal and technical information: https://eis-cert.bir.gov.ph/
- BIR eAccReg help for POS/CRM resources: https://eaccreg.bir.gov.ph/ACCREG/help.html

BIR materials distinguish taxpayer EIS certification/Permit to Transmit from provider-level accreditation. Verify current rules rather than relying on older advisories alone.

## 5. Application and evidence checklist

- [ ] Named accountable owner and authorized applicant.
- [ ] Written classification of product and applicant role, confirmed with BIR/tax counsel.
- [ ] Exact legal entity, taxpayer, branch and product/version scope for the application.
- [ ] Product architecture and data-flow diagrams.
- [ ] Functional specification for sales, invoicing, tax, voids/returns, reporting and audit logs.
- [ ] Security design: roles, tenant/branch isolation, encryption, secrets management and audit access.
- [ ] Test evidence for transaction correctness, duplicate/retry behavior, invoice sequence, corrections and failure recovery.
- [ ] Required application forms, technical documents, sample outputs and test materials from the current BIR process.
- [ ] Formal application submission receipt and correspondence.
- [ ] Official written decision, accreditation/permit/certificate/authority if issued, including scope and expiry/renewal conditions.
- [ ] Release gate proving only authorized product versions and taxpayer/branch configuration can use regulated invoice functions.

## 6. Release gates

**Gate 0 — Classification:** no compliance claims until provider and taxpayer routes are confirmed.  
**Gate 1 — Design:** invoice/tax rules and structured schema reviewed by a Philippine tax professional and mapped to current official requirements.  
**Gate 2 — Technical validation:** automated tests cover numbering, idempotency, tax arithmetic, correction flows, audit immutability, export/transmission and recovery.  
**Gate 3 — Official process:** required BIR application/testing is complete and the official outcome is documented.  
**Gate 4 — Production:** configuration restricts regulated invoice issuance to authorized versions, entities and branches; monitoring and support procedures are active.

## 7. Decision log

| Date | Decision / question | Owner | Evidence / outcome |
|---|---|---|---|
| 2026-10-31 | Determine whether Web2Table must pursue POS software accreditation, ESP accreditation, taxpayer-specific EIS certification/PTT, or multiple routes | Management + Philippine tax counsel | Open |
| 2026-10-31 | Review full text of RMC 98-2026 and RMC 110-2026 and confirm current application windows | Compliance owner | Open |
| 2026-10-31 | Select pilot restaurant/branch and define tax status/invoice scope | Product + pilot customer | Open |
