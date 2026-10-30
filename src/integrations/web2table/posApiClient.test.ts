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
});
