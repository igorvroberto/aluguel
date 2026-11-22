"use client";

import { useEffect, useMemo, useState } from "react";
import type { Map as MapboxMap } from "mapbox-gl";
import { Bus, Loader2, Mountain } from "lucide-react";
import { ElevationChart } from "@/components/ElevationChart";
import { legFromCoordinates } from "@/lib/elevation";
import type { TransitRouteResult } from "@/lib/transit";
import type {
  Apartment,
  RouteAnalysis,
  TripDirection,
  WalkLegAnalysis,
} from "@/lib/types";

interface RoutePanelProps {
  apartment: Apartment | null;
  analysis: RouteAnalysis | null;
  map: MapboxMap | null;
  hoverDistance: number | null;
  onHoverDistance: (distance: number | null) => void;
  walkDirection: TripDirection;
  onWalkDirectionChange: (dir: TripDirection) => void;
  /** Geometria só dos trechos Caminhe — para desenhar no mapa. */
  onElevationLegChange?: (leg: WalkLegAnalysis | null) => void;
}

function WalkLegSummary({
  leg,
  label,
}: {
  leg: WalkLegAnalysis;
  label: string;
}) {
  return (
    <div className="rounded-md border border-slate-100 bg-white px-3 py-2 text-xs text-slate-600">
      <p className="font-semibold text-slate-800">{label}</p>
      <p>
        {Math.round(leg.distanceMeters)} m · {leg.durationMinutes} min · subida +
        {Math.round(leg.elevationGain)} m · {leg.topography}
      </p>
      <p className="mt-0.5 text-[10px] text-slate-400">
        Só trechos “Caminhe” (sem metrô/ônibus)
      </p>
    </div>
  );
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
          Caminhada no trajeto: {route.walkDurationMinutes} min · elevação no
          botão Elevação (só “Caminhe”)
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

function buildWalkElevationLeg(
  map: MapboxMap | null,
  route: TransitRouteResult | null
): WalkLegAnalysis | null {
  if (!map || !route?.walkCoordinates || route.walkCoordinates.length < 2) {
    return null;
  }
  const durationSeconds = Math.max(60, route.walkDurationMinutes * 60);
  return legFromCoordinates(
    map,
    route.walkCoordinates,
    route.walkDistanceMeters || 0,
    durationSeconds
  );
}

export function RoutePanel({
  apartment,
  analysis,
  map,
  hoverDistance,
  onHoverDistance,
  walkDirection,
  onWalkDirectionChange,
  onElevationLegChange,
}: RoutePanelProps) {
  const [mode, setMode] = useState<"elevation" | "transit">("elevation");
  const [transitIda, setTransitIda] = useState<TransitRouteResult | null>(null);
  const [transitVolta, setTransitVolta] = useState<TransitRouteResult | null>(
    null
  );
  const [transitWarning, setTransitWarning] = useState<string | null>(null);
  const [loadingTransit, setLoadingTransit] = useState(false);
  const [transitError, setTransitError] = useState<string | null>(null);

  useEffect(() => {
    setMode("elevation");
    setTransitIda(null);
    setTransitVolta(null);
    setTransitWarning(null);
    setTransitError(null);
    onWalkDirectionChange("ida");
    onElevationLegChange?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apartment?.id]);

  const walkIdaMin = analysis?.ida.durationMinutes;
  const walkVoltaMin = analysis?.volta.durationMinutes;

  useEffect(() => {
    if (!apartment) return;

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
  }, [apartment, walkIdaMin, walkVoltaMin]);

  const elevIda = useMemo(
    () => buildWalkElevationLeg(map, transitIda),
    [map, transitIda]
  );
  const elevVolta = useMemo(
    () => buildWalkElevationLeg(map, transitVolta),
    [map, transitVolta]
  );

  useEffect(() => {
    if (mode !== "elevation") {
      onElevationLegChange?.(null);
      return;
    }
    const leg = walkDirection === "ida" ? elevIda : elevVolta;
    onElevationLegChange?.(leg);
  }, [mode, walkDirection, elevIda, elevVolta, onElevationLegChange]);

  if (!apartment) {
    return (
      <div className="flex h-full items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100/80 px-6 text-center">
        <p className="max-w-sm text-sm text-slate-500">
          Selecione um imóvel para ver elevação (só trechos Caminhe do Google) e
          transporte público — ida e volta.
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
            onClick={() => setMode("elevation")}
            className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold transition ${
              mode === "elevation"
                ? "bg-teal-700 text-white"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Mountain className="h-3.5 w-3.5" aria-hidden />
            Elevação
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
          {mode === "elevation" ? (
            <>
              {" "}
              · mapa: <span className="font-semibold">{walkDirection}</span>
            </>
          ) : null}
        </p>
      </div>

      {mode === "elevation" ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loadingTransit && !elevIda && !elevVolta ? (
            <div className="flex h-[160px] items-center justify-center gap-2 px-6 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Calculando trechos Caminhe (Google) para elevação…
            </div>
          ) : null}

          {transitError && (
            <p className="m-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {transitError}
            </p>
          )}

          {transitWarning && (
            <p className="mx-3 mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {transitWarning}
            </p>
          )}

          <p className="border-b border-slate-100 px-4 py-2 text-[11px] text-slate-500">
            Elevação só dos trechos <strong>Caminhe</strong> do Google Maps
            (TRANSIT) — metrô/ônibus e o a pé porta-a-porta total ficam de fora.
          </p>

          {(elevIda || elevVolta) && (
            <div className="grid grid-cols-1 gap-2 border-b border-slate-100 px-4 py-2 sm:grid-cols-2">
              {elevIda ? (
                <WalkLegSummary
                  leg={elevIda}
                  label="Ida — só Caminhe"
                />
              ) : (
                <p className="text-xs text-slate-400">Ida: sem trecho a pé</p>
              )}
              {elevVolta ? (
                <WalkLegSummary
                  leg={elevVolta}
                  label="Volta — só Caminhe"
                />
              ) : (
                <p className="text-xs text-slate-400">Volta: sem trecho a pé</p>
              )}
            </div>
          )}

          <div
            className="border-b border-slate-100"
            onMouseEnter={() => onWalkDirectionChange("ida")}
          >
            <ElevationChart
              leg={elevIda}
              hoverDistance={walkDirection === "ida" ? hoverDistance : null}
              onHoverDistance={(d) => {
                onWalkDirectionChange("ida");
                onHoverDistance(d);
              }}
              title="Elevação — Ida (Caminhe)"
              emptyMessage={
                map
                  ? "Sem trechos Caminhe na ida (ou mapa ainda carregando o terreno)."
                  : "Aguarde o mapa carregar para calcular a elevação."
              }
            />
          </div>

          <div onMouseEnter={() => onWalkDirectionChange("volta")}>
            <ElevationChart
              leg={elevVolta}
              hoverDistance={
                walkDirection === "volta" ? hoverDistance : null
              }
              onHoverDistance={(d) => {
                onWalkDirectionChange("volta");
                onHoverDistance(d);
              }}
              title="Elevação — Volta (Caminhe)"
              emptyMessage={
                map
                  ? "Sem trechos Caminhe na volta (ou mapa ainda carregando o terreno)."
                  : "Aguarde o mapa carregar para calcular a elevação."
              }
            />
          </div>
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
