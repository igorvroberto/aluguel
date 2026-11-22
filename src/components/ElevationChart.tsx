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
import type { ElevationPoint, WalkLegAnalysis } from "@/lib/types";

interface ElevationChartProps {
  /** Trecho a pé (ida ou volta) — escala Y só deste perfil. */
  leg: WalkLegAnalysis | null;
  hoverDistance: number | null;
  onHoverDistance: (distance: number | null) => void;
  emptyMessage?: string;
  title?: string;
  /** Altura do canvas do gráfico (px). Não afeta a escala de elevação. */
  chartHeight?: number;
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

function profileStats(data: ElevationPoint[]) {
  if (data.length === 0) {
    return { min: 0, max: 0, start: 0, end: 0, net: 0, loss: 0 };
  }
  let min = data[0].elevation;
  let max = data[0].elevation;
  let loss = 0;
  for (let i = 0; i < data.length; i++) {
    const e = data[i].elevation;
    if (e < min) min = e;
    if (e > max) max = e;
    if (i > 0) {
      const delta = e - data[i - 1].elevation;
      if (delta < 0) loss += -delta;
    }
  }
  const start = data[0].elevation;
  const end = data[data.length - 1].elevation;
  return { min, max, start, end, net: end - start, loss };
}

function formatNet(net: number): string {
  const rounded = Math.round(net);
  if (rounded > 0) return `líquido +${rounded} m`;
  if (rounded < 0) return `líquido ${rounded} m`;
  return "líquido 0 m";
}

export function ElevationChart({
  leg,
  hoverDistance,
  onHoverDistance,
  emptyMessage,
  title = "Perfil a pé",
  chartHeight = 200,
}: ElevationChartProps) {
  if (!leg || leg.elevationProfile.length === 0) {
    return (
      <div
        className="flex items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100/80 px-6 text-center"
        style={{ minHeight: chartHeight }}
      >
        <p className="max-w-sm text-sm text-slate-500">
          {emptyMessage ||
            "Selecione um imóvel para ver o perfil de elevação do trajeto a pé."}
        </p>
      </div>
    );
  }

  const data = leg.elevationProfile;
  const stats = profileStats(data);
  // Escala Y exclusiva deste trecho (ida ≠ volta).
  const pad = Math.max(5, (stats.max - stats.min) * 0.08);
  const yDomain: [number, number] = [stats.min - pad, stats.max + pad];

  const hoverPoint =
    hoverDistance == null
      ? null
      : data.reduce((best, cur) =>
          Math.abs(cur.distance - hoverDistance) <
          Math.abs(best.distance - hoverDistance)
            ? cur
            : best
        );

  const gradientId = `elevFill-${title.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <div className="flex flex-col bg-gradient-to-b from-white to-slate-50">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          <p className="text-[11px] text-slate-500">
            Subida +{Math.round(leg.elevationGain)} m
            {stats.loss > 0.5 ? ` · descida −${Math.round(stats.loss)} m` : ""}
            {" · "}
            {formatNet(stats.net)} · máx. {Math.abs(leg.maxGrade).toFixed(1)}% ·{" "}
            {leg.topography}
          </p>
          <p className="text-[10px] text-slate-400">
            Escala {Math.round(stats.min)}–{Math.round(stats.max)} m (só este
            trajeto a pé)
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

      <div className="px-2 pb-2 pt-1" style={{ height: chartHeight }}>
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
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
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
              domain={yDomain}
              allowDataOverflow
            />
            <Tooltip content={<ChartTooltip />} />
            <Area
              type="monotone"
              dataKey="elevation"
              stroke="#0f766e"
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              isAnimationActive={false}
              activeDot={{
                r: 5,
                fill: "#f0b429",
                stroke: "#0f172a",
                strokeWidth: 1,
              }}
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
