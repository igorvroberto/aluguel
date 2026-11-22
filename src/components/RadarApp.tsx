"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapboxMap } from "mapbox-gl";
import { AddApartmentModal } from "@/components/AddApartmentModal";
import { ApartmentCard } from "@/components/ApartmentCard";
import { ElevationChart } from "@/components/ElevationChart";
import { FilterPanel } from "@/components/FilterPanel";
import { Header } from "@/components/Header";
import { MapView } from "@/components/MapView";
import { DEFAULT_MAX_PACKAGE } from "@/lib/constants";
import { analyzeRoute } from "@/lib/elevation";
import { getVisibleApartments } from "@/lib/filters";
import { loadApartments, saveApartments } from "@/lib/storage";
import type {
  Apartment,
  FiltersState,
  NewApartmentInput,
  RouteAnalysis,
} from "@/lib/types";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

export function RadarApp() {
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [analyses, setAnalyses] = useState<Record<string, RouteAnalysis>>({});
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [hoverDistance, setHoverDistance] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [mapInstance, setMapInstance] = useState<MapboxMap | null>(null);
  const [filters, setFilters] = useState<FiltersState>({
    maxPackage: DEFAULT_MAX_PACKAGE,
    rooms: [1, 2, 3],
    onlyFlat: false,
    portaria24h: false,
    sortBy: "pacote",
  });
  const analyzingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setApartments(loadApartments());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveApartments(apartments);
  }, [apartments, hydrated]);

  const visible = useMemo(
    () => getVisibleApartments(apartments, filters, analyses),
    [apartments, filters, analyses]
  );

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

  const handleMapReady = useCallback(
    (map: MapboxMap) => {
      setMapInstance(map);
      // Prefetch analyses for seed apartments so filters/sort work.
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
    },
    []
  );

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

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#eef3f4]">
      <Header
        visibleCount={visible.length}
        onAdd={() => setModalOpen(true)}
      />

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[420px] shrink-0 flex-col border-r border-slate-200 bg-white/90 shadow-[4px_0_24px_rgba(15,61,62,0.04)]">
          <FilterPanel filters={filters} onChange={setFilters} />
          <div className="min-h-0 flex-1 overflow-y-auto">
            {!hydrated ? (
              <p className="p-4 text-sm text-slate-500">Carregando imóveis…</p>
            ) : visible.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">
                Nenhum imóvel corresponde aos filtros atuais.
              </p>
            ) : (
              visible.map((apt) => (
                <ApartmentCard
                  key={apt.id}
                  apartment={apt}
                  analysis={analyses[apt.id]}
                  selected={selectedId === apt.id}
                  analyzing={analyzingId === apt.id}
                  onSelect={() => handleSelect(apt.id)}
                />
              ))
            )}
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 basis-[70%] grow-[7] border-b border-slate-200">
            <MapView
              token={MAPBOX_TOKEN}
              apartments={visible}
              selectedId={selectedId}
              analysis={selectedAnalysis}
              hoverDistance={hoverDistance}
              onMapReady={handleMapReady}
              onSelectApartment={handleSelect}
            />
          </div>
          <div className="min-h-[180px] basis-[30%] grow-[3]">
            <ElevationChart
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
      />
    </div>
  );
}
