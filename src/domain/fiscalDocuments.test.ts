import { describe, expect, it } from 'vitest';
import { renderCashReceiptHtml, renderXReadingHtml, renderZReadingHtml } from './fiscalDocuments';
import type { PosCashSaleHistoryItem, PosCashierShift, PosClosedShift } from '../integrations/web2table/posApiContract';

const sale: PosCashSaleHistoryItem = {
  id: 'sale-1', sale_number: 1, subtotal_centavos: 15000, total_centavos: 15000,
  payment_method: 'cash', payment_status: 'paid', cash_tendered_centavos: 20000,
  change_centavos: 5000, created_at: '2026-10-31T10:00:00.000Z',
  items: [{ line_number: 1, item_name_snapshot: '<script>alert(1)</script>', unit_price_centavos: 15000, quantity: 1, line_total_centavos: 15000 }],
};
const context = { sellerName: 'Sample Restaurant', branchName: 'Main Branch', cashierName: 'Staff Member', generatedAt: '2026-10-31T10:05:00.000Z' };

describe('fiscal document safety gate', () => {
  it('prints a clearly non-tax operational receipt and escapes user-controlled text', () => {
    const html = renderCashReceiptHtml(sale, sale.items, context);
    expect(html).toContain('NOT A TAX INVOICE');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('150.00');
    expect(html).toContain('200.00');
  });

  it('prints X reading preview only for an active shift', () => {
    const shift: PosCashierShift = { active: true, id: 'shift-1', status: 'open', opening_cash_centavos: 50000, cash_sales_centavos: 15000, expected_cash_centavos: 65000, opened_at: '2026-10-31T09:00:00.000Z' };
    expect(renderXReadingHtml(shift, context)).toContain('NOT A BIR FISCAL READING');
    expect(() => renderXReadingHtml({ active: false }, context)).toThrow();
  });

  it('prints Z operational close only for a closed shift', () => {
    const shift: PosClosedShift = { id: 'shift-1', status: 'closed', opening_cash_centavos: 50000, expected_cash_centavos: 65000, counted_cash_centavos: 64000, cash_variance_centavos: -1000, opened_at: '2026-10-31T09:00:00.000Z', closed_at: '2026-10-31T17:00:00.000Z', close_note: null };
    expect(renderZReadingHtml(shift, context)).toContain('OPERATIONAL REPORT — NOT A BIR FISCAL READING');
    expect(() => renderZReadingHtml({ ...shift, status: 'open' } as unknown as PosClosedShift, context)).toThrow();
  });
});
