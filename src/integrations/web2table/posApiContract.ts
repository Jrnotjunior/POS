export const POS_API_VERSION = 'v1' as const;

export type PosFulfillmentType = 'delivery' | 'pickup' | 'takeout' | 'dine_in';
export type PosOrderSource = 'web2table_online' | 'web2table_qr';
export type PosPaymentStatus = 'unpaid' | 'pending' | 'paid' | 'partially_refunded' | 'refunded' | 'failed';

export type PosSessionContext = Readonly<{
  userId: string;
  displayName: string;
  tenantId: string;
  tenantName: string;
  branchId: string;
  branchName: string;
  permissions: readonly string[];
}>;

export type PosMenuItem = Readonly<{
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  description: string;
  unitPriceCentavos: number;
  available: boolean;
}>;

export type PosOrderLineSnapshot = Readonly<{
  productId: string;
  name: string;
  quantity: number;
  unitAmountMinor: number;
  lineAmountMinor: number;
}>;

export type PosOnlineOrderSnapshot = Readonly<{
  contractVersion: typeof POS_API_VERSION;
  externalOrderId: string;
  tenantId: string;
  branchId: string;
  source: PosOrderSource;
  fulfillmentType: PosFulfillmentType;
  currency: 'PHP';
  lines: readonly PosOrderLineSnapshot[];
  subtotalMinor: number;
  totalMinor: number;
  paymentStatus: PosPaymentStatus;
  createdAt: string;
  updatedAt: string;
}>;

export type PosApiErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

export type PosApiError = Readonly<{
  code: PosApiErrorCode;
  message: string;
  requestId: string;
}>;

export function isNonNegativeSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function isValidPosMenuItem(value: PosMenuItem): boolean {
  return Boolean(value.id.trim())
    && Boolean(value.categoryId.trim())
    && Boolean(value.categoryName.trim())
    && Boolean(value.name.trim())
    && isNonNegativeSafeInteger(value.unitPriceCentavos)
    && typeof value.available === 'boolean';
}

/** Shape validation only. Trusted API must independently authorize and validate source data. */
export function isValidPosOnlineOrder(value: PosOnlineOrderSnapshot): boolean {
  if (value.contractVersion !== POS_API_VERSION) return false;
  if (!value.externalOrderId.trim() || !value.tenantId.trim() || !value.branchId.trim()) return false;
  if (!['web2table_online', 'web2table_qr'].includes(value.source)) return false;
  if (!['delivery', 'pickup', 'takeout', 'dine_in'].includes(value.fulfillmentType)) return false;
  if (value.currency !== 'PHP' || value.lines.length === 0) return false;
  if (!isNonNegativeSafeInteger(value.subtotalMinor) || !isNonNegativeSafeInteger(value.totalMinor)) return false;
  if (!Number.isFinite(Date.parse(value.createdAt)) || !Number.isFinite(Date.parse(value.updatedAt))) return false;

  return value.lines.every((line) =>
    Boolean(line.productId.trim())
    && Boolean(line.name.trim())
    && Number.isSafeInteger(line.quantity) && line.quantity > 0
    && isNonNegativeSafeInteger(line.unitAmountMinor)
    && isNonNegativeSafeInteger(line.lineAmountMinor)
    && line.lineAmountMinor === line.unitAmountMinor * line.quantity
  );
}

export type PosCashSaleRequest = Readonly<{
  branchId: string;
  idempotencyKey: string;
  cashTenderedCentavos: number;
  items: readonly Readonly<{ itemId: string; quantity: number }>[];
}>;

export type PosCashSaleResult = Readonly<{
  id: string;
  sale_number: number;
  subtotal_centavos: number;
  total_centavos: number;
  payment_method: 'cash';
  payment_status: 'paid';
  cash_tendered_centavos: number;
  change_centavos: number;
  created_at: string;
}>;

export type PosCashSaleHistoryItem = PosCashSaleResult & Readonly<{
  items: readonly Readonly<{
    line_number: number;
    item_name_snapshot: string;
    unit_price_centavos: number;
    quantity: number;
    line_total_centavos: number;
  }>[];
}>;

export type PosCashierShift = Readonly<{
  active: boolean;
  id?: string;
  status?: 'open' | 'closed';
  opening_cash_centavos?: number;
  cash_sales_centavos?: number;
  expected_cash_centavos?: number;
  counted_cash_centavos?: number;
  cash_variance_centavos?: number;
  opened_at?: string;
  closed_at?: string;
  close_note?: string | null;
}>;

export type PosClosedShift = Readonly<{
  id: string;
  status: 'closed';
  opening_cash_centavos: number;
  expected_cash_centavos: number;
  counted_cash_centavos: number;
  cash_variance_centavos: number;
  opened_at: string;
  closed_at: string;
  close_note: string | null;
}>;
