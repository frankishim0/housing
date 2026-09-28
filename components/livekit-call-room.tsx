'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { LiveKitRoom, VideoConference } from '@livekit/components-react';
import { Realtime } from 'ably';

type CallMessage = { id: string; content: string; createdAt: string; sender: { id: string; name: string } };
type CallType = 'VIDEO_CALL' | 'LIVE_TOUR';

export function LiveKitCallRoom({ callId, currentUserId, onClose }: { callId: string; currentUserId: string; onClose: () => void }) {
  const [connection, setConnection] = useState<{ serverUrl: string; token: string; canPublish: boolean; type: CallType } | null>(null);
  const [messages, setMessages] = useState<CallMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const leaving = useRef(false);

  const refreshMessages = useCallback(async () => {
    const response = await fetch(`/api/calls/${callId}/messages`, { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Could not load tour chat.');
    setMessages(result.data as CallMessage[]);
  }, [callId]);

  useEffect(() => {
    let cancelled = false;
    let realtime: Realtime | undefined;
    let poll: number | undefined;
    async function connect() {
      try {
        const response = await fetch(`/api/calls/${callId}/token`, { method: 'POST' });
        const result = await response.json();
        if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Could not join the call.');
        if (cancelled) return;
        setConnection(result.data);
        await refreshMessages();
        if (cancelled) return;
        realtime = new Realtime({
          authUrl: `/api/realtime/auth?callId=${encodeURIComponent(callId)}`,
          authMethod: 'GET',
          clientId: currentUserId,
        });
        const channel = realtime.channels.get(`call:${callId}`);
        channel.subscribe('chat-message', (event) => {
          const incoming = event.data as CallMessage;
          setMessages((current) => current.some((message) => message.id === incoming.id) ? current : [...current, incoming]);
        });
        poll = window.setInterval(() => void refreshMessages().catch((loadError) => {
          if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Could not refresh tour chat.');
        }), 30_000);
      } catch (joinError) {
        if (!cancelled) setError(joinError instanceof Error ? joinError.message : 'Could not join the call.');
      }
    }
    void connect();
    return () => {
      cancelled = true;
      if (poll !== undefined) window.clearInterval(poll);
      realtime?.close();
    };
  }, [callId, currentUserId, refreshMessages]);

  async function leave() {
    if (leaving.current) return;
    leaving.current = true;
    setPending(true);
    setError('');
    try {
      const response = await fetch(`/api/calls/${callId}/leave`, { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Could not leave the call.');
      onClose();
    } catch (leaveError) {
      leaving.current = false;
      setError(leaveError instanceof Error ? leaveError.message : 'Could not leave the call.');
    } finally {
      setPending(false);
    }
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim() || pending) return;
    setPending(true);
    setError('');
    try {
      const response = await fetch(`/api/calls/${callId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: draft }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Could not send tour message.');
      setMessages((current) => current.some((message) => message.id === result.data.id) ? current : [...current, result.data]);
      setDraft('');
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Could not send tour message.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/80 p-3 sm:p-6">
      <section className="flex h-[95vh] max-h-[95vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div><h2 className="font-semibold text-slate-900">{connection?.type === 'LIVE_TOUR' ? 'Live property tour' : '1-to-1 video call'}</h2><p className="text-xs text-slate-500">Audio/video is encrypted in transit by LiveKit WebRTC.</p></div>
          <button disabled={pending} onClick={() => void leave()} className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {connection?.type === 'LIVE_TOUR' ? (connection.canPublish ? 'End Live Property Tour' : 'Leave Tour') : 'End Call'}
          </button>
        </header>
        {error && <p role="alert" className="border-b border-red-100 bg-red-50 px-5 py-2 text-sm text-red-700">{error}</p>}
        {connection ? (
          <LiveKitRoom serverUrl={connection.serverUrl} token={connection.token} connect audio={connection.canPublish} video={connection.canPublish} onDisconnected={() => { if (!leaving.current) void leave(); }}>
            <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(150px,28vh)] overflow-hidden lg:grid-cols-[minmax(0,1fr)_320px] lg:grid-rows-1">
              <div data-lk-theme="default" className="min-h-0 min-w-0 overflow-hidden bg-slate-950">
                <VideoConference />
              </div>
              <aside className="flex min-h-0 flex-col border-t border-slate-200 lg:border-l lg:border-t-0">
                <h3 className="border-b border-slate-200 px-4 py-3 font-semibold">{connection.type === 'LIVE_TOUR' ? 'Live tour chat' : 'Call chat'}</h3>
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                  {messages.map((message) => <div key={message.id} className="text-sm"><span className="font-semibold">{message.sender.id === currentUserId ? 'You' : message.sender.name}</span><p className="break-words text-slate-700">{message.content}</p></div>)}
                </div>
                <form onSubmit={sendMessage} className="flex gap-2 border-t border-slate-200 p-3">
                  <input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={2000} placeholder="Message participants" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  <button disabled={pending || !draft.trim()} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Send</button>
                </form>
              </aside>
            </div>
          </LiveKitRoom>
        ) : <div className="grid min-h-[50vh] place-items-center text-sm text-slate-600">Connecting securely…</div>}
      </section>
    </div>
  );
}
