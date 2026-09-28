'use client';

import { useCallback, useEffect, useState } from 'react';
import { Realtime } from 'ably';
import { LiveKitCallRoom } from '@/components/livekit-call-room';

type IncomingCall = {
  id: string;
  propertyId: string;
  initiator: { id: string; name: string };
  property: { id: string; title: string; slug: string };
};

export function CallNotificationCenter() {
  const [userId, setUserId] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const refreshIncoming = useCallback(async () => {
    const response = await fetch('/api/calls?inbox=1', { cache: 'no-store' });
    if (response.status === 401) return;
    const result = await response.json();
    if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Incoming calls are unavailable.');
    setIncoming((current) => activeCallId ? current : (result.data as IncomingCall[])[0] ?? null);
  }, [activeCallId]);

  useEffect(() => {
    let cancelled = false;
    const checkSession = async () => {
      try {
        const response = await fetch('/api/auth/me', { cache: 'no-store' });
        if (response.status === 401) {
          if (!cancelled) {
            setUserId(null);
            setIncoming(null);
          }
          return;
        }
        if (!response.ok) return;
        const result = await response.json();
        const id = result.user?.id as string | undefined;
        if (!cancelled) setUserId(id ?? null);
      } catch (sessionError) {
        if (!cancelled) console.error('Could not check the current session for incoming calls.', sessionError);
      }
    };
    void checkSession();
    const interval = window.setInterval(() => void checkSession(), 15_000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, []);

  useEffect(() => {
    if (!userId) return;
    const authenticatedUserId = userId;
    let realtime: Realtime | undefined;
    let cancelled = false;
    const refresh = () => void refreshIncoming().catch((pollError) => {
      if (!cancelled) setError(pollError instanceof Error ? pollError.message : 'Incoming calls are unavailable.');
    });
    refresh();
    const interval = window.setInterval(refresh, 5000);
    async function subscribeRealtime() {
      try {
        const authResponse = await fetch('/api/realtime/auth', { cache: 'no-store' });
        if (!authResponse.ok || cancelled) return;
        realtime = new Realtime({ authUrl: '/api/realtime/auth', authMethod: 'GET', clientId: authenticatedUserId });
        const channel = realtime.channels.get(`user:${authenticatedUserId}`);
        channel.subscribe('incoming-call', () => {
          refresh();
        });
      } catch (subscriptionError) {
        if (!cancelled && !(subscriptionError instanceof Error && subscriptionError.message.includes('not configured'))) {
          console.error('Ably incoming-call subscription failed; database polling remains active.', subscriptionError);
        }
      }
    }
    void subscribeRealtime();
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      realtime?.close();
    };
  }, [userId, refreshIncoming]);

  async function decline() {
    if (!incoming) return;
    try {
      const response = await fetch(`/api/calls/${incoming.id}/decline`, { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Could not decline the call.');
      setIncoming(null);
    } catch (declineError) {
      setError(declineError instanceof Error ? declineError.message : 'Could not decline the call.');
    }
  }

  return (
    <>
      {error && userId && <p role="status" className="fixed bottom-4 right-4 z-[900] max-w-sm rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 shadow">{error}</p>}
      {incoming && userId && !activeCallId && <aside role="alertdialog" aria-label="Incoming property call" className="fixed bottom-4 right-4 z-[950] w-[min(24rem,calc(100vw-2rem))] rounded-2xl border border-emerald-200 bg-white p-5 shadow-2xl">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Incoming call</p>
        <h2 className="mt-1 text-lg font-bold text-slate-900">{incoming.initiator.name}</h2>
        <p className="text-sm text-slate-600">{incoming.property.title}</p>
        <div className="mt-4 flex gap-2">
          <button onClick={() => { setActiveCallId(incoming.id); setIncoming(null); }} className="flex-1 rounded-full bg-emerald-700 px-4 py-2 font-semibold text-white">Accept</button>
          <button onClick={() => void decline()} className="flex-1 rounded-full border border-slate-300 px-4 py-2 font-semibold text-slate-700">Decline</button>
        </div>
      </aside>}
      {activeCallId && userId && <LiveKitCallRoom callId={activeCallId} currentUserId={userId} onClose={() => setActiveCallId(null)} />}
    </>
  );
}
