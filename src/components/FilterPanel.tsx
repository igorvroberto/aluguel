"use client";

import { useMemo, useState } from "react";
import { MapPinned, Search, TrainFront, X } from "lucide-react";
import {
  DEFAULT_STATION_RADIUS_METERS,
  LINHA_VERMELHA,
  LINHA_VERMELHA_COLOR,
  LINHA_VERMELHA_WEST_CENTER_IDS,
  STATION_RADIUS_OPTIONS,
} from "../../data/linhaVermelha";
import { DEFAULT_MAX_PACKAGE } from "@/lib/constants";
import { formatBRL } from "@/lib/format";
import type { FiltersState, SortOption } from "@/lib/types";

interface FilterPanelProps {
  filters: FiltersState;
  onChange: (next: FiltersState) => void;
  onFocusStations?: () => void;
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

export function FilterPanel({
  filters,
  onChange,
  onFocusStations,
}: FilterPanelProps) {
  const [stationQuery, setStationQuery] = useState("");

  const toggleRoom = (room: 1 | 2 | 3) => {
    const exists = filters.rooms.includes(room);
    const rooms = exists
      ? filters.rooms.filter((r) => r !== room)
      : [...filters.rooms, room];
    onChange({ ...filters, rooms: rooms.sort() as Array<1 | 2 | 3> });
  };

  const filteredStations = useMemo(() => {
    const q = stationQuery.trim().toLowerCase();
    if (!q) return LINHA_VERMELHA;
    return LINHA_VERMELHA.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.integration?.toLowerCase().includes(q) ?? false)
    );
  }, [stationQuery]);

  const toggleStation = (id: string) => {
    const exists = filters.stationIds.includes(id);
    const stationIds = exists
      ? filters.stationIds.filter((s) => s !== id)
      : [...filters.stationIds, id];
    onChange({ ...filters, stationIds });
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

      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">Topografia</p>
          <div className="flex rounded-md border border-slate-200 p-0.5">
            <button
              type="button"
              onClick={() => onChange({ ...filters, onlyFlat: false })}
              className={`flex-1 rounded px-2 py-1.5 text-xs font-medium transition ${
                !filters.onlyFlat
                  ? "bg-slate-800 text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => onChange({ ...filters, onlyFlat: true })}
              className={`flex-1 rounded px-2 py-1.5 text-xs font-medium transition ${
                filters.onlyFlat
                  ? "bg-emerald-700 text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              Apenas Planos
            </button>
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">Portaria</p>
          <label className="flex h-[34px] cursor-pointer items-center justify-between rounded-md border border-slate-200 px-3">
            <span className="text-xs text-slate-600">Portaria 24h</span>
            <input
              type="checkbox"
              checked={filters.portaria24h}
              onChange={(e) =>
                onChange({ ...filters, portaria24h: e.target.checked })
              }
              className="h-4 w-4 accent-teal-700"
            />
          </label>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-700">
          <TrainFront
            className="h-3.5 w-3.5"
            style={{ color: LINHA_VERMELHA_COLOR }}
            aria-hidden
          />
          Estações Linha 3-Vermelha
          {selectedCount > 0 && (
            <span
              className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white"
              style={{ backgroundColor: LINHA_VERMELHA_COLOR }}
            >
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
            placeholder="Buscar estação…"
            className="w-full rounded-md border border-slate-200 bg-white py-1.5 pl-8 pr-8 text-xs text-slate-700 outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/15"
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

        <div className="mb-2 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => onChange({ ...filters, stationIds: [] })}
            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
          >
            Limpar Seleção
          </button>
          <button
            type="button"
            onClick={() =>
              onChange({
                ...filters,
                stationIds: [...LINHA_VERMELHA_WEST_CENTER_IDS],
              })
            }
            className="rounded-md border px-2 py-1 text-[10px] font-semibold text-white"
            style={{
              backgroundColor: LINHA_VERMELHA_COLOR,
              borderColor: LINHA_VERMELHA_COLOR,
            }}
            title="Palmeiras–Barra Funda → República"
          >
            Selecionar Trecho Oeste/Centro (Barra Funda → República)
          </button>
        </div>

        <div className="max-h-40 overflow-y-auto rounded-md border border-slate-200 bg-white">
          {filteredStations.length === 0 ? (
            <p className="px-3 py-2 text-[11px] text-slate-400">
              Nenhuma estação encontrada.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {filteredStations.map((s) => {
                const active = filters.stationIds.includes(s.id);
                return (
                  <li key={s.id}>
                    <label className="flex cursor-pointer items-start gap-2 px-2.5 py-1.5 hover:bg-rose-50/50">
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={() => toggleStation(s.id)}
                        className="mt-0.5 accent-[#EE352E]"
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
              })}
            </ul>
          )}
        </div>

        <div className="mt-2">
          <p className="mb-1.5 text-[11px] font-medium text-slate-600">
            Raio máximo até a estação
          </p>
          <div className="flex gap-1.5">
            {STATION_RADIUS_OPTIONS.map((opt) => {
              const active = filters.stationRadiusMeters === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() =>
                    onChange({ ...filters, stationRadiusMeters: opt.value })
                  }
                  className={`flex-1 rounded-md border px-2 py-1.5 text-[11px] font-semibold transition ${
                    active
                      ? "border-[#EE352E] bg-[#EE352E] text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {selectedCount > 0 && onFocusStations && (
          <button
            type="button"
            onClick={onFocusStations}
            className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-900 hover:bg-rose-100"
          >
            <MapPinned className="h-3.5 w-3.5" aria-hidden />
            Focar Estações Selecionadas
          </button>
        )}

        <p className="mt-1.5 text-[10px] leading-snug text-slate-400">
          Com estações marcadas, mostra imóveis a até o raio de{" "}
          <strong>pelo menos uma</strong> delas. Padrão:{" "}
          {DEFAULT_STATION_RADIUS_METERS} m.
        </p>
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
