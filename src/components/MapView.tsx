"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import {
  LINHA_VERMELHA_COLOR,
  METRO_STATIONS,
} from "../../data/linhasMetro";
import {
  BUS_CORRIDORS,
  DESTINATION,
  MAPBOX_STYLE,
  TRANSIT_STATIONS,
} from "@/lib/constants";
import {
  BUS_LINES,
  BUS_LINE_WIDTH,
  buildBusLinesGeoJSON,
} from "@/lib/bus-lines";
import type { MapLayersState } from "@/components/MapLayersPanel";
import { gradeBucket } from "@/lib/elevation";
import { gradeColor } from "@/lib/format";
import {
  buildLinhaLaranjaLineGeoJSON,
  buildLinhaLaranjaStationsGeoJSON,
  buildLinhaVermelhaLineGeoJSON,
  buildLinhaVermelhaStationsGeoJSON,
  buildStationRadiusGeoJSON,
} from "@/lib/geo";
import type { Apartment, RouteAnalysis } from "@/lib/types";
import "mapbox-gl/dist/mapbox-gl.css";

interface MapViewProps {
  token?: string;
  apartments: Apartment[];
  selectedId: string | null;
  analysis: RouteAnalysis | null;
  hoverDistance: number | null;
  stationIds?: string[];
  stationRadiusMeters?: number;
  focusStationsToken?: number;
  layers: MapLayersState;
  onMapReady: (map: mapboxgl.Map) => void;
  onSelectApartment: (id: string) => void;
}

const DEM_SOURCE = "mapbox-dem";
const ROUTE_SOURCE = "route-segments";
const TRANSIT_SOURCE = "transit-overlay";
const BUS_LINES_SOURCE = "bus-lines-dedicated";
const HOVER_SOURCE = "hover-point";
const L3_LINE_SOURCE = "linha-vermelha-line";
const L3_STATIONS_SOURCE = "linha-vermelha-stations";
const L6_LINE_SOURCE = "linha-laranja-line";
const L6_STATIONS_SOURCE = "linha-laranja-stations";
const METRO_RADIUS_SOURCE = "metro-station-radii";

function buildSegmentFeatures(analysis: RouteAnalysis) {
  const features: GeoJSON.Feature[] = [];
  const coords = analysis.elevationProfile.map(
    (p) => [p.lng, p.lat] as [number, number]
  );

  for (let i = 0; i < coords.length - 1; i++) {
    const grade = analysis.segmentGrades[i] ?? 0;
    const bucket = gradeBucket(grade);
    features.push({
      type: "Feature",
      properties: {
        grade,
        color: gradeColor(grade),
        bucket,
      },
      geometry: {
        type: "LineString",
        coordinates: [coords[i], coords[i + 1]],
      },
    });
  }

  return {
    type: "FeatureCollection" as const,
    features,
  };
}

function buildTransitGeoJSON(): GeoJSON.FeatureCollection {
  const stationFeatures: GeoJSON.Feature[] = TRANSIT_STATIONS.map((s) => ({
    type: "Feature",
    properties: {
      kind: "station",
      name: s.name,
      line: s.line,
      color: s.color,
    },
    geometry: {
      type: "Point",
      coordinates: [s.lng, s.lat],
    },
  }));

  const corridorFeatures: GeoJSON.Feature[] = BUS_CORRIDORS.map((c) => ({
    type: "Feature",
    properties: {
      kind: "bus",
      name: c.name,
      lines: c.lines.join(", "),
    },
    geometry: {
      type: "LineString",
      coordinates: c.coordinates,
    },
  }));

  return {
    type: "FeatureCollection",
    features: [...corridorFeatures, ...stationFeatures],
  };
}

function busLayerId(lineId: string) {
  return `bus-line-${lineId}`;
}

export function MapView({
  token,
  apartments,
  selectedId,
  analysis,
  hoverDistance,
  stationIds = [],
  stationRadiusMeters = 800,
  focusStationsToken = 0,
  layers,
  onMapReady,
  onSelectApartment,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const destMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const [terrainReady, setTerrainReady] = useState(false);
  const onMapReadyRef = useRef(onMapReady);
  onMapReadyRef.current = onMapReady;

  useEffect(() => {
    if (!token || !containerRef.current || mapRef.current) return;

    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAPBOX_STYLE,
      center: [DESTINATION.lng, DESTINATION.lat],
      zoom: 14,
      pitch: 45,
      bearing: -20,
      antialias: true,
    });

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");
    mapRef.current = map;
    popupRef.current = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 8,
      className: "bus-line-popup",
    });

    const setupTerrainAndLayers = () => {
      if (!map.getSource(DEM_SOURCE)) {
        map.addSource(DEM_SOURCE, {
          type: "raster-dem",
          url: "mapbox://mapbox.mapbox-terrain-dem-v1",
          tileSize: 512,
          maxzoom: 14,
        });
      }
      map.setTerrain({ source: DEM_SOURCE, exaggeration: 1.4 });

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

      if (!map.getSource(HOVER_SOURCE)) {
        map.addSource(HOVER_SOURCE, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addLayer({
          id: "hover-point",
          type: "circle",
          source: HOVER_SOURCE,
          paint: {
            "circle-radius": 7,
            "circle-color": "#f0b429",
            "circle-stroke-width": 2,
            "circle-stroke-color": "#0f172a",
          },
        });
      }

      if (!map.getSource(BUS_LINES_SOURCE)) {
        map.addSource(BUS_LINES_SOURCE, {
          type: "geojson",
          data: buildBusLinesGeoJSON(),
        });

        BUS_LINES.forEach((line) => {
          const layerId = busLayerId(line.id);
          if (map.getLayer(layerId)) return;
          map.addLayer({
            id: layerId,
            type: "line",
            source: BUS_LINES_SOURCE,
            filter: ["==", ["get", "id"], line.id],
            layout: {
              "line-join": "round",
              "line-cap": "round",
              visibility: "visible",
            },
            paint: {
              "line-color": line.color,
              "line-width": BUS_LINE_WIDTH,
              "line-opacity": 0.92,
              "line-offset": line.offset,
            },
          });

          map.on("mouseenter", layerId, (e) => {
            map.getCanvas().style.cursor = "pointer";
            const feat = e.features?.[0];
            if (!feat || !e.lngLat || !popupRef.current) return;
            const p = feat.properties || {};
            popupRef.current
              .setLngLat(e.lngLat)
              .setHTML(
                `<strong style="color:${p.color}">${p.code}</strong><br/>` +
                  `<span>${p.name}</span><br/>` +
                  `<span style="opacity:.8">${p.itinerary}</span>`
              )
              .addTo(map);
          });
          map.on("mousemove", layerId, (e) => {
            if (e.lngLat && popupRef.current?.isOpen()) {
              popupRef.current.setLngLat(e.lngLat);
            }
          });
          map.on("mouseleave", layerId, () => {
            map.getCanvas().style.cursor = "";
            popupRef.current?.remove();
          });
        });
      }

      if (!map.getSource(TRANSIT_SOURCE)) {
        map.addSource(TRANSIT_SOURCE, {
          type: "geojson",
          data: buildTransitGeoJSON(),
        });
        map.addLayer({
          id: "bus-corridors",
          type: "line",
          source: TRANSIT_SOURCE,
          filter: ["==", ["get", "kind"], "bus"],
          layout: {
            "line-join": "round",
            "line-cap": "round",
            visibility: "none",
          },
          paint: {
            "line-color": "#64748b",
            "line-width": 3,
            "line-opacity": 0.35,
            "line-dasharray": [2, 1.5],
          },
        });
        map.addLayer({
          id: "transit-stations",
          type: "circle",
          source: TRANSIT_SOURCE,
          filter: ["==", ["get", "kind"], "station"],
          layout: { visibility: "none" },
          paint: {
            "circle-radius": 8,
            "circle-color": ["get", "color"],
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
          },
        });
        map.addLayer({
          id: "transit-station-labels",
          type: "symbol",
          source: TRANSIT_SOURCE,
          filter: ["==", ["get", "kind"], "station"],
          layout: {
            visibility: "none",
            "text-field": ["concat", ["get", "name"], "\n", ["get", "line"]],
            "text-size": 11,
            "text-offset": [0, 1.4],
            "text-anchor": "top",
            "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"],
          },
          paint: {
            "text-color": "#0f172a",
            "text-halo-color": "#ffffff",
            "text-halo-width": 1.5,
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

      setTerrainReady(true);
      onMapReadyRef.current(map);
    };

    map.on("style.load", setupTerrainAndLayers);

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
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
      setTerrainReady(false);
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
  }, [apartments, selectedId, token, onSelectApartment, terrainReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource(ROUTE_SOURCE)) return;

    const source = map.getSource(ROUTE_SOURCE) as mapboxgl.GeoJSONSource;
    if (!analysis) {
      source.setData({ type: "FeatureCollection", features: [] });
      return;
    }

    source.setData(buildSegmentFeatures(analysis));

    const bounds = new mapboxgl.LngLatBounds();
    analysis.elevationProfile.forEach((p) => bounds.extend([p.lng, p.lat]));
    bounds.extend([DESTINATION.lng, DESTINATION.lat]);
    map.fitBounds(bounds, { padding: 64, duration: 800, maxZoom: 16, pitch: 50 });
  }, [analysis]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource(HOVER_SOURCE)) return;
    const source = map.getSource(HOVER_SOURCE) as mapboxgl.GeoJSONSource;

    if (!analysis || hoverDistance == null) {
      source.setData({ type: "FeatureCollection", features: [] });
      return;
    }

    const point = analysis.elevationProfile.reduce((best, cur) =>
      Math.abs(cur.distance - hoverDistance) <
      Math.abs(best.distance - hoverDistance)
        ? cur
        : best
    );

    source.setData({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Point",
            coordinates: [point.lng, point.lat],
          },
        },
      ],
    });
  }, [hoverDistance, analysis]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("bus-corridors")) return;
    const visibility = layers.showTransit ? "visible" : "none";
    map.setLayoutProperty("bus-corridors", "visibility", visibility);
    map.setLayoutProperty("transit-stations", "visibility", visibility);
    map.setLayoutProperty("transit-station-labels", "visibility", visibility);
  }, [layers.showTransit, terrainReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("l3-line")) return;
    const visibility = layers.showLinhaVermelha ? "visible" : "none";
    map.setLayoutProperty("l3-line", "visibility", visibility);
    map.setLayoutProperty("l3-stations", "visibility", visibility);
    map.setLayoutProperty("l3-station-labels", "visibility", visibility);
  }, [layers.showLinhaVermelha, terrainReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("l6-line")) return;
    const visibility = layers.showLinhaLaranja ? "visible" : "none";
    map.setLayoutProperty("l6-line", "visibility", visibility);
    map.setLayoutProperty("l6-stations", "visibility", visibility);
    map.setLayoutProperty("l6-station-labels", "visibility", visibility);
  }, [layers.showLinhaLaranja, terrainReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource(METRO_RADIUS_SOURCE)) return;
    const source = map.getSource(METRO_RADIUS_SOURCE) as mapboxgl.GeoJSONSource;
    source.setData(
      buildStationRadiusGeoJSON(stationIds, stationRadiusMeters)
    );
  }, [stationIds, stationRadiusMeters, terrainReady]);

  useEffect(() => {
    if (!focusStationsToken) return;
    const map = mapRef.current;
    if (!map || stationIds.length === 0) return;

    const selected = METRO_STATIONS.filter((s) => stationIds.includes(s.id));
    if (selected.length === 0) return;

    const bounds = new mapboxgl.LngLatBounds();
    // ~1° lat ≈ 111 km; padding roughly by radius in degrees
    const padDeg = stationRadiusMeters / 111_000;
    selected.forEach((s) => {
      bounds.extend([s.lng - padDeg, s.lat - padDeg]);
      bounds.extend([s.lng + padDeg, s.lat + padDeg]);
    });
    map.fitBounds(bounds, {
      padding: 72,
      duration: 900,
      maxZoom: 15,
      pitch: 40,
    });
  }, [focusStationsToken, stationIds, stationRadiusMeters]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    BUS_LINES.forEach((line) => {
      const layerId = busLayerId(line.id);
      if (!map.getLayer(layerId)) return;
      const on =
        layers.showBusLines && layers.enabledLines[line.id] !== false;
      map.setLayoutProperty(layerId, "visibility", on ? "visible" : "none");
    });
  }, [layers.showBusLines, layers.enabledLines, terrainReady]);

  if (!token) {
    return (
      <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[radial-gradient(ellipse_at_top,_#d8ebe8_0%,_#e8eef2_45%,_#dce3ea_100%)]">
        <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(90deg,rgba(15,61,62,0.06)_1px,transparent_1px),linear-gradient(rgba(15,61,62,0.06)_1px,transparent_1px)] [background-size:40px_40px]" />
        <div className="relative z-10 mx-6 max-w-md rounded-xl border border-amber-300/80 bg-white/95 p-6 text-center shadow-lg">
          <p className="font-display text-lg font-semibold text-slate-900">
            Token Mapbox não configurado
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Defina <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">NEXT_PUBLIC_MAPBOX_TOKEN</code>{" "}
            em <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">.env</code>{" "}
            (VPS) ou <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">.env.local</code>{" "}
            (local) e faça rebuild. O restante da interface continua funcional.
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
