# ─────────────────────────────────────────────────────────────────────────────
#  Piyasa & Maliyet Göstergeleri — tek imaj: API + arayüz aynı porttan
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS build

# better-sqlite3 hazır ikili bulamazsa kaynaktan derlenebilsin
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci || npm install
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /data && chown -R node:node /data

WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/dist ./dist

USER node
EXPOSE 8080

# Kalıcı veri (SQLite) /data altında tutulur:
#   docker run -v piyasa-data:/data -p 8080:8080 piyasa-monitor
HEALTHCHECK --interval=60s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server/index.js"]
