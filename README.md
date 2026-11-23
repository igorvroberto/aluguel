# Imóveis Radar

Aplicação web em **Next.js 14** (App Router, TypeScript, Tailwind CSS) para analisar apartamentos candidatos próximos ao destino fixo:

**R. Dr. Emílio Ribas, 89 — Perdizes, São Paulo — SP** (`-23.53593`, `-46.66527`).

## Funcionalidades

- Layout split-screen: lista/filtros + mapa Google Maps + painel de transporte público
- Pacote mensal (`aluguel + condomínio + IPTU`), quartos e portaria 24h
- **Transporte Público** via Google Routes TRANSIT (alternativas ônibus/metrô) — traçado no mapa conforme a opção
- Mapa com Linha 3-Vermelha e Linha 6-Laranja; filtro por estação (sem linhas/corredores de ônibus no mapa)
- Importação por URL de anúncio (`/api/scrape-listing`) com fallback “colar texto”
- Persistência centralizada em `data/apartments.json` via `/api/apartments` (sem `localStorage`)
- Status (`Candidato` / `Favorito` / `Visita Agendada` / `Descartado`) e comentários no servidor
- Varredura nativa `/api/scrape-stations` (cheerio + Playwright opcional) nas estações L3/L6
- Botão **Baixar JSON Atualizado** para sincronizar o arquivo do servidor com o repositório
- Modal de cadastro com geocodificação Mapbox restrita a São Paulo

## Setup

```bash
npm install
cp .env.local.example .env.local
# Edite .env.local:
#   GOOGLE_MAPS_API_KEY=...              # mapa + Routes TRANSIT (mesma chave)
#   NEXT_PUBLIC_MAPBOX_TOKEN=...         # opcional: geocode scrape/cadastro
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

O mapa usa **Maps JavaScript API** (chave via `GOOGLE_MAPS_API_KEY` em runtime ou `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`). Sem a key, a UI mostra aviso. Se aparecer “Ops! Algo deu errado”, ative Maps JavaScript API + faturamento e libere o domínio nas restrições HTTP referrer. **Transporte público** usa a mesma `GOOGLE_MAPS_API_KEY` (Routes TRANSIT). Trechos a pé mostram **subida/descida e íngreme** via **Elevation API**.

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
sudo nano .env   # GOOGLE_MAPS_API_KEY (Maps JavaScript + Routes)
sudo bash tools/deploy.sh
```

Health local: `curl -fsS http://127.0.0.1:18090/`
