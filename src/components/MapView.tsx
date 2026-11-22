"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { Bus, TrainFront } from "lucide-react";
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
import { gradeBucket } from "@/lib/elevation";
import { gradeColor } from "@/lib/format";
import type { Apartment, RouteAnalysis } from "@/lib/types";
import "mapbox-gl/dist/mapbox-gl.css";

interface MapViewProps {
  token?: string;
  apartments: Apartment[];
  selectedId: string | null;
  analysis: RouteAnalysis | null;
  hoverDistance: number | null;
  onMapReady: (map: mapboxgl.Map) => void;
  onSelectApartment: (id: string) => void;
}

const DEM_SOURCE = "mapbox-dem";
const ROUTE_SOURCE = "route-segments";
const TRANSIT_SOURCE = "transit-overlay";
const BUS_LINES_SOURCE = "bus-lines-dedicated";
const HOVER_SOURCE = "hover-point";

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
  onMapReady,
  onSelectApartment,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const destMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const [showTransit, setShowTransit] = useState(false);
  const [showBusLines, setShowBusLines] = useState(true);
  const [enabledLines, setEnabledLines] = useState<Record<string, boolean>>(
    () => Object.fromEntries(BUS_LINES.map((l) => [l.id, true]))
  );
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
    const visibility = showTransit ? "visible" : "none";
    map.setLayoutProperty("bus-corridors", "visibility", visibility);
    map.setLayoutProperty("transit-stations", "visibility", visibility);
    map.setLayoutProperty("transit-station-labels", "visibility", visibility);
  }, [showTransit]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    BUS_LINES.forEach((line) => {
      const layerId = busLayerId(line.id);
      if (!map.getLayer(layerId)) return;
      const on = showBusLines && enabledLines[line.id] !== false;
      map.setLayoutProperty(layerId, "visibility", on ? "visible" : "none");
    });
  }, [showBusLines, enabledLines, terrainReady]);

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

      <div className="absolute left-3 top-3 z-10 flex max-h-[calc(100%-1.5rem)] flex-col gap-2 overflow-y-auto">
        <button
          type="button"
          onClick={() => setShowBusLines((v) => !v)}
          className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold shadow-md backdrop-blur transition ${
            showBusLines
              ? "border-teal-700 bg-teal-700 text-white"
              : "border-white/70 bg-white/90 text-slate-700 hover:bg-white"
          }`}
        >
          <Bus className="h-3.5 w-3.5" aria-hidden />
          {showBusLines ? "Ocultar linhas de ônibus" : "Linhas Barra Funda"}
        </button>

        {showBusLines && (
          <div className="max-w-[260px] rounded-md border border-white/70 bg-white/95 p-3 text-[11px] text-slate-600 shadow-md">
            <p className="mb-2 font-semibold text-slate-800">
              Linhas (trilho paralelo · sem sobreposição)
            </p>
            <ul className="space-y-2">
              {BUS_LINES.map((line) => {
                const on = enabledLines[line.id] !== false;
                return (
                  <li key={line.id}>
                    <label className="flex cursor-pointer gap-2">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() =>
                          setEnabledLines((prev) => ({
                            ...prev,
                            [line.id]: !on,
                          }))
                        }
                        className="mt-0.5 accent-teal-700"
                      />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 font-semibold text-slate-800">
                          <span
                            className="inline-block h-1.5 w-5 rounded-full"
                            style={{ backgroundColor: line.color }}
                          />
                          {line.code}
                        </span>
                        <span className="block text-[10px] leading-snug text-slate-500">
                          {line.name}
                        </span>
                        <span className="block text-[10px] leading-snug text-slate-400">
                          {line.itinerary}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <button
          type="button"
          onClick={() => setShowTransit((v) => !v)}
          className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold shadow-md backdrop-blur transition ${
            showTransit
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-white/70 bg-white/90 text-slate-700 hover:bg-white"
          }`}
        >
          <TrainFront className="h-3.5 w-3.5" aria-hidden />
          {showTransit ? "Ocultar estações" : "Estações / corredores"}
        </button>

        {showTransit && (
          <div className="max-w-[220px] rounded-md border border-white/70 bg-white/95 p-3 text-[11px] text-slate-600 shadow-md">
            <p className="mb-1 font-semibold text-slate-800">Estações</p>
            <ul className="mb-2 space-y-0.5">
              {TRANSIT_STATIONS.map((s) => (
                <li key={s.id} className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: s.color }}
                  />
                  {s.name}
                </li>
              ))}
            </ul>
            <p className="mb-1 font-semibold text-slate-800">Corredores</p>
            <ul className="space-y-0.5">
              {BUS_CORRIDORS.map((c) => (
                <li key={c.id}>
                  {c.name}: {c.lines.join(", ")}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
