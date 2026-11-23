"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { LINHA_VERMELHA_COLOR } from "../../data/linhasMetro";
import { DESTINATION, MAPBOX_STYLE } from "@/lib/constants";
import {
  buildLinhaLaranjaLineGeoJSON,
  buildLinhaLaranjaStationsGeoJSON,
  buildLinhaVermelhaLineGeoJSON,
  buildLinhaVermelhaStationsGeoJSON,
  buildStationRadiusGeoJSON,
} from "@/lib/geo";
import {
  transitModeMapColor,
  type TransitRouteResult,
} from "@/lib/transit";
import type { Apartment } from "@/lib/types";
import "mapbox-gl/dist/mapbox-gl.css";

interface MapViewProps {
  token?: string;
  apartments: Apartment[];
  selectedId: string | null;
  googleTransitRoute?: TransitRouteResult | null;
  stationIds?: string[];
  stationRadiusMeters?: number;
  onSelectApartment: (id: string) => void;
}

const ROUTE_SOURCE = "route-segments";
const L3_LINE_SOURCE = "linha-vermelha-line";
const L3_STATIONS_SOURCE = "linha-vermelha-stations";
const L6_LINE_SOURCE = "linha-laranja-line";
const L6_STATIONS_SOURCE = "linha-laranja-stations";
const METRO_RADIUS_SOURCE = "metro-station-radii";

function buildGoogleTransitFeatures(
  route: TransitRouteResult
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const step of route.steps) {
    const coords = step.coordinates;
    if (!coords || coords.length < 2) continue;
    features.push({
      type: "Feature",
      properties: {
        mode: step.mode,
        color: transitModeMapColor(step.mode),
      },
      geometry: {
        type: "LineString",
        coordinates: coords,
      },
    });
  }
  return { type: "FeatureCollection", features };
}

export function MapView({
  token,
  apartments,
  selectedId,
  googleTransitRoute = null,
  stationIds = [],
  stationRadiusMeters = 800,
  onSelectApartment,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const destMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (!token || !containerRef.current || mapRef.current) return;

    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAPBOX_STYLE,
      center: [DESTINATION.lng, DESTINATION.lat],
      zoom: 13,
      pitch: 0,
      bearing: 0,
      antialias: true,
    });

    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    mapRef.current = map;

    const setupLayers = () => {
      if (!map.getSource(ROUTE_SOURCE)) {
        map.addSource(ROUTE_SOURCE, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addLayer({
          id: "route-line",
          type: "line",
          source: ROUTE_SOURCE,
          layout: {
            "line-join": "round",
            "line-cap": "round",
          },
          paint: {
            "line-color": ["get", "color"],
            "line-width": 5,
            "line-opacity": 0.9,
          },
        });
      }

      if (!map.getSource(L3_LINE_SOURCE)) {
        map.addSource(L3_LINE_SOURCE, {
          type: "geojson",
          data: buildLinhaVermelhaLineGeoJSON(),
        });
        map.addLayer({
          id: "l3-line",
          type: "line",
          source: L3_LINE_SOURCE,
          layout: {
            "line-join": "round",
            "line-cap": "round",
            visibility: "visible",
          },
          paint: {
            "line-color": LINHA_VERMELHA_COLOR,
            "line-width": 3.5,
            "line-opacity": 0.92,
          },
        });
      }

      if (!map.getSource(L3_STATIONS_SOURCE)) {
        map.addSource(L3_STATIONS_SOURCE, {
          type: "geojson",
          data: buildLinhaVermelhaStationsGeoJSON(),
        });
        map.addLayer({
          id: "l3-stations",
          type: "circle",
          source: L3_STATIONS_SOURCE,
          layout: { visibility: "visible" },
          paint: {
            "circle-radius": 6.5,
            "circle-color": LINHA_VERMELHA_COLOR,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
          },
        });
        map.addLayer({
          id: "l3-station-labels",
          type: "symbol",
          source: L3_STATIONS_SOURCE,
          layout: {
            visibility: "visible",
            "text-field": ["get", "name"],
            "text-size": 10,
            "text-offset": [0, 1.15],
            "text-anchor": "top",
            "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"],
            "text-optional": true,
          },
          paint: {
            "text-color": "#7f1d1d",
            "text-halo-color": "#ffffff",
            "text-halo-width": 1.4,
          },
        });
      }

      if (!map.getSource(L6_LINE_SOURCE)) {
        map.addSource(L6_LINE_SOURCE, {
          type: "geojson",
          data: buildLinhaLaranjaLineGeoJSON(),
        });
        map.addLayer({
          id: "l6-line",
          type: "line",
          source: L6_LINE_SOURCE,
          layout: {
            "line-join": "round",
            "line-cap": "round",
            visibility: "visible",
          },
          paint: {
            "line-color": "#FF6B00",
            "line-width": 3.5,
            "line-opacity": 0.92,
          },
        });
      }

      if (!map.getSource(L6_STATIONS_SOURCE)) {
        map.addSource(L6_STATIONS_SOURCE, {
          type: "geojson",
          data: buildLinhaLaranjaStationsGeoJSON(),
        });
        map.addLayer({
          id: "l6-stations",
          type: "circle",
          source: L6_STATIONS_SOURCE,
          layout: { visibility: "visible" },
          paint: {
            "circle-radius": 6.5,
            "circle-color": "#FF6B00",
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
          },
        });
        map.addLayer({
          id: "l6-station-labels",
          type: "symbol",
          source: L6_STATIONS_SOURCE,
          layout: {
            visibility: "visible",
            "text-field": ["get", "name"],
            "text-size": 10,
            "text-offset": [0, 1.15],
            "text-anchor": "top",
            "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"],
            "text-optional": true,
          },
          paint: {
            "text-color": "#9a3412",
            "text-halo-color": "#ffffff",
            "text-halo-width": 1.4,
          },
        });
      }

      if (!map.getSource(METRO_RADIUS_SOURCE)) {
        map.addSource(METRO_RADIUS_SOURCE, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addLayer({
          id: "metro-radius-fill",
          type: "fill",
          source: METRO_RADIUS_SOURCE,
          paint: {
            "fill-color": ["get", "color"],
            "fill-opacity": 0.12,
          },
        });
        map.addLayer({
          id: "metro-radius-outline",
          type: "line",
          source: METRO_RADIUS_SOURCE,
          paint: {
            "line-color": ["get", "color"],
            "line-width": 1.5,
            "line-opacity": 0.55,
          },
        });
      }

      setMapReady(true);
    };

    map.on("style.load", setupLayers);

    const destEl = document.createElement("div");
    destEl.className = "perdizes-dest-marker";
    destEl.innerHTML = `<div class="dest-pin" title="${DESTINATION.name}"></div>`;
    destMarkerRef.current = new mapboxgl.Marker({ element: destEl })
      .setLngLat([DESTINATION.lng, DESTINATION.lat])
      .setPopup(
        new mapboxgl.Popup({ offset: 18 }).setHTML(
          `<strong>Destino</strong><br/>${DESTINATION.fullAddress}`
        )
      )
      .addTo(map);

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      destMarkerRef.current?.remove();
      destMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [token]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !token) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    apartments.forEach((apt) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = `perdizes-apt-marker${
        apt.id === selectedId ? " is-selected" : ""
      }`;
      el.title = apt.title;
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        onSelectApartment(apt.id);
      });

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([apt.lng, apt.lat])
        .addTo(map);
      markersRef.current.push(marker);
    });
  }, [apartments, selectedId, token, onSelectApartment, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource(ROUTE_SOURCE)) return;

    const source = map.getSource(ROUTE_SOURCE) as mapboxgl.GeoJSONSource;
    const hasGeom =
      googleTransitRoute &&
      googleTransitRoute.steps.some(
        (s) => s.coordinates && s.coordinates.length >= 2
      );

    if (!hasGeom || !googleTransitRoute) {
      source.setData({ type: "FeatureCollection", features: [] });
      return;
    }

    const fc = buildGoogleTransitFeatures(googleTransitRoute);
    source.setData(fc);
    const bounds = new mapboxgl.LngLatBounds();
    let hasPoint = false;
    for (const f of fc.features) {
      const coords = (f.geometry as GeoJSON.LineString).coordinates;
      for (const c of coords) {
        bounds.extend(c as [number, number]);
        hasPoint = true;
      }
    }
    if (hasPoint) {
      map.fitBounds(bounds, {
        padding: 64,
        duration: 800,
        maxZoom: 16,
      });
    }
  }, [googleTransitRoute, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource(METRO_RADIUS_SOURCE)) return;
    const source = map.getSource(METRO_RADIUS_SOURCE) as mapboxgl.GeoJSONSource;
    source.setData(buildStationRadiusGeoJSON(stationIds, stationRadiusMeters));
  }, [stationIds, stationRadiusMeters, mapReady]);

  if (!token) {
    return (
      <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[radial-gradient(ellipse_at_top,_#d8ebe8_0%,_#e8eef2_45%,_#dce3ea_100%)]">
        <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(90deg,rgba(15,61,62,0.06)_1px,transparent_1px),linear-gradient(rgba(15,61,62,0.06)_1px,transparent_1px)] [background-size:40px_40px]" />
        <div className="relative z-10 mx-6 max-w-md rounded-xl border border-amber-300/80 bg-white/95 p-6 text-center shadow-lg">
          <p className="font-display text-lg font-semibold text-slate-900">
            Token Mapbox não configurado
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Defina{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">
              NEXT_PUBLIC_MAPBOX_TOKEN
            </code>{" "}
            em{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">
              .env
            </code>{" "}
            (VPS) ou{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">
              .env.local
            </code>{" "}
            (local) e faça rebuild.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
