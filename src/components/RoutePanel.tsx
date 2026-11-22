"use client";

import { useEffect, useState } from "react";
import { Bus, Footprints, Loader2 } from "lucide-react";
import { ElevationChart } from "@/components/ElevationChart";
import type { TransitRouteResult } from "@/lib/transit";
import type { Apartment, RouteAnalysis, TravelMode } from "@/lib/types";

interface RoutePanelProps {
  apartment: Apartment | null;
  analysis: RouteAnalysis | null;
  hoverDistance: number | null;
  onHoverDistance: (distance: number | null) => void;
}

export function RoutePanel({
  apartment,
  analysis,
  hoverDistance,
  onHoverDistance,
}: RoutePanelProps) {
  const [mode, setMode] = useState<TravelMode>("walk");
  const [transit, setTransit] = useState<TransitRouteResult | null>(null);
  const [transitWarning, setTransitWarning] = useState<string | null>(null);
  const [loadingTransit, setLoadingTransit] = useState(false);
  const [transitError, setTransitError] = useState<string | null>(null);

  useEffect(() => {
    setMode("walk");
    setTransit(null);
    setTransitWarning(null);
    setTransitError(null);
  }, [apartment?.id]);

  useEffect(() => {
    if (mode !== "transit" || !apartment) return;
    if (transit) return;

    let cancelled = false;
    setLoadingTransit(true);
    setTransitError(null);

    void (async () => {
      try {
        const res = await fetch("/api/transit-route", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat: apartment.lat, lng: apartment.lng }),
        });
        const data = (await res.json()) as {
          ok: boolean;
          route?: TransitRouteResult;
          warning?: string;
          error?: string;
        };
        if (cancelled) return;
        if (!data.ok || !data.route) {
          setTransitError(data.error || "Não foi possível calcular o trajeto.");
          return;
        }
        setTransit(data.route);
        setTransitWarning(data.warning || null);
      } catch {
        if (!cancelled) {
          setTransitError("Falha de rede ao consultar transporte público.");
        }
      } finally {
        if (!cancelled) setLoadingTransit(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, apartment, transit]);

  if (!apartment) {
    return (
      <div className="flex h-full items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100/80 px-6 text-center">
        <p className="max-w-sm text-sm text-slate-500">
          Selecione um imóvel para comparar trajetos a pé e de transporte
          público até a R. Dr. Emílio Ribas, 89.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-white to-slate-50">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2">
        <div className="flex rounded-md border border-slate-200 p-0.5">
          <button
            type="button"
            onClick={() => setMode("walk")}
            className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold transition ${
              mode === "walk"
                ? "bg-teal-700 text-white"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Footprints className="h-3.5 w-3.5" aria-hidden />
            A Pé
          </button>
          <button
            type="button"
            onClick={() => setMode("transit")}
            className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold transition ${
              mode === "transit"
                ? "bg-blue-600 text-white"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Bus className="h-3.5 w-3.5" aria-hidden />
            Transporte Público
          </button>
        </div>

        {mode === "transit" && transit && (
          <div className="text-right text-xs text-slate-600">
            <p className="font-semibold text-slate-800">
              Porta a porta: {transit.totalDurationMinutes} min
            </p>
            <p className="text-[11px] text-slate-500">
              Caminhada no trajeto: {transit.walkDurationMinutes} min
              {analysis
                ? ` · altimetria a pé +${Math.round(analysis.elevationGain)} m`
                : ""}
            </p>
          </div>
        )}
      </div>

      {mode === "walk" ? (
        <div className="min-h-0 flex-1">
          <ElevationChart
            analysis={analysis}
            hoverDistance={hoverDistance}
            onHoverDistance={onHoverDistance}
            emptyMessage={
              apartment
                ? "Análise a pé indisponível (configure NEXT_PUBLIC_MAPBOX_TOKEN ou aguarde o cálculo)."
                : undefined
            }
          />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {loadingTransit && (
            <p className="inline-flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Calculando transporte público…
            </p>
          )}

          {transitError && (
            <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {transitError}
            </p>
          )}

          {transit && (
            <div className="space-y-3">
              {transitWarning && (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  {transitWarning}
                </p>
              )}

              <p className="text-sm leading-relaxed text-slate-700">
                {transit.summary}
              </p>

              <ol className="space-y-2">
                {transit.steps.map((step, idx) => (
                  <li
                    key={`${step.instruction}-${idx}`}
                    className="flex gap-3 rounded-md border border-slate-100 bg-white px-3 py-2 text-sm"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800">
                        {step.instruction}
                      </p>
                      <p className="text-[11px] uppercase tracking-wide text-slate-400">
                        {step.mode === "WALK"
                          ? "A pé"
                          : step.mode === "BUS"
                            ? "Ônibus"
                            : step.mode === "SUBWAY"
                              ? "Metrô"
                              : "Transporte"}{" "}
                        · {step.durationMinutes} min
                        {step.distanceMeters
                          ? ` · ${Math.round(step.distanceMeters)} m`
                          : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>

              {analysis && (
                <p className="text-[11px] text-slate-500">
                  Altimetria do trecho caminhado (análise a pé do imóvel):
                  subida +{Math.round(analysis.elevationGain)} m · máx.{" "}
                  {Math.abs(analysis.maxGrade).toFixed(1)}% ·{" "}
                  {analysis.topography}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
