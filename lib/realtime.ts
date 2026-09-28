import { Rest } from 'ably';

export async function publishRealtimeEvent(channel: string, name: string, data: unknown) {
  const apiKey = process.env.ABLY_API_KEY;
  if (!apiKey) return false;
  try {
    const realtime = new Rest(apiKey);
    await realtime.channels.get(channel).publish(name, data);
    return true;
  } catch (error) {
    console.error(`Could not publish Ably event "${name}" to "${channel}":`, error);
    return false;
  }
}
