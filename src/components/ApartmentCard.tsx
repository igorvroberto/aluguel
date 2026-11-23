"use client";

import { useState } from "react";
import { Car, ExternalLink, MapPinned, Shield } from "lucide-react";
import { DESTINATION } from "@/lib/constants";
import { distanceMeters } from "@/lib/geo";
import { formatBRL, formatDistanceKm, monthlyPackage } from "@/lib/format";
import { resolveListingUrl } from "@/lib/listing-url";
import { portalLabel, resolveApartmentPortal } from "@/lib/portals";
import {
  APARTMENT_STATUSES,
  type Apartment,
  type ApartmentStatus,
} from "@/lib/types";

interface ApartmentCardProps {
  apartment: Apartment;
  selected: boolean;
  onSelect: () => void;
  /** Traçar rota: seleciona e rola até o mapa (não até o painel de detalhe). */
  onTraceRoute?: () => void;
  onUpdateStatus?: (id: string, status: ApartmentStatus) => void;
  onUpdateComments?: (id: string, comments: string) => void;
}

const STATUS_STYLES: Record<ApartmentStatus, string> = {
  Candidato: "border-slate-300 bg-slate-50 text-slate-700",
  Manual: "border-teal-300 bg-teal-50 text-teal-900",
  Favorito: "border-amber-300 bg-amber-50 text-amber-900",
  "Visita Agendada": "border-sky-300 bg-sky-50 text-sky-900",
  Descartado: "border-rose-200 bg-rose-50 text-rose-800",
};

export function ApartmentCard({
  apartment,
  selected,
  onSelect,
  onTraceRoute,
  onUpdateStatus,
  onUpdateComments,
}: ApartmentCardProps) {
  const [commentsDraft, setCommentsDraft] = useState(apartment.comments || "");

  const total = monthlyPackage(
    apartment.aluguel,
    apartment.condominio,
    apartment.iptu
  );
  const listingHref = resolveListingUrl(apartment);
  const status = apartment.status || "Candidato";
  const distToDest = distanceMeters(apartment, DESTINATION);
  const portal = portalLabel(resolveApartmentPortal(apartment));

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
          ? "bg-amber-50 ring-2 ring-inset ring-amber-500/70 shadow-[inset_3px_0_0_0_#d97706]"
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
        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-slate-700">
          <Car className="h-3 w-3" aria-hidden />
          {apartment.parkingSpots ?? 0} vaga
          {(apartment.parkingSpots ?? 0) === 1 ? "" : "s"}
        </span>
        <span className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-600">
          {portal}
        </span>
        {apartment.portaria24h && (
          <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-1 text-sky-800">
            <Shield className="h-3 w-3" aria-hidden />
            24h
          </span>
        )}
        <span
          className={`inline-flex items-center rounded-md border px-2 py-1 text-[10px] font-semibold ${STATUS_STYLES[status]}`}
        >
          {status}
        </span>
        <span
          className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 tabular-nums text-slate-700"
          title="Distância em linha reta até o destino"
        >
          {formatDistanceKm(distToDest)}
        </span>
      </div>

      {(onUpdateStatus || onUpdateComments) && (
        <div
          className="mt-3 space-y-2"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {onUpdateStatus && (
            <select
              value={status}
              onChange={(e) =>
                onUpdateStatus(apartment.id, e.target.value as ApartmentStatus)
              }
              className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-teal-600"
            >
              {APARTMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
          {onUpdateComments && (
            <div className="flex gap-1.5">
              <input
                value={commentsDraft}
                onChange={(e) => setCommentsDraft(e.target.value)}
                placeholder="Comentários / notas da visita…"
                className="min-w-0 flex-1 rounded-md border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-teal-600"
              />
              <button
                type="button"
                className="shrink-0 rounded-md bg-slate-800 px-2 py-1.5 text-[10px] font-semibold text-white"
                onClick={() =>
                  onUpdateComments(apartment.id, commentsDraft.trim())
                }
              >
                Salvar
              </button>
            </div>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            (onTraceRoute ?? onSelect)();
          }}
          className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-900"
        >
          <MapPinned className="h-3.5 w-3.5" aria-hidden />
          Traçar Rota / Mapa
        </button>
        {listingHref ? (
          <a
            href={listingHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50"
            title="Abrir anúncio"
          >
            Abrir Anúncio
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        ) : null}
      </div>
    </article>
  );
}
