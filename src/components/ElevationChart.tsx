"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ElevationPoint, RouteAnalysis } from "@/lib/types";

interface ElevationChartProps {
  analysis: RouteAnalysis | null;
  hoverDistance: number | null;
  onHoverDistance: (distance: number | null) => void;
  emptyMessage?: string;
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ElevationPoint }>;
}) {
  if (!active || !payload?.[0]) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-slate-800">
        {Math.round(p.elevation)} m
      </p>
      <p className="text-slate-500">
        {p.distance < 1000
          ? `${Math.round(p.distance)} m`
          : `${(p.distance / 1000).toFixed(2)} km`}
      </p>
      <p className="text-slate-500">Inclinação: {p.grade.toFixed(1)}%</p>
    </div>
  );
}

export function ElevationChart({
  analysis,
  hoverDistance,
  onHoverDistance,
  emptyMessage,
}: ElevationChartProps) {
  if (!analysis) {
    return (
      <div className="flex h-full items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100/80 px-6 text-center">
        <p className="max-w-sm text-sm text-slate-500">
          {emptyMessage ||
            "Selecione um imóvel para ver o perfil de elevação do trajeto a pé até a R. Dr. Emílio Ribas, 89."}
        </p>
      </div>
    );
  }

  const data = analysis.elevationProfile;
  const hoverPoint =
    hoverDistance == null
      ? null
      : data.reduce((best, cur) =>
          Math.abs(cur.distance - hoverDistance) <
          Math.abs(best.distance - hoverDistance)
            ? cur
            : best
        );

  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-white to-slate-50">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">
            Perfil de Elevação
          </h3>
          <p className="text-[11px] text-slate-500">
            Subida acumulada +{Math.round(analysis.elevationGain)} m · máx.{" "}
            {Math.abs(analysis.maxGrade).toFixed(1)}% · {analysis.topography}
          </p>
        </div>
        <div className="hidden items-center gap-3 text-[10px] text-slate-500 sm:flex">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> &lt;4%
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-amber-500" /> 4–7%
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-rose-500" /> &gt;7%
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 px-2 pb-2 pt-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
            onMouseMove={(state) => {
              const payload = (
                state as {
                  activePayload?: Array<{ payload?: ElevationPoint }>;
                }
              )?.activePayload?.[0]?.payload;
              if (payload && typeof payload.distance === "number") {
                onHoverDistance(payload.distance);
              }
            }}
            onMouseLeave={() => onHoverDistance(null)}
          >
            <defs>
              <linearGradient id="elevFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0f766e" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#0f766e" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="distance"
              tickFormatter={(v: number) =>
                v >= 1000 ? `${(v / 1000).toFixed(1)}km` : `${Math.round(v)}m`
              }
              tick={{ fontSize: 10, fill: "#64748b" }}
              axisLine={{ stroke: "#cbd5e1" }}
              tickLine={false}
            />
            <YAxis
              dataKey="elevation"
              width={40}
              tick={{ fontSize: 10, fill: "#64748b" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `${Math.round(v)}`}
              domain={["dataMin - 5", "dataMax + 5"]}
            />
            <Tooltip content={<ChartTooltip />} />
            <Area
              type="monotone"
              dataKey="elevation"
              stroke="#0f766e"
              strokeWidth={2}
              fill="url(#elevFill)"
              isAnimationActive={false}
              activeDot={{ r: 5, fill: "#f0b429", stroke: "#0f172a", strokeWidth: 1 }}
            />
            {hoverPoint && (
              <ReferenceDot
                x={hoverPoint.distance}
                y={hoverPoint.elevation}
                r={5}
                fill="#f0b429"
                stroke="#0f172a"
                strokeWidth={1.5}
                ifOverflow="extendDomain"
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
