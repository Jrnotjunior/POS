import {
  isValidPosMenuItem,
  type PosApiError,
  type PosMenuItem,
  type PosSessionContext,
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

  return {
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

const configuredBaseUrl = (import.meta.env.VITE_POS_API_BASE_URL?.trim() || `${import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''}/functions/v1/pos-api`).replace(/\\/$/, '');

/** Null means demo mode is selected; it does not imply a live API exists. */
export function createConfiguredPosApiClient(): ReturnType<typeof createPosApiClient> | null {
  return configuredBaseUrl && !configuredBaseUrl.startsWith('/functions') ? createPosApiClient({ baseUrl: configuredBaseUrl, getAccessToken: async () => {
    const { getCurrentAccessToken } = await import('./supabaseAuth');
    return getCurrentAccessToken();
  } }) : null;
}
