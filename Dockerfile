ARG NODE_IMAGE=node:24-bookworm-slim

FROM ${NODE_IMAGE} AS dependencies
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

FROM ${NODE_IMAGE} AS builder
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build \
  && test -f .next/standalone/server.js

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app

ARG APP_REVISION=unknown

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    APP_REVISION=${APP_REVISION}

LABEL org.opencontainers.image.source="https://github.com/rhhyun/wiregene-meta-analysis" \
      org.opencontainers.image.revision="${APP_REVISION}"

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

RUN mkdir -p /app/.data/meta /app/download /app/.logs/meta

EXPOSE 3000
STOPSIGNAL SIGTERM

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then((response) => process.exit(response.status === 200 ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["node", "server.js"]
