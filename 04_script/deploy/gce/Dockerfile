# TPS app image: Express API + built web (same origin) on PORT (default 3002).
# Build context = repository root.

FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json ./
COPY 05_data/package.json 05_data/ensure-apps-link.mjs ./05_data/
COPY 04_script/apps/api/package.json ./04_script/apps/api/
COPY 04_script/apps/web/package.json ./04_script/apps/web/

RUN mkdir -p 04_script/apps/api 04_script/apps/web \
  && cd 05_data && node ensure-apps-link.mjs && npm install

COPY 04_script ./04_script
COPY 05_data/ensure-apps-link.mjs ./05_data/

RUN cd 05_data && node ensure-apps-link.mjs \
  && npm run build -w @tps/api \
  && npm run build -w @tps/web \
  && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3002 \
    API_HOST=0.0.0.0 \
    SERVE_WEB=true \
    WEB_ROOT=/app/public

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/package.json ./
COPY --from=build /app/05_data/package.json /app/05_data/ensure-apps-link.mjs ./05_data/
COPY --from=build /app/05_data/node_modules ./05_data/node_modules
COPY --from=build /app/04_script/apps/api/package.json ./04_script/apps/api/
COPY --from=build /app/04_script/apps/api/dist ./04_script/apps/api/dist
COPY --from=build /app/04_script/apps/web/package.json ./04_script/apps/web/
COPY --from=build /app/04_script/apps/web/dist ./public
COPY --from=build /app/04_script/db ./04_script/db
COPY 04_script/deploy/gce/docker-entrypoint.sh /docker-entrypoint.sh

RUN cd 05_data && node ensure-apps-link.mjs \
  && chmod +x /docker-entrypoint.sh

EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3002/api/health || exit 1

WORKDIR /app/04_script/apps/api
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
