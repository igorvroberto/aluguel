"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { getVisibleApartments } from "@/lib/filters";
import type { TransitRouteResult } from "@/lib/transit";
import {
  APARTMENT_STATUSES,
  type Apartment,
  type ApartmentStatus,
  type FiltersState,
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

export function RadarApp() {
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [persistHint, setPersistHint] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapLayers, setMapLayers] = useState<MapLayersState>(initialMapLayers);
  const [googleTransitRoute, setGoogleTransitRoute] =
    useState<TransitRouteResult | null>(null);
  const [filters, setFilters] = useState<FiltersState>({
    minPackage: null,
    maxPackage: DEFAULT_MAX_PACKAGE,
    rooms: [1, 2, 3],
    sortBy: "pacote",
    stationIds: [],
    stationRadiusMeters: DEFAULT_STATION_RADIUS_METERS,
    statuses: [...APARTMENT_STATUSES],
  });
  const listRef = useRef<HTMLDivElement>(null);
  const mapSectionRef = useRef<HTMLDivElement>(null);

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

  const visible = useMemo(
    () => getVisibleApartments(apartments, filters),
    [apartments, filters]
  );

  useEffect(() => {
    if (!selectedId || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-apartment-id="${selectedId}"]`
    );
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId]);

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
    setGoogleTransitRoute(null);
  }, []);

  const handleTraceRoute = useCallback(
    (id: string) => {
      handleSelect(id);
      requestAnimationFrame(() => {
        mapSectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    },
    [handleSelect]
  );

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
              selected={selectedId === apt.id}
              onSelect={() => handleSelect(apt.id)}
              onTraceRoute={() => handleTraceRoute(apt.id)}
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
      <div ref={mapSectionRef} className="scroll-mt-2">
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
            googleTransitRoute={googleTransitRoute}
            stationIds={filters.stationIds}
            stationRadiusMeters={filters.stationRadiusMeters}
            layers={mapLayers}
            onSelectApartment={handleSelect}
          />
        </div>
      </div>
      <div className="min-h-[420px] lg:min-h-[480px]">
        <RoutePanel
          apartment={selectedApartment}
          onGoogleRouteForMap={setGoogleTransitRoute}
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
