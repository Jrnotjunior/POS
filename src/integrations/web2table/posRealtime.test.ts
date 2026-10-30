import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { subscribeToTenantOrderChanges, type PosRealtimeStatus } from './posRealtime';

function makeRealtimeClient() {
  let onMessage: ((message: { payload: unknown }) => void) | undefined;
  let onSubscribe: ((status: string) => void) | undefined;
  const channel = {
    on: vi.fn((_type: string, _filter: unknown, callback: (message: { payload: unknown }) => void) => {
      onMessage = callback;
      return channel;
    }),
    subscribe: vi.fn((callback: (status: string) => void) => {
      onSubscribe = callback;
      return channel;
    }),
  };
  const client = {
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(async () => 'ok'),
  } as unknown as SupabaseClient;
  return {
    client,
    channel,
    emit: (payload: unknown) => onMessage?.({ payload }),
    setStatus: (status: string) => onSubscribe?.(status),
  };
}

describe('POS tenant order realtime adapter', () => {
  it('subscribes to a private tenant channel and only signals customer order changes', () => {
    const realtime = makeRealtimeClient();
    const onOrderChange = vi.fn();
    const onStatus = vi.fn<(status: PosRealtimeStatus) => void>();

    subscribeToTenantOrderChanges(realtime.client, 'tenant-123', onOrderChange, onStatus);

    expect(realtime.client.channel).toHaveBeenCalledWith('tenant:tenant-123', { config: { private: true } });
    expect(realtime.channel.on).toHaveBeenCalledWith('broadcast', { event: 'db_change' }, expect.any(Function));

    realtime.emit({ table: 'menu_items', operation: 'UPDATE' });
    realtime.emit({ table: 'delivery_assignments', operation: 'UPDATE' });
    expect(onOrderChange).not.toHaveBeenCalled();

    realtime.emit({ table: 'customer_orders', operation: 'INSERT' });
    realtime.emit({ table: 'customer_orders', operation: 'UPDATE' });
    expect(onOrderChange).toHaveBeenCalledTimes(2);
  });

  it('maps subscription statuses and cleans up without handling late events', () => {
    const realtime = makeRealtimeClient();
    const onOrderChange = vi.fn();
    const onStatus = vi.fn<(status: PosRealtimeStatus) => void>();
    const unsubscribe = subscribeToTenantOrderChanges(realtime.client, 'tenant-123', onOrderChange, onStatus);

    realtime.setStatus('SUBSCRIBED');
    realtime.setStatus('CHANNEL_ERROR');
    realtime.setStatus('CLOSED');
    expect(onStatus.mock.calls.map(([status]) => status)).toEqual(['connected', 'error', 'disconnected']);

    unsubscribe();
    unsubscribe();
    expect(realtime.client.removeChannel).toHaveBeenCalledTimes(1);
    realtime.emit({ table: 'customer_orders', operation: 'INSERT' });
    realtime.setStatus('SUBSCRIBED');
    expect(onOrderChange).not.toHaveBeenCalled();
    expect(onStatus).toHaveBeenCalledTimes(3);
  });

  it('does not subscribe without a tenant ID', () => {
    const realtime = makeRealtimeClient();
    const onStatus = vi.fn<(status: PosRealtimeStatus) => void>();
    const unsubscribe = subscribeToTenantOrderChanges(realtime.client, ' ', vi.fn(), onStatus);

    expect(realtime.client.channel).not.toHaveBeenCalled();
    expect(onStatus).toHaveBeenCalledWith('error');
    unsubscribe();
  });
});
