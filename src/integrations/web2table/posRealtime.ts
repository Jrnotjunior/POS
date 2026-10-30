import type { SupabaseClient } from '@supabase/supabase-js';

export type PosRealtimeStatus = 'connecting' | 'connected' | 'disconnected' | 'error';
type TenantChangePayload = Readonly<{ table?: unknown }>;
export type PosRealtimeTable = 'customer_orders' | 'pos_sales' | 'pos_cashier_shifts';

function isTenantChangePayload(value: unknown): value is TenantChangePayload & { table: PosRealtimeTable } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const table = (value as TenantChangePayload).table;
  return table === 'customer_orders' || table === 'pos_sales' || table === 'pos_cashier_shifts';
}

/**
 * Subscribe to metadata-only tenant broadcasts. Payloads are refresh signals,
 * never operational data; callers reload through the authorized POS API. Returns an idempotent cleanup function.
 */
export function subscribeToTenantOrderChanges(
  client: SupabaseClient,
  tenantId: string,
  onTableChange: (table: PosRealtimeTable) => void,
  onStatus: (status: PosRealtimeStatus) => void,
): () => void {
  if (!tenantId.trim()) {
    onStatus('error');
    return () => undefined;
  }

  let active = true;
  const channel = client.channel(`tenant:${tenantId}`, { config: { private: true } });
  channel
    .on('broadcast', { event: 'db_change' }, (message) => {
      if (active && isTenantChangePayload(message.payload)) onTableChange(message.payload.table);
    })
    .subscribe((status) => {
      if (!active) return;
      if (status === 'SUBSCRIBED') onStatus('connected');
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') onStatus('error');
      else if (status === 'CLOSED') onStatus('disconnected');
      else onStatus('connecting');
    });

  return () => {
    if (!active) return;
    active = false;
    void client.removeChannel(channel);
  };
}
