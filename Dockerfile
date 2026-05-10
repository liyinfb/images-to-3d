# Stage 1: Install dependencies
FROM node:22-slim AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate
COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/
RUN pnpm install --frozen-lockfile

# Stage 2: Build the application
FROM node:22-slim AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# VITE_ env vars are inlined at build time by Vite.
# Set LOCAL_AUTH=true so the frontend uses /login instead of OAuth.
# Clear OAuth vars so they don't get baked into the bundle.
ARG VITE_LOCAL_AUTH=true
ARG VITE_OAUTH_PORTAL_URL=
ARG VITE_APP_ID=
ENV VITE_LOCAL_AUTH=${VITE_LOCAL_AUTH}
ENV VITE_OAUTH_PORTAL_URL=${VITE_OAUTH_PORTAL_URL}
ENV VITE_APP_ID=${VITE_APP_ID}

RUN pnpm build

# Stage 3: Production image
FROM node:22-slim AS runner
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

# Install production dependencies (drizzle-kit needed for migrations)
COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/
RUN pnpm install --frozen-lockfile

# Copy built assets (vite outputs to dist/public, esbuild outputs to dist/index.js)
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts

# Copy entrypoint script
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
