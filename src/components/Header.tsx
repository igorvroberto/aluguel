"use client";

import { HardDriveDownload, MapPinned } from "lucide-react";
import { DESTINATION } from "@/lib/constants";

interface HeaderProps {
  visibleCount: number;
  onDownloadServerJson?: () => void;
}

export function Header({ visibleCount, onDownloadServerJson }: HeaderProps) {
  return (
    <header className="flex h-[60px] shrink-0 items-center justify-between gap-3 border-b border-slate-200/80 bg-gradient-to-r from-[#0f3d3e] via-[#145c5e] to-[#1a6b5c] px-4 text-white shadow-sm">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/20">
          <MapPinned className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0">
          <h1 className="font-display text-lg font-semibold tracking-tight sm:text-xl">
            Imóveis Radar
          </h1>
          <p className="truncate text-xs text-teal-50/85">
            Destino: {DESTINATION.name}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <div className="rounded-md bg-white/10 px-3 py-1.5 text-sm ring-1 ring-white/15">
          <span className="font-semibold tabular-nums">{visibleCount}</span>
          <span className="ml-1 text-teal-50/80">
            {visibleCount === 1 ? "imóvel" : "imóveis"}
          </span>
        </div>

        {onDownloadServerJson && (
          <button
            type="button"
            onClick={onDownloadServerJson}
            title="Baixar data/apartments.json atual do servidor"
            className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-2 text-xs font-semibold text-white ring-1 ring-white/15 transition hover:bg-white/20"
          >
            <HardDriveDownload className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">Baixar JSON Atualizado</span>
          </button>
        )}
      </div>
    </header>
  );
}
