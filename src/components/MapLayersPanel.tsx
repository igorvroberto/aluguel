"use client";

import { Bus, ChevronDown, TrainFront } from "lucide-react";
import {
  LINHA_LARANJA_ATIVAS,
  LINHA_LARANJA_COLOR,
  LINHA_VERMELHA,
  LINHA_VERMELHA_COLOR,
} from "../../data/linhasMetro";
import { BUS_CORRIDORS, TRANSIT_STATIONS } from "@/lib/constants";
import { BUS_LINES } from "@/lib/bus-lines";

export interface MapLayersState {
  showBusLines: boolean;
  enabledLines: Record<string, boolean>;
  showLinhaVermelha: boolean;
  showLinhaLaranja: boolean;
  showTransit: boolean;
}

interface MapLayersPanelProps {
  layers: MapLayersState;
  onChange: (next: MapLayersState) => void;
  stationIds?: string[];
  stationRadiusMeters?: number;
}

export function MapLayersPanel({
  layers,
  onChange,
  stationIds = [],
  stationRadiusMeters = 800,
}: MapLayersPanelProps) {
  const patch = (partial: Partial<MapLayersState>) =>
    onChange({ ...layers, ...partial });

  return (
    <div className="flex shrink-0 flex-wrap items-start gap-2 border-b border-slate-200 bg-white/95 px-3 py-2">
      <details className="group min-w-[200px] max-w-[280px] rounded-md border border-slate-200 bg-white open:shadow-sm">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 [&::-webkit-details-marker]:hidden">
          <Bus className="h-3.5 w-3.5 text-teal-700" aria-hidden />
          Linhas Barra Funda
          <span className="ml-auto text-[10px] font-medium text-slate-400">
            {layers.showBusLines ? "visível" : "oculto"}
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-slate-400 transition group-open:rotate-180" />
        </summary>
        <div className="space-y-2 border-t border-slate-100 px-3 py-2 text-[11px] text-slate-600">
          <label className="flex cursor-pointer items-center gap-2 font-medium text-slate-800">
            <input
              type="checkbox"
              checked={layers.showBusLines}
              onChange={() => patch({ showBusLines: !layers.showBusLines })}
              className="accent-teal-700"
            />
            Mostrar linhas no mapa
          </label>
          <ul className="max-h-40 space-y-1.5 overflow-y-auto">
            {BUS_LINES.map((line) => {
              const on = layers.enabledLines[line.id] !== false;
              return (
                <li key={line.id}>
                  <label className="flex cursor-pointer gap-2">
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={!layers.showBusLines}
                      onChange={() =>
                        patch({
                          enabledLines: {
                            ...layers.enabledLines,
                            [line.id]: !on,
                          },
                        })
                      }
                      className="mt-0.5 accent-teal-700"
                    />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 font-semibold text-slate-800">
                        <span
                          className="inline-block h-1.5 w-5 rounded-full"
                          style={{ backgroundColor: line.color }}
                        />
                        {line.code}
                      </span>
                      <span className="block text-[10px] leading-snug text-slate-500">
                        {line.name}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      </details>

      <details className="group min-w-[200px] max-w-[280px] rounded-md border border-slate-200 bg-white open:shadow-sm">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 [&::-webkit-details-marker]:hidden">
          <TrainFront
            className="h-3.5 w-3.5"
            style={{ color: LINHA_VERMELHA_COLOR }}
            aria-hidden
          />
          Linha 3-Vermelha
          <span className="ml-auto text-[10px] font-medium text-slate-400">
            {layers.showLinhaVermelha ? "visível" : "oculto"}
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-slate-400 transition group-open:rotate-180" />
        </summary>
        <div className="space-y-2 border-t border-slate-100 px-3 py-2 text-[11px] text-slate-600">
          <label className="flex cursor-pointer items-center gap-2 font-medium text-slate-800">
            <input
              type="checkbox"
              checked={layers.showLinhaVermelha}
              onChange={() =>
                patch({ showLinhaVermelha: !layers.showLinhaVermelha })
              }
              className="accent-[#EE352E]"
            />
            Mostrar traçado e estações
          </label>
          <ul className="max-h-36 space-y-0.5 overflow-y-auto">
            {LINHA_VERMELHA.map((s) => (
              <li
                key={s.id}
                className={`flex items-center gap-1.5 ${
                  stationIds.includes(s.id) ? "font-semibold text-rose-800" : ""
                }`}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: LINHA_VERMELHA_COLOR }}
                />
                <span className="truncate">{s.name}</span>
              </li>
            ))}
          </ul>
        </div>
      </details>

      <details className="group min-w-[200px] max-w-[280px] rounded-md border border-slate-200 bg-white open:shadow-sm">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 [&::-webkit-details-marker]:hidden">
          <TrainFront
            className="h-3.5 w-3.5"
            style={{ color: LINHA_LARANJA_COLOR }}
            aria-hidden
          />
          Linha 6-Laranja
          <span className="ml-auto text-[10px] font-medium text-slate-400">
            {layers.showLinhaLaranja ? "visível" : "oculto"}
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-slate-400 transition group-open:rotate-180" />
        </summary>
        <div className="space-y-2 border-t border-slate-100 px-3 py-2 text-[11px] text-slate-600">
          <label className="flex cursor-pointer items-center gap-2 font-medium text-slate-800">
            <input
              type="checkbox"
              checked={layers.showLinhaLaranja}
              onChange={() =>
                patch({ showLinhaLaranja: !layers.showLinhaLaranja })
              }
              className="accent-[#FF6B00]"
            />
            Mostrar trecho ativo
          </label>
          <p className="text-[10px] leading-snug text-slate-500">
            João Paulo I → Perdizes
            {stationIds.length > 0
              ? ` · raio ${stationRadiusMeters} m`
              : ""}
          </p>
          <ul className="max-h-36 space-y-0.5 overflow-y-auto">
            {LINHA_LARANJA_ATIVAS.map((s) => (
              <li
                key={s.id}
                className={`flex items-center gap-1.5 ${
                  stationIds.includes(s.id)
                    ? "font-semibold text-orange-800"
                    : ""
                }`}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: LINHA_LARANJA_COLOR }}
                />
                <span className="truncate">{s.name}</span>
              </li>
            ))}
          </ul>
        </div>
      </details>

      <details className="group min-w-[200px] max-w-[280px] rounded-md border border-slate-200 bg-white open:shadow-sm">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 [&::-webkit-details-marker]:hidden">
          <TrainFront className="h-3.5 w-3.5 text-blue-600" aria-hidden />
          Estações / corredores
          <span className="ml-auto text-[10px] font-medium text-slate-400">
            {layers.showTransit ? "visível" : "oculto"}
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-slate-400 transition group-open:rotate-180" />
        </summary>
        <div className="space-y-2 border-t border-slate-100 px-3 py-2 text-[11px] text-slate-600">
          <label className="flex cursor-pointer items-center gap-2 font-medium text-slate-800">
            <input
              type="checkbox"
              checked={layers.showTransit}
              onChange={() => patch({ showTransit: !layers.showTransit })}
              className="accent-blue-600"
            />
            Mostrar outras estações e corredores
          </label>
          <p className="font-semibold text-slate-800">Estações</p>
          <ul className="mb-2 space-y-0.5">
            {TRANSIT_STATIONS.map((s) => (
              <li key={s.id} className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                {s.name}
              </li>
            ))}
          </ul>
          <p className="font-semibold text-slate-800">Corredores</p>
          <ul className="space-y-0.5">
            {BUS_CORRIDORS.map((c) => (
              <li key={c.id}>
                {c.name}: {c.lines.join(", ")}
              </li>
            ))}
          </ul>
        </div>
      </details>
    </div>
  );
}
