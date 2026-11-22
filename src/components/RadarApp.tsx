"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapboxMap } from "mapbox-gl";
import { ApartmentCard } from "@/components/ApartmentCard";
import { FilterPanel } from "@/components/FilterPanel";
import { Header } from "@/components/Header";
import {
  MapLayersPanel,
  type MapLayersState,
} from "@/components/MapLayersPanel";
import { MapView } from "@/components/MapView";
import { RoutePanel } from "@/components/RoutePanel";
import { DEFAULT_STATION_RADIUS_METERS } from "../../data/linhasMetro";
import {
  downloadApartmentsJsonFile,
  fetchApartments,
  patchApartment,
} from "@/lib/apartments-api";
import { BUS_LINES } from "@/lib/bus-lines";
import { DEFAULT_MAX_PACKAGE } from "@/lib/constants";
import { analyzeRoute } from "@/lib/elevation";
import { getVisibleApartments } from "@/lib/filters";
import {
  APARTMENT_STATUSES,
  type Apartment,
  type ApartmentStatus,
  type FiltersState,
  type RouteAnalysis,
  type TripDirection,
} from "@/lib/types";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

function initialMapLayers(): MapLayersState {
  return {
    showBusLines: true,
    enabledLines: Object.fromEntries(BUS_LINES.map((l) => [l.id, true])),
    showLinhaVermelha: true,
    showLinhaLaranja: true,
    showTransit: false,
  };
}

function displayAnalysis(
  full: RouteAnalysis | null | undefined,
  direction: TripDirection
): RouteAnalysis | null {
  if (!full) return null;
  const leg = direction === "ida" ? full.ida : full.volta;
  return {
    ...full,
    distanceMeters: leg.distanceMeters,
    elevationGain: leg.elevationGain,
    maxGrade: leg.maxGrade,
    topography: leg.topography,
    coordinates: leg.coordinates,
    elevationProfile: leg.elevationProfile,
    segmentGrades: leg.segmentGrades,
  };
}

export function RadarApp() {
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [persistHint, setPersistHint] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [analyses, setAnalyses] = useState<Record<string, RouteAnalysis>>({});
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [hoverDistance, setHoverDistance] = useState<number | null>(null);
  const [mapInstance, setMapInstance] = useState<MapboxMap | null>(null);
  const [mapLayers, setMapLayers] = useState<MapLayersState>(initialMapLayers);
  const [walkDirection, setWalkDirection] = useState<TripDirection>("ida");
  const [filters, setFilters] = useState<FiltersState>({
    maxPackage: DEFAULT_MAX_PACKAGE,
    rooms: [1, 2, 3],
    sortBy: "pacote",
    stationIds: [],
    stationRadiusMeters: DEFAULT_STATION_RADIUS_METERS,
    statuses: [...APARTMENT_STATUSES],
  });
  const analyzingRef = useRef<Set<string>>(new Set());
  const listRef = useRef<HTMLDivElement>(null);
  const apartmentsRef = useRef<Apartment[]>([]);

  useEffect(() => {
    apartmentsRef.current = apartments;
  }, [apartments]);

  const notePersist = useCallback(
    (meta?: { persisted?: boolean; persistError?: string }) => {
      if (meta?.persisted === false) {
        setPersistHint(
          meta.persistError
            ? `FS read-only — alterações só em memória. Baixe o JSON. (${meta.persistError})`
            : "FS read-only — use “Baixar JSON Atualizado” para commit local."
        );
      } else {
        setPersistHint(null);
      }
    },
    []
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await fetchApartments();
        if (!cancelled) {
          setApartments(list);
          setHydrated(true);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setHydrated(true);
          setPersistHint("Falha ao carregar imóveis do servidor.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(() => {
    const list = getVisibleApartments(apartments, filters, analyses);
    if (!selectedId) return list;
    const idx = list.findIndex((a) => a.id === selectedId);
    if (idx <= 0) return list;
    const next = [...list];
    const [picked] = next.splice(idx, 1);
    next.unshift(picked);
    return next;
  }, [apartments, filters, analyses, selectedId]);

  useEffect(() => {
    if (!selectedId || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-apartment-id="${selectedId}"]`
    );
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId]);

  const selectedFullAnalysis = selectedId
    ? analyses[selectedId] ?? null
    : null;
  const selectedAnalysis = displayAnalysis(
    selectedFullAnalysis,
    walkDirection
  );

  const runAnalysis = useCallback(
    async (apartment: Apartment, map: MapboxMap) => {
      if (!MAPBOX_TOKEN) return;
      if (analyses[apartment.id]) {
        setSelectedId(apartment.id);
        return;
      }
      if (analyzingRef.current.has(apartment.id)) {
        setSelectedId(apartment.id);
        return;
      }

      analyzingRef.current.add(apartment.id);
      setAnalyzingId(apartment.id);
      setSelectedId(apartment.id);
      setHoverDistance(null);

      try {
        const result = await analyzeRoute(
          map,
          MAPBOX_TOKEN,
          apartment.id,
          apartment.lng,
          apartment.lat
        );
        setAnalyses((prev) => ({ ...prev, [apartment.id]: result }));
      } catch (err) {
        console.error(err);
      } finally {
        analyzingRef.current.delete(apartment.id);
        setAnalyzingId((cur) => (cur === apartment.id ? null : cur));
      }
    },
    [analyses]
  );

  const handleSelect = useCallback(
    (id: string) => {
      setSelectedId(id);
      setHoverDistance(null);
      setWalkDirection("ida");
      const apt = apartments.find((a) => a.id === id);
      if (!apt || !mapInstance || !MAPBOX_TOKEN) return;
      void runAnalysis(apt, mapInstance);
    },
    [apartments, mapInstance, runAnalysis]
  );

  const handleMapReady = useCallback((map: MapboxMap) => {
    setMapInstance(map);
    if (!MAPBOX_TOKEN) return;
    void (async () => {
      const queue = apartmentsRef.current;
      for (const apt of queue) {
        if (analyzingRef.current.has(apt.id)) continue;
        analyzingRef.current.add(apt.id);
        setAnalyzingId(apt.id);
        try {
          const result = await analyzeRoute(
            map,
            MAPBOX_TOKEN,
            apt.id,
            apt.lng,
            apt.lat
          );
          setAnalyses((prev) =>
            prev[apt.id] ? prev : { ...prev, [apt.id]: result }
          );
        } catch (err) {
          console.error(err);
        } finally {
          analyzingRef.current.delete(apt.id);
          setAnalyzingId((cur) => (cur === apt.id ? null : cur));
        }
      }
    })();
  }, []);

  const handleUpdateListingUrl = async (id: string, url: string) => {
    try {
      const result = await patchApartment(id, { externalUrl: url });
      setApartments((prev) =>
        prev.map((a) => (a.id === id ? result.apartment : a))
      );
      notePersist(result.meta);
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateStatus = async (id: string, status: ApartmentStatus) => {
    try {
      const result = await patchApartment(id, { status });
      setApartments((prev) =>
        prev.map((a) => (a.id === id ? result.apartment : a))
      );
      notePersist(result.meta);
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateComments = async (id: string, comments: string) => {
    try {
      const result = await patchApartment(id, { comments });
      setApartments((prev) =>
        prev.map((a) => (a.id === id ? result.apartment : a))
      );
      notePersist(result.meta);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDownloadServerJson = () => {
    void downloadApartmentsJsonFile().catch((err) => {
      console.error(err);
      setPersistHint("Falha ao baixar JSON do servidor.");
    });
  };

  const selectedApartment =
    apartments.find((a) => a.id === selectedId) ?? null;

  const filtersBlock = (
    <FilterPanel filters={filters} onChange={setFilters} />
  );

  const listBlock = (
    <div ref={listRef} className="lg:max-h-[70vh] lg:overflow-y-auto">
      {!hydrated ? (
        <p className="p-4 text-sm text-slate-500">Carregando imóveis…</p>
      ) : visible.length === 0 ? (
        <p className="p-4 text-sm text-slate-500">
          Nenhum imóvel corresponde aos filtros atuais.
        </p>
      ) : (
        visible.map((apt) => (
          <div key={apt.id} data-apartment-id={apt.id}>
            <ApartmentCard
              apartment={apt}
              analysis={analyses[apt.id]}
              selected={selectedId === apt.id}
              analyzing={analyzingId === apt.id}
              onSelect={() => handleSelect(apt.id)}
              onUpdateListingUrl={handleUpdateListingUrl}
              onUpdateStatus={handleUpdateStatus}
              onUpdateComments={handleUpdateComments}
            />
          </div>
        ))
      )}
    </div>
  );

  const mapBlock = (
    <section className="flex min-w-0 flex-1 flex-col">
      <MapLayersPanel
        layers={mapLayers}
        onChange={setMapLayers}
        stationIds={filters.stationIds}
        stationRadiusMeters={filters.stationRadiusMeters}
      />
      <div className="h-[45vh] min-h-[280px] border-b border-slate-200 lg:h-[70vh]">
        <MapView
          token={MAPBOX_TOKEN}
          apartments={visible}
          selectedId={selectedId}
          analysis={selectedAnalysis}
          hoverDistance={hoverDistance}
          stationIds={filters.stationIds}
          stationRadiusMeters={filters.stationRadiusMeters}
          layers={mapLayers}
          onMapReady={handleMapReady}
          onSelectApartment={handleSelect}
        />
      </div>
      <div className="min-h-[420px] lg:min-h-[480px]">
        <RoutePanel
          apartment={selectedApartment}
          analysis={selectedFullAnalysis}
          hoverDistance={hoverDistance}
          onHoverDistance={setHoverDistance}
          walkDirection={walkDirection}
          onWalkDirectionChange={setWalkDirection}
        />
      </div>
    </section>
  );

  return (
    <div className="flex min-h-screen flex-col bg-[#eef3f4]">
      <Header
        visibleCount={visible.length}
        onDownloadServerJson={handleDownloadServerJson}
      />

      {/* Mobile: mapa/camadas primeiro; Desktop: lista à esquerda */}
      <div className="flex flex-1 flex-col lg:flex-row">
        <aside className="order-2 flex w-full shrink-0 flex-col border-b border-slate-200 bg-white/90 shadow-[4px_0_24px_rgba(15,61,62,0.04)] lg:order-1 lg:w-[420px] lg:border-b-0 lg:border-r">
          {filtersBlock}
          {persistHint && (
            <div className="border-b border-amber-100 bg-amber-50/90 px-4 py-2 text-[11px] text-amber-950">
              {persistHint}
            </div>
          )}
          {listBlock}
        </aside>

        <div className="order-1 flex min-w-0 flex-1 flex-col lg:order-2">
          {mapBlock}
        </div>
      </div>
    </div>
  );
}
