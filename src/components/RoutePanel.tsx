"use client";

import { useEffect, useState } from "react";
import { Bus, Loader2 } from "lucide-react";
import type { TransitRouteResult } from "@/lib/transit";
import type { Apartment, TripDirection } from "@/lib/types";

interface RoutePanelProps {
  apartment: Apartment | null;
  /** Opção Google ativa (ida/volta) — mapa desenha o trajeto multimodal. */
  onGoogleRouteForMap?: (route: TransitRouteResult | null) => void;
}

function TransitLegBlock({
  label,
  routes,
  selectedIndex,
  onSelect,
}: {
  label: string;
  routes: TransitRouteResult[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  const route = routes[selectedIndex] ?? routes[0];
  if (!route) return null;

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

      {routes.length > 1 ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
            Opções do Google Maps
          </p>
          {routes.map((opt, idx) => {
            const active = idx === selectedIndex;
            return (
              <button
                key={`${label}-opt-${idx}-${opt.optionLabel}`}
                type="button"
                onClick={() => onSelect(idx)}
                className={`rounded-md border px-3 py-2 text-left text-sm transition ${
                  active
                    ? "border-blue-600 bg-blue-50 text-blue-950"
                    : "border-slate-200 bg-slate-50/60 text-slate-700 hover:border-slate-300"
                }`}
              >
                <span className="font-medium">
                  {opt.optionLabel || `Opção ${idx + 1}`}
                </span>
                {opt.source === "google" ? (
                  <span className="mt-0.5 block text-[11px] text-slate-500">
                    Google Routes
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

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
  onGoogleRouteForMap,
}: RoutePanelProps) {
  const [idaRoutes, setIdaRoutes] = useState<TransitRouteResult[]>([]);
  const [voltaRoutes, setVoltaRoutes] = useState<TransitRouteResult[]>([]);
  const [idaOption, setIdaOption] = useState(0);
  const [voltaOption, setVoltaOption] = useState(0);
  const [activeDirection, setActiveDirection] =
    useState<TripDirection>("ida");
  const [transitWarning, setTransitWarning] = useState<string | null>(null);
  const [loadingTransit, setLoadingTransit] = useState(false);
  const [transitError, setTransitError] = useState<string | null>(null);

  const transitIda = idaRoutes[idaOption] ?? idaRoutes[0] ?? null;
  const transitVolta = voltaRoutes[voltaOption] ?? voltaRoutes[0] ?? null;

  useEffect(() => {
    setIdaRoutes([]);
    setVoltaRoutes([]);
    setIdaOption(0);
    setVoltaOption(0);
    setActiveDirection("ida");
    setTransitWarning(null);
    setTransitError(null);
    onGoogleRouteForMap?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apartment?.id]);

  useEffect(() => {
    const route = activeDirection === "ida" ? transitIda : transitVolta;
    onGoogleRouteForMap?.(route);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDirection, transitIda, transitVolta]);

  useEffect(() => {
    if (!apartment) return;

    let cancelled = false;
    setLoadingTransit(true);
    setTransitError(null);

    void (async () => {
      try {
        const fetchDir = async (direction: TripDirection) => {
          const res = await fetch("/api/transit-route", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              lat: apartment.lat,
              lng: apartment.lng,
              direction,
            }),
          });
          const data = (await res.json()) as {
            ok: boolean;
            routes?: TransitRouteResult[];
            route?: TransitRouteResult;
            warning?: string;
            error?: string;
          };
          if (!data.ok) {
            throw new Error(
              data.error || "Não foi possível calcular o trajeto."
            );
          }
          const list =
            data.routes && data.routes.length > 0
              ? data.routes
              : data.route
                ? [data.route]
                : [];
          if (!list.length) {
            throw new Error("Google não retornou opções de trajeto.");
          }
          return { routes: list, warning: data.warning };
        };

        const [idaRes, voltaRes] = await Promise.all([
          fetchDir("ida"),
          fetchDir("volta"),
        ]);

        if (cancelled) return;
        setIdaRoutes(idaRes.routes);
        setVoltaRoutes(voltaRes.routes);
        setIdaOption(0);
        setVoltaOption(0);
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
  }, [apartment]);

  if (!apartment) {
    return (
      <div className="flex h-full items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100/80 px-6 text-center">
        <p className="max-w-sm text-sm text-slate-500">
          Selecione um imóvel para ver transporte público (Google Maps) — ida e
          volta.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-white to-slate-50">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2">
        <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-800">
          <Bus className="h-3.5 w-3.5" aria-hidden />
          Transporte Público
        </div>
        <p className="text-[10px] text-slate-400">
          Opções do Google Routes · traçado no mapa
        </p>
      </div>

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
          {idaRoutes.length > 0 && (
            <TransitLegBlock
              label="Ida (imóvel → faculdade)"
              routes={idaRoutes}
              selectedIndex={idaOption}
              onSelect={(idx) => {
                setIdaOption(idx);
                setActiveDirection("ida");
              }}
            />
          )}
          {voltaRoutes.length > 0 && (
            <TransitLegBlock
              label="Volta (faculdade → imóvel)"
              routes={voltaRoutes}
              selectedIndex={voltaOption}
              onSelect={(idx) => {
                setVoltaOption(idx);
                setActiveDirection("volta");
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
