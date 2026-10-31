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
  role?: 'restaurant_owner' | 'cashier';
  permissions: readonly string[];
}>;

export type PosMenuItem = Readonly<{
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  description: string;
  imagePath?: string | null;
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

export type PosStaffOrder = Readonly<{
  id: string;
  order_number: number;
  tenant_id: string;
  branch_id: string;
  branch_name: string;
  order_type: 'delivery' | 'take_out' | 'pickup' | 'dine_in';
  customer_name: string;
  customer_phone: string;
  delivery_address: string | null;
  delivery_notes: string;
  subtotal_centavos: number;
  delivery_fee_centavos: number | null;
  total_centavos: number | null;
  order_status: string;
  payment_status: string;
  payment_method?: 'cash' | 'online';
  created_at: string;
  updated_at: string;
  items: readonly Readonly<{
    id: string;
    line_number: number;
    item_name: string;
    unit_price_centavos: number;
    quantity: number;
    line_total_centavos: number;
    options?: readonly Readonly<{ id?: string; name?: string; group_name?: string }>[];
  }>[];
}>;

export type PosStaffOrderAction = 'confirm' | 'reject' | 'cancel';

export function isValidPosStaffOrder(value: unknown): value is PosStaffOrder {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const order = value as Record<string, unknown>;
  return typeof order.id === 'string' && order.id.trim().length > 0
    && Number.isSafeInteger(order.order_number)
    && typeof order.tenant_id === 'string' && order.tenant_id.trim().length > 0
    && typeof order.branch_id === 'string' && order.branch_id.trim().length > 0
    && typeof order.branch_name === 'string'
    && ['delivery', 'take_out', 'pickup', 'dine_in'].includes(String(order.order_type))
    && typeof order.customer_name === 'string'
    && typeof order.customer_phone === 'string'
    && (order.delivery_address === null || typeof order.delivery_address === 'string')
    && typeof order.delivery_notes === 'string'
    && Number.isSafeInteger(order.subtotal_centavos) && Number(order.subtotal_centavos) >= 0
    && (order.delivery_fee_centavos === null || (Number.isSafeInteger(order.delivery_fee_centavos) && Number(order.delivery_fee_centavos) >= 0))
    && (order.total_centavos === null || (Number.isSafeInteger(order.total_centavos) && Number(order.total_centavos) >= 0))
    && typeof order.order_status === 'string'
    && typeof order.payment_status === 'string'
    && typeof order.created_at === 'string' && Number.isFinite(Date.parse(order.created_at))
    && typeof order.updated_at === 'string' && Number.isFinite(Date.parse(order.updated_at))
    && Array.isArray(order.items) && order.items.every((item) => {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) return false;
      const line = item as Record<string, unknown>;
      return typeof line.id === 'string' && Number.isSafeInteger(line.line_number)
        && typeof line.item_name === 'string'
        && Number.isSafeInteger(line.unit_price_centavos) && Number(line.unit_price_centavos) >= 0
        && Number.isSafeInteger(line.quantity) && Number(line.quantity) > 0
        && Number.isSafeInteger(line.line_total_centavos) && Number(line.line_total_centavos) >= 0;
    });
}

export type PosApiErrorCode =
  | 'POS_NOT_ENABLED'
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
    && (value.imagePath === undefined || value.imagePath === null || typeof value.imagePath === 'string')
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


export type PosFiscalTaxRegime = 'vat_registered' | 'non_vat' | 'other_requires_review';
export type PosFiscalStatus = 'draft' | 'pending_review' | 'authorized' | 'suspended';

export type PosFiscalProfileDraft = Readonly<{
  branchId: string;
  taxpayerRegisteredName: string;
  tradeName?: string | null;
  taxpayerTin: string;
  tinBranchCode: string;
  registeredAddress: string;
  taxRegime: PosFiscalTaxRegime;
  invoiceDocumentType: 'invoice';
  invoiceSeriesPrefix: string;
  softwareName: string;
  softwareVersion: string;
  machineOrTerminalIdentifier?: string | null;
}>;

export type PosFiscalProfile = Readonly<{
  id: string;
  tenant_id: string;
  branch_id: string;
  taxpayer_registered_name: string;
  trade_name: string | null;
  taxpayer_tin: string;
  tin_branch_code: string;
  registered_address: string;
  tax_regime: PosFiscalTaxRegime;
  invoice_document_type: 'invoice';
  invoice_series_prefix: string;
  fiscal_status: PosFiscalStatus;
  authorization_reference: string | null;
  authorization_effective_at: string | null;
  authorization_expires_at: string | null;
  authorized_at: string | null;
  software_name: string;
  software_version: string;
  machine_or_terminal_identifier: string | null;
  created_at: string;
  updated_at: string;
}>;

export function isValidPosFiscalProfile(value: unknown): value is PosFiscalProfile {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const profile = value as Record<string, unknown>;
  return typeof profile.id === 'string' && profile.id.trim().length > 0
    && typeof profile.tenant_id === 'string' && profile.tenant_id.trim().length > 0
    && typeof profile.branch_id === 'string' && profile.branch_id.trim().length > 0
    && typeof profile.taxpayer_registered_name === 'string' && profile.taxpayer_registered_name.trim().length >= 2
    && (profile.trade_name === null || typeof profile.trade_name === 'string')
    && typeof profile.taxpayer_tin === 'string' && /^[0-9]{9,12}$/.test(profile.taxpayer_tin)
    && typeof profile.tin_branch_code === 'string' && /^[0-9]{3}$/.test(profile.tin_branch_code)
    && typeof profile.registered_address === 'string' && profile.registered_address.trim().length >= 5
    && ['vat_registered', 'non_vat', 'other_requires_review'].includes(String(profile.tax_regime))
    && profile.invoice_document_type === 'invoice'
    && typeof profile.invoice_series_prefix === 'string' && /^[A-Z0-9-]{1,20}$/.test(profile.invoice_series_prefix)
    && ['draft', 'pending_review', 'authorized', 'suspended'].includes(String(profile.fiscal_status))
    && (profile.authorization_reference === null || typeof profile.authorization_reference === 'string')
    && (profile.authorization_effective_at === null || typeof profile.authorization_effective_at === 'string')
    && (profile.authorization_expires_at === null || typeof profile.authorization_expires_at === 'string')
    && (profile.authorized_at === null || typeof profile.authorized_at === 'string')
    && typeof profile.software_name === 'string' && profile.software_name.trim().length >= 2
    && typeof profile.software_version === 'string' && profile.software_version.trim().length > 0
    && (profile.machine_or_terminal_identifier === null || typeof profile.machine_or_terminal_identifier === 'string')
    && typeof profile.created_at === 'string' && Number.isFinite(Date.parse(profile.created_at))
    && typeof profile.updated_at === 'string' && Number.isFinite(Date.parse(profile.updated_at));
}

export type PosCashSaleRequest = Readonly<{
  branchId: string;
  idempotencyKey: string;
  cashTenderedCentavos: number;
  customerName: string | null;
  customerId: string | null;
  items: readonly Readonly<{ itemId: string; quantity: number }>[];
}>;

export type PosCashSaleLineSnapshot = Readonly<{
  line_number: number;
  item_name_snapshot: string;
  unit_price_centavos: number;
  quantity: number;
  line_total_centavos: number;
}>;

/** The create-sale response includes persisted line snapshots for reliable immediate receipt printing. */
export type PosCashSaleResult = Readonly<{
  id: string;
  sale_number: number;
  subtotal_centavos: number;
  total_centavos: number;
  payment_method: 'cash';
  payment_status: 'paid';
  cash_tendered_centavos: number;
  change_centavos: number;
  customer_name?: string | null;
  created_at: string;
  items: readonly PosCashSaleLineSnapshot[];
}>;

export type PosCashSaleHistoryItem = PosCashSaleResult;

export type PosLoyaltyCustomer = Readonly<{ customerId: string; displayName: string; phoneLastFour: string }>;

export type PosLoyaltyBalance = Readonly<{
  customerId: string;
  account: Readonly<{ points_balance: number; lifetime_points_earned: number; lifetime_points_redeemed: number; eligible_spend_centavos: number; updated_at: string | null }>;
  settings: Readonly<{ enabled: boolean; amount_threshold: number | null; points_awarded: number; redemption_enabled: boolean; redemption_points: number; redemption_amount: number | null }>;
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
