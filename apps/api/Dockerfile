# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates tini \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@11.24.0 --activate
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install --frozen-lockfile --filter "@fixotec/api..." --filter "."
RUN pnpm --filter @fixotec/db generate \
  && pnpm --filter @fixotec/db build \
  && pnpm --filter @fixotec/api build

# Full toolchain (Prisma CLI, tsx) for `prisma migrate deploy` and data imports; never serves traffic.
FROM build AS migrate
ENV NODE_ENV=production
WORKDIR /app/packages/db
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]

FROM build AS prune
RUN pnpm --filter @fixotec/api deploy --legacy --prod /prod/api \
  && src="$(ls -d node_modules/.pnpm/@prisma+client@*/node_modules/.prisma | head -n 1)" \
  && for dst in /prod/api/node_modules/.pnpm/@prisma+client@*/node_modules; do cp -R "$src" "$dst/"; done \
  && rm -rf /prod/api/src /prod/api/test

FROM node:22-bookworm-slim AS runtime
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates tini \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    API_PORT=4000 \
    STORAGE_ROOT=/app/storage
WORKDIR /app/apps/api
COPY --from=prune --chown=node:node /prod/api ./
RUN mkdir -p /app/storage && chown node:node /app/storage
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||4000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main.js"]
