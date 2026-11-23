"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AddApartmentModal } from "@/components/AddApartmentModal";
import { ApartmentCard } from "@/components/ApartmentCard";
import { FilterPanel } from "@/components/FilterPanel";
import { Header } from "@/components/Header";
import { MapView } from "@/components/MapView";
import { RoutePanel } from "@/components/RoutePanel";
import { DEFAULT_STATION_RADIUS_METERS } from "../../data/linhasMetro";
import {
  createApartments,
  downloadApartmentsJsonFile,
  fetchApartments,
  patchApartment,
  scrapeTermometro,
} from "@/lib/apartments-api";
import { DEFAULT_MAX_PACKAGE } from "@/lib/constants";
import { getVisibleApartments } from "@/lib/filters";
import type { TransitRouteResult } from "@/lib/transit";
import {
  DEFAULT_FILTER_STATUSES,
  type Apartment,
  type ApartmentStatus,
  type FiltersState,
  type NewApartmentInput,
} from "@/lib/types";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

export function RadarApp() {
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [persistHint, setPersistHint] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** Seleção veio do pin: card só acima do mapa, sem puxar a lista. */
  const [mapPinned, setMapPinned] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [termometroBusy, setTermometroBusy] = useState(false);
  const [mapsApiKey, setMapsApiKey] = useState<string | undefined>(
    () => process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  );
  const [googleTransitRoute, setGoogleTransitRoute] =
    useState<TransitRouteResult | null>(null);
  const [filters, setFilters] = useState<FiltersState>({
    minPackage: null,
    maxPackage: DEFAULT_MAX_PACKAGE,
    rooms: [2],
    parkingSpots: [1],
    portals: [],
    sortBy: "pacote",
    stationIds: [],
    stationRadiusMeters: DEFAULT_STATION_RADIUS_METERS,
    statuses: [...DEFAULT_FILTER_STATUSES],
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
    const load = async () => {
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
    };
    void load();
    // Outra pessoa pode ter adicionado manuais — recarrega ao voltar à aba.
    const onFocus = () => {
      void load();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/maps-config");
        if (!res.ok) return;
        const data = (await res.json()) as { apiKey?: string | null };
        if (!cancelled && data.apiKey) {
          setMapsApiKey(data.apiKey);
        }
      } catch (err) {
        console.error(err);
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

  const manualTotal = useMemo(
    () =>
      apartments.filter(
        (a) =>
          a.status === "Manual" ||
          (a.source || "").toLowerCase() === "manual" ||
          (a.portal || "").toLowerCase() === "manual"
      ).length,
    [apartments]
  );

  const manualVisible = useMemo(
    () =>
      visible.filter(
        (a) =>
          a.status === "Manual" ||
          (a.source || "").toLowerCase() === "manual" ||
          (a.portal || "").toLowerCase() === "manual"
      ).length,
    [visible]
  );

  const scrollMapIntoView = useCallback(() => {
    requestAnimationFrame(() => {
      mapSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, []);

  // Só sincroniza scroll da lista quando a seleção veio da própria lista.
  useEffect(() => {
    if (!selectedId || mapPinned || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-apartment-id="${selectedId}"]`
    );
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId, mapPinned]);

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
    setMapPinned(false);
    setGoogleTransitRoute(null);
  }, []);

  const handleSelectFromMap = useCallback(
    (id: string) => {
      setSelectedId(id);
      setMapPinned(true);
      setGoogleTransitRoute(null);
      scrollMapIntoView();
    },
    [scrollMapIntoView]
  );

  const handleTraceRoute = useCallback(
    (id: string) => {
      setSelectedId(id);
      setMapPinned(true);
      setGoogleTransitRoute(null);
      scrollMapIntoView();
    },
    [scrollMapIntoView]
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

  const handleImportTermometro = async () => {
    if (termometroBusy) return;
    setTermometroBusy(true);
    setPersistHint("Importando Termômetro…");
    try {
      const result = await scrapeTermometro({
        raio: 2000,
        custoMax: filters.maxPackage ?? DEFAULT_MAX_PACKAGE,
        quartosMin: Math.min(...(filters.rooms.length ? filters.rooms : [2])),
        vagasMin: Math.min(
          ...(filters.parkingSpots.length ? filters.parkingSpots : [1])
        ),
      });
      setApartments(result.apartments);
      notePersist(result);
      const warn =
        result.warnings?.length > 0
          ? ` · ${result.warnings.slice(0, 2).join(" · ")}`
          : "";
      setPersistHint(
        (result.message ||
          `+${result.added} Termômetro (${result.scanned} lidos)`) + warn
      );
    } catch (err) {
      console.error(err);
      setPersistHint(
        err instanceof Error
          ? err.message
          : "Falha ao importar do Termômetro."
      );
    } finally {
      setTermometroBusy(false);
    }
  };

  const handleAddManual = async (input: NewApartmentInput) => {
    try {
      const result = await createApartments({
        ...input,
        status: "Manual",
        source: "manual",
        portal: input.portal || "manual",
      });
      setApartments(result.apartments);
      notePersist(result.meta);
      const added = result.apartments.find(
        (a) =>
          a.status === "Manual" &&
          a.address.trim().toLowerCase() === input.address.trim().toLowerCase()
      );
      // Mostra manuais no filtro e foca o card acima do mapa.
      setFilters((prev) =>
        prev.statuses.includes("Manual")
          ? prev
          : { ...prev, statuses: [...prev.statuses, "Manual"] }
      );
      if (added) {
        setSelectedId(added.id);
        setMapPinned(true);
        requestAnimationFrame(() => {
          mapSectionRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        });
      }
    } catch (err) {
      console.error(err);
      setPersistHint(
        err instanceof Error
          ? err.message
          : "Falha ao salvar imóvel manual."
      );
    }
  };

  const handleAddManualBatch = async (inputs: NewApartmentInput[]) => {
    try {
      const result = await createApartments(
        inputs.map((input) => ({
          ...input,
          status: "Manual" as const,
          source: "manual",
          portal: input.portal || "manual",
        }))
      );
      setApartments(result.apartments);
      notePersist(result.meta);
      setFilters((prev) =>
        prev.statuses.includes("Manual")
          ? prev
          : { ...prev, statuses: [...prev.statuses, "Manual"] }
      );
    } catch (err) {
      console.error(err);
      setPersistHint(
        err instanceof Error
          ? err.message
          : "Falha ao salvar lote de imóveis manuais."
      );
    }
  };

  const selectedApartment =
    apartments.find((a) => a.id === selectedId) ?? null;

  const filtersBlock = (
    <FilterPanel filters={filters} onChange={setFilters} />
  );

  const listBlock = (
    <div ref={listRef} className="lg:max-h-[70vh] lg:overflow-y-auto">
      {hydrated && manualTotal > 0 && (
        <p className="border-b border-teal-100 bg-teal-50/70 px-4 py-2 text-[11px] text-teal-900">
          {manualVisible} de {manualTotal} imóvel(is) manual(is) visíveis com
          os filtros atuais
          {manualVisible === 0
            ? " — ative Status Manual (e Favorito, se tiver marcado)."
            : "."}
        </p>
      )}
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
              selected={!mapPinned && selectedId === apt.id}
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
        {/* Card do pin acima do mapa — modo mapa desliga o destaque na lista. */}
        {selectedApartment && mapPinned ? (
          <div className="border-b border-slate-200 bg-white">
            <div className="flex items-center justify-between gap-2 border-b border-teal-100 bg-teal-50/80 px-3 py-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-teal-900">
                Imóvel selecionado no mapa
              </p>
              <button
                type="button"
                className="text-[10px] font-medium text-teal-800 underline-offset-2 hover:underline"
                onClick={() => {
                  setMapPinned(false);
                  setSelectedId(null);
                  setGoogleTransitRoute(null);
                }}
              >
                Fechar
              </button>
            </div>
            <ApartmentCard
              apartment={selectedApartment}
              selected
              onSelect={() => handleSelectFromMap(selectedApartment.id)}
              onTraceRoute={() => handleTraceRoute(selectedApartment.id)}
              onUpdateStatus={handleUpdateStatus}
              onUpdateComments={handleUpdateComments}
            />
          </div>
        ) : null}
        <div className="h-[45vh] min-h-[280px] border-b border-slate-200 lg:h-[70vh]">
          <MapView
            apiKey={mapsApiKey}
            apartments={visible}
            selectedId={selectedId}
            googleTransitRoute={googleTransitRoute}
            stationIds={filters.stationIds}
            stationRadiusMeters={filters.stationRadiusMeters}
            onSelectApartment={handleSelectFromMap}
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
        onAdd={() => setAddOpen(true)}
        onImportTermometro={() => {
          void handleImportTermometro();
        }}
        termometroBusy={termometroBusy}
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

      <AddApartmentModal
        open={addOpen}
        mapboxToken={MAPBOX_TOKEN}
        onClose={() => setAddOpen(false)}
        onSave={(input) => {
          void handleAddManual(input);
        }}
        onSaveBatch={(inputs) => {
          void handleAddManualBatch(inputs);
        }}
      />
    </div>
  );
}
