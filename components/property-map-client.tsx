'use client';

import L from 'leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import type { Property } from '@/lib/types';
import { CurrencyPrice } from '@/components/currency-price';

const propertyIcon = L.divIcon({
  className: '',
  html: '<div style="width:18px;height:18px;border:3px solid white;border-radius:50%;background:#059669;box-shadow:0 1px 8px #0f172a88"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

function FitBounds({ properties }: { properties: Property[] }) {
  const map = useMap();
  useEffect(() => {
    const points = properties.flatMap((property) => property.location.latitude !== null && property.location.latitude !== undefined && property.location.longitude !== null && property.location.longitude !== undefined
      ? [[property.location.latitude, property.location.longitude] as [number, number]]
      : []);
    if (points.length === 1) map.setView(points[0], 12);
    else if (points.length > 1) map.fitBounds(points, { padding: [36, 36], maxZoom: 13 });
  }, [map, properties]);
  return null;
}

function DirectionsPreview({ latitude, longitude }: { latitude: number; longitude: number }) {
  const [directions, setDirections] = useState<{ distanceMeters: number; durationSeconds: number; steps: { instruction: string }[] } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function loadDirections() {
    if (!navigator.geolocation) {
      setError('Location services are not available in this browser.');
      return;
    }
    setLoading(true);
    setError('');
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      try {
        const query = new URLSearchParams({
          from: `${coords.latitude},${coords.longitude}`,
          to: `${latitude},${longitude}`,
        });
        const response = await fetch(`/api/maps/directions?${query}`);
        const result = await response.json();
        if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Directions could not be loaded.');
        setDirections(result.data);
      } catch (routeError) {
        setError(routeError instanceof Error ? routeError.message : 'Directions could not be loaded.');
      } finally {
        setLoading(false);
      }
    }, (geoError) => {
      setError(geoError.message);
      setLoading(false);
    }, { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 });
  }

  return (
    <div className="mt-2 border-t border-slate-200 pt-2">
      <button type="button" onClick={() => void loadDirections()} disabled={loading} className="text-sm font-semibold text-emerald-800 disabled:opacity-60">
        {loading ? 'Loading directions…' : 'Get directions from my location'}
      </button>
      {error && <p role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
      {directions && <div className="mt-1 max-h-28 overflow-auto text-xs text-slate-700">
        <p>{(directions.distanceMeters / 1000).toFixed(1)} km · {Math.round(directions.durationSeconds / 60)} min driving</p>
        <ol className="mt-1 list-inside list-decimal">{directions.steps.slice(0, 8).map((step, index) => <li key={`${index}-${step.instruction}`}>{step.instruction}</li>)}</ol>
      </div>}
    </div>
  );
}

export function PropertyMapClient({ properties, preferredCurrency = 'USD' }: { properties: Property[]; preferredCurrency?: string }) {
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  const useMapbox = process.env.NEXT_PUBLIC_MAP_PROVIDER === 'mapbox' && Boolean(mapboxToken);
  const propertiesWithCoordinates = properties.filter((property) => property.location.latitude !== null && property.location.latitude !== undefined && property.location.longitude !== null && property.location.longitude !== undefined);
  return (
    <div>
      <p className="mb-2 text-sm text-slate-600">
        Showing {propertiesWithCoordinates.length} of {properties.length} properties with map coordinates. Map data © OpenStreetMap contributors.
      </p>
      {propertiesWithCoordinates.length === 0 && <p role="status" className="mb-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">No properties in this result have a saved map location yet.</p>}
      <MapContainer center={[20, 0]} zoom={2} minZoom={2} scrollWheelZoom className="h-[560px] w-full rounded-lg">
        <TileLayer
          attribution={useMapbox ? '&copy; Mapbox &copy; OpenStreetMap' : '&copy; OpenStreetMap contributors'}
          url={useMapbox && mapboxToken ? `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/256/{z}/{x}/{y}?access_token=${mapboxToken}` : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'}
        />
        <FitBounds properties={properties} />
        <MarkerClusterGroup chunkedLoading>
          {propertiesWithCoordinates.map((property) => (
            <Marker key={property.id} position={[property.location.latitude!, property.location.longitude!]} icon={propertyIcon}>
              <Popup>
                <div className="w-52 text-slate-900">
                  <a href={`/properties/${property.slug}`} className="block">
                    <Image src={property.image} alt="" width={208} height={96} className="mb-2 h-24 w-full rounded object-cover" />
                    <strong className="block">{property.title}</strong>
                    <span className="block text-xs text-slate-500">{property.location.area}, {property.location.city}, {property.location.country}</span>
                    <CurrencyPrice amount={property.price} currency={property.currency} preferredCurrency={preferredCurrency} className="mt-1 block font-semibold" />
                  </a>
                  <DirectionsPreview latitude={property.location.latitude!} longitude={property.location.longitude!} />
                </div>
              </Popup>
            </Marker>
          ))}
        </MarkerClusterGroup>
      </MapContainer>
    </div>
  );
}
