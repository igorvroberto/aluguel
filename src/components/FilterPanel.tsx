"use client";

import { useMemo, useState } from "react";
import { Search, TrainFront, X } from "lucide-react";
import {
  DEFAULT_STATION_RADIUS_METERS,
  LINHA_LARANJA_ATIVAS,
  LINHA_LARANJA_COLOR,
  LINHA_VERMELHA,
  LINHA_VERMELHA_COLOR,
  METRO_STATIONS,
  sortLinhaLaranjaForFilter,
  type MetroStation,
} from "../../data/linhasMetro";
import { DEFAULT_MAX_PACKAGE } from "@/lib/constants";
import { formatBRL } from "@/lib/format";
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

const SORT_OPTIONS: Array<{ value: SortOption; label: string }> = [
  { value: "pacote", label: "Menor Pacote" },
  { value: "distancia", label: "Menor Distância" },
  { value: "subida", label: "Menor Subida" },
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

  const toggleRoom = (room: 1 | 2 | 3) => {
    const exists = filters.rooms.includes(room);
    const rooms = exists
      ? filters.rooms.filter((r) => r !== room)
      : [...filters.rooms, room];
    onChange({ ...filters, rooms: rooms.sort() as Array<1 | 2 | 3> });
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
        <div className="mb-2 flex items-center justify-between text-sm">
          <label htmlFor="max-package" className="font-medium text-slate-700">
            Pacote mensal máx.
          </label>
          <span className="tabular-nums font-semibold text-teal-800">
            {formatBRL(filters.maxPackage)}
          </span>
        </div>
        <input
          id="max-package"
          type="range"
          min={1500}
          max={8000}
          step={100}
          value={filters.maxPackage}
          onChange={(e) =>
            onChange({ ...filters, maxPackage: Number(e.target.value) })
          }
          className="w-full accent-teal-700"
        />
        <div className="mt-1 flex justify-between text-[11px] text-slate-400">
          <span>{formatBRL(1500)}</span>
          <button
            type="button"
            className="text-teal-700 hover:underline"
            onClick={() =>
              onChange({ ...filters, maxPackage: DEFAULT_MAX_PACKAGE })
            }
          >
            padrão {formatBRL(DEFAULT_MAX_PACKAGE)}
          </button>
          <span>{formatBRL(8000)}</span>
        </div>
        <p className="mt-1 text-[11px] text-slate-500">
          aluguel + condomínio + IPTU
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

        <p className="mt-1.5 text-[10px] leading-snug text-slate-400">
          Com estações marcadas, mostra imóveis perto de{" "}
          <strong>pelo menos uma</strong> delas (até{" "}
          {DEFAULT_STATION_RADIUS_METERS} m) · {METRO_STATIONS.length} estações.
        </p>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-slate-700">Status</p>
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
