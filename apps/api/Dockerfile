FROM node:22-alpine

WORKDIR /workspace

RUN corepack enable

# Install workspace dependencies (dev) first for better caching
COPY package.json pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN pnpm install --no-frozen-lockfile

# Copy sources
COPY apps/api apps/api
COPY apps/worker apps/worker
COPY packages/shared packages/shared

EXPOSE 3000

CMD ["pnpm", "-C", "apps/api", "start:dev"]


