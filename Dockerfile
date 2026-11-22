# syntax=docker/dockerfile:1
# Imóveis Radar — Next.js 14 standalone (mesmo padrão isolado da VPS Liganer).
# PROIBIDO: redes/volumes chatwoot_*.
# BuildKit cache: npm + .next/cache → rebuilds de src bem mais rápidos.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* é embutido no build do cliente
ARG NEXT_PUBLIC_MAPBOX_TOKEN=
ENV NEXT_PUBLIC_MAPBOX_TOKEN=$NEXT_PUBLIC_MAPBOX_TOKEN
ENV NEXT_TELEMETRY_DISABLED=1

# Reaproveita cache incremental do Next entre deploys (não muda o artefato final).
RUN --mount=type=cache,target=/app/.next/cache \
    npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs \
  && apk add --no-cache su-exec

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Seed (volume /app/data pode nascer vazio — entrypoint copia se faltar)
COPY --from=builder --chown=nextjs:nodejs /app/data ./data-seed
COPY --from=builder --chmod=755 /app/scripts/sync-seed-urls.mjs /app/scripts/sync-seed-urls.mjs
COPY --chmod=755 scripts/docker-entrypoint.sh /app/docker-entrypoint.sh

ENV APARTMENTS_DATA_PATH=/app/data/apartments.json
ENV APARTMENTS_SEED_DIR=/app/data-seed

# Entrypoint roda como root só para seed/chown do volume; depois su-exec nextjs
USER root
EXPOSE 3000

HEALTHCHECK --interval=20s --timeout=5s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/ || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "server.js"]
