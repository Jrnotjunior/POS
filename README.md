# Web2table POS

A dedicated point-of-sale application for the Web2table restaurant platform.

## Engineering standards (mandatory)

- **No CSS overrides.** Fix styles in their owning component or design token; do not stack overrides or `!important` patches.
- **Modular architecture.** Keep UI, domain rules, application services, and infrastructure adapters separated.
- **SOC 2 readiness.** Design for least privilege, auditability, secure configuration, and documented controls. Readiness is not certification.
- **Tenant isolation and server-side authorization.** Client-supplied tenant/branch IDs are never authorization. Every operation must be checked by a trusted backend and database policies.
- **Reliable realtime.** Persist business state; treat realtime as a delivery mechanism, with reconnect/reconciliation and idempotency.
- **Evidence-based reporting.** Never claim tests, builds, security, or compliance succeeded without verifiable results.
- **Brand fidelity.** Use Web2table's existing Inter body/UI font, Manrope heading font, and established navy/slate/red brand palette. Do not introduce a competing theme.

## Architecture boundary

- This repository owns POS workflows: cashier UI, register/shift lifecycle, in-store sale drafts, tender recording, receipt presentation/printing, void/return workflows, and POS reporting.
- The existing Web2table SaaS remains authoritative for tenant/branch identity, staff identity and memberships, and online-order intake/fulfilment unless a reviewed integration contract explicitly changes that boundary.
- The browser must not connect with service-role credentials or be trusted to calculate final transaction amounts, permissions, tax treatment, or invoice compliance.
- POS transactions must eventually be persisted by a trusted server-side API with tenant/branch authorization, server-side price/tax validation, durable idempotency, audit records, and a retry/reconciliation strategy.
- Do not treat a printed receipt as proof of BIR e-invoicing compliance. The applicable BIR route and requirements must be verified before enabling a compliance claim.

## Current status

The initial repository foundation and brand-aligned UI scaffold are being established. The current interface uses clearly labeled sample data and is **not connected to production authentication, Supabase, a transaction API, a printer, or BIR e-invoicing**.

## Development

- `npm install`
- `npm run dev`
- `npm run typecheck`
- `npm test`
- `npm run build`

Only `VITE_` public configuration belongs in browser environment variables. Never commit real secrets.
