'use client';

import { useEffect } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';

type Coordinates = { latitude: number; longitude: number };
const pinIcon = L.divIcon({
  className: '',
  html: '<div style="width:18px;height:18px;border:3px solid white;border-radius:50%;background:#059669;box-shadow:0 1px 8px #0f172a88"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

function Recenter({ coordinates }: { coordinates: Coordinates }) {
  const map = useMap();
  useEffect(() => { map.setView([coordinates.latitude, coordinates.longitude], Math.max(map.getZoom(), 14)); }, [coordinates, map]);
  return null;
}

function ClickToPin({ onChange }: { onChange: (coordinates: Coordinates) => void }) {
  useMapEvents({
    click: ({ latlng }) => onChange({ latitude: latlng.lat, longitude: latlng.lng }),
  });
  return null;
}

export function LocationPinMap({ coordinates, onChange }: { coordinates: Coordinates; onChange: (coordinates: Coordinates) => void }) {
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  const useMapbox = process.env.NEXT_PUBLIC_MAP_PROVIDER === 'mapbox' && Boolean(mapboxToken);
  return (
    <MapContainer center={[coordinates.latitude, coordinates.longitude]} zoom={14} scrollWheelZoom className="h-56 w-full rounded-lg">
      <TileLayer
        attribution={useMapbox ? '&copy; Mapbox &copy; OpenStreetMap' : '&copy; OpenStreetMap contributors'}
        url={useMapbox && mapboxToken ? `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/256/{z}/{x}/{y}?access_token=${mapboxToken}` : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'}
      />
      <Recenter coordinates={coordinates} />
      <ClickToPin onChange={onChange} />
      <Marker
        position={[coordinates.latitude, coordinates.longitude]}
        icon={pinIcon}
        draggable
        eventHandlers={{ dragend: (event) => {
          const position = event.target.getLatLng();
          onChange({ latitude: position.lat, longitude: position.lng });
        } }}
      />
    </MapContainer>
  );
}
