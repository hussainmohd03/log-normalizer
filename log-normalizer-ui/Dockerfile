# syntax=docker/dockerfile:1.7
#
# Frontend: Vite build → static assets → served by nginx.
#
# Two stages:
#   Stage 1 (builder): node:22, npm ci, vite build → /app/dist
#   Stage 2 (runtime): nginx:alpine, copy /app/dist into html root
#
# The dev compose override replaces the runtime stage entirely with
# `node:22 npm run dev` so devs get hot reload. This Dockerfile is the
# production path only.

# ─── Stage 1: builder ───────────────────────────────────────────────────
FROM node:22-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig*.json vite.config.* index.html ./
COPY public ./public
COPY src ./src

# VITE_API_URL must be inlined at build time — vite replaces
# import.meta.env.VITE_* references in the bundle. The compose file
# passes it as a build arg.
ARG VITE_API_URL=http://localhost:3000/api
ENV VITE_API_URL=${VITE_API_URL}

RUN npm run build


# ─── Stage 2: runtime ───────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

# Replace the default config with our SPA-friendly one (history fallback
# so client-side routes don't 404 on hard refresh).
COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

# nginx:alpine has a default CMD; override only if you need to.
