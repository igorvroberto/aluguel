# Perdizes Radar

Aplicação web em **Next.js 14** (App Router, TypeScript, Tailwind CSS) para analisar apartamentos candidatos próximos ao destino fixo:

**R. Dr. Emílio Ribas, 89 — Perdizes, São Paulo — SP** (`-23.53231`, `-46.66692`).

## Funcionalidades

- Layout split-screen: lista/filtros (420px) + mapa Mapbox 3D (70%) + gráfico de elevação Recharts (30%)
- Pacote mensal (`aluguel + condomínio + IPTU`), quartos, topografia e portaria 24h
- Rotas a pé via Mapbox Directions, reamostragem a cada 25 m (`@turf/turf`) e altimetria via `queryTerrainElevation`
- Segmentos coloridos por inclinação e classificação Plano / Moderada / Íngreme
- Camada de transporte público (estações e corredores de ônibus)
- Persistência em `localStorage` a partir de `data/apartments.json`
- Modal de cadastro com geocodificação Mapbox restrita a São Paulo

## Setup

```bash
npm install
cp .env.local.example .env.local
# Edite .env.local e defina NEXT_PUBLIC_MAPBOX_TOKEN
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

Sem o token, a interface continua funcional e a área do mapa exibe um aviso claro.

## Scripts

- `npm run dev` — desenvolvimento
- `npm run build` — build de produção
- `npm run start` — servidor de produção
- `npm run lint` — ESLint
