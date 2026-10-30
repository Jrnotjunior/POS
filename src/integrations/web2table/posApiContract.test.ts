import { describe, expect, it } from 'vitest';
import { isValidPosMenuItem, isValidPosOnlineOrder, isValidPosStaffOrder, type PosOnlineOrderSnapshot } from './posApiContract';

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

const staffOrder = {
  id: 'order-1',
  order_number: 101,
  tenant_id: 'tenant-1',
  branch_id: 'branch-1',
  branch_name: 'Main branch',
  order_type: 'pickup' as const,
  customer_name: 'Guest Customer',
  customer_phone: '09123456789',
  delivery_address: null,
  delivery_notes: '',
  subtotal_centavos: 37800,
  delivery_fee_centavos: 0,
  total_centavos: 37800,
  order_status: 'pending_confirmation',
  payment_status: 'unpaid',
  payment_method: 'cash' as const,
  created_at: '2026-10-30T10:00:00.000Z',
  updated_at: '2026-10-30T10:01:00.000Z',
  items: [{
    id: 'line-1',
    line_number: 1,
    item_name: 'Burger',
    unit_price_centavos: 18900,
    quantity: 2,
    line_total_centavos: 37800,
    options: [],
  }],
};

describe('POS API contract guards', () => {
  it('accepts a well-formed menu item', () => {
    expect(isValidPosMenuItem(menuItem)).toBe(true);
  });

  it('rejects negative or fractional menu prices', () => {
    expect(isValidPosMenuItem({ ...menuItem, unitPriceCentavos: -1 })).toBe(false);
    expect(isValidPosMenuItem({ ...menuItem, unitPriceCentavos: 10.5 })).toBe(false);
  });

  it('accepts a well-formed staff order queue record', () => {
    expect(isValidPosStaffOrder(staffOrder)).toBe(true);
  });

  it('rejects malformed staff order records and invalid line quantities', () => {
    expect(isValidPosStaffOrder({ ...staffOrder, branch_id: '' })).toBe(false);
    expect(isValidPosStaffOrder({ ...staffOrder, items: [{ ...staffOrder.items[0], quantity: 0 }] })).toBe(false);
    expect(isValidPosStaffOrder({ ...staffOrder, total_centavos: -1 })).toBe(false);
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
