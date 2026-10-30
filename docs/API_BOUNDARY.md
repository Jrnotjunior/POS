# Web2table POS API boundary

**Status: design contract; no production endpoint is implied by this document.**

## Purpose

Define the minimum trusted API boundary between the separate POS client and the Web2table SaaS. The browser must not access private SaaS tables directly as a substitute for server-side authorization.

## Existing platform facts

- Tenant and branch identity are owned by the SaaS.
- Tenant and branch membership are resolved from authenticated identity; the browser cannot authorize itself by submitting IDs.
- The SaaS published menu tables explicitly revoke direct browser table access. Public storefront data is returned through a curated RPC, but that public storefront contract is not an authenticated cashier menu API.
- Online orders and fulfillment state remain owned by the SaaS.
- The POS integration contract in the SaaS repository is design-only; proposed routes are not live endpoints.

## Proposed versioned routes

All routes below are proposals until implemented and reviewed in the trusted backend.

- `GET /api/pos/v1/session` — resolve authenticated staff identity and permitted tenant/branch contexts.
- `GET /api/pos/v1/branches/{branchId}/menu` — return only active, branch-authorized menu items and effective prices.
- `GET /api/pos/v1/branches/{branchId}/orders` — return online/QR orders visible to the authenticated cashier, with bounded pagination and explicit allowed statuses.
- `GET /api/pos/v1/orders/{orderId}` — return an immutable, authorized order snapshot.
- `POST /api/pos/v1/transactions` — create a POS transaction using a persisted idempotency key.
- `GET /api/pos/v1/transactions/{transactionId}` — retrieve an authorized transaction.
- `POST /api/pos/v1/orders/{orderId}/checkout` — link an eligible online order to a POS payment/transaction using an explicit state transition guard.

These routes must not be treated as implemented until a server-side handler exists, is deployed, and has security tests. The POS client now contains an API adapter for the session and branch-menu reads, but the adapter does not create the server endpoints. Until those endpoints are deployed and verified, the public GitHub Pages app remains in explicitly labelled demo mode.

## Required authorization

1. Verify the authenticated session server-side.
2. Resolve the active tenant membership and permitted branch membership from trusted records.
3. Enforce least-privilege POS permissions; the current SaaS role enum does not yet define a dedicated cashier/POS role, so role mapping must be decided and implemented before production use.
4. Treat submitted tenant/branch IDs as resource selectors only, never as proof of access.
5. Reject cross-tenant and unauthorized cross-branch access even if a caller guesses valid UUIDs.
6. Keep service-role keys and all provider secrets exclusively on trusted server infrastructure.
7. Add negative tests for missing MFA/assurance where required, disabled membership, wrong tenant, wrong branch, and insufficient role.

## Money, transaction, and replay protection

- Use PHP integer centavos end-to-end.
- Load the authoritative price and availability on the server; never trust client prices or totals.
- Persist a unique idempotency key scoped to the tenant and operation.
- Concurrent duplicate requests must produce one transaction and return the original result for safe retries.
- Persist immutable line-item snapshots and append-only audit events for payment changes, voids, and refunds.
- Keep fulfillment, payment, POS transaction, and invoice statuses separate.
- Use a durable outbox/retry/reconciliation mechanism for cross-system changes.

## Data ownership

| Concern | Authority |
|---|---|
| Tenant, branch, staff identity, membership and permissions | Web2table SaaS |
| Published catalog IDs and authoritative menu prices | Web2table SaaS |
| Online/QR order and fulfillment lifecycle | Web2table SaaS |
| POS manual sales, tender records, register shifts and cash drawer | POS transaction backend (to be designed and implemented) |
| Invoice issuance evidence | Approved invoicing workflow/provider, not the browser |

## Implementation gates

Do not enable live checkout until the trusted API, data model, authorization, server-side calculations, idempotency, audit records, concurrency tests, and reconciliation are implemented and verified. A green frontend CI run does not establish backend or production readiness.
