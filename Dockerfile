# ─────────────────────────────────────────────────────────────────────────────
#  Yanmar Türkiye — Business Partner Portal
#  Tek imaj: API + derlenmiş arayüz aynı porttan servis edilir.
# ─────────────────────────────────────────────────────────────────────────────

# ---------- 1. Derleme aşaması ----------
FROM node:22-bookworm-slim AS build

# better-sqlite3 hazır ikili bulamazsa kaynaktan derlenebilsin
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Önce yalnızca manifest dosyaları: bağımlılık katmanı önbelleğe alınsın
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci

# Kaynaklar ve derleme
COPY . .
RUN npm run build

# Üretim bağımlılıklarını ayrı bir ağaca hazırla
RUN npm prune --omit=dev

# ---------- 2. Çalışma aşaması ----------
FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /data && chown -R node:node /data

WORKDIR /app

# Yalnızca çalışmak için gerekenler
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/server/package.json ./server/package.json
COPY --from=build --chown=node:node /app/server/dist ./server/dist
COPY --from=build --chown=node:node /app/web/dist ./web/dist

USER node
EXPOSE 8080

# Kalıcı disk buraya bağlanır: veritabanı + yüklenen belgeler
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/dist/index.js"]
