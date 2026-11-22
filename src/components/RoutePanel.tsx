"use client";

import { useEffect, useMemo, useState } from "react";
import type { Map as MapboxMap } from "mapbox-gl";
import { Bus, Loader2, Mountain } from "lucide-react";
import { ElevationChart } from "@/components/ElevationChart";
import { legFromCoordinates } from "@/lib/elevation";
import type { TransitRouteResult, WalkPathSegment } from "@/lib/transit";
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
  /** Geometria do trecho Caminhe em foco — para desenhar no mapa. */
  onElevationLegChange?: (leg: WalkLegAnalysis | null) => void;
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
          botão Elevação (um gráfico por trecho Caminhe)
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

function segmentToLeg(
  map: MapboxMap,
  segment: WalkPathSegment
): WalkLegAnalysis {
  return legFromCoordinates(
    map,
    segment.coordinates,
    segment.distanceMeters,
    Math.max(60, segment.durationMinutes * 60)
  );
}

function WalkSegmentCharts({
  directionLabel,
  direction,
  route,
  map,
  activeDirection,
  hoverDistance,
  onHoverDistance,
  onWalkDirectionChange,
  onFocusLeg,
}: {
  directionLabel: string;
  direction: TripDirection;
  route: TransitRouteResult | null;
  map: MapboxMap | null;
  activeDirection: TripDirection;
  hoverDistance: number | null;
  onHoverDistance: (distance: number | null) => void;
  onWalkDirectionChange: (dir: TripDirection) => void;
  onFocusLeg: (leg: WalkLegAnalysis | null) => void;
}) {
  const legs = useMemo(() => {
    const segments = route?.walkSegments ?? [];
    if (!map || segments.length === 0) return [];
    return segments.map((seg) => ({
      segment: seg,
      leg: segmentToLeg(map, seg),
    }));
  }, [map, route?.walkSegments]);

  if (!route) {
    return (
      <p className="px-4 py-3 text-xs text-slate-400">
        {directionLabel}: aguardando trajeto…
      </p>
    );
  }

  if (!map) {
    return (
      <p className="px-4 py-3 text-xs text-slate-400">
        {directionLabel}: aguarde o mapa carregar o terreno…
      </p>
    );
  }

  if (legs.length === 0) {
    return (
      <p className="px-4 py-3 text-xs text-slate-400">
        {directionLabel}: sem trechos Caminhe neste trajeto.
      </p>
    );
  }

  return (
    <div className="border-b border-slate-100">
      <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
          {directionLabel}
        </p>
        <p className="text-[10px] text-slate-400">
          {legs.length} trecho{legs.length === 1 ? "" : "s"} Caminhe · um
          gráfico por caminhada
        </p>
      </div>

      {legs.map(({ segment, leg }, idx) => (
        <div
          key={`${direction}-${idx}-${segment.label}`}
          className="border-b border-slate-100 last:border-b-0"
          onMouseEnter={() => {
            onWalkDirectionChange(direction);
            onFocusLeg(leg);
          }}
        >
          <ElevationChart
            leg={leg}
            hoverDistance={
              activeDirection === direction ? hoverDistance : null
            }
            onHoverDistance={(d) => {
              onWalkDirectionChange(direction);
              onFocusLeg(leg);
              onHoverDistance(d);
            }}
            title={`${directionLabel} · Caminhe ${idx + 1}/${legs.length}`}
            chartHeight={180}
            emptyMessage="Perfil indisponível para este trecho."
          />
          <p className="px-4 pb-2 text-[11px] text-slate-500">
            {segment.label}
            {" · "}
            {Math.round(segment.distanceMeters)} m · {segment.durationMinutes}{" "}
            min · subida +{Math.round(leg.elevationGain)} m · {leg.topography}
          </p>
        </div>
      ))}
    </div>
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

  // Foco inicial no primeiro trecho Caminhe da ida
  useEffect(() => {
    if (mode !== "elevation" || !map) {
      if (mode !== "elevation") onElevationLegChange?.(null);
      return;
    }
    const segs =
      walkDirection === "ida"
        ? transitIda?.walkSegments
        : transitVolta?.walkSegments;
    if (segs?.[0]) {
      onElevationLegChange?.(segmentToLeg(map, segs[0]));
    } else {
      onElevationLegChange?.(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, map, walkDirection, transitIda, transitVolta]);

  if (!apartment) {
    return (
      <div className="flex h-full items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100/80 px-6 text-center">
        <p className="max-w-sm text-sm text-slate-500">
          Selecione um imóvel para ver elevação (um gráfico por trecho Caminhe)
          e transporte público — ida e volta.
        </p>
      </div>
    );
  }

  const hasWalkSegs =
    (transitIda?.walkSegments?.length ?? 0) > 0 ||
    (transitVolta?.walkSegments?.length ?? 0) > 0;

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
          Ida e volta · um gráfico por Caminhe
        </p>
      </div>

      {mode === "elevation" ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loadingTransit && !hasWalkSegs ? (
            <div className="flex h-[160px] items-center justify-center gap-2 px-6 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Calculando trechos Caminhe para elevação…
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
            Cada gráfico é <strong>só um trecho Caminhe</strong> (até a
            estação, da estação ao destino, etc.). Metrô/ônibus e o a pé
            porta-a-porta total ficam de fora.
          </p>

          <WalkSegmentCharts
            directionLabel="Ida"
            direction="ida"
            route={transitIda}
            map={map}
            activeDirection={walkDirection}
            hoverDistance={hoverDistance}
            onHoverDistance={onHoverDistance}
            onWalkDirectionChange={onWalkDirectionChange}
            onFocusLeg={(leg) => onElevationLegChange?.(leg)}
          />

          <WalkSegmentCharts
            directionLabel="Volta"
            direction="volta"
            route={transitVolta}
            map={map}
            activeDirection={walkDirection}
            hoverDistance={hoverDistance}
            onHoverDistance={onHoverDistance}
            onWalkDirectionChange={onWalkDirectionChange}
            onFocusLeg={(leg) => onElevationLegChange?.(leg)}
          />
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
