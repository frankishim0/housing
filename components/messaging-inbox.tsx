'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ChangeEvent, FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Realtime } from 'ably';
import { ArrowLeft, Bell, Check, Clock3, FileText, ImagePlus, MessageSquareText, Reply, Search, Send, Trash2, X } from 'lucide-react';
import { CurrencyPrice } from '@/components/currency-price';
import { PropertyLiveExperience } from '@/components/property-live-experience';

type UserSummary = {
  id: string;
  name: string;
  role: 'USER' | 'TENANT' | 'OWNER' | 'LANDLORD' | 'AGENT' | 'PROPERTY_MANAGER' | 'DEVELOPER' | 'ADMIN';
  profileImage: string | null;
  lastSeenAt: string | null;
};

type Attachment = { id: string; fileName: string; mimeType: string; size: number; url: string };
type Message = {
  id: string;
  content: string;
  senderId: string;
  createdAt: string;
  readAt: string | null;
  sender: UserSummary;
  attachments: Attachment[];
  replyTo: { id: string; content: string; sender: { name: string } } | null;
};

type Conversation = {
  id: string;
  updatedAt: string;
  property: {
    id: string;
    title: string;
    slug: string;
    ownerId: string;
    agentId: string | null;
    price: number | string;
    currencyCode: string;
    media: { url: string }[];
    location: { area: string; city: string; state: string; country: string };
  } | null;
  participants: { user: UserSummary }[];
  messages: { id: string; content: string; senderId: string; createdAt: string; attachments: { id: string; fileName: string }[] }[];
  _count: { messages: number };
};

type DraftAttachment = { file: File };

const ROLE_LABEL: Record<UserSummary['role'], string> = {
  USER: 'Buyer / Tenant',
  TENANT: 'Tenant',
  OWNER: 'Property Owner',
  LANDLORD: 'Landlord',
  AGENT: 'Housing Agent',
  PROPERTY_MANAGER: 'Property Manager',
  DEVELOPER: 'Developer',
  ADMIN: 'Admin',
};

function formatTime(value: string, timeZone?: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: timeZone || undefined }).format(new Date(value));
}

function presence(user: UserSummary, timeZone?: string) {
  if (!user.lastSeenAt) return { online: false, label: 'Offline' };
  const lastSeen = new Date(user.lastSeenAt);
  if (Date.now() - lastSeen.getTime() < 100_000) return { online: true, label: 'Online' };
  return { online: false, label: `Last seen ${formatTime(user.lastSeenAt, timeZone)}` };
}

function userRolePair(participants: UserSummary[]) {
  return participants.map((person) => ROLE_LABEL[person.role]).join(' ↔ ');
}

function Avatar({ user, size = 40 }: { user: UserSummary; size?: number }) {
  return user.profileImage
    ? <Image src={user.profileImage} alt="" width={size} height={size} unoptimized className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
    : <span className="flex shrink-0 items-center justify-center rounded-full bg-emerald-100 font-semibold text-emerald-800" style={{ width: size, height: size }}>{user.name.slice(0, 1).toUpperCase()}</span>;
}

export function MessagingInbox({ currentUserId, timeZone, preferredCurrency = 'USD' }: { currentUserId: string; timeZone?: string | null; preferredCurrency?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlConversationId = searchParams.get('conversation');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(urlConversationId);
  const [messageState, setMessageState] = useState<{ conversationId: string | null; messages: Message[] }>({ conversationId: null, messages: [] });
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [attachment, setAttachment] = useState<DraftAttachment | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [typingUserName, setTypingUserName] = useState<string | null>(null);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingTimeout = useRef<number | null>(null);
  const typingDisplayTimeout = useRef<number | null>(null);
  const seenMessageIds = useRef(new Set<string>());
  const seenThreadMessageIds = useRef(new Set<string>());
  const activeConversation = conversations.find((conversation) => conversation.id === activeId) ?? null;
  const otherParticipants = useMemo(
    () => activeConversation?.participants.map((item) => item.user).filter((person) => person.id !== currentUserId) ?? [],
    [activeConversation, currentUserId],
  );
  const otherPerson = otherParticipants[0];
  const messages = messageState.conversationId === activeId ? messageState.messages : [];

  useEffect(() => {
    let cancelled = false;
    let firstLoad = true;
    async function refreshConversations() {
      try {
        const response = await fetch(`/api/conversations?q=${encodeURIComponent(query)}`, { cache: 'no-store' });
        const result = await response.json();
        if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Could not load conversations.');
        if (!cancelled) {
          const incoming = result.data as Conversation[];
          if (!firstLoad && 'Notification' in window && Notification.permission === 'granted') {
            for (const conversation of incoming) {
              const lastMessage = conversation.messages[0];
              if (lastMessage && lastMessage.senderId !== currentUserId && !seenThreadMessageIds.current.has(lastMessage.id)) {
                new Notification(`Message from ${conversation.participants.find((item) => item.user.id === lastMessage.senderId)?.user.name ?? 'a user'}`, {
                  body: lastMessage.content || 'Sent an attachment.',
                });
              }
            }
          }
          for (const conversation of incoming) {
            if (conversation.messages[0]) seenThreadMessageIds.current.add(conversation.messages[0].id);
          }
          setConversations(incoming);
          if ('Notification' in window) setNotificationPermission(Notification.permission);
          else setNotificationPermission('unsupported');
          setError('');
          if (urlConversationId && result.data.some((item: Conversation) => item.id === urlConversationId)) setActiveId(urlConversationId);
        }
      } catch (requestError) {
        if (!cancelled) setError(requestError instanceof Error ? requestError.message : 'Could not load conversations.');
      } finally {
        if (firstLoad && !cancelled) setLoadingThreads(false);
        firstLoad = false;
      }
    }
    void refreshConversations();
    const interval = window.setInterval(() => void refreshConversations(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [currentUserId, query, urlConversationId]);

  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    async function refreshMessages(initial = false) {
      if (!activeId) return;
      if (initial) setLoadingMessages(true);
      try {
        const response = await fetch(`/api/conversations/${activeId}/messages`, { cache: 'no-store' });
        const result = await response.json();
        if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Could not load messages.');
        if (cancelled) return;
        const incoming = result.data as Message[];
        const newIncoming = incoming.filter((message) => message.senderId !== currentUserId && !seenMessageIds.current.has(message.id));
        if (!initial && 'Notification' in window && Notification.permission === 'granted' && newIncoming.length) {
          const latest = newIncoming[newIncoming.length - 1];
          new Notification(`Message from ${latest.sender.name}`, { body: latest.content || 'Sent an attachment.' });
        }
        for (const message of incoming) seenMessageIds.current.add(message.id);
        setMessageState({ conversationId: activeId, messages: incoming });
        setError('');
      } catch (requestError) {
        if (!cancelled) setError(requestError instanceof Error ? requestError.message : 'Could not load messages.');
      } finally {
        if (initial && !cancelled) setLoadingMessages(false);
      }
    }
    seenMessageIds.current.clear();
    void refreshMessages(true);
    const realtime = new Realtime({
      authUrl: `/api/realtime/auth?conversationId=${encodeURIComponent(activeId)}`,
      authMethod: 'GET',
      clientId: currentUserId,
    });
    const channel = realtime.channels.get(`conversation:${activeId}`);
    realtime.connection.on('connected', () => setRealtimeConnected(true));
    realtime.connection.on('failed', () => setRealtimeConnected(false));
    const onMessage = () => { void refreshMessages(); };
    const onTyping = (event: { data?: unknown }) => {
      const data = event.data as { userId?: unknown; name?: unknown } | undefined;
      if (!data || typeof data.userId !== 'string' || typeof data.name !== 'string' || data.userId === currentUserId) return;
      setTypingUserName(data.name);
      if (typingDisplayTimeout.current !== null) window.clearTimeout(typingDisplayTimeout.current);
      typingDisplayTimeout.current = window.setTimeout(() => setTypingUserName(null), 2500);
    };
    channel.subscribe('message', onMessage);
    channel.subscribe('read', onMessage);
    channel.subscribe('typing', onTyping);
    const interval = window.setInterval(() => void refreshMessages(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      if (typingDisplayTimeout.current !== null) window.clearTimeout(typingDisplayTimeout.current);
      channel.unsubscribe();
      realtime.close();
      setRealtimeConnected(false);
    };
  }, [activeId, currentUserId]);

  useEffect(() => {
    let cancelled = false;
    async function heartbeat() {
      if (document.visibilityState === 'visible') {
        await fetch('/api/conversations/presence', { method: 'POST' }).catch(() => undefined);
      }
    }
    void heartbeat();
    const interval = window.setInterval(() => { if (!cancelled) void heartbeat(); }, 40_000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, activeId]);

  function openConversation(conversation: Conversation) {
    setActiveId(conversation.id);
    setReplyTo(null);
    router.replace(`/messages?conversation=${encodeURIComponent(conversation.id)}`, { scroll: false });
  }

  function updateDraft(value: string) {
    setDraft(value);
    if (!activeId || !realtimeConnected) return;
    if (typingTimeout.current !== null) window.clearTimeout(typingTimeout.current);
    typingTimeout.current = window.setTimeout(() => {
      void fetch(`/api/conversations/${activeId}/typing`, { method: 'POST' }).catch(() => undefined);
    }, 600);
  }

  async function selectAttachment(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const supported = ['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'video/mp4', 'video/webm', 'video/quicktime'];
    if (!supported.includes(file.type) || file.size > 200 * 1024 * 1024) {
      setError('Choose a supported image, video, or document file under 200 MB.');
      return;
    }
    setAttachment({ file });
    setError('');
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (!activeId || (!draft.trim() && !attachment)) return;
    setSending(true);
    setError('');
    try {
      let uploaded: { ticket: string; secureUrl: string; publicId: string; resourceType: 'image' | 'video' | 'raw' } | undefined;
      if (attachment) {
        const signResponse = await fetch('/api/uploads/sign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            purpose: { kind: 'message', conversationId: activeId },
            fileName: attachment.file.name,
            mimeType: attachment.file.type,
            size: attachment.file.size,
          }),
        });
        const signResult = await signResponse.json();
        if (!signResponse.ok) throw new Error(typeof signResult.error === 'string' ? signResult.error : 'Could not authorize this upload.');
        const signed = signResult.data;
        const uploadForm = new FormData();
        uploadForm.set('file', attachment.file);
        uploadForm.set('api_key', signed.apiKey);
        uploadForm.set('timestamp', String(signed.timestamp));
        uploadForm.set('folder', signed.folder);
        uploadForm.set('public_id', signed.publicId);
        uploadForm.set('overwrite', 'false');
        uploadForm.set('signature', signed.signature);
        const cloudinaryResponse = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(signed.cloudName)}/${signed.resourceType}/upload`, {
          method: 'POST',
          body: uploadForm,
        });
        const cloudinaryResult = await cloudinaryResponse.json();
        if (!cloudinaryResponse.ok) throw new Error('Cloudinary could not upload the attachment.');
        uploaded = {
          ticket: signed.ticket,
          secureUrl: cloudinaryResult.secure_url,
          publicId: cloudinaryResult.public_id,
          resourceType: signed.resourceType,
        };
      }
      const response = await fetch(`/api/conversations/${activeId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: draft,
          replyToId: replyTo?.id,
          ...(attachment && uploaded ? {
            attachment: {
              ...uploaded,
              fileName: attachment.file.name,
              mimeType: attachment.file.type,
              size: attachment.file.size,
            },
          } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Message could not be sent.');
      setDraft('');
      setAttachment(null);
      setReplyTo(null);
      const messagesResponse = await fetch(`/api/conversations/${activeId}/messages`, { cache: 'no-store' });
      const messagesResult = await messagesResponse.json();
      if (messagesResponse.ok) setMessageState({ conversationId: activeId, messages: messagesResult.data });
      const threadsResponse = await fetch(`/api/conversations?q=${encodeURIComponent(query)}`, { cache: 'no-store' });
      const threadsResult = await threadsResponse.json();
      if (threadsResponse.ok) setConversations(threadsResult.data);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Message could not be sent.');
    } finally {
      setSending(false);
    }
  }

  function handleComposerKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  async function hideMessage(messageId: string) {
    if (!activeId) return;
    const response = await fetch(`/api/conversations/${activeId}/messages/${messageId}`, { method: 'DELETE' });
    if (!response.ok) {
      setError('Message could not be removed.');
      return;
    }
    setMessageState((current) => ({
      conversationId: activeId,
      messages: current.conversationId === activeId ? current.messages.filter((message) => message.id !== messageId) : [],
    }));
  }

  async function enableNotifications() {
    if ('Notification' in window) setNotificationPermission(await Notification.requestPermission());
  }

  const grandUnread = conversations.reduce((sum, conversation) => sum + conversation._count.messages, 0);

  return (
    <main className="mx-auto flex min-h-screen max-w-[1600px] flex-col bg-slate-50 px-3 py-4 text-slate-900 sm:px-6 lg:px-8">
      <header className="mb-4 flex items-center justify-between border-b border-slate-200 pb-4">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-700 text-lg font-bold text-white" aria-label="Homes Worldwide home">H</Link>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Homes Worldwide</p>
            <h1 className="text-xl font-bold">Messages{grandUnread > 0 && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">{grandUnread}</span>}</h1>
          </div>
        </div>
        {notificationPermission === 'default' && <button type="button" onClick={enableNotifications} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700"><Bell size={16} /> Enable alerts</button>}
      </header>

      <section className="grid min-h-[calc(100vh-100px)] flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white md:grid-cols-[310px_minmax(0,1fr)] xl:grid-cols-[350px_minmax(0,1fr)]">
        <aside className={`${activeId ? 'hidden md:flex' : 'flex'} min-h-[70vh] flex-col border-r border-slate-200`}>
          <div className="border-b border-slate-200 p-4">
            <label className="flex items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-3 focus-within:border-emerald-600">
              <Search size={17} className="text-slate-400" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search conversations" className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400" />
            </label>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loadingThreads ? <div className="space-y-3 p-4" aria-label="Loading conversations"><div className="h-16 animate-pulse rounded-lg bg-slate-100" /><div className="h-16 animate-pulse rounded-lg bg-slate-100" /></div> : conversations.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <MessageSquareText size={30} className="mx-auto text-slate-300" />
                <p className="mt-3 font-semibold">No conversations yet</p>
                <p className="mt-1 text-sm text-slate-500">Start a chat from a property listing.</p>
                <Link href="/search" className="mt-4 inline-block text-sm font-semibold text-emerald-700">Browse properties</Link>
              </div>
            ) : conversations.map((conversation) => {
              const person = conversation.participants.map((item) => item.user).find((item) => item.id !== currentUserId);
              const lastMessage = conversation.messages[0];
              return (
                <button key={conversation.id} type="button" onClick={() => openConversation(conversation)} className={`flex w-full gap-3 border-b border-slate-100 p-4 text-left transition hover:bg-slate-50 ${activeId === conversation.id ? 'bg-emerald-50/70' : ''}`}>
                  {person ? <Avatar user={person} /> : <span className="h-10 w-10 rounded-full bg-slate-100" />}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-2">
                      <span className="truncate text-sm font-semibold">{person?.name ?? 'Conversation'}</span>
                      <span className="shrink-0 text-[11px] text-slate-400">{lastMessage ? formatTime(lastMessage.createdAt, timeZone ?? undefined) : ''}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-emerald-800">{userRolePair(conversation.participants.map((item) => item.user))}</span>
                    <span className="mt-1 block truncate text-sm text-slate-500">{lastMessage?.content || (lastMessage?.attachments.length ? 'Attachment' : conversation.property?.title ?? 'No messages yet')}</span>
                  </span>
                  {conversation._count.messages > 0 && <span className="mt-5 flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-700 px-1.5 text-[11px] font-bold text-white">{conversation._count.messages}</span>}
                </button>
              );
            })}
          </div>
        </aside>

        <section className={`${activeId ? 'flex' : 'hidden md:flex'} min-h-[70vh] min-w-0 flex-col`}>
          {!activeConversation || !otherPerson ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"><MessageSquareText /></div>
              <h2 className="mt-4 text-lg font-semibold">Your conversations, all in one place</h2>
              <p className="mt-1 max-w-sm text-sm text-slate-500">Choose a conversation or message an owner or agent from a property listing.</p>
            </div>
          ) : <>
            <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 sm:px-6">
              <button type="button" onClick={() => { setActiveId(null); router.replace('/messages', { scroll: false }); }} className="-ml-1 flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 md:hidden" aria-label="Back to conversations"><ArrowLeft size={19} /></button>
              <Avatar user={otherPerson} size={42} />
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-semibold">{otherPerson.name}</h2>
                <p className="flex items-center gap-1.5 text-xs text-slate-500"><span className={`h-2 w-2 rounded-full ${presence(otherPerson, timeZone ?? undefined).online ? 'bg-emerald-500' : 'bg-slate-300'}`} />{ROLE_LABEL[otherPerson.role]} · {presence(otherPerson, timeZone ?? undefined).label}</p>
              </div>
              <span className="hidden text-xs text-slate-400 sm:block">{userRolePair(activeConversation.participants.map((item) => item.user))}</span>
            </header>

            {activeConversation.property && <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 sm:px-6">
              {activeConversation.property.media[0] && <Image src={activeConversation.property.media[0].url} alt="" width={84} height={64} unoptimized className="h-14 w-[72px] shrink-0 rounded-md object-cover" />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{activeConversation.property.title}</p>
                <p className="truncate text-xs text-slate-500">{[activeConversation.property.location.area, activeConversation.property.location.city, activeConversation.property.location.country].filter(Boolean).join(', ')}</p>
                <CurrencyPrice amount={Number(activeConversation.property.price)} currency={activeConversation.property.currencyCode} preferredCurrency={preferredCurrency} className="mt-0.5 text-sm font-bold text-emerald-800" />
              </div>
              <Link href={`/properties/${activeConversation.property.slug}`} className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-emerald-700 hover:text-emerald-800">View Property</Link>
            </div>}
            {activeConversation.property && otherPerson && <div className="border-b border-slate-200 px-4 py-3 sm:px-6">
              <PropertyLiveExperience
                propertyId={activeConversation.property.id}
                ownerId={activeConversation.property.ownerId}
                agentId={activeConversation.property.agentId}
                currentUserId={currentUserId}
                buyers={[otherPerson]}
                conversationId={activeConversation.id}
              />
            </div>}

            <div className="flex-1 space-y-4 overflow-y-auto bg-white px-4 py-5 sm:px-6">
              {loadingMessages ? <div className="space-y-4" aria-label="Loading messages"><div className="ml-auto h-14 w-2/3 animate-pulse rounded-lg bg-emerald-50" /><div className="h-14 w-2/3 animate-pulse rounded-lg bg-slate-100" /></div> : messages.length === 0 ? (
                <div className="flex h-full min-h-40 flex-col items-center justify-center text-center">
                  <MessageSquareText size={28} className="text-slate-300" />
                  <p className="mt-2 text-sm font-semibold">No messages yet</p>
                  <p className="text-xs text-slate-500">Send a message to start the conversation.</p>
                </div>
              ) : messages.map((message) => {
                const mine = message.senderId === currentUserId;
                return <article key={message.id} className={`group flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[88%] sm:max-w-[75%] ${mine ? 'items-end' : 'items-start'} flex flex-col`}>
                    {message.replyTo && <div className={`mb-1 max-w-full rounded-md border-l-2 border-emerald-500 bg-slate-50 px-3 py-1.5 text-xs text-slate-500 ${mine ? 'self-end' : ''}`}>Reply to {message.replyTo.sender.name}: <span className="line-clamp-1">{message.replyTo.content || 'Attachment'}</span></div>}
                    <div className={`min-w-20 rounded-lg px-3.5 py-2.5 ${mine ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-900'}`}>
                      {message.content && <p className="whitespace-pre-wrap break-words text-sm">{message.content}</p>}
                      {message.attachments.map((item) => item.mimeType.startsWith('image/') ? (
                        <a key={item.id} href={item.url} target="_blank" rel="noreferrer" className="mt-2 block">
                          <Image src={item.url} alt={item.fileName} width={360} height={280} unoptimized className="max-h-64 max-w-full rounded-md object-contain" />
                          <span className={`mt-1 block truncate text-xs ${mine ? 'text-emerald-100' : 'text-slate-500'}`}>{item.fileName}</span>
                        </a>
                      ) : <a key={item.id} href={item.url} download={item.fileName} className={`mt-2 flex items-center gap-2 rounded-md p-2 text-sm ${mine ? 'bg-emerald-800 text-white' : 'bg-white text-slate-700'}`}><FileText size={18} /><span className="max-w-48 truncate">{item.fileName}</span></a>)}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
                      <time dateTime={message.createdAt}>{formatTime(message.createdAt, timeZone ?? undefined)}</time>
                      {mine && message.readAt && <span title="Seen"><Check size={13} className="text-emerald-600" /></span>}
                      <button type="button" onClick={() => setReplyTo(message)} aria-label="Reply to message" title="Reply" className="rounded p-1 opacity-70 hover:bg-slate-100 hover:text-slate-700"><Reply size={14} /></button>
                      <button type="button" onClick={() => void hideMessage(message.id)} aria-label="Delete message for me" title="Delete for me" className="rounded p-1 opacity-70 hover:bg-rose-50 hover:text-rose-700"><Trash2 size={14} /></button>
                    </div>
                  </div>
                </article>;
              })}
              <div ref={bottomRef} />
            </div>

            <div className="border-t border-slate-200 bg-white px-3 py-3 sm:px-5">
              {error && <p role="alert" className="mb-2 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
              {typingUserName && <p aria-live="polite" className="mb-2 text-xs italic text-slate-500">{typingUserName} is typing…</p>}
              {replyTo && <div className="mb-2 flex items-center justify-between rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-900"><span className="truncate">Replying to {replyTo.sender.name}: {replyTo.content || 'Attachment'}</span><button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply"><X size={16} /></button></div>}
              {attachment && <div className="mb-2 flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-xs"><ImagePlus size={16} className="text-emerald-700" /><span className="min-w-0 flex-1 truncate">{attachment.file.name}</span><button type="button" onClick={() => setAttachment(null)} aria-label="Remove attachment"><X size={15} /></button></div>}
              <form onSubmit={sendMessage} className="flex items-end gap-2">
                <label className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-emerald-700" title="Attach image or PDF">
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/avif,video/mp4,video/webm,video/quicktime,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only" onChange={(event) => void selectAttachment(event)} />
                  <ImagePlus size={19} />
                </label>
                <textarea value={draft} onChange={(event) => updateDraft(event.target.value)} onKeyDown={handleComposerKey} rows={1} maxLength={5000} placeholder="Write a message…" className="max-h-32 min-h-10 min-w-0 flex-1 resize-y rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600" />
                <button type="submit" disabled={sending || (!draft.trim() && !attachment)} className="flex h-10 shrink-0 items-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"><Send size={16} /><span className="hidden sm:inline">{sending ? 'Sending' : 'Send'}</span></button>
              </form>
              <p className="mt-1 flex items-center justify-between pl-12 text-[10px] text-slate-400"><span>Enter to send · Shift+Enter for a new line</span><span className="flex items-center gap-1"><Clock3 size={11} /> {realtimeConnected ? 'Live updates' : 'Refreshes every 30 seconds'}</span></p>
            </div>
          </>}
        </section>
      </section>
    </main>
  );
}