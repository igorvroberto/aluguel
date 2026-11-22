import dynamic from "next/dynamic";

const RadarApp = dynamic(
  () => import("@/components/RadarApp").then((m) => m.RadarApp),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-screen items-center justify-center bg-[#eef3f4] text-slate-600">
        <p className="font-display text-lg">Carregando Perdizes Radar…</p>
      </div>
    ),
  }
);

export default function Home() {
  return <RadarApp />;
}
