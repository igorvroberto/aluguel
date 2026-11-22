"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapboxMap } from "mapbox-gl";
import { RefreshCw } from "lucide-react";
import { AddApartmentModal } from "@/components/AddApartmentModal";
import { ApartmentCard } from "@/components/ApartmentCard";
import { FilterPanel } from "@/components/FilterPanel";
import { Header } from "@/components/Header";
import {
  MapLayersPanel,
  type MapLayersState,
} from "@/components/MapLayersPanel";
import { MapView } from "@/components/MapView";
import { RoutePanel } from "@/components/RoutePanel";
import { DEFAULT_STATION_RADIUS_METERS } from "../../data/linhaVermelha";
import { BUS_LINES } from "@/lib/bus-lines";
import { DEFAULT_MAX_PACKAGE } from "@/lib/constants";
import { analyzeRoute } from "@/lib/elevation";
import { buildExportRows, downloadBlob, toCsv } from "@/lib/export";
import { getVisibleApartments } from "@/lib/filters";
import {
  getSeedApartments,
  loadApartments,
  mergeWithSeedBase,
  needsSeedRestore,
  saveApartments,
} from "@/lib/storage";
import type {
  Apartment,
  FiltersState,
  NewApartmentInput,
  RouteAnalysis,
} from "@/lib/types";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

function initialMapLayers(): MapLayersState {
  return {
    showBusLines: true,
    enabledLines: Object.fromEntries(BUS_LINES.map((l) => [l.id, true])),
    showLinhaVermelha: true,
    showTransit: false,
  };
}

export function RadarApp() {
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [analyses, setAnalyses] = useState<Record<string, RouteAnalysis>>({});
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [hoverDistance, setHoverDistance] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [mapInstance, setMapInstance] = useState<MapboxMap | null>(null);
  const [focusStationsToken, setFocusStationsToken] = useState(0);
  const [mapLayers, setMapLayers] = useState<MapLayersState>(initialMapLayers);
  const [filters, setFilters] = useState<FiltersState>({
    maxPackage: DEFAULT_MAX_PACKAGE,
    rooms: [1, 2, 3],
    onlyFlat: false,
    portaria24h: false,
    sortBy: "pacote",
    stationIds: [],
    stationRadiusMeters: DEFAULT_STATION_RADIUS_METERS,
  });
  const analyzingRef = useRef<Set<string>>(new Set());
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setApartments(loadApartments());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveApartments(apartments);
  }, [apartments, hydrated]);

  const showRestore = hydrated && needsSeedRestore(apartments);
  const seedCount = getSeedApartments().length;

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

  const selectedAnalysis = selectedId ? analyses[selectedId] ?? null : null;

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
      const apt = apartments.find((a) => a.id === id);
      if (!apt || !mapInstance || !MAPBOX_TOKEN) return;
      void runAnalysis(apt, mapInstance);
    },
    [apartments, mapInstance, runAnalysis]
  );

  const handleMapReady = useCallback((map: MapboxMap) => {
    setMapInstance(map);
    if (!MAPBOX_TOKEN) return;
    const queue = loadApartments();
    void (async () => {
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

  const handleAdd = (input: NewApartmentInput) => {
    const apt: Apartment = {
      id: `apt-${Date.now()}`,
      ...input,
    };
    setApartments((prev) => [apt, ...prev]);
    setSelectedId(apt.id);
    if (mapInstance && MAPBOX_TOKEN) {
      void runAnalysis(apt, mapInstance);
    }
  };

  const handleAddBatch = (inputs: NewApartmentInput[]) => {
    const stamped = Date.now();
    const apts: Apartment[] = inputs.map((input, i) => ({
      id: `apt-${stamped}-${i}`,
      ...input,
    }));
    setApartments((prev) => [...apts, ...prev]);
    if (apts[0]) {
      setSelectedId(apts[0].id);
      if (mapInstance && MAPBOX_TOKEN) {
        void runAnalysis(apts[0], mapInstance);
      }
    }
  };

  const handleRestoreBase = () => {
    setApartments((prev) => mergeWithSeedBase(prev));
  };

  const handleUpdateListingUrl = (id: string, url: string) => {
    setApartments((prev) =>
      prev.map((a) => (a.id === id ? { ...a, externalUrl: url } : a))
    );
  };

  const handleExportCsv = () => {
    const rows = buildExportRows(apartments, analyses);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadBlob(
      `imoveis-radar-${stamp}.csv`,
      toCsv(rows),
      "text/csv;charset=utf-8"
    );
  };

  const handleExportJson = () => {
    const rows = buildExportRows(apartments, analyses);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadBlob(
      `imoveis-radar-${stamp}.json`,
      JSON.stringify(
        { exportedAt: new Date().toISOString(), apartments: rows },
        null,
        2
      ),
      "application/json"
    );
  };

  const selectedApartment =
    apartments.find((a) => a.id === selectedId) ?? null;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#eef3f4]">
      <Header
        visibleCount={visible.length}
        onAdd={() => setModalOpen(true)}
        onExportCsv={handleExportCsv}
        onExportJson={handleExportJson}
      />

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[420px] shrink-0 flex-col border-r border-slate-200 bg-white/90 shadow-[4px_0_24px_rgba(15,61,62,0.04)]">
          <FilterPanel
            filters={filters}
            onChange={setFilters}
            onFocusStations={() => setFocusStationsToken((n) => n + 1)}
          />

          <div className="border-b border-amber-100 bg-amber-50/90 px-4 py-2.5">
            <button
              type="button"
              onClick={handleRestoreBase}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-950 hover:bg-amber-50"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              Restaurar / Carregar Base Completa ({seedCount} imóveis)
            </button>
            <p className="mt-1 text-[10px] text-amber-900/80">
              {showRestore
                ? "Há imóveis novos na base — sincroniza sem apagar cadastros manuais."
                : "Atualiza a base sem apagar imóveis que você cadastrou."}
            </p>
          </div>

          <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
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
                  />
                </div>
              ))
            )}
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <MapLayersPanel
            layers={mapLayers}
            onChange={setMapLayers}
            stationIds={filters.stationIds}
            stationRadiusMeters={filters.stationRadiusMeters}
          />
          <div className="min-h-0 basis-[70%] grow-[7] border-b border-slate-200">
            <MapView
              token={MAPBOX_TOKEN}
              apartments={visible}
              selectedId={selectedId}
              analysis={selectedAnalysis}
              hoverDistance={hoverDistance}
              stationIds={filters.stationIds}
              stationRadiusMeters={filters.stationRadiusMeters}
              focusStationsToken={focusStationsToken}
              layers={mapLayers}
              onMapReady={handleMapReady}
              onSelectApartment={handleSelect}
            />
          </div>
          <div className="min-h-[200px] basis-[30%] grow-[3]">
            <RoutePanel
              apartment={selectedApartment}
              analysis={selectedAnalysis}
              hoverDistance={hoverDistance}
              onHoverDistance={setHoverDistance}
            />
          </div>
        </section>
      </div>

      <AddApartmentModal
        open={modalOpen}
        mapboxToken={MAPBOX_TOKEN}
        onClose={() => setModalOpen(false)}
        onSave={handleAdd}
        onSaveBatch={handleAddBatch}
      />
    </div>
  );
}
