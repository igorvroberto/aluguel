"use client";

import { MapPinned, Plus } from "lucide-react";
import { DESTINATION } from "@/lib/constants";

interface HeaderProps {
  visibleCount: number;
  onAdd: () => void;
}

export function Header({ visibleCount, onAdd }: HeaderProps) {
  return (
    <header className="flex h-[60px] shrink-0 items-center justify-between gap-4 border-b border-slate-200/80 bg-gradient-to-r from-[#0f3d3e] via-[#145c5e] to-[#1a6b5c] px-4 text-white shadow-sm">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/20">
          <MapPinned className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0">
          <h1 className="font-display text-lg font-semibold tracking-tight sm:text-xl">
            Perdizes Radar
          </h1>
          <p className="truncate text-xs text-teal-50/85">
            Destino: {DESTINATION.name}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden rounded-md bg-white/10 px-3 py-1.5 text-sm ring-1 ring-white/15 sm:block">
          <span className="font-semibold tabular-nums">{visibleCount}</span>
          <span className="ml-1 text-teal-50/80">
            {visibleCount === 1 ? "imóvel visível" : "imóveis visíveis"}
          </span>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1.5 rounded-md bg-[#f0b429] px-3 py-2 text-sm font-semibold text-slate-900 transition hover:bg-[#f5c451] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Adicionar Imóvel
        </button>
      </div>
    </header>
  );
}
