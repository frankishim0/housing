import { AccessToken, RoomServiceClient, ServerError } from 'livekit-server-sdk';

function getLiveKitConfig() {
  const serverUrl = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!serverUrl || !apiKey || !apiSecret) {
    throw new Error('LiveKit calling is not configured.');
  }
  const httpUrl = new URL(serverUrl);
  if (httpUrl.protocol === 'wss:') httpUrl.protocol = 'https:';
  else if (httpUrl.protocol === 'ws:') httpUrl.protocol = 'http:';
  if (httpUrl.protocol !== 'https:' && httpUrl.protocol !== 'http:') {
    throw new Error('LIVEKIT_URL must use a ws, wss, http, or https URL.');
  }
  return { serverUrl, apiKey, apiSecret, serviceUrl: httpUrl.toString().replace(/\/$/, '') };
}

export async function createLiveKitToken(input: {
  identity: string;
  name: string;
  roomName: string;
  canPublish: boolean;
}) {
  const { serverUrl, apiKey, apiSecret } = getLiveKitConfig();

  const token = new AccessToken(apiKey, apiSecret, {
    identity: input.identity,
    name: input.name,
    ttl: '1h',
  });
  token.addGrant({
    roomJoin: true,
    room: input.roomName,
    canPublish: input.canPublish,
    canSubscribe: true,
    canPublishData: true,
  });
  return { serverUrl, token: await token.toJwt() };
}

export async function endLiveKitRoom(roomName: string) {
  const { serviceUrl, apiKey, apiSecret } = getLiveKitConfig();
  const rooms = new RoomServiceClient(serviceUrl, apiKey, apiSecret);
  try {
    await rooms.deleteRoom(roomName);
  } catch (error) {
    if (error instanceof ServerError && error.status === 404) return;
    throw error;
  }
}
