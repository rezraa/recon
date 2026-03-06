# ── Base stage: Node.js + pnpm ──────────────────────────────────────────────
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# ── Dependencies stage: install node_modules ────────────────────────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ── Build stage: Next.js standalone + worker compile ────────────────────────
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build
RUN pnpm worker:build

# ── Production stage: minimal runtime image ─────────────────────────────────
FROM base AS production
ENV NODE_ENV=production

# Next.js standalone output
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

# Worker compiled output
COPY --from=build /app/dist ./dist

# Drizzle migrations (needed by worker startup)
COPY --from=build /app/src/lib/db/migrations ./src/lib/db/migrations
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts

# drizzle-kit CLI needed for migrations at runtime
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json

EXPOSE 3000

# Default entrypoint is the Next.js app; overridden in docker-compose for worker
CMD ["node", "server.js"]
