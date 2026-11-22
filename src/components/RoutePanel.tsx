"use client";

import { useEffect, useMemo, useState } from "react";
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
  /** Qual perna a pé desenhar no mapa (ida/volta). */
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

export function RoutePanel({
  apartment,
  analysis,
  hoverDistance,
  onHoverDistance,
  walkDirection,
  onWalkDirectionChange,
}: RoutePanelProps) {
  const [mode, setMode] = useState<TravelMode>("walk");
  const [transitDir, setTransitDir] = useState<TripDirection>("ida");
  const [transitIda, setTransitIda] = useState<TransitRouteResult | null>(null);
  const [transitVolta, setTransitVolta] = useState<TransitRouteResult | null>(
    null
  );
  const [transitWarning, setTransitWarning] = useState<string | null>(null);
  const [loadingTransit, setLoadingTransit] = useState(false);
  const [transitError, setTransitError] = useState<string | null>(null);

  useEffect(() => {
    setMode("walk");
    setTransitDir("ida");
    setTransitIda(null);
    setTransitVolta(null);
    setTransitWarning(null);
    setTransitError(null);
    onWalkDirectionChange("ida");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apartment?.id]);

  useEffect(() => {
    if (mode !== "transit" || !apartment) return;
    const cached = transitDir === "ida" ? transitIda : transitVolta;
    if (cached) return;

    let cancelled = false;
    setLoadingTransit(true);
    setTransitError(null);

    void (async () => {
      try {
        const res = await fetch("/api/transit-route", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lat: apartment.lat,
            lng: apartment.lng,
            direction: transitDir,
          }),
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
        if (transitDir === "ida") setTransitIda(data.route);
        else setTransitVolta(data.route);
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
  }, [mode, apartment, transitDir, transitIda, transitVolta]);

  const activeWalkLeg: WalkLegAnalysis | null = useMemo(() => {
    if (!analysis) return null;
    return walkDirection === "ida" ? analysis.ida : analysis.volta;
  }, [analysis, walkDirection]);

  const chartAnalysis = useMemo(() => {
    if (!analysis || !activeWalkLeg) return null;
    return {
      ...analysis,
      distanceMeters: activeWalkLeg.distanceMeters,
      elevationGain: activeWalkLeg.elevationGain,
      maxGrade: activeWalkLeg.maxGrade,
      topography: activeWalkLeg.topography,
      coordinates: activeWalkLeg.coordinates,
      elevationProfile: activeWalkLeg.elevationProfile,
      segmentGrades: activeWalkLeg.segmentGrades,
    };
  }, [analysis, activeWalkLeg]);

  const transit =
    transitDir === "ida" ? transitIda : transitVolta;

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

        <div className="flex rounded-md border border-slate-200 p-0.5">
          {(["ida", "volta"] as TripDirection[]).map((dir) => {
            const active =
              mode === "walk" ? walkDirection === dir : transitDir === dir;
            return (
              <button
                key={dir}
                type="button"
                onClick={() => {
                  if (mode === "walk") onWalkDirectionChange(dir);
                  else setTransitDir(dir);
                }}
                className={`rounded px-3 py-1.5 text-xs font-semibold capitalize transition ${
                  active
                    ? "bg-slate-800 text-white"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {dir}
              </button>
            );
          })}
        </div>
      </div>

      {mode === "walk" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {analysis && (
            <div className="grid grid-cols-2 gap-2 border-b border-slate-100 px-4 py-2">
              <WalkLegSummary leg={analysis.ida} label="Ida (imóvel → faculdade)" />
              <WalkLegSummary
                leg={analysis.volta}
                label="Volta (faculdade → imóvel)"
              />
            </div>
          )}
          <div className="min-h-0 flex-1">
            <ElevationChart
              analysis={chartAnalysis}
              hoverDistance={hoverDistance}
              onHoverDistance={onHoverDistance}
              emptyMessage={
                apartment
                  ? "Perfil de elevação a pé indisponível (configure NEXT_PUBLIC_MAPBOX_TOKEN ou aguarde o cálculo)."
                  : undefined
              }
            />
          </div>
          <p className="border-t border-slate-100 px-4 py-1.5 text-[10px] text-slate-400">
            Perfil de elevação considera apenas o trecho a pé da{" "}
            <strong>{walkDirection}</strong>.
          </p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {loadingTransit && (
            <p className="inline-flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Calculando transporte público ({transitDir})…
            </p>
          )}

          {transitError && (
            <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {transitError}
            </p>
          )}

          {transit && (
            <div className="space-y-3">
              {transit.preferDirectWalk && (
                <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-950">
                  A pé direto (~{transit.directWalkMinutes} min) é mais rápido
                  que metrô/ônibus + caminhadas neste trajeto. Não vale desviar
                  para estação ou ponto.
                </p>
              )}

              {transitWarning && !transit.preferDirectWalk && (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  {transitWarning}
                </p>
              )}

              <div className="text-xs text-slate-600">
                <p className="font-semibold text-slate-800">
                  {transitDir === "ida" ? "Ida" : "Volta"} · porta a porta:{" "}
                  {transit.totalDurationMinutes} min
                </p>
                <p className="text-[11px] text-slate-500">
                  Caminhada no trajeto: {transit.walkDurationMinutes} min
                  {activeWalkLeg && transit.preferDirectWalk
                    ? ` · altimetria a pé (${walkDirection}) +${Math.round(activeWalkLeg.elevationGain)} m`
                    : ""}
                </p>
              </div>

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
            </div>
          )}
        </div>
      )}
    </div>
  );
}
