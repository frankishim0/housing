'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { LiveKitCallRoom } from '@/components/livekit-call-room';

type ActiveCall = { id: string; type: 'VIDEO_CALL' | 'LIVE_TOUR'; status: string; initiator: { id: string; name: string } };

export function PropertyLiveExperience({ propertyId, ownerId, agentId, currentUserId, buyers = [], conversationId }: {
  propertyId: string;
  ownerId: string;
  agentId: string | null;
  currentUserId?: string | null;
  buyers?: { id: string; name: string }[];
  conversationId?: string;
}) {
  const [calls, setCalls] = useState<ActiveCall[]>([]);
  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  const [recipientId, setRecipientId] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const isContact = Boolean(currentUserId && [ownerId, agentId].includes(currentUserId));

  const loadCalls = useCallback(async () => {
    const response = await fetch(`/api/calls?propertyId=${encodeURIComponent(propertyId)}`, { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Could not load property calls.');
    setCalls(result.data as ActiveCall[]);
  }, [propertyId]);

  useEffect(() => {
    if (!currentUserId) return;
    let cancelled = false;
    const refresh = () => void loadCalls().catch((loadError) => {
      if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Could not load property calls.');
    });
    refresh();
    const interval = window.setInterval(refresh, 10_000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [currentUserId, loadCalls]);

  async function startCall(type: 'VIDEO_CALL' | 'LIVE_TOUR', invitee?: string) {
    if (!currentUserId) return;
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId,
          type,
          ...(invitee ? { recipientId: invitee } : {}),
          ...(invitee && conversationId ? { conversationId } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Could not start the call.');
      setActiveCallId(result.data.id);
      await loadCalls();
    } catch (callError) {
      setError(callError instanceof Error ? callError.message : 'Could not start the call.');
    } finally {
      setPending(false);
    }
  }

  if (!currentUserId) return (
    <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <h3 className="font-semibold text-slate-900">Video calls & live property tours</h3>
      <p className="text-sm text-slate-600">Sign in to video call the listing contact or join an active property tour.</p>
      <Link href="/auth" className="inline-flex rounded-full border border-emerald-700 px-4 py-2 text-sm font-semibold text-emerald-800">Sign in to call or join</Link>
    </div>
  );

  const contactId = agentId && agentId !== currentUserId ? agentId : ownerId !== currentUserId ? ownerId : null;
  const tours = calls.filter((call) => call.type === 'LIVE_TOUR' && call.status === 'ACTIVE');
  const hostedTour = tours.find((tour) => tour.initiator.id === currentUserId);

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div><h3 className="font-semibold text-slate-900">Live calls & property tours</h3><p className="text-xs text-slate-500">Private property-linked audio/video through LiveKit.</p></div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {isContact ? (
        <>
          {hostedTour
            ? <button type="button" onClick={() => setActiveCallId(hostedTour.id)} className="w-full rounded-full bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">Resume Live Property Tour</button>
            : <button type="button" disabled={pending} onClick={() => void startCall('LIVE_TOUR')} className="w-full rounded-full bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{pending ? 'Starting…' : 'Start Live Property Tour'}</button>}
          {buyers.length > 0 && <div className="flex gap-2">
            <select value={recipientId} onChange={(event) => setRecipientId(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">Choose an interested buyer / tenant</option>
              {buyers.map((buyer) => <option key={buyer.id} value={buyer.id}>{buyer.name}</option>)}
            </select>
            <button type="button" disabled={pending || !recipientId} onClick={() => void startCall('VIDEO_CALL', recipientId)} className="rounded-lg border border-emerald-700 px-3 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-50">Video Call</button>
          </div>}
        </>
      ) : contactId ? <button type="button" disabled={pending} onClick={() => void startCall('VIDEO_CALL', contactId)} className="w-full rounded-full border border-emerald-700 px-4 py-2.5 text-sm font-semibold text-emerald-800 disabled:opacity-50">{pending ? 'Calling…' : 'Video Call'}</button> : null}
      {tours.filter((tour) => tour.initiator.id !== currentUserId).map((tour) => <button key={tour.id} type="button" onClick={() => setActiveCallId(tour.id)} className="w-full rounded-lg bg-red-50 px-4 py-2 text-left text-sm font-semibold text-red-800">Join live tour · hosted by {tour.initiator.name}</button>)}
      {activeCallId && <LiveKitCallRoom callId={activeCallId} currentUserId={currentUserId} onClose={() => { setActiveCallId(null); void loadCalls(); }} />}
    </div>
  );
}
