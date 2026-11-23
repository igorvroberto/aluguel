"use client";

import { useEffect, useRef, useState } from "react";
import {
  LINHA_LARANJA_ATIVAS,
  LINHA_LARANJA_COLOR,
  LINHA_VERMELHA,
  LINHA_VERMELHA_COLOR,
} from "../../data/linhasMetro";
import { DESTINATION } from "@/lib/constants";
import { buildStationRadiusGeoJSON } from "@/lib/geo";
import {
  createStationLabelOverlay,
  loadGoogleMaps,
  svgCircleIcon,
  type StationLabelOverlay,
} from "@/lib/google-maps";
import {
  TRANSIT_ROUTE_LEGEND,
  transitModeMapColor,
  type TransitRouteResult,
} from "@/lib/transit";
import type { Apartment } from "@/lib/types";

const MAP_LEGEND_LINES = [
  { label: "Linha 3-Vermelha", color: LINHA_VERMELHA_COLOR },
  { label: "Linha 6-Laranja", color: LINHA_LARANJA_COLOR },
] as const;

const MAP_LEGEND_MARKERS = [
  { label: "Destino", color: "#f0b429" },
  { label: "Imóvel", color: "#145c5e" },
] as const;

interface MapViewProps {
  apiKey?: string;
  apartments: Apartment[];
  selectedId: string | null;
  googleTransitRoute?: TransitRouteResult | null;
  stationIds?: string[];
  stationRadiusMeters?: number;
  onSelectApartment: (id: string) => void;
}

function linePath(
  stations: { lat: number; lng: number }[]
): google.maps.LatLngLiteral[] {
  return stations.map((s) => ({ lat: s.lat, lng: s.lng }));
}

function polygonFromGeoJSON(
  feature: GeoJSON.Feature
): google.maps.LatLngLiteral[] | null {
  if (feature.geometry.type !== "Polygon") return null;
  const ring = feature.geometry.coordinates[0];
  if (!ring?.length) return null;
  return ring.map(([lng, lat]) => ({ lat, lng }));
}

export function MapView({
  apiKey,
  apartments,
  selectedId,
  googleTransitRoute = null,
  stationIds = [],
  stationRadiusMeters = 800,
  onSelectApartment,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const aptMarkersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const destMarkerRef = useRef<google.maps.Marker | null>(null);
  const routePolylinesRef = useRef<google.maps.Polyline[]>([]);
  const radiusPolygonsRef = useRef<google.maps.Polygon[]>([]);
  const linePolylinesRef = useRef<google.maps.Polyline[]>([]);
  const stationOverlaysRef = useRef<StationLabelOverlay[]>([]);
  const onSelectRef = useRef(onSelectApartment);
  onSelectRef.current = onSelectApartment;
  const [mapReady, setMapReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const showRouteLegend = Boolean(
    googleTransitRoute?.steps.some(
      (s) => s.coordinates && s.coordinates.length >= 2
    )
  );

  useEffect(() => {
    if (!apiKey || !containerRef.current || mapRef.current) return;
    let cancelled = false;

    loadGoogleMaps(apiKey)
      .then(() => {
        if (cancelled || !containerRef.current) return;

        // Se a key for rejeitada depois do load, o Google chama gm_authFailure.
        const prevAuth = window.gm_authFailure;
        window.gm_authFailure = () => {
          prevAuth?.();
          if (!cancelled) {
            setLoadError(
              "Autenticação Google Maps falhou. Ative Maps JavaScript API, faturamento, e libere este domínio nas restrições HTTP referrer da chave."
            );
            setMapReady(false);
          }
        };

        const map = new google.maps.Map(containerRef.current, {
          center: { lat: DESTINATION.lat, lng: DESTINATION.lng },
          zoom: 13,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          zoomControl: true,
          gestureHandling: "greedy",
          styles: [
            {
              featureType: "poi",
              elementType: "labels",
              stylers: [{ visibility: "off" }],
            },
          ],
        });
        mapRef.current = map;

        const linePolys: google.maps.Polyline[] = [];
        const stationOverlays: StationLabelOverlay[] = [];

        linePolys.push(
          new google.maps.Polyline({
            path: linePath(LINHA_VERMELHA),
            strokeColor: LINHA_VERMELHA_COLOR,
            strokeOpacity: 0.92,
            strokeWeight: 4,
            map,
            zIndex: 1,
          })
        );

        for (const s of LINHA_VERMELHA) {
          stationOverlays.push(
            createStationLabelOverlay(
              map,
              { lat: s.lat, lng: s.lng },
              s.name,
              LINHA_VERMELHA_COLOR,
              "#7f1d1d"
            )
          );
        }

        linePolys.push(
          new google.maps.Polyline({
            path: linePath(LINHA_LARANJA_ATIVAS),
            strokeColor: LINHA_LARANJA_COLOR,
            strokeOpacity: 0.92,
            strokeWeight: 4,
            map,
            zIndex: 1,
          })
        );

        for (const s of LINHA_LARANJA_ATIVAS) {
          stationOverlays.push(
            createStationLabelOverlay(
              map,
              { lat: s.lat, lng: s.lng },
              s.name,
              LINHA_LARANJA_COLOR,
              "#9a3412"
            )
          );
        }

        linePolylinesRef.current = linePolys;
        stationOverlaysRef.current = stationOverlays;

        destMarkerRef.current = new google.maps.Marker({
          position: { lat: DESTINATION.lat, lng: DESTINATION.lng },
          map,
          title: DESTINATION.name,
          icon: svgCircleIcon({
            fill: "#f0b429",
            stroke: "#0f172a",
            size: 28,
            strokeWidth: 3,
          }),
          zIndex: 10,
        });
        const destInfo = new google.maps.InfoWindow({
          content: `<strong>Destino</strong><br/>${DESTINATION.fullAddress}`,
        });
        destMarkerRef.current.addListener("click", () => {
          destInfo.open({ map, anchor: destMarkerRef.current! });
        });

        setMapReady(true);
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : "Falha ao carregar Google Maps"
          );
        }
      });

    return () => {
      cancelled = true;
      aptMarkersRef.current.forEach((m) => m.setMap(null));
      aptMarkersRef.current.clear();
      destMarkerRef.current?.setMap(null);
      destMarkerRef.current = null;
      routePolylinesRef.current.forEach((p) => p.setMap(null));
      routePolylinesRef.current = [];
      radiusPolygonsRef.current.forEach((p) => p.setMap(null));
      radiusPolygonsRef.current = [];
      linePolylinesRef.current.forEach((p) => p.setMap(null));
      linePolylinesRef.current = [];
      stationOverlaysRef.current.forEach((o) => o.setMap(null));
      stationOverlaysRef.current = [];
      mapRef.current = null;
      setMapReady(false);
    };
  }, [apiKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const seen = new Set<string>();
    for (const apt of apartments) {
      seen.add(apt.id);
      const selected = apt.id === selectedId;
      const icon = svgCircleIcon({
        fill: selected ? "#dc2626" : "#145c5e",
        stroke: selected ? "#0f172a" : "#ffffff",
        size: selected ? 26 : 16,
        strokeWidth: selected ? 3 : 2,
      });

      let marker = aptMarkersRef.current.get(apt.id);
      if (!marker) {
        marker = new google.maps.Marker({
          position: { lat: apt.lat, lng: apt.lng },
          map,
          title: apt.title,
          icon,
          zIndex: selected ? 20 : 5,
        });
        marker.addListener("click", () => {
          onSelectRef.current(apt.id);
        });
        aptMarkersRef.current.set(apt.id, marker);
      } else {
        marker.setPosition({ lat: apt.lat, lng: apt.lng });
        marker.setIcon(icon);
        marker.setTitle(apt.title);
        marker.setZIndex(selected ? 20 : 5);
        if (marker.getMap() !== map) marker.setMap(map);
      }
    }

    Array.from(aptMarkersRef.current.entries()).forEach(([id, marker]) => {
      if (!seen.has(id)) {
        marker.setMap(null);
        aptMarkersRef.current.delete(id);
      }
    });
  }, [apartments, selectedId, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    routePolylinesRef.current.forEach((p) => p.setMap(null));
    routePolylinesRef.current = [];

    const hasGeom =
      googleTransitRoute &&
      googleTransitRoute.steps.some(
        (s) => s.coordinates && s.coordinates.length >= 2
      );

    if (!hasGeom || !googleTransitRoute) return;

    const bounds = new google.maps.LatLngBounds();
    let hasPoint = false;

    for (const step of googleTransitRoute.steps) {
      const coords = step.coordinates;
      if (!coords || coords.length < 2) continue;
      const path = coords.map(([lng, lat]) => ({ lat, lng }));
      for (const p of path) {
        bounds.extend(p);
        hasPoint = true;
      }
      const poly = new google.maps.Polyline({
        path,
        strokeColor: transitModeMapColor(step.mode),
        strokeOpacity: 0.9,
        strokeWeight: 5,
        map,
        zIndex: 8,
      });
      routePolylinesRef.current.push(poly);
    }

    if (hasPoint) {
      map.fitBounds(bounds, 64);
    }
  }, [googleTransitRoute, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    radiusPolygonsRef.current.forEach((p) => p.setMap(null));
    radiusPolygonsRef.current = [];

    const fc = buildStationRadiusGeoJSON(stationIds, stationRadiusMeters);
    for (const feature of fc.features) {
      const path = polygonFromGeoJSON(feature);
      if (!path) continue;
      const color =
        (feature.properties?.color as string | undefined) || "#145c5e";
      const poly = new google.maps.Polygon({
        paths: path,
        strokeColor: color,
        strokeOpacity: 0.55,
        strokeWeight: 1.5,
        fillColor: color,
        fillOpacity: 0.12,
        map,
        zIndex: 0,
        clickable: false,
      });
      radiusPolygonsRef.current.push(poly);
    }
  }, [stationIds, stationRadiusMeters, mapReady]);

  if (!apiKey) {
    return (
      <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[radial-gradient(ellipse_at_top,_#d8ebe8_0%,_#e8eef2_45%,_#dce3ea_100%)]">
        <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(90deg,rgba(15,61,62,0.06)_1px,transparent_1px),linear-gradient(rgba(15,61,62,0.06)_1px,transparent_1px)] [background-size:40px_40px]" />
        <div className="relative z-10 mx-6 max-w-md rounded-xl border border-amber-300/80 bg-white/95 p-6 text-center shadow-lg">
          <p className="font-display text-lg font-semibold text-slate-900">
            Chave Google Maps não configurada
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Defina{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">
              GOOGLE_MAPS_API_KEY
            </code>{" "}
            (ou{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">
              NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
            </code>
            ) no{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">
              .env
            </code>{" "}
            da VPS e reinicie o container. Ative também a{" "}
            <strong>Maps JavaScript API</strong> no Google Cloud Console.
          </p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[radial-gradient(ellipse_at_top,_#d8ebe8_0%,_#e8eef2_45%,_#dce3ea_100%)] p-6">
        <div className="relative z-10 mx-6 max-w-lg rounded-xl border border-amber-300/80 bg-white/95 p-6 text-center shadow-lg">
          <p className="font-display text-lg font-semibold text-slate-900">
            Google Maps não carregou
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            {loadError}
          </p>
          <p className="mt-3 text-left text-xs leading-relaxed text-slate-500">
            No console:{" "}
            <code className="rounded bg-slate-100 px-1 font-mono">
              ApiTargetBlockedMapError
            </code>{" "}
            = inclua Maps JavaScript API nas restrições da chave;{" "}
            <code className="rounded bg-slate-100 px-1 font-mono">
              RefererNotAllowedMapError
            </code>{" "}
            = libere este domínio nos HTTP referrers.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {mapReady && !loadError ? (
        <aside
          className="pointer-events-none absolute bottom-3 left-3 z-10 max-w-[220px] rounded-lg border border-slate-200/90 bg-white/95 px-2.5 py-2 shadow-md backdrop-blur-sm"
          aria-label="Legenda do mapa"
        >
          {showRouteLegend ? (
            <div className="mb-2">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Trajeto
              </p>
              <ul className="space-y-1">
                {TRANSIT_ROUTE_LEGEND.map((item) => (
                  <li
                    key={item.mode}
                    className="flex items-center gap-2 text-[11px] text-slate-700"
                  >
                    <span
                      className="h-1 w-5 shrink-0 rounded-full"
                      style={{ backgroundColor: item.color }}
                      aria-hidden
                    />
                    {item.label}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className={showRouteLegend ? "border-t border-slate-100 pt-2" : ""}>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Rede / pontos
            </p>
            <ul className="space-y-1">
              {MAP_LEGEND_LINES.map((item) => (
                <li
                  key={item.label}
                  className="flex items-center gap-2 text-[11px] text-slate-700"
                >
                  <span
                    className="h-1 w-5 shrink-0 rounded-full"
                    style={{ backgroundColor: item.color }}
                    aria-hidden
                  />
                  {item.label}
                </li>
              ))}
              {MAP_LEGEND_MARKERS.map((item) => (
                <li
                  key={item.label}
                  className="flex items-center gap-2 text-[11px] text-slate-700"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full border border-white shadow-sm"
                    style={{ backgroundColor: item.color }}
                    aria-hidden
                  />
                  {item.label}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      ) : null}
    </div>
  );
}
