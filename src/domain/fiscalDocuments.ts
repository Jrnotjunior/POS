import { formatPhp, moneyFromCentavos } from './money';
import type { PosCashSaleHistoryItem, PosCashSaleResult, PosCashierShift, PosClosedShift } from '../integrations/web2table/posApiContract';

type ReceiptSale = PosCashSaleHistoryItem | PosCashSaleResult;

export type ReceiptContext = Readonly<{
  sellerName: string;
  branchName: string;
  cashierName: string;
}>;

export type ShiftReportContext = Readonly<{
  sellerName: string;
  branchName: string;
  cashierName: string;
  generatedAt?: string;
}>;

export function escapeReceiptHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character);
}

function documentShell(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeReceiptHtml(title)}</title><style>
    @page{margin:8mm}*{box-sizing:border-box}body{font:12px/1.45 Arial,sans-serif;color:#111;max-width:340px;margin:0 auto;padding:8px}
    h1,h2,p{text-align:center;margin:5px 0}h1{font-size:18px}h2{font-size:14px}table{width:100%;border-collapse:collapse;margin:12px 0}
    th,td{padding:5px 0;border-bottom:1px dashed #aaa;text-align:left;vertical-align:top}th:last-child,td:last-child{text-align:right;white-space:nowrap}
    .muted{font-size:10px;color:#444}.total{font-weight:bold;font-size:16px;border-top:1px solid #111;padding-top:8px}
    .warning{border:1px solid #111;padding:8px;margin:12px 0;font-weight:bold;text-align:center;font-size:11px}
    .row{display:flex;justify-content:space-between;gap:12px;margin:5px 0}.row span:last-child{text-align:right}
    .left{text-align:left} .rule{border-top:1px dashed #777;margin:10px 0}
    @media print{body{margin:0;padding:0;max-width:none}}
  </style></head><body>${body}</body></html>`;
}

/**
 * Operational payment receipt only. It deliberately cannot be mistaken for an
 * approved tax invoice while taxpayer registration, approved numbering, tax,
 * machine/software and permit details are not available in the POS contract.
 */
export function renderCashReceiptHtml(
  sale: ReceiptSale,
  items: PosCashSaleHistoryItem['items'] | readonly PosCashSaleHistoryItem['items'][number][],
  context: ReceiptContext,
): string {
  const rows = items.map((item) => `<tr><td>${escapeReceiptHtml(item.item_name_snapshot)}<br><span class="muted">${item.quantity} × ${formatPhp(moneyFromCentavos(item.unit_price_centavos))}</span></td><td>${formatPhp(moneyFromCentavos(item.line_total_centavos))}</td></tr>`).join('');
  const saleNumber = `POS-${String(sale.sale_number).padStart(6, '0')}`;
  const body = `<h1>Web2table</h1><p>${escapeReceiptHtml(context.sellerName)}</p><p>${escapeReceiptHtml(context.branchName)}</p>
    <div class="warning">NOT A TAX INVOICE<br><span class="muted">Taxpayer/BIR configuration and authorization are not yet verified.</span></div>
    <h2>Cash Sales Receipt</h2><p>${saleNumber}</p><p class="muted">${escapeReceiptHtml(new Date(sale.created_at).toLocaleString())}</p>
    <p class="muted">Cashier: ${escapeReceiptHtml(context.cashierName)}</p><table><thead><tr><th>Item</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="row"><span>Subtotal</span><span>${formatPhp(moneyFromCentavos(sale.subtotal_centavos))}</span></div>
    <div class="row total"><span>Total paid</span><span>${formatPhp(moneyFromCentavos(sale.total_centavos))}</span></div>
    <div class="row"><span>Cash received</span><span>${formatPhp(moneyFromCentavos(sale.cash_tendered_centavos))}</span></div>
    <div class="row"><span>Change</span><span>${formatPhp(moneyFromCentavos(sale.change_centavos))}</span></div>
    <div class="rule"></div><p>Thank you!</p><p class="muted">Operational payment record only. Do not use as a substitute for the taxpayer's authorized invoice.</p>`;
  return documentShell(`Cash receipt ${saleNumber}`, body);
}

function reportFrame(title: string, lines: readonly Readonly<{ label: string; value: string }>[], context: ShiftReportContext, generatedAt: string): string {
  const rows = lines.map((line) => `<div class="row"><span>${escapeReceiptHtml(line.label)}</span><strong>${escapeReceiptHtml(line.value)}</strong></div>`).join('');
  const body = `<h1>Web2table</h1><p>${escapeReceiptHtml(context.sellerName)}</p><p>${escapeReceiptHtml(context.branchName)}</p>
    <div class="warning">OPERATIONAL REPORT — NOT A BIR FISCAL READING</div><h2>${escapeReceiptHtml(title)}</h2>
    <p class="muted">Cashier: ${escapeReceiptHtml(context.cashierName)}</p><p class="muted">Generated: ${escapeReceiptHtml(new Date(generatedAt).toLocaleString())}</p>
    <div class="rule"></div>${rows}<div class="rule"></div>
    <p class="muted">Fiscal totals, tax breakdowns, invoice sequence and required taxpayer/machine authorization data are not yet configured. This report must not be represented as an approved X/Z reading.</p>`;
  return documentShell(title, body);
}

export function renderXReadingHtml(shift: PosCashierShift, context: ShiftReportContext): string {
  if (!shift.active || !shift.id) throw new Error('An active cashier shift is required for an X reading.');
  const generatedAt = context.generatedAt ?? new Date().toISOString();
  return reportFrame('X Reading — Operational Preview', [
    { label: 'Shift ID', value: shift.id },
    { label: 'Opened at', value: shift.opened_at ? new Date(shift.opened_at).toLocaleString() : 'Unavailable' },
    { label: 'Opening cash', value: formatPhp(moneyFromCentavos(shift.opening_cash_centavos ?? 0)) },
    { label: 'Recorded cash sales', value: formatPhp(moneyFromCentavos(shift.cash_sales_centavos ?? 0)) },
    { label: 'Expected cash', value: formatPhp(moneyFromCentavos(shift.expected_cash_centavos ?? shift.opening_cash_centavos ?? 0)) },
    { label: 'Reading type', value: 'Non-resetting preview' },
  ], context, generatedAt);
}

export function renderZReadingHtml(shift: PosClosedShift, context: ShiftReportContext): string {
  if (shift.status !== 'closed') throw new Error('A closed cashier shift is required for a Z reading.');
  const generatedAt = context.generatedAt ?? new Date().toISOString();
  return reportFrame('Z Reading — Operational Preview', [
    { label: 'Shift ID', value: shift.id },
    { label: 'Opened at', value: new Date(shift.opened_at).toLocaleString() },
    { label: 'Closed at', value: new Date(shift.closed_at).toLocaleString() },
    { label: 'Opening cash', value: formatPhp(moneyFromCentavos(shift.opening_cash_centavos)) },
    { label: 'Expected cash', value: formatPhp(moneyFromCentavos(shift.expected_cash_centavos)) },
    { label: 'Counted cash', value: formatPhp(moneyFromCentavos(shift.counted_cash_centavos)) },
    { label: 'Cash variance', value: formatPhp(moneyFromCentavos(shift.cash_variance_centavos)) },
    { label: 'Reading type', value: 'Non-fiscal operational close' },
  ], context, generatedAt);
}
