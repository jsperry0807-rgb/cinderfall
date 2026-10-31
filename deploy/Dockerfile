# Cinderfall: one image that serves the API and the built SPA.
FROM node:24-slim AS build

RUN npm install -g pnpm@12.16.1
# Never download the in-memory MongoDB binary into the image.
ENV MONGOMS_DISABLE_POSTINSTALL=1

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @cinderfall/web build

FROM node:24-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g pnpm@12.16.1

WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    WEB_DIST=/app/apps/web/dist

COPY --from=build /app /app
RUN chown -R node:node /app \
    && chmod +x /app/apps/api/docker-entrypoint.sh
USER node

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:8787/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/app/apps/api/docker-entrypoint.sh"]
