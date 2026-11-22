"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapboxMap } from "mapbox-gl";
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
import { DEFAULT_STATION_RADIUS_METERS } from "../../data/linhasMetro";
import {
  createApartments,
  downloadApartmentsJsonFile,
  fetchApartments,
  patchApartment,
  removeApartment,
  scrapeStations,
} from "@/lib/apartments-api";
import { BUS_LINES } from "@/lib/bus-lines";
import { DEFAULT_MAX_PACKAGE } from "@/lib/constants";
import { analyzeRoute } from "@/lib/elevation";
import { buildExportRows, downloadBlob, toCsv } from "@/lib/export";
import { getVisibleApartments } from "@/lib/filters";
import {
  APARTMENT_STATUSES,
  type Apartment,
  type ApartmentStatus,
  type FiltersState,
  type NewApartmentInput,
  type RouteAnalysis,
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
  const [analyses, setAnalyses] = useState<Record<string, RouteAnalysis>>({});
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [hoverDistance, setHoverDistance] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [mapInstance, setMapInstance] = useState<MapboxMap | null>(null);
  const [focusStationsToken, setFocusStationsToken] = useState(0);
  const [mapLayers, setMapLayers] = useState<MapLayersState>(initialMapLayers);
  const [scraping, setScraping] = useState(false);
  const [scrapeMessage, setScrapeMessage] = useState<string | null>(null);
  const [filters, setFilters] = useState<FiltersState>({
    maxPackage: DEFAULT_MAX_PACKAGE,
    rooms: [1, 2, 3],
    onlyFlat: false,
    portaria24h: false,
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

  const notePersist = useCallback((meta?: { persisted?: boolean; persistError?: string }) => {
    if (meta?.persisted === false) {
      setPersistHint(
        meta.persistError
          ? `FS read-only — alterações só em memória. Baixe o JSON. (${meta.persistError})`
          : "FS read-only — use “Baixar JSON Atualizado” para commit local."
      );
    } else {
      setPersistHint(null);
    }
  }, []);

  const refreshApartments = useCallback(async () => {
    const list = await fetchApartments();
    setApartments(list);
    return list;
  }, []);

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

  const handleAdd = async (input: NewApartmentInput) => {
    try {
      const result = await createApartments({
        ...input,
        status: input.status || "Candidato",
      });
      setApartments(result.apartments);
      notePersist(result.meta);
      const created = result.apartments.find(
        (a) => a.externalUrl === input.externalUrl && a.address === input.address
      );
      if (created) {
        setSelectedId(created.id);
        if (mapInstance && MAPBOX_TOKEN) {
          void runAnalysis(created, mapInstance);
        }
      }
    } catch (err) {
      console.error(err);
      setPersistHint(
        err instanceof Error ? err.message : "Falha ao salvar imóvel."
      );
    }
  };

  const handleAddBatch = async (inputs: NewApartmentInput[]) => {
    try {
      const result = await createApartments(
        inputs.map((input) => ({
          ...input,
          status: input.status || "Candidato",
        }))
      );
      setApartments(result.apartments);
      notePersist(result.meta);
      if (result.apartments[0] && mapInstance && MAPBOX_TOKEN) {
        setSelectedId(result.apartments[0].id);
        void runAnalysis(result.apartments[0], mapInstance);
      }
    } catch (err) {
      console.error(err);
      setPersistHint(
        err instanceof Error ? err.message : "Falha ao salvar lote."
      );
    }
  };

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

  const handleDelete = async (id: string) => {
    try {
      const result = await removeApartment(id);
      setApartments((prev) => prev.filter((a) => a.id !== id));
      if (selectedId === id) setSelectedId(null);
      notePersist(result.meta);
    } catch (err) {
      console.error(err);
    }
  };

  const handleScrapeStations = async () => {
    if (filters.stationIds.length === 0) {
      setScrapeMessage("Selecione ao menos uma estação.");
      return;
    }
    setScraping(true);
    setScrapeMessage("Varrendo QuintoAndar, Viva Real, Imovelweb e Chaves na Mão…");
    try {
      const result = await scrapeStations({
        stationIds: filters.stationIds,
        radiusMeters: filters.stationRadiusMeters,
        maxPackage: filters.maxPackage,
        rooms: filters.rooms,
      });
      if (result.apartments?.length) {
        setApartments(result.apartments);
      } else {
        await refreshApartments();
      }
      notePersist({
        persisted: result.persisted,
        persistError: result.persistError,
      });
      const warn =
        result.warnings?.length > 0
          ? ` Avisos: ${result.warnings.slice(0, 2).join(" · ")}`
          : "";
      setScrapeMessage(
        (result.message ||
          `${result.added} novos · ${result.skipped} duplicados · ${result.scanned} páginas`) +
          warn
      );
    } catch (err) {
      console.error(err);
      setScrapeMessage(
        err instanceof Error ? err.message : "Falha na varredura."
      );
    } finally {
      setScraping(false);
    }
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

  const handleDownloadServerJson = () => {
    void downloadApartmentsJsonFile().catch((err) => {
      console.error(err);
      setPersistHint("Falha ao baixar JSON do servidor.");
    });
  };

  const selectedApartment =
    apartments.find((a) => a.id === selectedId) ?? null;

  return (
    <div className="flex min-h-screen flex-col bg-[#eef3f4]">
      <Header
        visibleCount={visible.length}
        onAdd={() => setModalOpen(true)}
        onExportCsv={handleExportCsv}
        onExportJson={handleExportJson}
        onDownloadServerJson={handleDownloadServerJson}
      />

      <div className="flex flex-1 flex-col lg:flex-row">
        <aside className="flex w-full shrink-0 flex-col border-b border-slate-200 bg-white/90 shadow-[4px_0_24px_rgba(15,61,62,0.04)] lg:w-[420px] lg:border-b-0 lg:border-r">
          <FilterPanel
            filters={filters}
            onChange={setFilters}
            onFocusStations={() => setFocusStationsToken((n) => n + 1)}
            onScrapeStations={handleScrapeStations}
            scraping={scraping}
            scrapeMessage={scrapeMessage}
          />

          {persistHint && (
            <div className="border-b border-amber-100 bg-amber-50/90 px-4 py-2 text-[11px] text-amber-950">
              {persistHint}
            </div>
          )}

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
                    onDelete={handleDelete}
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
          <div className="h-[55vh] min-h-[360px] border-b border-slate-200 lg:h-[70vh]">
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
          <div className="min-h-[240px]">
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
        onSave={(input) => {
          void handleAdd(input);
        }}
        onSaveBatch={(inputs) => {
          void handleAddBatch(inputs);
        }}
      />
    </div>
  );
}
