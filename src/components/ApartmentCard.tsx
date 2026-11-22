"use client";

import { ExternalLink, Footprints, Mountain, Shield } from "lucide-react";
import {
  formatBRL,
  formatDistance,
  formatElevation,
  monthlyPackage,
  topographyBadgeClass,
} from "@/lib/format";
import type { Apartment, RouteAnalysis } from "@/lib/types";

interface ApartmentCardProps {
  apartment: Apartment;
  analysis?: RouteAnalysis;
  selected: boolean;
  analyzing: boolean;
  onSelect: () => void;
}

export function ApartmentCard({
  apartment,
  analysis,
  selected,
  analyzing,
  onSelect,
}: ApartmentCardProps) {
  const total = monthlyPackage(
    apartment.aluguel,
    apartment.condominio,
    apartment.iptu
  );

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`cursor-pointer border-b border-slate-100 px-4 py-3 transition ${
        selected
          ? "bg-teal-50/90 ring-1 ring-inset ring-teal-600/30"
          : "bg-white hover:bg-slate-50/80"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-slate-900">
            {apartment.title}
          </h3>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {apartment.address}
          </p>
        </div>
        <div className="text-right">
          <p className="text-base font-bold tabular-nums text-teal-800">
            {formatBRL(total)}
          </p>
          <p className="text-[10px] uppercase tracking-wide text-slate-400">
            pacote/mês
          </p>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-1 text-[11px] text-slate-600">
        <div>
          <span className="text-slate-400">Aluguel</span>
          <p className="font-medium tabular-nums">
            {formatBRL(apartment.aluguel)}
          </p>
        </div>
        <div>
          <span className="text-slate-400">Cond.</span>
          <p className="font-medium tabular-nums">
            {formatBRL(apartment.condominio)}
          </p>
        </div>
        <div>
          <span className="text-slate-400">IPTU</span>
          <p className="font-medium tabular-nums">{formatBRL(apartment.iptu)}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-slate-700">
          {apartment.rooms >= 3 ? "3+" : apartment.rooms} qto
          {apartment.rooms === 1 ? "" : "s"}
        </span>
        {apartment.portaria24h && (
          <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-1 text-sky-800">
            <Shield className="h-3 w-3" aria-hidden />
            24h
          </span>
        )}
        {analysis ? (
          <>
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-slate-700">
              <Footprints className="h-3 w-3" aria-hidden />
              {formatDistance(analysis.distanceMeters)}
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-slate-700">
              <Mountain className="h-3 w-3" aria-hidden />
              +{formatElevation(analysis.elevationGain)}
            </span>
            <span
              className={`inline-flex items-center rounded-md border px-2 py-1 font-medium ${topographyBadgeClass(
                analysis.topography
              )}`}
            >
              {analysis.topography}
            </span>
          </>
        ) : analyzing ? (
          <span className="text-slate-400">Analisando trajeto…</span>
        ) : (
          <span className="text-slate-400">Selecione para analisar</span>
        )}
      </div>

      <a
        href={apartment.externalUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:underline"
      >
        Ver anúncio / mapa
        <ExternalLink className="h-3 w-3" aria-hidden />
      </a>
    </article>
  );
}
