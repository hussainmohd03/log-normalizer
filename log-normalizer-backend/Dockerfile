# syntax=docker/dockerfile:1.7
#
# Multi-stage build for the NestJS backend.
#
# The HTTP process and the BullMQ worker share this image — the only
# difference is the CMD passed by docker-compose. We never build two
# images for the same source.
#
# Stage 1 (builder): full devDeps + nest build → produces dist/
# Stage 2 (runtime): production-only deps + dist/ + generated/ + prisma/
#
# Why we keep prisma/ in the runtime image: the dedicated `migrate`
# compose service runs `prisma migrate deploy` from the same image, so
# the migrations directory and prisma CLI need to be present.

# ─── Stage 1: builder ───────────────────────────────────────────────────
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Install full deps (including dev) so we can run nest build.
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source and build artifacts. .dockerignore keeps node_modules,
# dist, and generated out of the build context.
COPY tsconfig*.json nest-cli.json ./
COPY prisma ./prisma
COPY src ./src

# Generate the Prisma client into ./generated and compile TypeScript.
RUN npx prisma generate
RUN npx nest build

# Drop devDeps from node_modules so we can copy a slim version into
# the runtime stage. `npm prune --omit=dev` is faster than re-installing.
RUN npm prune --omit=dev


# ─── Stage 2: runtime ───────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime

# OpenSSL is required by the Prisma engine on debian-slim. Without it
# `prisma migrate deploy` exits with a libssl warning and can fail to
# resolve the engine.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production

# Pull only what's needed at runtime: production node_modules, the
# compiled JS, the generated Prisma client, the prisma schema/migrations
# (for `migrate deploy`), and package.json (for `npm` script lookups).
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/generated ./generated
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json

# Default CMD runs the HTTP process. The worker compose service
# overrides this with `node dist/src/worker`. The migrate service
# overrides it with `npx prisma migrate deploy`.
EXPOSE 3000
CMD ["node", "dist/src/main"]
