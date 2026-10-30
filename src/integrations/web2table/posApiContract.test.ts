import { describe, expect, it } from 'vitest';
import { isValidPosMenuItem, isValidPosOnlineOrder, type PosOnlineOrderSnapshot } from './posApiContract';

const menuItem = {
  id: 'item-1',
  categoryId: 'category-1',
  categoryName: 'Meals',
  name: 'Burger',
  description: 'Classic burger',
  unitPriceCentavos: 18900,
  available: true,
};

const order: PosOnlineOrderSnapshot = {
  contractVersion: 'v1',
  externalOrderId: 'order-1',
  tenantId: 'tenant-1',
  branchId: 'branch-1',
  source: 'web2table_online',
  fulfillmentType: 'pickup',
  currency: 'PHP',
  lines: [{ productId: 'item-1', name: 'Burger', quantity: 2, unitAmountMinor: 18900, lineAmountMinor: 37800 }],
  subtotalMinor: 37800,
  totalMinor: 37800,
  paymentStatus: 'unpaid',
  createdAt: '2026-10-30T10:00:00.000Z',
  updatedAt: '2026-10-30T10:01:00.000Z',
};

describe('POS API contract guards', () => {
  it('accepts a well-formed menu item', () => {
    expect(isValidPosMenuItem(menuItem)).toBe(true);
  });

  it('rejects negative or fractional menu prices', () => {
    expect(isValidPosMenuItem({ ...menuItem, unitPriceCentavos: -1 })).toBe(false);
    expect(isValidPosMenuItem({ ...menuItem, unitPriceCentavos: 10.5 })).toBe(false);
  });

  it('accepts a well-formed online order snapshot', () => {
    expect(isValidPosOnlineOrder(order)).toBe(true);
  });

  it('rejects line totals inconsistent with quantity and unit price', () => {
    expect(isValidPosOnlineOrder({
      ...order,
      lines: [{ ...order.lines[0], lineAmountMinor: 1 }],
    })).toBe(false);
  });

  it('rejects a wrong contract version and empty lines', () => {
    expect(isValidPosOnlineOrder({ ...order, contractVersion: 'v2' as 'v1' })).toBe(false);
    expect(isValidPosOnlineOrder({ ...order, lines: [] })).toBe(false);
  });
});
