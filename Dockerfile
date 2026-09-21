FROM node:22-bookworm-slim AS build

WORKDIR /app

RUN apt-get update \
  && apt-get install --yes --no-install-recommends build-essential python3 \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY scripts/prepare-background-model.mjs ./scripts/prepare-background-model.mjs
COPY server ./server
COPY shared ./shared
# The application only creates CPU inference sessions, so the CUDA and TensorRT execution providers
# onnxruntime-node would fetch on linux/x64 are skipped: they add over a gigabyte to the image.
RUN ONNXRUNTIME_NODE_INSTALL=skip npm ci --no-audit --no-fund

COPY index.html vite.config.js ./
COPY client ./client
RUN npm run build \
  && npm prune --omit=dev --no-audit --no-fund

FROM node:22-bookworm-slim AS runtime

ARG RELEASE_VERSION
ARG VCS_REF
ARG SOURCE_URL=https://github.com/bloschinsky/inventory-atlas-lite

LABEL org.opencontainers.image.source=$SOURCE_URL \
  org.opencontainers.image.version=$RELEASE_VERSION \
  org.opencontainers.image.revision=$VCS_REF

ENV NODE_ENV=production \
  PORT=3000 \
  DATA_DIR=/data

WORKDIR /app

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
COPY LICENSES ./LICENSES

RUN mkdir -p /data && chown node:node /data

USER node
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/api/health').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"

CMD ["node", "server/src/index.js", "--production"]
