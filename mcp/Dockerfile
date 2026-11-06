# The optional, read-only MCP adapter (docs/features/mcp-read-only-adapter.md). It is a separate image
# built from this directory alone: it never contains or opens the Atlas databases, and reaches Atlas
# only over its REST API with an inventory:read token.
#   docker build -t inventory-atlas-mcp mcp
FROM node:22-bookworm-slim

ARG RELEASE_VERSION
ARG VCS_REF
ARG SOURCE_URL=https://github.com/bloschinsky/inventory-atlas-lite

LABEL org.opencontainers.image.source=$SOURCE_URL \
  org.opencontainers.image.version=$RELEASE_VERSION \
  org.opencontainers.image.revision=$VCS_REF \
  org.opencontainers.image.description="Inventory Atlas Lite read-only MCP adapter"

# Inside a container the adapter must listen beyond loopback to be reachable on the private Docker
# network; config.js then requires MCP_ALLOWED_HOSTS. No port is published by the image itself.
ENV NODE_ENV=production \
  MCP_HOST=0.0.0.0 \
  MCP_PORT=3100

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY src ./src

USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + process.env.MCP_PORT + '/healthz').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"

CMD ["node", "src/index.js"]
