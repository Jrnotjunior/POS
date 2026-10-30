import { describe, expect, it, vi } from 'vitest';
import { createPosApiClient, PosApiClientError } from './posApiClient';

const session = {
  userId: 'user-1',
  displayName: 'Test Cashier',
  tenantId: 'tenant-1',
  tenantName: 'Test Restaurant',
  branchId: 'branch-1',
  branchName: 'Main Branch',
  permissions: ['pos.menu.read'],
};

const menu = [{
  id: 'item-1',
  categoryId: 'meals',
  categoryName: 'Meals',
  name: 'Burger',
  description: 'Classic burger',
  unitPriceCentavos: 18900,
  available: true,
}];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POS API client', () => {
  it('resolves session and branch menu through trusted endpoints', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: session }))
      .mockResolvedValueOnce(jsonResponse({ data: menu }));
    const client = createPosApiClient({ baseUrl: 'https://api.example.test/', fetcher, getAccessToken: async () => 'test-access-token' });

    await expect(client.getSession()).resolves.toEqual(session);
    await expect(client.getBranchMenu(session.branchId)).resolves.toEqual(menu);
    expect(fetcher).toHaveBeenNthCalledWith(1, 'https://api.example.test/api/pos/v1/session', expect.objectContaining({
      credentials: 'omit',
      headers: { Accept: 'application/json', Authorization: 'Bearer test-access-token' },
    }));
    expect(fetcher).toHaveBeenNthCalledWith(2, 'https://api.example.test/api/pos/v1/branches/branch-1/menu', expect.objectContaining({
      credentials: 'omit',
      headers: { Accept: 'application/json', Authorization: 'Bearer test-access-token' },
    }));
  });

  it('encodes branch identifiers as path segments', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ data: menu }));
    const client = createPosApiClient({ baseUrl: 'https://api.example.test', fetcher, getAccessToken: async () => 'test-access-token' });
    await client.getBranchMenu('branch/with spaces');
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.example.test/api/pos/v1/branches/branch%2Fwith%20spaces/menu',
      { method: 'GET', credentials: 'omit', headers: { Accept: 'application/json', Authorization: 'Bearer test-access-token' } },
    );
  });

  it('rejects malformed menu payloads', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ data: [{ ...menu[0], unitPriceCentavos: -1 }] }));
    const client = createPosApiClient({ baseUrl: 'https://api.example.test', fetcher, getAccessToken: async () => 'test-access-token' });
    await expect(client.getBranchMenu('branch-1')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
      status: 502,
    });
  });

  it('maps unauthorized responses to a clear typed error', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ error: { code: 'FORBIDDEN', message: 'No branch access.' } }, 403));
    const client = createPosApiClient({ baseUrl: 'https://api.example.test', fetcher, getAccessToken: async () => 'test-access-token' });
    await expect(client.getSession()).rejects.toBeInstanceOf(PosApiClientError);
    await expect(client.getSession()).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
  });

  it('rejects an empty API base URL', () => {
    expect(() => createPosApiClient({ baseUrl: '   ' })).toThrow('POS API base URL is not configured.');
  });
  it('creates a cash sale with the same idempotency key and bearer token', async () => {
    const sale = { id: 'sale-1', sale_number: 1, subtotal_centavos: 51000, total_centavos: 51000, payment_method: 'cash', payment_status: 'paid', cash_tendered_centavos: 51000, change_centavos: 0, created_at: '2026-10-30T10:00:00Z' };
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ data: sale }, 201));
    const client = createPosApiClient({ baseUrl: 'https://api.example.test/', fetcher, getAccessToken: async () => 'test-access-token' });
    const request = { branchId: 'branch-1', idempotencyKey: 'key-1', cashTenderedCentavos: 51000, items: [{ itemId: 'item-1', quantity: 1 }] };
    await expect(client.createCashSale(request)).resolves.toMatchObject({ id: 'sale-1', total_centavos: 51000 });
    expect(fetcher).toHaveBeenCalledWith('https://api.example.test/api/pos/v1/sales', expect.objectContaining({
      method: 'POST',
      credentials: 'omit',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: 'Bearer test-access-token' },
      body: JSON.stringify(request),
    }));
  });

  it('loads branch-scoped POS sale history', async () => {
    const sales = [{ id: 'sale-1', sale_number: 1, subtotal_centavos: 51000, total_centavos: 51000, payment_method: 'cash', payment_status: 'paid', cash_tendered_centavos: 51000, change_centavos: 0, created_at: '2026-10-30T10:00:00Z', items: [] }];
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ data: sales }));
    const client = createPosApiClient({ baseUrl: 'https://api.example.test', fetcher, getAccessToken: async () => 'test-access-token' });
    await expect(client.getBranchSales('branch-1')).resolves.toEqual(sales);
    expect(fetcher).toHaveBeenCalledWith('https://api.example.test/api/pos/v1/branches/branch-1/sales?limit=50', expect.objectContaining({ method: 'GET', credentials: 'omit' }));
  });

  it('loads the current cashier shift through the authenticated shift endpoint', async () => {
    const shift = { active: true, id: 'shift-1', status: 'open', opening_cash_centavos: 20000, cash_sales_centavos: 12500, expected_cash_centavos: 32500, opened_at: '2026-10-30T09:00:00Z' };
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ data: shift }));
    const client = createPosApiClient({ baseUrl: 'https://api.example.test/', fetcher, getAccessToken: async () => 'test-access-token' });
    await expect(client.getCashierShift('branch-1')).resolves.toEqual(shift);
    expect(fetcher).toHaveBeenCalledWith('https://api.example.test/api/pos/v1/shift?branchId=branch-1', expect.objectContaining({
      method: 'GET',
      credentials: 'omit',
      headers: { Accept: 'application/json', Authorization: 'Bearer test-access-token' },
    }));
  });

  it('opens a cashier shift using integer centavos', async () => {
    const shift = { id: 'shift-1', status: 'open', opening_cash_centavos: 20000, expected_cash_centavos: 20000 };
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ data: shift }, 201));
    const client = createPosApiClient({ baseUrl: 'https://api.example.test', fetcher, getAccessToken: async () => 'test-access-token' });
    await expect(client.openCashierShift('branch-1', 20000)).resolves.toMatchObject({ ...shift, active: true });
    expect(fetcher).toHaveBeenCalledWith('https://api.example.test/api/pos/v1/shift/open', expect.objectContaining({
      method: 'POST',
      credentials: 'omit',
      body: JSON.stringify({ branchId: 'branch-1', openingCashCentavos: 20000 }),
    }));
  });

  it('closes a cashier shift and returns the cash variance', async () => {
    const closed = { id: 'shift-1', status: 'closed', opening_cash_centavos: 20000, expected_cash_centavos: 32500, counted_cash_centavos: 30000, cash_variance_centavos: -2500, opened_at: '2026-10-30T09:00:00Z', closed_at: '2026-10-30T17:00:00Z', close_note: 'Short by 25 pesos' };
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ data: closed }));
    const client = createPosApiClient({ baseUrl: 'https://api.example.test', fetcher, getAccessToken: async () => 'test-access-token' });
    await expect(client.closeCashierShift('branch-1', 30000, 'Short by 25 pesos')).resolves.toEqual(closed);
    expect(fetcher).toHaveBeenCalledWith('https://api.example.test/api/pos/v1/shift/close', expect.objectContaining({
      method: 'POST',
      credentials: 'omit',
      body: JSON.stringify({ branchId: 'branch-1', countedCashCentavos: 30000, closeNote: 'Short by 25 pesos' }),
    }));
  });

  it('rejects invalid opening and counted cash amounts before making a request', async () => {
    const fetcher = vi.fn();
    const client = createPosApiClient({ baseUrl: 'https://api.example.test', fetcher, getAccessToken: async () => 'test-access-token' });
    await expect(client.openCashierShift('branch-1', -1)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(client.closeCashierShift('branch-1', 1.5)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(fetcher).not.toHaveBeenCalled();
  });

});
