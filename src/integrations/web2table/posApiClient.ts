import {
  isValidPosMenuItem,
  isValidPosStaffOrder,
  isValidPosFiscalProfile,
  type PosStaffOrder,
  type PosStaffOrderAction,
  type PosApiError,
  type PosCashSaleHistoryItem,
  type PosCashSaleRequest,
  type PosLoyaltyBalance,
  type PosCashSaleResult,
  type PosCashierShift,
  type PosClosedShift,
  type PosMenuItem,
  type PosSessionContext,
  type PosFiscalProfile,
  type PosFiscalProfileDraft,
} from './posApiContract';

export type PosApiClientOptions = Readonly<{
  baseUrl: string;
  fetcher?: typeof fetch;
  getAccessToken?: () => Promise<string | null>;
}>;

export class PosApiClientError extends Error {
  readonly status: number;
  readonly code: PosApiError['code'] | 'INVALID_RESPONSE';

  constructor(message: string, status: number, code: PosApiError['code'] | 'INVALID_RESPONSE') {
    super(message);
    this.name = 'PosApiClientError';
    this.status = status;
    this.code = code;
  }
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error('POS API base URL is not configured.');
  return trimmed.replace(/\/+$/, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSessionContext(value: unknown): value is PosSessionContext {
  if (!isRecord(value)) return false;
  return typeof value.userId === 'string' && value.userId.trim().length > 0
    && typeof value.displayName === 'string' && value.displayName.trim().length > 0
    && typeof value.tenantId === 'string' && value.tenantId.trim().length > 0
    && typeof value.tenantName === 'string' && value.tenantName.trim().length > 0
    && typeof value.branchId === 'string' && value.branchId.trim().length > 0
    && typeof value.branchName === 'string' && value.branchName.trim().length > 0
    && (value.role === undefined || value.role === 'restaurant_owner' || value.role === 'cashier')
    && Array.isArray(value.permissions)
    && value.permissions.every((permission) => typeof permission === 'string');
}

async function readError(response: Response): Promise<PosApiClientError> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (isRecord(body) && isRecord(body.error)) {
    const error = body.error as unknown as Partial<PosApiError>;
    const allowedCodes: PosApiError['code'][] = [
      'UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'VALIDATION_ERROR',
      'CONFLICT', 'RATE_LIMITED', 'INTERNAL_ERROR',
    ];
    if (typeof error.message === 'string') {
      const code = allowedCodes.includes(error.code as PosApiError['code'])
        ? error.code as PosApiError['code']
        : 'INTERNAL_ERROR';
      return new PosApiClientError(error.message, response.status, code);
    }
  }

  return new PosApiClientError(
    response.status === 401
      ? 'Please sign in to access the POS.'
      : response.status === 403
        ? 'Your account is not authorized to access this POS resource.'
        : 'The POS service could not complete the request.',
    response.status,
    response.status === 401 ? 'UNAUTHENTICATED' : response.status === 403 ? 'FORBIDDEN' : 'INTERNAL_ERROR',
  );
}

/**
 * Client for the trusted POS API. Session identity and branch access are always
 * resolved by the server; callers must not supply tenant IDs as authorization.
 */
export function createPosApiClient(options: PosApiClientOptions) {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const fetcher = options.fetcher ?? fetch;
  const getAccessToken = options.getAccessToken ?? (async () => null);

  async function getJson(path: string): Promise<unknown> {
    const accessToken = await getAccessToken();
    if (!accessToken) throw new PosApiClientError('Sign in to Web2table and complete MFA to access the POS.', 401, 'UNAUTHENTICATED');
    const response = await fetcher(`${baseUrl}${path}`, {
      method: 'GET',
      credentials: 'omit',
      headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw await readError(response);
    try {
      return await response.json() as unknown;
    } catch {
      throw new PosApiClientError('The POS service returned invalid JSON.', response.status, 'INVALID_RESPONSE');
    }
  }

  async function postJson(path: string, body: Record<string, unknown>): Promise<unknown> {
    const accessToken = await getAccessToken();
    if (!accessToken) throw new PosApiClientError('Sign in to Web2table and complete MFA to access the POS.', 401, 'UNAUTHENTICATED');
    const response = await fetcher(`${baseUrl}${path}`, {
      method: 'POST',
      credentials: 'omit',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw await readError(response);
    try { return await response.json() as unknown; }
    catch { throw new PosApiClientError('The POS service returned invalid JSON.', response.status, 'INVALID_RESPONSE'); }
  }

  return {
    async getLoyaltyBalance(branchId: string, customerUserId: string): Promise<PosLoyaltyBalance> {
      if (!branchId.trim() || !customerUserId.trim()) {
        throw new PosApiClientError('A branch and customer identity are required.', 400, 'VALIDATION_ERROR');
      }
      const payload = await getJson('/api/pos/v1/loyalty/balance?branchId=' + encodeURIComponent(branchId) + '&customerUserId=' + encodeURIComponent(customerUserId));
      const data = isRecord(payload) && 'data' in payload ? payload.data : payload;
      if (!isRecord(data) || data.customerUserId !== customerUserId || !isRecord(data.account) || !isRecord(data.settings)
        || !Number.isSafeInteger(data.account.points_balance) || Number(data.account.points_balance) < 0
        || !Number.isSafeInteger(data.account.lifetime_points_earned) || Number(data.account.lifetime_points_earned) < 0
        || !Number.isSafeInteger(data.account.lifetime_points_redeemed) || Number(data.account.lifetime_points_redeemed) < 0
        || !Number.isSafeInteger(data.account.eligible_spend_centavos) || Number(data.account.eligible_spend_centavos) < 0
        || typeof data.settings.enabled !== 'boolean' || typeof data.settings.redemption_enabled !== 'boolean'
        || !Number.isSafeInteger(data.settings.points_awarded) || Number(data.settings.points_awarded) < 0
        || !Number.isSafeInteger(data.settings.redemption_points) || Number(data.settings.redemption_points) < 0) {
        throw new PosApiClientError('The POS service returned an invalid loyalty balance response.', 502, 'INVALID_RESPONSE');
      }
      return data as unknown as PosLoyaltyBalance;
    },

    async getCashierShift(branchId: string): Promise<PosCashierShift> {
      if (!branchId.trim()) throw new Error('A server-authorized branch context is required.');
      const payload = await getJson(`/api/pos/v1/shift?branchId=${encodeURIComponent(branchId)}`);
      const data = isRecord(payload) && 'data' in payload ? payload.data : payload;
      if (!isRecord(data) || typeof data.active !== 'boolean'
        || (data.active && (typeof data.id !== 'string' || data.status !== 'open'
          || !Number.isSafeInteger(data.opening_cash_centavos)
          || !Number.isSafeInteger(data.expected_cash_centavos)))) {
        throw new PosApiClientError('The POS service returned an invalid shift response.', 502, 'INVALID_RESPONSE');
      }
      return data as unknown as PosCashierShift;
    },

    async openCashierShift(branchId: string, openingCashCentavos: number): Promise<PosCashierShift> {
      if (!branchId.trim() || !Number.isSafeInteger(openingCashCentavos) || openingCashCentavos < 0) {
        throw new PosApiClientError('Enter a valid opening cash amount.', 400, 'VALIDATION_ERROR');
      }
      const payload = await postJson('/api/pos/v1/shift/open', { branchId, openingCashCentavos });
      const data = isRecord(payload) && 'data' in payload ? payload.data : payload;
      if (!isRecord(data) || typeof data.id !== 'string' || data.status !== 'open'
        || !Number.isSafeInteger(data.opening_cash_centavos)) {
        throw new PosApiClientError('The POS service returned an invalid shift confirmation.', 502, 'INVALID_RESPONSE');
      }
      return { ...data, active: true } as unknown as PosCashierShift;
    },

    async closeCashierShift(branchId: string, countedCashCentavos: number, closeNote = ''): Promise<PosClosedShift> {
      if (!branchId.trim() || !Number.isSafeInteger(countedCashCentavos) || countedCashCentavos < 0) {
        throw new PosApiClientError('Enter a valid counted cash amount.', 400, 'VALIDATION_ERROR');
      }
      const payload = await postJson('/api/pos/v1/shift/close', { branchId, countedCashCentavos, closeNote });
      const data = isRecord(payload) && 'data' in payload ? payload.data : payload;
      if (!isRecord(data) || typeof data.id !== 'string' || data.status !== 'closed'
        || !Number.isSafeInteger(data.expected_cash_centavos)
        || !Number.isSafeInteger(data.counted_cash_centavos)
        || !Number.isSafeInteger(data.cash_variance_centavos)) {
        throw new PosApiClientError('The POS service returned an invalid shift close confirmation.', 502, 'INVALID_RESPONSE');
      }
      return data as unknown as PosClosedShift;
    },

    async createCashSale(request: PosCashSaleRequest): Promise<PosCashSaleResult> {
      const accessToken = await getAccessToken();
      if (!accessToken) throw new PosApiClientError('Sign in to Web2table and complete MFA to access the POS.', 401, 'UNAUTHENTICATED');
      if (!request.branchId.trim() || !request.idempotencyKey.trim() || !Number.isSafeInteger(request.cashTenderedCentavos) || request.cashTenderedCentavos < 1 || request.items.length < 1 || request.items.length > 50 || !request.items.every((item) => typeof item.itemId === 'string' && item.itemId.trim().length > 0 && Number.isSafeInteger(item.quantity) && item.quantity >= 1 && item.quantity <= 100)) {
        throw new PosApiClientError('Check the cash received and sale items before submitting.', 400, 'VALIDATION_ERROR');
      }
      const response = await fetcher(`${baseUrl}/api/pos/v1/sales`, {
        method: 'POST',
        credentials: 'omit',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(request),
      });
      if (!response.ok) throw await readError(response);
      let payload: unknown;
      try { payload = await response.json() as unknown; }
      catch { throw new PosApiClientError('The POS service returned invalid JSON.', response.status, 'INVALID_RESPONSE'); }
      const data = isRecord(payload) && 'data' in payload ? payload.data : payload;
      if (!isRecord(data) || typeof data.id !== 'string' || !Number.isSafeInteger(data.sale_number) || !Number.isSafeInteger(data.total_centavos) || !Number.isSafeInteger(data.cash_tendered_centavos) || !Number.isSafeInteger(data.change_centavos)
        || !Array.isArray(data.items) || data.items.length === 0 || !data.items.every((item) => isRecord(item)
          && Number.isSafeInteger(item.line_number) && Number(item.line_number) > 0
          && typeof item.item_name_snapshot === 'string' && item.item_name_snapshot.trim().length > 0
          && Number.isSafeInteger(item.unit_price_centavos) && Number(item.unit_price_centavos) >= 0
          && Number.isSafeInteger(item.quantity) && Number(item.quantity) > 0
          && Number.isSafeInteger(item.line_total_centavos) && Number(item.line_total_centavos) >= 0)) {
        throw new PosApiClientError('The POS service returned an invalid sale confirmation or persisted receipt lines.', 502, 'INVALID_RESPONSE');
      }
      return data as unknown as PosCashSaleResult;
    },

    async getBranchSales(branchId: string, limit = 50): Promise<PosCashSaleHistoryItem[]> {
      if (!branchId.trim()) throw new Error('A server-authorized branch context is required.');
      const payload = await getJson(`/api/pos/v1/branches/${encodeURIComponent(branchId)}/sales?limit=${Math.max(1, Math.min(100, Math.trunc(limit)))}`);
      const items = isRecord(payload) && 'data' in payload ? payload.data : payload;
      if (!Array.isArray(items) || !items.every((sale) => isRecord(sale) && typeof sale.id === 'string' && Number.isSafeInteger(sale.sale_number) && Array.isArray(sale.items))) {
        throw new PosApiClientError('The POS service returned an invalid sales history response.', 502, 'INVALID_RESPONSE');
      }
      return items as PosCashSaleHistoryItem[];
    },

    async getStaffOrders(branchId: string, filter: 'active' | 'all' = 'active'): Promise<PosStaffOrder[]> {
      if (!branchId.trim()) throw new Error('A server-authorized branch context is required.');
      const payload = await getJson(`/api/pos/v1/orders?branchId=${encodeURIComponent(branchId)}&filter=${filter}`);
      const data = isRecord(payload) && 'data' in payload ? payload.data : payload;
      const orders = isRecord(data) && Array.isArray(data.orders) ? data.orders : data;
      if (!Array.isArray(orders) || !orders.every(isValidPosStaffOrder)) {
        throw new PosApiClientError('The POS service returned an invalid order queue response.', 502, 'INVALID_RESPONSE');
      }
      return orders as PosStaffOrder[];
    },

    async transitionStaffOrder(branchId: string, orderId: string, action: PosStaffOrderAction): Promise<void> {
      if (!branchId.trim() || !orderId.trim() || !['confirm', 'reject', 'cancel'].includes(action)) {
        throw new PosApiClientError('The order action is invalid.', 400, 'VALIDATION_ERROR');
      }
      const payload = await postJson('/api/pos/v1/orders/transition', { branchId, orderId, action });
      const data = isRecord(payload) && 'data' in payload ? payload.data : payload;
      if (!isRecord(data) || data.success !== true || data.order_id !== orderId) {
        throw new PosApiClientError('The POS service returned an invalid order action confirmation.', 502, 'INVALID_RESPONSE');
      }
    },

    async getFiscalProfile(branchId: string): Promise<PosFiscalProfile | null> {
      if (!branchId.trim()) throw new Error('A server-authorized branch context is required.');
      const payload = await getJson(`/api/pos/v1/fiscal-profile?branchId=${encodeURIComponent(branchId)}`);
      const data = isRecord(payload) && 'data' in payload ? payload.data : payload;
      if (data === null) return null;
      if (!isValidPosFiscalProfile(data) || data.branch_id !== branchId) {
        throw new PosApiClientError('The POS service returned an invalid fiscal profile.', 502, 'INVALID_RESPONSE');
      }
      return data;
    },

    async saveFiscalProfile(draft: PosFiscalProfileDraft): Promise<PosFiscalProfile> {
      if (!draft.branchId.trim()) throw new PosApiClientError('A server-authorized branch context is required.', 400, 'VALIDATION_ERROR');
      const payload = await postJson('/api/pos/v1/fiscal-profile', draft as unknown as Record<string, unknown>);
      const data = isRecord(payload) && 'data' in payload ? payload.data : payload;
      if (!isValidPosFiscalProfile(data) || data.branch_id !== draft.branchId || data.fiscal_status !== 'draft') {
        throw new PosApiClientError('The POS service returned an invalid fiscal profile save confirmation.', 502, 'INVALID_RESPONSE');
      }
      return data;
    },

    async getSession(): Promise<PosSessionContext> {
      const payload = await getJson('/api/pos/v1/session');
      const context = isRecord(payload) && 'data' in payload ? payload.data : payload;
      if (!isSessionContext(context)) {
        throw new PosApiClientError('The POS service returned an invalid session context.', 502, 'INVALID_RESPONSE');
      }
      return context;
    },

    async getBranchMenu(branchId: string): Promise<PosMenuItem[]> {
      if (!branchId.trim()) throw new Error('A server-authorized branch context is required.');
      const payload = await getJson(`/api/pos/v1/branches/${encodeURIComponent(branchId)}/menu`);
      const items = isRecord(payload) && 'data' in payload ? payload.data : payload;
      if (!Array.isArray(items) || !items.every((item) => isRecord(item) && isValidPosMenuItem(item as unknown as PosMenuItem))) {
        throw new PosApiClientError('The POS service returned an invalid menu response.', 502, 'INVALID_RESPONSE');
      }
      return items as PosMenuItem[];
    },
  };
}

const configuredBaseUrl = (import.meta.env.VITE_POS_API_BASE_URL?.trim() || `${import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''}/functions/v1/pos-api`).replace(/\/$/, '');

/** Null means demo mode is selected; it does not imply a live API exists. */
export function createConfiguredPosApiClient(): ReturnType<typeof createPosApiClient> | null {
  return configuredBaseUrl && !configuredBaseUrl.startsWith('/functions') ? createPosApiClient({ baseUrl: configuredBaseUrl, getAccessToken: async () => {
    const { getCurrentAccessToken } = await import('./supabaseAuth');
    return getCurrentAccessToken();
  } }) : null;
}
