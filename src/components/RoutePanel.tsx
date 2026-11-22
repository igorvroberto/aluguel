"use client";

import { useEffect, useState } from "react";
import { Bus, Footprints, Loader2 } from "lucide-react";
import { ElevationChart } from "@/components/ElevationChart";
import type { TransitRouteResult } from "@/lib/transit";
import type {
  Apartment,
  RouteAnalysis,
  TravelMode,
  TripDirection,
  WalkLegAnalysis,
} from "@/lib/types";

interface RoutePanelProps {
  apartment: Apartment | null;
  analysis: RouteAnalysis | null;
  hoverDistance: number | null;
  onHoverDistance: (distance: number | null) => void;
  /** Qual perna a pé desenhar no mapa (ida/volta) — sync ao focar o gráfico. */
  walkDirection: TripDirection;
  onWalkDirectionChange: (dir: TripDirection) => void;
}

function WalkLegSummary({ leg, label }: { leg: WalkLegAnalysis; label: string }) {
  return (
    <div className="rounded-md border border-slate-100 bg-white px-3 py-2 text-xs text-slate-600">
      <p className="font-semibold text-slate-800">{label}</p>
      <p>
        {Math.round(leg.distanceMeters)} m · {leg.durationMinutes} min · subida +
        {Math.round(leg.elevationGain)} m · {leg.topography}
      </p>
    </div>
  );
}

function legAsChartAnalysis(
  analysis: RouteAnalysis,
  leg: WalkLegAnalysis
): RouteAnalysis {
  return {
    ...analysis,
    distanceMeters: leg.distanceMeters,
    elevationGain: leg.elevationGain,
    maxGrade: leg.maxGrade,
    topography: leg.topography,
    coordinates: leg.coordinates,
    elevationProfile: leg.elevationProfile,
    segmentGrades: leg.segmentGrades,
  };
}

function TransitLegBlock({
  label,
  route,
}: {
  label: string;
  route: TransitRouteResult;
}) {
  return (
    <div className="space-y-2 rounded-md border border-slate-100 bg-white px-3 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-slate-800">{label}</p>
        <p className="text-xs text-slate-600">
          porta a porta:{" "}
          <span className="font-semibold text-slate-900">
            {route.totalDurationMinutes} min
          </span>
          {route.directWalkMinutes != null && !route.preferDirectWalk ? (
            <span className="text-slate-400">
              {" "}
              · a pé direto ~{route.directWalkMinutes} min
            </span>
          ) : null}
        </p>
      </div>

      {route.preferDirectWalk ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-950">
          A pé direto (~{route.directWalkMinutes} min) é mais rápido que
          metrô/ônibus + caminhadas neste trajeto.
        </p>
      ) : (
        <p className="text-[11px] text-slate-500">
          Caminhada no trajeto: {route.walkDurationMinutes} min
        </p>
      )}

      <p className="text-sm leading-relaxed text-slate-700">{route.summary}</p>

      <ol className="space-y-2">
        {route.steps.map((step, idx) => (
          <li
            key={`${label}-${step.instruction}-${idx}`}
            className="flex gap-3 rounded-md border border-slate-100 bg-slate-50/80 px-3 py-2 text-sm"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
              {idx + 1}
            </span>
            <div className="min-w-0">
              <p className="font-medium text-slate-800">{step.instruction}</p>
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
    </div>
  );
}

export function RoutePanel({
  apartment,
  analysis,
  hoverDistance,
  onHoverDistance,
  walkDirection,
  onWalkDirectionChange,
}: RoutePanelProps) {
  const [mode, setMode] = useState<TravelMode>("walk");
  const [transitIda, setTransitIda] = useState<TransitRouteResult | null>(null);
  const [transitVolta, setTransitVolta] = useState<TransitRouteResult | null>(
    null
  );
  const [transitWarning, setTransitWarning] = useState<string | null>(null);
  const [loadingTransit, setLoadingTransit] = useState(false);
  const [transitError, setTransitError] = useState<string | null>(null);

  useEffect(() => {
    setMode("walk");
    setTransitIda(null);
    setTransitVolta(null);
    setTransitWarning(null);
    setTransitError(null);
    onWalkDirectionChange("ida");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apartment?.id]);

  const walkIdaMin = analysis?.ida.durationMinutes;
  const walkVoltaMin = analysis?.volta.durationMinutes;

  useEffect(() => {
    if (mode !== "transit" || !apartment) return;

    let cancelled = false;
    setLoadingTransit(true);
    setTransitError(null);

    void (async () => {
      try {
        const fetchDir = async (
          direction: TripDirection,
          directWalkMinutes?: number
        ) => {
          const res = await fetch("/api/transit-route", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              lat: apartment.lat,
              lng: apartment.lng,
              direction,
              directWalkMinutes,
            }),
          });
          const data = (await res.json()) as {
            ok: boolean;
            route?: TransitRouteResult;
            warning?: string;
            error?: string;
          };
          if (!data.ok || !data.route) {
            throw new Error(
              data.error || "Não foi possível calcular o trajeto."
            );
          }
          return { route: data.route, warning: data.warning };
        };

        const [idaRes, voltaRes] = await Promise.all([
          fetchDir("ida", walkIdaMin),
          fetchDir("volta", walkVoltaMin),
        ]);

        if (cancelled) return;
        setTransitIda(idaRes.route);
        setTransitVolta(voltaRes.route);
        setTransitWarning(idaRes.warning || voltaRes.warning || null);
      } catch (err) {
        if (!cancelled) {
          setTransitError(
            err instanceof Error
              ? err.message
              : "Falha de rede ao consultar transporte público."
          );
        }
      } finally {
        if (!cancelled) setLoadingTransit(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, apartment, walkIdaMin, walkVoltaMin]);

  if (!apartment) {
    return (
      <div className="flex h-full items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100/80 px-6 text-center">
        <p className="max-w-sm text-sm text-slate-500">
          Selecione um imóvel para comparar ida e volta — a pé e de transporte
          público — até a Faculdade Santa Marcelina (R. Dr. Emílio Ribas, 89).
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
        <p className="text-[10px] text-slate-400">
          Ida e volta na mesma vista
          {mode === "walk" ? (
            <>
              {" "}
              · mapa: <span className="font-semibold">{walkDirection}</span>
            </>
          ) : null}
        </p>
      </div>

      {mode === "walk" ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {analysis ? (
            <>
              <div className="grid grid-cols-1 gap-2 border-b border-slate-100 px-4 py-2 sm:grid-cols-2">
                <WalkLegSummary
                  leg={analysis.ida}
                  label="Ida (imóvel → faculdade)"
                />
                <WalkLegSummary
                  leg={analysis.volta}
                  label="Volta (faculdade → imóvel)"
                />
              </div>

              <div
                className="border-b border-slate-100"
                onMouseEnter={() => onWalkDirectionChange("ida")}
              >
                <ElevationChart
                  analysis={legAsChartAnalysis(analysis, analysis.ida)}
                  hoverDistance={
                    walkDirection === "ida" ? hoverDistance : null
                  }
                  onHoverDistance={(d) => {
                    onWalkDirectionChange("ida");
                    onHoverDistance(d);
                  }}
                  title="Perfil de Elevação — Ida"
                  chartHeight={200}
                  emptyMessage="Perfil de elevação (ida) indisponível."
                />
              </div>

              <div
                onMouseEnter={() => onWalkDirectionChange("volta")}
              >
                <ElevationChart
                  analysis={legAsChartAnalysis(analysis, analysis.volta)}
                  hoverDistance={
                    walkDirection === "volta" ? hoverDistance : null
                  }
                  onHoverDistance={(d) => {
                    onWalkDirectionChange("volta");
                    onHoverDistance(d);
                  }}
                  title="Perfil de Elevação — Volta"
                  chartHeight={200}
                  emptyMessage="Perfil de elevação (volta) indisponível."
                />
              </div>
            </>
          ) : (
            <div className="flex h-[220px] items-center justify-center px-6 text-center text-sm text-slate-500">
              Calculando trajeto a pé e perfil de elevação…
            </div>
          )}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {loadingTransit && (
            <p className="mb-3 inline-flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Calculando transporte público (ida e volta)…
            </p>
          )}

          {transitError && (
            <p className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {transitError}
            </p>
          )}

          {transitWarning && (
            <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {transitWarning}
            </p>
          )}

          <div className="space-y-4">
            {transitIda && (
              <TransitLegBlock
                label="Ida (imóvel → faculdade)"
                route={transitIda}
              />
            )}
            {transitVolta && (
              <TransitLegBlock
                label="Volta (faculdade → imóvel)"
                route={transitVolta}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
