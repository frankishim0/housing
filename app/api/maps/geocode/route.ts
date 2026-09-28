import { NextRequest, NextResponse } from 'next/server';

type GeocodingResult = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  countryCode: string | null;
  country?: string;
  region?: string;
  city?: string;
  neighborhood?: string;
  postalCode?: string;
};

function normalizePlaceName(value: string | undefined) {
  return value?.trim() || undefined;
}

function mapboxResults(features: Array<{
  id: string;
  properties?: {
    full_address?: string;
    name?: string;
    context?: Record<string, { name?: string; country_code?: string }>;
  };
  geometry?: { coordinates?: [number, number] };
}>): GeocodingResult[] {
  return features.flatMap((feature) => {
    const coordinates = feature.geometry?.coordinates;
    if (!coordinates || coordinates.length < 2) return [];
    const context = feature.properties?.context;
    const city = context?.place?.name ?? context?.locality?.name;
    const region = context?.region?.name;
    const country = context?.country?.name;
    const label = feature.properties?.full_address ?? feature.properties?.name ?? '';
    if (!label) return [];
    return [{
      id: feature.id,
      label,
      longitude: coordinates[0],
      latitude: coordinates[1],
      countryCode: context?.country?.country_code?.toUpperCase() ?? null,
      country,
      region,
      city,
    }];
  });
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')?.trim().slice(0, 180);
  if (!query || query.length < 2) return NextResponse.json({ error: 'Enter at least two location characters.' }, { status: 400 });

  if (process.env.NEXT_PUBLIC_MAP_PROVIDER === 'mapbox') {
    const token = process.env.MAPBOX_ACCESS_TOKEN;
    if (!token) return NextResponse.json({ error: 'Mapbox was selected but MAPBOX_ACCESS_TOKEN is not configured.' }, { status: 503 });

    const url = new URL('https://api.mapbox.com/search/geocode/v6/forward');
    url.searchParams.set('q', query);
    url.searchParams.set('limit', '5');
    url.searchParams.set('autocomplete', 'true');
    url.searchParams.set('access_token', token);
    let response: Response;
    try {
      response = await fetch(url, { cache: 'no-store' });
    } catch (error) {
      console.error('Mapbox geocoding request failed.', error);
      return NextResponse.json({ error: 'Location search is temporarily unavailable.' }, { status: 503 });
    }
    if (!response.ok) {
      console.error(`Mapbox geocoding failed with HTTP ${response.status}.`);
      return NextResponse.json({ error: 'Location search is temporarily unavailable.' }, { status: 503 });
    }
    const result = await response.json() as {
      features?: Array<{
        id: string;
        properties?: {
          full_address?: string;
          name?: string;
          context?: Record<string, { name?: string; country_code?: string }>;
        };
        geometry?: { coordinates?: [number, number] };
      }>;
    };
    return NextResponse.json({ data: mapboxResults(result.features ?? []) }, {
      headers: { 'Cache-Control': 'private, max-age=300' },
    });
  }

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', '5');
  url.searchParams.set('accept-language', 'en');
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        'User-Agent': `HomesWorldwide/1.0 (${process.env.APP_URL ?? 'http://localhost'})`,
        'Accept-Language': 'en',
      },
      next: { revalidate: 3600 },
    });
  } catch (error) {
    console.error('OpenStreetMap geocoding request failed.', error);
    return NextResponse.json({ error: 'OpenStreetMap location search is temporarily unavailable.' }, { status: 503 });
  }
  if (!response.ok) {
    console.error(`OpenStreetMap geocoding failed with HTTP ${response.status}.`);
    return NextResponse.json({ error: 'OpenStreetMap location search is temporarily unavailable.' }, { status: 503 });
  }
  const result = await response.json() as Array<{
    place_id: number;
    osm_type: string;
    osm_id: number;
    display_name: string;
    lat: string;
    lon: string;
    address?: {
      country?: string;
      country_code?: string;
      state?: string;
      region?: string;
      city?: string;
      town?: string;
      village?: string;
      municipality?: string;
      suburb?: string;
      neighbourhood?: string;
      quarter?: string;
      postcode?: string;
    };
  }>;
  return NextResponse.json({
    data: result.flatMap((place) => {
      const latitude = Number(place.lat);
      const longitude = Number(place.lon);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !place.display_name) return [];
      return [{
        id: `${place.osm_type}-${place.osm_id || place.place_id}`,
        label: place.display_name,
        latitude,
        longitude,
        countryCode: place.address?.country_code?.toUpperCase() ?? null,
        country: normalizePlaceName(place.address?.country),
        region: normalizePlaceName(place.address?.state ?? place.address?.region),
        city: normalizePlaceName(place.address?.city ?? place.address?.town ?? place.address?.village ?? place.address?.municipality),
        neighborhood: normalizePlaceName(place.address?.suburb ?? place.address?.neighbourhood ?? place.address?.quarter),
        postalCode: normalizePlaceName(place.address?.postcode),
      }];
    }),
  }, { headers: { 'Cache-Control': 'private, max-age=300' } });
}
