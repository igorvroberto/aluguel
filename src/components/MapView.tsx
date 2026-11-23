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
import { loadGoogleMaps, svgCircleIcon } from "@/lib/google-maps";
import {
  transitModeMapColor,
  type TransitRouteResult,
} from "@/lib/transit";
import type { Apartment } from "@/lib/types";

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
  const staticOverlaysRef = useRef<
    Array<google.maps.Polyline | google.maps.Marker>
  >([]);
  const onSelectRef = useRef(onSelectApartment);
  onSelectRef.current = onSelectApartment;
  const [mapReady, setMapReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!apiKey || !containerRef.current || mapRef.current) return;
    let cancelled = false;

    loadGoogleMaps(apiKey)
      .then(() => {
        if (cancelled || !containerRef.current) return;

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

        const overlays: Array<google.maps.Polyline | google.maps.Marker> = [];

        const l3 = new google.maps.Polyline({
          path: linePath(LINHA_VERMELHA),
          strokeColor: LINHA_VERMELHA_COLOR,
          strokeOpacity: 0.92,
          strokeWeight: 4,
          map,
          zIndex: 1,
        });
        overlays.push(l3);

        for (const s of LINHA_VERMELHA) {
          overlays.push(
            new google.maps.Marker({
              position: { lat: s.lat, lng: s.lng },
              map,
              title: s.name,
              icon: svgCircleIcon({
                fill: LINHA_VERMELHA_COLOR,
                size: 14,
                strokeWidth: 2,
              }),
              zIndex: 2,
            })
          );
        }

        const l6 = new google.maps.Polyline({
          path: linePath(LINHA_LARANJA_ATIVAS),
          strokeColor: LINHA_LARANJA_COLOR,
          strokeOpacity: 0.92,
          strokeWeight: 4,
          map,
          zIndex: 1,
        });
        overlays.push(l6);

        for (const s of LINHA_LARANJA_ATIVAS) {
          overlays.push(
            new google.maps.Marker({
              position: { lat: s.lat, lng: s.lng },
              map,
              title: s.name,
              icon: svgCircleIcon({
                fill: LINHA_LARANJA_COLOR,
                size: 14,
                strokeWidth: 2,
              }),
              zIndex: 2,
            })
          );
        }

        staticOverlaysRef.current = overlays;

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
      staticOverlaysRef.current.forEach((o) => o.setMap(null));
      staticOverlaysRef.current = [];
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
              NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
            </code>{" "}
            (Maps JavaScript API) em{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">
              .env
            </code>{" "}
            ou{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">
              .env.local
            </code>{" "}
            e faça rebuild. Pode ser a mesma chave de{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">
              GOOGLE_MAPS_API_KEY
            </code>{" "}
            se a API de Maps JavaScript estiver habilitada.
          </p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="relative flex h-full w-full items-center justify-center bg-slate-100 p-6 text-center">
        <p className="max-w-md text-sm text-slate-600">
          Não foi possível carregar o Google Maps: {loadError}
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
