import { NextRequest, NextResponse } from 'next/server';

function coordinate(value: string | null) {
  if (!value) return null;
  const parts = value.split(',').map(Number);
  if (parts.length !== 2 || parts.some((part) => !Number.isFinite(part))) return null;
  const [latitude, longitude] = parts;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return [longitude, latitude] as const;
}

export async function GET(request: NextRequest) {
  const from = coordinate(request.nextUrl.searchParams.get('from'));
  const to = coordinate(request.nextUrl.searchParams.get('to'));
  const profile = request.nextUrl.searchParams.get('profile') ?? 'driving';
  if (!from || !to || !['driving', 'walking', 'cycling'].includes(profile)) {
    return NextResponse.json({ error: 'Provide valid origin and destination coordinates and a supported travel mode.' }, { status: 400 });
  }

  const mapboxSelected = process.env.NEXT_PUBLIC_MAP_PROVIDER === 'mapbox';
  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (mapboxSelected && !token) {
    return NextResponse.json({ error: 'Mapbox was selected but MAPBOX_ACCESS_TOKEN is not configured.' }, { status: 503 });
  }
  const url = mapboxSelected
    ? new URL(`https://api.mapbox.com/directions/v5/mapbox/${profile}/${from.join(',')};${to.join(',')}`)
    : new URL(`https://routing.openstreetmap.de/routed-${profile === 'driving' ? 'car' : profile === 'walking' ? 'foot' : 'bike'}/route/v1/driving/${from.join(',')};${to.join(',')}`);
  url.searchParams.set('geometries', 'geojson');
  url.searchParams.set('overview', 'full');
  url.searchParams.set('steps', 'true');
  if (mapboxSelected && token) url.searchParams.set('access_token', token);
  let response: Response;
  try {
    response = await fetch(url, {
      headers: mapboxSelected ? undefined : { 'User-Agent': `HomesWorldwide/1.0 (${process.env.APP_URL ?? 'http://localhost'})` },
      cache: 'no-store',
    });
  } catch (error) {
    console.error(`${mapboxSelected ? 'Mapbox' : 'OpenStreetMap'} directions request failed.`, error);
    return NextResponse.json({ error: 'Directions are temporarily unavailable.' }, { status: 503 });
  }
  if (!response.ok) {
    console.error(`${mapboxSelected ? 'Mapbox' : 'OpenStreetMap'} directions failed with HTTP ${response.status}.`);
    return NextResponse.json({ error: 'Directions are temporarily unavailable.' }, { status: 503 });
  }
  const result = mapboxSelected
    ? await response.json() as {
      routes?: Array<{ distance: number; duration: number; geometry: { coordinates: number[][] }; legs: Array<{ steps: Array<{ name: string; maneuver: { instruction: string } }> }> }>;
    }
    : await response.json() as {
      routes?: Array<{ distance: number; duration: number; geometry: { coordinates: number[][] }; legs: Array<{ steps: Array<{ name: string; maneuver: { type: string; modifier?: string } }> }> }>;
    };
  const route = result.routes?.[0];
  if (!route) return NextResponse.json({ error: 'No route was found for those locations.' }, { status: 404 });
  return NextResponse.json({
    data: {
      distanceMeters: route.distance,
      durationSeconds: route.duration,
      geometry: route.geometry,
      steps: route.legs.flatMap((leg) => leg.steps.map((step) => ({
        name: step.name,
        instruction: 'instruction' in step.maneuver
          ? step.maneuver.instruction
          : [step.maneuver.type.replaceAll('_', ' '), step.maneuver.modifier, step.name ? `onto ${step.name}` : ''].filter(Boolean).join(' '),
      }))),
    },
  }, { headers: { 'Cache-Control': 'private, max-age=300' } });
}
