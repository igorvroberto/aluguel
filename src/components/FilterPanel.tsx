"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, TrainFront, X } from "lucide-react";
import {
  LINHA_LARANJA_ATIVAS,
  LINHA_LARANJA_COLOR,
  LINHA_VERMELHA,
  LINHA_VERMELHA_COLOR,
  sortLinhaLaranjaForFilter,
  type MetroStation,
} from "../../data/linhasMetro";
import { DEFAULT_MAX_PACKAGE } from "@/lib/constants";
import { formatBRL, formatThousands, parseThousandsInput } from "@/lib/format";
import { PORTAL_FILTER_OPTIONS } from "@/lib/portals";
import {
  APARTMENT_STATUSES,
  type ApartmentStatus,
  type FiltersState,
  type SortOption,
} from "@/lib/types";

interface FilterPanelProps {
  filters: FiltersState;
  onChange: (next: FiltersState) => void;
}

const ROOM_OPTIONS: Array<{ value: 1 | 2 | 3; label: string }> = [
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 3, label: "3+" },
];

const PARKING_OPTIONS: Array<{ value: 0 | 1 | 2; label: string }> = [
  { value: 0, label: "0" },
  { value: 1, label: "1" },
  { value: 2, label: "2+" },
];

const SORT_OPTIONS: Array<{ value: SortOption; label: string }> = [
  { value: "pacote", label: "Menor Valor" },
  { value: "distancia", label: "Menor Distância" },
];

function StationChecklist({
  stations,
  selectedIds,
  accent,
  onToggle,
  onToggleAll,
}: {
  stations: MetroStation[];
  selectedIds: string[];
  accent: string;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
}) {
  const allIds = stations.map((s) => s.id);
  const allSelected =
    allIds.length > 0 && allIds.every((id) => selectedIds.includes(id));

  return (
    <ul className="divide-y divide-slate-100">
      <li>
        <label className="flex cursor-pointer items-start gap-2 bg-slate-50/80 px-2.5 py-1.5 hover:bg-slate-100">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={onToggleAll}
            className="mt-0.5"
            style={{ accentColor: accent }}
          />
          <span className="text-xs font-semibold text-slate-800">Todas</span>
        </label>
      </li>
      {stations.length === 0 ? (
        <li>
          <p className="px-3 py-2 text-[11px] text-slate-400">
            Nenhuma estação encontrada.
          </p>
        </li>
      ) : (
        stations.map((s) => {
          const active = selectedIds.includes(s.id);
          return (
            <li key={s.id}>
              <label className="flex cursor-pointer items-start gap-2 px-2.5 py-1.5 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => onToggle(s.id)}
                  className="mt-0.5"
                  style={{ accentColor: accent }}
                />
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-slate-800">
                    <span className="mr-1 tabular-nums text-slate-400">
                      {String(s.order).padStart(2, "0")}.
                    </span>
                    {s.name}
                  </span>
                  {s.integration && (
                    <span className="block text-[10px] leading-snug text-slate-400">
                      {s.integration}
                    </span>
                  )}
                </span>
              </label>
            </li>
          );
        })
      )}
    </ul>
  );
}

export function FilterPanel({ filters, onChange }: FilterPanelProps) {
  const [stationQuery, setStationQuery] = useState("");
  const [minDraft, setMinDraft] = useState(
    filters.minPackage != null ? formatThousands(filters.minPackage) : ""
  );
  const [maxDraft, setMaxDraft] = useState(
    filters.maxPackage != null ? formatThousands(filters.maxPackage) : ""
  );

  useEffect(() => {
    setMinDraft(
      filters.minPackage != null ? formatThousands(filters.minPackage) : ""
    );
  }, [filters.minPackage]);

  useEffect(() => {
    setMaxDraft(
      filters.maxPackage != null ? formatThousands(filters.maxPackage) : ""
    );
  }, [filters.maxPackage]);

  const commitPackage = (which: "min" | "max", draft: string) => {
    const raw = draft.trim();
    if (raw === "") {
      onChange({
        ...filters,
        [which === "min" ? "minPackage" : "maxPackage"]: null,
      });
      return;
    }
    const n = parseThousandsInput(raw);
    if (n == null) {
      // restaura formatação atual
      if (which === "min") {
        setMinDraft(
          filters.minPackage != null ? formatThousands(filters.minPackage) : ""
        );
      } else {
        setMaxDraft(
          filters.maxPackage != null ? formatThousands(filters.maxPackage) : ""
        );
      }
      return;
    }
    const value = Math.max(0, Math.round(n));
    onChange({
      ...filters,
      [which === "min" ? "minPackage" : "maxPackage"]: value,
    });
  };

  const toggleRoom = (room: 1 | 2 | 3) => {
    const exists = filters.rooms.includes(room);
    const rooms = exists
      ? filters.rooms.filter((r) => r !== room)
      : [...filters.rooms, room];
    onChange({ ...filters, rooms: rooms.sort() as Array<1 | 2 | 3> });
  };

  const toggleParking = (spots: 0 | 1 | 2) => {
    const exists = filters.parkingSpots.includes(spots);
    const parkingSpots = exists
      ? filters.parkingSpots.filter((s) => s !== spots)
      : [...filters.parkingSpots, spots];
    onChange({
      ...filters,
      parkingSpots: parkingSpots.sort() as Array<0 | 1 | 2>,
    });
  };

  const togglePortal = (portalId: string) => {
    const current = filters.portals ?? [];
    const exists = current.includes(portalId);
    const portals = exists
      ? current.filter((p) => p !== portalId)
      : [...current, portalId];
    onChange({ ...filters, portals });
  };

  const toggleStatus = (status: ApartmentStatus) => {
    const current = filters.statuses ?? [...APARTMENT_STATUSES];
    const exists = current.includes(status);
    const statuses = exists
      ? current.filter((s) => s !== status)
      : [...current, status];
    onChange({ ...filters, statuses });
  };

  const q = stationQuery.trim().toLowerCase();
  const matchStation = (s: MetroStation) =>
    !q ||
    s.name.toLowerCase().includes(q) ||
    (s.integration?.toLowerCase().includes(q) ?? false);

  const filteredL3 = useMemo(
    () => LINHA_VERMELHA.filter(matchStation),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stationQuery]
  );
  const filteredL6 = useMemo(
    () => sortLinhaLaranjaForFilter(LINHA_LARANJA_ATIVAS.filter(matchStation)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stationQuery]
  );

  const toggleStation = (id: string) => {
    const exists = filters.stationIds.includes(id);
    const stationIds = exists
      ? filters.stationIds.filter((s) => s !== id)
      : [...filters.stationIds, id];
    onChange({ ...filters, stationIds });
  };

  const toggleAllOnLine = (lineStations: MetroStation[]) => {
    const ids = lineStations.map((s) => s.id);
    const allOn = ids.every((id) => filters.stationIds.includes(id));
    if (allOn) {
      onChange({
        ...filters,
        stationIds: filters.stationIds.filter((id) => !ids.includes(id)),
      });
    } else {
      const set = new Set([...filters.stationIds, ...ids]);
      onChange({ ...filters, stationIds: Array.from(set) });
    }
  };

  const selectedCount = filters.stationIds.length;

  return (
    <div className="space-y-4 border-b border-slate-200 bg-white/80 p-4 backdrop-blur">
      <div>
        <p className="mb-2 text-sm font-medium text-slate-700">
          Pacote mensal
        </p>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-[11px] text-slate-500">
            De
            <input
              type="text"
              inputMode="numeric"
              placeholder="sem mín."
              value={minDraft}
              onChange={(e) => setMinDraft(e.target.value)}
              onBlur={() => commitPackage("min", minDraft)}
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm tabular-nums text-slate-800 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20"
            />
          </label>
          <label className="block text-[11px] text-slate-500">
            Até
            <input
              type="text"
              inputMode="numeric"
              placeholder="sem máx."
              value={maxDraft}
              onChange={(e) => setMaxDraft(e.target.value)}
              onBlur={() => commitPackage("max", maxDraft)}
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm tabular-nums text-slate-800 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20"
            />
          </label>
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-slate-400">
          <span>
            {filters.minPackage != null || filters.maxPackage != null
              ? `${filters.minPackage != null ? formatBRL(filters.minPackage) : "—"} → ${filters.maxPackage != null ? formatBRL(filters.maxPackage) : "—"}`
              : "sem filtro de valor"}
          </span>
          <button
            type="button"
            className="shrink-0 text-teal-700 hover:underline"
            onClick={() =>
              onChange({
                ...filters,
                minPackage: null,
                maxPackage: DEFAULT_MAX_PACKAGE,
              })
            }
          >
            padrão até {formatBRL(DEFAULT_MAX_PACKAGE)}
          </button>
        </div>
        <p className="mt-1 text-[11px] text-slate-500">
          aluguel + condomínio + IPTU · De e Até são independentes
        </p>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-slate-700">Quartos</p>
        <div className="flex gap-2">
          {ROOM_OPTIONS.map((opt) => {
            const active = filters.rooms.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleRoom(opt.value)}
                className={`flex-1 rounded-md border px-2 py-1.5 text-sm font-medium transition ${
                  active
                    ? "border-teal-700 bg-teal-700 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-slate-700">Vagas</p>
        <div className="flex gap-2">
          {PARKING_OPTIONS.map((opt) => {
            const active = filters.parkingSpots.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleParking(opt.value)}
                className={`flex-1 rounded-md border px-2 py-1.5 text-sm font-medium transition ${
                  active
                    ? "border-teal-700 bg-teal-700 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-slate-700">
          Portal
          <span className="ml-1 font-normal text-slate-400">
            (vazio = todos)
          </span>
        </p>
        <div className="flex flex-wrap gap-2">
          {PORTAL_FILTER_OPTIONS.map((opt) => {
            const active = (filters.portals ?? []).includes(opt.id);
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => togglePortal(opt.id)}
                className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition ${
                  active
                    ? "border-teal-700 bg-teal-700 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-700">
          <TrainFront className="h-3.5 w-3.5 text-slate-700" aria-hidden />
          Estações de Metrô
          {selectedCount > 0 && (
            <span className="rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              {selectedCount}
            </span>
          )}
        </div>

        <div className="relative mb-2">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <input
            type="search"
            value={stationQuery}
            onChange={(e) => setStationQuery(e.target.value)}
            placeholder="Buscar estação (L3 ou L6)…"
            className="w-full rounded-md border border-slate-200 bg-white py-1.5 pl-8 pr-8 text-xs text-slate-700 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
          />
          {stationQuery && (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              onClick={() => setStationQuery("")}
              aria-label="Limpar busca"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="mb-2">
          <button
            type="button"
            onClick={() => onChange({ ...filters, stationIds: [] })}
            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
          >
            Limpar Seleção
          </button>
        </div>

        <div className="space-y-2">
          <details open className="rounded-md border border-slate-200 bg-white">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-800 [&::-webkit-details-marker]:hidden">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: LINHA_VERMELHA_COLOR }}
              />
              Linha 3-Vermelha ({LINHA_VERMELHA.length} estações)
            </summary>
            <div className="max-h-44 overflow-y-auto border-t border-slate-100">
              <StationChecklist
                stations={filteredL3}
                selectedIds={filters.stationIds}
                accent={LINHA_VERMELHA_COLOR}
                onToggle={toggleStation}
                onToggleAll={() => toggleAllOnLine(filteredL3)}
              />
            </div>
          </details>

          <details open className="rounded-md border border-slate-200 bg-white">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-800 [&::-webkit-details-marker]:hidden">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: LINHA_LARANJA_COLOR }}
              />
              Linha 6-Laranja — Ativas ({LINHA_LARANJA_ATIVAS.length} estações)
            </summary>
            <div className="max-h-44 overflow-y-auto border-t border-slate-100">
              <StationChecklist
                stations={filteredL6}
                selectedIds={filters.stationIds}
                accent={LINHA_LARANJA_COLOR}
                onToggle={toggleStation}
                onToggleAll={() => toggleAllOnLine(filteredL6)}
              />
            </div>
          </details>
        </div>

      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-slate-700">Status</p>
        <p className="mb-2 text-[10px] leading-snug text-slate-500">
          Pacote, quartos, vagas e portal valem só para Candidato. Os demais
          status aparecem pelo Status (e estações, se selecionadas).
        </p>
        <div className="flex flex-wrap gap-1.5">
          {APARTMENT_STATUSES.map((status) => {
            const active = (filters.statuses ?? APARTMENT_STATUSES).includes(
              status
            );
            return (
              <button
                key={status}
                type="button"
                onClick={() => toggleStatus(status)}
                className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition ${
                  active
                    ? "border-slate-800 bg-slate-800 text-white"
                    : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                }`}
              >
                {status}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-slate-700">Ordenar por</p>
        <select
          value={filters.sortBy}
          onChange={(e) =>
            onChange({ ...filters, sortBy: e.target.value as SortOption })
          }
          className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
