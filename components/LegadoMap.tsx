"use client";

import { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L, { type Marker as LeafletMarker } from "leaflet";
import "leaflet/dist/leaflet.css";

type CityRow = {
  id: string;
  city_uf: string | null;
  church_name: string | null;
  address: string | null;
  pastor_name: string | null;
  leader_ministry_name: string | null;
  leader_phone: string | null;
  lat: number | null;
  lng: number | null;
};

export type LegadoMapProps = {
  rows: CityRow[];
  selectedId: string | null;
  defaultCenter: [number, number];
  defaultZoom: number;
  target: { lat: number; lng: number } | null;
  makeWhatsAppLink: (phone: string | null) => string | null;
  safeText: (v: string | null | undefined) => string;
};

// ✅ Corrige ícones padrão do Leaflet no Next
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function FlyToAndOpen({
  target,
  selectedId,
  markerRefs,
}: {
  target: { lat: number; lng: number } | null;
  selectedId: string | null;
  markerRefs: React.MutableRefObject<Record<string, LeafletMarker | null>>;
}) {
  const map = useMap();

  useEffect(() => {
    if (!target) return;

    // ✅ voa pro ponto
    map.flyTo([target.lat, target.lng], 12, { duration: 1.2 });

    // ✅ abre popup do marker selecionado
    if (selectedId) {
      const mk = markerRefs.current[selectedId];
      if (mk) {
        // pequeno delay pra garantir que o flyTo já começou
        setTimeout(() => {
          try {
            mk.openPopup();
          } catch {}
        }, 150);
      }
    }
  }, [target, selectedId, map, markerRefs]);

  return null;
}

export default function LegadoMap({
  rows,
  selectedId,
  defaultCenter,
  defaultZoom,
  target,
  makeWhatsAppLink,
  safeText,
}: LegadoMapProps) {
  const markerRefs = useRef<Record<string, LeafletMarker | null>>({});

  const rowsWithCoords = useMemo(
    () => rows.filter((r) => r.lat != null && r.lng != null),
    [rows]
  );

  return (
    <MapContainer
      center={defaultCenter}
      zoom={defaultZoom}
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        attribution='&copy; OpenStreetMap'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <FlyToAndOpen target={target} selectedId={selectedId} markerRefs={markerRefs} />

      {rowsWithCoords.map((r) => {
        const wa = makeWhatsAppLink(r.leader_phone);

        return (
          <Marker
            key={r.id}
            position={[r.lat as number, r.lng as number]}
            ref={(ref) => {
              markerRefs.current[r.id] = ref as unknown as LeafletMarker | null;
            }}
          >
            <Popup>
              <div className="space-y-1">
                <div className="font-semibold">{safeText(r.city_uf) || "—"}</div>
                <div>
                  <b>Igreja:</b> {safeText(r.church_name) || "—"}
                </div>
                <div>
                  <b>Pastor:</b> {safeText(r.pastor_name) || "—"}
                </div>
                <div>
                  <b>Líder:</b> {safeText(r.leader_ministry_name) || "—"}
                </div>
                <div>
                  <b>Endereço:</b> {safeText(r.address) || "—"}
                </div>
                {wa ? (
                  <div>
                    <a
                      href={wa}
                      target="_blank"
                      rel="noreferrer"
                      className="underline font-semibold"
                    >
                      WhatsApp do líder
                    </a>
                  </div>
                ) : null}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
