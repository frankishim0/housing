'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { Realtime } from 'ably';

type Notification = { id: string; type: string; message: string; read: boolean; createdAt: string };

export function NotificationCenter() {
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    const response = await fetch('/api/notifications', { cache: 'no-store' });
    if (response.status === 401) return;
    const result = await response.json();
    if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Could not load notifications.');
    setItems(result.data as Notification[]);
    setUnread(result.unread as number);
  }, []);

  useEffect(() => {
    let realtime: Realtime | undefined;
    let cancelled = false;
    const refreshSafe = () => void refresh().catch((loadError) => {
      if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Could not load notifications.');
    });
    refreshSafe();
    const interval = window.setInterval(refreshSafe, 30_000);
    void fetch('/api/realtime/auth', { cache: 'no-store' }).then(async (response) => {
      if (!response.ok || cancelled) return;
      const accountResponse = await fetch('/api/auth/me', { cache: 'no-store' });
      if (!accountResponse.ok || cancelled) return;
      const account = await accountResponse.json();
      const userId = account.user?.id as string | undefined;
      if (!userId || cancelled) return;
      realtime = new Realtime({ authUrl: '/api/realtime/auth', authMethod: 'GET', clientId: userId });
      const channel = realtime.channels.get(`user:${userId}`);
      for (const eventName of ['notification', 'live-tour', 'incoming-call', 'call-declined']) {
        channel.subscribe(eventName, refreshSafe);
      }
    }).catch((loadError: unknown) => {
      if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Live notifications are unavailable.');
    });
    return () => { cancelled = true; window.clearInterval(interval); realtime?.close(); };
  }, [refresh]);

  async function markRead(id?: string) {
    const response = await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(id ? { id } : { all: true }),
    });
    const result = await response.json();
    if (!response.ok) {
      setError(typeof result.error === 'string' ? result.error : 'Could not update notifications.');
      return;
    }
    await refresh();
  }

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={`Notifications, ${unread} unread`} className="relative rounded-full border border-slate-200 bg-white p-3 text-slate-700 hover:border-emerald-500">
        <Bell size={19} />
        {unread > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && <section className="absolute right-0 z-50 mt-2 max-h-[70vh] w-[min(24rem,calc(100vw-2rem))] overflow-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
        <div className="flex items-center justify-between px-2 py-1">
          <h2 className="font-semibold text-slate-900">Notifications</h2>
          {unread > 0 && <button onClick={() => void markRead()} className="text-xs font-semibold text-emerald-700">Mark all read</button>}
        </div>
        {error && <p role="alert" className="m-2 text-xs text-red-700">{error}</p>}
        {items.length === 0 ? <p className="p-4 text-sm text-slate-500">No notifications yet.</p> : items.map((item) => (
          <button key={item.id} onClick={() => { if (!item.read) void markRead(item.id); }} className={`block w-full rounded-xl px-3 py-3 text-left hover:bg-slate-50 ${item.read ? 'text-slate-600' : 'bg-emerald-50 text-slate-900'}`}>
            <span className="block text-xs font-semibold uppercase tracking-wide text-emerald-800">{item.type.replace('_', ' ')}</span>
            <span className="mt-1 block text-sm">{item.message}</span>
            <time className="mt-1 block text-xs text-slate-400">{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.createdAt))}</time>
          </button>
        ))}
      </section>}
    </div>
  );
}
