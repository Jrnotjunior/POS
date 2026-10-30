import type { SupabaseClient } from '@supabase/supabase-js';

export type PosRealtimeStatus = 'connecting' | 'connected' | 'disconnected' | 'error';
type TenantChangePayload = Readonly<{ table?: unknown }>;

function isTenantOrderChange(value: unknown): value is TenantChangePayload {
  return typeof value === 'object' && value !== null
    && (value as TenantChangePayload).table === 'customer_orders';
}

/**
 * Subscribe to the SaaS metadata-only tenant broadcast. Event payloads are
 * deliberately not used as order data; callers must reload through the
 * authorized POS API. Returns an idempotent cleanup function.
 */
export function subscribeToTenantOrderChanges(
  client: SupabaseClient,
  tenantId: string,
  onOrderChange: () => void,
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
      if (active && isTenantOrderChange(message.payload)) onOrderChange();
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
