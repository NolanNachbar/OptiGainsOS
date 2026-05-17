import { useMemo, useEffect } from "react";
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

function decodePolyline(encoded) {
  if (!encoded) return [];
  const points = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let shift = 0, result = 0, byte;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : result >> 1;

    shift = 0; result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : result >> 1;

    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length < 2) return;
    // Defer so the container has its final CSS dimensions before we fit
    const t = setTimeout(() => {
      map.invalidateSize();
      map.fitBounds(points, { padding: [10, 10], animate: false });
    }, 50);
    return () => clearTimeout(t);
  }, [map, points]);
  return null;
}

export default function StaticRouteMap({ polyline, mapKey, height = 220 }) {
  const points = useMemo(() => decodePolyline(polyline), [polyline]);

  if (points.length < 2) return null;

  const center = [
    (points[0][0] + points[points.length - 1][0]) / 2,
    (points[0][1] + points[points.length - 1][1]) / 2,
  ];

  return (
    <div style={{ height, isolation: "isolate" }} className="w-full overflow-hidden">
      <MapContainer
        key={mapKey}
        center={center}
        zoom={13}
        style={{ height: "100%", width: "100%", cursor: "default" }}
        zoomControl={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        dragging={false}
        keyboard={false}
        touchZoom={false}
        boxZoom={false}
        attributionControl={false}
      >
        <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
        <FitBounds points={points} />
        <Polyline
          positions={points}
          pathOptions={{ color: "rgba(0,0,0,0.18)", weight: 6, lineCap: "round", lineJoin: "round" }}
        />
        <Polyline
          positions={points}
          pathOptions={{ color: "#FC4C02", weight: 3.5, lineCap: "round", lineJoin: "round" }}
        />
        <CircleMarker
          center={points[0]}
          radius={5}
          pathOptions={{ fillColor: "#22c55e", color: "white", weight: 2, fillOpacity: 1 }}
        />
        <CircleMarker
          center={points[points.length - 1]}
          radius={5}
          pathOptions={{ fillColor: "#ef4444", color: "white", weight: 2, fillOpacity: 1 }}
        />
      </MapContainer>
    </div>
  );
}
