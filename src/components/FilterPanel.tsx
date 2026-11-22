"use client";

import { DEFAULT_MAX_PACKAGE } from "@/lib/constants";
import { formatBRL } from "@/lib/format";
import type { FiltersState, SortOption } from "@/lib/types";

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

export function FilterPanel({ filters, onChange }: FilterPanelProps) {
  const toggleRoom = (room: 1 | 2 | 3) => {
    const exists = filters.rooms.includes(room);
    const rooms = exists
      ? filters.rooms.filter((r) => r !== room)
      : [...filters.rooms, room];
    onChange({ ...filters, rooms: rooms.sort() as Array<1 | 2 | 3> });
  };

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
