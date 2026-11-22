# Perdizes Radar

Aplicação web em **Next.js 14** (App Router, TypeScript, Tailwind CSS) para analisar apartamentos candidatos próximos ao destino fixo:

**R. Dr. Emílio Ribas, 89 — Perdizes, São Paulo — SP** (`-23.53231`, `-46.66692`).

## Funcionalidades

- Layout split-screen: lista/filtros (420px) + mapa Mapbox 3D (70%) + painel de trajeto (30%)
- Pacote mensal (`aluguel + condomínio + IPTU`), quartos, topografia e portaria 24h
- Rotas a pé via Mapbox Directions, reamostragem a cada 25 m (`@turf/turf`) e altimetria via `queryTerrainElevation`
- Comparador multimodal: **A Pé** vs **Transporte Público** (`/api/transit-route`, Google Routes ou heurística local)
- Importação por URL de anúncio (`/api/scrape-listing`) com fallback “colar texto”
- Segmentos coloridos por inclinação e classificação Plano / Moderada / Íngreme
- Camada de transporte público (estações e corredores de ônibus)
- Persistência em `localStorage` a partir de `data/apartments.json`
- Exportação CSV / JSON no header (com métricas de distância e elevação)
- Modal de cadastro com geocodificação Mapbox restrita a São Paulo

## Setup

```bash
npm install
cp .env.local.example .env.local
# Edite .env.local:
#   NEXT_PUBLIC_MAPBOX_TOKEN=...
#   GOOGLE_MAPS_API_KEY=...   # opcional (TRANSIT)
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

Sem o token Mapbox, a interface continua funcional e a área do mapa exibe um aviso claro. Sem `GOOGLE_MAPS_API_KEY`, o modo transporte usa estimativa local até a estação/corredor mais próximo.

## Scripts

- `npm run dev` — desenvolvimento
- `npm run build` — build de produção
- `npm run start` — servidor de produção
- `npm run lint` — ESLint

## Deploy VPS (Liganer — mesma máquina do `/opt/imoveis`)

Stack isolada: **sem** redes/volumes `chatwoot_*`.

| Item | Valor |
| --- | --- |
| Raiz | `/opt/radar-imoveis` |
| Porta host | `127.0.0.1:18090` |
| Traefik | `/opt/traefik/dynamic/radar-imoveis.yml` |
| Domínio | `https://radar.liganer.com.br` |

### Fluxo normal (depois do runner)
**Só faça merge no `main`.** O GitHub Actions na VPS roda `tools/deploy.sh` sozinho.

### Setup único do deploy automático (uma vez na VPS)

1. App já clonado em `/opt/radar-imoveis` com `.env` e primeiro `deploy.sh` ok.
2. No GitHub: **aluguel → Settings → Actions → Runners → New self-hosted runner** → copie o **token** de registro.
3. Na VPS:

```bash
cd /opt/radar-imoveis
sudo git pull origin main
sudo bash tools/setup-github-runner.sh SEU_TOKEN_AQUI
```

4. Teste: **Actions → Deploy VPS → Run workflow**.

### Primeira subida manual (se ainda não existe a pasta)

```bash
sudo mkdir -p /opt/radar-imoveis
sudo git clone https://github.com/igorvroberto/aluguel.git /opt/radar-imoveis
cd /opt/radar-imoveis
sudo cp .env.example .env
sudo nano .env   # NEXT_PUBLIC_MAPBOX_TOKEN (+ GOOGLE_MAPS_API_KEY opcional)
sudo bash tools/deploy.sh
```

Health local: `curl -fsS http://127.0.0.1:18090/`
